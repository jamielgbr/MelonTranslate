(function initContentMain(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const messageTypes = namespace.messages.types;
  const requestState = {
    activePort: null,
    activeRequestId: 0,
    lastSelectionData: null
  };

  async function getSettings() {
    const response = await api.runtime.sendMessage({ type: messageTypes.getSettings });
    if (!response || !response.ok) {
      throw new Error(response?.error?.message || "Could not load settings.");
    }
    return response.data.settings;
  }

  function disconnectActivePort() {
    if (requestState.activePort) {
      try {
        requestState.activePort.disconnect();
      } catch (_) {}
      requestState.activePort = null;
    }
  }

  async function requestTranslation(text, options) {
    return new Promise((resolve, reject) => {
      const requestId = ++requestState.activeRequestId;
      disconnectActivePort();
      const port = api.runtime.connect({ name: "melontranslate-stream" });
      requestState.activePort = port;
      let settled = false;
      const bypassCache = !!(options && options.bypassCache);
      const targetLanguage = options && options.targetLanguage;
      const sourceLanguage = options && options.sourceLanguage;

      // Ping the service worker every 20 s to prevent Chrome MV3 from
      // terminating it during long reasoning-model "thinking" phases.
      const keepAliveTimer = setInterval(() => {
        try { port.postMessage({ type: "keepalive" }); } catch (_) {}
      }, 20000);

      port.onMessage.addListener((message) => {
        if (requestId !== requestState.activeRequestId) {
          return;
        }
        if (message.event === "keepalive") {
          return;
        }
        if (message.event === "provider-chunk") {
          namespace.popupRenderer.appendChunk(message.chunk, {
            providerName: message.providerName,
            model: message.model,
            thinkingChunk: message.thinkingChunk,
            fromCache: !!message.fromCache,
            outputTokens: message.outputTokens
          });
          return;
        }

        if (message.event === "provider-complete") {
          settled = true;
          clearInterval(keepAliveTimer);
          requestState.activePort = null;
          resolve(message.result);
          port.disconnect();
          return;
        }

        if (message.event === "provider-error") {
          settled = true;
          clearInterval(keepAliveTimer);
          requestState.activePort = null;
          const error = new Error(message.error.error || "Translation failed.");
          error.category = () => message.error.errorCategory || "network";
          reject(error);
          port.disconnect();
          return;
        }

        if (message.event === "stream-error") {
          settled = true;
          clearInterval(keepAliveTimer);
          requestState.activePort = null;
          const error = new Error(message.error.message || "Translation failed.");
          error.category = () => message.error.category || "network";
          reject(error);
          port.disconnect();
        }
      });

      port.onDisconnect.addListener(() => {
        clearInterval(keepAliveTimer);
        if (requestState.activePort === port) {
          requestState.activePort = null;
        }
        if (!settled && requestId === requestState.activeRequestId) {
          reject(new Error("The translation stream was disconnected."));
        }
      });

      port.postMessage({
        type: messageTypes.translateStream,
        text,
        targetLanguage,
        sourceLanguage,
        url: window.location.href,
        bypassCache
      });
    });
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
      const result = await requestTranslation(selectionData.text, runtimeOptions);
      namespace.popupRenderer.setResult(result);
    } catch (error) {
      const category = error.category ? error.category() : "network";
      namespace.popupRenderer.setError(error.message, category);
    }
  }

  namespace.selectionDetector.start(getSettings, translateSelection);

  namespace.popupRenderer.onHide(() => {
    disconnectActivePort();
  });

  api.runtime.onMessage(async (message) => {
    if (message.type !== messageTypes.manualTranslateSelection) {
      return undefined;
    }

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
  });
}(globalThis));
