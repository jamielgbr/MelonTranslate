(function initActionPopup(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const messageTypes = namespace.messages.types;
  const pu = namespace.pageUtils;

  const state = {
    settings: null,
    providers: [],
    providerConfigs: {},
    currentResult: "",
    currentReasoning: "",
    detectedSourceLanguage: "",
    currentTargetLanguage: "",
    reasoningExpanded: false,
    streamStartedAtMs: 0,
    firstTokenAtMs: 0,
    outputTokens: 0,
    tokPerSec: 0,
    fromCache: false,
    modelOptions: [],
    readAloudToken: 0,
    readAloudAudio: null,
    readAloudLoading: false,
    readAloudPlaying: false,
    sourceReadAloudToken: 0,
    sourceReadAloudAudio: null,
    sourceReadAloudLoading: false,
    sourceReadAloudPlaying: false,
    dropdowns: {}
  };

  const RESULT_PLACEHOLDER = "No translation yet.";

  function setMetricsLine(firstTokenMs, outputTokens, tokPerSec, fromCache) {
    const metricsEl = document.getElementById("popup-metrics");
    if (fromCache) {
      metricsEl.textContent = "Cached";
      metricsEl.classList.remove("hidden");
      return;
    }
    const hasMetrics = (Number.isFinite(firstTokenMs) && firstTokenMs >= 0) || outputTokens > 0;
    if (!hasMetrics) {
      metricsEl.textContent = "";
      metricsEl.classList.add("hidden");
      return;
    }
    metricsEl.textContent = pu.formatMetricsLine(firstTokenMs, outputTokens, tokPerSec, false);
    metricsEl.classList.remove("hidden");
  }

  function renderSourceLanguageSelector(value) {
    const wrap = document.getElementById("popup-source-language-wrap");
    const custom = document.getElementById("popup-source-language-custom");
    state.dropdowns["source-language"] = pu.renderLanguageDropdown(wrap, custom, {
      value: value || "auto",
      includeAuto: true,
      id: "popup-source-language-select"
    });
  }

  function getSourceLanguage() {
    return pu.getLanguageValue(
      document.getElementById("popup-source-language-select"),
      document.getElementById("popup-source-language-custom"),
      "auto"
    );
  }

  function setStatus(message) {
    const statusEl = document.getElementById("popup-status");
    const normalized = String(message || "").trim();
    statusEl.textContent = normalized;
    statusEl.classList.toggle("hidden", !normalized);
  }

  const SPEAK_SVG = namespace.readAloud.SPEAK_SVG;
  const STOP_SVG = namespace.readAloud.STOP_SVG;
  const ra = namespace.readAloud;

  function updateSpeakButton() {
    const speakButton = document.getElementById("popup-speak");
    if (!speakButton) {
      return;
    }

    if (state.readAloudLoading) {
      speakButton.disabled = true;
      pu.setHtml(speakButton, SPEAK_SVG);
      speakButton.title = "Loading\u2026";
      speakButton.setAttribute("aria-label", "Loading\u2026");
      return;
    }

    speakButton.disabled = !state.currentResult;
    pu.setHtml(speakButton, state.readAloudPlaying ? STOP_SVG : SPEAK_SVG);
    speakButton.title = state.readAloudPlaying ? "Stop reading" : "Read translation aloud";
    speakButton.setAttribute("aria-label", state.readAloudPlaying ? "Stop reading" : "Read translation aloud");
  }

  function updateSpeakSourceButton() {
    const btn = document.getElementById("popup-speak-source");
    if (!btn) {
      return;
    }
    const hasText = !!document.getElementById("popup-source-text").value.trim();
    if (state.sourceReadAloudLoading) {
      btn.disabled = true;
      pu.setHtml(btn, SPEAK_SVG);
      btn.title = "Loading\u2026";
      btn.setAttribute("aria-label", "Loading\u2026");
      return;
    }
    btn.disabled = !hasText;
    pu.setHtml(btn, state.sourceReadAloudPlaying ? STOP_SVG : SPEAK_SVG);
    btn.title = state.sourceReadAloudPlaying ? "Stop reading" : "Read source text aloud";
    btn.setAttribute("aria-label", state.sourceReadAloudPlaying ? "Stop reading" : "Read source text aloud");
  }

  function stopReadAloud() {
    state.readAloudToken += 1;
    state.readAloudLoading = false;
    state.readAloudPlaying = false;
    if (state.readAloudAudio) {
      state.readAloudAudio.pause();
      state.readAloudAudio.src = "";
      state.readAloudAudio = null;
    }
    updateSpeakButton();
  }

  function stopSourceReadAloud() {
    state.sourceReadAloudToken += 1;
    state.sourceReadAloudLoading = false;
    state.sourceReadAloudPlaying = false;
    if (state.sourceReadAloudAudio) {
      state.sourceReadAloudAudio.pause();
      state.sourceReadAloudAudio.src = "";
      state.sourceReadAloudAudio = null;
    }
    updateSpeakSourceButton();
  }

  function setResultText(text, options) {
    const resultEl = document.getElementById("popup-result");
    const normalized = String(text || "");
    const showPlaceholder = !options || options.showPlaceholder !== false;
    if (normalized) {
      resultEl.textContent = normalized;
      resultEl.classList.remove("placeholder");
      return;
    }
    if (!showPlaceholder) {
      resultEl.textContent = "";
      resultEl.classList.remove("placeholder");
      return;
    }
    resultEl.textContent = RESULT_PLACEHOLDER;
    resultEl.classList.add("placeholder");
  }

  function renderLanguageSelector(settings) {
    const wrap = document.getElementById("popup-target-language-wrap");
    const custom = document.getElementById("popup-target-language-custom");
    state.dropdowns["target-language"] = pu.renderLanguageDropdown(wrap, custom, {
      value: settings.targetLanguage || "en",
      id: "popup-target-language-select"
    });
  }

  function getTargetLanguage() {
    return pu.getLanguageValue(
      document.getElementById("popup-target-language-select"),
      document.getElementById("popup-target-language-custom"),
      "en"
    );
  }

  function getModelKey() {
    const dd = state.dropdowns["model"];
    return dd ? dd.getValue() : "";
  }

  function updateModelProviderInfo() {
    const modelKey = getModelKey();
    const parsed = pu.parseDefaultModelKey(modelKey);
    const provider = state.providers.find((item) => item.id === parsed.providerId);
    const providerName = provider ? provider.displayName : parsed.providerId || "-";
    const providerInfo = document.getElementById("popup-model-provider");
    if (!providerInfo) {
      return;
    }
    providerInfo.textContent = `Provider: ${providerName || "-"}`;
  }

  function renderModelSelector() {
    const wrap = document.getElementById("popup-model-wrap");
    const configured = state.providers.filter((provider) => {
      const config = state.providerConfigs[provider.id] || {};
      return pu.providerIsConfigured(provider, config);
    });

    state.modelOptions = configured.flatMap((provider) => {
      const config = state.providerConfigs[provider.id] || {};
      const models = Array.from(new Set([
        ...(Array.isArray(config.favoriteModels) ? config.favoriteModels : []),
        config.model || ""
      ].map((item) => String(item || "").trim()).filter(Boolean)));
      return models.map((model) => ({
        key: pu.buildDefaultModelKey(provider.id, model),
        providerId: provider.id,
        model,
        label: `${provider.displayName} · ${model}`
      }));
    });

    const items = state.modelOptions.map((item) => ({ value: item.key, label: item.label }));

    if (!items.length) {
      state.dropdowns["model"] = namespace.customDropdown.create(wrap, {
        id: "popup-model",
        items: [{ value: "", label: "No favorite models available" }],
        selected: "",
        showSearch: true,
        onChange: () => updateModelProviderInfo()
      });
      state.dropdowns["model"].setDisabled(true);
      updateModelProviderInfo();
      return;
    }

    let selectedKey = "";
    const defaultModelKey = state.settings.defaultTranslationModelKey;
    if (defaultModelKey && state.modelOptions.some((item) => item.key === defaultModelKey)) {
      selectedKey = defaultModelKey;
    } else {
      const parsedDefaultModel = pu.parseDefaultModelKey(defaultModelKey);
      if (parsedDefaultModel.providerId) {
        const providerMatch = state.modelOptions.find((item) => item.providerId === parsedDefaultModel.providerId);
        if (providerMatch) selectedKey = providerMatch.key;
      }
      if (!selectedKey && state.settings.defaultTranslationProviderId) {
        const providerMatch = state.modelOptions.find((item) => item.providerId === state.settings.defaultTranslationProviderId);
        if (providerMatch) selectedKey = providerMatch.key;
      }
      if (!selectedKey) selectedKey = state.modelOptions[0].key;
    }

    state.dropdowns["model"] = namespace.customDropdown.create(wrap, {
      id: "popup-model",
      items,
      selected: selectedKey,
      showSearch: true,
      onChange: () => updateModelProviderInfo()
    });
    updateModelProviderInfo();
  }

  async function load() {
    setStatus("Loading settings...");
    const response = await api.runtime.sendMessage({ type: messageTypes.getOptionsBootstrap });
    if (!response || !response.ok) {
      setStatus("Could not load settings.");
      return;
    }

    state.settings = response.data.settings;
    state.providers = response.data.providers;
    state.providerConfigs = response.data.providerConfigs;

    renderLanguageSelector(state.settings);
    renderSourceLanguageSelector("auto");
    renderModelSelector();
    setMetricsLine(-1, 0, 0, false);
    updateSpeakButton();
    updateSpeakSourceButton();
    setStatus("");
  }

  async function toggleReadAloud() {
    if (!state.currentResult) {
      return;
    }

    if (state.readAloudPlaying || state.readAloudLoading) {
      stopReadAloud();
      setStatus("Read aloud stopped.");
      return;
    }

    stopSourceReadAloud();

    const token = state.readAloudToken + 1;
    state.readAloudToken = token;
    state.readAloudLoading = true;
    updateSpeakButton();

    try {
      const response = await api.runtime.sendMessage({
        type: messageTypes.readAloud,
        text: state.currentResult,
        language: state.currentTargetLanguage || getTargetLanguage()
      });

      if (token !== state.readAloudToken) {
        return;
      }

      if (!response || !response.ok) {
        throw new Error(response?.error?.message || "Could not load read aloud audio.");
      }

      state.readAloudLoading = false;
      state.readAloudPlaying = true;
      updateSpeakButton();
      await ra.playReadAloudClips(
        response.data.clips || [],
        token,
        () => state.readAloudToken,
        (audio) => { state.readAloudAudio = audio; },
        () => { state.readAloudPlaying = false; state.readAloudAudio = null; updateSpeakButton(); }
      );
      if (token === state.readAloudToken) {
        setStatus("Read aloud complete.");
      }
    } catch (error) {
      if (token === state.readAloudToken) {
        stopReadAloud();
        setStatus(error.message || "Could not play read aloud.");
      }
    }
  }

  async function toggleReadAloudSource() {
    const text = document.getElementById("popup-source-text").value.trim();
    if (!text) {
      return;
    }

    if (state.sourceReadAloudPlaying || state.sourceReadAloudLoading) {
      stopSourceReadAloud();
      setStatus("Read aloud stopped.");
      return;
    }

    stopReadAloud();

    const token = state.sourceReadAloudToken + 1;
    state.sourceReadAloudToken = token;
    state.sourceReadAloudLoading = true;
    updateSpeakSourceButton();

    try {
      const response = await api.runtime.sendMessage({
        type: messageTypes.readAloud,
        text,
        language: getSourceLanguage()
      });

      if (token !== state.sourceReadAloudToken) {
        return;
      }

      if (!response || !response.ok) {
        throw new Error(response?.error?.message || "Could not load read aloud audio.");
      }

      state.sourceReadAloudLoading = false;
      state.sourceReadAloudPlaying = true;
      updateSpeakSourceButton();
      await ra.playReadAloudClips(
        response.data.clips || [],
        token,
        () => state.sourceReadAloudToken,
        (audio) => { state.sourceReadAloudAudio = audio; },
        () => { state.sourceReadAloudPlaying = false; state.sourceReadAloudAudio = null; updateSpeakSourceButton(); }
      );
      if (token === state.sourceReadAloudToken) {
        setStatus("Read aloud complete.");
      }
    } catch (error) {
      if (token === state.sourceReadAloudToken) {
        stopSourceReadAloud();
        setStatus(error.message || "Could not play read aloud.");
      }
    }
  }

  function translate() {
    const text = document.getElementById("popup-source-text").value.trim();
    const modelKey = getModelKey();
    const parsed = pu.parseDefaultModelKey(modelKey);
    const providerId = parsed.providerId;
    const model = parsed.model;
    const sourceLanguage = getSourceLanguage();
    const targetLanguage = getTargetLanguage();

    if (!text) {
      setStatus("Enter some text first.");
      return;
    }
    if (!providerId) {
      setStatus("Enable a provider in Settings first.");
      return;
    }

    stopReadAloud();
    stopSourceReadAloud();
    const reasoningWrapEl = document.getElementById("popup-reasoning-wrap");
    const reasoningEl = document.getElementById("popup-reasoning");
    setResultText("", { showPlaceholder: false });
    state.currentResult = "";
    state.currentReasoning = "";
    state.reasoningExpanded = false;
    state.currentTargetLanguage = targetLanguage;
    state.streamStartedAtMs = Date.now();
    state.firstTokenAtMs = 0;
    state.outputTokens = 0;
    state.tokPerSec = 0;
    state.fromCache = false;
    setMetricsLine(-1, 0, 0, false);
    reasoningEl.textContent = "";
    reasoningWrapEl.classList.add("hidden");
    reasoningWrapEl.open = false;
    setStatus("Translating...");

    const port = api.runtime.connect({ name: "melontranslate-stream" });
    port.onMessage.addListener((message) => {
      if (message.event === "keepalive") {
        return;
      }
      if (message.event === "provider-chunk") {
        state.fromCache = !!message.fromCache;
        state.currentTargetLanguage = String(message.targetLanguage || state.currentTargetLanguage || "").trim();
        state.detectedSourceLanguage = String(message.detectedSourceLanguage || state.detectedSourceLanguage || "").trim();
        const translatedChunk = String(message.chunk || "");
        const reasoningChunk = String(message.thinkingChunk || "");
        const hasAnyChunk = !!translatedChunk || !!reasoningChunk;
        if (hasAnyChunk && !state.firstTokenAtMs) {
          state.firstTokenAtMs = Date.now();
        }
        if (reasoningChunk) {
          state.currentReasoning += reasoningChunk;
          reasoningEl.textContent = state.currentReasoning;
          reasoningWrapEl.classList.remove("hidden");
          state.reasoningExpanded = true;
          reasoningWrapEl.open = true;
          reasoningEl.scrollTop = reasoningEl.scrollHeight;
        }
        if (translatedChunk) {
          state.currentResult += translatedChunk;
          state.reasoningExpanded = false;
          reasoningWrapEl.open = false;
        }
        pu.updateStreamMetrics(state, `${state.currentResult}${state.currentReasoning}`, message.outputTokens);
        const firstTokenMs = state.firstTokenAtMs ? (state.firstTokenAtMs - state.streamStartedAtMs) : -1;
        setMetricsLine(firstTokenMs, state.outputTokens, state.tokPerSec, state.fromCache);
        setResultText(state.currentResult, { showPlaceholder: !state.currentReasoning });
        return;
      }

      if (message.event === "provider-complete") {
        state.fromCache = !!(message.result && message.result.fromCache);
        state.currentResult = message.result && message.result.translatedText ? message.result.translatedText : state.currentResult;
        state.currentReasoning = message.result && message.result.thinkingText ? message.result.thinkingText : state.currentReasoning;
        state.detectedSourceLanguage = String(message.result && message.result.detectedSourceLanguage || "").trim() || state.detectedSourceLanguage;
        state.currentTargetLanguage = String(message.result && message.result.targetLanguage || "").trim() || state.currentTargetLanguage;
        setResultText(state.currentResult, { showPlaceholder: !state.currentReasoning });
        reasoningEl.textContent = state.currentReasoning;
        if (state.currentReasoning) {
          reasoningWrapEl.classList.remove("hidden");
          reasoningWrapEl.open = !state.currentResult;
        } else {
          reasoningWrapEl.classList.add("hidden");
          reasoningWrapEl.open = false;
        }
        pu.updateStreamMetrics(state, `${state.currentResult}${state.currentReasoning}`, message.result && message.result.outputTokens);
        const firstTokenMs = state.firstTokenAtMs ? (state.firstTokenAtMs - state.streamStartedAtMs) : -1;
        setMetricsLine(firstTokenMs, state.outputTokens, state.tokPerSec, state.fromCache);
        updateSpeakButton();
        setStatus("Translation complete.");
        port.disconnect();
        return;
      }

      if (message.event === "provider-error") {
        const err = message.error && message.error.error ? message.error.error : "Translation failed.";
        setStatus(err);
        setResultText(state.currentResult);
        updateSpeakButton();
        port.disconnect();
      }
    });

    port.postMessage({
      type: messageTypes.translateStream,
      text,
      sourceLanguage,
      targetLanguage,
      providerIds: [providerId],
      modelOverrides: { [providerId]: model },
      url: "extension://action-popup"
    });
  }

  function copyResult() {
    if (!state.currentResult || !navigator.clipboard) return;
    navigator.clipboard.writeText(state.currentResult).then(() => {
      setStatus("Copied.");
    });
  }

  async function openCompare() {
    const modelKey = getModelKey();
    const parsed = pu.parseDefaultModelKey(modelKey);
    await api.runtime.sendMessage({
      type: messageTypes.openComparePage,
      providerId: parsed.providerId || ""
    });
  }

  async function openOptions() {
    await api.tabs.create({ url: api.runtime.getURL("src/pages/options/options.html") });
  }

  function toggleSection(toggleButtonId, contentId) {
    const button = document.getElementById(toggleButtonId);
    const content = document.getElementById(contentId);
    if (!button || !content) {
      return;
    }
    const expanded = button.getAttribute("aria-expanded") !== "false";
    const nextExpanded = !expanded;
    button.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
    content.classList.toggle("is-collapsed", !nextExpanded);
  }

  document.getElementById("popup-translate").addEventListener("click", translate);
  document.getElementById("popup-copy").addEventListener("click", copyResult);
  document.getElementById("popup-speak").addEventListener("click", toggleReadAloud);
  document.getElementById("popup-speak-source").addEventListener("click", toggleReadAloudSource);
  document.getElementById("popup-source-text").addEventListener("input", updateSpeakSourceButton);
  document.getElementById("popup-toggle-input").addEventListener("click", () => {
    toggleSection("popup-toggle-input", "popup-input-content");
  });
  document.getElementById("open-compare").addEventListener("click", openCompare);
  document.getElementById("open-options").addEventListener("click", openOptions);

  load();
}(globalThis));
