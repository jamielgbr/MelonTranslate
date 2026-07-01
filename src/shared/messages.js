(function initMessages(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};

  namespace.messages = {
    types: {
      getSettings: "GET_SETTINGS",
      getOptionsBootstrap: "GET_OPTIONS_BOOTSTRAP",
      getTranslationModelOptions: "GET_TRANSLATION_MODEL_OPTIONS",
      saveOptions: "SAVE_OPTIONS",
      getProviderModels: "GET_PROVIDER_MODELS",
      translateStream: "TRANSLATE_STREAM",
      readAloud: "READ_ALOUD",
      manualTranslateSelection: "MANUAL_TRANSLATE_SELECTION",
      manualTranslateEditable: "MANUAL_TRANSLATE_EDITABLE",
      manualTranslateImmersivePage: "MANUAL_TRANSLATE_IMMERSIVE_PAGE",
      manualToggleVideoSubtitles: "MANUAL_TOGGLE_VIDEO_SUBTITLES",
      fetchYouTubeSubtitleTrack: "FETCH_YOUTUBE_SUBTITLE_TRACK",
      translateSubtitleBatch: "TRANSLATE_SUBTITLE_BATCH",
      annotateSubtitleBatch: "ANNOTATE_SUBTITLE_BATCH",
      senseSubtitleTopicContext: "SENSE_SUBTITLE_TOPIC_CONTEXT",
      translateSubtitleWord: "TRANSLATE_SUBTITLE_WORD",
      startElementPicker: "START_ELEMENT_PICKER",
      getSiteRules: "GET_SITE_RULES",
      saveSiteRules: "SAVE_SITE_RULES",
      saveSiteRuleFromPicker: "SAVE_SITE_RULE_FROM_PICKER",
      deleteSiteRule: "DELETE_SITE_RULE",
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
