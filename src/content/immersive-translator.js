(function initImmersiveTranslator(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const { storageKeys } = namespace.constants;
  const scanner = namespace.domTextScanner;
  const renderer = namespace.inlineTranslationRenderer;

  let itemByElement = new WeakMap();
  const trackedItems = new Set();
  const queuedItems = [];
  const activeItems = new Set();

  const state = {
    enabled: false,
    settings: null,
    getSettings: null,
    scanTimer: 0,
    mutationObserver: null,
    intersectionObserver: null,
    siteRules: [],
    storageListenerAttached: false,
    disposed: false
  };

  function normalizeSettings(settings) {
    const cfg = settings || {};
    const minTextLength = Math.max(8, Math.min(500, Number(cfg.immersiveTranslationMinTextLength || 32)));
    const maxConcurrent = Math.max(1, Math.min(4, Number(cfg.immersiveTranslationMaxConcurrent || 2)));
    return Object.assign({}, cfg, {
      immersiveTranslationEnabled: cfg.immersiveTranslationEnabled !== false,
      immersiveTranslationAutoTranslate: !!cfg.immersiveTranslationAutoTranslate,
      immersiveTranslationVisibleOnly: cfg.immersiveTranslationVisibleOnly !== false,
      immersiveTranslationDisplayMode: cfg.immersiveTranslationDisplayMode === "compact" ? "compact" : "below-original",
      immersiveTranslationMinTextLength: minTextLength,
      immersiveTranslationMaxConcurrent: maxConcurrent
    });
  }

  function isPageSupported() {
    const protocol = window.location.protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "file:";
  }

  function scheduleScan(delay) {
    if (!state.enabled || state.disposed) {
      return;
    }
    if (state.scanTimer) {
      clearTimeout(state.scanTimer);
    }
    state.scanTimer = setTimeout(() => {
      state.scanTimer = 0;
      scanPage();
    }, Number(delay || 120));
  }

  function disconnectObservers() {
    if (state.mutationObserver) {
      state.mutationObserver.disconnect();
      state.mutationObserver = null;
    }
    if (state.intersectionObserver) {
      state.intersectionObserver.disconnect();
      state.intersectionObserver = null;
    }
  }

  function setupMutationObserver() {
    if (state.mutationObserver || !document.body) {
      return;
    }
    function isIgnoredMutationTarget(node) {
      const element = node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement;
      return !!element && (
        element.closest?.(".mt-immersive-translation")
          || element.closest?.("#" + namespace.constants.popupId)
          || element.closest?.("#melontranslate-input-button-host")
          || element.closest?.("#melontranslate-input-panel-host")
      );
    }

    state.mutationObserver = new MutationObserver((mutations) => {
      const hasRemovedNodes = mutations.some((mutation) => mutation.type === "childList" && mutation.removedNodes && mutation.removedNodes.length);
      if (hasRemovedNodes && renderer.cleanupDisconnected) {
        renderer.cleanupDisconnected();
      }
      const hasMeaningfulChange = mutations.some((mutation) => (
        mutation.type === "attributes"
          ? (
            mutation.target
            && mutation.target.nodeType === Node.ELEMENT_NODE
            && !isIgnoredMutationTarget(mutation.target)
          )
          : mutation.type === "characterData"
            ? !isIgnoredMutationTarget(mutation.target)
          : Array.from(mutation.addedNodes || []).some((node) => (
            (node.nodeType === Node.ELEMENT_NODE || (node.nodeType === Node.TEXT_NODE && String(node.textContent || "").trim()))
            && !isIgnoredMutationTarget(node)
          ))
      ));
      if (hasMeaningfulChange) {
        scheduleScan(250);
      }
    });
    state.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"]
    });
  }

  function setupIntersectionObserver(settings) {
    if (!settings.immersiveTranslationVisibleOnly || state.intersectionObserver) {
      return;
    }
    state.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        const item = itemByElement.get(entry.target);
        if (item && item.status === "observing") {
          enqueue(item);
        }
        state.intersectionObserver.unobserve(entry.target);
      });
    }, {
      root: null,
      rootMargin: "320px 0px",
      threshold: 0
    });
  }

  function getExistingItem(block) {
    const current = itemByElement.get(block.element);
    if (!current) {
      return null;
    }
    if (current.fingerprint === block.fingerprint) {
      return current;
    }
    if (current.client) {
      current.client.disconnect();
    }
    current.status = "stale";
    renderer.removeForElement(block.element);
    trackedItems.delete(current);
    return null;
  }

  function staleItem(item) {
    if (!item || item.status === "stale") {
      return;
    }
    if (item.client) {
      item.client.disconnect();
      item.client = null;
    }
    item.status = "stale";
    renderer.removeForElement(item.element);
    itemByElement.delete(item.element);
    trackedItems.delete(item);
  }

  async function loadSiteRules() {
    try {
      const response = await api.runtime.sendMessage({ type: namespace.messages.types.getSiteRules });
      return response && response.ok
        ? namespace.siteRuleEngine.normalizeRules(response.data && response.data.siteRules || [])
        : [];
    } catch (_) {
      return [];
    }
  }

  function trackBlock(block, scope) {
    const existing = getExistingItem(block);
    if (existing) {
      return existing;
    }
    const item = {
      element: block.element,
      text: block.text,
      fingerprint: block.fingerprint,
      status: "new",
      client: null,
      translatedText: "",
      renderStrategy: block.renderStrategy || "inside-block",
      contextStyle: scope && scope.contextStyle || "auto"
    };
    itemByElement.set(block.element, item);
    trackedItems.add(item);
    return item;
  }

  function getEffectiveSettingsForScope(settings, scope) {
    const effective = Object.assign({}, settings || {});
    const immersive = scope && scope.immersive && typeof scope.immersive === "object" ? scope.immersive : null;
    if (immersive && typeof immersive.visibleOnly === "boolean") {
      effective.immersiveTranslationVisibleOnly = immersive.visibleOnly;
    }
    if (immersive && immersive.displayMode === "compact") {
      effective.immersiveTranslationDisplayMode = "compact";
    } else if (immersive && immersive.displayMode === "below-original") {
      effective.immersiveTranslationDisplayMode = "below-original";
    }
    return effective;
  }

  function scanPage() {
    if (!state.enabled || !document.body) {
      return;
    }
    const scope = namespace.siteRuleEngine.getImmersiveScope(window.location.href, state.siteRules || []);
    const effectiveSettings = getEffectiveSettingsForScope(state.settings, scope);
    setupIntersectionObserver(effectiveSettings);
    const roots = namespace.siteRuleEngine.getIncludeRoots(document, scope);
    const hasIncludeRoots = !!(scope.includeSelectors && scope.includeSelectors.length);
    const seenElements = new Set();
    const blocks = roots.flatMap((rootNode) => scanner.collectTextBlocks(rootNode, {
      minTextLength: effectiveSettings.immersiveTranslationMinTextLength,
      maxTextLength: namespace.constants.maxSelectionLength,
      excludeSelectors: scope.excludeSelectors,
      explicitRoot: hasIncludeRoots
    })).filter((block) => {
      if (!block || seenElements.has(block.element)) {
        return false;
      }
      seenElements.add(block.element);
      return true;
    });
    const blockElements = blocks.map((block) => block.element);
    trackedItems.forEach((item) => {
      if (!item || item.status === "stale") {
        trackedItems.delete(item);
        return;
      }
      if (!item.element.isConnected) {
        staleItem(item);
        return;
      }
      if (seenElements.has(item.element)) {
        return;
      }
      if (blockElements.some((element) => element !== item.element && item.element.contains(element))) {
        staleItem(item);
      }
    });
    blocks.forEach((block) => {
      const item = trackBlock(block, scope);
      if (!item || item.status !== "new") {
        return;
      }
      item.settings = effectiveSettings;
      if (effectiveSettings.immersiveTranslationVisibleOnly && state.intersectionObserver) {
        item.status = "observing";
        state.intersectionObserver.observe(item.element);
      } else {
        enqueue(item);
      }
    });
    processQueue();
  }

  function enqueue(item) {
    if (!state.enabled || !item || !item.element.isConnected) {
      return;
    }
    if (item.status === "queued" || item.status === "running" || item.status === "done") {
      return;
    }
    item.status = "queued";
    queuedItems.push(item);
    processQueue();
  }

  function processQueue() {
    if (!state.enabled) {
      return;
    }
    const limit = state.settings.immersiveTranslationMaxConcurrent || 2;
    while (activeItems.size < limit && queuedItems.length) {
      const item = queuedItems.shift();
      if (!item || !item.element.isConnected || item.status !== "queued") {
        continue;
      }
      runTranslation(item);
    }
  }

  async function runTranslation(item) {
    item.status = "running";
    activeItems.add(item);
    const settings = item.settings || state.settings;
    renderer.renderLoading(item, settings);
    const client = namespace.translationClient.create();
    item.client = client;

    try {
      const result = await client.request(item.text, {
        targetLanguage: state.settings.targetLanguage || "en",
        sourceLanguage: "auto",
        contextStyle: item.contextStyle || settings.immersiveTranslationContextStyle || "auto",
        dictionaryModeForSingleWord: false,
        url: window.location.href
      });
      if (!state.enabled || item.status === "stale" || !item.element.isConnected) {
        return;
      }
      const translatedText = String(result && result.translatedText || "").trim();
      if (!translatedText) {
        throw new Error("Translation returned an empty result.");
      }
      if (scanner.normalizeText(translatedText) === scanner.normalizeText(item.text)) {
        item.status = "done";
        item.translatedText = "";
        renderer.removeForElement(item.element);
        return;
      }
      item.status = "done";
      item.translatedText = translatedText;
      renderer.renderTranslation(item, translatedText, settings);
    } catch (error) {
      if (!state.enabled || item.status === "stale" || !item.element.isConnected) {
        return;
      }
      item.status = "error";
      renderer.renderError(item, error && error.message ? error.message : "Translation failed.", settings, retryItem);
    } finally {
      item.client = null;
      activeItems.delete(item);
      processQueue();
    }
  }

  function retryItem(item) {
    if (!item || !state.enabled) {
      return;
    }
    item.status = "new";
    renderer.removeForElement(item.element);
    enqueue(item);
  }

  function activate(settings) {
    if (!isPageSupported()) {
      return;
    }
    state.settings = normalizeSettings(settings);
    if (!state.settings.immersiveTranslationEnabled) {
      deactivate();
      return;
    }
    state.enabled = true;
    renderer.ensureStyle();
    setupMutationObserver();
    scheduleScan(0);
  }

  function deactivate() {
    state.enabled = false;
    if (state.scanTimer) {
      clearTimeout(state.scanTimer);
      state.scanTimer = 0;
    }
    disconnectObservers();
    queuedItems.splice(0, queuedItems.length);
    activeItems.forEach((item) => {
      item.status = "stale";
      if (item.client) {
        item.client.disconnect();
        item.client = null;
      }
    });
    activeItems.clear();
    itemByElement = new WeakMap();
    trackedItems.clear();
    renderer.clearAll();
  }

  async function refreshFromSettings() {
    if (!state.getSettings) {
      return;
    }
    const settings = normalizeSettings(await state.getSettings());
    state.siteRules = await loadSiteRules();
    if (settings.immersiveTranslationEnabled && settings.immersiveTranslationAutoTranslate) {
      activate(settings);
    } else {
      state.settings = settings;
      deactivate();
    }
  }

  function attachStorageListener() {
    if (state.storageListenerAttached || !api.storage || !api.storage.onChanged) {
      return;
    }
    state.storageListenerAttached = true;
    api.storage.onChanged((changes, areaName) => {
      if (areaName === "sync" && changes && changes[storageKeys.settings]) {
        const nextSettings = normalizeSettings(changes[storageKeys.settings].newValue || {});
        if (!nextSettings.immersiveTranslationEnabled) {
          state.settings = nextSettings;
          deactivate();
          return;
        }
        if (!nextSettings.immersiveTranslationAutoTranslate) {
          state.settings = nextSettings;
          deactivate();
          return;
        }
        deactivate();
        activate(nextSettings);
        return;
      }

      if (areaName === "local" && changes && changes[storageKeys.siteRules]) {
        state.siteRules = namespace.siteRuleEngine.normalizeRules(changes[storageKeys.siteRules].newValue || []);
        if (state.enabled && state.settings) {
          const currentSettings = state.settings;
          deactivate();
          activate(currentSettings);
        }
      }
    });
  }

  async function translateCurrentPage() {
    if (!state.getSettings) {
      return { started: false, reason: "Settings are not ready." };
    }
    const settings = normalizeSettings(await state.getSettings());
    state.siteRules = await loadSiteRules();
    if (!settings.immersiveTranslationEnabled) {
      return { started: false, reason: "Immersive translation is disabled." };
    }
    deactivate();
    activate(settings);
    return { started: true };
  }

  function start(getSettings) {
    state.getSettings = getSettings;
    attachStorageListener();
    refreshFromSettings().catch(() => {});
  }

  namespace.immersiveTranslator = {
    start,
    refresh: refreshFromSettings,
    translateCurrentPage,
    stop: deactivate
  };
}(globalThis));
