(function initOptionsPage(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const messageTypes = namespace.messages.types;
  const pu = namespace.pageUtils;
  const mp = namespace.modelParams;
  const mc = namespace.modelCapabilities;
  const sre = namespace.siteRuleEngine;
  const hostPermissions = namespace.hostPermissions;
  const i18n = namespace.i18n || { t: (value) => String(value || ""), localize: () => {} };
  const t = i18n.t;
  const PAGE_SIZE = 25;

  const state = {
    settings: null,
    providers: [],
    providerConfigs: {},
    siteRules: [],
    history: [],
    historyPage: 0,
    providerModelFilters: {},
    providerExpanded: {},
    providerDrafts: {},
    dropdowns: {},
    providerModelDropdowns: {}
  };

  let _statusTimer = null;
  let activeHelpButton = null;
  let helpPopover = null;

  function status(message) {
    const el = document.getElementById("status");
    if (_statusTimer) { clearTimeout(_statusTimer); _statusTimer = null; }
    const localized = t(String(message || ""));
    el.textContent = localized;
    el.classList.toggle("status--loading", !!message && message.includes("\u2026"));
    if (message && !message.includes("\u2026")) {
      _statusTimer = setTimeout(function() { el.textContent = ""; el.classList.remove("status--loading"); _statusTimer = null; }, 3000);
    }
  }

  function closeSettingHelp() {
    if (activeHelpButton) {
      activeHelpButton.classList.remove("is-active");
      activeHelpButton.setAttribute("aria-expanded", "false");
      activeHelpButton.removeAttribute("aria-describedby");
      activeHelpButton = null;
    }
    if (helpPopover) {
      helpPopover.remove();
      helpPopover = null;
    }
  }

  function positionSettingHelp(button, popover) {
    const margin = 12;
    const rect = button.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 32);
    popover.style.width = `${width}px`;
    popover.classList.remove("is-above");

    const popoverHeight = popover.offsetHeight;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

    let top = rect.bottom + 10;
    if (top + popoverHeight > window.innerHeight - margin && rect.top - popoverHeight - 10 >= margin) {
      top = rect.top - popoverHeight - 10;
      popover.classList.add("is-above");
    }

    const tipX = Math.max(12, Math.min(rect.left + rect.width / 2 - left - 5, width - 22));
    popover.style.left = `${left}px`;
    popover.style.top = `${Math.max(margin, top)}px`;
    popover.style.setProperty("--tip-x", `${tipX}px`);
  }

  function appendHelpLink(popover, text, href) {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = text;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    popover.appendChild(link);
  }

  function isExternalHelpUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch (_err) {
      return false;
    }
  }

  function appendHelpTextWithUrls(popover, text) {
    const urlPattern = /https?:\/\/[^\s]+/g;
    let lastIndex = 0;
    let match;
    while ((match = urlPattern.exec(text))) {
      if (match.index > lastIndex) {
        popover.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const rawUrl = match[0];
      const url = rawUrl.replace(/[),.;!?]+$/, "");
      const trailing = rawUrl.slice(url.length);
      appendHelpLink(popover, url, url);
      if (trailing) {
        popover.appendChild(document.createTextNode(trailing));
      }
      lastIndex = match.index + rawUrl.length;
    }
    if (lastIndex < text.length) {
      popover.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function renderSettingHelpMessage(popover, message, linkUrl, linkLabel) {
    const safeLinkUrl = isExternalHelpUrl(linkUrl) ? linkUrl : "";
    const safeLinkLabel = safeLinkUrl ? String(linkLabel || "").trim() : "";
    const linkIndex = safeLinkLabel ? message.indexOf(safeLinkLabel) : -1;

    if (linkIndex >= 0) {
      appendHelpTextWithUrls(popover, message.slice(0, linkIndex));
      appendHelpLink(popover, safeLinkLabel, safeLinkUrl);
      appendHelpTextWithUrls(popover, message.slice(linkIndex + safeLinkLabel.length));
      return;
    }

    appendHelpTextWithUrls(popover, message);
  }

  function openSettingHelp(button) {
    if (activeHelpButton === button) {
      closeSettingHelp();
      return;
    }
    closeSettingHelp();
    const message = t(button.getAttribute("data-help") || "");
    const linkUrl = button.getAttribute("data-help-link-url") || "";
    const linkLabel = linkUrl ? t(button.getAttribute("data-help-link-label") || "Privacy Policy") : "";
    if (!message) {
      return;
    }

    helpPopover = document.createElement("div");
    helpPopover.id = "setting-help-popover";
    helpPopover.className = "setting-help-popover";
    helpPopover.setAttribute("role", "tooltip");
    renderSettingHelpMessage(helpPopover, message, linkUrl, linkLabel);
    document.body.appendChild(helpPopover);

    activeHelpButton = button;
    activeHelpButton.classList.add("is-active");
    activeHelpButton.setAttribute("aria-expanded", "true");
    activeHelpButton.setAttribute("aria-describedby", helpPopover.id);
    positionSettingHelp(button, helpPopover);
  }

  function handleSettingHelpClick(event) {
    const button = event.target.closest(".setting-help");
    if (button) {
      event.preventDefault();
      event.stopPropagation();
      openSettingHelp(button);
      return;
    }
    if (helpPopover && !event.target.closest(".setting-help-popover")) {
      closeSettingHelp();
    }
  }

  async function updateSiteAccessSection() {
    const section = document.getElementById("site-access-section");
    if (!section || !hostPermissions || !hostPermissions.canCheck()) {
      return true;
    }

    const granted = await hostPermissions.containsAllSites();
    section.classList.toggle("hidden", granted);
    return granted;
  }

  async function grantSiteAccess() {
    if (!hostPermissions || !hostPermissions.canRequest()) {
      status("Site access cannot be requested in this browser.");
      return false;
    }

    const button = document.getElementById("grant-site-access");
    if (button) {
      button.disabled = true;
    }

    try {
      const granted = await hostPermissions.requestAllSites();
      status(granted ? "Site access enabled." : "Site access was not enabled.");
      await updateSiteAccessSection();
      return granted;
    } catch (error) {
      status(error && error.message ? error.message : "Could not request site access.");
      return false;
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }

  function renderLanguageSelect(selectId, customId, value) {
    const wrap = document.getElementById(selectId + "-wrap");
    const custom = document.getElementById(customId);
    state.dropdowns[selectId] = pu.renderLanguageDropdown(wrap, custom, { value: value || "en", id: selectId });
  }

  function getLanguageValue(selectId, customId) {
    return pu.getLanguageValue(document.getElementById(selectId), document.getElementById(customId), "en");
  }

  function formatHostRuleList(value) {
    return pu.normalizeHostRuleList(value).join("\n");
  }

  function updateInputSiteRuleVisibility() {
    const modeEl = document.getElementById("input-site-mode");
    if (!modeEl) {
      return;
    }
    const mode = pu.normalizeInputSiteMode(modeEl.value);
    const modes = namespace.constants.inputSiteModes || {};
    const blockedRow = document.getElementById("input-blocked-hosts-row");
    const allowedRow = document.getElementById("input-allowed-hosts-row");
    if (blockedRow) {
      blockedRow.classList.toggle("is-hidden", mode === modes.whitelist);
    }
    if (allowedRow) {
      allowedRow.classList.toggle("is-hidden", mode !== modes.whitelist);
    }
  }

  function normalizeImmersiveDisplayMode(value) {
    const modes = namespace.constants.immersiveDisplayModes || [];
    const normalized = String(value || "").trim();
    return modes.some((item) => item.id === normalized) ? normalized : "below-original";
  }

  function normalizeVideoSubtitleDisplayMode(value) {
    const modes = namespace.constants.videoSubtitleDisplayModes || [];
    const normalized = String(value || "").trim();
    return modes.some((item) => item.id === normalized) ? normalized : "translation";
  }

  function normalizeInputButtonStyle(value) {
    const styles = namespace.constants.inputButtonStyles || [];
    const normalized = String(value || "").trim();
    return styles.some((item) => item.id === normalized) ? normalized : "auto";
  }

  function normalizeInputButtonIconPosition(value) {
    const positions = namespace.constants.inputButtonIconPositions || [];
    const normalized = String(value || "").trim();
    return positions.some((item) => item.id === normalized) ? normalized : "inside-right";
  }

  function normalizeInputButtonTabPosition(value) {
    const positions = namespace.constants.inputButtonTabPositions || [];
    const normalized = String(value || "").trim();
    return positions.some((item) => item.id === normalized) ? normalized : "bottom-right";
  }

  function updateInputButtonPositionVisibility() {
    const styleEl = document.getElementById("input-button-style");
    const style = normalizeInputButtonStyle(styleEl && styleEl.value);
    const iconRow = document.getElementById("input-button-icon-position-row");
    const tabRow = document.getElementById("input-button-tab-position-row");
    if (iconRow) {
      iconRow.classList.toggle("is-hidden", style !== "icon");
    }
    if (tabRow) {
      tabRow.classList.toggle("is-hidden", style !== "tab");
    }
  }

  function getVideoSubtitleLearningLevels(kind) {
    const levels = namespace.constants.videoSubtitleLearningLevels || {};
    return Array.isArray(levels[kind]) ? levels[kind] : [];
  }

  function normalizeVideoSubtitleLearningLevel(kind, value, fallback) {
    const levels = getVideoSubtitleLearningLevels(kind);
    const normalized = String(value || "").trim();
    return levels.includes(normalized) ? normalized : fallback;
  }

  function getVideoSubtitleAnnotationTypes() {
    return namespace.constants.videoSubtitleAnnotationTypes || [];
  }

  function normalizeVideoSubtitleAnnotationTypes(value) {
    const allowed = new Set(getVideoSubtitleAnnotationTypes().map((item) => item.id));
    const source = Array.isArray(value) ? value : [value];
    const normalized = source
      .map((item) => String(item || "").trim())
      .filter((item) => allowed.has(item));
    if (!normalized.length || normalized.includes("any")) {
      return ["any"];
    }
    return Array.from(new Set(normalized));
  }

  function createVideoSubtitleSiteRuleId() {
    const webCrypto = globalThis.crypto;
    if (webCrypto && typeof webCrypto.randomUUID === "function") {
      return `video-subtitle-rule-${webCrypto.randomUUID()}`;
    }
    return `video-subtitle-rule-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeVideoSubtitleSiteRule(rule, index) {
    const value = rule && typeof rule === "object" ? rule : {};
    const hostPattern = String(value.hostPattern || "").trim().toLowerCase();
    const urlSelector = String(value.urlSelector || "").trim();
    if (!hostPattern || !urlSelector) {
      return null;
    }
    return {
      id: String(value.id || `video-subtitle-rule-${index || 0}`).trim(),
      enabled: value.enabled !== false,
      name: String(value.name || "").trim(),
      hostPattern,
      urlSelector,
      urlAttribute: String(value.urlAttribute || "src").trim() || "src",
      languageCode: String(value.languageCode || "").trim(),
      label: String(value.label || "").trim(),
      updatedAt: String(value.updatedAt || "")
    };
  }

  function normalizeVideoSubtitleSiteRules(rules) {
    return (Array.isArray(rules) ? rules : [])
      .slice(0, 50)
      .map(normalizeVideoSubtitleSiteRule)
      .filter(Boolean);
  }

  function collectVideoSubtitleAnnotationTypes() {
    return normalizeVideoSubtitleAnnotationTypes(Array.from(
      document.querySelectorAll("[data-video-subtitle-annotation-type]:checked")
    ).map((input) => input.getAttribute("data-video-subtitle-annotation-type")));
  }

  function renderVideoSubtitleAnnotationTypeOptions() {
    const wrap = document.getElementById("video-subtitles-learning-annotation-types");
    if (!wrap) {
      return;
    }
    wrap.replaceChildren();
    getVideoSubtitleAnnotationTypes().forEach((item) => {
      const label = document.createElement("label");
      label.className = "choice-item";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("data-video-subtitle-annotation-type", item.id);
      input.addEventListener("change", () => {
        if (input.checked && item.id === "any") {
          fillVideoSubtitleAnnotationTypes(["any"]);
          return;
        }
        if (input.checked) {
          const anyInput = document.querySelector('[data-video-subtitle-annotation-type="any"]');
          if (anyInput) {
            anyInput.checked = false;
          }
        }
        const checked = Array.from(document.querySelectorAll("[data-video-subtitle-annotation-type]:checked"));
        if (!checked.length) {
          fillVideoSubtitleAnnotationTypes(["any"]);
        }
      });
      const text = document.createElement("span");
      text.textContent = t(item.label);
      label.append(input, text);
      wrap.appendChild(label);
    });
  }

  function fillVideoSubtitleAnnotationTypes(value) {
    const selected = new Set(normalizeVideoSubtitleAnnotationTypes(value));
    document.querySelectorAll("[data-video-subtitle-annotation-type]").forEach((input) => {
      const type = input.getAttribute("data-video-subtitle-annotation-type");
      input.checked = selected.has(type);
    });
  }

  function getVideoSubtitleSiteRulesDraft() {
    return normalizeVideoSubtitleSiteRules(state.settings && state.settings.videoBilingualSubtitlesSiteRules || []);
  }

  function setVideoSubtitleSiteRulesDraft(rules) {
    if (!state.settings) {
      state.settings = {};
    }
    state.settings.videoBilingualSubtitlesSiteRules = normalizeVideoSubtitleSiteRules(rules || []);
  }

  function renderVideoSubtitleSiteRules() {
    const container = document.getElementById("video-subtitle-site-rules");
    if (!container) {
      return;
    }
    const rules = getVideoSubtitleSiteRulesDraft();
    if (!rules.length) {
      pu.setHtml(container, '<p class="hint">No custom subtitle sources yet.</p>');
      return;
    }
    pu.setHtml(container, rules.map((rule) => {
      return `
        <article class="site-rule-card video-subtitle-rule-card" data-video-subtitle-rule-id="${pu.escapeHtml(rule.id)}">
          <div class="site-rule-main">
            <label class="site-rule-title">
              <input type="checkbox" data-video-subtitle-rule-field="enabled" ${rule.enabled !== false ? "checked" : ""}>
              <span>${pu.escapeHtml(rule.name || rule.hostPattern || t("Custom subtitle source"))}</span>
            </label>
            <div class="video-subtitle-rule-grid">
              <label class="video-subtitle-rule-field">
                <span>${t("Rule name")}</span>
                <input type="text" data-video-subtitle-rule-field="name" value="${pu.escapeHtml(rule.name)}" placeholder="${pu.escapeHtml(t("Epic subtitles"))}">
              </label>
              <label class="video-subtitle-rule-field">
                <span>${t("Host pattern")}</span>
                <input type="text" data-video-subtitle-rule-field="hostPattern" value="${pu.escapeHtml(rule.hostPattern)}" placeholder="dev.epicgames.com">
              </label>
              <label class="video-subtitle-rule-field video-subtitle-rule-field-wide">
                <span>${t("Subtitle URL selector")}</span>
                <input type="text" data-video-subtitle-rule-field="urlSelector" value="${pu.escapeHtml(rule.urlSelector)}" placeholder="script[type='application/json']">
              </label>
              <label class="video-subtitle-rule-field">
                <span>${t("URL attribute")}</span>
                <input type="text" data-video-subtitle-rule-field="urlAttribute" value="${pu.escapeHtml(rule.urlAttribute)}" placeholder="src, href, data-src, textContent">
              </label>
              <label class="video-subtitle-rule-field">
                <span>${t("Source language")}</span>
                <input type="text" data-video-subtitle-rule-field="languageCode" value="${pu.escapeHtml(rule.languageCode)}" placeholder="en">
              </label>
            </div>
          </div>
          <button class="secondary" type="button" data-delete-video-subtitle-rule="${pu.escapeHtml(rule.id)}">${t("Delete")}</button>
        </article>
      `;
    }).join(""));
  }

  function updateVideoSubtitleSiteRule(ruleId, patch) {
    const rules = Array.isArray(state.settings && state.settings.videoBilingualSubtitlesSiteRules)
      ? state.settings.videoBilingualSubtitlesSiteRules.slice()
      : getVideoSubtitleSiteRulesDraft();
    state.settings.videoBilingualSubtitlesSiteRules = rules.map((rule) => {
      if (!rule || rule.id !== ruleId) {
        return rule;
      }
      return Object.assign({}, rule, patch || {}, { updatedAt: new Date().toISOString() });
    });
  }

  function addVideoSubtitleSiteRule() {
    const rules = Array.isArray(state.settings && state.settings.videoBilingualSubtitlesSiteRules)
      ? state.settings.videoBilingualSubtitlesSiteRules.slice()
      : getVideoSubtitleSiteRulesDraft();
    rules.push({
      id: createVideoSubtitleSiteRuleId(),
      enabled: true,
      name: "New subtitle source",
      hostPattern: "example.com",
      urlSelector: "script",
      urlAttribute: "textContent",
      languageCode: "en",
      label: "",
      updatedAt: new Date().toISOString()
    });
    state.settings.videoBilingualSubtitlesSiteRules = rules;
    renderVideoSubtitleSiteRules();
  }

  function deleteVideoSubtitleSiteRule(ruleId) {
    const rules = Array.isArray(state.settings && state.settings.videoBilingualSubtitlesSiteRules)
      ? state.settings.videoBilingualSubtitlesSiteRules.slice()
      : getVideoSubtitleSiteRulesDraft();
    state.settings.videoBilingualSubtitlesSiteRules = rules.filter((rule) => rule && rule.id !== ruleId);
    renderVideoSubtitleSiteRules();
  }

  function updateVideoSubtitleLearningVisibility() {
    const modeEl = document.getElementById("video-subtitles-mode");
    const learningMode = modeEl && normalizeVideoSubtitleDisplayMode(modeEl.value) === "learning";
    document.querySelectorAll(".video-subtitles-learning-row").forEach((row) => {
      row.classList.toggle("is-hidden", !learningMode);
    });
  }

  function clampNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  function formatTemperatureInputValue(value) {
    const normalized = mp.normalizeTemperature(value, namespace.constants.modelTemperatureMax);
    const resolved = normalized === null ? namespace.constants.modelTemperatureDefault : normalized;
    return resolved.toFixed(1);
  }

  function getEffectiveProviderModel(providerId, config) {
    const draft = getProviderDraft(providerId);
    if (typeof draft.model === "string") {
      return draft.model.trim();
    }
    return getPreferredModel(config);
  }

  function getModelTemperatureValue(config, modelId) {
    const resolved = mp.resolveProviderTemperature(
      config,
      null,
      modelId,
      namespace.constants.modelTemperatureMax,
      namespace.constants.modelTemperatureDefault
    );
    return resolved === null ? namespace.constants.modelTemperatureDefault : resolved;
  }

  function formatReasoningEffortLabel(value) {
    const normalized = String(value || "off").trim().toLowerCase();
    if (normalized === "off") {
      return "Off";
    }
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  function getProviderReasoningContext(provider, config) {
    const transport = String((provider && provider.transport) || (config && config.transport) || "").trim();
    return Object.assign({}, config || {}, provider || {}, { transport });
  }

  function formatReasoningEffortValue(value, providerContext, meta) {
    const normalized = mp.normalizeReasoningEffort(value) || namespace.constants.modelReasoningEffortDefault || "off";
    return mc.normalizeProviderReasoningEffort(providerContext, meta, normalized) || normalized;
  }

  function getModelReasoningEffortValue(provider, config, modelId) {
    const providerContext = getProviderReasoningContext(provider, config);
    const meta = getModelMeta(config, provider && provider.id, modelId);
    const resolved = mp.resolveProviderReasoningEffort(
      config,
      null,
      modelId,
      namespace.constants.modelReasoningEffortDefault || "off"
    );
    return formatReasoningEffortValue(resolved, providerContext, meta);
  }

  function renderReasoningEffortOptions(selectedValue, providerContext, meta) {
    const currentValue = formatReasoningEffortValue(selectedValue, providerContext, meta);
    const options = (namespace.constants.modelReasoningEffortOptions || ["off", "low", "medium", "high"])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
      .filter((value) => value !== "off" || !mc.providerCannotDisableReasoning(providerContext, meta));
    return options.map((normalized) => {
      return `<option value="${pu.escapeHtml(normalized)}"${currentValue === normalized ? " selected" : ""}>${pu.escapeHtml(formatReasoningEffortLabel(normalized))}</option>`;
    }).join("");
  }

  function getAvailableModelMetas(config, providerId) {
    return mc.normalizeModelList((config && config.availableModels) || [], {
      source: providerId || (config && config.id) || "provider",
      updatedAt: Number(config && config.modelsFetchedAt || 0)
    });
  }

  function getModelMeta(config, providerId, modelId) {
    return mc.findModelMeta((config && config.availableModels) || [], modelId)
      || mc.normalizeModelEntry(modelId, {
        source: providerId || (config && config.id) || "provider",
        updatedAt: Number(config && config.modelsFetchedAt || 0)
      });
  }

  function isTextModel(config, providerId, modelId) {
    return mc.isTextGenerationModel(getModelMeta(config, providerId, modelId));
  }

  function renderCapabilityBadges(meta) {
    return mc.describeModelCapabilities(meta).map((label) => (
      `<span class="model-capability-badge">${pu.escapeHtml(label)}</span>`
    )).join("");
  }

  function renderCapabilityBadgeGroup(meta, extraClass) {
    const badges = renderCapabilityBadges(meta);
    if (!badges) {
      return "";
    }
    const classes = ["model-capability-badges", extraClass].filter(Boolean).join(" ");
    return `<span class="${classes}">${badges}</span>`;
  }

  function renderModelParameterControl(label, fieldHtml) {
    return `<label class="model-parameter-control"><span class="model-parameter-label">${pu.escapeHtml(label)}</span>${fieldHtml}</label>`;
  }

  function updateModelParameter(providerId, modelId, patch) {
    if (!providerId || !modelId) {
      return;
    }
    const config = state.providerConfigs[providerId] || {};
    const current = mp.getProviderModelParameters(config);
    const previousEntry = current[modelId] && typeof current[modelId] === "object" ? current[modelId] : {};
    const nextEntry = mp.normalizeModelParameterEntry(Object.assign({}, previousEntry, patch || {}));
    if (nextEntry) {
      current[modelId] = nextEntry;
    } else {
      delete current[modelId];
    }
    state.providerConfigs[providerId] = Object.assign({}, config, {
      modelParameters: current
    });
  }

  function collectModelParameterGroups() {
    return state.providers
      .map((provider) => {
        const config = state.providerConfigs[provider.id] || {};
        const supportsModelParameters = provider.id !== "google-translate" && provider.transport !== "google-translate";
        if (!config.enabled || !supportsModelParameters) {
          return null;
        }
        const currentModel = getEffectiveProviderModel(provider.id, config);
        const favorites = pu.normalizeModels(config.favoriteModels || []);
        const models = pu.normalizeModels([currentModel, ...favorites])
          .filter((modelId) => isTextModel(config, provider.id, modelId));
        if (!models.length) {
          return null;
        }
        return { provider, config, models };
      })
      .filter(Boolean);
  }

  function renderModelParameterRow(provider, config, modelId) {
    const providerName = provider.displayName || provider.id;
    const providerContext = getProviderReasoningContext(provider, config);
    const meta = getModelMeta(config, provider.id, modelId);
    const escapedProviderId = pu.escapeHtml(provider.id);
    const escapedModelId = pu.escapeHtml(modelId);
    const escapedControlLabel = pu.escapeHtml(`${providerName} ${modelId}`);
    const temperature = formatTemperatureInputValue(getModelTemperatureValue(config, modelId));
    const capabilityBadges = renderCapabilityBadgeGroup(meta, "model-parameter-badges");
    const temperatureControl = renderModelParameterControl("Temp", `
      <input
        aria-label="${escapedControlLabel} temperature"
        data-provider-id="${escapedProviderId}"
        data-model-id="${escapedModelId}"
        data-parameter="temperature"
        type="number"
        min="0"
        max="2"
        step="0.1"
        value="${pu.escapeHtml(temperature)}">
    `);
    let effortControl = "";
    if (mc.providerSupportsReasoningControl(providerContext, meta)) {
      const effort = getModelReasoningEffortValue(provider, config, modelId);
      effortControl = renderModelParameterControl("Effort", `
        <select
          aria-label="${escapedControlLabel} reasoning effort"
          data-provider-id="${escapedProviderId}"
          data-model-id="${escapedModelId}"
          data-parameter="reasoningEffort">
          ${renderReasoningEffortOptions(effort, providerContext, meta)}
        </select>
      `);
    }

    return `
      <div class="model-parameter-row">
        <div class="model-parameter-model">
          <span class="model-parameter-name" data-i18n-skip="true">${escapedModelId}</span>
          ${capabilityBadges}
        </div>
        <div class="model-parameter-controls">
          ${temperatureControl}
          ${effortControl}
        </div>
      </div>`;
  }

  function renderModelParameterProvider(group) {
    const { provider, config, models } = group;
    const providerName = provider.displayName || provider.id;
    const countLabel = `${models.length} ${models.length === 1 ? t("model") : t("models")}`;
    const rows = models.map((modelId) => renderModelParameterRow(provider, config, modelId)).join("");

    return `
      <article class="model-parameter-provider">
        <div class="model-parameter-provider-header">
          <h3 class="model-parameter-provider-title">${pu.escapeHtml(providerName)}</h3>
          <span class="model-parameter-count">${pu.escapeHtml(countLabel)}</span>
        </div>
        <div class="model-parameter-list">${rows}</div>
      </article>`;
  }

  function renderModelParametersPanel() {
    const container = document.getElementById("model-parameters");
    if (!container) {
      return;
    }
    const groups = collectModelParameterGroups();
    if (!groups.length) {
      pu.setHtml(container, '<p class="hint">No models from enabled providers yet.</p>');
      return;
    }

    pu.setHtml(container, groups.map(renderModelParameterProvider).join(""));
  }

  function getPreferredModel(config) {
    return String((config && config.model) || "").trim();
  }

  function isProviderExpanded(providerId) {
    return !!state.providerExpanded[providerId];
  }

  function getProviderDraft(providerId) {
    return state.providerDrafts[providerId] || {};
  }

  function updateProviderDraft(providerId, patch) {
    state.providerDrafts[providerId] = Object.assign({}, getProviderDraft(providerId), patch || {});
  }

  function providerRequiresApiKey(provider) {
    return provider ? provider.requiresApiKey !== false : true;
  }

  function providerCanListModels(provider) {
    return !!(provider && String(provider.modelListPath || "").trim());
  }

  function providerUsesDefaultModelOnly(provider) {
    return !!(provider && !providerCanListModels(provider));
  }

  function getConfiguredProviders() {
    return state.providers.filter((provider) => {
      const config = state.providerConfigs[provider.id] || {};
      return pu.providerIsConfigured(provider, config);
    });
  }

  function collectSettingsFromForm() {
    const defaultModelSelectValue = document.getElementById("default-translation-model").value;
    const defaultModelParsed = pu.parseDefaultModelKey(defaultModelSelectValue);
    return {
      selectionTrigger: document.getElementById("selection-trigger").value,
      modifierKey: document.getElementById("modifier-key").value,
      defaultTranslationProviderId: defaultModelParsed.providerId,
      defaultTranslationModelKey: defaultModelSelectValue,
      uiLanguage: document.getElementById("ui-language").value,
      targetLanguage: getLanguageValue("target-language", "target-language-custom"),
      secondTargetLanguage: getLanguageValue("second-target-language", "second-target-language-custom"),
      autoSwitchToSecondTarget: document.getElementById("auto-switch-second-target").checked,
      dictionaryModeForSingleWord: document.getElementById("dictionary-mode-for-single-word").checked,
      inputInlineButtonEnabled: document.getElementById("input-inline-button-enabled").checked,
      inputInlineButtonStyle: normalizeInputButtonStyle(document.getElementById("input-button-style").value),
      inputInlineButtonIconPosition: normalizeInputButtonIconPosition(document.getElementById("input-button-icon-position").value),
      inputInlineButtonTabPosition: normalizeInputButtonTabPosition(document.getElementById("input-button-tab-position").value),
      inputInlineButtonHorizontalOffset: clampNumber(document.getElementById("input-button-horizontal-offset").value, 0, -80, 80),
      inputInlineButtonSiteMode: pu.normalizeInputSiteMode(document.getElementById("input-site-mode").value),
      inputInlineButtonBlockedHosts: pu.normalizeHostRuleList(document.getElementById("input-blocked-hosts").value),
      inputInlineButtonAllowedHosts: pu.normalizeHostRuleList(document.getElementById("input-allowed-hosts").value),
      defaultInputContextStyle: pu.getInputContextStyle(document.getElementById("input-context-style").value),
      immersiveTranslationEnabled: document.getElementById("immersive-translation-enabled").checked,
      immersiveTranslationAutoTranslate: document.getElementById("immersive-translation-auto").checked,
      immersiveTranslationVisibleOnly: document.getElementById("immersive-translation-visible-only").checked,
      immersiveTranslationDisplayMode: normalizeImmersiveDisplayMode(document.getElementById("immersive-display-mode").value),
      immersiveTranslationMinTextLength: clampNumber(document.getElementById("immersive-min-text-length").value, 32, 8, 500),
      immersiveTranslationMaxConcurrent: clampNumber(document.getElementById("immersive-max-concurrent").value, 2, 1, 4),
      immersiveTranslationContextStyle: "auto",
      videoBilingualSubtitlesAutoTranslate: document.getElementById("video-subtitles-auto").checked,
      videoBilingualSubtitlesMode: normalizeVideoSubtitleDisplayMode(document.getElementById("video-subtitles-mode").value),
      videoBilingualSubtitlesLearningEnglishLevel: normalizeVideoSubtitleLearningLevel("english", document.getElementById("video-subtitles-learning-english-level").value, "B1"),
      videoBilingualSubtitlesLearningJapaneseLevel: normalizeVideoSubtitleLearningLevel("japanese", document.getElementById("video-subtitles-learning-japanese-level").value, "N3"),
      videoBilingualSubtitlesLearningChineseLevel: normalizeVideoSubtitleLearningLevel("chinese", document.getElementById("video-subtitles-learning-chinese-level").value, "HSK3"),
      videoBilingualSubtitlesLearningAnnotationTypes: collectVideoSubtitleAnnotationTypes(),
      videoBilingualSubtitlesLearningMaxItems: clampNumber(document.getElementById("video-subtitles-learning-max-items").value, 4, 1, 8),
      videoBilingualSubtitlesWordLookupEnabled: document.getElementById("video-subtitles-word-lookup").checked,
      videoBilingualSubtitlesTopicContextEnabled: document.getElementById("video-subtitles-topic-context").checked,
      videoBilingualSubtitlesAutoCorrectAsr: document.getElementById("video-subtitles-auto-correct-asr").checked,
      videoBilingualSubtitlesSkipDefaultTargetSource: document.getElementById("video-subtitles-skip-default-target-source").checked,
      videoBilingualSubtitlesShowPlayerButton: document.getElementById("video-subtitles-show-player-button").checked,
      videoBilingualSubtitlesMaxConcurrentBatches: clampNumber(document.getElementById("video-subtitles-max-concurrent-batches").value, 2, 1, 4),
      videoBilingualSubtitlesSiteRules: getVideoSubtitleSiteRulesDraft(),
      persistHistory: document.getElementById("persist-history").checked
    };
  }

  function downloadJsonFile(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function normalizeImportedSettings(importedSettings) {
    const current = state.settings || {};
    const incoming = importedSettings && typeof importedSettings === "object" ? importedSettings : {};
    const selectionTrigger = String(incoming.selectionTrigger || current.selectionTrigger || namespace.constants.selectionTriggers.auto);
    const modifierKey = String(incoming.modifierKey || current.modifierKey || namespace.constants.modifierKeys[0]);

    return {
      selectionTrigger,
      modifierKey,
      defaultTranslationProviderId: String(incoming.defaultTranslationProviderId || current.defaultTranslationProviderId || ""),
      defaultTranslationModelKey: String(incoming.defaultTranslationModelKey || current.defaultTranslationModelKey || ""),
      uiLanguage: String(incoming.uiLanguage || current.uiLanguage || "auto"),
      targetLanguage: String(incoming.targetLanguage || current.targetLanguage || "en"),
      secondTargetLanguage: String(incoming.secondTargetLanguage || current.secondTargetLanguage || "en"),
      autoSwitchToSecondTarget: incoming.autoSwitchToSecondTarget !== undefined
        ? !!incoming.autoSwitchToSecondTarget
        : !!current.autoSwitchToSecondTarget,
      dictionaryModeForSingleWord: incoming.dictionaryModeForSingleWord !== undefined
        ? !!incoming.dictionaryModeForSingleWord
        : !!current.dictionaryModeForSingleWord,
      inputInlineButtonEnabled: incoming.inputInlineButtonEnabled !== undefined
        ? !!incoming.inputInlineButtonEnabled
        : current.inputInlineButtonEnabled !== false,
      inputInlineButtonStyle: normalizeInputButtonStyle(incoming.inputInlineButtonStyle || current.inputInlineButtonStyle),
      inputInlineButtonIconPosition: normalizeInputButtonIconPosition(incoming.inputInlineButtonIconPosition || current.inputInlineButtonIconPosition),
      inputInlineButtonTabPosition: normalizeInputButtonTabPosition(incoming.inputInlineButtonTabPosition || current.inputInlineButtonTabPosition),
      inputInlineButtonHorizontalOffset: clampNumber(
        incoming.inputInlineButtonHorizontalOffset !== undefined
          ? incoming.inputInlineButtonHorizontalOffset
          : current.inputInlineButtonHorizontalOffset,
        0,
        -80,
        80
      ),
      inputInlineButtonSiteMode: pu.normalizeInputSiteMode(incoming.inputInlineButtonSiteMode || current.inputInlineButtonSiteMode),
      inputInlineButtonBlockedHosts: pu.normalizeHostRuleList(
        incoming.inputInlineButtonBlockedHosts !== undefined
          ? incoming.inputInlineButtonBlockedHosts
          : (current.inputInlineButtonBlockedHosts || [])
      ),
      inputInlineButtonAllowedHosts: pu.normalizeHostRuleList(
        incoming.inputInlineButtonAllowedHosts !== undefined
          ? incoming.inputInlineButtonAllowedHosts
          : (current.inputInlineButtonAllowedHosts || [])
      ),
      defaultInputContextStyle: pu.getInputContextStyle(incoming.defaultInputContextStyle || current.defaultInputContextStyle),
      immersiveTranslationEnabled: incoming.immersiveTranslationEnabled !== undefined
        ? !!incoming.immersiveTranslationEnabled
        : current.immersiveTranslationEnabled !== false,
      immersiveTranslationAutoTranslate: incoming.immersiveTranslationAutoTranslate !== undefined
        ? !!incoming.immersiveTranslationAutoTranslate
        : !!current.immersiveTranslationAutoTranslate,
      immersiveTranslationVisibleOnly: incoming.immersiveTranslationVisibleOnly !== undefined
        ? !!incoming.immersiveTranslationVisibleOnly
        : current.immersiveTranslationVisibleOnly !== false,
      immersiveTranslationDisplayMode: normalizeImmersiveDisplayMode(incoming.immersiveTranslationDisplayMode || current.immersiveTranslationDisplayMode),
      immersiveTranslationMinTextLength: clampNumber(
        incoming.immersiveTranslationMinTextLength !== undefined
          ? incoming.immersiveTranslationMinTextLength
          : current.immersiveTranslationMinTextLength,
        32,
        8,
        500
      ),
      immersiveTranslationMaxConcurrent: clampNumber(
        incoming.immersiveTranslationMaxConcurrent !== undefined
          ? incoming.immersiveTranslationMaxConcurrent
          : current.immersiveTranslationMaxConcurrent,
        2,
        1,
        4
      ),
      immersiveTranslationContextStyle: "auto",
      videoBilingualSubtitlesAutoTranslate: incoming.videoBilingualSubtitlesAutoTranslate !== undefined
        ? !!incoming.videoBilingualSubtitlesAutoTranslate
        : !!current.videoBilingualSubtitlesAutoTranslate,
      videoBilingualSubtitlesMode: normalizeVideoSubtitleDisplayMode(incoming.videoBilingualSubtitlesMode || current.videoBilingualSubtitlesMode),
      videoBilingualSubtitlesLearningEnglishLevel: normalizeVideoSubtitleLearningLevel(
        "english",
        incoming.videoBilingualSubtitlesLearningEnglishLevel || current.videoBilingualSubtitlesLearningEnglishLevel,
        "B1"
      ),
      videoBilingualSubtitlesLearningJapaneseLevel: normalizeVideoSubtitleLearningLevel(
        "japanese",
        incoming.videoBilingualSubtitlesLearningJapaneseLevel || current.videoBilingualSubtitlesLearningJapaneseLevel,
        "N3"
      ),
      videoBilingualSubtitlesLearningChineseLevel: normalizeVideoSubtitleLearningLevel(
        "chinese",
        incoming.videoBilingualSubtitlesLearningChineseLevel || current.videoBilingualSubtitlesLearningChineseLevel,
        "HSK3"
      ),
      videoBilingualSubtitlesLearningAnnotationTypes: normalizeVideoSubtitleAnnotationTypes(
        incoming.videoBilingualSubtitlesLearningAnnotationTypes !== undefined
          ? incoming.videoBilingualSubtitlesLearningAnnotationTypes
          : current.videoBilingualSubtitlesLearningAnnotationTypes
      ),
      videoBilingualSubtitlesLearningMaxItems: clampNumber(
        incoming.videoBilingualSubtitlesLearningMaxItems !== undefined
          ? incoming.videoBilingualSubtitlesLearningMaxItems
          : current.videoBilingualSubtitlesLearningMaxItems,
        4,
        1,
        8
      ),
      videoBilingualSubtitlesWordLookupEnabled: incoming.videoBilingualSubtitlesWordLookupEnabled !== undefined
        ? !!incoming.videoBilingualSubtitlesWordLookupEnabled
        : current.videoBilingualSubtitlesWordLookupEnabled !== false,
      videoBilingualSubtitlesTopicContextEnabled: incoming.videoBilingualSubtitlesTopicContextEnabled !== undefined
        ? !!incoming.videoBilingualSubtitlesTopicContextEnabled
        : current.videoBilingualSubtitlesTopicContextEnabled !== false,
      videoBilingualSubtitlesAutoCorrectAsr: incoming.videoBilingualSubtitlesAutoCorrectAsr !== undefined
        ? !!incoming.videoBilingualSubtitlesAutoCorrectAsr
        : current.videoBilingualSubtitlesAutoCorrectAsr === true,
      videoBilingualSubtitlesSkipDefaultTargetSource: incoming.videoBilingualSubtitlesSkipDefaultTargetSource !== undefined
        ? !!incoming.videoBilingualSubtitlesSkipDefaultTargetSource
        : current.videoBilingualSubtitlesSkipDefaultTargetSource !== false,
      videoBilingualSubtitlesShowPlayerButton: incoming.videoBilingualSubtitlesShowPlayerButton !== undefined
        ? !!incoming.videoBilingualSubtitlesShowPlayerButton
        : current.videoBilingualSubtitlesShowPlayerButton !== false,
      videoBilingualSubtitlesMaxConcurrentBatches: clampNumber(
        incoming.videoBilingualSubtitlesMaxConcurrentBatches !== undefined
          ? incoming.videoBilingualSubtitlesMaxConcurrentBatches
          : current.videoBilingualSubtitlesMaxConcurrentBatches,
        2,
        1,
        4
      ),
      videoBilingualSubtitlesSiteRules: normalizeVideoSubtitleSiteRules(
        incoming.videoBilingualSubtitlesSiteRules !== undefined
          ? incoming.videoBilingualSubtitlesSiteRules
          : current.videoBilingualSubtitlesSiteRules
      ),
      persistHistory: incoming.persistHistory !== undefined
        ? !!incoming.persistHistory
        : !!current.persistHistory
    };
  }

  function normalizeImportedProviderConfigs(importedProviderConfigs) {
    const importedMap = Array.isArray(importedProviderConfigs)
      ? Object.fromEntries(importedProviderConfigs.filter((item) => item && item.id).map((item) => [item.id, item]))
      : (importedProviderConfigs && typeof importedProviderConfigs === "object" ? importedProviderConfigs : {});

    const nextConfigs = {};
    state.providers.forEach((provider) => {
      const current = state.providerConfigs[provider.id] || {};
      const incoming = importedMap[provider.id] && typeof importedMap[provider.id] === "object"
        ? importedMap[provider.id]
        : {};

      const model = String(incoming.model !== undefined ? incoming.model : (current.model || "")).trim();
      const availableModels = mc.normalizeModelList(incoming.availableModels !== undefined ? incoming.availableModels : (current.availableModels || []), {
        source: provider.id,
        updatedAt: Number(incoming.modelsFetchedAt || current.modelsFetchedAt || 0)
      });
      const favoriteModels = pu.normalizeModels(incoming.favoriteModels !== undefined ? incoming.favoriteModels : (current.favoriteModels || []));
      const mergedFavorites = pu.normalizeModels(model ? [...favoriteModels, model] : favoriteModels);
      const mergedModelParameters = mp.getProviderModelParameters({
        modelParameters: incoming.modelParameters !== undefined ? incoming.modelParameters : (current.modelParameters || {}),
        modelTemperatures: incoming.modelTemperatures !== undefined ? incoming.modelTemperatures : (current.modelTemperatures || {})
      });

      nextConfigs[provider.id] = {
        id: provider.id,
        enabled: incoming.enabled !== undefined ? !!incoming.enabled : !!current.enabled,
        model,
        baseUrl: String(incoming.baseUrl !== undefined ? incoming.baseUrl : (current.baseUrl || "")).trim(),
        favoriteModels: mergedFavorites,
        modelParameters: mergedModelParameters,
        availableModels,
        modelsFetchedAt: Number.isFinite(Number(incoming.modelsFetchedAt))
          ? Number(incoming.modelsFetchedAt)
          : Number(current.modelsFetchedAt || 0),
        modelListAccountId: String(incoming.modelListAccountId !== undefined ? incoming.modelListAccountId : (current.modelListAccountId || "")).trim(),
        transport: current.transport || provider.transport || "openai-compatible",
        experimental: !!(current.experimental || provider.experimental),
        apiKey: String(incoming.apiKey !== undefined ? incoming.apiKey : (current.apiKey || "")).trim(),
        encryptedApiKey: String(incoming.encryptedApiKey !== undefined
          ? incoming.encryptedApiKey
          : (current.encryptedApiKey || "")).trim(),
        extraHeaders: current.extraHeaders || provider.extraHeaders || {}
      };
    });

    return nextConfigs;
  }

  function exportConfig() {
    const currentFormConfigs = collectProviderConfigs();
    const exportProviderConfigs = Object.fromEntries(
      Object.entries(currentFormConfigs).map(([providerId, config]) => {
        const stateConfig = state.providerConfigs[providerId] || {};
        const resolvedApiKey = String(config.apiKey || stateConfig.apiKey || "").trim();
        return [providerId, {
          id: config.id,
          enabled: !!config.enabled,
          model: config.model || "",
          baseUrl: config.baseUrl || "",
          apiKey: resolvedApiKey,
          favoriteModels: pu.normalizeModels(config.favoriteModels || []),
          modelParameters: mp.getProviderModelParameters(config),
          availableModels: mc.normalizeModelList(config.availableModels || [], {
            source: providerId,
            updatedAt: Number(config.modelsFetchedAt || 0)
          }),
          modelsFetchedAt: Number.isFinite(Number(config.modelsFetchedAt)) ? Number(config.modelsFetchedAt) : 0,
          modelListAccountId: config.modelListAccountId || "",
          transport: config.transport || "openai-compatible",
          experimental: !!config.experimental,
          extraHeaders: config.extraHeaders || {}
        }];
      })
    );

    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      settings: collectSettingsFromForm(),
      providerConfigs: exportProviderConfigs,
      siteRules: sre.normalizeRules(state.siteRules || [])
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJsonFile(`melontranslate-config-${stamp}.json`, payload);
    status("Settings exported.");
  }

  async function importConfig(file) {
    const rawText = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (_) {
      status("That file is not valid JSON.");
      return;
    }

    if (!parsed || typeof parsed !== "object") {
      status("That file does not contain valid settings.");
      return;
    }

    const settings = normalizeImportedSettings(parsed.settings);
    const providerConfigs = normalizeImportedProviderConfigs(parsed.providerConfigs);
    const siteRules = sre.normalizeRules(parsed.siteRules || state.siteRules || []);
    status("Importing settings…");

    const response = await api.runtime.sendMessage({
      type: messageTypes.saveOptions,
      settings,
      providerConfigs
    });

    if (!response || !response.ok) {
      status(response?.error?.message || "Could not import settings.");
      return;
    }

    const siteRuleResponse = await api.runtime.sendMessage({
      type: messageTypes.saveSiteRules,
      siteRules
    });
    if (!siteRuleResponse || !siteRuleResponse.ok) {
      status(siteRuleResponse?.error?.message || "Could not import site rules.");
      return;
    }

    status("Settings imported.");
    await load();
  }

  function collectFavoritedModelOptions() {
    return getConfiguredProviders().flatMap((provider) => {
      const config = state.providerConfigs[provider.id] || {};
      const favorites = pu.normalizeModels(config.favoriteModels || []);
      return favorites.map((model) => {
        const meta = getModelMeta(config, provider.id, model);
        if (!mc.isTextGenerationModel(meta)) {
          return null;
        }
        return {
          key: pu.buildDefaultModelKey(provider.id, model),
          providerId: provider.id,
          model,
          label: mc.formatModelOptionLabel(provider.displayName, model, meta)
        };
      }).filter(Boolean);
    });
  }

  function getUiLanguageItems() {
    return (namespace.constants.uiLanguageOptions || []).map((item) => ({
      value: item.id,
      label: item.id === "auto" ? t(item.label) : item.label
    }));
  }

  function renderStaticDropdowns() {
    renderVideoSubtitleAnnotationTypeOptions();
    state.dropdowns["ui-language"] = namespace.customDropdown.create(
      document.getElementById("ui-language-wrap"),
      {
        id: "ui-language",
        items: getUiLanguageItems(),
        selected: "auto"
      }
    );
    state.dropdowns["selection-trigger"] = namespace.customDropdown.create(
      document.getElementById("selection-trigger-wrap"),
      {
        id: "selection-trigger",
        items: [
          { value: "auto", label: t("Auto") },
          { value: "modifier", label: t("Translate while holding modifier key") },
          { value: "manual", label: t("Context menu only") }
        ],
        selected: "auto"
      }
    );
    state.dropdowns["modifier-key"] = namespace.customDropdown.create(
      document.getElementById("modifier-key-wrap"),
      {
        id: "modifier-key",
        items: [
          { value: "Alt", label: "Alt" },
          { value: "Control", label: "Control" },
          { value: "Shift", label: "Shift" },
          { value: "Meta", label: "Meta" }
        ],
        selected: "Alt"
      }
    );
    state.dropdowns["input-site-mode"] = namespace.customDropdown.create(
      document.getElementById("input-site-mode-wrap"),
      {
        id: "input-site-mode",
        items: [
          { value: namespace.constants.inputSiteModes.blacklist, label: t("Hide on blocked domains") },
          { value: namespace.constants.inputSiteModes.whitelist, label: t("Show only on allowed domains") }
        ],
        selected: namespace.constants.inputSiteModes.blacklist,
        onChange: updateInputSiteRuleVisibility
      }
    );
    state.dropdowns["input-button-style"] = namespace.customDropdown.create(
      document.getElementById("input-button-style-wrap"),
      {
        id: "input-button-style",
        items: (namespace.constants.inputButtonStyles || []).map((item) => ({
          value: item.id,
          label: t(item.label)
        })),
        selected: "auto",
        onChange: updateInputButtonPositionVisibility
      }
    );
    state.dropdowns["input-button-icon-position"] = namespace.customDropdown.create(
      document.getElementById("input-button-icon-position-wrap"),
      {
        id: "input-button-icon-position",
        items: (namespace.constants.inputButtonIconPositions || []).map((item) => ({
          value: item.id,
          label: t(item.label)
        })),
        selected: "inside-right"
      }
    );
    state.dropdowns["input-button-tab-position"] = namespace.customDropdown.create(
      document.getElementById("input-button-tab-position-wrap"),
      {
        id: "input-button-tab-position",
        items: (namespace.constants.inputButtonTabPositions || []).map((item) => ({
          value: item.id,
          label: t(item.label)
        })),
        selected: "bottom-right"
      }
    );
    state.dropdowns["input-context-style"] = namespace.customDropdown.create(
      document.getElementById("input-context-style-wrap"),
      {
        id: "input-context-style",
        items: (namespace.constants.inputContextStyles || []).map((item) => ({
          value: item.id,
          label: t(item.label)
        })),
        selected: "auto"
      }
    );
    state.dropdowns["immersive-display-mode"] = namespace.customDropdown.create(
      document.getElementById("immersive-display-mode-wrap"),
      {
        id: "immersive-display-mode",
        items: (namespace.constants.immersiveDisplayModes || []).map((item) => ({
          value: item.id,
          label: t(item.label)
        })),
        selected: "below-original"
      }
    );
    state.dropdowns["video-subtitles-mode"] = namespace.customDropdown.create(
      document.getElementById("video-subtitles-mode-wrap"),
      {
        id: "video-subtitles-mode",
        items: (namespace.constants.videoSubtitleDisplayModes || []).map((item) => ({
          value: item.id,
          label: t(item.label)
        })),
        selected: "translation",
        onChange: updateVideoSubtitleLearningVisibility
      }
    );
    state.dropdowns["video-subtitles-learning-english-level"] = namespace.customDropdown.create(
      document.getElementById("video-subtitles-learning-english-level-wrap"),
      {
        id: "video-subtitles-learning-english-level",
        items: getVideoSubtitleLearningLevels("english").map((level) => ({ value: level, label: `CEFR ${level}` })),
        selected: "B1"
      }
    );
    state.dropdowns["video-subtitles-learning-japanese-level"] = namespace.customDropdown.create(
      document.getElementById("video-subtitles-learning-japanese-level-wrap"),
      {
        id: "video-subtitles-learning-japanese-level",
        items: getVideoSubtitleLearningLevels("japanese").map((level) => ({ value: level, label: `JLPT ${level}` })),
        selected: "N3"
      }
    );
    state.dropdowns["video-subtitles-learning-chinese-level"] = namespace.customDropdown.create(
      document.getElementById("video-subtitles-learning-chinese-level-wrap"),
      {
        id: "video-subtitles-learning-chinese-level",
        items: getVideoSubtitleLearningLevels("chinese").map((level) => ({ value: level, label: level })),
        selected: "HSK3"
      }
    );
  }

  function renderDefaultModelSelect() {
    const wrap = document.getElementById("default-translation-model-wrap");
    const options = collectFavoritedModelOptions();
    const items = options.length
      ? options.map((item) => ({ value: item.key, label: item.label }))
      : [{ value: "", label: t("No favorite models available") }];
    const disabled = !options.length;

    let selectedValue = "";
    if (options.length) {
      const currentValue = state.settings.defaultTranslationModelKey;
      if (currentValue && options.some((item) => item.key === currentValue)) {
        selectedValue = currentValue;
      } else if (state.settings.defaultTranslationProviderId) {
        const fromProvider = options.find((item) => item.providerId === state.settings.defaultTranslationProviderId);
        if (fromProvider) selectedValue = fromProvider.key;
      }
      if (!selectedValue) selectedValue = options[0].key;
    }

    if (state.dropdowns["default-translation-model"]) {
      state.dropdowns["default-translation-model"].setItems(items);
      state.dropdowns["default-translation-model"].setValue(selectedValue);
      state.dropdowns["default-translation-model"].setDisabled(disabled);
    } else {
      state.dropdowns["default-translation-model"] = namespace.customDropdown.create(wrap, {
        id: "default-translation-model",
        items,
        selected: selectedValue,
        showSearch: true
      });
      state.dropdowns["default-translation-model"].setDisabled(disabled);
    }
  }

  function renderModelFavoriteRows(config) {
    const favorites = pu.normalizeModels(config.favoriteModels || []);
    const availableModels = getAvailableModelMetas(config, config.id);
    const availableIds = new Set(availableModels.map((meta) => meta.id));
    const fallbackModels = pu.normalizeModels([getPreferredModel(config), ...favorites])
      .filter((modelId) => !availableIds.has(modelId))
      .map((modelId) => getModelMeta(config, config.id, modelId));
    const allModels = availableModels.concat(fallbackModels);
    if (!allModels.length) {
      return `<p class="hint">${t("No available models.")}</p>`;
    }

    return allModels.map((meta) => {
      const modelId = meta.id;
      const escapedModelId = pu.escapeHtml(modelId);
      const isFavorite = favorites.includes(modelId);
      const isTextModel = mc.isTextGenerationModel(meta);
      const rowClasses = [
        "model-favorite-row",
        isFavorite ? "model-favorite-row-checked" : "",
        isTextModel ? "" : "model-favorite-row-disabled"
      ].filter(Boolean).join(" ");
      const checkedAttribute = isFavorite ? " checked" : "";
      const disabledAttribute = isTextModel ? "" : " disabled";
      const titleAttribute = isTextModel ? "" : ` title="${pu.escapeHtml(t("This model is not available for text translation."))}"`;
      const favoriteBadges = renderCapabilityBadgeGroup(meta);
      return `
        <label class="${rowClasses}" data-model="${escapedModelId}"${titleAttribute}>
          <input class="model-favorite-input" data-model-favorite="${escapedModelId}" type="checkbox"${checkedAttribute}${disabledAttribute}>
          <span class="model-favorite-check" aria-hidden="true"></span>
          <span class="model-favorite-content">
            <span class="model-favorite-name" data-i18n-skip="true">${escapedModelId}</span>
            ${favoriteBadges}
          </span>
        </label>`;
    }).join("");
  }

  function applyModelFilter(providerId, query) {
    const enabledInput = document.querySelector(`.provider-card [data-provider-id="${providerId}"][data-field="enabled"]`);
    const card = enabledInput ? enabledInput.closest(".provider-card") : null;
    if (!card) return;

    const modelList = card.querySelector(`.model-list[data-provider-id="${providerId}"]`);
    if (!modelList) return;

    const rows = Array.from(modelList.querySelectorAll(".model-favorite-row"));
    const normalizedQuery = String(query || "").trim().toLowerCase();
    let visibleCount = 0;

    rows.forEach((row) => {
      const model = String(row.dataset.model || "").toLowerCase();
      const matched = !normalizedQuery || model.includes(normalizedQuery);
      row.style.display = matched ? "" : "none";
      if (matched) {
        visibleCount += 1;
      }
    });

    const existingEmpty = modelList.querySelector(".model-search-empty");
    if (!rows.length || !normalizedQuery || visibleCount) {
      if (existingEmpty) {
        existingEmpty.remove();
      }
      return;
    }

    if (!existingEmpty) {
      const empty = document.createElement("p");
      empty.className = "hint model-search-empty";
      empty.textContent = t("No models match your search.");
      modelList.appendChild(empty);
    }
  }

  function syncCurrentModelControl(providerId) {
    const dd = state.providerModelDropdowns[providerId];
    const hiddenInput = document.querySelector(`[data-provider-id="${providerId}"][data-field="model-select"]`);
    const modelCustom = document.querySelector(`[data-provider-id="${providerId}"][data-field="model-custom"]`);
    if (!dd || !hiddenInput) return;

    const provider = state.providers.find((item) => item.id === providerId) || {};
    const config = state.providerConfigs[providerId] || {};
    const card = hiddenInput.closest(".provider-card");
    const favoriteInputs = card ? card.querySelectorAll("input[data-model-favorite]") : [];
    const favorites = Array.from(favoriteInputs)
      .filter((item) => item.checked && !item.disabled)
      .map((item) => item.dataset.modelFavorite);
    const currentValue = hiddenInput.value === "custom" ? (modelCustom ? modelCustom.value.trim() : "") : hiddenInput.value;
    const safeCurrentValue = currentValue && isTextModel(config, providerId, currentValue) ? currentValue : "";
    const merged = Array.from(new Set([...favorites, safeCurrentValue].filter(Boolean)));

    dd.setItems(merged.map((model) => ({
      value: model,
      label: mc.formatModelOptionLabel(provider.displayName || providerId, model, getModelMeta(config, providerId, model))
    })));

    if (safeCurrentValue && merged.includes(safeCurrentValue)) {
      dd.setValue(safeCurrentValue);
      updateProviderDraft(providerId, { model: safeCurrentValue, modelSelectValue: safeCurrentValue, modelCustomValue: safeCurrentValue });
    } else if (currentValue && !safeCurrentValue) {
      const first = merged[0] || "";
      if (first) {
        dd.setValue(first);
        updateProviderDraft(providerId, { model: first, modelSelectValue: first, modelCustomValue: first });
      } else {
        dd.setValue("custom");
        if (modelCustom) modelCustom.value = "";
        updateProviderDraft(providerId, { model: "", modelSelectValue: "custom", modelCustomValue: "" });
      }
    } else if (currentValue) {
      dd.setValue("custom");
      if (modelCustom) modelCustom.value = currentValue;
      updateProviderDraft(providerId, { model: currentValue, modelSelectValue: "custom", modelCustomValue: currentValue });
    } else {
      const first = merged[0] || "";
      if (first) {
        dd.setValue(first);
        updateProviderDraft(providerId, { model: first, modelSelectValue: first, modelCustomValue: first });
      } else {
        dd.setValue("custom");
        updateProviderDraft(providerId, { model: "", modelSelectValue: "custom", modelCustomValue: "" });
      }
    }
  }

  function renderProviders() {
    const container = document.getElementById("providers");
    container.innerHTML = "";

    state.providers.forEach((provider) => {
      const config = state.providerConfigs[provider.id] || {};
      const draft = getProviderDraft(provider.id);
      if (typeof state.providerExpanded[provider.id] === "undefined") {
        state.providerExpanded[provider.id] = false;
      }
      const expanded = isProviderExpanded(provider.id);
      const needsModelListAccountId = String(provider.modelListPath || "").includes("{account_id}");
      const searchTerm = state.providerModelFilters[provider.id] || "";
      const card = document.createElement("article");
      card.className = "provider-card";
      card.dataset.providerId = provider.id;
      card.dataset.expanded = expanded ? "true" : "false";
      const favoriteModels = pu.normalizeModels(config.favoriteModels || [])
        .filter((modelId) => isTextModel(config, provider.id, modelId));
      const rawCurrentModel = typeof draft.model === "string" ? draft.model : getPreferredModel(config);
      const currentModel = rawCurrentModel && isTextModel(config, provider.id, rawCurrentModel) ? rawCurrentModel : "";
      const draftModelSelectValue = typeof draft.modelSelectValue === "string" ? draft.modelSelectValue : "";
      const modelSelectValue = draftModelSelectValue || (favoriteModels.includes(currentModel) ? currentModel : (currentModel ? "custom" : (favoriteModels[0] || "custom")));
      const modelCustomVisible = modelSelectValue === "custom";
      const modelCustomValue = typeof draft.modelCustomValue === "string" ? draft.modelCustomValue : currentModel;
      const baseUrlValue = typeof draft.baseUrl === "string" ? draft.baseUrl : (config.baseUrl || "");
      const apiKeyValue = typeof draft.apiKey === "string" ? draft.apiKey : "";
      const requiresApiKey = providerRequiresApiKey(provider);
      const canListModels = providerCanListModels(provider);
      const modelListAccountIdValue = typeof draft.modelListAccountId === "string" ? draft.modelListAccountId : (config.modelListAccountId || "");
      const fetchedAt = config.modelsFetchedAt ? new Date(config.modelsFetchedAt).toLocaleString() : t("Never");
      const isSimpleProvider = !providerRequiresApiKey(provider) && providerUsesDefaultModelOnly(provider);
      const providerMeta = currentModel ? `${t("Model")}: ${currentModel}` : t("No model selected");
      pu.setHtml(card, isSimpleProvider ? `
        <div class="provider-header-wrap">
          <div class="provider-header provider-header-static">
            <div class="provider-header-main">
              <span class="provider-icon provider-icon-${pu.escapeHtml(provider.id)}" aria-hidden="true">${pu.getProviderIconHtml(provider, "provider-icon-img")}</span>
              <div class="provider-heading-copy">
                <strong>${pu.escapeHtml(provider.displayName)}</strong>
              </div>
            </div>
            <div class="provider-header-side">
              ${provider.experimental ? '<span class="badge">Experimental</span>' : ""}
            </div>
          </div>
          <label class="provider-switch" aria-label="Enable provider">
            <input data-field="enabled" data-provider-id="${provider.id}" type="checkbox" ${config.enabled ? "checked" : ""}>
            <span class="provider-switch-track"><span class="provider-switch-thumb"></span></span>
          </label>
        </div>
      ` : `
        <div class="provider-header-wrap">
          <button class="provider-header" type="button" data-action="toggle-provider" data-provider-id="${provider.id}" aria-expanded="${expanded ? "true" : "false"}">
            <div class="provider-header-main">
              <span class="provider-icon provider-icon-${pu.escapeHtml(provider.id)}" aria-hidden="true">${pu.getProviderIconHtml(provider, "provider-icon-img")}</span>
              <div class="provider-heading-copy">
                <strong>${pu.escapeHtml(provider.displayName)}</strong>
                <div class="history-meta provider-summary">${pu.escapeHtml(providerMeta)}</div>
              </div>
            </div>
            <div class="provider-header-side">
              ${provider.experimental ? '<span class="badge">Experimental</span>' : ""}
              <span class="provider-chevron" aria-hidden="true">▸</span>
            </div>
          </button>
          <label class="provider-switch" aria-label="Enable provider">
            <input data-field="enabled" data-provider-id="${provider.id}" type="checkbox" ${config.enabled ? "checked" : ""}>
            <span class="provider-switch-track"><span class="provider-switch-thumb"></span></span>
          </label>
        </div>
        <div class="provider-content ${expanded ? "is-expanded" : "is-collapsed"}">
          <div class="provider-grid">
            <label>Selected model
              <div class="cdd-provider-model-wrap"></div>
              <input data-field="model-custom" data-provider-id="${provider.id}" type="text" value="${pu.escapeHtml(modelCustomValue)}" placeholder="Custom model ID" style="display: none; margin-top: 8px;">
            </label>
            <label>Base URL<input data-field="baseUrl" data-provider-id="${provider.id}" type="text" value="${pu.escapeHtml(baseUrlValue)}" placeholder="https://..."></label>
            ${requiresApiKey
              ? `<label>API key<input data-field="apiKey" data-provider-id="${provider.id}" type="password" value="${pu.escapeHtml(apiKeyValue)}" placeholder="Leave blank to keep the saved key"></label>`
              : `<label>API key (optional)<input data-field="apiKey" data-provider-id="${provider.id}" type="password" value="${pu.escapeHtml(apiKeyValue)}" placeholder="Optional – leave blank if not needed"></label>`}
            ${needsModelListAccountId ? `<label>Account ID for model list
              <input data-field="modelListAccountId" data-provider-id="${provider.id}" type="text" value="${pu.escapeHtml(modelListAccountIdValue)}" placeholder="For example: fireworks">
            </label>` : ""}
          </div>
          <div class="model-tools">
            <div class="model-tools-header">
              <strong>Favorite models</strong>
              <div>
                ${canListModels ? `<button class="secondary" type="button" data-action="fetch-models" data-provider-id="${provider.id}">List models</button>
                <button class="secondary" type="button" data-action="refresh-models" data-provider-id="${provider.id}">Refresh</button>` : ""}
              </div>
            </div>
            <p class="hint">${canListModels ? `${t("Last updated")}: ${pu.escapeHtml(fetchedAt)}` : t("Use the default model or enter a custom model ID.")}</p>
            <input class="model-search-input" data-provider-id="${provider.id}" type="text" value="${pu.escapeHtml(searchTerm)}" placeholder="Filter models">
            <div class="model-list" data-provider-id="${provider.id}">
              ${renderModelFavoriteRows(config)}
            </div>
          </div>
          ${provider.reason ? `<p class="hint">${pu.escapeHtml(provider.reason)}</p>` : ""}
        </div>
      `);
      container.appendChild(card);

      if (isSimpleProvider) return;

      const modelCustom = card.querySelector(`[data-provider-id="${provider.id}"][data-field="model-custom"]`);
      const modelWrap = card.querySelector(".cdd-provider-model-wrap");
      const currentModelVal = currentModel;
      const favModels = favoriteModels;
      const mergedModels = Array.from(new Set([...favModels, currentModelVal].filter(Boolean)));
      const ddItems = mergedModels.map((model) => ({
        value: model,
        label: mc.formatModelOptionLabel(provider.displayName, model, getModelMeta(config, provider.id, model))
      }));
      const ddInitValue = mergedModels.includes(currentModelVal) ? currentModelVal : (currentModelVal ? "custom" : (mergedModels[0] || "custom"));
      if (ddInitValue === "custom" && modelCustom && currentModelVal) {
        modelCustom.value = currentModelVal;
        modelCustom.style.display = "block";
      }
      state.providerModelDropdowns[provider.id] = namespace.customDropdown.create(modelWrap, {
        dataAttrs: { "provider-id": provider.id, "field": "model-select" },
        items: ddItems,
        selected: ddInitValue,
        showSearch: true,
        showCustom: true,
        customInput: modelCustom,
        onChange: (value) => {
          const modelVal = value === "custom" ? (modelCustom ? modelCustom.value.trim() : "") : value;
          updateProviderDraft(provider.id, {
            model: modelVal,
            modelSelectValue: value,
            modelCustomValue: modelVal
          });
          renderModelParametersPanel();
        }
      });
      modelCustom.addEventListener("input", () => {
        updateProviderDraft(provider.id, {
          model: modelCustom.value.trim(),
          modelSelectValue: "custom",
          modelCustomValue: modelCustom.value
        });
        renderModelParametersPanel();
      });

      const searchInput = card.querySelector(`.model-search-input[data-provider-id="${provider.id}"]`);
      if (searchInput) {
        searchInput.addEventListener("input", () => {
          state.providerModelFilters[provider.id] = searchInput.value;
          applyModelFilter(provider.id, searchInput.value);
        });
      }

      applyModelFilter(provider.id, searchTerm);

      card.querySelectorAll("input[data-model-favorite]").forEach((input) => {
        input.addEventListener("change", () => {
          syncCurrentModelControl(provider.id);
        });
      });
    });
  }

  async function fetchProviderModels(providerId, bypassCache) {
    const provider = state.providers.find((item) => item.id === providerId) || {};
    const config = state.providerConfigs[providerId] || {};
    const baseUrlInput = document.querySelector(`[data-provider-id="${providerId}"][data-field="baseUrl"]`);
    const apiKeyInput = document.querySelector(`[data-provider-id="${providerId}"][data-field="apiKey"]`);
    const accountIdInput = document.querySelector(`[data-provider-id="${providerId}"][data-field="modelListAccountId"]`);
    const tempBaseUrl = baseUrlInput ? baseUrlInput.value.trim() : "";
    const tempApiKey = apiKeyInput ? apiKeyInput.value.trim() : "";
    const tempModelListAccountId = accountIdInput ? accountIdInput.value.trim() : "";
    if (!providerCanListModels(provider)) {
      status(t("{provider} does not expose a model list endpoint.", { provider: provider.displayName || providerId }));
      return;
    }
    const requiresAccountId = String(provider.modelListPath || "").includes("{account_id}");
    const savedModelListAccountId = String(config.modelListAccountId || "").trim();
    if (requiresAccountId && !savedModelListAccountId && !tempModelListAccountId) {
      status(t("Add an account ID for {provider} before loading models.", { provider: provider.displayName || providerId }));
      return;
    }

    const response = await api.runtime.sendMessage({
      type: messageTypes.getProviderModels,
      providerId,
      bypassCache: !!bypassCache,
      tempApiKey,
      tempBaseUrl,
      tempModelListAccountId
    });

    if (!response || !response.ok) {
      status(response?.error?.message || "Could not list models.");
      return;
    }

    state.providerConfigs[providerId] = Object.assign({}, config, {
      availableModels: response.data.models || [],
      favoriteModels: response.data.favoriteModels || config.favoriteModels || [],
      modelsFetchedAt: response.data.modelsFetchedAt || Date.now()
    });
    renderProviders();
    renderModelParametersPanel();
    status(response.data.fromCache
      ? t("Loaded saved model list for {provider}.", { provider: provider.displayName || providerId })
      : t("Loaded models for {provider}.", { provider: provider.displayName || providerId }));
  }

  async function maybeAutoFetchModels() {
    const candidates = state.providers
      .map((provider) => ({ provider, config: state.providerConfigs[provider.id] || {} }))
      .filter(({ provider, config }) => (
        pu.providerIsConfigured(provider, config)
        && providerCanListModels(provider)
        && (!Array.isArray(config.availableModels) || !config.availableModels.length)
      ));
    for (const { config } of candidates) {
      // Fetch silently to pre-populate the model list for first use.
      try {
        await fetchProviderModels(config.id, false);
      } catch (_) {}
    }
  }

  function renderHistory() {
    const container = document.getElementById("history");
    if (!state.history.length) {
      pu.setHtml(container, '<p class="hint">No saved translations yet.</p>');
      return;
    }

    const totalPages = Math.ceil(state.history.length / PAGE_SIZE);
    const page = Math.min(state.historyPage, totalPages - 1);
    const slice = state.history.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const cards = slice.map((entry) => {
      const results = (entry.results || []).map((r) => {
        const label = r.ok
          ? `${pu.escapeHtml(r.providerName)} ${pu.escapeHtml(r.model)}`
          : `${pu.escapeHtml(r.providerName || r.providerId)} - ${t("Error")}`;
        const text = r.ok ? pu.escapeHtml(r.translatedText || "") : pu.escapeHtml(r.error || "");
        return `<div class="history-result"><span class="history-result-label" data-i18n-skip="true">${label}</span><p class="history-result-text" data-i18n-skip="true">${text}</p></div>`;
      }).join("");

      return `
        <article class="history-card">
          <div class="history-title">
            <strong data-i18n-skip="true">${pu.escapeHtml(entry.text.slice(0, 100))}</strong>
            <div class="history-title-meta">
              <span class="history-meta" data-i18n-skip="true">${pu.escapeHtml(entry.targetLanguage)} • ${new Date(entry.createdAt).toLocaleString()}</span>
              <button class="secondary history-copy" data-copy-index="${page * PAGE_SIZE + slice.indexOf(entry)}" type="button">${t("Copy first result")}</button>
            </div>
          </div>
          ${results}
        </article>
      `;
    }).join("");

    const pagination = totalPages > 1 ? `
      <nav class="pagination">
        <button class="secondary" id="prev-page" type="button" ${page === 0 ? "disabled" : ""}>← ${t("Previous")}</button>
        <span>${t("Page")} ${page + 1} / ${totalPages}</span>
        <button class="secondary" id="next-page" type="button" ${page >= totalPages - 1 ? "disabled" : ""}>${t("Next")} →</button>
      </nav>
    ` : "";

    pu.setHtml(container, cards + pagination);

    // pagination handlers
    container.querySelector("#prev-page") && container.querySelector("#prev-page").addEventListener("click", () => {
      state.historyPage = Math.max(0, page - 1);
      renderHistory();
    });
    container.querySelector("#next-page") && container.querySelector("#next-page").addEventListener("click", () => {
      state.historyPage = Math.min(totalPages - 1, page + 1);
      renderHistory();
    });

    // copy handlers
    container.querySelectorAll(".history-copy").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.copyIndex, 10);
        const entry = state.history[idx];
        const firstOk = entry && entry.results && entry.results.find((r) => r.ok);
        if (firstOk && navigator.clipboard) {
          navigator.clipboard.writeText(firstOk.translatedText).then(() => {
            btn.textContent = t("Copied!");
            setTimeout(() => { btn.textContent = t("Copy first result"); }, 1500);
          });
        }
      });
    });
  }

  function renderSiteRules() {
    const container = document.getElementById("site-rules");
    if (!container) {
      return;
    }
    const rules = sre.normalizeRules(state.siteRules || []);
    if (!rules.length) {
      pu.setHtml(container, '<p class="hint">No site rules yet. Use the page context menu to select an inline translation area.</p>');
      return;
    }

    function renderSelectorGroup(rule, kind, title) {
      const selectors = kind === "exclude" ? (rule.excludeSelectors || []) : (rule.includeSelectors || []);
      const emptyText = kind === "exclude" ? t("No excluded areas") : t("Whole matching site");
      const content = selectors.length
        ? selectors.map((selector) => `
          <span class="site-rule-selector-chip">
            <code>${pu.escapeHtml(selector)}</code>
            <button class="secondary" type="button"
              data-remove-selector-rule="${pu.escapeHtml(rule.id)}"
              data-remove-selector-kind="${kind}"
              data-remove-selector-value="${pu.escapeHtml(selector)}">${t("Remove")}</button>
          </span>
        `).join("")
        : `<span class="hint">${emptyText}</span>`;
      return `
        <div class="site-rule-selector-group">
          <span class="site-rule-selector-label">${title}</span>
          <div class="site-rule-selectors">${content}</div>
        </div>
      `;
    }

    pu.setHtml(container, rules.map((rule) => {
      const styleOptions = (namespace.constants.inputContextStyles || []).map((item) => (
        `<option value="${pu.escapeHtml(item.id)}" ${item.id === rule.contextStyle ? "selected" : ""}>${pu.escapeHtml(t(item.label))}</option>`
      )).join("");
      const badge = rule.category === "picker" ? `<span class="site-rule-badge">${t("Picker")}</span>` : "";
      return `
        <article class="site-rule-card" data-rule-id="${pu.escapeHtml(rule.id)}">
          <div class="site-rule-main">
            <label class="site-rule-title">
              <input type="checkbox" data-rule-toggle="${pu.escapeHtml(rule.id)}" ${rule.enabled !== false ? "checked" : ""}>
              <span>${pu.escapeHtml(rule.hostPattern)}</span>
              ${badge}
            </label>
            <label class="site-rule-style">${t("Style")}
              <select data-rule-style="${pu.escapeHtml(rule.id)}">${styleOptions}</select>
            </label>
            ${renderSelectorGroup(rule, "include", t("Translate areas"))}
            ${renderSelectorGroup(rule, "exclude", t("Excluded areas"))}
          </div>
          <button class="secondary" type="button" data-delete-rule="${pu.escapeHtml(rule.id)}">${t("Delete")}</button>
        </article>
      `;
    }).join(""));
  }

  async function persistSiteRules(nextRules) {
    const response = await api.runtime.sendMessage({
      type: messageTypes.saveSiteRules,
      siteRules: nextRules
    });
    if (!response || !response.ok) {
      status(response?.error?.message || "Could not save site rules.");
      return false;
    }
    state.siteRules = response.data.siteRules || [];
    renderSiteRules();
    status("Site rules saved.");
    return true;
  }

  function fillGeneralSettings() {
    state.dropdowns["ui-language"].setValue(state.settings.uiLanguage || "auto");
    state.dropdowns["selection-trigger"].setValue(state.settings.selectionTrigger);
    state.dropdowns["modifier-key"].setValue(state.settings.modifierKey);
    state.dropdowns["input-site-mode"].setValue(pu.normalizeInputSiteMode(state.settings.inputInlineButtonSiteMode));
    state.dropdowns["input-button-style"].setValue(normalizeInputButtonStyle(state.settings.inputInlineButtonStyle));
    state.dropdowns["input-button-icon-position"].setValue(normalizeInputButtonIconPosition(state.settings.inputInlineButtonIconPosition));
    state.dropdowns["input-button-tab-position"].setValue(normalizeInputButtonTabPosition(state.settings.inputInlineButtonTabPosition));
    state.dropdowns["input-context-style"].setValue(pu.getInputContextStyle(state.settings.defaultInputContextStyle));
    state.dropdowns["immersive-display-mode"].setValue(normalizeImmersiveDisplayMode(state.settings.immersiveTranslationDisplayMode));
    state.dropdowns["video-subtitles-mode"].setValue(normalizeVideoSubtitleDisplayMode(state.settings.videoBilingualSubtitlesMode));
    state.dropdowns["video-subtitles-learning-english-level"].setValue(normalizeVideoSubtitleLearningLevel("english", state.settings.videoBilingualSubtitlesLearningEnglishLevel, "B1"));
    state.dropdowns["video-subtitles-learning-japanese-level"].setValue(normalizeVideoSubtitleLearningLevel("japanese", state.settings.videoBilingualSubtitlesLearningJapaneseLevel, "N3"));
    state.dropdowns["video-subtitles-learning-chinese-level"].setValue(normalizeVideoSubtitleLearningLevel("chinese", state.settings.videoBilingualSubtitlesLearningChineseLevel, "HSK3"));
    fillVideoSubtitleAnnotationTypes(state.settings.videoBilingualSubtitlesLearningAnnotationTypes);
    renderDefaultModelSelect();
    renderModelParametersPanel();
    renderLanguageSelect("target-language", "target-language-custom", state.settings.targetLanguage);
    renderLanguageSelect("second-target-language", "second-target-language-custom", state.settings.secondTargetLanguage || "en-US");
    document.getElementById("auto-switch-second-target").checked = !!state.settings.autoSwitchToSecondTarget;
    document.getElementById("dictionary-mode-for-single-word").checked = !!state.settings.dictionaryModeForSingleWord;
    document.getElementById("input-inline-button-enabled").checked = state.settings.inputInlineButtonEnabled !== false;
    document.getElementById("input-button-horizontal-offset").value = clampNumber(state.settings.inputInlineButtonHorizontalOffset, 0, -80, 80);
    document.getElementById("input-blocked-hosts").value = formatHostRuleList(state.settings.inputInlineButtonBlockedHosts || []);
    document.getElementById("input-allowed-hosts").value = formatHostRuleList(state.settings.inputInlineButtonAllowedHosts || []);
    updateInputSiteRuleVisibility();
    updateInputButtonPositionVisibility();
    document.getElementById("immersive-translation-enabled").checked = state.settings.immersiveTranslationEnabled !== false;
    document.getElementById("immersive-translation-auto").checked = !!state.settings.immersiveTranslationAutoTranslate;
    document.getElementById("immersive-translation-visible-only").checked = state.settings.immersiveTranslationVisibleOnly !== false;
    document.getElementById("immersive-min-text-length").value = clampNumber(state.settings.immersiveTranslationMinTextLength, 32, 8, 500);
    document.getElementById("immersive-max-concurrent").value = clampNumber(state.settings.immersiveTranslationMaxConcurrent, 2, 1, 4);
    document.getElementById("video-subtitles-auto").checked = !!state.settings.videoBilingualSubtitlesAutoTranslate;
    document.getElementById("video-subtitles-topic-context").checked = state.settings.videoBilingualSubtitlesTopicContextEnabled !== false;
    document.getElementById("video-subtitles-auto-correct-asr").checked = state.settings.videoBilingualSubtitlesAutoCorrectAsr === true;
    document.getElementById("video-subtitles-word-lookup").checked = state.settings.videoBilingualSubtitlesWordLookupEnabled !== false;
    document.getElementById("video-subtitles-skip-default-target-source").checked = state.settings.videoBilingualSubtitlesSkipDefaultTargetSource !== false;
    document.getElementById("video-subtitles-show-player-button").checked = state.settings.videoBilingualSubtitlesShowPlayerButton !== false;
    document.getElementById("video-subtitles-learning-max-items").value = clampNumber(state.settings.videoBilingualSubtitlesLearningMaxItems, 4, 1, 8);
    document.getElementById("video-subtitles-max-concurrent-batches").value = clampNumber(state.settings.videoBilingualSubtitlesMaxConcurrentBatches, 2, 1, 4);
    setVideoSubtitleSiteRulesDraft(state.settings.videoBilingualSubtitlesSiteRules || []);
    renderVideoSubtitleSiteRules();
    updateVideoSubtitleLearningVisibility();
    document.getElementById("persist-history").checked = !!state.settings.persistHistory;
  }

  function collectProviderConfigs() {
    const nextConfigs = {};
    state.providers.forEach((provider) => {
      const requiresApiKey = providerRequiresApiKey(provider);
      const current = state.providerConfigs[provider.id] || {};
      const enabledInput = document.querySelector(`[data-provider-id="${provider.id}"][data-field="enabled"]`);
      const card = enabledInput ? enabledInput.closest(".provider-card") : null;
      const enabled = enabledInput ? enabledInput.checked : false;
      const isSimple = !providerRequiresApiKey(provider) && providerUsesDefaultModelOnly(provider);

      // Simple providers (e.g. Google Translate) have no model/favorite UI in
      // their card, so preserve state values instead of reading from the DOM.
      if (isSimple) {
        nextConfigs[provider.id] = {
          id: provider.id,
          enabled,
          model: current.model || "",
          baseUrl: current.baseUrl || "",
          favoriteModels: pu.normalizeModels(current.favoriteModels || []),
          modelParameters: current.modelParameters || {},
          availableModels: mc.normalizeModelList(current.availableModels || [], {
            source: provider.id,
            updatedAt: Number(current.modelsFetchedAt || 0)
          }),
          modelsFetchedAt: Number(current.modelsFetchedAt || 0),
          modelListAccountId: current.modelListAccountId || "",
          transport: provider.transport,
          experimental: !!provider.experimental,
          apiKey: current.apiKey || "",
          encryptedApiKey: current.encryptedApiKey || ""
        };
        return;
      }

      const modelSelect = document.querySelector(`[data-provider-id="${provider.id}"][data-field="model-select"]`);
      const modelCustom = document.querySelector(`[data-provider-id="${provider.id}"][data-field="model-custom"]`);
      const model = (modelSelect && modelSelect.value === "custom"
        ? (modelCustom ? modelCustom.value.trim() : "")
        : (modelSelect ? modelSelect.value.trim() : ""));
      const baseUrlInput = document.querySelector(`[data-provider-id="${provider.id}"][data-field="baseUrl"]`);
      const baseUrl = baseUrlInput ? baseUrlInput.value.trim() : (current.baseUrl || "");
      const apiKeyInput = document.querySelector(`[data-provider-id="${provider.id}"][data-field="apiKey"]`);
      const apiKey = apiKeyInput ? apiKeyInput.value.trim() : (requiresApiKey ? "" : (current.apiKey || ""));
      const modelListAccountIdInput = document.querySelector(`[data-provider-id="${provider.id}"][data-field="modelListAccountId"]`);
      const modelListAccountId = modelListAccountIdInput ? modelListAccountIdInput.value.trim() : (current.modelListAccountId || "");
      const favoriteModels = Array.from(card ? card.querySelectorAll("input[data-model-favorite]") : [])
        .filter((input) => input.checked && !input.disabled)
        .map((input) => input.dataset.modelFavorite);
      const availableModels = mc.normalizeModelList(current.availableModels || [], {
        source: provider.id,
        updatedAt: Number(current.modelsFetchedAt || 0)
      });

      const normalizedFavorites = pu.normalizeModels([...favoriteModels, model].filter(Boolean));
      const existingModelParameters = mp.getProviderModelParameters(current);
      const filteredModelParameters = Object.fromEntries(
        Object.entries(existingModelParameters).filter(([modelId]) => normalizedFavorites.includes(modelId))
      );
      if (model) {
        const currentModelEntry = filteredModelParameters[model] && typeof filteredModelParameters[model] === "object"
          ? filteredModelParameters[model]
          : {};
        if (!Object.prototype.hasOwnProperty.call(currentModelEntry, "temperature")) {
          currentModelEntry.temperature = getModelTemperatureValue(current, model);
        }
        filteredModelParameters[model] = mp.normalizeModelParameterEntry(currentModelEntry) || { temperature: namespace.constants.modelTemperatureDefault };
      }

      nextConfigs[provider.id] = {
        id: provider.id,
        enabled,
        model,
        baseUrl,
        favoriteModels: normalizedFavorites,
        modelParameters: filteredModelParameters,
        availableModels,
        modelsFetchedAt: Number(current.modelsFetchedAt || 0),
        modelListAccountId,
        transport: provider.transport,
        experimental: !!provider.experimental,
        apiKey,
        encryptedApiKey: current.encryptedApiKey || ""
      };
    });
    return nextConfigs;
  }

  async function load() {
    status("Loading settings…");
    const response = await api.runtime.sendMessage({ type: messageTypes.getOptionsBootstrap });
    if (!response || !response.ok) {
      status("Could not load settings.");
      return;
    }

    state.settings = response.data.settings;
    state.providers = response.data.providers;
    state.providerConfigs = response.data.providerConfigs;
    state.siteRules = response.data.siteRules || [];
    state.providerDrafts = {};
    state.history = response.data.history;
    state.historyPage = 0;
    i18n.applySettings(state.settings);
    i18n.localize(document);
    if (!state.dropdowns["selection-trigger"]) {
      renderStaticDropdowns();
    }
    renderProviders();
    fillGeneralSettings();
    await maybeAutoFetchModels();
    renderDefaultModelSelect();
    renderHistory();
    renderSiteRules();
    await updateSiteAccessSection();
    status("");
  }

  async function save() {
    const saveButton = document.getElementById("save-button");
    const labelSpan = saveButton.querySelector(".visually-hidden");
    const originalLabel = saveButton.getAttribute("aria-label");
    const previousUiLanguage = state.settings ? state.settings.uiLanguage || "auto" : "auto";
    const nextSettings = collectSettingsFromForm();
    saveButton.disabled = true;
    saveButton.classList.add("is-saving");
    if (labelSpan) labelSpan.textContent = t("Saving...");
    saveButton.setAttribute("aria-label", t("Saving settings"));
    status("Saving…");
    try {
      const response = await api.runtime.sendMessage({
        type: messageTypes.saveOptions,
        settings: nextSettings,
        providerConfigs: collectProviderConfigs()
      });

      if (!response || !response.ok) {
        status(response?.error?.message || "Could not save settings.");
        return;
      }

      const savedUiLanguage = response.data && response.data.settings
        ? response.data.settings.uiLanguage || "auto"
        : nextSettings.uiLanguage || "auto";
      if (savedUiLanguage !== previousUiLanguage) {
        window.location.reload();
        return;
      }

      await load();
      status("Settings saved.");
    } finally {
      saveButton.disabled = false;
      saveButton.classList.remove("is-saving");
      if (labelSpan) labelSpan.textContent = t("Save");
      saveButton.setAttribute("aria-label", originalLabel);
    }
  }

  async function clearHistory() {
    const response = await api.runtime.sendMessage({ type: messageTypes.clearHistory });
    if (!response || !response.ok) {
      status("Could not clear history.");
      return;
    }
    state.history = [];
    state.historyPage = 0;
    renderHistory();
    status("History cleared.");
  }

  document.getElementById("providers").addEventListener("click", async (event) => {
    const toggleButton = event.target.closest("button[data-action='toggle-provider']");
    if (toggleButton) {
      const providerId = toggleButton.dataset.providerId;
      if (!providerId) return;
      const nowExpanded = !isProviderExpanded(providerId);
      state.providerExpanded[providerId] = nowExpanded;

      const card = toggleButton.closest(".provider-card");
      if (card) {
        card.dataset.expanded = nowExpanded ? "true" : "false";
        toggleButton.setAttribute("aria-expanded", nowExpanded ? "true" : "false");

        const content = card.querySelector(".provider-content");
        if (content) {
          content.classList.toggle("is-expanded", nowExpanded);
          content.classList.toggle("is-collapsed", !nowExpanded);
        }
      }

      renderModelParametersPanel();
      return;
    }

    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const providerId = btn.dataset.providerId;
    if (!providerId) return;

    if (btn.dataset.action === "fetch-models" || btn.dataset.action === "refresh-models") {
      const bypassCache = btn.dataset.action === "refresh-models";
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.classList.add("is-fetching");
      btn.textContent = t("Loading...");
      try {
        await fetchProviderModels(providerId, bypassCache);
      } finally {
        btn.disabled = false;
        btn.classList.remove("is-fetching");
        btn.textContent = originalText;
      }
    }
  });

  document.getElementById("providers").addEventListener("change", (event) => {
    const input = event.target;
    if (input && input.dataset && input.dataset.field === "enabled") {
      const providerId = input.dataset.providerId;
      if (providerId && state.providerConfigs[providerId]) {
        state.providerConfigs[providerId] = Object.assign({}, state.providerConfigs[providerId], {
          enabled: input.checked
        });
      }
      renderModelParametersPanel();
      renderDefaultModelSelect();
      return;
    }
    if (!input || !input.dataset || !input.dataset.modelFavorite) return;
    const favoriteRow = input.closest(".model-favorite-row");
    if (favoriteRow) {
      favoriteRow.classList.toggle("model-favorite-row-checked", input.checked);
    }
    const card = input.closest(".provider-card");
    const enabledInput = card ? card.querySelector("input[data-field='enabled']") : null;
    if (!enabledInput) return;
    const favoriteProviderId = enabledInput.dataset.providerId;
    // Persist checked favorites to state so rerenders don't reset checkboxes
    if (favoriteProviderId && state.providerConfigs[favoriteProviderId]) {
      const allFavoriteInputs = card.querySelectorAll("input[data-model-favorite]");
      const checkedFavorites = Array.from(allFavoriteInputs)
        .filter((item) => item.checked && !item.disabled)
        .map((item) => item.dataset.modelFavorite);
      state.providerConfigs[favoriteProviderId] = Object.assign({}, state.providerConfigs[favoriteProviderId], {
        favoriteModels: checkedFavorites
      });
    }
    syncCurrentModelControl(favoriteProviderId);
    renderModelParametersPanel();
    renderDefaultModelSelect();
  });

  document.getElementById("providers").addEventListener("input", (event) => {
    const input = event.target;
    if (!input || !input.dataset) return;
    const providerId = input.dataset.providerId;
    const field = input.dataset.field;
    if (!providerId || !field) return;

    if (field === "baseUrl" || field === "apiKey" || field === "modelListAccountId") {
      updateProviderDraft(providerId, { [field]: input.value });
      if (field === "apiKey" && state.providerConfigs[providerId]) {
        state.providerConfigs[providerId] = Object.assign({}, state.providerConfigs[providerId], {
          apiKey: input.value.trim()
        });
        renderDefaultModelSelect();
        renderModelParametersPanel();
      }
    }
  });

  document.getElementById("model-parameters").addEventListener("input", (event) => {
    const input = event.target;
    if (!input || !input.dataset || input.dataset.parameter !== "temperature") {
      return;
    }

    const providerId = String(input.dataset.providerId || "").trim();
    const modelId = String(input.dataset.modelId || "").trim();
    if (!providerId || !modelId) {
      return;
    }

    const normalized = mp.normalizeTemperature(input.value, namespace.constants.modelTemperatureMax);
    if (normalized === null) {
      return;
    }

    input.value = formatTemperatureInputValue(normalized);
    updateModelParameter(providerId, modelId, { temperature: normalized });
    renderDefaultModelSelect();
  });

  document.getElementById("model-parameters").addEventListener("change", (event) => {
    const input = event.target;
    if (!input || !input.dataset || input.dataset.parameter !== "reasoningEffort") {
      return;
    }

    const providerId = String(input.dataset.providerId || "").trim();
    const modelId = String(input.dataset.modelId || "").trim();
    if (!providerId || !modelId) {
      return;
    }

    const provider = state.providers.find((item) => item && item.id === providerId) || { id: providerId };
    const config = state.providerConfigs[providerId] || {};
    const providerContext = getProviderReasoningContext(provider, config);
    const meta = getModelMeta(config, providerId, modelId);
    const normalized = mp.normalizeReasoningEffort(input.value);
    const effective = normalized
      ? mc.normalizeProviderReasoningEffort(providerContext, meta, normalized)
      : normalized;
    input.value = effective || namespace.constants.modelReasoningEffortDefault || "off";
    updateModelParameter(providerId, modelId, { reasoningEffort: effective });
    renderDefaultModelSelect();
  });

  document.getElementById("site-rules").addEventListener("change", async (event) => {
    const input = event.target;
    if (!input || !input.dataset || (!input.dataset.ruleToggle && !input.dataset.ruleStyle)) {
      return;
    }
    const ruleId = input.dataset.ruleToggle || input.dataset.ruleStyle;
    const nextRules = sre.normalizeRules(state.siteRules || []).map((rule) => (
      rule.id === ruleId
        ? Object.assign({}, rule, input.dataset.ruleToggle
          ? { enabled: input.checked, updatedAt: new Date().toISOString() }
          : { contextStyle: sre.normalizeContextStyle(input.value), updatedAt: new Date().toISOString() })
        : rule
    ));
    await persistSiteRules(nextRules);
  });

  document.getElementById("site-rules").addEventListener("click", async (event) => {
    const removeSelectorButton = event.target.closest("button[data-remove-selector-rule]");
    if (removeSelectorButton) {
      const ruleId = removeSelectorButton.dataset.removeSelectorRule;
      const kind = removeSelectorButton.dataset.removeSelectorKind === "exclude" ? "exclude" : "include";
      const selectorValue = String(removeSelectorButton.dataset.removeSelectorValue || "");
      const nextRules = sre.normalizeRules(state.siteRules || []).flatMap((rule) => {
        if (rule.id !== ruleId) {
          return [rule];
        }
        const patch = kind === "exclude"
          ? { excludeSelectors: (rule.excludeSelectors || []).filter((selector) => selector !== selectorValue) }
          : { includeSelectors: (rule.includeSelectors || []).filter((selector) => selector !== selectorValue) };
        const nextRule = Object.assign({}, rule, patch, { updatedAt: new Date().toISOString() });
        const selectorCount = (nextRule.includeSelectors || []).length + (nextRule.excludeSelectors || []).length;
        return rule.category === "picker" && selectorCount === 0 ? [] : [nextRule];
      });
      await persistSiteRules(nextRules);
      return;
    }

    const button = event.target.closest("button[data-delete-rule]");
    if (!button) {
      return;
    }
    const ruleId = button.dataset.deleteRule;
    const response = await api.runtime.sendMessage({
      type: messageTypes.deleteSiteRule,
      ruleId
    });
    if (!response || !response.ok) {
      status(response?.error?.message || "Could not delete site rule.");
      return;
    }
    state.siteRules = response.data.siteRules || [];
    renderSiteRules();
    status("Site rule deleted.");
  });

  document.getElementById("add-video-subtitle-site-rule").addEventListener("click", addVideoSubtitleSiteRule);

  document.getElementById("video-subtitle-site-rules").addEventListener("input", (event) => {
    const input = event.target;
    if (!input || !input.dataset || !input.dataset.videoSubtitleRuleField) {
      return;
    }
    const card = input.closest("[data-video-subtitle-rule-id]");
    const ruleId = card && card.dataset.videoSubtitleRuleId;
    const field = input.dataset.videoSubtitleRuleField;
    if (!ruleId || field === "enabled") {
      return;
    }
    updateVideoSubtitleSiteRule(ruleId, {
      [field]: input.value
    });
  });

  document.getElementById("video-subtitle-site-rules").addEventListener("change", (event) => {
    const input = event.target;
    if (!input || !input.dataset || !input.dataset.videoSubtitleRuleField) {
      return;
    }
    const card = input.closest("[data-video-subtitle-rule-id]");
    const ruleId = card && card.dataset.videoSubtitleRuleId;
    const field = input.dataset.videoSubtitleRuleField;
    if (!ruleId) {
      return;
    }
    updateVideoSubtitleSiteRule(ruleId, {
      [field]: field === "enabled" ? input.checked : input.value
    });
  });

  document.getElementById("video-subtitle-site-rules").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-delete-video-subtitle-rule]");
    if (!button) {
      return;
    }
    deleteVideoSubtitleSiteRule(button.dataset.deleteVideoSubtitleRule);
  });

  document.getElementById("save-button").addEventListener("click", save);
  document.getElementById("grant-site-access").addEventListener("click", grantSiteAccess);
  document.getElementById("clear-history").addEventListener("click", clearHistory);
  document.getElementById("export-config").addEventListener("click", exportConfig);
  document.getElementById("import-config").addEventListener("click", () => {
    const input = document.getElementById("import-config-file");
    input.value = "";
    input.click();
  });
  document.getElementById("import-config-file").addEventListener("change", async (event) => {
    const file = event.target && event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    await importConfig(file);
  });
  document.addEventListener("click", handleSettingHelpClick);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSettingHelp();
    }
  });
  window.addEventListener("scroll", closeSettingHelp, { passive: true });
  window.addEventListener("resize", closeSettingHelp);
  load();
}(globalThis));
