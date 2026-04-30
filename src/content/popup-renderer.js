(function initPopupRenderer(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const messageTypes = namespace.messages.types;
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
    sourceLanguageDd: null,
    targetLanguageDd: null,
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
  const pu = namespace.pageUtils;
  const ra = namespace.readAloud;
  const LONG_SOURCE_THRESHOLD = 520;
  const LONG_TRANSLATION_THRESHOLD = 780;
  const LONG_LINE_THRESHOLD = 7;

  function estimateOutputTokens(text) {
    return pu.estimateOutputTokens(text);
  }

  function formatRate(value) {
    return pu.formatRate(value);
  }

  function formatMillis(value) {
    return pu.formatMillis(value);
  }

  function buildTokenTooltip(firstTokenMs, outputTokens, tokPerSec) {
    return `First token: ${formatMillis(firstTokenMs)}\nOutput: ${outputTokens} tok\n${formatRate(tokPerSec)} tok/s`;
  }

  function ensureHost() {
    let host = document.getElementById(popupHostId);
    if (host) {
      return host;
    }

    host = document.createElement("div");
    host.id = popupHostId;
    host.style.all = "initial";
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    api.storage.get("local", "melontranslateTheme").then(function(result) {
      if (result && result.melontranslateTheme === "dark") {
        const panel = shadow.querySelector(".panel");
        if (panel) { panel.classList.add("dark"); }
      }
    }).catch(function() {});
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }
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
        .panel {
          position: fixed;
          z-index: 2147483647;
          width: min(380px, calc(100vw - 24px));
          min-width: 300px;
          min-height: 190px;
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
        .panel.is-long {
          width: min(720px, calc(100vw - 24px));
          height: min(620px, calc(100vh - 24px));
          min-height: min(420px, calc(100vh - 24px));
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 9px 10px 8px 12px;
          background: var(--mt-header-bg);
          border-bottom: 1px solid var(--mt-divider);
          cursor: move;
          user-select: none;
          flex: 0 0 auto;
        }
        .title {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--mt-text-secondary);
        }
        .header-actions,
        .actions {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex: 0 0 auto;
        }
        .theme-toggle,
        .close,
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
        .control select,
        .control .cdd-trigger,
        .control input:not(.cdd-search) {
          width: 100%;
          border: 1px solid var(--mt-input-border);
          border-radius: 8px;
          background: var(--mt-input-bg);
          color: var(--mt-text);
          font-size: 12px;
          padding: 7px 8px;
        }
        .control input:not(.cdd-search) {
          margin-top: 6px;
        }
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
        .source-panel summary::-webkit-details-marker {
          display: none;
        }
        .source-summary-copy {
          min-width: 0;
          display: flex;
          align-items: baseline;
          gap: 8px;
        }
        .source-summary-copy .section-label {
          margin: 0;
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
        .source-toggle-label::before {
          content: "Show";
        }
        .source-panel[open] .source-toggle-label::before {
          content: "Hide";
        }
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
        .translation-header .section-label {
          margin: 0;
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
        .panel.is-long .translation-text {
          font-size: 15px;
        }
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
        .muted {
          color: var(--mt-text-muted);
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
        .meta {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          color: var(--mt-text-muted);
          cursor: help;
        }
        .copy,
        .refresh {
          border: 1px solid var(--mt-btn-border);
          background: var(--mt-btn-bg);
          color: var(--mt-text);
          padding: 7px 11px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
        }
        .refresh {
          border-color: var(--mt-refresh-border);
          color: var(--mt-refresh-text);
        }
        .copy:disabled,
        .refresh:disabled,
        .speak:disabled {
          opacity: 0.42;
          cursor: default;
        }
        .speak {
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          color: var(--mt-speak);
        }
        .speak svg {
          width: 16px;
          height: 16px;
          display: block;
        }
        .copy:focus-visible,
        .speak:focus-visible,
        .refresh:focus-visible,
        .close:focus-visible,
        .theme-toggle:focus-visible {
          outline: 2px solid var(--mt-accent);
          outline-offset: 2px;
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
        .hidden {
          display: none;
        }
        .cdd-lang-wrap { width: 100%; }
        .cdd-wrapper { position: relative; min-width: 0; }
        .cdd-trigger { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 7px 8px; border-radius: 8px; font: inherit; font-size: 12px; border: 1px solid var(--mt-input-border); background: var(--mt-input-bg); color: var(--mt-text); cursor: pointer; text-align: left; min-width: 0; }
        .cdd-trigger:hover { border-color: var(--mt-input-border-hover); }
        .cdd-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cdd-chevron { flex: 0 0 auto; width: 12px; height: 12px; color: var(--mt-chevron); transition: transform 150ms ease; }
        .cdd-open .cdd-chevron { transform: rotate(180deg); }
        .cdd-panel { display: none; position: absolute; left: 0; top: calc(100% + 4px); z-index: 100; background: var(--mt-cdd-bg); border: 1px solid var(--mt-cdd-border); border-radius: 10px; box-shadow: 0 8px 24px var(--mt-cdd-shadow); overflow: hidden; max-height: 220px; min-width: 100%; width: max-content; max-width: min(320px, calc(100vw - 48px)); flex-direction: column; }
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
          .panel,
          .panel.is-long {
            width: calc(100vw - 24px);
            min-width: 0;
          }
          .panel.is-long {
            height: min(560px, calc(100vh - 24px));
            min-height: min(360px, calc(100vh - 24px));
          }
          .controls {
            display: grid;
            grid-template-columns: 1fr;
          }
          .footer {
            align-items: flex-start;
            flex-direction: column;
          }
          .actions {
            width: 100%;
            justify-content: flex-end;
          }
        }
      </style>
      <section class="panel hidden" role="dialog" aria-label="Melon Translate" aria-live="polite">
        <div class="header">
          <span class="title" id="melontranslate-dlg-title">Melon Translate</span>
          <div class="header-actions">
            <button class="theme-toggle" type="button" aria-label="Toggle dark mode">
              <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="12" cy="12" r="4"/>
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
              </svg>
              <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            </button>
            <button class="close" type="button" aria-label="Close popup">×</button>
          </div>
        </div>
        <div class="body">
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
              <button class="speak hidden" type="button" aria-label="Read translation aloud">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="currentColor"/></svg>
              </button>
            </div>
            <div class="translation-scroll" data-role="translation-scroll">
              <div data-role="error-badge"></div>
              <p class="text translation-text muted" data-role="translation">Translation will appear here...</p>
              <details class="reasoning hidden" data-role="reasoning-wrap">
                <summary class="reasoning-summary">Model reasoning</summary>
                <p class="reasoning-text" data-role="reasoning-text"></p>
              </details>
            </div>
          </section>
        </div>
        <div class="footer">
          <span class="meta" data-role="meta"></span>
          <div class="actions">
            <button class="refresh" type="button" aria-label="Refresh">Refresh</button>
            <button class="copy hidden" type="button" aria-label="Copy translation">Copy</button>
          </div>
        </div>
      </section>
    `;
    return host;
  }

  function getElements() {
    const host = ensureHost();
    const shadow = host.shadowRoot;
    return {
      host,
      panel: shadow.querySelector(".panel"),
      header: shadow.querySelector(".header"),
      source: shadow.querySelector('[data-role="source"]'),
      sourceWrap: shadow.querySelector('[data-role="source-wrap"]'),
      sourceSize: shadow.querySelector('[data-role="source-size"]'),
      targetLanguage: shadow.querySelector('[data-role="target-language"]'),
      targetLanguageCustom: shadow.querySelector('[data-role="target-language-custom"]'),
      sourceLanguage: shadow.querySelector('[data-role="source-language"]'),
      sourceLanguageCustom: shadow.querySelector('[data-role="source-language-custom"]'),
      errorBadge: shadow.querySelector('[data-role="error-badge"]'),
      translation: shadow.querySelector('[data-role="translation"]'),
      translationScroll: shadow.querySelector('[data-role="translation-scroll"]'),
      reasoningWrap: shadow.querySelector('[data-role="reasoning-wrap"]'),
      reasoningText: shadow.querySelector('[data-role="reasoning-text"]'),
      meta: shadow.querySelector('[data-role="meta"]'),
      refresh: shadow.querySelector(".refresh"),
      speak: shadow.querySelector(".speak:not(.speak-source)"),
      speakSource: shadow.querySelector(".speak-source"),
      copy: shadow.querySelector(".copy"),
      close: shadow.querySelector(".close"),
      themeToggle: shadow.querySelector(".theme-toggle")
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

  function getCurrentTranslatedText(elements) {
    const text = String(elements.translation.textContent || "").trim();
    if (!text || elements.translation.classList.contains("muted")) {
      return "";
    }
    return text;
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

  function stopReadAloud(elements) {
    ra.stopAudioState(readAloudState);
    updateSpeakButton(elements, !!getCurrentTranslatedText(elements));
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
  }

  function playClip(audio, url, getToken, token) {
    return ra.playClip(audio, url, getToken, token);
  }

  async function playReadAloudClips(elements, clips, token, getToken, onAudio, onDone) {
    return ra.playReadAloudClips(clips, token, getToken, onAudio, onDone);
  }

  async function toggleReadAloud() {
    const elements = getElements();
    const text = getCurrentTranslatedText(elements);
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
      await playReadAloudClips(
        elements,
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
      await playReadAloudClips(
        elements,
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

  function bindClose(elements) {
    if (elements.close.dataset.bound) {
      return;
    }
    elements.close.dataset.bound = "1";
    elements.refresh.dataset.bound = "1";
    elements.speak.dataset.bound = "1";
    elements.speakSource.dataset.bound = "1";
    elements.themeToggle.dataset.bound = "1";
    elements.close.addEventListener("click", () => namespace.popupRenderer.hide());
    elements.speak.addEventListener("click", toggleReadAloud);
    elements.speakSource.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleReadAloudSource();
    });
    elements.themeToggle.addEventListener("click", () => {
      const isDark = elements.panel.classList.toggle("dark");
      api.storage.set("local", { melontranslateTheme: isDark ? "dark" : "light" }).catch(function() {});
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
        namespace.popupRenderer.hide();
      }
    }, true);
  }

  function clampToViewport(panel, left, top) {
    const margin = 12;
    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    const clampedLeft = Math.min(Math.max(left, margin), maxLeft);
    const clampedTop = Math.min(Math.max(top, margin), maxTop);
    return { left: clampedLeft, top: clampedTop };
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

    elements.header.addEventListener("pointerdown", (event) => {
      if (event.target && event.target.closest(".close, .theme-toggle")) {
        return;
      }
      popupState.dragging = true;
      const rect = elements.panel.getBoundingClientRect();
      popupState.dragOffsetX = event.clientX - rect.left;
      popupState.dragOffsetY = event.clientY - rect.top;
      elements.header.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    elements.header.addEventListener("pointermove", (event) => {
      if (!popupState.dragging) {
        return;
      }
      const nextLeft = event.clientX - popupState.dragOffsetX;
      const nextTop = event.clientY - popupState.dragOffsetY;
      const clamped = clampToViewport(elements.panel, nextLeft, nextTop);
      elements.panel.style.left = `${clamped.left}px`;
      elements.panel.style.top = `${clamped.top}px`;
    });

    const stopDragging = (event) => {
      if (!popupState.dragging) {
        return;
      }
      popupState.dragging = false;
      if (elements.header.hasPointerCapture(event.pointerId)) {
        elements.header.releasePointerCapture(event.pointerId);
      }
      keepPanelInViewport(elements.panel);
    };

    elements.header.addEventListener("pointerup", stopDragging);
    elements.header.addEventListener("pointercancel", stopDragging);
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
    show({ sourceText, rect, targetLanguage, sourceLanguage }) {
      const elements = getElements();
      bindClose(elements);
      bindDrag(elements);
      bindViewportGuard(elements);
      renderLanguageOptions(elements, targetLanguage, sourceLanguage);
      const normalizedSourceText = String(sourceText || "");
      const sourceIsLong = isLongContent(normalizedSourceText, "");
      popupState.streamStartedAtMs = Date.now();
      popupState.firstTokenAtMs = 0;
      popupState.outputTokens = 0;
      popupState.tokPerSec = 0;
      popupState.fromCache = false;
      popupState.detectedSourceLanguage = "";
      popupState.targetLanguage = String(targetLanguage || "en").trim();
      elements.panel.style.width = "";
      elements.panel.style.height = "";
      elements.panel.classList.toggle("is-long", sourceIsLong);
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
      placePanel(elements.panel, rect);
      keepPanelInViewport(elements.panel);
      elements.close.focus();
      return elements;
    },
    setResult(result) {
      const elements = getElements();
      elements.errorBadge.innerHTML = "";
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
    },
    setError(message, category) {
      const elements = getElements();
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
    hide() {
      const host = document.getElementById(popupHostId);
      if (!host || !host.shadowRoot) {
        return;
      }
      stopReadAloud(getElements());
      stopSourceReadAloud(getElements());
      const panel = host.shadowRoot.querySelector(".panel");
      if (panel) {
        panel.classList.add("hidden");
      }
      if (typeof popupState.onHideCallback === "function") {
        try { popupState.onHideCallback(); } catch (_) {}
      }
    },
    onHide(callback) {
      popupState.onHideCallback = callback;
    }
  };
}(globalThis));
