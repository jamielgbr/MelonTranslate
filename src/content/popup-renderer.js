(function initPopupRenderer(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const messageTypes = namespace.messages.types;
  const shell = namespace.panelShell;
  const popupHostId = namespace.constants.popupId;
  const popupState = {
    dragBound: false,
    viewportBound: false,
    dragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    streamStartedAtMs: 0,
    firstTokenAtMs: 0,
    outputTokens: 0,
    tokPerSec: 0,
    fromCache: false,
    detectedSourceLanguage: "",
    targetLanguage: "",
    currentTranslatedText: "",
    translationExpanded: false,
    translationInProgress: false,
    sourceLanguageDd: null,
    targetLanguageDd: null,
    modelPicker: null,
    modelRevealTimer: null,
    onModelChangeCallback: null,
    onHideCallback: null
  };
  const readAloudState = {
    token: 0,
    audio: null,
    loading: false,
    playing: false
  };
  const sourceReadAloudState = {
    token: 0,
    audio: null,
    loading: false,
    playing: false
  };
  const SPEAK_SVG = namespace.readAloud.SPEAK_SVG;
  const STOP_SVG = namespace.readAloud.STOP_SVG;
  const EXPAND_RESULT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10a1 1 0 0 0 1-1V6h3a1 1 0 0 0 0-2H5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1zm10-6a1 1 0 1 0 0 2h3v3a1 1 0 1 0 2 0V5a1 1 0 0 0-1-1h-4zM5 14a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h4a1 1 0 1 0 0-2H6v-3a1 1 0 0 0-1-1zm14 0a1 1 0 0 0-1 1v3h-3a1 1 0 1 0 0 2h4a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1z" fill="currentColor"/></svg>';
  const COLLAPSE_RESULT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4a1 1 0 0 0-1 1v3H5a1 1 0 0 0 0 2h4a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm6 0a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h4a1 1 0 1 0 0-2h-3V5a1 1 0 0 0-1-1zM5 14a1 1 0 1 0 0 2h3v3a1 1 0 1 0 2 0v-4a1 1 0 0 0-1-1H5zm10 0a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0v-3h3a1 1 0 1 0 0-2h-4z" fill="currentColor"/></svg>';
  const pu = namespace.pageUtils;
  const ra = namespace.readAloud;
  const LONG_SOURCE_THRESHOLD = 520;
  const LONG_TRANSLATION_THRESHOLD = 780;
  const LONG_LINE_THRESHOLD = 7;
  const EXPAND_RESULT_LABEL = "Expand translation";
  const COLLAPSE_RESULT_LABEL = "Exit expanded translation";

  function buildTokenTooltip(firstTokenMs, outputTokens, tokPerSec) {
    return `First token: ${pu.formatMillis(firstTokenMs)}\nOutput: ${outputTokens} tok\n${pu.formatRate(tokPerSec)} tok/s`;
  }

  function ensureHost() {
    return shell.createPanelHost({
      hostId: popupHostId,
      ariaLabel: "Melon Translate",
      title: "Melon Translate",
      titleId: "melontranslate-dlg-title",
      closeLabel: "Close popup",
      extraCss: `
        .panel { min-height: 190px; }
        .header { cursor: move; }
        .panel.is-long {
          width: min(720px, calc(100vw - 24px));
          height: min(620px, calc(100vh - 24px));
          min-height: min(420px, calc(100vh - 24px));
        }
        .panel.is-long .translation-text { font-size: 15px; }
        .panel.is-translation-expanded {
          width: min(720px, calc(100vw - 24px));
          height: min(620px, calc(100vh - 24px));
          min-height: min(360px, calc(100vh - 24px));
          resize: none;
        }
        .panel.is-translation-expanded .header,
        .panel.is-translation-expanded .controls,
        .panel.is-translation-expanded .source-panel,
        .panel.is-translation-expanded .footer {
          display: none;
        }
        .panel.is-translation-expanded .body {
          padding: 0;
          gap: 0;
        }
        .panel.is-translation-expanded .translation-panel {
          min-height: 0;
          border: 0;
          border-radius: 0;
        }
        .panel.is-translation-expanded .translation-header {
          padding: 10px 12px;
          cursor: move;
          user-select: none;
        }
        .panel.is-translation-expanded .translation-scroll {
          padding: 14px 16px 18px;
        }
        .panel.is-translation-expanded .translation-text {
          font-size: 15px;
          line-height: 1.7;
        }
        @media (max-width: 520px) {
          .panel.is-long {
            height: min(560px, calc(100vh - 24px));
            min-height: min(360px, calc(100vh - 24px));
          }
        }`,
      bodyHtml: `
          <div class="controls">
            <div class="control">
              <label for="melontranslate-source-language">Source</label>
              <div class="cdd-lang-wrap" data-role="source-language-container"></div>
              <input type="text" placeholder="Enter a language code" class="hidden" data-role="source-language-custom">
            </div>
            <div class="control">
              <label for="melontranslate-target-language">Target</label>
              <div class="cdd-lang-wrap" data-role="target-language-container"></div>
              <input type="text" placeholder="Enter a language code" class="hidden" data-role="target-language-custom">
            </div>
          </div>
          <details class="source-panel" data-role="source-wrap" open>
            <summary>
              <span class="source-summary-copy">
                <span class="section-label" id="melontranslate-src-label">Source text</span>
                <span class="source-size" data-role="source-size"></span>
              </span>
              <span class="source-summary-actions">
                <button class="speak speak-source hidden" type="button" aria-label="Read source text aloud">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="currentColor"/></svg>
                </button>
                <span class="source-toggle-label" aria-hidden="true"></span>
              </span>
            </summary>
            <div class="source-body">
              <p class="text" data-role="source" aria-labelledby="melontranslate-src-label"></p>
            </div>
          </details>
          <section class="translation-panel" aria-labelledby="melontranslate-trl-label">
            <div class="translation-header">
              <span class="section-label" id="melontranslate-trl-label">Translation</span>
              <div class="translation-actions">
                <button class="speak hidden" type="button" aria-label="Read translation aloud">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="currentColor"/></svg>
                </button>
                <button class="expand" type="button" disabled title="Expand translation" aria-label="Expand translation" aria-pressed="false">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10a1 1 0 0 0 1-1V6h3a1 1 0 0 0 0-2H5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1zm10-6a1 1 0 1 0 0 2h3v3a1 1 0 1 0 2 0V5a1 1 0 0 0-1-1h-4zM5 14a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h4a1 1 0 1 0 0-2H6v-3a1 1 0 0 0-1-1zm14 0a1 1 0 0 0-1 1v3h-3a1 1 0 1 0 0 2h4a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1z" fill="currentColor"/></svg>
                </button>
              </div>
            </div>
            <div class="translation-scroll" data-role="translation-scroll" tabindex="-1">
              <div data-role="error-badge"></div>
              <p class="text translation-text muted" data-role="translation">Translation will appear here...</p>
              <details class="reasoning hidden" data-role="reasoning-wrap">
                <summary class="reasoning-summary">Model reasoning</summary>
                <p class="reasoning-text" data-role="reasoning-text"></p>
              </details>
            </div>
          </section>
        `,
      footerHtml: `
          <span class="meta" data-role="meta"></span>
          <div class="actions">
            <button class="refresh" type="button" aria-label="Refresh">Refresh</button>
            <button class="copy hidden" type="button" aria-label="Copy translation">Copy</button>
          </div>
        `
    });
  }

  function getElements() {
    const host = ensureHost();
    const shadow = host.shadowRoot;
    return {
      host,
      panel: shadow.querySelector(".panel"),
      header: shadow.querySelector(".header"),
      modelContainer: shadow.querySelector('[data-role="model-container"]'),
      source: shadow.querySelector('[data-role="source"]'),
      sourceWrap: shadow.querySelector('[data-role="source-wrap"]'),
      sourceSize: shadow.querySelector('[data-role="source-size"]'),
      targetLanguage: shadow.querySelector('[data-role="target-language"]'),
      targetLanguageCustom: shadow.querySelector('[data-role="target-language-custom"]'),
      sourceLanguage: shadow.querySelector('[data-role="source-language"]'),
      sourceLanguageCustom: shadow.querySelector('[data-role="source-language-custom"]'),
      errorBadge: shadow.querySelector('[data-role="error-badge"]'),
      translation: shadow.querySelector('[data-role="translation"]'),
      translationHeader: shadow.querySelector(".translation-header"),
      translationScroll: shadow.querySelector('[data-role="translation-scroll"]'),
      reasoningWrap: shadow.querySelector('[data-role="reasoning-wrap"]'),
      reasoningText: shadow.querySelector('[data-role="reasoning-text"]'),
      meta: shadow.querySelector('[data-role="meta"]'),
      refresh: shadow.querySelector(".refresh"),
      speak: shadow.querySelector(".speak:not(.speak-source)"),
      speakSource: shadow.querySelector(".speak-source"),
      expand: shadow.querySelector(".expand"),
      copy: shadow.querySelector(".copy"),
      close: shadow.querySelector(".close")
    };
  }

  function countLines(text) {
    return String(text || "").split(/\r\n|\r|\n/).length;
  }

  function isLongContent(sourceText, translatedText) {
    const source = String(sourceText || "");
    const translation = String(translatedText || "");
    return source.length > LONG_SOURCE_THRESHOLD
      || translation.length > LONG_TRANSLATION_THRESHOLD
      || countLines(source) > LONG_LINE_THRESHOLD
      || countLines(translation) > LONG_LINE_THRESHOLD;
  }

  function formatSourceSize(text) {
    const normalized = String(text || "");
    const chars = normalized.length;
    if (!chars) {
      return "";
    }
    const lines = countLines(normalized);
    return lines > 1 ? `${chars} chars, ${lines} lines` : `${chars} chars`;
  }

  function updateAdaptiveLayout(elements) {
    const translationText = elements.translation.classList.contains("muted") ? "" : elements.translation.textContent;
    const wasLong = elements.panel.classList.contains("is-long");
    const isLong = isLongContent(getCurrentSourceText(elements), translationText);
    elements.panel.classList.toggle("is-long", isLong);
    if (wasLong !== isLong && !elements.panel.classList.contains("hidden")) {
      keepPanelInViewport(elements.panel);
    }
  }

  function getCurrentTranslatedText() {
    return String(popupState.currentTranslatedText || "").trim();
  }

  function getCurrentSourceText(elements) {
    return String(elements.source.textContent || "").trim();
  }

  function getCurrentSourceLanguage(elements) {
    const val = elements.sourceLanguage ? elements.sourceLanguage.value : "auto";
    if (!val || val === "auto") {
      return "auto";
    }
    if (val === "custom") {
      return elements.sourceLanguageCustom.value.trim() || "auto";
    }
    return val;
  }

  function getCurrentTargetLanguage(elements) {
    if (popupState.targetLanguage) {
      return popupState.targetLanguage;
    }
    return elements.targetLanguage.value === "custom"
      ? (elements.targetLanguageCustom.value.trim() || "en")
      : (elements.targetLanguage.value || "en");
  }

  function updateSpeakButton(elements, hasText) {
    ra.updateButton(elements.speak, readAloudState, hasText, "Read translation aloud", "Stop reading");
  }

  function updateSpeakSourceButton(elements, hasText) {
    ra.updateButton(elements.speakSource, sourceReadAloudState, hasText, "Read source text aloud", "Stop reading");
  }

  function updateTranslationExpandButton(elements) {
    if (!elements.expand) {
      return;
    }
    const canExpand = canExpandTranslation();
    if (!canExpand) {
      popupState.translationExpanded = false;
      syncTranslationExpandedClass(elements, false);
    }
    const label = popupState.translationExpanded ? COLLAPSE_RESULT_LABEL : EXPAND_RESULT_LABEL;
    elements.expand.disabled = !canExpand;
    elements.expand.setAttribute("aria-pressed", popupState.translationExpanded ? "true" : "false");
    pu.setHtml(elements.expand, popupState.translationExpanded ? COLLAPSE_RESULT_SVG : EXPAND_RESULT_SVG);
    elements.expand.title = label;
    elements.expand.setAttribute("aria-label", label);
  }

  function canExpandTranslation() {
    return !!getCurrentTranslatedText() && !popupState.translationInProgress;
  }

  function syncTranslationExpandedClass(elements, expanded) {
    elements.panel.classList.toggle("is-translation-expanded", expanded);
  }

  function setTranslationExpanded(elements, expanded) {
    const nextExpanded = !!expanded && canExpandTranslation();
    popupState.translationExpanded = nextExpanded;
    syncTranslationExpandedClass(elements, nextExpanded);
    updateTranslationExpandButton(elements);
    if (nextExpanded) {
      elements.translationScroll.focus({ preventScroll: true });
    }
    if (!elements.panel.classList.contains("hidden")) {
      keepPanelInViewport(elements.panel);
    }
  }

  function toggleTranslationExpanded() {
    const elements = getElements();
    setTranslationExpanded(elements, !popupState.translationExpanded);
  }

  function stopReadAloud(elements) {
    ra.stopAudioState(readAloudState);
    updateSpeakButton(elements, !!getCurrentTranslatedText());
  }

  function stopSourceReadAloud(elements) {
    ra.stopAudioState(sourceReadAloudState);
    updateSpeakSourceButton(elements, !!getCurrentSourceText(elements));
  }

  function resetAudioAndActions(elements) {
    stopReadAloud(elements);
    stopSourceReadAloud(elements);
    elements.speak.classList.add("hidden");
    elements.speakSource.classList.add("hidden");
    elements.copy.classList.add("hidden");
    elements.copy.textContent = "Copy";
    updateTranslationExpandButton(elements);
  }

  async function toggleReadAloud() {
    const elements = getElements();
    const text = getCurrentTranslatedText();
    if (!text) {
      return;
    }

    if (readAloudState.playing || readAloudState.loading) {
      stopReadAloud(elements);
      return;
    }

    stopSourceReadAloud(elements);

    const token = readAloudState.token + 1;
    readAloudState.token = token;
    readAloudState.loading = true;
    updateSpeakButton(elements, true);

    try {
      const response = await api.runtime.sendMessage({
        type: messageTypes.readAloud,
        text,
        language: getCurrentTargetLanguage(elements)
      });

      if (token !== readAloudState.token) {
        return;
      }

      if (!response || !response.ok) {
        throw new Error(response?.error?.message || "Could not load read aloud audio.");
      }

      readAloudState.loading = false;
      readAloudState.playing = true;
      updateSpeakButton(elements, true);
      await ra.playReadAloudClips(
        response.data.clips || [],
        token,
        () => readAloudState.token,
        (audio) => { readAloudState.audio = audio; },
        () => { readAloudState.playing = false; readAloudState.audio = null; updateSpeakButton(elements, true); }
      );
    } catch (error) {
      if (token === readAloudState.token) {
        stopReadAloud(elements);
        elements.meta.textContent = error.message || "Could not play read aloud.";
        elements.meta.title = "";
      }
    }
  }

  async function toggleReadAloudSource() {
    const elements = getElements();
    const text = getCurrentSourceText(elements);
    if (!text) {
      return;
    }

    if (sourceReadAloudState.playing || sourceReadAloudState.loading) {
      stopSourceReadAloud(elements);
      return;
    }

    stopReadAloud(elements);

    const token = sourceReadAloudState.token + 1;
    sourceReadAloudState.token = token;
    sourceReadAloudState.loading = true;
    updateSpeakSourceButton(elements, true);

    try {
      const response = await api.runtime.sendMessage({
        type: messageTypes.readAloud,
        text,
        language: getCurrentSourceLanguage(elements)
      });

      if (token !== sourceReadAloudState.token) {
        return;
      }

      if (!response || !response.ok) {
        throw new Error(response?.error?.message || "Could not load read aloud audio.");
      }

      sourceReadAloudState.loading = false;
      sourceReadAloudState.playing = true;
      updateSpeakSourceButton(elements, true);
      await ra.playReadAloudClips(
        response.data.clips || [],
        token,
        () => sourceReadAloudState.token,
        (audio) => { sourceReadAloudState.audio = audio; },
        () => { sourceReadAloudState.playing = false; sourceReadAloudState.audio = null; updateSpeakSourceButton(elements, true); }
      );
    } catch (error) {
      if (token === sourceReadAloudState.token) {
        stopSourceReadAloud(elements);
        elements.meta.textContent = error.message || "Could not play read aloud.";
        elements.meta.title = "";
      }
    }
  }

  function renderLanguageOptions(elements, targetLanguage, sourceLanguage) {
    const shadow = elements.host.shadowRoot;
    const languageOptions = namespace.constants.languageOptions || [];
    const knownCodes = new Set(languageOptions.map((item) => item.code));
    const items = languageOptions.map((item) => ({ value: item.code, label: `${item.label} (${item.code})` }));
    const sourceItems = [{ value: "auto", label: "Auto-detect" }].concat(items);

    const target = String(targetLanguage || "en").trim();
    const source = String(sourceLanguage || "auto").trim();
    const targetValue = knownCodes.has(target) ? target : "custom";
    const sourceValue = (!source || source === "auto") ? "auto" : (knownCodes.has(source) ? source : "custom");

    if (targetValue === "custom") {
      elements.targetLanguageCustom.classList.remove("hidden");
      elements.targetLanguageCustom.value = target;
    } else {
      elements.targetLanguageCustom.classList.add("hidden");
      elements.targetLanguageCustom.value = "";
    }

    if (sourceValue === "custom") {
      elements.sourceLanguageCustom.classList.remove("hidden");
      elements.sourceLanguageCustom.value = source;
    } else {
      elements.sourceLanguageCustom.classList.add("hidden");
      elements.sourceLanguageCustom.value = "";
    }

    if (popupState.sourceLanguageDd && popupState.targetLanguageDd) {
      popupState.sourceLanguageDd.setValue(sourceValue);
      popupState.targetLanguageDd.setValue(targetValue);
      return;
    }

    const sourceWrap = shadow.querySelector('[data-role="source-language-container"]');
    const targetWrap = shadow.querySelector('[data-role="target-language-container"]');

    popupState.sourceLanguageDd = namespace.customDropdown.create(sourceWrap, {
      dataAttrs: { role: "source-language" },
      items: sourceItems,
      selected: sourceValue,
      showSearch: true,
      showCustom: true,
      customInput: elements.sourceLanguageCustom,
      rootElement: shadow
    });

    popupState.targetLanguageDd = namespace.customDropdown.create(targetWrap, {
      dataAttrs: { role: "target-language" },
      items,
      selected: targetValue,
      showSearch: true,
      showCustom: true,
      customInput: elements.targetLanguageCustom,
      rootElement: shadow
    });
  }

  function getSelectedModelRoute() {
    return popupState.modelPicker
      ? popupState.modelPicker.getRoute()
      : { providerIds: [], modelOverrides: {} };
  }

  function ensureModelPicker(elements) {
    if (!popupState.modelPicker) {
      popupState.modelPicker = shell.createModelPicker(elements.modelContainer, {
        rootElement: elements.host.shadowRoot,
        onChange(route) {
          if (typeof popupState.onModelChangeCallback === "function") {
            popupState.onModelChangeCallback(route);
          }
        }
      });
    }
    return popupState.modelPicker;
  }

  function loadModelOptions(elements) {
    ensureModelPicker(elements).load();
  }

  function bindClose(elements) {
    if (elements.close.dataset.bound) {
      return;
    }
    elements.close.dataset.bound = "1";
    elements.refresh.dataset.bound = "1";
    elements.speak.dataset.bound = "1";
    elements.speakSource.dataset.bound = "1";
    elements.expand.dataset.bound = "1";
    elements.close.addEventListener("click", () => namespace.popupRenderer.hide());
    elements.speak.addEventListener("click", toggleReadAloud);
    elements.expand.addEventListener("click", toggleTranslationExpanded);
    elements.speakSource.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleReadAloudSource();
    });
    document.addEventListener("mousedown", (event) => {
      const host = document.getElementById(popupHostId);
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      if (!host || !path.includes(host)) {
        namespace.popupRenderer.hide();
      }
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const currentElements = getElements();
        if (popupState.translationExpanded) {
          setTranslationExpanded(currentElements, false);
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        namespace.popupRenderer.hide();
      }
    }, true);
  }

  function clampToViewport(panel, left, top) {
    return shell.clampToViewport(panel, left, top);
  }

  function keepPanelInViewport(panel) {
    const rect = panel.getBoundingClientRect();
    const clamped = clampToViewport(panel, rect.left, rect.top);
    panel.style.left = `${clamped.left}px`;
    panel.style.top = `${clamped.top}px`;
  }

  function bindViewportGuard(elements) {
    if (popupState.viewportBound) {
      return;
    }
    popupState.viewportBound = true;

    const reflow = () => {
      if (!elements.panel.classList.contains("hidden")) {
        keepPanelInViewport(elements.panel);
      }
    };

    window.addEventListener("resize", reflow, true);
    window.addEventListener("scroll", reflow, true);
    document.addEventListener("mouseup", reflow, true);
  }

  function bindDrag(elements) {
    if (popupState.dragBound) {
      return;
    }
    popupState.dragBound = true;

    const dragHandles = [elements.header, elements.translationHeader].filter(Boolean);

    const startDragging = (event) => {
      if (event.currentTarget === elements.translationHeader && !elements.panel.classList.contains("is-translation-expanded")) {
        return;
      }
      if (event.target && event.target.closest("button, input, .close, .theme-toggle, .speak, .expand, .cdd-wrapper, .cdd-panel")) {
        return;
      }
      popupState.dragging = true;
      const rect = elements.panel.getBoundingClientRect();
      popupState.dragOffsetX = event.clientX - rect.left;
      popupState.dragOffsetY = event.clientY - rect.top;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

    const moveDragging = (event) => {
      if (!popupState.dragging) {
        return;
      }
      const nextLeft = event.clientX - popupState.dragOffsetX;
      const nextTop = event.clientY - popupState.dragOffsetY;
      const clamped = clampToViewport(elements.panel, nextLeft, nextTop);
      elements.panel.style.left = `${clamped.left}px`;
      elements.panel.style.top = `${clamped.top}px`;
    };

    const stopDragging = (event) => {
      if (!popupState.dragging) {
        return;
      }
      popupState.dragging = false;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      keepPanelInViewport(elements.panel);
    };

    dragHandles.forEach((handle) => {
      handle.addEventListener("pointerdown", startDragging);
      handle.addEventListener("pointermove", moveDragging);
      handle.addEventListener("pointerup", stopDragging);
      handle.addEventListener("pointercancel", stopDragging);
    });
  }

  function placePanel(panel, rect) {
    const margin = 12;
    const panelRect = panel.getBoundingClientRect();
    const width = Math.min(panelRect.width || 360, window.innerWidth - (margin * 2));
    const height = Math.min(panelRect.height || 220, window.innerHeight - (margin * 2));
    const anchorLeft = Number.isFinite(rect.left) ? rect.left : (window.innerWidth / 2 - width / 2);
    const anchorBottom = Number.isFinite(rect.bottom) ? rect.bottom : (window.innerHeight / 2 + 20);
    const anchorTop = Number.isFinite(rect.top) ? rect.top : (window.innerHeight / 2 - 20);

    const desiredLeft = anchorLeft + ((rect.width || 0) / 2) - (width / 2);
    const topAbove = anchorTop - height - 12;
    const topBelow = anchorBottom + 12;
    const desiredTop = topAbove >= margin ? topAbove : topBelow;

    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    const left = Math.min(Math.max(desiredLeft, margin), maxLeft);
    const top = Math.min(Math.max(desiredTop, margin), maxTop);

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  namespace.popupRenderer = {
    show({ sourceText, rect, targetLanguage, sourceLanguage, revealModelImmediately }) {
      const elements = getElements();
      bindClose(elements);
      bindDrag(elements);
      bindViewportGuard(elements);
      renderLanguageOptions(elements, targetLanguage, sourceLanguage);
      loadModelOptions(elements);
      shell.scheduleModelReveal(elements.panel, popupState, !!revealModelImmediately);
      const normalizedSourceText = String(sourceText || "");
      const sourceIsLong = isLongContent(normalizedSourceText, "");
      popupState.streamStartedAtMs = Date.now();
      popupState.firstTokenAtMs = 0;
      popupState.outputTokens = 0;
      popupState.tokPerSec = 0;
      popupState.fromCache = false;
      popupState.detectedSourceLanguage = "";
      popupState.targetLanguage = String(targetLanguage || "en").trim();
      popupState.currentTranslatedText = "";
      popupState.translationExpanded = false;
      popupState.translationInProgress = true;
      elements.panel.style.width = "";
      elements.panel.style.height = "";
      elements.panel.classList.toggle("is-long", sourceIsLong);
      elements.panel.classList.remove("is-translation-expanded");
      elements.panel.classList.remove("hidden");
      elements.source.textContent = normalizedSourceText;
      elements.sourceSize.textContent = formatSourceSize(normalizedSourceText);
      elements.sourceWrap.open = !sourceIsLong;
      elements.translation.textContent = "Translating...";
      elements.translation.classList.add("muted");
      elements.translationScroll.scrollTop = 0;
      elements.errorBadge.innerHTML = "";
      elements.meta.textContent = "Waiting for a provider...";
      elements.meta.title = "";
      elements.reasoningText.textContent = "";
      elements.reasoningWrap.classList.add("hidden");
      elements.reasoningWrap.open = false;
      elements.refresh.disabled = false;
      elements.refresh.textContent = "Refresh";
      resetAudioAndActions(elements);
      updateSpeakSourceButton(elements, !!getCurrentSourceText(elements));
      updateTranslationExpandButton(elements);
      placePanel(elements.panel, rect);
      keepPanelInViewport(elements.panel);
      elements.close.focus();
      return elements;
    },
    setResult(result) {
      const elements = getElements();
      elements.errorBadge.innerHTML = "";
      popupState.translationInProgress = false;
      popupState.currentTranslatedText = String(result.translatedText || "");
      elements.translation.textContent = result.translatedText;
      elements.translation.classList.remove("muted");
      elements.translationScroll.scrollTop = 0;
      const thinkingText = String(result.thinkingText || "").trim();
      if (thinkingText) {
        elements.reasoningText.textContent = thinkingText;
        elements.reasoningWrap.classList.remove("hidden");
        elements.reasoningWrap.open = !result.translatedText;
      } else {
        elements.reasoningText.textContent = "";
        elements.reasoningWrap.classList.add("hidden");
        elements.reasoningWrap.open = false;
      }
      const cached = result.fromCache ? " • Cached" : "";
      popupState.fromCache = !!result.fromCache;
      popupState.detectedSourceLanguage = String(result.detectedSourceLanguage || "").trim();
      popupState.targetLanguage = String(result.targetLanguage || popupState.targetLanguage || "").trim();
      pu.updateStreamMetrics(popupState, `${result.translatedText || ""}${result.thinkingText || ""}`, result.outputTokens);
      const firstTokenMs = popupState.firstTokenAtMs ? popupState.firstTokenAtMs - popupState.streamStartedAtMs : -1;
      elements.meta.textContent = `${result.providerName} • ${result.model} • ${result.latencyMs} ms${cached}`;
      elements.meta.title = popupState.fromCache ? "Cached" : buildTokenTooltip(firstTokenMs, popupState.outputTokens, popupState.tokPerSec);
      elements.refresh.disabled = false;
      elements.refresh.textContent = "Refresh";
      updateAdaptiveLayout(elements);
      updateSpeakButton(elements, !!result.translatedText);
      updateSpeakSourceButton(elements, !!getCurrentSourceText(elements));
      updateTranslationExpandButton(elements);
      elements.copy.classList.remove("hidden");
      elements.copy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(result.translatedText);
          elements.copy.textContent = "Copied!";
          setTimeout(() => { elements.copy.textContent = "Copy"; }, 1500);
        } catch (_) {
          elements.copy.textContent = "Could not copy";
        }
      };
    },
    appendChunk(chunk, meta) {
      const elements = getElements();
      elements.errorBadge.innerHTML = "";
      popupState.fromCache = !!(meta && meta.fromCache);
      popupState.targetLanguage = String(meta && meta.targetLanguage || popupState.targetLanguage || "").trim();
      popupState.detectedSourceLanguage = String(meta && meta.detectedSourceLanguage || popupState.detectedSourceLanguage || "").trim();
      const translatedChunk = String(chunk || "");
      const thinkingChunk = String(meta && meta.thinkingChunk || "");
      const hasAnyChunk = !!translatedChunk || !!thinkingChunk;
      if (hasAnyChunk && !popupState.firstTokenAtMs) {
        popupState.firstTokenAtMs = Date.now();
      }

      if (thinkingChunk) {
        if (elements.reasoningWrap.classList.contains("hidden")) {
          elements.reasoningText.textContent = "";
          elements.reasoningWrap.classList.remove("hidden");
        }
        elements.reasoningWrap.open = true;
        elements.reasoningText.textContent += thinkingChunk;
        elements.reasoningText.scrollTop = elements.reasoningText.scrollHeight;
      }

      if (elements.translation.classList.contains("muted") || elements.translation.textContent === "Translating...") {
        elements.translation.textContent = "";
      }
      elements.translation.classList.remove("muted");
      elements.translation.textContent += translatedChunk;
      popupState.currentTranslatedText += translatedChunk;
      if (translatedChunk && elements.translationScroll) {
        elements.translationScroll.scrollTop = elements.translationScroll.scrollHeight;
      }
      if (translatedChunk) {
        elements.reasoningWrap.open = false;
      }
      updateAdaptiveLayout(elements);
      pu.updateStreamMetrics(popupState, `${elements.translation.textContent}${elements.reasoningText.textContent}`, meta && meta.outputTokens);
      if (meta) {
        const firstTokenMs = popupState.firstTokenAtMs ? popupState.firstTokenAtMs - popupState.streamStartedAtMs : -1;
        elements.meta.textContent = `${meta.providerName} • ${meta.model} • ${popupState.fromCache ? "Cached" : "Streaming"}`;
        elements.meta.title = popupState.fromCache ? "Cached" : buildTokenTooltip(firstTokenMs, popupState.outputTokens, popupState.tokPerSec);
      }
      elements.refresh.disabled = true;
      elements.refresh.textContent = "Translating...";
      updateTranslationExpandButton(elements);
    },
    setError(message, category) {
      const elements = getElements();
      popupState.currentTranslatedText = "";
      popupState.translationInProgress = false;
      setTranslationExpanded(elements, false);
      const labels = { auth: "Authentication error", rate_limit: "Rate limit", server: "Server error", network: "Network error" };
      const cssMap = { auth: "error-auth", rate_limit: "error-rate", server: "error-server", network: "error-net" };
      const cat = category || "network";
      const badge = document.createElement("span");
      badge.className = `error-badge ${cssMap[cat] || "error-net"}`;
      badge.textContent = labels[cat] || "Error";
      elements.errorBadge.replaceChildren(badge);
      elements.translation.textContent = message;
      elements.translation.classList.remove("muted");
      elements.translationScroll.scrollTop = 0;
      elements.meta.textContent = "";
      elements.meta.title = "";
      elements.refresh.disabled = false;
      elements.refresh.textContent = "Try again";
      resetAudioAndActions(elements);
      updateAdaptiveLayout(elements);
      updateTranslationExpandButton(elements);
    },
    bindRefresh(handler) {
      const elements = getElements();
      if (elements.refresh._byokHandler) {
        elements.refresh.removeEventListener("click", elements.refresh._byokHandler);
      }
      elements.refresh._byokHandler = handler;
      elements.refresh.addEventListener("click", handler);
    },
    getLanguageValues() {
      const elements = getElements();
      const targetLanguage = elements.targetLanguage.value === "custom"
        ? (elements.targetLanguageCustom.value.trim() || "en")
        : elements.targetLanguage.value;
      const sourceLanguage = elements.sourceLanguage.value === "custom"
        ? (elements.sourceLanguageCustom.value.trim() || "auto")
        : (elements.sourceLanguage.value || "auto");
      return { targetLanguage, sourceLanguage };
    },
    getModelValues() {
      return getSelectedModelRoute();
    },
    bindModelChange(handler) {
      popupState.onModelChangeCallback = handler;
    },
    hide() {
      const host = document.getElementById(popupHostId);
      if (!host || !host.shadowRoot) {
        return;
      }
      shell.clearModelReveal(popupState);
      stopReadAloud(getElements());
      stopSourceReadAloud(getElements());
      const panel = host.shadowRoot.querySelector(".panel");
      if (panel) {
        panel.classList.remove("is-translation-expanded");
        panel.classList.remove("model-revealed");
        panel.classList.add("hidden");
      }
      popupState.translationExpanded = false;
      popupState.translationInProgress = false;
      if (typeof popupState.onHideCallback === "function") {
        try { popupState.onHideCallback(); } catch (_) {}
      }
    },
    onHide(callback) {
      popupState.onHideCallback = callback;
    }
  };
}(globalThis));
