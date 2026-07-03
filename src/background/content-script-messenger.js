(function initBackgroundContentMessenger(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};

  function create(api, options) {
    const opts = options || {};
    let contentScriptFiles = null;

    function getContentScriptFiles() {
      if (!contentScriptFiles) {
        const manifest = api.runtime.getManifest ? api.runtime.getManifest() : null;
        const firstContentScript = manifest && Array.isArray(manifest.content_scripts)
          ? manifest.content_scripts[0]
          : null;
        contentScriptFiles = firstContentScript && Array.isArray(firstContentScript.js)
          ? firstContentScript.js.slice()
          : [];
      }
      return contentScriptFiles;
    }

    function isFiniteFrameId(value) {
      return typeof value === "number" && Number.isFinite(value);
    }

    function getFrameOptions(frameId) {
      return isFiniteFrameId(frameId) ? { frameId } : undefined;
    }

    function getScriptTarget(tabId, frameOptions) {
      const frameId = frameOptions && frameOptions.frameId;
      return {
        tabId,
        frameIds: [isFiniteFrameId(frameId) ? frameId : 0]
      };
    }

    function isMissingReceiverError(error) {
      const message = String(error && error.message || error || "");
      return /Could not establish connection|Receiving end does not exist/i.test(message);
    }

    async function frameHasContentScript(tabId, frameOptions) {
      if (!api.scripting || typeof api.scripting.executeScript !== "function") {
        return false;
      }

      const results = await api.scripting.executeScript({
        target: getScriptTarget(tabId, frameOptions),
        func: () => !!(globalThis.MelonTranslate && globalThis.MelonTranslate.contentScriptReady)
      });
      return Array.isArray(results) && results.some((item) => item && item.result === true);
    }

    async function ensureContentScript(tabId, frameOptions) {
      if (!api.scripting || typeof api.scripting.executeScript !== "function") {
        throw new Error("The scripting API is not available in this browser context.");
      }
      if (await frameHasContentScript(tabId, frameOptions).catch(() => false)) {
        return;
      }

      const files = getContentScriptFiles();
      if (!files.length) {
        throw new Error("No content scripts are configured for injection.");
      }

      await api.scripting.executeScript({
        target: getScriptTarget(tabId, frameOptions),
        files
      });
    }

    async function sendContentMessage(tabId, message, frameOptions) {
      try {
        return await api.tabs.sendMessage(tabId, message, frameOptions);
      } catch (error) {
        if (!isMissingReceiverError(error)) {
          throw error;
        }
        await ensureContentScript(tabId, frameOptions);
        return api.tabs.sendMessage(tabId, message, frameOptions);
      }
    }

    async function sendContextMenuMessage(tabId, message, frameOptions) {
      try {
        return await sendContentMessage(tabId, message, frameOptions);
      } catch (error) {
        if (frameOptions
          && frameOptions.frameId !== 0
          && message.type !== opts.manualEditableMessageType) {
          return sendContentMessage(tabId, message, { frameId: 0 });
        }
        throw error;
      }
    }

    return {
      getFrameOptions,
      sendContentMessage,
      sendContextMenuMessage,
      _test: {
        getContentScriptFiles,
        getScriptTarget,
        isMissingReceiverError
      }
    };
  }

  namespace.backgroundContentMessenger = { create };
}(globalThis));
