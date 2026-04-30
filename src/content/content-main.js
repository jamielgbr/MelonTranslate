(function initContentMain(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const messageTypes = namespace.messages.types;
  const requestState = {
    lastSelectionData: null
  };
  const selectionTranslationClient = namespace.translationClient.create({
    onChunk(chunk, meta) {
      namespace.popupRenderer.appendChunk(chunk, meta);
    }
  });

  async function getSettings() {
    const response = await api.runtime.sendMessage({ type: messageTypes.getSettings });
    if (!response || !response.ok) {
      throw new Error(response?.error?.message || "Could not load settings.");
    }
    return response.data.settings;
  }

  async function translateSelection(selectionData, options) {
    const runtimeOptions = Object.assign({}, options || {});
    if (!runtimeOptions.targetLanguage) {
      const settings = await getSettings();
      runtimeOptions.targetLanguage = settings.targetLanguage || "en";
    }
    if (!runtimeOptions.sourceLanguage) {
      runtimeOptions.sourceLanguage = "auto";
    }
    requestState.lastSelectionData = selectionData;
    namespace.popupRenderer.show({
      sourceText: selectionData.text,
      rect: selectionData.rect,
      targetLanguage: runtimeOptions.targetLanguage,
      sourceLanguage: runtimeOptions.sourceLanguage
    });
    namespace.popupRenderer.bindRefresh(() => {
      const retrySelection = requestState.lastSelectionData;
      if (retrySelection) {
        const languageValues = namespace.popupRenderer.getLanguageValues();
        translateSelection(retrySelection, Object.assign({}, languageValues, { bypassCache: true }));
      }
    });
    try {
      const result = await selectionTranslationClient.request(selectionData.text, runtimeOptions);
      namespace.popupRenderer.setResult(result);
    } catch (error) {
      const category = error.category ? error.category() : "network";
      namespace.popupRenderer.setError(error.message, category);
    }
  }

  namespace.selectionDetector.start(getSettings, translateSelection);
  if (namespace.inputTranslator) {
    namespace.inputTranslator.start(getSettings);
  }

  namespace.popupRenderer.onHide(() => {
    selectionTranslationClient.disconnect();
  });

  api.runtime.onMessage(async (message) => {
    if (message.type === messageTypes.manualTranslateEditable && namespace.inputTranslator) {
      const opened = await namespace.inputTranslator.openFromContextMenu();
      return opened ? namespace.messages.ok() : namespace.messages.error("There is no editable text to translate.");
    }

    if (message.type === messageTypes.manualTranslateSelection) {
      const selected = namespace.selectionDetector.getSelectionData();
      const selectionData = selected || {
        text: (message.text || "").trim(),
        rect: {
          left: window.innerWidth / 2 - 180,
          top: 80,
          width: 360,
          height: 40,
          bottom: 120
        }
      };

      if (selectionData.text) {
        translateSelection(selectionData);
      }

      return namespace.messages.ok();
    }

    return undefined;
  });
}(globalThis));
