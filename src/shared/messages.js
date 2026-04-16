(function initMessages(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};

  namespace.messages = {
    types: {
      getSettings: "GET_SETTINGS",
      getOptionsBootstrap: "GET_OPTIONS_BOOTSTRAP",
      saveOptions: "SAVE_OPTIONS",
      getProviderModels: "GET_PROVIDER_MODELS",
      translateStream: "TRANSLATE_STREAM",
      readAloud: "READ_ALOUD",
      manualTranslateSelection: "MANUAL_TRANSLATE_SELECTION",
      openComparePage: "OPEN_COMPARE_PAGE",
      clearHistory: "CLEAR_HISTORY",
      getHistory: "GET_HISTORY"
    },
    ok(data) {
      return { ok: true, data: data || null };
    },
    error(message, details) {
      return { ok: false, error: { message, details: details || null } };
    }
  };
}(globalThis));