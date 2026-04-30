(function initConfigManager(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const { storageKeys, selectionTriggers, modifierKeys } = namespace.constants;
  const mp = namespace.modelParams;

  function getDefaultSettings() {
    return {
      selectionTrigger: selectionTriggers.auto,
      modifierKey: modifierKeys[0],
      defaultTranslationProviderId: "",
      defaultTranslationModelKey: "",
      targetLanguage: (globalThis.navigator && globalThis.navigator.language) || "en",
      secondTargetLanguage: "en",
      autoSwitchToSecondTarget: true,
      dictionaryModeForSingleWord: true,
      inputInlineButtonEnabled: true,
      inputInlineButtonSiteMode: namespace.constants.inputSiteModes.blacklist,
      inputInlineButtonBlockedHosts: [],
      inputInlineButtonAllowedHosts: [],
      defaultInputContextStyle: "auto",
      persistHistory: false,
      maxHistoryItems: namespace.constants.historyLimit
    };
  }

  function buildDefaultProviderConfigs() {
    return namespace.providerCatalog.reduce((accumulator, provider) => {
      accumulator[provider.id] = {
        id: provider.id,
        enabled: provider.enabledByDefault,
        model: provider.defaultModel,
        baseUrl: provider.baseUrl,
        availableModels: provider.staticModels ? provider.staticModels.slice() : [],
        favoriteModels: provider.defaultModel ? [provider.defaultModel] : [],
        modelParameters: {},
        modelsFetchedAt: 0,
        modelListAccountId: "",
        encryptedApiKey: "",
        transport: provider.transport,
        experimental: !!provider.experimental,
        extraHeaders: provider.extraHeaders || {}
      };
      return accumulator;
    }, {});
  }

  function normalizeStoredProviderConfig(config, fallback) {
    const source = config && typeof config === "object" ? config : {};
    const base = fallback && typeof fallback === "object" ? fallback : {};
    const merged = Object.assign({}, base, source);
    return Object.assign({}, merged, {
      modelParameters: mp.getProviderModelParameters(merged)
    });
  }

  async function getInstallationSecret() {
    const api = namespace.browserApi;
    const stored = await api.storage.get("local", storageKeys.installationSecret);
    if (stored[storageKeys.installationSecret]) {
      return stored[storageKeys.installationSecret];
    }

    const secret = crypto.randomUUID();
    await api.storage.set("local", { [storageKeys.installationSecret]: secret });
    return secret;
  }

  namespace.configManager = {
    async seedDefaults() {
      const api = namespace.browserApi;
      const [syncState, localState] = await Promise.all([
        api.storage.get("sync", [storageKeys.settings]),
        api.storage.get("local", [storageKeys.providerConfigs])
      ]);

      if (!syncState[storageKeys.settings]) {
        await api.storage.set("sync", { [storageKeys.settings]: getDefaultSettings() });
      }

      if (!localState[storageKeys.providerConfigs]) {
        await api.storage.set("local", { [storageKeys.providerConfigs]: buildDefaultProviderConfigs() });
      }

      await getInstallationSecret();
    },
    async getSettings() {
      const api = namespace.browserApi;
      const stored = await api.storage.get("sync", storageKeys.settings);
      return Object.assign(getDefaultSettings(), stored[storageKeys.settings] || {});
    },
    async saveSettings(settings) {
      const api = namespace.browserApi;
      const merged = Object.assign(getDefaultSettings(), settings || {});
      await api.storage.set("sync", { [storageKeys.settings]: merged });
      return merged;
    },
    async getProviderConfigs() {
      const api = namespace.browserApi;
      const stored = await api.storage.get("local", storageKeys.providerConfigs);
      const defaults = buildDefaultProviderConfigs();
      const merged = Object.assign({}, defaults, stored[storageKeys.providerConfigs] || {});
      Object.keys(merged).forEach((providerId) => {
        merged[providerId] = normalizeStoredProviderConfig(merged[providerId], defaults[providerId] || {});
      });
      return merged;
    },
    async getDecryptedProviderConfigs() {
      const secret = await getInstallationSecret();
      const configs = await this.getProviderConfigs();
      const entries = await Promise.all(Object.values(configs).map(async (config) => {
        let apiKey = "";
        if (config.encryptedApiKey) {
          try {
            apiKey = await namespace.encryption.decryptText(secret, config.encryptedApiKey);
          } catch (error) {
            apiKey = "";
          }
        }
        return [config.id, Object.assign({}, config, { apiKey })];
      }));
      return Object.fromEntries(entries);
    },
    async saveProviderConfigs(providerConfigs) {
      const secret = await getInstallationSecret();
      const sanitizedEntries = await Promise.all(Object.values(providerConfigs).map(async (config) => {
        const encryptedApiKey = config.apiKey
          ? await namespace.encryption.encryptText(secret, config.apiKey)
          : config.encryptedApiKey || "";

        const catalogEntry = namespace.providerCatalog.find((p) => p.id === config.id) || {};
        return [config.id, {
          id: config.id,
          enabled: !!config.enabled,
          model: config.model || "",
          baseUrl: config.baseUrl || "",
          availableModels: Array.isArray(config.availableModels)
            ? config.availableModels.slice(0, 500).map((item) => String(item || "").trim()).filter(Boolean)
            : [],
          favoriteModels: Array.isArray(config.favoriteModels)
            ? config.favoriteModels.slice(0, namespace.constants.maxFavoriteModelsPerProvider)
              .map((item) => String(item || "").trim())
              .filter(Boolean)
            : [],
          modelParameters: mp.getProviderModelParameters(config),
          modelsFetchedAt: Number.isFinite(config.modelsFetchedAt) ? Number(config.modelsFetchedAt) : 0,
          modelListAccountId: config.modelListAccountId || "",
          encryptedApiKey,
          transport: config.transport || "openai-compatible",
          experimental: !!config.experimental,
          extraHeaders: config.extraHeaders !== undefined ? config.extraHeaders : (catalogEntry.extraHeaders || {})
        }];
      }));

      const toPersist = Object.fromEntries(sanitizedEntries);
      await namespace.browserApi.storage.set("local", { [storageKeys.providerConfigs]: toPersist });
      return toPersist;
    },
    async getHistory() {
      const stored = await namespace.browserApi.storage.get("local", storageKeys.translationHistory);
      return stored[storageKeys.translationHistory] || [];
    },
    async appendHistory(entry, settingsOverride) {
      const settings = settingsOverride && typeof settingsOverride === "object"
        ? Object.assign(getDefaultSettings(), settingsOverride)
        : await this.getSettings();
      if (!settings.persistHistory) {
        return [];
      }

      const history = await this.getHistory();
      history.unshift(entry);
      const trimmed = history.slice(0, settings.maxHistoryItems || namespace.constants.historyLimit);
      await namespace.browserApi.storage.set("local", { [storageKeys.translationHistory]: trimmed });
      return trimmed;
    },
    async clearHistory() {
      await namespace.browserApi.storage.set("local", { [storageKeys.translationHistory]: [] });
    }
  };
}(globalThis));
