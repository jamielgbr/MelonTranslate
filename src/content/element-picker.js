(function initElementPicker(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const messageTypes = namespace.messages.types;
  const i18n = namespace.i18n || { t: function(value) { return String(value || ""); } };
  const t = i18n.t;

  const state = {
    active: false,
    confirming: false,
    hovered: null,
    selectedSelector: "",
    overlay: null,
    panel: null,
    style: null
  };

  function createStyle() {
    if (state.style) {
      return;
    }
    var style = document.createElement("style");
    style.id = "melontranslate-element-picker-style";
    style.textContent = `
      .mt-picker-highlight {
        position: fixed;
        z-index: 2147483646;
        pointer-events: none;
        border: 2px solid #16a34a;
        background: rgba(22, 163, 74, 0.12);
        box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.28);
        border-radius: 4px;
      }
      .mt-picker-panel {
        position: fixed;
        z-index: 2147483647;
        left: 16px;
        top: 16px;
        max-width: min(520px, calc(100vw - 32px));
        padding: 12px 14px;
        border: 1px solid rgba(148, 163, 184, 0.45);
        border-radius: 8px;
        background: #111827;
        color: #f8fafc;
        font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 18px 44px rgba(15, 23, 42, 0.32);
      }
      .mt-picker-title {
        margin: 0 0 4px;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0;
      }
      .mt-picker-selector {
        margin: 6px 0 0;
        color: #bbf7d0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        overflow-wrap: anywhere;
      }
      .mt-picker-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }
      .mt-picker-actions button {
        min-height: 32px;
        padding: 0 10px;
        border: 1px solid rgba(248, 250, 252, 0.35);
        border-radius: 6px;
        background: rgba(248, 250, 252, 0.08);
        color: #f8fafc;
        font: inherit;
        cursor: pointer;
      }
      .mt-picker-actions button:hover,
      .mt-picker-actions button:focus-visible {
        background: rgba(248, 250, 252, 0.18);
      }
    `;
    (document.head || document.documentElement).appendChild(style);
    state.style = style;
  }

  function setPanelContent(titleText, bodyText, selectorText) {
    var title = document.createElement("p");
    title.className = "mt-picker-title";
    title.textContent = titleText;
    var body = document.createElement("div");
    body.textContent = bodyText;
    var selector = document.createElement("div");
    selector.className = "mt-picker-selector";
    selector.textContent = selectorText || "";
    state.panel.replaceChildren(title, body, selector);
    return selector;
  }

  function renderSelectionPrompt() {
    setPanelContent(
      t("Select translation area"),
      t("Click a page region to choose how immersive translation should handle it. Press Esc to cancel."),
      ""
    );
  }

  function renderConfirmation(selectorText) {
    setPanelContent(
      t("Save site rule"),
      t("Choose how this region should affect immersive translation for this site."),
      selectorText
    );
    var actions = document.createElement("div");
    actions.className = "mt-picker-actions";

    [
      { mode: "include", label: t("Translate this area") },
      { mode: "exclude", label: t("Exclude this area") },
      { mode: "cancel", label: t("Cancel") }
    ].forEach(function(action) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      button.addEventListener("click", function(event) {
        event.preventDefault();
        event.stopPropagation();
        if (action.mode === "cancel") {
          stop(t("Selection cancelled."));
          return;
        }
        saveSelectedSelector(selectorText, action.mode)
          .then(function() {
            stop(action.mode === "exclude" ? t("Excluded area saved.") : t("Translation area saved."));
          })
          .catch(function(error) {
            stop(error && error.message ? error.message : t("Could not save area."));
          });
      });
      actions.appendChild(button);
    });

    state.panel.appendChild(actions);
  }

  function createUi() {
    createStyle();
    state.overlay = document.createElement("div");
    state.overlay.className = "mt-picker-highlight";
    state.overlay.hidden = true;
    state.panel = document.createElement("div");
    state.panel.className = "mt-picker-panel";
    renderSelectionPrompt();
    document.documentElement.appendChild(state.overlay);
    document.documentElement.appendChild(state.panel);
  }

  function isPickerElement(element) {
    return !!element && (
      element === state.overlay ||
      element === state.panel ||
      state.panel?.contains(element)
    );
  }

  function setHovered(element) {
    if (state.confirming || !element || isPickerElement(element) || element.closest?.("#" + namespace.constants.popupId)) {
      return;
    }
    state.hovered = element;
    var rect = element.getBoundingClientRect();
    state.overlay.hidden = false;
    state.overlay.style.left = Math.max(0, rect.left) + "px";
    state.overlay.style.top = Math.max(0, rect.top) + "px";
    state.overlay.style.width = Math.max(0, rect.width) + "px";
    state.overlay.style.height = Math.max(0, rect.height) + "px";
    var selector = namespace.selectorGenerator.generateSelector(element);
    var selectorEl = state.panel.querySelector(".mt-picker-selector");
    if (selectorEl) {
      selectorEl.textContent = selector;
    }
  }

  function onMouseMove(event) {
    setHovered(event.target);
  }

  function stop(message) {
    if (!state.active) {
      return;
    }
    state.active = false;
    state.confirming = false;
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    if (state.overlay) state.overlay.remove();
    if (state.panel) {
      if (message) {
        showToast(message);
      } else {
        state.panel.remove();
      }
    }
    state.overlay = null;
    state.panel = null;
    state.hovered = null;
    state.selectedSelector = "";
  }

  function showToast(message) {
    var panel = state.panel;
    panel.textContent = "";
    var title = document.createElement("p");
    title.className = "mt-picker-title";
    title.textContent = String(message || t("Saved."));
    panel.appendChild(title);
    setTimeout(function() {
      if (panel.isConnected) {
        panel.remove();
      }
    }, 1400);
  }

  async function saveSelectedSelector(selector, mode) {
    if (!selector) {
      throw new Error(t("Could not create a selector for this element."));
    }
    var host = window.location.hostname;
    var response = await api.runtime.sendMessage({
      type: messageTypes.saveSiteRuleFromPicker,
      hostPattern: host,
      selector: selector,
      mode: mode === "exclude" ? "exclude" : "include"
    });
    if (!response || !response.ok) {
      throw new Error(response?.error?.message || t("Could not save site rule."));
    }
    return response.data && response.data.rule;
  }

  function onClick(event) {
    if (!state.active) {
      return;
    }
    if (isPickerElement(event.target)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (state.confirming) {
      return;
    }
    var selected = state.hovered || event.target;
    var selector = namespace.selectorGenerator.generateSelector(selected);
    if (!selector) {
      stop(t("Could not create a selector for this element."));
      return;
    }
    state.confirming = true;
    state.selectedSelector = selector;
    renderConfirmation(selector);
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      stop(t("Selection cancelled."));
    }
  }

  function start() {
    if (state.active) {
      return;
    }
    state.active = true;
    createUi();
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
  }

  namespace.elementPicker = {
    start: start,
    stop: stop
  };
}(globalThis));
