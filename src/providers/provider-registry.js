(function initProviderRegistry(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const getErrorCategory = namespace.providerBase.getErrorCategory;
  const mp = namespace.modelParams;
  const mc = namespace.modelCapabilities;
  const MODEL_TEMPERATURE_DEFAULT = namespace.constants.modelTemperatureDefault;
  const MODEL_TEMPERATURE_MAX = namespace.constants.modelTemperatureMax;

  function getCatalogMap() {
    return Object.fromEntries(namespace.providerCatalog.map((provider) => [provider.id, provider]));
  }

  function providerIsConfigured(provider) {
    if (!provider || !provider.enabled) {
      return false;
    }

    if (provider.requiresApiKey === false) {
      return true;
    }

    return !!String(provider.apiKey || "").trim();
  }

  function instantiateProvider(config) {
    switch (config.transport) {
      case "google-translate":
        return new namespace.googleTranslateProvider.GoogleTranslateProvider(config);
      case "openai-compatible":
        return new namespace.openAICompatibleProvider.OpenAICompatibleProvider(config);
      case "gemini":
        return new namespace.geminiProvider.GeminiProvider(config);
      case "anthropic":
        return new namespace.anthropicProvider.AnthropicProvider(config);
      case "unsupported":
        throw new Error("This provider does not expose a browser-side BYOK API in the current build.");
      default:
        throw new Error(`Unsupported provider transport: ${config.transport}`);
    }
  }

  function buildProviderMeta(providerConfig) {
    return {
      providerId: providerConfig.id,
      providerName: providerConfig.displayName,
      model: providerConfig.model
    };
  }

  function buildProviderEvent(eventName, providerConfig, payload) {
    return Object.assign({ event: eventName }, buildProviderMeta(providerConfig), payload || {});
  }

  function buildProviderError(providerConfig, error, prompt, overrideMessage, overrideCategory) {
    return Object.assign({ ok: false }, buildProviderMeta(providerConfig), {
      error: overrideMessage || (error && error.message) || "Request failed",
      errorCategory: overrideCategory || getErrorCategory(error)
    }, prompt === undefined ? {} : { prompt: prompt });
  }

  function resolveTextModel(providerConfig, preferredModel) {
    const sourceModel = String(preferredModel || "").trim();
    const availableModels = mc.normalizeModelList(providerConfig.availableModels || [], {
      source: providerConfig.id,
      updatedAt: Number(providerConfig.modelsFetchedAt || 0)
    });
    const modelById = Object.fromEntries(availableModels.map((model) => [model.id, model]));

    if (sourceModel) {
      const meta = modelById[sourceModel] || mc.normalizeModelEntry(sourceModel, {
        source: providerConfig.id,
        updatedAt: Number(providerConfig.modelsFetchedAt || 0)
      });
      if (mc.isTextGenerationModel(meta)) {
        return sourceModel;
      }
    }

    const candidates = namespace.pageUtils.normalizeModels([
      ...(Array.isArray(providerConfig.favoriteModels) ? providerConfig.favoriteModels : []),
      ...(providerConfig.model ? [providerConfig.model] : []),
      ...availableModels
    ]);
    return candidates.find((modelId) => {
      const meta = modelById[modelId] || mc.normalizeModelEntry(modelId, {
        source: providerConfig.id,
        updatedAt: Number(providerConfig.modelsFetchedAt || 0)
      });
      return mc.isTextGenerationModel(meta);
    }) || sourceModel;
  }

  function resolveProviderConfig(providerConfig, overrides, tempOverrides) {
    const resolvedModel = resolveTextModel(providerConfig, overrides[providerConfig.id] || providerConfig.model);
    const config = overrides[providerConfig.id]
      ? Object.assign({}, providerConfig, { model: resolvedModel })
      : providerConfig;
    const configWithModel = config.model === resolvedModel
      ? config
      : Object.assign({}, config, { model: resolvedModel });
    const normalizedTemperature = mp.resolveProviderTemperature(
      configWithModel,
      tempOverrides[providerConfig.id],
      resolvedModel,
      MODEL_TEMPERATURE_MAX,
      MODEL_TEMPERATURE_DEFAULT
    );
    const modelMeta = mc.findModelMeta(configWithModel.availableModels || [], resolvedModel) || mc.normalizeModelEntry(resolvedModel, {
      source: configWithModel.id,
      updatedAt: Number(configWithModel.modelsFetchedAt || 0)
    });
    const supportsReasoningEffort = (
      String(configWithModel.transport || "") === "openai-compatible"
      && configWithModel.id !== "groq"
      && (configWithModel.id === "grok" ? mc.isXaiGrokReasoningEffortModel(modelMeta) : mc.isOpenAICompatibleReasoningControlModel(modelMeta))
    ) || (
      String(configWithModel.transport || "") === "anthropic"
      && mc.isAnthropicReasoningControlModel(modelMeta)
    );
    const normalizedReasoningEffort = supportsReasoningEffort
      ? mp.resolveProviderReasoningEffort(
        configWithModel,
        null,
        resolvedModel,
        namespace.constants.modelReasoningEffortDefault || "off"
      )
      : null;
    const resolvedConfig = Object.assign(
      {},
      configWithModel,
      normalizedTemperature === null ? {} : { temperature: normalizedTemperature },
      normalizedReasoningEffort === null ? {} : { reasoningEffort: normalizedReasoningEffort }
    );
    return resolvedConfig;
  }

  function normalizeStreamChunk(chunk) {
    if (typeof chunk === "string") {
      return {
        translatedTextChunk: chunk,
        thinkingChunk: ""
      };
    }

    const value = chunk && typeof chunk === "object" ? chunk : {};
    const outputTokens = Number(value.outputTokens);
    return {
      translatedTextChunk: String(value.translatedTextChunk || ""),
      thinkingChunk: String(value.thinkingChunk || ""),
      outputTokens: Number.isFinite(outputTokens) ? outputTokens : undefined
    };
  }

  namespace.providerRegistry = {
    providerIsConfigured,
    listProviders() {
      return namespace.providerCatalog.slice();
    },
    async _resolveSelection(providerIds, modelOverrides, temperatureOverrides, configuredProviders) {
      const availableProviders = Array.isArray(configuredProviders)
        ? configuredProviders
        : await this.buildConfiguredProviders();
      const overrides = modelOverrides || {};
      const tempOverrides = temperatureOverrides || {};
      const enabledProviders = availableProviders.filter((provider) => providerIsConfigured(provider));
      const selection = providerIds && providerIds.length
        ? enabledProviders.filter((provider) => providerIds.includes(provider.id))
        : enabledProviders.slice(0, 1);
      return { selection, overrides, tempOverrides };
    },
    async buildConfiguredProviders() {
      const catalogMap = getCatalogMap();
      const providerConfigs = await namespace.configManager.getDecryptedProviderConfigs();
      return Object.values(providerConfigs).map((config) => {
        const catalogEntry = catalogMap[config.id];
        return Object.assign({}, config, {
          displayName: catalogEntry ? catalogEntry.displayName : config.id,
          reason: catalogEntry ? catalogEntry.reason : "",
          requiresApiKey: catalogEntry ? catalogEntry.requiresApiKey !== false : true,
          supportsReadAloud: !!(catalogEntry && catalogEntry.supportsReadAloud),
          extraHeaders: config.extraHeaders || (catalogEntry ? catalogEntry.extraHeaders || {} : {})
        });
      });
    },
    async translate(request, providerIds, modelOverrides, temperatureOverrides, configuredProviders) {
      const { selection, overrides, tempOverrides } = await this._resolveSelection(
        providerIds,
        modelOverrides,
        temperatureOverrides,
        configuredProviders
      );

      const tasks = selection.map(async (providerConfig) => {
        const providerConfigWithTemperature = resolveProviderConfig(providerConfig, overrides, tempOverrides);
        try {
          const provider = instantiateProvider(providerConfigWithTemperature);
          const result = await provider.translate(request);
          return Object.assign({ ok: true }, result);
        } catch (error) {
          return buildProviderError(providerConfigWithTemperature, error);
        }
      });

      if (!tasks.length) {
        throw new Error("No enabled providers are configured.");
      }

      return Promise.all(tasks);
    },
    async streamTranslate(request, providerIds, modelOverrides, onEvent, temperatureOverrides, signal, configuredProviders) {
      const { selection, overrides, tempOverrides } = await this._resolveSelection(
        providerIds,
        modelOverrides,
        temperatureOverrides,
        configuredProviders
      );

      if (!selection.length) {
        throw new Error("No enabled providers are configured.");
      }

      const tasks = selection.map(async (providerConfig) => {
        const providerConfigWithTemperature = resolveProviderConfig(providerConfig, overrides, tempOverrides);
        const provider = instantiateProvider(providerConfigWithTemperature);
        const prompt = typeof provider.buildPromptPreview === "function"
          ? provider.buildPromptPreview(request)
          : (typeof provider.buildPrompt === "function" ? provider.buildPrompt(request) : "");

        if (signal && signal.aborted) {
          const abortError = buildProviderError(providerConfigWithTemperature, null, prompt, "Translation cancelled.", "cancelled");
          onEvent(buildProviderEvent("provider-error", providerConfigWithTemperature, { error: abortError }));
          return abortError;
        }

        onEvent(buildProviderEvent("provider-start", providerConfigWithTemperature, { prompt: prompt }));

        try {
          const result = await provider.translateStream(request, (chunk) => {
            const normalizedChunk = normalizeStreamChunk(chunk);
            onEvent(buildProviderEvent("provider-chunk", providerConfigWithTemperature, {
              chunk: normalizedChunk.translatedTextChunk,
              thinkingChunk: normalizedChunk.thinkingChunk,
              outputTokens: normalizedChunk.outputTokens,
              prompt
            }));
          }, signal);

          const finalResult = Object.assign({ ok: true, prompt }, result);
          onEvent(buildProviderEvent("provider-complete", providerConfigWithTemperature, { result: finalResult }));
          return finalResult;
        } catch (error) {
          if (error.name === "AbortError") {
            const abortError = buildProviderError(providerConfigWithTemperature, error, prompt, "Translation cancelled.", "cancelled");
            onEvent(buildProviderEvent("provider-error", providerConfigWithTemperature, { error: abortError }));
            return abortError;
          }
          const finalError = buildProviderError(providerConfigWithTemperature, error, prompt);
          onEvent(buildProviderEvent("provider-error", providerConfigWithTemperature, { error: finalError }));
          return finalError;
        }
      });

      return Promise.all(tasks);
    }
  };
}(globalThis));
