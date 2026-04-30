(function initConstants(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};

  namespace.constants = {
    storageKeys: {
      settings: "settings",
      providerConfigs: "providerConfigs",
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
    selectionTriggers: {
      auto: "auto",
      modifier: "modifier",
      manual: "manual"
    },
    inputSiteModes: {
      blacklist: "blacklist",
      whitelist: "whitelist"
    },
    inputContextStyles: [
      { id: "auto", label: "Auto" },
      { id: "casual-comment", label: "Casual chat/comment" },
      { id: "formal-academic", label: "Formal academic/professional" }
    ],
    modifierKeys: ["Alt", "Control", "Shift", "Meta"],
    modelCacheTtlMs: 24 * 60 * 60 * 1000,
    maxFavoriteModelsPerProvider: 50,
    historyLimit: 100,
    maxSelectionLength: 4000,
    popupId: "melontranslate-popup-host",
    modelTemperatureDefault: 0.8,
    modelTemperatureMax: 2
  };
}(globalThis));
