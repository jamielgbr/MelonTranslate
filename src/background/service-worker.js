(function initServiceWorker(root) {
  const namespace = root.MelonTranslate;
  const api = namespace.browserApi;
  const messageTypes = namespace.messages.types;
  const getErrorCategory = namespace.providerBase.getErrorCategory;
  const mp = namespace.modelParams;
  const mc = namespace.modelCapabilities;
  const selectionContextMenuId = "melontranslate-selection";
  const editableContextMenuId = "melontranslate-editable";
  const immersiveContextMenuId = "melontranslate-immersive-page";
  const videoSubtitleContextMenuId = "melontranslate-video-subtitles";
  const elementPickerContextMenuId = "melontranslate-pick-immersive-area";
  const MODEL_CACHE_TTL_MS = namespace.constants.modelCacheTtlMs;
  const MODEL_TEMPERATURE_DEFAULT = namespace.constants.modelTemperatureDefault;
  const MODEL_TEMPERATURE_MAX = namespace.constants.modelTemperatureMax;
  let initializePromise = null;
  let contentScriptFiles = null;

  // In-memory translation cache: key → { result, expiresAt }
  const translationCache = new Map();
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  const richTextMarkerPattern = /\[\[\/?MT[BI]\]\]/g;

  function stripRichTextMarkers(text) {
    return String(text || "").replace(richTextMarkerPattern, "");
  }

  function cacheKey(text, sourceLanguage, targetLanguage, providerSignature, contextStyle, dictionaryModeForSingleWord, preserveRichTextFormatting, subtitleContext) {
    const style = namespace.pageUtils.getInputContextStyle(contextStyle);
    const dictionaryMode = dictionaryModeForSingleWord ? "dict" : "plain";
    const formatMode = preserveRichTextFormatting ? "rich-v1" : "plain";
    const contextKey = String(subtitleContext || "").replace(/\s+/g, " ").trim().slice(0, 600);
    return `${sourceLanguage || "auto"}\0${targetLanguage}\0${style}\0${dictionaryMode}\0${formatMode}\0${contextKey}\0${providerSignature}\0${text}`;
  }

  function subtitleAnnotationCacheKey(text, sourceLanguage, targetLanguage, providerSignature, learningLevelSystem, learningLevel, maxAnnotations, annotationTypes, subtitleContext) {
    return [
      "subtitle-annotations-v1",
      sourceLanguage || "auto",
      targetLanguage || "en",
      learningLevelSystem || "",
      learningLevel || "",
      maxAnnotations || 4,
      (Array.isArray(annotationTypes) ? annotationTypes : ["any"]).join(","),
      String(subtitleContext || "").replace(/\s+/g, " ").trim().slice(0, 600),
      providerSignature || "",
      text || ""
    ].join("\0");
  }

  function subtitleTopicContextCacheKey(sampleText, sourceLanguage, targetLanguage, providerSignature, title) {
    return [
      "subtitle-topic-context-v1",
      sourceLanguage || "auto",
      targetLanguage || "en",
      providerSignature || "",
      String(title || "").replace(/\s+/g, " ").trim().slice(0, 200),
      String(sampleText || "").replace(/\s+/g, " ").trim().slice(0, 4000)
    ].join("\0");
  }

  function subtitleWordLookupCacheKey(word, sentence, nextSentence, sourceLanguage, targetLanguage, providerSignature, subtitleContext) {
    return [
      "subtitle-word-lookup-v1",
      sourceLanguage || "auto",
      targetLanguage || "en",
      String(subtitleContext || "").replace(/\s+/g, " ").trim().slice(0, 600),
      providerSignature || "",
      String(sentence || "").replace(/\s+/g, " ").trim().slice(0, 500),
      String(nextSentence || "").replace(/\s+/g, " ").trim().slice(0, 500),
      String(word || "").replace(/\s+/g, " ").trim().slice(0, 120)
    ].join("\0");
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

  function appendQueryParam(url, key, value) {
    const separator = String(url || "").includes("?") ? "&" : "?";
    return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }

  function extractModelList(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.data)) return json.data;
    if (json && Array.isArray(json.models)) return json.models;
    return [];
  }

  function parseModelEntries(json, source, fetchedAt) {
    const list = extractModelList(json);
    if (source === "gemini") {
      return mc.normalizeModelList(list.map((item) => {
        const value = item && typeof item === "object" ? item : {};
        const name = String(value.name || "").trim();
        const id = name.startsWith("models/") ? name.slice(7) : name;
        return Object.assign({}, value, {
          id,
          name: value.displayName || id,
          supported_generation_methods: value.supportedGenerationMethods || value.supported_generation_methods || []
        });
      }), {
        source,
        updatedAt: fetchedAt || Date.now()
      });
    }
    return mc.normalizeModelList(list, {
      source,
      updatedAt: fetchedAt || Date.now()
    });
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

  function getRouteProviderConfigs(route, configuredProviders) {
    const ids = new Set(route && Array.isArray(route.providerIds) ? route.providerIds : []);
    if (!ids.size) {
      return [];
    }
    return (configuredProviders || []).filter((provider) => ids.has(provider.id));
  }

  function providerSupportsSubtitleAnnotations(provider) {
    const transport = String(provider && provider.transport || "");
    return transport === "openai-compatible" || transport === "anthropic" || transport === "gemini";
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
      const availableModels = mc.normalizeModelList(config.availableModels || [], {
        source: provider.id,
        updatedAt: Number(config.modelsFetchedAt || 0)
      });
      const modelById = Object.fromEntries(availableModels.map((model) => [model.id, model]));
      const models = namespace.pageUtils.normalizeModels([
        ...(Array.isArray(config.favoriteModels) ? config.favoriteModels : []),
        config.model || ""
      ]).map((model) => ({
        id: model,
        meta: modelById[model] || mc.normalizeModelEntry(model, {
          source: provider.id,
          updatedAt: Number(config.modelsFetchedAt || 0)
        })
      })).filter((item) => mc.isTextGenerationModel(item.meta));
      return models.map((item) => ({
        key: namespace.pageUtils.buildDefaultModelKey(provider.id, item.id),
        providerId: provider.id,
        providerName: provider.displayName || provider.id,
        model: item.id,
        capabilities: item.meta.capabilities,
        capabilityLabels: mc.describeModelCapabilities(item.meta),
        label: mc.formatModelOptionLabel(provider.displayName || provider.id, item.id, item.meta)
      }));
    });

    return {
      modelOptions,
      selectedModelKey: selectDefaultModelKey(settings, modelOptions)
    };
  }

  async function fetchProviderModels(catalogEntry, providerConfig, bypassCache) {
    const cached = mc.normalizeModelList(providerConfig.availableModels || [], {
      source: catalogEntry.id,
      updatedAt: Number(providerConfig.modelsFetchedAt || 0)
    });
    const fetchedAt = Number(providerConfig.modelsFetchedAt || 0);
    const age = Date.now() - fetchedAt;
    if (!bypassCache && cached.length && age >= 0 && age < MODEL_CACHE_TTL_MS) {
      return { models: cached, fromCache: true, fetchedAt };
    }

    const modelListPath = String(catalogEntry.modelListPath || "").trim();
    if (!modelListPath) {
      throw new Error("This provider does not expose a model list endpoint.");
    }
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

    let url = toAbsoluteUrl(baseUrl, resolvedPath);
    const headers = Object.assign({ Accept: "application/json" }, providerConfig.extraHeaders || {});
    const authMode = catalogEntry.modelListAuth || "bearer";
    if (authMode === "bearer") {
      if (providerConfig.apiKey) {
        headers.Authorization = `Bearer ${providerConfig.apiKey}`;
      }
    } else if (authMode === "baseten-api-key") {
      if (providerConfig.apiKey) {
        headers.Authorization = `Api-Key ${providerConfig.apiKey}`;
      }
    } else if (authMode === "gemini-api-key") {
      if (providerConfig.apiKey) {
        url = appendQueryParam(url, "key", providerConfig.apiKey);
      }
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
      if (response.status === 401 || response.status === 403) {
        throw new Error("The provider rejected the model list request. Add or check the API key, then try again.");
      }
      throw new Error(`Could not load the model list (${response.status}).`);
    }

    const json = await response.json();
    const models = parseModelEntries(json, catalogEntry.id, Date.now());
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
    ].map((item) => mc.normalizeModelId(item)).filter(Boolean))).slice(0, namespace.constants.maxFavoriteModelsPerProvider);

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
        const modelMeta = mc.findModelMeta(provider.availableModels || [], effectiveModel) || mc.normalizeModelEntry(effectiveModel, {
          source: provider.id,
          updatedAt: Number(provider.modelsFetchedAt || 0)
        });
        const supportsReasoningEffort = mc.providerSupportsReasoningControl(provider, modelMeta);
        const resolvedReasoningEffort = supportsReasoningEffort
          ? mp.resolveProviderReasoningEffort(
            provider,
            null,
            effectiveModel,
            namespace.constants.modelReasoningEffortDefault || "off"
          )
          : null;
        const effectiveReasoningEffort = resolvedReasoningEffort === null
          ? null
          : mc.normalizeProviderReasoningEffort(provider, modelMeta, resolvedReasoningEffort);
        const tempLabel = effectiveTemperature === null ? "" : String(effectiveTemperature);
        const effortLabel = effectiveReasoningEffort === null ? "" : String(effectiveReasoningEffort);
        return `${provider.id}:${effectiveModel}:${effectiveBaseUrl}:${tempLabel}:${effortLabel}`;
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
    await api.contextMenus.create({
      id: immersiveContextMenuId,
      title: "Translate page inline",
      contexts: ["page", "frame"]
    });
    await api.contextMenus.create({
      id: videoSubtitleContextMenuId,
      title: "Toggle bilingual video subtitles",
      contexts: ["page", "frame", "video"]
    });
    await api.contextMenus.create({
      id: elementPickerContextMenuId,
      title: "Select inline translation area",
      contexts: ["page", "frame"]
    });
  }

  function getContentScriptFiles() {
    if (!contentScriptFiles) {
      const manifest = api.runtime.getManifest ? api.runtime.getManifest() : null;
      const firstContentScript = manifest && Array.isArray(manifest.content_scripts)
        ? manifest.content_scripts[0]
        : null;
      contentScriptFiles = firstContentScript && Array.isArray(firstContentScript.js)
        ? firstContentScript.js.slice()
        : [];
    }
    return contentScriptFiles;
  }

  function isFiniteFrameId(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function getFrameOptions(frameId) {
    return isFiniteFrameId(frameId) ? { frameId } : undefined;
  }

  function getScriptTarget(tabId, frameOptions) {
    const frameId = frameOptions && frameOptions.frameId;
    return {
      tabId,
      frameIds: [isFiniteFrameId(frameId) ? frameId : 0]
    };
  }

  function getContextMenuMessage(info) {
    switch (info && info.menuItemId) {
      case selectionContextMenuId:
        return { type: messageTypes.manualTranslateSelection, text: info.selectionText || "" };
      case editableContextMenuId:
        return { type: messageTypes.manualTranslateEditable };
      case immersiveContextMenuId:
        return { type: messageTypes.manualTranslateImmersivePage };
      case videoSubtitleContextMenuId:
        return { type: messageTypes.manualToggleVideoSubtitles };
      case elementPickerContextMenuId:
        return { type: messageTypes.startElementPicker };
      default:
        return null;
    }
  }

  function isMissingReceiverError(error) {
    const message = String(error && error.message || error || "");
    return /Could not establish connection|Receiving end does not exist/i.test(message);
  }

  async function frameHasContentScript(tabId, frameOptions) {
    if (!api.scripting || typeof api.scripting.executeScript !== "function") {
      return false;
    }

    const results = await api.scripting.executeScript({
      target: getScriptTarget(tabId, frameOptions),
      func: () => !!(globalThis.MelonTranslate && globalThis.MelonTranslate.contentScriptReady)
    });
    return Array.isArray(results) && results.some((item) => item && item.result === true);
  }

  async function ensureContentScript(tabId, frameOptions) {
    if (!api.scripting || typeof api.scripting.executeScript !== "function") {
      throw new Error("The scripting API is not available in this browser context.");
    }
    if (await frameHasContentScript(tabId, frameOptions).catch(() => false)) {
      return;
    }

    const files = getContentScriptFiles();
    if (!files.length) {
      throw new Error("No content scripts are configured for injection.");
    }

    await api.scripting.executeScript({
      target: getScriptTarget(tabId, frameOptions),
      files
    });
  }

  async function sendContentMessage(tabId, message, frameOptions) {
    try {
      return await api.tabs.sendMessage(tabId, message, frameOptions);
    } catch (error) {
      if (!isMissingReceiverError(error)) {
        throw error;
      }
      await ensureContentScript(tabId, frameOptions);
      return api.tabs.sendMessage(tabId, message, frameOptions);
    }
  }

  async function sendContextMenuMessage(tabId, message, frameOptions) {
    try {
      return await sendContentMessage(tabId, message, frameOptions);
    } catch (error) {
      if (frameOptions && frameOptions.frameId !== 0 && message.type !== messageTypes.manualTranslateEditable) {
        return sendContentMessage(tabId, message, { frameId: 0 });
      }
      throw error;
    }
  }

  function resolveRequestContextStyle(message, settings, siteRules) {
    return namespace.siteRuleEngine.resolveContextStyleForUrl(message.url || "", {
      explicitContextStyle: message.contextStyle,
      userRules: siteRules,
      defaultContextStyle: settings.defaultInputContextStyle
    });
  }

  function buildStreamPayload(message, settings, siteRules) {
    const maxLength = namespace.constants.maxSelectionLength;
    const rawText = String(message.text || "").trim();
    const rawPlainText = String(message.plainText || "").trim();
    const canPreserveRichText = !!message.preserveRichTextFormatting
      && !!rawPlainText
      && rawText !== rawPlainText
      && rawText.length <= maxLength;
    const text = (canPreserveRichText ? rawText : (rawPlainText || rawText)).slice(0, maxLength);
    const displayText = (rawPlainText || text).slice(0, maxLength);
    const explicitSourceLanguage = String(message.sourceLanguage || "").trim();
    const hasExplicitSource = !!explicitSourceLanguage && explicitSourceLanguage.toLowerCase() !== "auto";
    const targetDecision = maybeSwitchTargetLanguage(settings, message.targetLanguage, displayText || text);
    const contextStyle = resolveRequestContextStyle(message, settings, siteRules);
    const dictionaryMode = message.dictionaryModeForSingleWord === false
      ? false
      : settings.dictionaryModeForSingleWord !== false;
    return {
      text,
      displayText,
      sourceLanguage: hasExplicitSource ? explicitSourceLanguage : "",
      targetLanguage: hasExplicitSource
        ? (message.targetLanguage || settings.targetLanguage)
        : targetDecision.effectiveTargetLanguage,
      sourceLanguageDetected: hasExplicitSource ? explicitSourceLanguage : targetDecision.detectedSourceLanguage,
      dictionaryModeForSingleWord: dictionaryMode,
      preserveRichTextFormatting: canPreserveRichText,
      contextStyle,
      url: message.url || ""
    };
  }

  async function prepareTranslationContext(message) {
    const [settings, configuredProviders, siteRules] = await Promise.all([
      namespace.configManager.getSettings(),
      namespace.providerRegistry.buildConfiguredProviders(),
      namespace.configManager.getSiteRules()
    ]);
    const request = buildStreamPayload(message, settings, siteRules);
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
      request.dictionaryModeForSingleWord,
      request.preserveRichTextFormatting
    );
    const cached = bypassCache ? null : getCached(key);
    return { settings, configuredProviders, request, providerIds, modelOverrides, temperatureOverrides, key, cached };
  }

  async function appendTranslationHistory(request, results, settings) {
    await namespace.configManager.appendHistory({
      id: crypto.randomUUID(),
      text: request.displayText || request.text,
      targetLanguage: request.targetLanguage,
      contextStyle: request.contextStyle,
      url: request.url,
      createdAt: new Date().toISOString(),
      results: request.preserveRichTextFormatting
        ? results.map((result) => result && typeof result === "object"
          ? Object.assign({}, result, { translatedText: stripRichTextMarkers(result.translatedText) })
          : result)
        : results
    }, settings);
  }

  function attachRequestLanguages(result, request) {
    if (!result || typeof result !== "object") {
      return result;
    }
    return Object.assign({}, result, {
      targetLanguage: result.targetLanguage || request.targetLanguage,
      detectedSourceLanguage: result.detectedSourceLanguage || request.sourceLanguageDetected || ""
    });
  }

  function attachRequestLanguagesToResults(results, request) {
    return Array.isArray(results)
      ? results.map((result) => attachRequestLanguages(result, request))
      : [];
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

  function isAllowedYouTubeSubtitleUrl(rawUrl) {
    let url;
    try {
      url = new URL(String(rawUrl || ""));
    } catch (_) {
      return false;
    }

    if (url.protocol !== "https:") {
      return false;
    }

    const host = url.hostname || "";
    return namespace.pageUtils.hostMatchesRule(host, "youtube.com")
      || namespace.pageUtils.hostMatchesRule(host, "youtube-nocookie.com");
  }

  async function handleFetchYouTubeSubtitleTrack(message) {
    const url = String(message.url || "").trim();
    if (!isAllowedYouTubeSubtitleUrl(url)) {
      return namespace.messages.error("Unsupported YouTube subtitle URL.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json,text/xml,application/xml,text/vtt,text/plain,*/*"
        },
        signal: controller.signal
      });
      const body = await response.text();
      if (!response.ok) {
        return namespace.messages.error(`Could not load subtitles (${response.status}).`);
      }
      return namespace.messages.ok({
        body,
        contentType: response.headers.get("content-type") || "",
        finalUrl: response.url || url
      });
    } catch (error) {
      return namespace.messages.error(error && error.message ? error.message : "Could not load subtitles.");
    } finally {
      clearTimeout(timer);
    }
  }

  function normalizeSubtitleBatchItems(items) {
    return (Array.isArray(items) ? items : []).slice(0, 50).map((item, index) => {
      const value = item && typeof item === "object" ? item : {};
      return {
        id: String(value.id || index),
        text: String(value.text || "").trim().slice(0, 1000)
      };
    }).filter((item) => item.text);
  }

  function normalizeSubtitleProviderText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+([,，.。!?！？;；:：])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function normalizeSubtitleTopicContext(text) {
    return String(text || "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 700)
      .trim();
  }

  function normalizeSubtitleWordLookupText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/^["'“”‘’([{]+|["'“”‘’)\]}.,!?;:，。！？；：]+$/g, "")
      .trim()
      .slice(0, 120)
      .trim();
  }

  function splitSubtitleTextForProvider(text) {
    const splitter = namespace.videoSubtitleUtils && namespace.videoSubtitleUtils.splitTextBySentenceBoundaries;
    if (typeof splitter !== "function") {
      const source = normalizeSubtitleProviderText(text);
      return source ? [source] : [];
    }
    return splitter(text, {
      normalizeText: normalizeSubtitleProviderText,
      minTextLength: 80,
      minPartLength: 24
    });
  }

  function pickFirstSubtitleTranslation(results) {
    const list = Array.isArray(results) ? results : [];
    return list.find((result) => result && result.ok && String(result.translatedText || "").trim())
      || list.find((result) => result && !result.ok)
      || null;
  }

  function pickFirstSubtitleAnnotation(results) {
    const list = Array.isArray(results) ? results : [];
    return list.find((result) => result && result.ok)
      || list.find((result) => result && !result.ok)
      || null;
  }

  function normalizeSubtitleTopicSampleText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 5000)
      .trim();
  }

  function buildSubtitleTopicContextInput(message) {
    const title = String(message.title || "").replace(/\s+/g, " ").trim().slice(0, 200);
    const sourceLanguage = String(message.sourceLanguage || "auto").trim() || "auto";
    const targetLanguage = String(message.targetLanguage || "").trim();
    const url = String(message.url || "").trim().slice(0, 300);
    const sampleText = normalizeSubtitleTopicSampleText(message.sampleText);
    return [
      title ? `Video title: ${title}` : "",
      url ? `Page URL: ${url}` : "",
      `Source language: ${sourceLanguage}`,
      targetLanguage ? `Target language: ${targetLanguage}` : "",
      "",
      "Subtitle sample:",
      sampleText
    ].filter((line) => line !== "").join("\n");
  }

  async function handleSenseSubtitleTopicContext(message) {
    const sampleText = normalizeSubtitleTopicSampleText(message.sampleText);
    if (sampleText.length < 80) {
      return namespace.messages.ok({ context: "", skipped: true, reason: "sample_too_short" });
    }

    try {
      const [settings, configuredProviders] = await Promise.all([
        namespace.configManager.getSettings(),
        namespace.providerRegistry.buildConfiguredProviders()
      ]);
      const targetLanguage = String(message.targetLanguage || settings.targetLanguage || "en").trim();
      const sourceLanguage = String(message.sourceLanguage || "").trim();
      const route = resolveEffectiveRoute(message.providerIds || [], message.modelOverrides || {}, settings, configuredProviders);
      const routeProviders = getRouteProviderConfigs(route, configuredProviders);
      if (!routeProviders.length || !routeProviders.some(providerSupportsSubtitleAnnotations)) {
        return namespace.messages.ok({ context: "", skipped: true, reason: "no_ai_provider" });
      }
      const temperatureOverrides = resolveTemperatureOverrides(
        route.providerIds,
        route.modelOverrides,
        message.temperatureOverrides || {},
        configuredProviders
      );
      const providerSignature = buildProviderSignature(route.providerIds, route.modelOverrides, temperatureOverrides, configuredProviders);
      const title = String(message.title || "").replace(/\s+/g, " ").trim();
      const key = subtitleTopicContextCacheKey(sampleText, sourceLanguage, targetLanguage, providerSignature, title);
      const cached = message.bypassCache ? null : getCached(key);
      if (cached && typeof cached.context === "string") {
        return namespace.messages.ok(Object.assign({ fromCache: true }, cached));
      }

      const request = {
        task: "subtitle-topic-context",
        text: buildSubtitleTopicContextInput(Object.assign({}, message, { sampleText, targetLanguage, sourceLanguage })),
        displayText: sampleText,
        sourceLanguage: sourceLanguage && sourceLanguage.toLowerCase() !== "auto" ? sourceLanguage : "",
        targetLanguage,
        sourceLanguageDetected: sourceLanguage && sourceLanguage.toLowerCase() !== "auto" ? sourceLanguage : "",
        dictionaryModeForSingleWord: false,
        preserveRichTextFormatting: false,
        contextStyle: "neutral",
        url: String(message.url || "")
      };
      const results = await namespace.providerRegistry.translate(
        request,
        route.providerIds,
        route.modelOverrides,
        temperatureOverrides,
        configuredProviders
      );
      const picked = pickFirstSubtitleTranslation(attachRequestLanguagesToResults(results, request));
      const context = picked && picked.ok
        ? normalizeSubtitleTopicContext(picked.translatedText)
        : "";
      const data = {
        context,
        skipped: !context,
        providerId: picked && picked.providerId || "",
        providerName: picked && picked.providerName || "",
        model: picked && picked.model || "",
        sourceLanguage: sourceLanguage || "auto",
        targetLanguage
      };
      setCache(key, data);
      return namespace.messages.ok(data);
    } catch (error) {
      return namespace.messages.ok({
        context: "",
        skipped: true,
        reason: error && error.message ? error.message : "topic_context_failed"
      });
    }
  }

  async function handleTranslateSubtitleWord(message) {
    const word = normalizeSubtitleWordLookupText(message.word || message.text);
    if (!word) {
      return namespace.messages.error("No subtitle word was provided.");
    }

    const [settings, configuredProviders] = await Promise.all([
      namespace.configManager.getSettings(),
      namespace.providerRegistry.buildConfiguredProviders()
    ]);
    const targetLanguage = String(message.targetLanguage || settings.targetLanguage || "en").trim();
    const sourceLanguage = String(message.sourceLanguage || "").trim();
    const subtitleSentence = normalizeSubtitleProviderText(message.subtitleSentence || message.sentence || "").slice(0, 1000);
    const nextSubtitleSentence = normalizeSubtitleProviderText(message.nextSubtitleSentence || "").slice(0, 1000);
    const subtitleContext = normalizeSubtitleTopicContext(message.subtitleContext);
    const route = resolveEffectiveRoute(message.providerIds || [], message.modelOverrides || {}, settings, configuredProviders);
    const temperatureOverrides = resolveTemperatureOverrides(
      route.providerIds,
      route.modelOverrides,
      message.temperatureOverrides || {},
      configuredProviders
    );
    const providerSignature = buildProviderSignature(route.providerIds, route.modelOverrides, temperatureOverrides, configuredProviders);
    const key = subtitleWordLookupCacheKey(word, subtitleSentence, nextSubtitleSentence, sourceLanguage, targetLanguage, providerSignature, subtitleContext);
    const cached = message.bypassCache ? null : getCached(key);
    if (cached) {
      return namespace.messages.ok(Object.assign({ fromCache: true }, cached));
    }

    const request = {
      task: "subtitle-word-lookup",
      text: word,
      displayText: word,
      sourceLanguage: sourceLanguage && sourceLanguage.toLowerCase() !== "auto" ? sourceLanguage : "",
      targetLanguage,
      sourceLanguageDetected: sourceLanguage && sourceLanguage.toLowerCase() !== "auto" ? sourceLanguage : "",
      dictionaryModeForSingleWord: false,
      preserveRichTextFormatting: false,
      contextStyle: "neutral",
      subtitleSentence,
      nextSubtitleSentence,
      subtitleContext,
      url: String(message.url || "")
    };
    const results = await namespace.providerRegistry.translate(
      request,
      route.providerIds,
      route.modelOverrides,
      temperatureOverrides,
      configuredProviders
    );
    const picked = pickFirstSubtitleTranslation(attachRequestLanguagesToResults(results, request));
    if (!picked || !picked.ok || !String(picked.translatedText || "").trim()) {
      return namespace.messages.error(picked && picked.error || "Word translation failed.");
    }

    const rawTranslatedText = String(picked.translatedText || "").trim();
    const annotations = namespace.videoSubtitleUtils && typeof namespace.videoSubtitleUtils.parseSubtitleAnnotationResponse === "function"
      ? namespace.videoSubtitleUtils.parseSubtitleAnnotationResponse(rawTranslatedText, { maxItems: 1 })
      : [];
    const formattedAnnotationText = annotations.length && namespace.videoSubtitleUtils && typeof namespace.videoSubtitleUtils.formatSubtitleAnnotations === "function"
      ? namespace.videoSubtitleUtils.formatSubtitleAnnotations(annotations, { maxItems: 1 })
      : "";
    const data = {
      word,
      translatedText: String(formattedAnnotationText || rawTranslatedText).replace(/\s+/g, " ").trim().slice(0, 300),
      annotations,
      providerId: picked.providerId || "",
      providerName: picked.providerName || "",
      model: picked.model || "",
      sourceLanguage: sourceLanguage || "auto",
      targetLanguage: picked.targetLanguage || targetLanguage,
      detectedSourceLanguage: picked.detectedSourceLanguage || ""
    };
    setCache(key, data);
    return namespace.messages.ok(data);
  }

  async function translateSubtitleTextPart(partText, details) {
    const request = {
      text: partText,
      displayText: partText,
      sourceLanguage: details.sourceLanguage && details.sourceLanguage.toLowerCase() !== "auto" ? details.sourceLanguage : "",
      targetLanguage: details.targetLanguage,
      sourceLanguageDetected: details.sourceLanguage && details.sourceLanguage.toLowerCase() !== "auto" ? details.sourceLanguage : "",
      dictionaryModeForSingleWord: false,
      preserveRichTextFormatting: false,
      contextStyle: details.contextStyle,
      url: details.url,
      subtitleContext: details.subtitleContext
    };
    const key = cacheKey(
      request.text,
      request.sourceLanguage || request.sourceLanguageDetected || "auto",
      request.targetLanguage,
      details.providerSignature,
      request.contextStyle,
      false,
      false,
      request.subtitleContext
    );
    const cached = details.bypassCache ? null : getCached(key);
    const results = cached || await namespace.providerRegistry.translate(
      request,
      details.route.providerIds,
      details.route.modelOverrides,
      details.temperatureOverrides,
      details.configuredProviders
    );
    const resultsWithLanguages = attachRequestLanguagesToResults(results, request);
    if (!cached) {
      setCache(key, resultsWithLanguages);
    }
    return {
      picked: pickFirstSubtitleTranslation(resultsWithLanguages),
      request,
      cached: !!cached
    };
  }

  async function handleTranslateSubtitleBatch(message) {
    const items = normalizeSubtitleBatchItems(message.items || message.cues || []);
    if (!items.length) {
      return namespace.messages.ok({ items: [] });
    }

    const [settings, configuredProviders] = await Promise.all([
      namespace.configManager.getSettings(),
      namespace.providerRegistry.buildConfiguredProviders()
    ]);
    const targetLanguage = String(message.targetLanguage || settings.targetLanguage || "en").trim();
    const sourceLanguage = String(message.sourceLanguage || "").trim();
    const route = resolveEffectiveRoute(message.providerIds || [], message.modelOverrides || {}, settings, configuredProviders);
    const temperatureOverrides = resolveTemperatureOverrides(
      route.providerIds,
      route.modelOverrides,
      message.temperatureOverrides || {},
      configuredProviders
    );
    const providerSignature = buildProviderSignature(route.providerIds, route.modelOverrides, temperatureOverrides, configuredProviders);
    const contextStyle = namespace.pageUtils.getInputContextStyle(message.contextStyle || "neutral");
    const bypassCache = !!message.bypassCache;
    const url = String(message.url || "");
    const subtitleTranslationDetails = {
      sourceLanguage,
      targetLanguage,
      route,
      temperatureOverrides,
      providerSignature,
      contextStyle,
      bypassCache,
      url,
      subtitleContext: normalizeSubtitleTopicContext(message.subtitleContext),
      configuredProviders
    };

    const translatedItems = [];
    for (const item of items) {
      try {
        const parts = splitSubtitleTextForProvider(item.text);
        const translatedParts = [];
        let firstPicked = null;
        let allFromCache = true;
        let failed = null;
        for (const part of parts) {
          const translated = await translateSubtitleTextPart(part, subtitleTranslationDetails);
          const picked = translated.picked;
          if (!picked || !picked.ok || !String(picked.translatedText || "").trim()) {
            failed = picked || { error: "Translation failed." };
            break;
          }
          if (!firstPicked) {
            firstPicked = picked;
          }
          allFromCache = allFromCache && translated.cached;
          translatedParts.push(String(picked.translatedText || "").trim());
        }
        if (!failed && firstPicked && translatedParts.length) {
          translatedItems.push({
            id: item.id,
            ok: true,
            translatedText: translatedParts.join(" "),
            providerId: firstPicked.providerId,
            providerName: firstPicked.providerName,
            model: firstPicked.model,
            fromCache: allFromCache,
            targetLanguage: firstPicked.targetLanguage || targetLanguage,
            detectedSourceLanguage: firstPicked.detectedSourceLanguage || (sourceLanguage && sourceLanguage.toLowerCase() !== "auto" ? sourceLanguage : "")
          });
        } else {
          translatedItems.push({
            id: item.id,
            ok: false,
            error: failed && failed.error || "Translation failed."
          });
        }
      } catch (error) {
        translatedItems.push({
          id: item.id,
          ok: false,
          error: error && error.message ? error.message : "Translation failed."
        });
      }
    }

    return namespace.messages.ok({
      items: translatedItems,
      targetLanguage,
      sourceLanguage: sourceLanguage || "auto"
    });
  }

  function mergeSubtitleAnnotations(annotations, maxItems) {
    const seen = new Set();
    const limit = namespace.videoSubtitleUtils.normalizeSubtitleLearningMaxItems(maxItems);
    const result = [];
    (Array.isArray(annotations) ? annotations : []).forEach((item) => {
      if (!item || !item.term || !item.meaning) {
        return;
      }
      const key = String(item.term || "").trim().toLowerCase();
      if (!key || seen.has(key)) {
        return;
      }
      seen.add(key);
      result.push(item);
    });
    return result.slice(0, limit);
  }

  async function annotateSubtitleTextPart(partText, details) {
    const request = {
      task: "subtitle-annotations",
      text: partText,
      displayText: partText,
      sourceLanguage: details.sourceLanguage && details.sourceLanguage.toLowerCase() !== "auto" ? details.sourceLanguage : "",
      targetLanguage: details.targetLanguage,
      sourceLanguageDetected: details.sourceLanguage && details.sourceLanguage.toLowerCase() !== "auto" ? details.sourceLanguage : "",
      dictionaryModeForSingleWord: false,
      preserveRichTextFormatting: false,
      contextStyle: details.contextStyle,
      url: details.url,
      learningLevelSystem: details.learningLevelSystem,
      learningLevel: details.learningLevel,
      maxAnnotations: details.maxAnnotations,
      annotationTypes: details.annotationTypes,
      subtitleContext: details.subtitleContext
    };
    const key = subtitleAnnotationCacheKey(
      request.text,
      request.sourceLanguage || request.sourceLanguageDetected || "auto",
      request.targetLanguage,
      details.providerSignature,
      details.learningLevelSystem,
      details.learningLevel,
      details.maxAnnotations,
      details.annotationTypes,
      request.subtitleContext
    );
    const cached = details.bypassCache ? null : getCached(key);
    const results = cached || await namespace.providerRegistry.translate(
      request,
      details.route.providerIds,
      details.route.modelOverrides,
      details.temperatureOverrides,
      details.configuredProviders
    );
    const resultsWithLanguages = attachRequestLanguagesToResults(results, request);
    if (!cached) {
      setCache(key, resultsWithLanguages);
    }
    let picked = null;
    let annotations = [];
    const resultList = Array.isArray(resultsWithLanguages) ? resultsWithLanguages : [];
    for (const result of resultList) {
      if (!result || !result.ok) {
        continue;
      }
      const annotationText = String(result.translatedText || "").trim();
      const parsedAnnotations = annotationText
        ? namespace.videoSubtitleUtils.parseSubtitleAnnotationResponse(annotationText, { maxItems: details.maxAnnotations })
        : [];
      if (!picked) {
        picked = result;
        annotations = parsedAnnotations;
      }
      if (parsedAnnotations.length) {
        picked = result;
        annotations = parsedAnnotations;
        break;
      }
    }
    if (!picked) {
      picked = pickFirstSubtitleAnnotation(resultsWithLanguages);
    }
    return {
      picked,
      annotations,
      request,
      cached: !!cached
    };
  }

  async function handleAnnotateSubtitleBatch(message) {
    const items = normalizeSubtitleBatchItems(message.items || message.cues || []);
    if (!items.length) {
      return namespace.messages.ok({ items: [] });
    }

    const [settings, configuredProviders] = await Promise.all([
      namespace.configManager.getSettings(),
      namespace.providerRegistry.buildConfiguredProviders()
    ]);
    const targetLanguage = String(message.targetLanguage || settings.targetLanguage || "en").trim();
    const sourceLanguage = String(message.sourceLanguage || "").trim();
    const profile = namespace.videoSubtitleUtils.resolveSubtitleLearningProfile(settings, sourceLanguage);
    const route = resolveEffectiveRoute(message.providerIds || [], message.modelOverrides || {}, settings, configuredProviders);
    const routeProviders = getRouteProviderConfigs(route, configuredProviders);
    if (routeProviders.length && !routeProviders.some(providerSupportsSubtitleAnnotations)) {
      return namespace.messages.error("Learning subtitle annotations require an AI text-generation provider. Select an LLM provider in Options.");
    }
    const temperatureOverrides = resolveTemperatureOverrides(
      route.providerIds,
      route.modelOverrides,
      message.temperatureOverrides || {},
      configuredProviders
    );
    const providerSignature = buildProviderSignature(route.providerIds, route.modelOverrides, temperatureOverrides, configuredProviders);
    const contextStyle = namespace.pageUtils.getInputContextStyle(message.contextStyle || "neutral");
    const maxAnnotations = namespace.videoSubtitleUtils.normalizeSubtitleLearningMaxItems(
      message.maxAnnotations || profile.maxItems
    );
    const annotationTypes = namespace.videoSubtitleUtils.normalizeSubtitleAnnotationTypes(
      message.annotationTypes || profile.annotationTypes
    );
    const annotationDetails = {
      sourceLanguage,
      targetLanguage,
      learningLevelSystem: String(message.learningLevelSystem || profile.levelSystem || "CEFR"),
      learningLevel: String(message.learningLevel || profile.level || "B1"),
      maxAnnotations,
      annotationTypes,
      route,
      temperatureOverrides,
      providerSignature,
      contextStyle,
      bypassCache: !!message.bypassCache,
      url: String(message.url || ""),
      subtitleContext: normalizeSubtitleTopicContext(message.subtitleContext),
      configuredProviders
    };

    const annotatedItems = [];
    for (const item of items) {
      try {
        const parts = splitSubtitleTextForProvider(item.text);
        let firstPicked = null;
        let allFromCache = true;
        let failed = null;
        let annotations = [];
        for (const part of parts) {
          const annotated = await annotateSubtitleTextPart(part, annotationDetails);
          const picked = annotated.picked;
          if (!picked || !picked.ok) {
            failed = picked || { error: "Subtitle annotation failed." };
            break;
          }
          if (!firstPicked) {
            firstPicked = picked;
          }
          allFromCache = allFromCache && annotated.cached;
          annotations = mergeSubtitleAnnotations(annotations.concat(annotated.annotations), maxAnnotations);
          if (annotations.length >= maxAnnotations) {
            break;
          }
        }
        if (!failed && firstPicked) {
          annotatedItems.push({
            id: item.id,
            ok: true,
            translatedText: namespace.videoSubtitleUtils.formatSubtitleAnnotations(annotations, { maxItems: maxAnnotations }),
            annotations,
            providerId: firstPicked.providerId,
            providerName: firstPicked.providerName,
            model: firstPicked.model,
            fromCache: allFromCache,
            targetLanguage: firstPicked.targetLanguage || targetLanguage,
            detectedSourceLanguage: firstPicked.detectedSourceLanguage || (sourceLanguage && sourceLanguage.toLowerCase() !== "auto" ? sourceLanguage : ""),
            learningLevelSystem: annotationDetails.learningLevelSystem,
            learningLevel: annotationDetails.learningLevel,
            annotationTypes: annotationDetails.annotationTypes
          });
        } else {
          annotatedItems.push({
            id: item.id,
            ok: false,
            error: failed && failed.error || "Subtitle annotation failed."
          });
        }
      } catch (error) {
        annotatedItems.push({
          id: item.id,
          ok: false,
          error: error && error.message ? error.message : "Subtitle annotation failed."
        });
      }
    }

    return namespace.messages.ok({
      items: annotatedItems,
      targetLanguage,
      sourceLanguage: sourceLanguage || "auto",
      learningLevelSystem: annotationDetails.learningLevelSystem,
      learningLevel: annotationDetails.learningLevel,
      annotationTypes: annotationDetails.annotationTypes
    });
  }

  function applyRequestLanguageMetadata(event, request) {
    if (!event || typeof event !== "object") {
      return event;
    }

    if (event.event === "provider-chunk") {
      return Object.assign({}, event, {
        targetLanguage: request.targetLanguage,
        detectedSourceLanguage: request.sourceLanguageDetected || ""
      });
    }

    if (event.event === "provider-complete" && event.result) {
      return Object.assign({}, event, {
        result: attachRequestLanguages(event.result, request)
      });
    }

    return event;
  }

  function postCachedStreamResults(port, cachedResults, request) {
    cachedResults.forEach((result) => {
      port.postMessage({
        event: "provider-start",
        providerId: result.providerId,
        providerName: result.providerName,
        model: result.model,
        prompt: result.prompt || "",
        fromCache: true,
        targetLanguage: result.targetLanguage || request.targetLanguage,
        detectedSourceLanguage: result.detectedSourceLanguage || request.sourceLanguageDetected || ""
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
          fromCache: true,
          targetLanguage: result.targetLanguage || request.targetLanguage,
          detectedSourceLanguage: result.detectedSourceLanguage || request.sourceLanguageDetected || ""
        });
        port.postMessage({
          event: "provider-complete",
          providerId: result.providerId,
          providerName: result.providerName,
          model: result.model,
          result: Object.assign({}, result, {
            fromCache: true,
            targetLanguage: result.targetLanguage || request.targetLanguage,
            detectedSourceLanguage: result.detectedSourceLanguage || request.sourceLanguageDetected || ""
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
        postCachedStreamResults(port, ctx.cached, ctx.request);
        return;
      }

      const results = await namespace.providerRegistry.streamTranslate(ctx.request, ctx.providerIds, ctx.modelOverrides, (event) => {
        try {
          port.postMessage(applyRequestLanguageMetadata(event, ctx.request));
        } catch (_) {}
      }, ctx.temperatureOverrides, signal, ctx.configuredProviders);

      // Only cache and record history if the translation was not cancelled.
      if (!signal || !signal.aborted) {
        const resultsWithLanguages = attachRequestLanguagesToResults(results, ctx.request);
        setCache(ctx.key, resultsWithLanguages);
        await appendTranslationHistory(ctx.request, resultsWithLanguages, ctx.settings);
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
        const [settings, providerConfigs, history, siteRules] = await Promise.all([
          namespace.configManager.getSettings(),
          namespace.configManager.getDecryptedProviderConfigs(),
          namespace.configManager.getHistory(),
          namespace.configManager.getSiteRules()
        ]);
        return namespace.messages.ok({
          settings,
          providers: namespace.providerRegistry.listProviders(),
          providerConfigs,
          history,
          siteRules
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
      case messageTypes.fetchYouTubeSubtitleTrack:
        return handleFetchYouTubeSubtitleTrack(message);
      case messageTypes.translateSubtitleBatch:
        return handleTranslateSubtitleBatch(message);
      case messageTypes.annotateSubtitleBatch:
        return handleAnnotateSubtitleBatch(message);
      case messageTypes.senseSubtitleTopicContext:
        return handleSenseSubtitleTopicContext(message);
      case messageTypes.translateSubtitleWord:
        return handleTranslateSubtitleWord(message);
      case messageTypes.openComparePage:
        await openComparePage(message.providerId || "");
        return namespace.messages.ok();
      case messageTypes.getSiteRules: {
        const siteRules = await namespace.configManager.getSiteRules();
        return namespace.messages.ok({ siteRules });
      }
      case messageTypes.saveSiteRules: {
        const siteRules = await namespace.configManager.saveSiteRules(message.siteRules || []);
        return namespace.messages.ok({ siteRules });
      }
      case messageTypes.saveSiteRuleFromPicker: {
        const result = await namespace.configManager.saveSiteRuleFromPicker({
          hostPattern: message.hostPattern,
          selector: message.selector,
          mode: message.mode
        });
        return namespace.messages.ok(result);
      }
      case messageTypes.deleteSiteRule: {
        const siteRules = await namespace.configManager.deleteSiteRule(message.ruleId);
        return namespace.messages.ok({ siteRules });
      }
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

    const frameOptions = getFrameOptions(info.frameId);
    const message = getContextMenuMessage(info);

    if (!message) {
      return;
    }

    try {
      await sendContextMenuMessage(tab.id, message, frameOptions);
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
