(function initTranslationClient(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const messageTypes = namespace.messages.types;

  function create(callbacks) {
    const hooks = callbacks || {};
    const state = {
      activePort: null,
      activeRequestId: 0
    };

    function disconnect() {
      if (state.activePort) {
        try {
          state.activePort.disconnect();
        } catch (_) {}
        state.activePort = null;
      }
    }

    function request(text, options) {
      return new Promise((resolve, reject) => {
        const requestId = ++state.activeRequestId;
        disconnect();
        const port = api.runtime.connect({ name: "melontranslate-stream" });
        state.activePort = port;
        let settled = false;
        const opts = options || {};

        // Ping the service worker every 20 s to prevent Chrome MV3 from
        // terminating it during long reasoning-model "thinking" phases.
        const keepAliveTimer = setInterval(() => {
          try { port.postMessage({ type: "keepalive" }); } catch (_) {}
        }, 20000);

        function finish(callback) {
          settled = true;
          clearInterval(keepAliveTimer);
          if (state.activePort === port) {
            state.activePort = null;
          }
          callback();
          port.disconnect();
        }

        function toStreamError(message, fallbackMessage, fallbackCategory) {
          const error = new Error(message || fallbackMessage);
          error.category = () => fallbackCategory || "network";
          return error;
        }

        port.onMessage.addListener((message) => {
          if (requestId !== state.activeRequestId) {
            return;
          }
          if (message.event === "keepalive") {
            return;
          }
          if (message.event === "provider-chunk") {
            if (hooks.onChunk) {
              hooks.onChunk(message.chunk, {
                providerName: message.providerName,
                model: message.model,
                thinkingChunk: message.thinkingChunk,
                targetLanguage: message.targetLanguage,
                detectedSourceLanguage: message.detectedSourceLanguage,
                fromCache: !!message.fromCache,
                outputTokens: message.outputTokens
              });
            }
            return;
          }

          if (message.event === "provider-complete") {
            finish(() => resolve(message.result));
            return;
          }

          if (message.event === "provider-error") {
            finish(() => reject(toStreamError(
              message.error && message.error.error,
              "Translation failed.",
              message.error && message.error.errorCategory
            )));
            return;
          }

          if (message.event === "stream-error") {
            finish(() => reject(toStreamError(
              message.error && message.error.message,
              "Translation failed.",
              message.error && message.error.category
            )));
          }
        });

        port.onDisconnect.addListener(() => {
          clearInterval(keepAliveTimer);
          if (state.activePort === port) {
            state.activePort = null;
          }
          if (!settled && requestId === state.activeRequestId) {
            reject(new Error("The translation stream was disconnected."));
          }
        });

        port.postMessage({
          type: messageTypes.translateStream,
          text,
          targetLanguage: opts.targetLanguage,
          sourceLanguage: opts.sourceLanguage,
          contextStyle: opts.contextStyle,
          dictionaryModeForSingleWord: opts.dictionaryModeForSingleWord,
          plainText: opts.plainText,
          preserveRichTextFormatting: !!opts.preserveRichTextFormatting,
          providerIds: Array.isArray(opts.providerIds) ? opts.providerIds : [],
          modelOverrides: opts.modelOverrides && typeof opts.modelOverrides === "object" ? opts.modelOverrides : {},
          temperatureOverrides: opts.temperatureOverrides && typeof opts.temperatureOverrides === "object" ? opts.temperatureOverrides : {},
          url: opts.url || window.location.href,
          bypassCache: !!opts.bypassCache
        });
      });
    }

    return {
      request,
      disconnect
    };
  }

  namespace.translationClient = { create };
}(globalThis));
