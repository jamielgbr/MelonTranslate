(function initSelectionDetector(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const { selectionTriggers, maxSelectionLength } = namespace.constants;
  const popupHostId = namespace.constants.popupId;

  function isEditable(target) {
    return !!target && (
      target.closest("input, textarea") ||
      target.closest("[contenteditable=''], [contenteditable='true']")
    );
  }

  function isEventInsidePopup(event) {
    const host = document.getElementById(popupHostId);
    if (!host) {
      return false;
    }
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    return path.includes(host);
  }

  function isNodeInsidePopup(node) {
    const host = document.getElementById(popupHostId);
    if (!host || !host.shadowRoot || !node) {
      return false;
    }
    return host.shadowRoot.contains(node);
  }

  function getSelectionData() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    if (isNodeInsidePopup(selection.anchorNode) || isNodeInsidePopup(selection.focusNode)) {
      return null;
    }

    const text = selection.toString().trim();
    if (!text) {
      return null;
    }

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    return {
      text: text.slice(0, maxSelectionLength),
      rect: rect.width || rect.height ? rect : {
        left: window.innerWidth / 2 - 180,
        top: 80,
        width: 360,
        height: 40,
        bottom: 120
      }
    };
  }

  function modifierMatches(event, modifierKey) {
    switch (modifierKey) {
      case "Alt":
        return event.altKey;
      case "Control":
        return event.ctrlKey;
      case "Shift":
        return event.shiftKey;
      case "Meta":
        return event.metaKey;
      default:
        return false;
    }
  }

  namespace.selectionDetector = {
    start(getSettings, onSelection) {
      document.addEventListener("mouseup", async (event) => {
        if (isEventInsidePopup(event)) {
          return;
        }

        if (isEditable(event.target)) {
          return;
        }

        const selectionData = getSelectionData();
        if (!selectionData) {
          return;
        }

        const settings = await getSettings();
        if (settings.selectionTrigger === selectionTriggers.manual) {
          return;
        }

        if (settings.selectionTrigger === selectionTriggers.modifier && !modifierMatches(event, settings.modifierKey)) {
          return;
        }

        onSelection(selectionData);
      }, true);
    },
    getSelectionData
  };
}(globalThis));