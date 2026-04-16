(function initCustomDropdown(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};

  const _CHEVRON = '<svg class="cdd-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
  const _SEARCH_ICON = '<svg class="cdd-search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="4"/><path d="M14 14l-3.5-3.5"/></svg>';

  // One shared click-outside + Escape handler per root element.
  const _globalRoots = new WeakSet();

  function _ensureGlobal(rootEl) {
    if (_globalRoots.has(rootEl)) return;
    _globalRoots.add(rootEl);
    rootEl.addEventListener("click", () => {
      rootEl.querySelectorAll(".cdd-wrapper.cdd-open").forEach((el) => el.classList.remove("cdd-open"));
    });
    rootEl.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        rootEl.querySelectorAll(".cdd-wrapper.cdd-open").forEach((el) => el.classList.remove("cdd-open"));
      }
    });
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Create a custom dropdown in `container`.
   *
   * config:
   *   id          {string}   id for the hidden input (for form/query compat)
   *   classNames  {string}   space-separated class names for the hidden input
   *   dataAttrs   {object}   key→value pairs placed as data-* on the hidden input
   *   items       {Array<{value, label}>}
   *   selected    {string}   initially selected value
   *   showSearch  {boolean}
   *   showCustom  {boolean}  adds a "Custom…" item at the bottom
   *   customInput {Element}  sibling text input shown when "custom" is selected
   *   placeholder {string}   label text when no item matches selected
   *   onChange    {Function} called with (value, label) on selection
   *   rootElement {EventTarget}  default: document; use shadow root for Shadow DOM
   */
  function _setHtml(el, html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    el.replaceChildren(...doc.body.childNodes);
  }

  function create(container, config) {
    const cfg = config || {};
    const rootEl = cfg.rootElement || document;
    _ensureGlobal(rootEl);

    let currentItems = Array.isArray(cfg.items) ? cfg.items.slice() : [];
    const showSearch = !!cfg.showSearch;
    const showCustom = !!cfg.showCustom;
    const customInput = cfg.customInput || null;
    const initialValue = cfg.selected !== undefined ? String(cfg.selected) : "";

    // Build hidden <input> attribute string.
    let hiddenAttrs = 'type="hidden"';
    if (cfg.id) hiddenAttrs += ` id="${_esc(cfg.id)}"`;
    if (cfg.classNames) hiddenAttrs += ` class="${_esc(cfg.classNames)}"`;
    if (cfg.dataAttrs && typeof cfg.dataAttrs === "object") {
      Object.keys(cfg.dataAttrs).forEach((k) => {
        hiddenAttrs += ` data-${_esc(k)}="${_esc(cfg.dataAttrs[k])}"`;
      });
    }
    hiddenAttrs += ` value="${_esc(initialValue)}"`;

    function buildListHtml(itemList) {
      const rows = itemList.map((item) => {
        const v = _esc(item.value);
        const l = _esc(item.label);
        return `<li class="cdd-item" data-value="${v}" title="${l}">${l}</li>`;
      }).join("");
      return rows + (showCustom ? '<li class="cdd-item cdd-item-custom" data-value="custom">Custom\u2026</li>' : "");
    }

    container.classList.add("cdd-wrapper");
    _setHtml(container, `
      <input ${hiddenAttrs}>
      <button class="cdd-trigger" type="button" aria-haspopup="listbox">
        <span class="cdd-label"></span>
        ${_CHEVRON}
      </button>
      <div class="cdd-panel" role="listbox">
        ${showSearch ? `<div class="cdd-search-wrap">${_SEARCH_ICON}<input type="text" class="cdd-search" placeholder="Search\u2026" autocomplete="off"></div>` : ""}
        <ul class="cdd-list">${buildListHtml(currentItems)}</ul>
      </div>`);

    const hiddenInput = container.querySelector('input[type="hidden"]');
    const trigger = container.querySelector(".cdd-trigger");
    const labelSpan = container.querySelector(".cdd-label");
    const panel = container.querySelector(".cdd-panel");
    const searchEl = showSearch ? container.querySelector(".cdd-search") : null;
    const listEl = container.querySelector(".cdd-list");

    function getLabelFor(value) {
      if (value === "custom") return "Custom\u2026";
      const found = currentItems.find((item) => item.value === value);
      return found ? found.label : (value || "");
    }

    function syncSelected(value) {
      listEl.querySelectorAll(".cdd-item").forEach((li) => {
        li.classList.toggle("cdd-item-selected", li.dataset.value === value);
      });
    }

    function openPanel() {
      rootEl.querySelectorAll(".cdd-wrapper.cdd-open").forEach((other) => {
        if (other !== container) other.classList.remove("cdd-open");
      });
      container.classList.add("cdd-open");
      if (searchEl) {
        searchEl.value = "";
        listEl.querySelectorAll(".cdd-item").forEach((li) => li.classList.remove("cdd-item-hidden"));
        requestAnimationFrame(() => searchEl.focus());
      }
    }

    function closePanel() {
      container.classList.remove("cdd-open");
    }

    function applyCustomInputVisibility(value) {
      if (!customInput) return;
      customInput.style.display = value === "custom" ? "block" : "none";
    }

    function selectItem(value, label) {
      hiddenInput.value = value;
      labelSpan.textContent = label;
      syncSelected(value);
      applyCustomInputVisibility(value);
      closePanel();
      if (value === "custom" && customInput) {
        customInput.focus();
      }
      if (cfg.onChange) cfg.onChange(value, label);
    }

    // Init display
    const initLabel = getLabelFor(initialValue) || cfg.placeholder || (currentItems.length ? currentItems[0].label : "");
    labelSpan.textContent = initLabel;
    syncSelected(initialValue);
    applyCustomInputVisibility(initialValue);

    // Events
    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (container.classList.contains("cdd-open")) closePanel();
      else openPanel();
    });

    panel.addEventListener("click", (e) => e.stopPropagation());

    listEl.addEventListener("click", (e) => {
      const li = e.target.closest(".cdd-item");
      if (!li) return;
      e.stopPropagation();
      selectItem(li.dataset.value, li.textContent.trim());
    });

    if (searchEl) {
      searchEl.addEventListener("input", () => {
        const q = searchEl.value.trim().toLowerCase();
        listEl.querySelectorAll(".cdd-item").forEach((li) => {
          if (li.classList.contains("cdd-item-custom")) return;
          li.classList.toggle("cdd-item-hidden", !!q && !li.textContent.toLowerCase().includes(q));
        });
      });
    }

    return {
      getValue() {
        return hiddenInput.value;
      },
      setValue(value) {
        const label = getLabelFor(value) || cfg.placeholder || "";
        hiddenInput.value = value;
        labelSpan.textContent = label;
        syncSelected(value);
        applyCustomInputVisibility(value);
      },
      setItems(newItems) {
        currentItems = Array.isArray(newItems) ? newItems.slice() : [];
        const prev = hiddenInput.value;
        _setHtml(listEl, buildListHtml(currentItems));
        syncSelected(prev);
        const newLabel = getLabelFor(prev);
        if (newLabel) labelSpan.textContent = newLabel;
      },
      setDisabled(disabled) {
        container.classList.toggle("cdd-disabled", !!disabled);
        trigger.disabled = !!disabled;
      },
      destroy() {
        container.classList.remove("cdd-wrapper", "cdd-open", "cdd-disabled");
        container.innerHTML = "";
      }
    };
  }

  namespace.customDropdown = { create };
}(globalThis));
