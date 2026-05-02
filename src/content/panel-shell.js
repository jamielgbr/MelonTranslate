(function initPanelShell(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const messageTypes = namespace.messages.types;
  const pu = namespace.pageUtils;
  const themePanels = new Set();

  const THEME_TOGGLE_HTML = `
    <button class="theme-toggle" type="button" aria-label="Toggle dark mode">
      <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
      </svg>
      <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    </button>`;

  const BASE_CSS = `
    :host { all: initial; }
    .panel,
    .panel * {
      box-sizing: border-box;
    }
    .panel {
      --mt-bg: rgba(255, 255, 255, 0.98);
      --mt-surface: #ffffff;
      --mt-surface-subtle: rgba(248, 250, 252, 0.95);
      --mt-text: #111827;
      --mt-text-muted: #64748b;
      --mt-text-secondary: #334155;
      --mt-border: rgba(15, 23, 42, 0.12);
      --mt-border-strong: rgba(15, 23, 42, 0.18);
      --mt-shadow: rgba(15, 23, 42, 0.18);
      --mt-header-bg: rgba(248, 250, 252, 0.92);
      --mt-input-bg: #ffffff;
      --mt-input-border: rgba(15, 23, 42, 0.14);
      --mt-input-border-hover: rgba(15, 118, 110, 0.4);
      --mt-reasoning-bg: rgba(15, 118, 110, 0.06);
      --mt-btn-bg: #ffffff;
      --mt-btn-border: rgba(15, 23, 42, 0.14);
      --mt-refresh-border: rgba(15, 118, 110, 0.24);
      --mt-refresh-text: #0f766e;
      --mt-accent: #0f766e;
      --mt-accent-strong: #115e59;
      --mt-accent-soft: rgba(15, 118, 110, 0.08);
      --mt-speak: rgba(15, 118, 110, 0.72);
      --mt-cdd-bg: rgba(255, 255, 255, 0.98);
      --mt-cdd-border: rgba(15, 23, 42, 0.14);
      --mt-cdd-shadow: rgba(15, 23, 42, 0.16);
      --mt-cdd-search-bg: rgba(248, 250, 252, 0.98);
      --mt-divider: rgba(15, 23, 42, 0.1);
      --mt-cdd-hover: rgba(15, 118, 110, 0.08);
      --mt-cdd-selected: #0f766e;
      --mt-chevron: #64748b;
      position: fixed;
      z-index: 2147483647;
      width: min(380px, calc(100vw - 24px));
      min-width: 300px;
      max-width: calc(100vw - 24px);
      max-height: calc(100vh - 24px);
      display: flex;
      flex-direction: column;
      background: var(--mt-bg);
      color: var(--mt-text);
      border: 1px solid var(--mt-border);
      border-radius: 12px;
      box-shadow: 0 18px 54px var(--mt-shadow);
      font-family: ui-sans-serif, system-ui, sans-serif;
      overflow: hidden;
      resize: both;
      backdrop-filter: blur(14px);
    }
    .panel.dark {
      --mt-bg: rgba(12, 17, 29, 0.98);
      --mt-surface: rgba(15, 23, 42, 0.92);
      --mt-surface-subtle: rgba(30, 41, 59, 0.72);
      --mt-text: #f8fafc;
      --mt-text-muted: #94a3b8;
      --mt-text-secondary: #d1fae5;
      --mt-border: rgba(148, 163, 184, 0.16);
      --mt-border-strong: rgba(148, 163, 184, 0.24);
      --mt-shadow: rgba(0, 0, 0, 0.48);
      --mt-header-bg: rgba(15, 23, 42, 0.82);
      --mt-input-bg: rgba(15, 23, 42, 0.8);
      --mt-input-border: rgba(148, 163, 184, 0.2);
      --mt-input-border-hover: rgba(16, 185, 129, 0.5);
      --mt-reasoning-bg: rgba(16, 185, 129, 0.08);
      --mt-btn-bg: rgba(15, 23, 42, 0.95);
      --mt-btn-border: rgba(148, 163, 184, 0.22);
      --mt-refresh-border: rgba(16, 185, 129, 0.34);
      --mt-refresh-text: #6ee7b7;
      --mt-accent: #10b981;
      --mt-accent-strong: #34d399;
      --mt-accent-soft: rgba(16, 185, 129, 0.11);
      --mt-speak: rgba(110, 231, 183, 0.7);
      --mt-cdd-bg: rgba(12, 17, 29, 0.98);
      --mt-cdd-border: rgba(148, 163, 184, 0.2);
      --mt-cdd-shadow: rgba(0, 0, 0, 0.5);
      --mt-cdd-search-bg: rgba(15, 23, 42, 0.85);
      --mt-divider: rgba(148, 163, 184, 0.16);
      --mt-cdd-hover: rgba(16, 185, 129, 0.1);
      --mt-cdd-selected: #10b981;
      --mt-chevron: #94a3b8;
    }
    .hidden { display: none; }
    .header {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 9px 10px 8px 12px;
      background: var(--mt-header-bg);
      border-bottom: 1px solid var(--mt-divider);
      user-select: none;
      position: relative;
      z-index: 3;
    }
    .header-main {
      flex: 1 1 auto;
      min-width: 0;
      height: 26px;
      position: relative;
      display: flex;
      align-items: center;
    }
    .title {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--mt-text-secondary);
      opacity: 1;
      transform: translateY(0);
      transition: opacity 260ms ease, transform 260ms ease;
    }
    .model-switcher {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      min-width: 0;
      opacity: 0;
      transform: translateY(4px);
      pointer-events: none;
      transition: opacity 260ms ease, transform 260ms ease;
    }
    .panel.model-revealed .title {
      opacity: 0;
      transform: translateY(-4px);
      pointer-events: none;
    }
    .panel.model-revealed .model-switcher {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    .header-actions,
    .translation-actions,
    .actions {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex: 0 0 auto;
    }
    .theme-toggle,
    .close,
    .expand,
    .speak {
      border: 0;
      background: transparent;
      color: var(--mt-text-muted);
      cursor: pointer;
      line-height: 0;
      border-radius: 999px;
      transition: background-color 150ms ease, color 150ms ease;
    }
    .theme-toggle,
    .close {
      width: 26px;
      height: 26px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }
    .theme-toggle:hover,
    .close:hover,
    .expand:hover,
    .speak:hover {
      background: var(--mt-accent-soft);
      color: var(--mt-accent);
    }
    .theme-toggle svg {
      width: 14px;
      height: 14px;
      display: block;
    }
    .theme-toggle .icon-sun { display: none; }
    .theme-toggle .icon-moon { display: block; }
    .panel.dark .theme-toggle .icon-sun { display: block; }
    .panel.dark .theme-toggle .icon-moon { display: none; }
    .close {
      font-size: 17px;
      line-height: 1;
    }
    .body {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 10px;
      overflow: hidden;
    }
    .controls {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 8px;
      flex: 0 0 auto;
      padding: 8px;
      border: 1px solid var(--mt-border);
      border-radius: 10px;
      background: var(--mt-surface-subtle);
    }
    .control {
      min-width: 0;
    }
    label,
    .control label,
    .section-label {
      display: block;
      margin: 0 0 5px;
      font-size: 10px;
      color: var(--mt-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 700;
    }
    select,
    input,
    textarea,
    .control .cdd-trigger {
      box-sizing: border-box;
      width: 100%;
      border: 1px solid var(--mt-input-border);
      border-radius: 8px;
      background: var(--mt-input-bg);
      color: var(--mt-text);
      font: inherit;
      font-size: 12px;
      padding: 7px 8px;
      min-width: 0;
    }
    select:hover,
    input:hover,
    .control .cdd-trigger:hover {
      border-color: var(--mt-input-border-hover);
    }
    input:not(.cdd-search) { margin-top: 6px; }
    textarea {
      resize: none;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }
    textarea[readonly] { cursor: default; }
    .source-panel {
      flex: 0 0 auto;
      border: 1px solid var(--mt-border);
      border-radius: 10px;
      background: var(--mt-surface);
      overflow: hidden;
    }
    .source-panel summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 10px;
      cursor: pointer;
      list-style: none;
      color: var(--mt-text-secondary);
    }
    .source-panel summary::-webkit-details-marker { display: none; }
    .source-panel summary label,
    .source-summary-copy .section-label,
    .translation-header .section-label,
    .translation-header label {
      margin: 0;
    }
    .source-summary-copy {
      min-width: 0;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .source-size {
      color: var(--mt-text-muted);
      font-size: 11px;
      white-space: nowrap;
    }
    .source-toggle-label {
      color: var(--mt-accent);
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
    .source-summary-actions {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex: 0 0 auto;
    }
    .source-toggle-label::before { content: "Show"; }
    .source-panel[open] .source-toggle-label::before { content: "Hide"; }
    .source-body {
      border-top: 1px solid var(--mt-divider);
      padding: 9px 10px 10px;
      max-height: 150px;
      overflow: auto;
    }
    .translation-panel {
      flex: 1 1 auto;
      min-height: 138px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--mt-border-strong);
      border-radius: 10px;
      background: var(--mt-surface);
    }
    .translation-header {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 9px 10px;
      border-bottom: 1px solid var(--mt-divider);
      background: var(--mt-surface-subtle);
    }
    .translation-scroll {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: 12px 12px 14px;
    }
    .text {
      margin: 0;
      font-size: 13px;
      line-height: 1.58;
      color: var(--mt-text);
      white-space: pre-wrap;
      word-break: break-word;
    }
    .translation-text {
      font-size: 14px;
      line-height: 1.65;
    }
    .muted { color: var(--mt-text-muted); }
    .reasoning {
      margin-top: 10px;
      border: 1px solid var(--mt-border);
      border-radius: 8px;
      background: var(--mt-reasoning-bg);
      padding: 7px 9px;
    }
    .reasoning-summary {
      cursor: pointer;
      color: var(--mt-text-muted);
      font-size: 12px;
    }
    .reasoning-text {
      margin: 7px 0 0;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--mt-text-secondary);
      font-size: 12px;
      line-height: 1.55;
      max-height: 160px;
      overflow-y: auto;
      padding-right: 4px;
    }
    .footer {
      flex: 0 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding: 9px 10px 10px;
      border-top: 1px solid var(--mt-divider);
      background: var(--mt-header-bg);
    }
    .meta,
    .status {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      color: var(--mt-text-muted);
    }
    .meta { cursor: help; }
    .copy,
    .refresh,
    .actions button {
      border: 1px solid var(--mt-btn-border);
      background: var(--mt-btn-bg);
      color: var(--mt-text);
      padding: 7px 11px;
      border-radius: 8px;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
    }
    .refresh {
      border-color: var(--mt-refresh-border);
      color: var(--mt-refresh-text);
    }
    .actions button:hover,
    .copy:hover,
    .refresh:hover {
      border-color: rgba(15, 118, 110, 0.32);
      background: var(--mt-accent-soft);
      color: var(--mt-accent);
    }
    .actions button.primary {
      background: var(--mt-accent);
      color: white;
      border-color: var(--mt-accent);
    }
    .actions button.primary:hover {
      background: var(--mt-accent-strong);
      border-color: var(--mt-accent-strong);
      color: white;
    }
    .copy:disabled,
    .refresh:disabled,
    .actions button:disabled,
    .expand:disabled,
    .speak:disabled,
    select:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .expand:disabled:hover,
    .speak:disabled:hover {
      background: transparent;
      color: var(--mt-speak);
    }
    .expand,
    .speak {
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      color: var(--mt-speak);
    }
    .expand svg,
    .speak svg {
      width: 16px;
      height: 16px;
      display: block;
    }
    .copy:focus-visible,
    .cdd-trigger:focus-visible,
    .actions button:focus-visible,
    .expand:focus-visible,
    .speak:focus-visible,
    .refresh:focus-visible,
    .close:focus-visible,
    .theme-toggle:focus-visible,
    select:focus-visible,
    input:focus-visible,
    textarea:focus-visible {
      outline: 2px solid var(--mt-accent);
      outline-offset: 2px;
    }
    .translation-scroll:focus-visible {
      outline: 2px solid var(--mt-accent);
      outline-offset: -3px;
    }
    .error-badge {
      display: inline-block;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 999px;
      margin-bottom: 8px;
    }
    .error-auth   { background: rgba(239,68,68,0.12); color: #dc2626; }
    .error-rate   { background: rgba(234,179,8,0.15);  color: #b45309; }
    .error-server { background: rgba(251,146,60,0.12); color: #c2410c; }
    .error-net    { background: rgba(100,116,139,0.12); color: #475569; }
    .panel.dark .error-auth   { background: rgba(239,68,68,0.18); color: #fca5a5; }
    .panel.dark .error-rate   { background: rgba(234,179,8,0.18);  color: #fde047; }
    .panel.dark .error-server { background: rgba(251,146,60,0.18); color: #fdba74; }
    .panel.dark .error-net    { background: rgba(148,163,184,0.18); color: #94a3b8; }
    .cdd-lang-wrap { width: 100%; }
    .cdd-model-wrap { width: min(230px, 100%); }
    .cdd-wrapper { position: relative; min-width: 0; }
    .cdd-trigger { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 7px 8px; border-radius: 8px; font: inherit; font-size: 12px; border: 1px solid var(--mt-input-border); background: var(--mt-input-bg); color: var(--mt-text); cursor: pointer; text-align: left; min-width: 0; }
    .cdd-model-wrap .cdd-trigger { min-height: 26px; padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 650; background: var(--mt-btn-bg); }
    .cdd-trigger:hover { border-color: var(--mt-input-border-hover); }
    .cdd-disabled .cdd-trigger { opacity: 0.58; cursor: default; }
    .cdd-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cdd-chevron { flex: 0 0 auto; width: 12px; height: 12px; color: var(--mt-chevron); transition: transform 150ms ease; }
    .cdd-open .cdd-chevron { transform: rotate(180deg); }
    .cdd-panel { display: none; position: absolute; left: 0; top: calc(100% + 4px); z-index: 100; background: var(--mt-cdd-bg); border: 1px solid var(--mt-cdd-border); border-radius: 10px; box-shadow: 0 8px 24px var(--mt-cdd-shadow); overflow: hidden; max-height: 220px; min-width: 100%; width: max-content; max-width: min(340px, calc(100vw - 48px)); flex-direction: column; }
    .cdd-open .cdd-panel { display: flex; }
    .cdd-search-wrap { padding: 6px 6px 4px; border-bottom: 1px solid var(--mt-divider); position: relative; }
    .cdd-search { box-sizing: border-box; width: 100%; padding: 5px 6px 5px 24px; border-radius: 6px; font: inherit; font-size: 12px; border: 1px solid var(--mt-divider); background: var(--mt-cdd-search-bg); color: var(--mt-text); }
    .cdd-search:focus { outline: none; border-color: var(--mt-accent); }
    .cdd-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 12px; height: 12px; color: var(--mt-chevron); pointer-events: none; }
    .cdd-list { list-style: none; margin: 0; padding: 4px 0; overflow-y: auto; flex: 1 1 auto; }
    .cdd-item { padding: 6px 10px; font-size: 12px; cursor: pointer; color: var(--mt-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cdd-item:hover { background: var(--mt-cdd-hover); }
    .cdd-item.cdd-item-selected { color: var(--mt-cdd-selected); font-weight: 600; }
    .cdd-item.cdd-item-hidden { display: none; }
    .cdd-item.cdd-item-custom { border-top: 1px solid var(--mt-divider); margin-top: 2px; padding-top: 6px; color: var(--mt-text-muted); }
    @media (max-width: 520px) {
      .panel { width: calc(100vw - 24px); min-width: 0; }
      .controls { grid-template-columns: 1fr; }
      .footer { align-items: flex-start; flex-direction: column; }
      .actions { width: 100%; justify-content: flex-end; }
      .cdd-model-wrap { width: 100%; }
    }`;

  function escapeHtml(value) {
    return pu.escapeHtml(value);
  }

  function bindThemeToggle(panel, button) {
    if (!panel || !button) {
      return;
    }
    themePanels.add(panel);
    if (button.dataset.themeBound) {
      return;
    }
    button.dataset.themeBound = "1";
    api.storage.get("local", "melontranslateTheme").then(function(result) {
      setPanelTheme(!!result && result.melontranslateTheme === "dark");
    }).catch(function() {});
    button.addEventListener("click", function() {
      const isDark = !panel.classList.contains("dark");
      setPanelTheme(isDark);
      api.storage.set("local", { melontranslateTheme: isDark ? "dark" : "light" }).catch(function() {});
    });
  }

  function setPanelTheme(isDark) {
    themePanels.forEach(function(panel) {
      if (!panel.isConnected) {
        themePanels.delete(panel);
        return;
      }
      panel.classList.toggle("dark", !!isDark);
    });
  }

  function createPanelHost(options) {
    const opts = options || {};
    let host = document.getElementById(opts.hostId);
    if (host) {
      return host;
    }

    host = document.createElement("div");
    host.id = opts.hostId;
    host.style.all = "initial";
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const titleId = opts.titleId || "";
    const titleAttrs = titleId ? ` id="${escapeHtml(titleId)}"` : "";
    const modelLabel = opts.modelLabel || "Translation model";
    shadow.innerHTML = `
      <style>${BASE_CSS}${opts.extraCss || ""}</style>
      <section class="panel hidden ${escapeHtml(opts.panelClass || "")}" role="dialog" aria-label="${escapeHtml(opts.ariaLabel || opts.title || "Melon Translate")}" aria-live="polite">
        <div class="header">
          <div class="header-main">
            <span class="title"${titleAttrs}>${escapeHtml(opts.title || "Melon Translate")}</span>
            <div class="model-switcher" data-role="model-switcher" aria-label="${escapeHtml(modelLabel)}">
              <div class="cdd-model-wrap" data-role="model-container"></div>
            </div>
          </div>
          <div class="header-actions">
            ${THEME_TOGGLE_HTML}
            <button class="close" type="button" aria-label="${escapeHtml(opts.closeLabel || "Close")}">×</button>
          </div>
        </div>
        <div class="body">${opts.bodyHtml || ""}</div>
        <div class="footer">${opts.footerHtml || ""}</div>
      </section>`;

    bindThemeToggle(shadow.querySelector(".panel"), shadow.querySelector(".theme-toggle"));
    return host;
  }

  function clampToViewport(panel, left, top) {
    const margin = 12;
    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    return {
      left: Math.min(Math.max(left, margin), maxLeft),
      top: Math.min(Math.max(top, margin), maxTop)
    };
  }

  function clearModelReveal(state) {
    if (state && state.modelRevealTimer) {
      clearTimeout(state.modelRevealTimer);
      state.modelRevealTimer = null;
    }
  }

  function scheduleModelReveal(panel, state, revealImmediately) {
    clearModelReveal(state);
    if (revealImmediately) {
      panel.classList.add("model-revealed");
      return;
    }
    panel.classList.remove("model-revealed");
    state.modelRevealTimer = setTimeout(function() {
      state.modelRevealTimer = null;
      if (!panel.classList.contains("hidden")) {
        panel.classList.add("model-revealed");
      }
    }, 1500);
  }

  function routeFromModelKey(modelKey) {
    const parsed = pu.parseDefaultModelKey(modelKey);
    if (!parsed.providerId || !parsed.model) {
      return { providerIds: [], modelOverrides: {} };
    }
    return {
      providerIds: [parsed.providerId],
      modelOverrides: { [parsed.providerId]: parsed.model }
    };
  }

  function createModelPicker(container, config) {
    const cfg = config || {};
    const state = {
      dropdown: null,
      modelOptions: [],
      selectedModelKey: "",
      requestId: 0
    };

    function getRoute() {
      return routeFromModelKey(state.dropdown ? state.dropdown.getValue() : state.selectedModelKey);
    }

    function setDropdown(items, selected, disabled) {
      const normalizedItems = Array.isArray(items) ? items : [];
      const selectedValue = String(selected || "");
      if (!state.dropdown) {
        state.dropdown = namespace.customDropdown.create(container, {
          dataAttrs: cfg.dataAttrs || { role: "model" },
          items: normalizedItems,
          selected: selectedValue,
          showSearch: true,
          placeholder: cfg.placeholder || "Choose model",
          rootElement: cfg.rootElement || document,
          onChange(value) {
            const nextValue = String(value || "");
            if (nextValue === state.selectedModelKey) {
              return;
            }
            state.selectedModelKey = nextValue;
            if (typeof cfg.onChange === "function") {
              cfg.onChange(getRoute(), state.selectedModelKey);
            }
          }
        });
      } else {
        state.dropdown.setItems(normalizedItems);
        state.dropdown.setValue(selectedValue);
      }
      state.dropdown.setDisabled(!!disabled);
    }

    function setPlaceholder(label) {
      state.selectedModelKey = "";
      setDropdown([{ value: "", label: label }], "", true);
    }

    function render(modelState) {
      const sourceOptions = Array.isArray(modelState && modelState.modelOptions)
        ? modelState.modelOptions
        : [];
      state.modelOptions = sourceOptions.slice();
      const items = sourceOptions.map(function(item) {
        return {
          value: item.key,
          label: item.label || `${item.providerName || item.providerId} · ${item.model}`
        };
      }).filter(function(item) { return item.value; });

      if (!items.length) {
        setPlaceholder(cfg.emptyLabel || "No models available");
        return false;
      }

      let selectedKey = state.selectedModelKey;
      if (!items.some(function(item) { return item.value === selectedKey; })) {
        selectedKey = String(modelState && modelState.selectedModelKey || "").trim();
      }
      if (!items.some(function(item) { return item.value === selectedKey; })) {
        selectedKey = items[0].value;
      }

      state.selectedModelKey = selectedKey;
      setDropdown(items, selectedKey, false);
      return true;
    }

    function load() {
      const requestId = ++state.requestId;
      if (state.modelOptions.length) {
        render({ modelOptions: state.modelOptions, selectedModelKey: state.selectedModelKey });
      } else {
        setPlaceholder(cfg.loadingLabel || "Loading models...");
      }

      return api.runtime.sendMessage({ type: messageTypes.getTranslationModelOptions }).then(function(response) {
        if (requestId !== state.requestId) {
          return false;
        }
        if (!response || !response.ok) {
          throw new Error(response?.error?.message || "Could not load model options.");
        }
        return render(response.data || {});
      }).catch(function() {
        if (requestId !== state.requestId) {
          return false;
        }
        if (!state.modelOptions.length) {
          setPlaceholder(cfg.errorLabel || "Models unavailable");
        }
        return !!state.modelOptions.length;
      });
    }

    return {
      load,
      render,
      getRoute,
      hasOptions() {
        return !!state.modelOptions.length;
      },
      getValue() {
        return state.dropdown ? state.dropdown.getValue() : state.selectedModelKey;
      }
    };
  }

  namespace.panelShell = {
    createPanelHost,
    createModelPicker,
    bindThemeToggle,
    scheduleModelReveal,
    clearModelReveal,
    clampToViewport,
    routeFromModelKey
  };
}(globalThis));
