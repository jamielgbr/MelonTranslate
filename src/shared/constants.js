(function initConstants(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};

  namespace.constants = {
    storageKeys: {
      settings: "settings",
      providerConfigs: "providerConfigs",
      siteRules: "siteRules",
      translationHistory: "translationHistory",
      installationSecret: "installationSecret"
    },
    languageOptions: [
      { code: "en-US", label: "English (United States)" },
      { code: "en", label: "English" },
      { code: "zh-CN", label: "Chinese (Simplified)" },
      { code: "zh-TW", label: "Chinese (Traditional)" },
      { code: "ja", label: "Japanese" },
      { code: "ko", label: "Korean" },
      { code: "fr", label: "French" },
      { code: "de", label: "German" },
      { code: "es", label: "Spanish" },
      { code: "pt-BR", label: "Portuguese (Brazil)" },
      { code: "ru", label: "Russian" },
      { code: "ar", label: "Arabic" }
    ],
    uiLanguageOptions: [
      { id: "auto", label: "Auto (browser language)" },
      { id: "en", label: "English" },
      { id: "ja", label: "日本語" },
      { id: "zh-CN", label: "简体中文" },
      { id: "zh-TW", label: "繁體中文" },
      { id: "fr", label: "Français" },
      { id: "de", label: "Deutsch" },
      { id: "es", label: "Español" },
      { id: "ru", label: "Русский" },
      { id: "pt", label: "Português" }
    ],
    selectionTriggers: {
      auto: "auto",
      modifier: "modifier",
      manual: "manual"
    },
    inputSiteModes: {
      blacklist: "blacklist",
      whitelist: "whitelist"
    },
    inputButtonStyles: [
      { id: "auto", label: "Auto" },
      { id: "icon", label: "Icon" },
      { id: "tab", label: "Tab" },
      { id: "off", label: "Off" }
    ],
    inputButtonIconPositions: [
      { id: "inside-right", label: "Inside right" },
      { id: "outside-left", label: "Outside left" }
    ],
    inputButtonTabPositions: [
      { id: "top-left", label: "Top left" },
      { id: "top", label: "Top" },
      { id: "top-right", label: "Top right" },
      { id: "bottom-right", label: "Bottom right" }
    ],
    inputContextStyles: [
      { id: "auto", label: "Auto" },
      { id: "casual", label: "Casual" },
      { id: "formal", label: "Formal" },
      { id: "neutral", label: "Neutral" }
    ],
    immersiveDisplayModes: [
      { id: "below-original", label: "Below original" },
      { id: "compact", label: "Compact bilingual" }
    ],
    videoSubtitleDisplayModes: [
      { id: "translation", label: "Full translation" },
      { id: "learning", label: "Learning annotations" },
      { id: "manual", label: "Manual" }
    ],
    videoSubtitleLearningLevels: {
      english: ["A1", "A2", "B1", "B2", "C1", "C2"],
      japanese: ["N5", "N4", "N3", "N2", "N1"],
      chinese: ["HSK1", "HSK2", "HSK3", "HSK4", "HSK5", "HSK6"]
    },
    videoSubtitleAnnotationTypes: [
      { id: "any", label: "Any" },
      { id: "noun", label: "Nouns" },
      { id: "verb", label: "Verbs" },
      { id: "adjective", label: "Adjectives" },
      { id: "adverb", label: "Adverbs" },
      { id: "phrase", label: "Phrases" }
    ],
    modifierKeys: ["Alt", "Control", "Shift", "Meta"],
    modelCacheTtlMs: 24 * 60 * 60 * 1000,
    maxFavoriteModelsPerProvider: 50,
    historyLimit: 100,
    maxSelectionLength: 4000,
    popupId: "melontranslate-popup-host",
    modelTemperatureDefault: 0.8,
    modelTemperatureMax: 2,
    modelReasoningEffortDefault: "off",
    modelReasoningEffortOptions: ["off", "low", "medium", "high"]
  };
}(globalThis));
