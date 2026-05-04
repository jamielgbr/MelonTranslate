(function initContentMain(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const messageTypes = namespace.messages.types;
  const requestState = {
    lastSelectionData: null,
    activeToken: 0
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
    const requestToken = ++requestState.activeToken;
    const runtimeOptions = Object.assign({}, options || {});
    if (!runtimeOptions.targetLanguage) {
      const settings = await getSettings();
      if (requestToken !== requestState.activeToken) {
        return;
      }
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
      sourceLanguage: runtimeOptions.sourceLanguage,
      revealModelImmediately: !!runtimeOptions.revealModelImmediately
    });
    namespace.popupRenderer.bindRefresh(() => {
      const retrySelection = requestState.lastSelectionData;
      if (retrySelection) {
        const languageValues = namespace.popupRenderer.getLanguageValues();
        const modelValues = namespace.popupRenderer.getModelValues();
        translateSelection(retrySelection, Object.assign({}, languageValues, modelValues, {
          bypassCache: true,
          revealModelImmediately: true
        }));
      }
    });
    namespace.popupRenderer.bindModelChange((modelValues) => {
      const retrySelection = requestState.lastSelectionData;
      if (retrySelection) {
        const languageValues = namespace.popupRenderer.getLanguageValues();
        translateSelection(retrySelection, Object.assign({}, languageValues, modelValues, {
          bypassCache: true,
          revealModelImmediately: true
        }));
      }
    });
    try {
      const result = await selectionTranslationClient.request(selectionData.text, runtimeOptions);
      if (requestToken !== requestState.activeToken) {
        return;
      }
      namespace.popupRenderer.setResult(result);
    } catch (error) {
      if (requestToken !== requestState.activeToken) {
        return;
      }
      const category = error.category ? error.category() : "network";
      namespace.popupRenderer.setError(error.message, category);
    }
  }

  namespace.selectionDetector.start(getSettings, translateSelection);
  if (namespace.inputTranslator) {
    namespace.inputTranslator.start(getSettings);
  }
  if (namespace.immersiveTranslator) {
    namespace.immersiveTranslator.start(getSettings);
  }

  namespace.popupRenderer.onHide(() => {
    requestState.activeToken += 1;
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

    if (message.type === messageTypes.manualTranslateImmersivePage && namespace.immersiveTranslator) {
      const result = await namespace.immersiveTranslator.translateCurrentPage();
      return result && result.started
        ? namespace.messages.ok(result)
        : namespace.messages.error(result && result.reason || "Could not start immersive translation.");
    }

    if (message.type === messageTypes.startElementPicker && namespace.elementPicker) {
      namespace.elementPicker.start();
      return namespace.messages.ok();
    }

    return undefined;
  });
}(globalThis));
