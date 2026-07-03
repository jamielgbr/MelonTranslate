(function initSiteRuleEngine(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};

  function normalizeHostPattern(value) {
    var raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    var candidate = raw;
    try {
      var url = candidate.includes("://") ? new URL(candidate) : new URL("https://" + candidate);
      candidate = url.hostname || candidate;
    } catch (_) {
      candidate = candidate.split(/[/?#]/)[0];
    }
    return candidate.replace(/^\*\./, "").replace(/\.$/, "").split(":")[0];
  }

  function getHostFromUrl(url) {
    try {
      return normalizeHostPattern(new URL(String(url || "")).hostname);
    } catch (_) {
      return normalizeHostPattern(url);
    }
  }

  function hostMatchesPattern(host, pattern) {
    var normalizedHost = normalizeHostPattern(host);
    var normalizedPattern = normalizeHostPattern(pattern);
    return !!normalizedHost && !!normalizedPattern
      && (normalizedHost === normalizedPattern || normalizedHost.endsWith("." + normalizedPattern));
  }

  function normalizeSelectorList(value) {
    var raw = Array.isArray(value) ? value : [];
    return Array.from(new Set(raw
      .map(function(selector) { return String(selector || "").trim(); })
      .filter(Boolean)
      .slice(0, 30)));
  }

  function normalizeContextStyle(value) {
    var style = String(value || "").trim();
    var styles = namespace.constants && Array.isArray(namespace.constants.inputContextStyles)
      ? namespace.constants.inputContextStyles
      : [];
    return styles.some(function(item) { return item.id === style; }) ? style : "auto";
  }

  function normalizeRule(rule) {
    var source = rule && typeof rule === "object" ? rule : {};
    var sourceImmersive = source.immersive && typeof source.immersive === "object" ? source.immersive : {};
    var sourceImmersiveOptionKeys = source.immersiveOptionKeys && typeof source.immersiveOptionKeys === "object"
      ? source.immersiveOptionKeys
      : null;
    var now = new Date().toISOString();
    var id = String(source.id || "").trim() || (crypto.randomUUID ? crypto.randomUUID() : "rule-" + Date.now());
    var hostPattern = normalizeHostPattern(source.hostPattern || source.host || "");
    if (!hostPattern) {
      return null;
    }

    var immersive = Object.assign({
      enabled: true,
      visibleOnly: true,
      displayMode: "below-original"
    }, sourceImmersive);
    immersive.displayMode = immersive.displayMode === "compact" ? "compact" : "below-original";

    return {
      id: id,
      hostPattern: hostPattern,
      enabled: source.enabled !== false,
      source: String(source.source || "user"),
      category: String(source.category || "custom"),
      includeSelectors: normalizeSelectorList(source.includeSelectors),
      excludeSelectors: normalizeSelectorList(source.excludeSelectors),
      immersive: immersive,
      immersiveOptionKeys: {
        visibleOnly: sourceImmersiveOptionKeys
          ? !!sourceImmersiveOptionKeys.visibleOnly
          : Object.prototype.hasOwnProperty.call(sourceImmersive, "visibleOnly"),
        displayMode: sourceImmersiveOptionKeys
          ? !!sourceImmersiveOptionKeys.displayMode
          : Object.prototype.hasOwnProperty.call(sourceImmersive, "displayMode")
      },
      contextStyle: normalizeContextStyle(source.contextStyle),
      createdAt: String(source.createdAt || now),
      updatedAt: String(source.updatedAt || now)
    };
  }

  function normalizePickerMode(value) {
    return String(value || "").trim() === "exclude" ? "exclude" : "include";
  }

  function normalizeRules(rules) {
    return (Array.isArray(rules) ? rules : [])
      .map(normalizeRule)
      .filter(Boolean)
      .slice(0, 200);
  }

  function mergePickerRule(rules, payload) {
    var current = normalizeRules(rules);
    var source = payload && typeof payload === "object" ? payload : {};
    var hostPattern = normalizeHostPattern(source.hostPattern || source.host || "");
    var selector = String(source.selector || "").trim();
    var mode = normalizePickerMode(source.mode);
    if (!hostPattern || !selector) {
      return {
        rule: null,
        siteRules: current
      };
    }

    var now = new Date().toISOString();
    var existingIndex = current.findIndex(function(rule) {
      return rule.source === "user"
        && rule.category === "picker"
        && normalizeHostPattern(rule.hostPattern) === hostPattern;
    });
    var existing = existingIndex >= 0 ? current[existingIndex] : null;
    var includeSelectors = normalizeSelectorList(existing ? existing.includeSelectors : []);
    var excludeSelectors = normalizeSelectorList(existing ? existing.excludeSelectors : []);

    if (mode === "exclude") {
      excludeSelectors = normalizeSelectorList(excludeSelectors.concat(selector));
      includeSelectors = includeSelectors.filter(function(item) { return item !== selector; });
    } else {
      includeSelectors = normalizeSelectorList(includeSelectors.concat(selector));
      excludeSelectors = excludeSelectors.filter(function(item) { return item !== selector; });
    }

    var rule = normalizeRule(Object.assign({
      id: crypto.randomUUID ? crypto.randomUUID() : "picker-" + Date.now(),
      hostPattern: hostPattern,
      enabled: true,
      source: "user",
      category: "picker",
      includeSelectors: includeSelectors,
      excludeSelectors: excludeSelectors,
      immersive: {
        enabled: true,
        visibleOnly: true,
        displayMode: "below-original"
      },
      contextStyle: "auto",
      createdAt: now,
      updatedAt: now
    }, existing || {}, {
      hostPattern: hostPattern,
      source: "user",
      category: "picker",
      includeSelectors: includeSelectors,
      excludeSelectors: excludeSelectors,
      updatedAt: now
    }));

    var next = existingIndex >= 0 ? current.slice() : current.concat(rule);
    if (existingIndex >= 0) {
      next[existingIndex] = rule;
    }
    return {
      rule: rule,
      siteRules: next
    };
  }

  function rulesForUrl(url, rules) {
    var host = getHostFromUrl(url);
    return normalizeRules(rules)
      .filter(function(rule) { return rule.enabled !== false && hostMatchesPattern(host, rule.hostPattern); })
      .sort(function(left, right) {
        var sourceRank = (right.source === "user" ? 1 : 0) - (left.source === "user" ? 1 : 0);
        if (sourceRank) return sourceRank;
        return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
      });
  }

  function getPresetRules() {
    return normalizeRules(namespace.siteRulePresets || []);
  }

  function presetRulesForUrl(url) {
    return rulesForUrl(url, getPresetRules());
  }

  function findContextStyle(rules) {
    var match = (Array.isArray(rules) ? rules : []).find(function(rule) {
      return rule.contextStyle && rule.contextStyle !== "auto";
    });
    return match ? match.contextStyle : "auto";
  }

  function findImmersiveOptions(rules) {
    var match = (Array.isArray(rules) ? rules : []).find(function(rule) {
      var keys = rule && rule.immersiveOptionKeys || {};
      return !!(rule && rule.immersive && (keys.visibleOnly || keys.displayMode));
    });
    var keys = match && match.immersiveOptionKeys || {};
    var options = {};
    if (match && keys.visibleOnly) {
      options.visibleOnly = match.immersive.visibleOnly !== false;
    }
    if (match && keys.displayMode) {
      options.displayMode = match.immersive.displayMode === "compact" ? "compact" : "below-original";
    }
    return Object.keys(options).length ? options : null;
  }

  function getImmersiveScope(url, rules) {
    var userMatched = rulesForUrl(url, rules).filter(function(rule) {
      return !rule.immersive || rule.immersive.enabled !== false;
    });
    var presetMatched = presetRulesForUrl(url).filter(function(rule) {
      return !rule.immersive || rule.immersive.enabled !== false;
    });
    var userIncludeSelectors = [];
    var presetIncludeSelectors = [];
    var excludeSelectors = [];
    userMatched.forEach(function(rule) {
      userIncludeSelectors.push.apply(userIncludeSelectors, rule.includeSelectors || []);
      excludeSelectors.push.apply(excludeSelectors, rule.excludeSelectors || []);
    });
    presetMatched.forEach(function(rule) {
      presetIncludeSelectors.push.apply(presetIncludeSelectors, rule.includeSelectors || []);
      excludeSelectors.push.apply(excludeSelectors, rule.excludeSelectors || []);
    });
    var includeSelectors = userIncludeSelectors.length ? userIncludeSelectors : presetIncludeSelectors;
    return {
      matchedRules: userMatched.concat(presetMatched),
      includeSelectors: Array.from(new Set(includeSelectors)),
      excludeSelectors: Array.from(new Set(excludeSelectors)),
      immersive: findImmersiveOptions(userMatched) || findImmersiveOptions(presetMatched),
      contextStyle: findContextStyle(userMatched) !== "auto"
        ? findContextStyle(userMatched)
        : findContextStyle(presetMatched)
    };
  }

  function resolveContextStyleForUrl(url, options) {
    var opts = options && typeof options === "object" ? options : {};
    var explicitStyle = normalizeContextStyle(opts.explicitContextStyle);
    if (explicitStyle !== "auto") {
      return explicitStyle;
    }

    var userStyle = findContextStyle(rulesForUrl(url, opts.userRules || opts.rules || []));
    if (userStyle !== "auto") {
      return userStyle;
    }

    var presetStyle = findContextStyle(presetRulesForUrl(url));
    if (presetStyle !== "auto") {
      return presetStyle;
    }

    return normalizeContextStyle(opts.defaultContextStyle || opts.fallbackContextStyle);
  }

  function querySelectorSafely(rootNode, selector) {
    try {
      return Array.from(rootNode.querySelectorAll(selector));
    } catch (_) {
      return [];
    }
  }

  function getIncludeRoots(rootNode, scope) {
    var selectors = scope && Array.isArray(scope.includeSelectors) ? scope.includeSelectors : [];
    if (!selectors.length) {
      return [rootNode];
    }
    var roots = [];
    selectors.forEach(function(selector) {
      roots.push.apply(roots, querySelectorSafely(rootNode, selector));
    });
    return Array.from(new Set(roots));
  }

  namespace.siteRuleEngine = {
    getHostFromUrl: getHostFromUrl,
    getImmersiveScope: getImmersiveScope,
    getIncludeRoots: getIncludeRoots,
    getPresetRules: getPresetRules,
    hostMatchesPattern: hostMatchesPattern,
    normalizeHostPattern: normalizeHostPattern,
    mergePickerRule: mergePickerRule,
    normalizeContextStyle: normalizeContextStyle,
    normalizePickerMode: normalizePickerMode,
    normalizeRule: normalizeRule,
    normalizeRules: normalizeRules,
    normalizeSelectorList: normalizeSelectorList,
    presetRulesForUrl: presetRulesForUrl,
    resolveContextStyleForUrl: resolveContextStyleForUrl,
    rulesForUrl: rulesForUrl
  };
}(globalThis));
