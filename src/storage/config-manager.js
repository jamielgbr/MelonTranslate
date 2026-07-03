(function initConfigManager(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const { storageKeys, selectionTriggers, modifierKeys } = namespace.constants;
  const mp = namespace.modelParams;
  const mc = namespace.modelCapabilities;
  const providerIdAliases = {
    gateway: "vercelai",
    silicon: "sicflow"
  };

  function normalizeProviderId(providerId) {
    const id = String(providerId || "").trim();
    return providerIdAliases[id] || id;
  }

  function normalizeDefaultModelKey(modelKey) {
    const raw = String(modelKey || "");
    const separatorIndex = raw.indexOf("::");
    if (separatorIndex <= 0) {
      return raw;
    }
    const providerId = normalizeProviderId(raw.slice(0, separatorIndex));
    return `${providerId}${raw.slice(separatorIndex)}`;
  }

  function normalizeChoice(value, allowed, fallback) {
    const normalized = String(value || "").trim();
    return Array.isArray(allowed) && allowed.includes(normalized) ? normalized : fallback;
  }

  function normalizeUiLanguage(value) {
    const options = (namespace.constants.uiLanguageOptions || []).map((item) => item.id);
    return normalizeChoice(value, options, "auto");
  }

  function normalizeVideoSubtitleDisplayMode(value) {
    const modes = (namespace.constants.videoSubtitleDisplayModes || []).map((item) => item.id);
    return normalizeChoice(value, modes, "translation");
  }

  function normalizeInputButtonStyle(value) {
    const styles = (namespace.constants.inputButtonStyles || []).map((item) => item.id);
    return normalizeChoice(value, styles, "auto");
  }

  function normalizeInputButtonIconPosition(value) {
    const positions = (namespace.constants.inputButtonIconPositions || []).map((item) => item.id);
    return normalizeChoice(value, positions, "inside-right");
  }

  function normalizeInputButtonTabPosition(value) {
    const positions = (namespace.constants.inputButtonTabPositions || []).map((item) => item.id);
    return normalizeChoice(value, positions, "bottom-right");
  }

  function normalizeInputButtonHorizontalOffset(value) {
    return clampInteger(value, 0, -80, 80);
  }

  function normalizeVideoSubtitleLearningLevel(kind, value, fallback) {
    const levels = namespace.constants.videoSubtitleLearningLevels || {};
    return normalizeChoice(value, levels[kind] || [], fallback);
  }

  function normalizeVideoSubtitleAnnotationTypes(value) {
    const allowed = new Set((namespace.constants.videoSubtitleAnnotationTypes || []).map((item) => item.id));
    const source = Array.isArray(value) ? value : [value];
    const normalized = source
      .map((item) => String(item || "").trim())
      .filter((item) => allowed.has(item));
    if (!normalized.length || normalized.includes("any")) {
      return ["any"];
    }
    return Array.from(new Set(normalized));
  }

  function normalizeVideoSubtitleSiteRule(rule, index) {
    const value = rule && typeof rule === "object" ? rule : {};
    const hostPattern = String(value.hostPattern || "").trim().toLowerCase();
    const urlSelector = String(value.urlSelector || "").trim();
    if (!hostPattern || !urlSelector) {
      return null;
    }
    const id = String(value.id || `video-subtitle-rule-${index || 0}`).trim().slice(0, 120);
    const urlAttribute = String(value.urlAttribute || "src").trim().slice(0, 60) || "src";
    return {
      id,
      enabled: value.enabled !== false,
      name: String(value.name || "").trim().slice(0, 100),
      hostPattern: hostPattern.slice(0, 180),
      urlSelector: urlSelector.slice(0, 300),
      urlAttribute,
      languageCode: String(value.languageCode || "").trim().slice(0, 40),
      label: String(value.label || "").trim().slice(0, 100),
      updatedAt: String(value.updatedAt || "")
    };
  }

  function normalizeVideoSubtitleSiteRules(rules) {
    return (Array.isArray(rules) ? rules : [])
      .slice(0, 50)
      .map(normalizeVideoSubtitleSiteRule)
      .filter(Boolean);
  }

  function clampInteger(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  function normalizeSettings(settings) {
    const merged = Object.assign(getDefaultSettings(), settings || {});
    return Object.assign({}, merged, {
      defaultTranslationProviderId: normalizeProviderId(merged.defaultTranslationProviderId),
      defaultTranslationModelKey: normalizeDefaultModelKey(merged.defaultTranslationModelKey),
      uiLanguage: normalizeUiLanguage(merged.uiLanguage),
      inputInlineButtonStyle: normalizeInputButtonStyle(merged.inputInlineButtonStyle),
      inputInlineButtonIconPosition: normalizeInputButtonIconPosition(merged.inputInlineButtonIconPosition),
      inputInlineButtonTabPosition: normalizeInputButtonTabPosition(merged.inputInlineButtonTabPosition),
      inputInlineButtonHorizontalOffset: normalizeInputButtonHorizontalOffset(merged.inputInlineButtonHorizontalOffset),
      videoBilingualSubtitlesMode: normalizeVideoSubtitleDisplayMode(merged.videoBilingualSubtitlesMode),
      videoBilingualSubtitlesLearningEnglishLevel: normalizeVideoSubtitleLearningLevel("english", merged.videoBilingualSubtitlesLearningEnglishLevel, "B1"),
      videoBilingualSubtitlesLearningJapaneseLevel: normalizeVideoSubtitleLearningLevel("japanese", merged.videoBilingualSubtitlesLearningJapaneseLevel, "N3"),
      videoBilingualSubtitlesLearningChineseLevel: normalizeVideoSubtitleLearningLevel("chinese", merged.videoBilingualSubtitlesLearningChineseLevel, "HSK3"),
      videoBilingualSubtitlesLearningAnnotationTypes: normalizeVideoSubtitleAnnotationTypes(merged.videoBilingualSubtitlesLearningAnnotationTypes),
      videoBilingualSubtitlesLearningMaxItems: clampInteger(merged.videoBilingualSubtitlesLearningMaxItems, 4, 1, 8),
      videoBilingualSubtitlesWordLookupEnabled: merged.videoBilingualSubtitlesWordLookupEnabled !== false,
      videoBilingualSubtitlesTopicContextEnabled: merged.videoBilingualSubtitlesTopicContextEnabled !== false,
      videoBilingualSubtitlesAutoCorrectAsr: merged.videoBilingualSubtitlesAutoCorrectAsr === true,
      videoBilingualSubtitlesSiteRules: normalizeVideoSubtitleSiteRules(merged.videoBilingualSubtitlesSiteRules)
    });
  }

  function normalizeProviderConfigIds(providerConfigs) {
    const source = providerConfigs && typeof providerConfigs === "object" ? providerConfigs : {};
    const normalized = {};
    Object.entries(source).forEach(([providerId, config]) => {
      const nextProviderId = normalizeProviderId(providerId);
      if (normalized[nextProviderId] && nextProviderId !== providerId) {
        return;
      }
      normalized[nextProviderId] = Object.assign({}, config || {}, { id: nextProviderId });
    });
    return normalized;
  }

  function getDefaultSettings() {
    return {
      selectionTrigger: selectionTriggers.auto,
      modifierKey: modifierKeys[0],
      defaultTranslationProviderId: "",
      defaultTranslationModelKey: "",
      uiLanguage: "auto",
      targetLanguage: (globalThis.navigator && globalThis.navigator.language) || "en",
      secondTargetLanguage: "en",
      autoSwitchToSecondTarget: true,
      dictionaryModeForSingleWord: true,
      inputInlineButtonEnabled: true,
      inputInlineButtonStyle: "auto",
      inputInlineButtonIconPosition: "inside-right",
      inputInlineButtonTabPosition: "bottom-right",
      inputInlineButtonHorizontalOffset: 0,
      inputInlineButtonSiteMode: namespace.constants.inputSiteModes.blacklist,
      inputInlineButtonBlockedHosts: [],
      inputInlineButtonAllowedHosts: [],
      defaultInputContextStyle: "auto",
      immersiveTranslationEnabled: true,
      immersiveTranslationAutoTranslate: false,
      immersiveTranslationVisibleOnly: true,
      immersiveTranslationDisplayMode: "below-original",
      immersiveTranslationMinTextLength: 32,
      immersiveTranslationMaxConcurrent: 2,
      immersiveTranslationContextStyle: "auto",
      videoBilingualSubtitlesAutoTranslate: true,
      videoBilingualSubtitlesMode: "translation",
      videoBilingualSubtitlesLearningEnglishLevel: "B1",
      videoBilingualSubtitlesLearningJapaneseLevel: "N3",
      videoBilingualSubtitlesLearningChineseLevel: "HSK3",
      videoBilingualSubtitlesLearningAnnotationTypes: ["any"],
      videoBilingualSubtitlesLearningMaxItems: 4,
      videoBilingualSubtitlesWordLookupEnabled: true,
      videoBilingualSubtitlesTopicContextEnabled: true,
      videoBilingualSubtitlesAutoCorrectAsr: false,
      videoBilingualSubtitlesSkipDefaultTargetSource: true,
      videoBilingualSubtitlesShowPlayerButton: true,
      videoBilingualSubtitlesMaxConcurrentBatches: 2,
      videoBilingualSubtitlesSiteRules: [],
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
        availableModels: [],
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
    const modelsFetchedAt = Number(merged.modelsFetchedAt || 0);
    const availableModels = modelsFetchedAt > 0
      ? mc.normalizeModelList(merged.availableModels || [], {
        source: merged.id,
        updatedAt: modelsFetchedAt
      })
      : [];
    return Object.assign({}, merged, {
      availableModels,
      modelsFetchedAt: availableModels.length ? modelsFetchedAt : 0,
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
      return normalizeSettings(stored[storageKeys.settings]);
    },
    async saveSettings(settings) {
      const api = namespace.browserApi;
      const merged = normalizeSettings(settings);
      await api.storage.set("sync", { [storageKeys.settings]: merged });
      return merged;
    },
    async getProviderConfigs() {
      const api = namespace.browserApi;
      const stored = await api.storage.get("local", storageKeys.providerConfigs);
      const defaults = buildDefaultProviderConfigs();
      const storedProviderConfigs = normalizeProviderConfigIds(stored[storageKeys.providerConfigs]);
      const merged = Object.assign({}, defaults, storedProviderConfigs);
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
      const normalizedProviderConfigs = normalizeProviderConfigIds(providerConfigs);
      const sanitizedEntries = await Promise.all(Object.values(normalizedProviderConfigs).map(async (config) => {
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
            ? mc.normalizeModelList(config.availableModels.slice(0, 500), {
              source: config.id,
              updatedAt: Number.isFinite(config.modelsFetchedAt) ? Number(config.modelsFetchedAt) : Date.now()
            })
            : [],
          favoriteModels: Array.isArray(config.favoriteModels)
            ? config.favoriteModels.slice(0, namespace.constants.maxFavoriteModelsPerProvider)
              .map((item) => mc.normalizeModelId(item))
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
    async getSiteRules() {
      const stored = await namespace.browserApi.storage.get("local", storageKeys.siteRules);
      return namespace.siteRuleEngine.normalizeRules(stored[storageKeys.siteRules] || []);
    },
    async saveSiteRules(siteRules) {
      const normalized = namespace.siteRuleEngine.normalizeRules(siteRules || []);
      await namespace.browserApi.storage.set("local", { [storageKeys.siteRules]: normalized });
      return normalized;
    },
    async saveSiteRule(siteRule) {
      const normalized = namespace.siteRuleEngine.normalizeRule(siteRule);
      if (!normalized) {
        throw new Error("Invalid site rule.");
      }
      const current = await this.getSiteRules();
      const index = current.findIndex((rule) => rule.id === normalized.id);
      const next = index >= 0 ? current.slice() : current.concat(normalized);
      if (index >= 0) {
        next[index] = normalized;
      }
      return {
        rule: normalized,
        siteRules: await this.saveSiteRules(next)
      };
    },
    async saveSiteRuleFromPicker(payload) {
      const current = await this.getSiteRules();
      const result = namespace.siteRuleEngine.mergePickerRule(current, payload || {});
      if (!result.rule) {
        throw new Error("Invalid picker rule.");
      }
      return {
        rule: result.rule,
        siteRules: await this.saveSiteRules(result.siteRules)
      };
    },
    async deleteSiteRule(ruleId) {
      const id = String(ruleId || "").trim();
      const current = await this.getSiteRules();
      const next = current.filter((rule) => rule.id !== id);
      return this.saveSiteRules(next);
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
