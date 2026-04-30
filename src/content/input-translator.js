(function initInputTranslator(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const messageTypes = namespace.messages.types;
  const constants = namespace.constants;
  const pu = namespace.pageUtils;
  const buttonHostId = "melontranslate-input-button-host";
  const panelHostId = "melontranslate-input-panel-host";
  const allowedInputTypes = new Set(["", "text", "search", "url", "tel", "email"]);

  const state = {
    getSettings: null,
    streamClient: null,
    activeEditable: null,
    contextMenuEditable: null,
    buttonHost: null,
    panelHost: null,
    resizeObserver: null,
    reflowFrame: 0,
    panel: null,
    quickTranslating: false
  };

  function isElement(value) {
    return value && value.nodeType === Node.ELEMENT_NODE;
  }

  function eventTouchesOwnUi(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    return path.some((item) => (
      item && (
        item.id === buttonHostId ||
        item.id === panelHostId ||
        item.id === constants.popupId
      )
    ));
  }

  function isTextInput(element) {
    if (!element || element.tagName !== "INPUT") {
      return false;
    }
    const type = String(element.getAttribute("type") || "text").trim().toLowerCase();
    return allowedInputTypes.has(type)
      && !element.disabled
      && !element.readOnly;
  }

  function isTextArea(element) {
    return !!element
      && element.tagName === "TEXTAREA"
      && !element.disabled
      && !element.readOnly;
  }

  function isEditableElement(element) {
    if (!isElement(element)) {
      return false;
    }
    if (isTextInput(element) || isTextArea(element)) {
      return isVisible(element);
    }
    if (!element.isContentEditable || element.getAttribute("contenteditable") === "false") {
      return false;
    }
    if (element.getAttribute("aria-disabled") === "true") {
      return false;
    }
    return isVisible(element);
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) {
      return false;
    }
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function findEditable(target) {
    if (!target) {
      return null;
    }
    const start = isElement(target) ? target : target.parentElement;
    if (!start || !start.closest) {
      return null;
    }

    const field = start.closest("input, textarea");
    if (field && isEditableElement(field)) {
      return field;
    }

    const explicitEditable = start.closest("[contenteditable]");
    if (explicitEditable && isEditableElement(explicitEditable)) {
      return explicitEditable;
    }

    if (start.isContentEditable) {
      let current = start;
      let rootEditable = start;
      while (current.parentElement && current.parentElement.isContentEditable) {
        rootEditable = current.parentElement;
        current = current.parentElement;
      }
      if (isEditableElement(rootEditable)) {
        return rootEditable;
      }
    }

    return null;
  }

  function isFormField(element) {
    return element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA");
  }

  function getEditableText(element) {
    if (isFormField(element)) {
      return String(element.value || "");
    }
    return String(element.innerText !== undefined ? element.innerText : element.textContent || "");
  }

  function rangeBelongsToEditable(range, editable) {
    const node = range.commonAncestorContainer;
    const element = isElement(node) ? node : node.parentElement;
    return !!element && (element === editable || editable.contains(element));
  }

  function captureEditableText(editable) {
    if (!isEditableElement(editable)) {
      return null;
    }

    const snapshot = getEditableText(editable);
    if (isFormField(editable)) {
      const start = Number(editable.selectionStart);
      const end = Number(editable.selectionEnd);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        const selectedText = snapshot.slice(start, end).trim();
        if (selectedText) {
          return {
            editable,
            mode: "selection",
            text: selectedText.slice(0, constants.maxSelectionLength),
            snapshot,
            selectionStart: start,
            selectionEnd: end
          };
        }
      }

      const fullText = snapshot.trim();
      return fullText ? {
        editable,
        mode: "all",
        text: fullText.slice(0, constants.maxSelectionLength),
        snapshot
      } : null;
    }

    const selection = window.getSelection();
    if (selection && selection.rangeCount && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const selected = selection.toString().trim();
      if (selected && rangeBelongsToEditable(range, editable)) {
        return {
          editable,
          mode: "selection",
          text: selected.slice(0, constants.maxSelectionLength),
          snapshot,
          range: range.cloneRange()
        };
      }
    }

    const fullText = snapshot.trim();
    return fullText ? {
      editable,
      mode: "all",
      text: fullText.slice(0, constants.maxSelectionLength),
      snapshot
    } : null;
  }

  function hasInputChanged(info) {
    return !info || !info.editable || getEditableText(info.editable) !== info.snapshot;
  }

  function dispatchEditableEvents(element, text) {
    try {
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertReplacementText",
        data: text
      }));
    } catch (_) {
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setNativeValue(element, value) {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  function moveCaretAfterTextNode(node) {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function moveCaretToEnd(element) {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function insertContentEditableText(text) {
    try {
      if (document.queryCommandSupported && !document.queryCommandSupported("insertText")) {
        return false;
      }
      return !!(document.execCommand && document.execCommand("insertText", false, text));
    } catch (_) {
      return false;
    }
  }

  function getTextNodeInside(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    return walker.nextNode();
  }

  function getDraftTextNodes(editable) {
    return Array.from(editable.querySelectorAll('span[data-text="true"]'))
      .map((span) => getTextNodeInside(span))
      .filter(Boolean);
  }

  function selectDraftManagedText(editable) {
    const textNodes = getDraftTextNodes(editable);
    if (!textNodes.length) {
      return false;
    }

    const first = textNodes[0];
    const last = textNodes[textNodes.length - 1];
    const selection = window.getSelection();
    if (!selection) {
      return false;
    }

    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(last, String(last.nodeValue || "").length);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function selectAllInContentEditable(editable) {
    editable.focus();
    try {
      if (document.queryCommandSupported && document.queryCommandSupported("selectAll")) {
        document.execCommand("selectAll", false, null);
        const selection = window.getSelection();
        return !!selection && selection.rangeCount > 0 && rangeBelongsToEditable(selection.getRangeAt(0), editable);
      }
    } catch (_) {}

    const selection = window.getSelection();
    if (!selection) {
      return false;
    }
    const range = document.createRange();
    range.selectNodeContents(editable);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function replaceEditableText(info, translatedText) {
    const text = String(translatedText || "").trim();
    if (!text || hasInputChanged(info)) {
      return false;
    }

    const editable = info.editable;
    if (isFormField(editable)) {
      const before = info.mode === "selection" ? info.snapshot.slice(0, info.selectionStart) : "";
      const after = info.mode === "selection" ? info.snapshot.slice(info.selectionEnd) : "";
      const nextValue = info.mode === "selection" ? `${before}${text}${after}` : text;
      const caret = info.mode === "selection" ? before.length + text.length : nextValue.length;
      editable.focus();
      setNativeValue(editable, nextValue);
      if (typeof editable.setSelectionRange === "function") {
        try { editable.setSelectionRange(caret, caret); } catch (_) {}
      }
      dispatchEditableEvents(editable, text);
      return true;
    }

    editable.focus();
    let usedNativeInput = false;
    if (info.mode === "selection" && info.range) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(info.range);
      }
      usedNativeInput = insertContentEditableText(text);
      if (!usedNativeInput) {
        info.range.deleteContents();
        const node = document.createTextNode(text);
        info.range.insertNode(node);
        moveCaretAfterTextNode(node);
      }
    } else {
      const selectedManagedDraftText = selectDraftManagedText(editable);
      usedNativeInput = (selectedManagedDraftText || selectAllInContentEditable(editable))
        && insertContentEditableText(text);
      if (!usedNativeInput) {
        editable.textContent = text;
        moveCaretToEnd(editable);
      }
    }
    if (!usedNativeInput) {
      dispatchEditableEvents(editable, text);
    }
    return true;
  }

  function ensureButtonHost() {
    if (state.buttonHost) {
      return state.buttonHost;
    }

    const host = document.createElement("div");
    host.id = buttonHostId;
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.zIndex = "2147483646";
    host.style.display = "none";
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .btn {
          width: 26px;
          height: 26px;
          border: 1px solid rgba(15, 118, 110, 0.32);
          border-radius: 999px;
          background: rgba(240, 253, 248, 0.92);
          color: #0f766e;
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.14);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          cursor: pointer;
          font-family: ui-sans-serif, system-ui, sans-serif;
          transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease, opacity 140ms ease;
        }
        .btn:hover {
          background: #d1fae5;
          border-color: rgba(15, 118, 110, 0.48);
        }
        .btn:focus-visible {
          outline: 2px solid #0f766e;
          outline-offset: 2px;
        }
        .btn:disabled {
          cursor: progress;
          opacity: 0.75;
        }
        .btn.loading svg {
          animation: spin 0.8s linear infinite;
        }
        .btn.error {
          color: #dc2626;
          border-color: rgba(220, 38, 38, 0.38);
          background: rgba(254, 242, 242, 0.96);
        }
        svg {
          width: 15px;
          height: 15px;
          display: block;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
      <button class="btn" type="button" aria-label="Translate and replace input text" title="Translate and replace">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 8h8"/>
          <path d="M9 4v4c0 4-2 7-5 9"/>
          <path d="M7 12c1 2 3 4 6 5"/>
          <path d="M14 20l4-9 4 9"/>
          <path d="M15.5 17h5"/>
        </svg>
      </button>
    `;
    shadow.querySelector(".btn").addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    shadow.querySelector(".btn").addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await quickTranslateEditable(state.activeEditable);
    });
    state.buttonHost = host;
    return host;
  }

  function getInlineButton() {
    const host = ensureButtonHost();
    return host.shadowRoot ? host.shadowRoot.querySelector(".btn") : null;
  }

  function setButtonBusy(isBusy) {
    const button = getInlineButton();
    if (!button) {
      return;
    }
    button.disabled = !!isBusy;
    button.classList.toggle("loading", !!isBusy);
    button.classList.remove("error");
    button.title = isBusy ? "Translating..." : "Translate and replace";
    button.setAttribute("aria-label", isBusy ? "Translating input text" : "Translate and replace input text");
  }

  function flashButtonError(message) {
    const button = getInlineButton();
    if (!button) {
      return;
    }
    button.disabled = false;
    button.classList.remove("loading");
    button.classList.add("error");
    button.title = message || "Could not translate";
    setTimeout(() => {
      button.classList.remove("error");
      button.title = "Translate and replace";
      button.setAttribute("aria-label", "Translate and replace input text");
    }, 1800);
  }

  function isOwnElement(element) {
    return !!element && (
      element.id === buttonHostId ||
      element.id === panelHostId ||
      element.id === constants.popupId ||
      (state.buttonHost && state.buttonHost.contains(element)) ||
      (state.panelHost && state.panelHost.contains(element))
    );
  }

  function candidateCollides(candidate) {
    const points = [
      [candidate.left + candidate.width / 2, candidate.top + candidate.height / 2],
      [candidate.left + 4, candidate.top + 4],
      [candidate.left + candidate.width - 4, candidate.top + 4],
      [candidate.left + candidate.width - 4, candidate.top + candidate.height - 4]
    ];

    return points.some(([x, y]) => {
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
        return true;
      }
      return document.elementsFromPoint(x, y).some((element) => {
        if (!element || element === document.documentElement || element === document.body || isOwnElement(element)) {
          return false;
        }
        if (state.activeEditable && (element === state.activeEditable || state.activeEditable.contains(element))) {
          return false;
        }
        const style = window.getComputedStyle(element);
        if (style.pointerEvents === "none" || style.visibility === "hidden" || style.display === "none") {
          return false;
        }
        return true;
      });
    });
  }

  function clampCandidate(candidate) {
    const margin = 6;
    return Object.assign({}, candidate, {
      left: Math.min(Math.max(candidate.left, margin), Math.max(margin, window.innerWidth - candidate.width - margin)),
      top: Math.min(Math.max(candidate.top, margin), Math.max(margin, window.innerHeight - candidate.height - margin))
    });
  }

  function clampNumber(value, min, max) {
    if (max < min) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }

  function uniqueCandidates(candidates) {
    const seen = new Set();
    return candidates.filter((candidate) => {
      const key = `${Math.round(candidate.left)}:${Math.round(candidate.top)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function buildButtonCandidates(rect, size, gap) {
    const inset = 4;
    const midTop = rect.top + (rect.height / 2) - (size / 2);
    const candidates = [];
    const canFitInside = rect.width >= size + (inset * 2);
    const canFitVertically = rect.height >= size + (inset * 2);

    if (canFitInside) {
      const minLeft = rect.left + inset;
      const maxLeft = rect.right - size - inset;
      const top = canFitVertically
        ? clampNumber(midTop, rect.top + inset, rect.bottom - size - inset)
        : midTop;
      const topValues = canFitVertically
        ? [
          top,
          rect.top + inset,
          rect.bottom - size - inset
        ]
        : [top];
      const maxShift = Math.max(0, maxLeft - minLeft);
      const shiftStep = size + gap;
      const shiftValues = [
        0,
        shiftStep,
        shiftStep * 2,
        Math.round(maxShift / 2),
        maxShift
      ];

      shiftValues.forEach((shift) => {
        const left = clampNumber(maxLeft - shift, minLeft, maxLeft);
        topValues.forEach((candidateTop) => {
          candidates.push({ left, top: candidateTop, width: size, height: size });
        });
      });
    }

    // Last resort: stay visually attached to the field instead of floating
    // completely outside it.
    candidates.push(
      { left: rect.right - size + 2, top: midTop, width: size, height: size },
      { left: rect.left - 2, top: midTop, width: size, height: size }
    );

    return uniqueCandidates(candidates).map(clampCandidate);
  }

  function positionButton() {
    if (!state.activeEditable || !isEditableElement(state.activeEditable)) {
      hideButton();
      return;
    }

    const host = ensureButtonHost();
    const rect = state.activeEditable.getBoundingClientRect();
    const size = 26;
    const gap = 6;
    const candidates = buildButtonCandidates(rect, size, gap);

    const selected = candidates.find((candidate) => !candidateCollides(candidate)) || candidates[0];
    host.style.left = `${Math.round(selected.left)}px`;
    host.style.top = `${Math.round(selected.top)}px`;
    host.style.display = "block";
  }

  function scheduleButtonPosition() {
    if (state.reflowFrame) {
      cancelAnimationFrame(state.reflowFrame);
    }
    state.reflowFrame = requestAnimationFrame(() => {
      state.reflowFrame = 0;
      positionButton();
    });
  }

  function hideButton() {
    if (state.buttonHost) {
      state.buttonHost.style.display = "none";
    }
  }

  function deactivateEditable() {
    state.activeEditable = null;
    observeEditable(null);
    hideButton();
  }

  function observeEditable(editable) {
    if (state.resizeObserver) {
      state.resizeObserver.disconnect();
      state.resizeObserver = null;
    }
    if (typeof ResizeObserver === "function" && editable) {
      state.resizeObserver = new ResizeObserver(scheduleButtonPosition);
      state.resizeObserver.observe(editable);
    }
  }

  async function activateEditable(editable) {
    if (!editable || !isEditableElement(editable)) {
      deactivateEditable();
      return false;
    }

    const settings = await state.getSettings();
    if (!pu.isHostAllowedForInputButton(settings, window.location.hostname)) {
      deactivateEditable();
      return false;
    }

    state.activeEditable = editable;
    observeEditable(editable);
    ensureButtonHost();
    scheduleButtonPosition();
    return true;
  }

  function ensurePanelHost() {
    if (state.panelHost) {
      return state.panelHost;
    }

    const host = document.createElement("div");
    host.id = panelHostId;
    host.style.all = "initial";
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .panel {
          position: fixed;
          z-index: 2147483647;
          width: min(340px, calc(100vw - 24px));
          max-height: calc(100vh - 24px);
          overflow: auto;
          box-sizing: border-box;
          border: 1px solid rgba(15, 118, 110, 0.18);
          border-radius: 12px;
          background: rgba(240, 253, 248, 0.98);
          color: #1f2937;
          box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
          font-family: ui-sans-serif, system-ui, sans-serif;
        }
        .hidden { display: none; }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          background: linear-gradient(135deg, rgba(15, 118, 110, 0.12), rgba(209, 250, 229, 0.3));
        }
        .title {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #0f766e;
        }
        .close {
          border: 0;
          background: transparent;
          color: #374151;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
          padding: 2px;
        }
        .body {
          display: grid;
          gap: 10px;
          padding: 12px;
        }
        .grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 8px;
        }
        label {
          display: block;
          margin: 0 0 4px;
          font-size: 10px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #6b7280;
        }
        select,
        input,
        textarea {
          box-sizing: border-box;
          width: 100%;
          border: 1px solid rgba(15, 118, 110, 0.2);
          border-radius: 8px;
          background: rgba(209, 250, 229, 0.5);
          color: #1f2937;
          font: inherit;
          font-size: 12px;
          padding: 7px 8px;
        }
        input { margin-top: 6px; }
        textarea {
          min-height: 58px;
          max-height: 120px;
          resize: vertical;
          line-height: 1.45;
        }
        textarea[readonly] {
          cursor: default;
        }
        .status {
          min-height: 18px;
          color: #6b7280;
          font-size: 12px;
          line-height: 1.5;
        }
        .footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          padding: 0 12px 12px;
        }
        button {
          border: 1px solid rgba(15, 118, 110, 0.25);
          border-radius: 999px;
          background: rgba(240, 253, 248, 0.95);
          color: #0f766e;
          cursor: pointer;
          font: inherit;
          font-size: 12px;
          padding: 7px 11px;
        }
        button.primary {
          background: #0f766e;
          color: white;
          border-color: #0f766e;
        }
        button:disabled {
          opacity: 0.45;
          cursor: default;
        }
        select:disabled {
          opacity: 0.65;
          cursor: default;
        }
        button:focus-visible,
        select:focus-visible,
        input:focus-visible,
        textarea:focus-visible {
          outline: 2px solid #0f766e;
          outline-offset: 2px;
        }
      </style>
      <section class="panel hidden" role="dialog" aria-label="Translate input text">
        <div class="header">
          <span class="title">Translate input</span>
          <button class="close" type="button" aria-label="Close">×</button>
        </div>
        <div class="body">
          <div>
            <label for="mt-input-model">Model</label>
            <select id="mt-input-model" data-role="model"></select>
          </div>
          <div class="grid">
            <div>
              <label for="mt-input-target">Target</label>
              <select id="mt-input-target" data-role="target"></select>
              <input class="hidden" type="text" data-role="target-custom" placeholder="Language code">
            </div>
            <div>
              <label for="mt-input-style">Style</label>
              <select id="mt-input-style" data-role="style"></select>
            </div>
          </div>
          <div>
            <label for="mt-input-source">Source</label>
            <textarea id="mt-input-source" data-role="source" readonly></textarea>
          </div>
          <div>
            <label for="mt-input-result">Translation</label>
            <textarea id="mt-input-result" data-role="result" readonly></textarea>
          </div>
          <div class="status" data-role="status" aria-live="polite"></div>
        </div>
        <div class="footer">
          <button type="button" data-role="translate">Translate</button>
          <button class="primary" type="button" data-role="replace" disabled>Replace</button>
        </div>
      </section>
    `;

    shadow.querySelector('[data-role="target"]').addEventListener("change", () => {
      const target = shadow.querySelector('[data-role="target"]');
      shadow.querySelector('[data-role="target-custom"]').classList.toggle("hidden", target.value !== "custom");
      if (state.panel) {
        state.panel.userChangedTarget = true;
      }
    });
    shadow.querySelector('[data-role="target-custom"]').addEventListener("input", () => {
      if (state.panel) {
        state.panel.userChangedTarget = true;
      }
    });
    shadow.querySelector('[data-role="model"]').addEventListener("change", updateReplaceState);
    shadow.querySelector(".close").addEventListener("click", hidePanel);
    shadow.querySelector('[data-role="translate"]').addEventListener("click", () => runPanelTranslation(false));
    shadow.querySelector('[data-role="replace"]').addEventListener("click", replaceFromPanel);
    state.panelHost = host;
    return host;
  }

  function getPanelElements() {
    const host = ensurePanelHost();
    const shadow = host.shadowRoot;
    return {
      host,
      panel: shadow.querySelector(".panel"),
      model: shadow.querySelector('[data-role="model"]'),
      target: shadow.querySelector('[data-role="target"]'),
      targetCustom: shadow.querySelector('[data-role="target-custom"]'),
      style: shadow.querySelector('[data-role="style"]'),
      source: shadow.querySelector('[data-role="source"]'),
      result: shadow.querySelector('[data-role="result"]'),
      status: shadow.querySelector('[data-role="status"]'),
      translate: shadow.querySelector('[data-role="translate"]'),
      replace: shadow.querySelector('[data-role="replace"]')
    };
  }

  async function loadModelOptions() {
    const response = await api.runtime.sendMessage({ type: messageTypes.getTranslationModelOptions });
    if (!response || !response.ok) {
      throw new Error(response?.error?.message || "Could not load model options.");
    }
    return response.data || {};
  }

  function populateModelOptions(elements, modelState) {
    const modelOptions = Array.isArray(modelState && modelState.modelOptions)
      ? modelState.modelOptions
      : [];
    if (!modelOptions.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No models available";
      elements.model.replaceChildren(option);
      elements.model.disabled = true;
      return false;
    }

    elements.model.replaceChildren(...modelOptions.map((item) => {
      const option = document.createElement("option");
      option.value = item.key;
      option.textContent = item.label;
      return option;
    }));
    const selectedKey = String(modelState.selectedModelKey || "").trim();
    elements.model.value = modelOptions.some((item) => item.key === selectedKey)
      ? selectedKey
      : modelOptions[0].key;
    elements.model.disabled = false;
    return true;
  }

  function setPanelTargetLanguage(elements, targetLanguage) {
    const languageOptions = constants.languageOptions || [];
    const target = String(targetLanguage || "en").trim();
    const knownTarget = languageOptions.some((item) => item.code === target);
    elements.target.value = knownTarget ? target : "custom";
    elements.targetCustom.value = knownTarget ? "" : target;
    elements.targetCustom.classList.toggle("hidden", elements.target.value !== "custom");
  }

  function populatePanelOptions(elements, settings, text, modelState) {
    const hasModelOptions = populateModelOptions(elements, modelState);
    const languageOptions = constants.languageOptions || [];
    const targetLanguage = pu.resolveInputTargetLanguage(settings, text, settings.targetLanguage);
    elements.target.replaceChildren(...languageOptions.map((item) => {
      const option = document.createElement("option");
      option.value = item.code;
      option.textContent = `${item.label} (${item.code})`;
      return option;
    }), (() => {
      const option = document.createElement("option");
      option.value = "custom";
      option.textContent = "Custom...";
      return option;
    })());
    setPanelTargetLanguage(elements, targetLanguage);

    const styles = constants.inputContextStyles || [];
    elements.style.replaceChildren(...styles.map((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      return option;
    }));
    elements.style.value = pu.getInputContextStyle(settings.defaultInputContextStyle);
    return hasModelOptions;
  }

  function getTargetLanguage(elements) {
    return elements.target.value === "custom"
      ? (elements.targetCustom.value.trim() || "en")
      : (elements.target.value || "en");
  }

  function getModelRoute(elements) {
    const parsed = pu.parseDefaultModelKey(elements.model.value);
    if (!parsed.providerId || !parsed.model) {
      return { providerIds: [], modelOverrides: {} };
    }
    return {
      providerIds: [parsed.providerId],
      modelOverrides: { [parsed.providerId]: parsed.model }
    };
  }

  function placePanel(elements, editable) {
    const margin = 12;
    const panelRect = elements.panel.getBoundingClientRect();
    const editableRect = editable.getBoundingClientRect();
    const width = Math.min(panelRect.width || 340, window.innerWidth - margin * 2);
    const height = Math.min(panelRect.height || 280, window.innerHeight - margin * 2);
    const desiredLeft = editableRect.left + (editableRect.width / 2) - (width / 2);
    const below = editableRect.bottom + 10;
    const above = editableRect.top - height - 10;
    const desiredTop = below + height <= window.innerHeight - margin ? below : above;
    const left = Math.min(Math.max(desiredLeft, margin), Math.max(margin, window.innerWidth - width - margin));
    const top = Math.min(Math.max(desiredTop, margin), Math.max(margin, window.innerHeight - height - margin));
    elements.panel.style.left = `${Math.round(left)}px`;
    elements.panel.style.top = `${Math.round(top)}px`;
  }

  function updateReplaceState() {
    if (!state.panel) {
      return;
    }
    const elements = getPanelElements();
    const changed = hasInputChanged(state.panel.textInfo);
    const hasResult = !!String(state.panel.resultText || "").trim();
    elements.replace.disabled = !hasResult || changed || state.panel.translating;
    if (changed && hasResult) {
      elements.status.textContent = "Input changed. Translate again before replacing.";
    }
  }

  async function openForEditable(editable) {
    if (!editable || !isEditableElement(editable)) {
      return false;
    }
    const [settings, modelState] = await Promise.all([
      state.getSettings(),
      loadModelOptions()
    ]);
    const textInfo = captureEditableText(editable);
    if (!textInfo) {
      return false;
    }

    const elements = getPanelElements();
    const hasModelOptions = populatePanelOptions(elements, settings, textInfo.text, modelState);
    state.panel = {
      editable,
      textInfo,
      settings,
      resultText: "",
      translating: false,
      token: 0,
      userChangedTarget: false,
      hasModelOptions
    };
    elements.source.value = textInfo.text;
    elements.result.value = "";
    elements.status.textContent = hasModelOptions
      ? "Choose model, target, and style."
      : "Enable a provider and choose a model in Settings.";
    elements.translate.disabled = !hasModelOptions;
    elements.replace.disabled = true;
    elements.panel.classList.remove("hidden");
    placePanel(elements, editable);
    (hasModelOptions ? elements.model : elements.target).focus();
    return true;
  }

  function appendPanelChunk(chunk, meta) {
    if (!state.panel || !state.panel.translating) {
      return;
    }
    const elements = getPanelElements();
    const text = String(chunk || "");
    if (text) {
      state.panel.resultText += text;
      elements.result.value = state.panel.resultText;
    }
    if (meta && meta.providerName && meta.model) {
      elements.status.textContent = `${meta.providerName} • ${meta.model}`;
    }
  }

  async function runPanelTranslation(bypassCache) {
    if (!state.panel || state.panel.translating) {
      return;
    }

    const elements = getPanelElements();
    let textInfo = state.panel.textInfo;
    if (hasInputChanged(textInfo)) {
      textInfo = captureEditableText(state.panel.editable);
      if (!textInfo) {
        elements.status.textContent = "There is no input text to translate.";
        return;
      }
      state.panel.textInfo = textInfo;
      elements.source.value = textInfo.text;
    }

    const token = state.panel.token + 1;
    state.panel.token = token;
    state.panel.translating = true;
    state.panel.resultText = "";
    elements.result.value = "";
    elements.status.textContent = "Translating...";
    elements.translate.disabled = true;
    elements.replace.disabled = true;

    try {
      const settings = state.panel.settings || await state.getSettings();
      const detectedSourceLanguage = pu.detectTextLanguage(textInfo.text);
      const requestedTargetLanguage = getTargetLanguage(elements);
      const targetLanguage = state.panel.userChangedTarget
        ? requestedTargetLanguage
        : pu.resolveInputTargetLanguage(settings, textInfo.text, settings.targetLanguage);
      if (!state.panel.userChangedTarget) {
        setPanelTargetLanguage(elements, targetLanguage);
      }
      const modelRoute = getModelRoute(elements);
      if (state.panel.hasModelOptions && !modelRoute.providerIds.length) {
        elements.status.textContent = "Choose a model first.";
        return;
      }

      const result = await state.streamClient.request(textInfo.text, {
        targetLanguage,
        sourceLanguage: detectedSourceLanguage,
        contextStyle: pu.getInputContextStyle(elements.style.value),
        dictionaryModeForSingleWord: false,
        bypassCache,
        providerIds: modelRoute.providerIds,
        modelOverrides: modelRoute.modelOverrides
      });
      if (!state.panel || state.panel.token !== token) {
        return;
      }
      state.panel.resultText = String(result.translatedText || state.panel.resultText || "").trim();
      elements.result.value = state.panel.resultText;
      elements.status.textContent = `${result.providerName} • ${result.model} • ${result.latencyMs} ms${result.fromCache ? " • Cached" : ""}`;
    } catch (error) {
      if (state.panel && state.panel.token === token) {
        elements.status.textContent = error.message || "Translation failed.";
      }
    } finally {
      if (state.panel && state.panel.token === token) {
        state.panel.translating = false;
        elements.translate.disabled = false;
        updateReplaceState();
      }
    }
  }

  async function quickTranslateEditable(editable) {
    if (state.quickTranslating) {
      return false;
    }
    if (!editable || !isEditableElement(editable)) {
      flashButtonError("There is no input text to translate.");
      return false;
    }

    const textInfo = captureEditableText(editable);
    if (!textInfo) {
      flashButtonError("There is no input text to translate.");
      return false;
    }

    hidePanel();
    state.quickTranslating = true;
    setButtonBusy(true);
    let errorMessage = "";

    try {
      const settings = await state.getSettings();
      const detectedSourceLanguage = pu.detectTextLanguage(textInfo.text);
      const targetLanguage = pu.resolveInputTargetLanguage(settings, textInfo.text, settings.targetLanguage);
      const result = await state.streamClient.request(textInfo.text, {
        targetLanguage,
        sourceLanguage: detectedSourceLanguage,
        contextStyle: pu.getInputContextStyle(settings.defaultInputContextStyle),
        dictionaryModeForSingleWord: false
      });

      if (!replaceEditableText(textInfo, result.translatedText)) {
        errorMessage = hasInputChanged(textInfo)
          ? "Input changed. Try again."
          : "Could not replace input text.";
      }
    } catch (error) {
      errorMessage = error.message || "Translation failed.";
    } finally {
      state.quickTranslating = false;
      setButtonBusy(false);
      if (errorMessage) {
        flashButtonError(errorMessage);
      }
      scheduleButtonPosition();
    }

    return !errorMessage;
  }

  function replaceFromPanel() {
    if (!state.panel || state.panel.translating) {
      return;
    }
    const elements = getPanelElements();
    if (hasInputChanged(state.panel.textInfo)) {
      elements.status.textContent = "Input changed. Translate again before replacing.";
      updateReplaceState();
      return;
    }
    if (!replaceEditableText(state.panel.textInfo, state.panel.resultText)) {
      elements.status.textContent = "Could not replace the input text.";
      return;
    }
    hidePanel();
    scheduleButtonPosition();
  }

  function hidePanel() {
    if (state.streamClient) {
      state.streamClient.disconnect();
    }
    if (state.panelHost && state.panelHost.shadowRoot) {
      const panel = state.panelHost.shadowRoot.querySelector(".panel");
      if (panel) {
        panel.classList.add("hidden");
      }
    }
    state.panel = null;
  }

  function bindDocumentEvents() {
    document.addEventListener("focusin", (event) => {
      if (eventTouchesOwnUi(event)) {
        return;
      }
      const editable = findEditable(event.target);
      if (editable) {
        activateEditable(editable).catch(() => deactivateEditable());
      } else {
        deactivateEditable();
      }
    }, true);

    document.addEventListener("mousedown", (event) => {
      if (eventTouchesOwnUi(event)) {
        return;
      }
      const editable = findEditable(event.target);
      if (editable) {
        activateEditable(editable).catch(() => deactivateEditable());
      } else if (!state.panel) {
        deactivateEditable();
      }
    }, true);

    document.addEventListener("contextmenu", (event) => {
      if (eventTouchesOwnUi(event)) {
        return;
      }
      state.contextMenuEditable = findEditable(event.target);
      if (state.contextMenuEditable) {
        activateEditable(state.contextMenuEditable).catch(() => {});
      }
    }, true);

    document.addEventListener("input", (event) => {
      const editable = findEditable(event.target);
      if (editable && editable === state.activeEditable) {
        scheduleButtonPosition();
      }
      if (state.panel && editable === state.panel.editable) {
        updateReplaceState();
      }
    }, true);

    window.addEventListener("scroll", scheduleButtonPosition, true);
    window.addEventListener("resize", scheduleButtonPosition, true);
  }

  namespace.inputTranslator = {
    start(getSettings) {
      if (state.getSettings) {
        return;
      }
      state.getSettings = getSettings;
      state.streamClient = namespace.translationClient.create({
        onChunk: appendPanelChunk
      });
      bindDocumentEvents();
    },
    async openFromContextMenu() {
      const editable = state.contextMenuEditable && isEditableElement(state.contextMenuEditable)
        ? state.contextMenuEditable
        : findEditable(document.activeElement);
      if (!editable) {
        return false;
      }
      const settings = await state.getSettings();
      if (pu.isHostAllowedForInputButton(settings, window.location.hostname)) {
        state.activeEditable = editable;
        observeEditable(editable);
        scheduleButtonPosition();
      } else {
        deactivateEditable();
      }
      return openForEditable(editable);
    }
  };
}(globalThis));
