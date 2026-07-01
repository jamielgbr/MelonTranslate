(function initPageUtils(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const i18n = namespace.i18n || { t: function(value) { return String(value || ""); } };

  const PROVIDER_ICON_SVG = new Set([
    "google-translate",
    "openai", "anthropic", "gemini", "grok", "deepseek",
    "openrouter", "groq", "fireworks", "together",
    "vercelai", "huggingface", "nvidia", "poe", "cerebras",
    "baseten", "zhipu", "zhipu-global", "moonshot",
    "volcengine", "minimax", "minimax-cn", "sicflow",
    "ollama", "lmstudio"
  ]);
  const APP_LOGO_PATH = "assets/publish/logo.svg";

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
    if (fromCache) return i18n.t("Cached");
    return i18n.t("First token") + ": " + formatMillis(firstTokenMs) +
      " \u00B7 " + i18n.t("Output") + ": " + outputTokens + " tok" +
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
    var mc = namespace.modelCapabilities;
    if (mc && typeof mc.normalizeModelIds === "function") {
      return mc.normalizeModelIds(Array.isArray(list) ? list : []);
    }
    return Array.from(new Set((Array.isArray(list) ? list : [])
      .map(function(item) { return String(item || "").trim(); })
      .filter(Boolean)));
  }

  function normalizeLanguageTag(tag) {
    return String(tag || "").trim().toLowerCase();
  }

  function getBaseLanguage(tag) {
    return normalizeLanguageTag(tag).split("-")[0];
  }

  function looksLikeTraditionalChinese(text) {
    return /[體萬與為國臺學龍門關觀歷頭醫廣語電畫]/.test(text);
  }

  function detectTextLanguage(text) {
    var sample = String(text || "");
    if (/[\u0600-\u06FF]/.test(sample)) return "ar";
    if (/[\u0400-\u04FF]/.test(sample)) return "ru";
    if (/[\uAC00-\uD7AF]/.test(sample)) return "ko";
    if (/[\u3040-\u30FF]/.test(sample)) return "ja";
    if (/[\u4E00-\u9FFF]/.test(sample)) return looksLikeTraditionalChinese(sample) ? "zh-TW" : "zh-CN";
    return "en";
  }

  function resolveInputTargetLanguage(settings, text, requestedTargetLanguage) {
    var cfg = settings || {};
    var defaultTarget = String(cfg.targetLanguage || "en").trim();
    var primary = String(requestedTargetLanguage || defaultTarget || "en").trim();
    if (!cfg.autoSwitchToSecondTarget || !cfg.secondTargetLanguage) {
      return primary;
    }

    var detected = detectTextLanguage(text);
    var primaryMatchesDefault = getBaseLanguage(primary) === getBaseLanguage(defaultTarget);
    if (primaryMatchesDefault && getBaseLanguage(detected) === getBaseLanguage(defaultTarget)) {
      return cfg.secondTargetLanguage;
    }
    return primary;
  }

  function normalizeHostRule(value) {
    var raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";

    var candidate = raw;
    try {
      var url = candidate.includes("://") ? new URL(candidate) : new URL("https://" + candidate);
      candidate = url.hostname || candidate;
    } catch (_) {
      candidate = candidate.split(/[/?#]/)[0];
    }

    candidate = candidate.replace(/^\*\./, "").replace(/\.$/, "");
    if (candidate.includes(":")) {
      candidate = candidate.split(":")[0];
    }
    return candidate;
  }

  function normalizeHostRuleList(value) {
    var rawItems = Array.isArray(value)
      ? value
      : String(value || "").split(/[\s,]+/);
    return Array.from(new Set(rawItems
      .map(normalizeHostRule)
      .filter(Boolean)));
  }

  function hostMatchesRule(host, rule) {
    var normalizedHost = normalizeHostRule(host);
    var normalizedRule = normalizeHostRule(rule);
    return !!normalizedHost && !!normalizedRule
      && (normalizedHost === normalizedRule || normalizedHost.endsWith("." + normalizedRule));
  }

  function normalizeInputSiteMode(value) {
    var modes = namespace.constants.inputSiteModes || {};
    return value === modes.whitelist ? modes.whitelist : modes.blacklist;
  }

  function getInputContextStyle(value) {
    var style = String(value || "").trim();
    var options = namespace.constants.inputContextStyles || [];
    return options.some(function(item) { return item.id === style; }) ? style : "auto";
  }

  function isHostAllowedForInputButton(settings, host) {
    var cfg = settings || {};
    if (cfg.inputInlineButtonEnabled === false) {
      return false;
    }

    var siteModes = namespace.constants.inputSiteModes || {};
    var mode = normalizeInputSiteMode(cfg.inputInlineButtonSiteMode);
    var list = mode === siteModes.whitelist
      ? normalizeHostRuleList(cfg.inputInlineButtonAllowedHosts)
      : normalizeHostRuleList(cfg.inputInlineButtonBlockedHosts);
    var matches = list.some(function(rule) { return hostMatchesRule(host, rule); });
    return mode === siteModes.whitelist ? matches : !matches;
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

  function getAppLogoHtml(imgClassName) {
    var src = api.runtime.getURL(APP_LOGO_PATH);
    var cls = imgClassName ? ' class="' + escapeHtml(imgClassName) + '"' : "";
    return '<img src="' + escapeHtml(src) + '" alt="" aria-hidden="true" decoding="async"' + cls + '>';
  }

  function renderLanguageDropdown(wrapEl, customEl, opts) {
    var items = availableLanguageOptions().map(function(item) {
      return { value: item.code, label: i18n.t(item.label) + " (" + item.code + ")" };
    });
    if (opts.includeAuto) items.unshift({ value: "auto", label: i18n.t("Auto-detect") });
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
    if (i18n && typeof i18n.localize === "function") {
      i18n.localize(doc.body);
    }
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
    normalizeLanguageTag: normalizeLanguageTag,
    getBaseLanguage: getBaseLanguage,
    detectTextLanguage: detectTextLanguage,
    resolveInputTargetLanguage: resolveInputTargetLanguage,
    normalizeHostRule: normalizeHostRule,
    normalizeHostRuleList: normalizeHostRuleList,
    hostMatchesRule: hostMatchesRule,
    normalizeInputSiteMode: normalizeInputSiteMode,
    getInputContextStyle: getInputContextStyle,
    isHostAllowedForInputButton: isHostAllowedForInputButton,
    getProviderIconHtml: getProviderIconHtml,
    getAppLogoHtml: getAppLogoHtml,
    t: i18n.t,
    renderLanguageDropdown: renderLanguageDropdown,
    getLanguageValue: getLanguageValue,
    setHtml: setHtml
  };
}(globalThis));
