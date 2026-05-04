(function initComparePage(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const messageTypes = namespace.messages.types;
  const pu = namespace.pageUtils;
  const mc = namespace.modelCapabilities;
  const SESSION_KEY = "melontranslate-compare-state";

  const state = {
    settings: null,
    providers: [],
    providerConfigs: {},
    liveResults: {},
    preselectedProviderIds: null,
    dropdowns: {}
  };

  function setStatus(message) {
    document.getElementById("status").textContent = message;
  }

  function saveSession() {
    try {
      const text = document.getElementById("source-text").value;
      const targetLanguage = getTargetLanguageValue();
      const sourceLanguage = getSourceLanguageValue();
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ text, targetLanguage, sourceLanguage }));
    } catch (_) {}
  }

  function restoreSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.text) document.getElementById("source-text").value = saved.text;
      if (saved.targetLanguage) setTargetLanguageValue(saved.targetLanguage);
      if (saved.sourceLanguage) setSourceLanguageValue(saved.sourceLanguage);
    } catch (_) {}
  }

  function renderSourceLanguageSelector(value) {
    const wrap = document.getElementById("source-language-wrap");
    const customInput = document.getElementById("source-language-custom");
    state.dropdowns["source-language"] = pu.renderLanguageDropdown(wrap, customInput, {
      value: value || "auto",
      includeAuto: true,
      id: "source-language"
    });
  }

  function setSourceLanguageValue(value) {
    const dd = state.dropdowns["source-language"];
    if (!dd) return;
    const custom = document.getElementById("source-language-custom");
    const selected = String(value || "auto").trim();
    const knownCodes = pu.languageCodes();
    if (!selected || selected === "auto" || knownCodes.includes(selected)) {
      dd.setValue(selected || "auto");
      if (custom) custom.value = "";
    } else {
      dd.setValue("custom");
      if (custom) custom.value = selected;
    }
  }

  function getSourceLanguageValue() {
    return pu.getLanguageValue(
      document.getElementById("source-language"),
      document.getElementById("source-language-custom"),
      "auto"
    );
  }

  function renderTargetLanguageSelector(value) {
    const wrap = document.getElementById("target-language-wrap");
    const customInput = document.getElementById("target-language-custom");
    state.dropdowns["target-language"] = pu.renderLanguageDropdown(wrap, customInput, {
      value: value || "en",
      id: "target-language"
    });
  }

  function setTargetLanguageValue(value) {
    const dd = state.dropdowns["target-language"];
    if (!dd) return;
    const custom = document.getElementById("target-language-custom");
    const selected = String(value || "en").trim();
    const knownCodes = pu.languageCodes();
    if (knownCodes.includes(selected)) {
      dd.setValue(selected);
      if (custom) custom.value = "";
    } else {
      dd.setValue("custom");
      if (custom) custom.value = selected;
    }
  }

  function getTargetLanguageValue() {
    return pu.getLanguageValue(
      document.getElementById("target-language"),
      document.getElementById("target-language-custom"),
      (state.settings && state.settings.targetLanguage) || "en"
    );
  }

  function buildModelOverrideChoices(provider, config) {
    const favorites = pu.normalizeModels(config.favoriteModels || []);
    const current = String(config.model || "").trim();
    const availableModels = mc.normalizeModelList(config.availableModels || [], {
      source: config.id || "provider",
      updatedAt: Number(config.modelsFetchedAt || 0)
    });
    const modelById = Object.fromEntries(availableModels.map((model) => [model.id, model]));
    const models = Array.from(new Set([...favorites, current].filter(Boolean))).map((model) => {
      const meta = modelById[model] || mc.normalizeModelEntry(model, {
        source: config.id || "provider",
        updatedAt: Number(config.modelsFetchedAt || 0)
      });
      if (!mc.isTextGenerationModel(meta)) {
        return null;
      }
      return {
        value: model,
        label: mc.formatModelOptionLabel(provider.displayName || provider.id, model, meta)
      };
    }).filter(Boolean);
    const defaultLabel = `Default${current ? `: ${current}` : ""}`;
    return { defaultLabel, models };
  }

  function getAvailableProviders() {
    return state.providers.filter((provider) => {
      const config = state.providerConfigs[provider.id] || {};
      return pu.providerIsConfigured(provider, config);
    });
  }

  function renderProviderSelector() {
    const availableProviders = getAvailableProviders();
    const availableProviderIds = availableProviders.map((provider) => provider.id);
    const selector = document.getElementById("provider-selector");
    if (!availableProviders.length) {
      selector.innerHTML = '<p class="hint">No provider is ready yet. Configure one in Options first.</p>';
      return;
    }

    const selectedProviderIds = Array.isArray(state.preselectedProviderIds) && state.preselectedProviderIds.length
      ? state.preselectedProviderIds
      : availableProviderIds;

    pu.setHtml(selector, availableProviders.map((provider) => {
      const config = state.providerConfigs[provider.id] || {};
      const checked = selectedProviderIds.includes(provider.id) ? "checked" : "";
      const footerHidden = provider.id === "google-translate" ? ' style="display: none;"' : "";
      return `
        <div class="provider-chip">
          <label class="chip-toggle">
            <input type="checkbox" class="chip-checkbox" value="${pu.escapeHtml(provider.id)}" ${checked}>
            <span class="chip-provider-icon chip-provider-icon-${pu.escapeHtml(provider.id)}" aria-hidden="true">${pu.getProviderIconHtml(provider)}</span>
            <span class="chip-name" title="${pu.escapeHtml(provider.displayName)}">${pu.escapeHtml(provider.displayName)}</span>
          </label>
          <div class="chip-footer"${footerHidden}>
            <div class="cdd-model-wrap" data-provider-id="${pu.escapeHtml(provider.id)}"></div>
            <input type="text" class="model-override-custom" data-provider-id="${pu.escapeHtml(provider.id)}" placeholder="Custom model ID" style="display: none; margin-top: 6px;">
          </div>
        </div>
      `;
    }).join(""));

    availableProviders.forEach((provider) => {
      if (provider.id === "google-translate") return;
      const config = state.providerConfigs[provider.id] || {};
      const wrap = selector.querySelector(`.cdd-model-wrap[data-provider-id="${provider.id}"]`);
      const customInput = selector.querySelector(`.model-override-custom[data-provider-id="${provider.id}"]`);
      const { defaultLabel, models } = buildModelOverrideChoices(provider, config);
      namespace.customDropdown.create(wrap, {
        classNames: "model-override",
        dataAttrs: { "provider-id": provider.id },
        items: [{ value: "", label: defaultLabel }, ...models],
        selected: "",
        showSearch: true,
        showCustom: true,
        customInput
      });
    });
  }

  function renderResults(results) {
    const container = document.getElementById("results");
    if (!results.length) {
      container.innerHTML = '<p class="hint">Results will appear here.</p>';
      return;
    }

    pu.setHtml(container, results.map((result) => {
      const provider = state.providers.find((p) => p.id === result.providerId);
      const providerIconHtml = provider ? pu.getProviderIconHtml(provider) : "";
      const thinkingText = String(result.thinkingText || "").trim();
      const promptText = result.providerId === "google-translate" ? "" : String(result.prompt || "").trim();
      const outputTokens = Number.isFinite(Number(result.outputTokens))
        ? Number(result.outputTokens)
        : pu.estimateOutputTokens(`${result.translatedText || ""}${result.thinkingText || ""}`);
      const tokPerSec = Number(result.tokPerSec || 0);
      const firstTokenMs = Number(result.firstTokenLatencyMs);
      const reasoningOpenAttr = result.reasoningExpanded ? " open" : "";
      const thinkingSection = thinkingText
        ? `<details class="result-thinking"${reasoningOpenAttr}><summary class="result-thinking-summary">Model reasoning</summary><p class="result-thinking-text">${pu.escapeHtml(thinkingText)}</p></details>`
        : "";
      const promptSection = promptText
        ? `<details class="result-prompt"><summary class="result-prompt-summary">Prompt preview</summary><pre class="result-prompt-text">${pu.escapeHtml(promptText)}</pre></details>`
        : "";
      const body = result.ok
        ? `<p class="result-text">${pu.escapeHtml(result.translatedText)}</p>
          <p class="result-stream-stats">${pu.formatMetricsLine(firstTokenMs, outputTokens, tokPerSec, result.fromCache)}</p>
           ${thinkingSection}
            ${promptSection}
           <button class="secondary result-copy" type="button" data-text="${pu.escapeHtml(result.translatedText)}">Copy</button>`
        : `<p class="result-text result-error">${pu.escapeHtml(result.error || "Unknown error")}</p>${promptSection}`;
      const fromCache = result.fromCache ? ' <span class="cached-badge">Cached</span>' : "";
      return `
        <article class="result-card">
          <div class="result-header">
            <span class="result-provider-icon" aria-hidden="true">${providerIconHtml}</span>
            <strong>${pu.escapeHtml(result.providerName || result.providerId)}</strong>
            <span class="result-meta">${result.providerId === "google-translate" ? "" : pu.escapeHtml(result.model || "")}${result.ok ? ` • ${result.latencyMs}\u202fms${fromCache}` : ""}</span>
          </div>
          ${body}
        </article>
      `;
    }).join(""));

    container.querySelectorAll(".result-copy").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(btn.dataset.text).then(() => {
            btn.textContent = "Copied!";
            setTimeout(() => { btn.textContent = "Copy"; }, 1500);
          });
        }
      });
    });

    // Keep reasoning output pinned to the latest line while it streams.
    container.querySelectorAll(".result-thinking[open] .result-thinking-text").forEach((panel) => {
      panel.scrollTop = panel.scrollHeight;
    });
  }

  let _renderLiveResultsPending = false;
  function renderLiveResults() {
    if (_renderLiveResultsPending) return;
    _renderLiveResultsPending = true;
    requestAnimationFrame(() => {
      _renderLiveResultsPending = false;
      renderResults(Object.values(state.liveResults));
    });
  }

  async function bootstrap() {
    setStatus("Loading settings…");
    const response = await api.runtime.sendMessage({ type: messageTypes.getOptionsBootstrap });
    if (!response || !response.ok) {
      setStatus("Could not load settings.");
      return;
    }

    state.settings = response.data.settings;
    state.providers = response.data.providers;
    state.providerConfigs = response.data.providerConfigs;
    const providerIdFromUrl = new URLSearchParams(window.location.search).get("providerId");
    if (providerIdFromUrl && pu.providerIsConfigured(
      state.providers.find((provider) => provider.id === providerIdFromUrl),
      state.providerConfigs[providerIdFromUrl]
    )) {
      state.preselectedProviderIds = [providerIdFromUrl];
    }
    renderSourceLanguageSelector("auto");
    renderTargetLanguageSelector(state.settings.targetLanguage);
    restoreSession();
    renderProviderSelector();
    renderResults([]);
    setStatus("");
  }

  async function translate() {
    const text = document.getElementById("source-text").value.trim();
    const sourceLanguage = getSourceLanguageValue();
    const targetLanguage = getTargetLanguageValue();
    saveSession();

    const availableProviders = getAvailableProviders();
    if (!availableProviders.length) {
      setStatus("No provider is ready yet. Configure one in Options first.");
      return;
    }

    const selectedProviders = Array.from(document.querySelectorAll("#provider-selector input[type='checkbox']:checked"))
      .map((input) => {
        const providerId = input.value;
        const modelOverrideSelect = document.querySelector(`.model-override[data-provider-id="${providerId}"]`);
        const modelOverrideCustom = document.querySelector(`.model-override-custom[data-provider-id="${providerId}"]`);
        const modelOverride = modelOverrideSelect
          ? (modelOverrideSelect.value === "custom"
            ? (modelOverrideCustom ? modelOverrideCustom.value.trim() : "")
            : modelOverrideSelect.value.trim())
          : "";
        return { providerId, modelOverride };
      });

    if (!text) {
      setStatus("Enter text to translate.");
      return;
    }

    if (!selectedProviders.length) {
      setStatus("Select at least one provider.");
      return;
    }

    // Apply per-provider model overrides temporarily by sending modelOverrides map
    const providerIds = selectedProviders.map((p) => p.providerId);
    const modelOverrides = Object.fromEntries(
      selectedProviders.filter((p) => p.modelOverride).map((p) => [p.providerId, p.modelOverride])
    );

    state.liveResults = Object.fromEntries(providerIds.map((providerId) => {
      const provider = state.providers.find((item) => item.id === providerId);
      const model = modelOverrides[providerId] || (state.providerConfigs[providerId] ? state.providerConfigs[providerId].model : "");
      return [providerId, {
        ok: true,
        providerId,
        providerName: provider ? provider.displayName : providerId,
        model,
        prompt: "",
        translatedText: "",
        thinkingText: "",
        reasoningExpanded: false,
        startedAtMs: Date.now(),
        firstTokenAtMs: 0,
        firstTokenLatencyMs: -1,
        outputTokens: 0,
        tokPerSec: 0,
        latencyMs: 0,
        streaming: true
      }];
    }));
    renderLiveResults();
    setStatus("Translating…");

    const port = api.runtime.connect({ name: "melontranslate-stream" });
    port.onMessage.addListener((message) => {
      if (message.event === "keepalive") {
        return;
      }
      if (message.event === "provider-start") {
        const current = state.liveResults[message.providerId] || {};
        state.liveResults[message.providerId] = Object.assign({}, current, {
          prompt: message.prompt || current.prompt || "",
          startedAtMs: current.startedAtMs || Date.now(),
          firstTokenAtMs: current.firstTokenAtMs || 0,
          firstTokenLatencyMs: Number.isFinite(current.firstTokenLatencyMs) ? current.firstTokenLatencyMs : -1,
          outputTokens: current.outputTokens || 0,
          tokPerSec: current.tokPerSec || 0
        });
        return;
      }

      if (message.event === "provider-chunk") {
        const current = state.liveResults[message.providerId] || {
          ok: true,
          providerId: message.providerId,
          providerName: message.providerName,
          model: message.model,
          prompt: message.prompt || "",
          translatedText: "",
          thinkingText: "",
          reasoningExpanded: false,
          startedAtMs: Date.now(),
          firstTokenAtMs: 0,
          firstTokenLatencyMs: -1,
          outputTokens: 0,
          tokPerSec: 0,
          latencyMs: 0
        };
        const translatedTextChunk = String(message.chunk || "");
        const thinkingChunk = String(message.thinkingChunk || "");
        const hasAnyChunk = !!translatedTextChunk || !!thinkingChunk;
        if (hasAnyChunk && !current.firstTokenAtMs) {
          current.firstTokenAtMs = Date.now();
          current.firstTokenLatencyMs = Math.max(0, current.firstTokenAtMs - (current.startedAtMs || current.firstTokenAtMs));
        }
        current.translatedText += translatedTextChunk;
        current.thinkingText += thinkingChunk;
        pu.updateStreamMetrics(current, `${current.translatedText}${current.thinkingText}`, message.outputTokens);
        if (thinkingChunk) {
          current.reasoningExpanded = true;
        }
        if (translatedTextChunk) {
          // Auto-collapse reasoning once main translated output starts arriving.
          current.reasoningExpanded = false;
        }
        current.providerName = message.providerName;
        current.model = message.model;
        if (message.prompt) {
          current.prompt = message.prompt;
        }
        current.ok = true;
        current.streaming = true;
        current.fromCache = !!message.fromCache;
        state.liveResults[message.providerId] = current;
        renderLiveResults();
        return;
      }

      if (message.event === "provider-complete") {
        const previous = state.liveResults[message.providerId] || {};
        const finalTranslatedText = String(message.result && message.result.translatedText || "");
        const finalThinkingText = String(message.result && message.result.thinkingText || "");
        const tempMetrics = { firstTokenAtMs: previous.firstTokenAtMs || 0, outputTokens: 0, tokPerSec: 0 };
        pu.updateStreamMetrics(tempMetrics, `${finalTranslatedText}${finalThinkingText}`, message.result && message.result.outputTokens);
        state.liveResults[message.providerId] = Object.assign({}, previous, message.result, {
          streaming: false,
          reasoningExpanded: finalTranslatedText ? false : !!previous.reasoningExpanded,
          outputTokens: tempMetrics.outputTokens,
          tokPerSec: tempMetrics.tokPerSec,
          firstTokenAtMs: tempMetrics.firstTokenAtMs,
          firstTokenLatencyMs: Number.isFinite(previous.firstTokenLatencyMs) ? previous.firstTokenLatencyMs : -1
        });
        renderLiveResults();
        return;
      }

      if (message.event === "provider-error") {
        state.liveResults[message.providerId] = Object.assign({}, message.error, { streaming: false });
        renderLiveResults();
        return;
      }

      if (message.event === "stream-complete") {
        const count = Object.keys(state.liveResults).length;
        setStatus(`Received ${count} result${count === 1 ? "" : "s"}.`);
        port.disconnect();
        return;
      }

      if (message.event === "stream-error") {
        setStatus(message.error.message || "Translation failed.");
        port.disconnect();
      }
    });

    port.postMessage({
      type: messageTypes.translateStream,
      text,
      targetLanguage,
      sourceLanguage,
      providerIds,
      modelOverrides,
      url: "extension://compare"
    });
  }

  document.getElementById("translate-button").addEventListener("click", translate);
  bootstrap();
}(globalThis));
