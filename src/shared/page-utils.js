(function initPageUtils(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;

  const PROVIDER_ICON_SVG = new Set([
    "google-translate",
    "openai", "anthropic", "deepseek", "openrouter",
    "grok", "groq", "fireworks", "together",
    "baseten", "zhipu", "zhipu-global", "moonshot", "ollama"
  ]);

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function availableLanguageOptions() {
    return namespace.constants.languageOptions || [];
  }

  function languageCodes() {
    return availableLanguageOptions().map(function(item) { return item.code; });
  }

  function providerIsConfigured(provider, config) {
    if (!provider || !config || !config.enabled) {
      return false;
    }
    if (provider.requiresApiKey === false) {
      return true;
    }
    return !!String(config.apiKey || "").trim();
  }

  function estimateOutputTokens(text) {
    var normalized = String(text || "").trim();
    if (!normalized) return 0;
    return Math.max(1, Math.ceil(normalized.length / 4));
  }

  function formatRate(value) {
    return Number.isFinite(value) && value > 0 ? value.toFixed(1) : "-";
  }

  function formatMillis(value) {
    return Number.isFinite(value) && value >= 0 ? Math.round(value) + " ms" : "-";
  }

  function updateStreamMetrics(metricsState, text, reportedTokens) {
    var reported = Number(reportedTokens);
    if (Number.isFinite(reported) && reported >= 0) {
      metricsState.outputTokens = reported;
    } else {
      metricsState.outputTokens = estimateOutputTokens(text);
    }
    if (metricsState.firstTokenAtMs) {
      var elapsedSec = Math.max((Date.now() - metricsState.firstTokenAtMs) / 1000, 0.001);
      metricsState.tokPerSec = metricsState.outputTokens / elapsedSec;
    }
  }

  function formatMetricsLine(firstTokenMs, outputTokens, tokPerSec, fromCache) {
    if (fromCache) return "Cached";
    return "First token: " + formatMillis(firstTokenMs) +
      " \u00B7 Output: " + outputTokens + " tok" +
      " \u00B7 " + formatRate(tokPerSec) + " tok/s";
  }

  function parseDefaultModelKey(value) {
    var raw = String(value || "");
    var idx = raw.indexOf("::");
    if (idx <= 0) {
      return { providerId: "", model: "" };
    }
    return {
      providerId: raw.slice(0, idx),
      model: raw.slice(idx + 2)
    };
  }

  function buildDefaultModelKey(providerId, model) {
    return providerId + "::" + model;
  }

  function normalizeModels(list) {
    return Array.from(new Set((Array.isArray(list) ? list : [])
      .map(function(item) { return String(item || "").trim(); })
      .filter(Boolean)));
  }

  function getProviderIconHtml(provider, imgClassName) {
    if (PROVIDER_ICON_SVG.has(provider.id)) {
      var src = api.runtime.getURL("assets/icons/" + provider.id + ".svg");
      var cls = imgClassName ? ' class="' + escapeHtml(imgClassName) + '"' : "";
      return '<img src="' + src + '" alt="' + escapeHtml(provider.displayName) + '"' + cls + '>';
    }
    if (provider.id === "custom-openai") {
      return "\uD83D\uDD27";
    }
    return String(provider.displayName || provider.id || "P")
      .split(/\s+/)
      .map(function(part) { return part.slice(0, 1).toUpperCase(); })
      .join("")
      .slice(0, 2) || "P";
  }

  function renderLanguageDropdown(wrapEl, customEl, opts) {
    var items = availableLanguageOptions().map(function(item) {
      return { value: item.code, label: item.label + " (" + item.code + ")" };
    });
    if (opts.includeAuto) items.unshift({ value: "auto", label: "Auto-detect" });
    var codes = languageCodes();
    var selected = String(opts.value || "").trim();
    var initValue;
    if (opts.includeAuto && (!selected || selected === "auto")) {
      initValue = "auto";
    } else if (codes.includes(selected)) {
      initValue = selected;
    } else if (selected) {
      initValue = "custom";
    } else {
      initValue = items.length ? items[0].value : "";
    }
    if (initValue === "custom" && customEl) {
      customEl.value = selected;
      if (customEl.classList) customEl.classList.remove("hidden");
    }
    var createOpts = {
      items: items,
      selected: initValue,
      showSearch: true,
      showCustom: true,
      customInput: customEl
    };
    if (opts.id) createOpts.id = opts.id;
    if (opts.rootElement) createOpts.rootElement = opts.rootElement;
    if (opts.dataAttrs) createOpts.dataAttrs = opts.dataAttrs;
    return namespace.customDropdown.create(wrapEl, createOpts);
  }

  function getLanguageValue(selectEl, customEl, fallback) {
    if (!selectEl) return fallback || "";
    if (selectEl.value === "custom") return (customEl && customEl.value.trim()) || fallback || "";
    return selectEl.value || fallback || "";
  }

  function setHtml(el, html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    el.replaceChildren(...doc.body.childNodes);
  }

  namespace.pageUtils = {
    escapeHtml: escapeHtml,
    availableLanguageOptions: availableLanguageOptions,
    languageCodes: languageCodes,
    providerIsConfigured: providerIsConfigured,
    estimateOutputTokens: estimateOutputTokens,
    formatRate: formatRate,
    formatMillis: formatMillis,
    updateStreamMetrics: updateStreamMetrics,
    formatMetricsLine: formatMetricsLine,
    parseDefaultModelKey: parseDefaultModelKey,
    buildDefaultModelKey: buildDefaultModelKey,
    normalizeModels: normalizeModels,
    getProviderIconHtml: getProviderIconHtml,
    renderLanguageDropdown: renderLanguageDropdown,
    getLanguageValue: getLanguageValue,
    setHtml: setHtml
  };
}(globalThis));
