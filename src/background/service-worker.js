(function initServiceWorker(root) {
  const namespace = root.MelonTranslate;
  const api = namespace.browserApi;
  const messageTypes = namespace.messages.types;
  const getErrorCategory = namespace.providerBase.getErrorCategory;
  const mp = namespace.modelParams;
  const selectionContextMenuId = "melontranslate-selection";
  const editableContextMenuId = "melontranslate-editable";
  const MODEL_CACHE_TTL_MS = namespace.constants.modelCacheTtlMs;
  const MODEL_TEMPERATURE_DEFAULT = namespace.constants.modelTemperatureDefault;
  const MODEL_TEMPERATURE_MAX = namespace.constants.modelTemperatureMax;
  let initializePromise = null;

  // In-memory translation cache: key → { result, expiresAt }
  const translationCache = new Map();
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  function cacheKey(text, sourceLanguage, targetLanguage, providerSignature, contextStyle, dictionaryModeForSingleWord) {
    const style = namespace.pageUtils.getInputContextStyle(contextStyle);
    const dictionaryMode = dictionaryModeForSingleWord ? "dict" : "plain";
    return `${sourceLanguage || "auto"}\0${targetLanguage}\0${style}\0${dictionaryMode}\0${providerSignature}\0${text}`;
  }

  function getCached(key) {
    const entry = translationCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      translationCache.delete(key);
      return null;
    }
    return entry.results;
  }

  function setCache(key, results) {
    translationCache.set(key, { results, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  function maybeSwitchTargetLanguage(settings, requestedTargetLanguage, text) {
    const primary = requestedTargetLanguage || settings.targetLanguage;
    if (!settings.autoSwitchToSecondTarget || !settings.secondTargetLanguage) {
      return { effectiveTargetLanguage: primary, detectedSourceLanguage: null };
    }

    const detected = namespace.pageUtils.detectTextLanguage(text);
    if (namespace.pageUtils.getBaseLanguage(detected) === namespace.pageUtils.getBaseLanguage(primary)) {
      return { effectiveTargetLanguage: settings.secondTargetLanguage, detectedSourceLanguage: detected };
    }

    return { effectiveTargetLanguage: primary, detectedSourceLanguage: detected };
  }

  function toAbsoluteUrl(baseUrl, path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    const base = String(baseUrl || "").replace(/\/$/, "");
    const suffix = String(path).startsWith("/") ? path : `/${path}`;
    return `${base}${suffix}`;
  }

  function collectTypeHints(item) {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidates = [
      item.type,
      item.model_type,
      item.modality,
      item.task,
      item.category,
      item.endpoint_type,
      item.capability
    ];

    return candidates
      .filter((value) => typeof value === "string")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
  }

  function tokenizeTypeHint(value) {
    return String(value || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  function shouldIncludeTextModel(item) {
    if (typeof item === "string") {
      return true;
    }
    if (!item || typeof item !== "object") {
      return false;
    }

    const typeHints = collectTypeHints(item);
    if (!typeHints.length) {
      return true;
    }

    const denyTokens = new Set([
      "image", "images", "video", "videos", "audio", "speech", "voice", "tts", "stt",
      "embedding", "embeddings", "rerank", "reranker", "moderation", "vision", "transcription"
    ]);

    for (const hint of typeHints) {
      const tokens = tokenizeTypeHint(hint);
      if (tokens.some((token) => denyTokens.has(token))) {
        return false;
      }
    }

    // Unknown type labels are kept to avoid dropping valid text models on providers
    // that use custom categories.
    return true;
  }

  function extractModelList(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.data)) return json.data;
    if (json && Array.isArray(json.models)) return json.models;
    return [];
  }

  function parseModelIds(json) {
    const list = extractModelList(json);

    return Array.from(new Set(list
      .filter((item) => shouldIncludeTextModel(item))
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (!item || typeof item !== "object") return "";
        return String(item.id || item.canonical_slug || item.name || "").trim();
      })
      .filter(Boolean)));
  }

  function parseDefaultModelKey(value) {
    return namespace.pageUtils.parseDefaultModelKey(value);
  }

  function resolveTemperatureOverrides(providerIds, modelOverrides, incomingTemperatureOverrides, configuredProviders) {
    const configuredMap = Object.fromEntries((configuredProviders || []).map((provider) => [provider.id, provider]));
    const overrides = {};
    const incoming = incomingTemperatureOverrides && typeof incomingTemperatureOverrides === "object"
      ? incomingTemperatureOverrides
      : {};

    (providerIds || []).forEach((providerId) => {
      const config = configuredMap[providerId];
      if (!config) {
        return;
      }
      const temp = mp.resolveProviderTemperature(
        config,
        incoming[providerId],
        modelOverrides && modelOverrides[providerId],
        MODEL_TEMPERATURE_MAX,
        MODEL_TEMPERATURE_DEFAULT
      );
      if (temp !== null) {
        overrides[providerId] = temp;
      }
    });

    return overrides;
  }

  function resolveEffectiveRoute(providerIds, incomingModelOverrides, settings, configuredProviders) {
    if (providerIds && providerIds.length) {
      return {
        providerIds,
        modelOverrides: Object.assign({}, incomingModelOverrides || {})
      };
    }

    const enabled = (configuredProviders || []).filter((provider) => namespace.providerRegistry.providerIsConfigured(provider));
    if (!enabled.length) {
      return { providerIds: [], modelOverrides: Object.assign({}, incomingModelOverrides || {}) };
    }

    const modelOverrides = Object.assign({}, incomingModelOverrides || {});
    const defaultModel = parseDefaultModelKey(settings.defaultTranslationModelKey);
    if (defaultModel.providerId && defaultModel.model && enabled.some((provider) => provider.id === defaultModel.providerId)) {
      modelOverrides[defaultModel.providerId] = defaultModel.model;
      return {
        providerIds: [defaultModel.providerId],
        modelOverrides
      };
    }

    if (settings.defaultTranslationProviderId && enabled.some((provider) => provider.id === settings.defaultTranslationProviderId)) {
      return {
        providerIds: [settings.defaultTranslationProviderId],
        modelOverrides
      };
    }

    return {
      providerIds: [enabled[0].id],
      modelOverrides
    };
  }

  function providerIsSelectableForContent(provider, config) {
    if (!provider || !config || !config.enabled) {
      return false;
    }
    if (provider.requiresApiKey === false) {
      return true;
    }
    return !!String(config.encryptedApiKey || "").trim();
  }

  function selectDefaultModelKey(settings, modelOptions) {
    const options = Array.isArray(modelOptions) ? modelOptions : [];
    if (!options.length) {
      return "";
    }

    const defaultModelKey = settings.defaultTranslationModelKey;
    if (defaultModelKey && options.some((item) => item.key === defaultModelKey)) {
      return defaultModelKey;
    }

    const parsedDefaultModel = parseDefaultModelKey(defaultModelKey);
    if (parsedDefaultModel.providerId) {
      const providerMatch = options.find((item) => item.providerId === parsedDefaultModel.providerId);
      if (providerMatch) {
        return providerMatch.key;
      }
    }

    if (settings.defaultTranslationProviderId) {
      const providerMatch = options.find((item) => item.providerId === settings.defaultTranslationProviderId);
      if (providerMatch) {
        return providerMatch.key;
      }
    }

    return options[0].key;
  }

  async function getTranslationModelOptions() {
    const [settings, providerConfigs] = await Promise.all([
      namespace.configManager.getSettings(),
      namespace.configManager.getProviderConfigs()
    ]);
    const modelOptions = namespace.providerRegistry.listProviders().flatMap((provider) => {
      const config = providerConfigs[provider.id] || {};
      if (!providerIsSelectableForContent(provider, config)) {
        return [];
      }
      const models = namespace.pageUtils.normalizeModels([
        ...(Array.isArray(config.favoriteModels) ? config.favoriteModels : []),
        config.model || ""
      ]);
      return models.map((model) => ({
        key: namespace.pageUtils.buildDefaultModelKey(provider.id, model),
        providerId: provider.id,
        providerName: provider.displayName || provider.id,
        model,
        label: `${provider.displayName || provider.id} · ${model}`
      }));
    });

    return {
      modelOptions,
      selectedModelKey: selectDefaultModelKey(settings, modelOptions)
    };
  }

  async function fetchProviderModels(catalogEntry, providerConfig, bypassCache) {
    const cached = Array.isArray(providerConfig.availableModels) ? providerConfig.availableModels : [];
    const fetchedAt = Number(providerConfig.modelsFetchedAt || 0);
    const age = Date.now() - fetchedAt;
    if (!bypassCache && cached.length && age >= 0 && age < MODEL_CACHE_TTL_MS) {
      return { models: cached, fromCache: true, fetchedAt };
    }

    if (Array.isArray(catalogEntry.staticModels) && catalogEntry.staticModels.length) {
      return { models: catalogEntry.staticModels.slice(), fromCache: false, fetchedAt: Date.now() };
    }

    const modelListPath = catalogEntry.modelListPath || "/models";
    const baseUrl = providerConfig.baseUrl || catalogEntry.baseUrl || "";
    if (!baseUrl && !/^https?:\/\//i.test(modelListPath)) {
      throw new Error("A base URL is required to load the model list.");
    }

    const accountId = providerConfig.modelListAccountId
      || (String(baseUrl).match(/\/accounts\/([^/]+)/) || [])[1]
      || "";
    const resolvedPath = modelListPath.includes("{account_id}")
      ? modelListPath.replace("{account_id}", accountId)
      : modelListPath;

    if (modelListPath.includes("{account_id}") && !accountId) {
      throw new Error("This provider needs an account ID before it can list models.");
    }

    const url = toAbsoluteUrl(baseUrl, resolvedPath);
    const headers = Object.assign({ Accept: "application/json" }, providerConfig.extraHeaders || {});
    const authMode = catalogEntry.modelListAuth || "bearer";
    if (authMode === "bearer") {
      if (!providerConfig.apiKey) {
        throw new Error("Add an API key first.");
      }
      headers.Authorization = `Bearer ${providerConfig.apiKey}`;
    } else if (authMode === "baseten-api-key") {
      if (!providerConfig.apiKey) {
        throw new Error("Add an API key first.");
      }
      headers.Authorization = `Api-Key ${providerConfig.apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Could not load the model list (${response.status}).`);
    }

    const json = await response.json();
    const models = parseModelIds(json);
    if (!models.length) {
      throw new Error("The provider did not return any models.");
    }

    return { models, fromCache: false, fetchedAt: Date.now() };
  }

  async function updateProviderModels(providerId, models, fetchedAt) {
    const decryptedConfigs = await namespace.configManager.getDecryptedProviderConfigs();
    const config = decryptedConfigs[providerId];
    if (!config) {
      throw new Error("Provider config not found.");
    }

    const currentModel = config.model;
    const nextFavoriteModels = Array.from(new Set([
      ...(Array.isArray(config.favoriteModels) ? config.favoriteModels : []),
      currentModel
    ].filter(Boolean))).slice(0, namespace.constants.maxFavoriteModelsPerProvider);

    decryptedConfigs[providerId] = Object.assign({}, config, {
      availableModels: models,
      favoriteModels: nextFavoriteModels,
      modelsFetchedAt: fetchedAt || Date.now()
    });

    const persisted = await namespace.configManager.saveProviderConfigs(decryptedConfigs);
    return persisted[providerId];
  }

  async function handleGetProviderModels(message) {
    const providerId = message.providerId;
    if (!providerId) {
      return namespace.messages.error("Missing provider ID.");
    }

    const catalogEntry = namespace.providerCatalog.find((item) => item.id === providerId);
    if (!catalogEntry) {
      return namespace.messages.error("Unknown provider.");
    }

    const configs = await namespace.configManager.getDecryptedProviderConfigs();
    const providerConfig = configs[providerId];
    if (!providerConfig) {
      return namespace.messages.error("Provider settings were not found.");
    }

    const tempApiKey = String(message.tempApiKey || "").trim();
    const tempBaseUrl = String(message.tempBaseUrl || "").trim();
    const tempModelListAccountId = String(message.tempModelListAccountId || "").trim();
    const fetchConfig = Object.assign({}, providerConfig, {
      apiKey: tempApiKey || providerConfig.apiKey,
      baseUrl: tempBaseUrl || providerConfig.baseUrl,
      modelListAccountId: tempModelListAccountId || providerConfig.modelListAccountId
    });

    try {
      const result = await fetchProviderModels(catalogEntry, fetchConfig, !!message.bypassCache);
      const persisted = await updateProviderModels(providerId, result.models, result.fetchedAt);
      return namespace.messages.ok({
        providerId,
        models: persisted.availableModels || result.models,
        favoriteModels: persisted.favoriteModels || [],
        modelsFetchedAt: persisted.modelsFetchedAt || result.fetchedAt,
        fromCache: !!result.fromCache
      });
    } catch (error) {
      return namespace.messages.error(error.message || "Could not list models.");
    }
  }

  function buildProviderSignature(providerIds, modelOverrides, temperatureOverrides, configuredProviders) {
    const enabled = (configuredProviders || []).filter((provider) => namespace.providerRegistry.providerIsConfigured(provider));
    const selected = providerIds && providerIds.length
      ? enabled.filter((provider) => providerIds.includes(provider.id))
      : enabled.slice(0, 1);
    const overrides = modelOverrides || {};
    const temperatureMap = temperatureOverrides || {};

    return selected
      .map((provider) => {
        const effectiveModel = overrides[provider.id] || provider.model || "";
        const effectiveBaseUrl = provider.baseUrl || "";
        const effectiveTemperature = mp.normalizeTemperature(temperatureMap[provider.id], MODEL_TEMPERATURE_MAX);
        const tempLabel = effectiveTemperature === null ? "" : String(effectiveTemperature);
        return `${provider.id}:${effectiveModel}:${effectiveBaseUrl}:${tempLabel}`;
      })
      .sort()
      .join("|");
  }

  async function openComparePage(providerId) {
    const params = new URLSearchParams();
    if (providerId) {
      params.set("providerId", providerId);
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    await api.tabs.create({ url: api.runtime.getURL(`src/pages/compare/compare.html${suffix}`) });
  }

  async function ensureContextMenu() {
    await api.contextMenus.removeAll();
    await api.contextMenus.create({
      id: selectionContextMenuId,
      title: "Translate selected text",
      contexts: ["selection"]
    });
    await api.contextMenus.create({
      id: editableContextMenuId,
      title: "Translate input text",
      contexts: ["editable"]
    });
  }

  function buildStreamPayload(message, settings) {
    const text = (message.text || "").trim().slice(0, namespace.constants.maxSelectionLength);
    const explicitSourceLanguage = String(message.sourceLanguage || "").trim();
    const hasExplicitSource = !!explicitSourceLanguage && explicitSourceLanguage.toLowerCase() !== "auto";
    const targetDecision = maybeSwitchTargetLanguage(settings, message.targetLanguage, text);
    const contextStyle = namespace.pageUtils.getInputContextStyle(message.contextStyle);
    const dictionaryMode = message.dictionaryModeForSingleWord === false
      ? false
      : settings.dictionaryModeForSingleWord !== false;
    return {
      text,
      sourceLanguage: hasExplicitSource ? explicitSourceLanguage : "",
      targetLanguage: hasExplicitSource
        ? (message.targetLanguage || settings.targetLanguage)
        : targetDecision.effectiveTargetLanguage,
      sourceLanguageDetected: hasExplicitSource ? explicitSourceLanguage : targetDecision.detectedSourceLanguage,
      dictionaryModeForSingleWord: dictionaryMode,
      contextStyle,
      url: message.url || ""
    };
  }

  async function prepareTranslationContext(message) {
    const [settings, configuredProviders] = await Promise.all([
      namespace.configManager.getSettings(),
      namespace.providerRegistry.buildConfiguredProviders()
    ]);
    const request = buildStreamPayload(message, settings);
    const route = resolveEffectiveRoute(message.providerIds || [], message.modelOverrides || {}, settings, configuredProviders);
    const providerIds = route.providerIds;
    const modelOverrides = route.modelOverrides;
    const temperatureOverrides = resolveTemperatureOverrides(
      providerIds,
      modelOverrides,
      message.temperatureOverrides || {},
      configuredProviders
    );
    const bypassCache = !!message.bypassCache;
    const providerSignature = buildProviderSignature(providerIds, modelOverrides, temperatureOverrides, configuredProviders);
    const key = cacheKey(
      request.text,
      request.sourceLanguage || request.sourceLanguageDetected || "auto",
      request.targetLanguage,
      providerSignature,
      request.contextStyle,
      request.dictionaryModeForSingleWord
    );
    const cached = bypassCache ? null : getCached(key);
    return { settings, configuredProviders, request, providerIds, modelOverrides, temperatureOverrides, key, cached };
  }

  async function appendTranslationHistory(request, results, settings) {
    await namespace.configManager.appendHistory({
      id: crypto.randomUUID(),
      text: request.text,
      targetLanguage: request.targetLanguage,
      contextStyle: request.contextStyle,
      url: request.url,
      createdAt: new Date().toISOString(),
      results
    }, settings);
  }

  async function handleTranslation(message) {
    const ctx = await prepareTranslationContext(message);
    if (ctx.cached) {
      return namespace.messages.ok({ results: ctx.cached, fromCache: true });
    }

    const results = await namespace.providerRegistry.translate(
      ctx.request,
      ctx.providerIds,
      ctx.modelOverrides,
      ctx.temperatureOverrides,
      ctx.configuredProviders
    );
    setCache(ctx.key, results);
    await appendTranslationHistory(ctx.request, results, ctx.settings);
    return namespace.messages.ok({ results });
  }

  async function handleReadAloud(message) {
    const text = String(message.text || "").trim();
    let language = String(message.language || "").trim();

    if (!text) {
      return namespace.messages.error("There is no translated text to read aloud.");
    }

    if (!language || language.toLowerCase() === "auto") {
      language = await namespace.googleTranslateProvider.detectLanguage(text);
    }

    try {
      const result = await namespace.googleTranslateProvider.fetchReadAloudAudio({
        text,
        language
      });
      return namespace.messages.ok(result);
    } catch (error) {
      return namespace.messages.error(error.message || "Could not load read aloud audio.", {
        category: getErrorCategory(error)
      });
    }
  }

  function applyDetectedSourceLanguage(event, detectedSourceLanguage) {
    if (event.event !== "provider-complete" || !event.result || event.result.detectedSourceLanguage || !detectedSourceLanguage) {
      return event;
    }
    return Object.assign({}, event, {
      result: Object.assign({}, event.result, { detectedSourceLanguage })
    });
  }

  function postCachedStreamResults(port, cachedResults, detectedSourceLanguage) {
    cachedResults.forEach((result) => {
      port.postMessage({
        event: "provider-start",
        providerId: result.providerId,
        providerName: result.providerName,
        model: result.model,
        prompt: result.prompt || "",
        fromCache: true
      });

      if (result.ok) {
        port.postMessage({
          event: "provider-chunk",
          providerId: result.providerId,
          providerName: result.providerName,
          model: result.model,
          chunk: result.translatedText,
          thinkingChunk: result.thinkingText || "",
          prompt: result.prompt || "",
          outputTokens: result.outputTokens,
          fromCache: true
        });
        port.postMessage({
          event: "provider-complete",
          providerId: result.providerId,
          providerName: result.providerName,
          model: result.model,
          result: Object.assign({}, result, {
            fromCache: true,
            detectedSourceLanguage: result.detectedSourceLanguage || detectedSourceLanguage || ""
          })
        });
        return;
      }

      port.postMessage({
        event: "provider-error",
        providerId: result.providerId,
        providerName: result.providerName,
        model: result.model,
        error: Object.assign({}, result, { fromCache: true })
      });
    });
    port.postMessage({ event: "stream-complete", fromCache: true });
  }

  async function handleStreamingTranslation(port, message, signal) {
    const ctx = await prepareTranslationContext(message);

    // Keep the service worker alive during long reasoning model "thinking" phases.
    // Chrome MV3 may terminate the worker after ~30 s of inactivity.
    const keepAliveTimer = setInterval(() => {
      try { port.postMessage({ event: "keepalive" }); } catch (_) {}
    }, 20000);

    try {
      if (signal && signal.aborted) {
        return;
      }

      if (ctx.cached) {
        postCachedStreamResults(port, ctx.cached, ctx.request.sourceLanguageDetected);
        return;
      }

      const results = await namespace.providerRegistry.streamTranslate(ctx.request, ctx.providerIds, ctx.modelOverrides, (event) => {
        try {
          port.postMessage(applyDetectedSourceLanguage(event, ctx.request.sourceLanguageDetected));
        } catch (_) {}
      }, ctx.temperatureOverrides, signal, ctx.configuredProviders);

      // Only cache and record history if the translation was not cancelled.
      if (!signal || !signal.aborted) {
        setCache(ctx.key, results);
        await appendTranslationHistory(ctx.request, results, ctx.settings);
        port.postMessage({ event: "stream-complete" });
      }

    } finally {
      clearInterval(keepAliveTimer);
    }
  }

  async function initialize() {
    if (initializePromise) {
      return initializePromise;
    }

    initializePromise = (async () => {
      await namespace.configManager.seedDefaults();
      await ensureContextMenu();
    })();

    return initializePromise;
  }

  api.runtime.onMessage(async (message, sender) => {
    switch (message.type) {
      case messageTypes.getSettings: {
        const settings = await namespace.configManager.getSettings();
        return namespace.messages.ok({ settings });
      }
      case messageTypes.getOptionsBootstrap: {
        const [settings, providerConfigs, history] = await Promise.all([
          namespace.configManager.getSettings(),
          namespace.configManager.getDecryptedProviderConfigs(),
          namespace.configManager.getHistory()
        ]);
        return namespace.messages.ok({
          settings,
          providers: namespace.providerRegistry.listProviders(),
          providerConfigs,
          history
        });
      }
      case messageTypes.getTranslationModelOptions:
        return namespace.messages.ok(await getTranslationModelOptions());
      case messageTypes.saveOptions: {
        const [settings, persistedProviders] = await Promise.all([
          namespace.configManager.saveSettings(message.settings),
          namespace.configManager.saveProviderConfigs(message.providerConfigs)
        ]);
        translationCache.clear();
        return namespace.messages.ok({ settings, providerConfigs: persistedProviders });
      }
      case messageTypes.getProviderModels:
        return handleGetProviderModels(message);
      case messageTypes.readAloud:
        return handleReadAloud(message);
      case messageTypes.openComparePage:
        await openComparePage(message.providerId || "");
        return namespace.messages.ok();
      case messageTypes.clearHistory:
        await namespace.configManager.clearHistory();
        return namespace.messages.ok();
      case messageTypes.getHistory: {
        const history = await namespace.configManager.getHistory();
        return namespace.messages.ok({ history });
      }
      default:
        return namespace.messages.error("Unknown message type.");
    }
  });

  api.runtime.onConnect((port) => {
    if (!port || port.name !== "melontranslate-stream") {
      return;
    }

    const abortController = new AbortController();

    port.onDisconnect.addListener(() => {
      abortController.abort();
    });

    port.onMessage.addListener((message) => {
      if (!message || message.type === "keepalive") {
        return;
      }
      if (message.type !== messageTypes.translateStream) {
        return;
      }

      handleStreamingTranslation(port, message, abortController.signal).catch((error) => {
        if (error.name === "AbortError") { return; }
        try {
          port.postMessage({
            event: "stream-error",
            error: {
              message: error.message,
              category: getErrorCategory(error)
            }
          });
        } catch (_) {}
      });
    });
  });

  api.contextMenus.onClicked(async (info, tab) => {
    if (!tab || typeof tab.id === "undefined") {
      return;
    }

    const frameOptions = Number.isFinite(info.frameId) ? { frameId: info.frameId } : undefined;
    const message = info.menuItemId === selectionContextMenuId
      ? { type: messageTypes.manualTranslateSelection, text: info.selectionText || "" }
      : (info.menuItemId === editableContextMenuId
        ? { type: messageTypes.manualTranslateEditable }
        : null);

    if (!message) {
      return;
    }

    try {
      await api.tabs.sendMessage(tab.id, message, frameOptions);
    } catch (error) {
      console.error("Failed to request manual translation", error);
    }
  });

  api.runtime.onInstalled(() => {
    initialize().catch((error) => {
      console.error("Failed to initialize MelonTranslate", error);
    });
  });

  initialize().catch((error) => {
    console.error("Failed to initialize MelonTranslate", error);
  });
}(globalThis));
