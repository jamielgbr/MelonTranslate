(function initOptionsPage(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const messageTypes = namespace.messages.types;
  const pu = namespace.pageUtils;
  const mp = namespace.modelParams;
  const PAGE_SIZE = 25;

  const state = {
    settings: null,
    providers: [],
    providerConfigs: {},
    history: [],
    historyPage: 0,
    providerModelFilters: {},
    providerExpanded: {},
    providerDrafts: {},
    dropdowns: {},
    providerModelDropdowns: {}
  };

  let _statusTimer = null;
  function status(message) {
    const el = document.getElementById("status");
    if (_statusTimer) { clearTimeout(_statusTimer); _statusTimer = null; }
    el.textContent = message;
    el.classList.toggle("status--loading", !!message && message.includes("\u2026"));
    if (message && !message.includes("\u2026")) {
      _statusTimer = setTimeout(function() { el.textContent = ""; el.classList.remove("status--loading"); _statusTimer = null; }, 3000);
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
        const models = pu.normalizeModels([currentModel, ...favorites]);
        if (!models.length) {
          return null;
        }
        return { provider, config, models };
      })
      .filter(Boolean);
  }

  function renderModelParametersPanel() {
    const container = document.getElementById("model-parameters");
    if (!container) {
      return;
    }
    const groups = collectModelParameterGroups();
    if (!groups.length) {
      container.innerHTML = '<p class="hint">No models from enabled providers yet.</p>';
      return;
    }

    pu.setHtml(container, groups.map(({ provider, config, models }) => {
      const rows = models.map((modelId) => {
        const temperature = formatTemperatureInputValue(getModelTemperatureValue(config, modelId));
        return `<label class="model-parameter-row"><span class="model-parameter-name">${pu.escapeHtml(modelId)}</span><span class="model-parameter-controls"><span class="model-parameter-label">Temp</span><input data-provider-id="${pu.escapeHtml(provider.id)}" data-model-id="${pu.escapeHtml(modelId)}" data-parameter="temperature" type="number" min="0" max="2" step="0.1" value="${pu.escapeHtml(temperature)}"></span></label>`;
      }).join("");

      return `<article class="model-parameter-provider"><h3 class="model-parameter-provider-title">${pu.escapeHtml(provider.displayName)}</h3><div class="model-parameter-list">${rows}</div></article>`;
    }).join(""));
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

  function providerHasStaticModels(provider) {
    return !!(provider && Array.isArray(provider.staticModels) && provider.staticModels.length);
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
      targetLanguage: getLanguageValue("target-language", "target-language-custom"),
      secondTargetLanguage: getLanguageValue("second-target-language", "second-target-language-custom"),
      autoSwitchToSecondTarget: document.getElementById("auto-switch-second-target").checked,
      dictionaryModeForSingleWord: document.getElementById("dictionary-mode-for-single-word").checked,
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
      targetLanguage: String(incoming.targetLanguage || current.targetLanguage || "en"),
      secondTargetLanguage: String(incoming.secondTargetLanguage || current.secondTargetLanguage || "en"),
      autoSwitchToSecondTarget: incoming.autoSwitchToSecondTarget !== undefined
        ? !!incoming.autoSwitchToSecondTarget
        : !!current.autoSwitchToSecondTarget,
      dictionaryModeForSingleWord: incoming.dictionaryModeForSingleWord !== undefined
        ? !!incoming.dictionaryModeForSingleWord
        : !!current.dictionaryModeForSingleWord,
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
      const availableModels = pu.normalizeModels(incoming.availableModels !== undefined ? incoming.availableModels : (current.availableModels || []));
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
        availableModels: pu.normalizeModels(config.availableModels || []),
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
      providerConfigs: exportProviderConfigs
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

    status("Settings imported.");
    await load();
  }

  function collectFavoritedModelOptions() {
    return getConfiguredProviders().flatMap((provider) => {
      const config = state.providerConfigs[provider.id] || {};
      const favorites = pu.normalizeModels(config.favoriteModels || []);
      return favorites.map((model) => ({
        key: pu.buildDefaultModelKey(provider.id, model),
        providerId: provider.id,
        model,
        label: `${provider.displayName} · ${model}`
      }));
    });
  }

  function renderStaticDropdowns() {
    state.dropdowns["selection-trigger"] = namespace.customDropdown.create(
      document.getElementById("selection-trigger-wrap"),
      {
        id: "selection-trigger",
        items: [
          { value: "auto", label: "Auto" },
          { value: "modifier", label: "Translate while holding modifier key" },
          { value: "manual", label: "Context menu only" }
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
  }

  function renderDefaultModelSelect() {
    const wrap = document.getElementById("default-translation-model-wrap");
    const options = collectFavoritedModelOptions();
    const items = options.length
      ? options.map((item) => ({ value: item.key, label: item.label }))
      : [{ value: "", label: "No favorite models available" }];
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

  function buildCurrentModelOptions(config) {
    const favorites = pu.normalizeModels(config.favoriteModels || []);
    const current = getPreferredModel(config);
    const merged = Array.from(new Set([...favorites, current].filter(Boolean)));
    const modelOptions = merged.map((model) => (
      `<option value="${pu.escapeHtml(model)}">${pu.escapeHtml(model)}</option>`
    )).join("");
    return modelOptions + '<option value="custom">Custom...</option>';
  }

  function renderModelFavoriteRows(config) {
    const favorites = pu.normalizeModels(config.favoriteModels || []);
    const allModels = pu.normalizeModels(config.availableModels || []);
    if (!allModels.length) {
      return '<p class="hint">No available models.</p>';
    }

    return allModels.map((model) => {
      const checked = favorites.includes(model) ? "checked" : "";
      return `<label class="checkbox-row model-favorite-row" data-model="${pu.escapeHtml(model)}"><input data-model-favorite="${pu.escapeHtml(model)}" type="checkbox" ${checked}> ${pu.escapeHtml(model)}</label>`;
    }).join("");
  }

  function applyModelFilter(providerId, query) {
    const card = document.querySelector(`.provider-card [data-provider-id="${providerId}"][data-field="enabled"]`)
      ? document.querySelector(`.provider-card [data-provider-id="${providerId}"][data-field="enabled"]`).closest(".provider-card")
      : null;
    if (!card) return;

    const modelList = card.querySelector(`.model-list[data-provider-id="${providerId}"]`);
    if (!modelList) return;

    const rows = Array.from(modelList.querySelectorAll(".model-favorite-row"));
    const normalizedQuery = String(query || "").trim().toLowerCase();
    let visibleCount = 0;

    rows.forEach((row) => {
      const model = String(row.dataset.model || "").toLowerCase();
      const matched = !normalizedQuery || model.includes(normalizedQuery);
      row.style.display = matched ? "flex" : "none";
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
      empty.textContent = "No models match your search.";
      modelList.appendChild(empty);
    }
  }

  function syncCurrentModelControl(providerId) {
    const dd = state.providerModelDropdowns[providerId];
    const hiddenInput = document.querySelector(`[data-provider-id="${providerId}"][data-field="model-select"]`);
    const modelCustom = document.querySelector(`[data-provider-id="${providerId}"][data-field="model-custom"]`);
    if (!dd || !hiddenInput) return;

    const card = hiddenInput.closest(".provider-card");
    const favoriteInputs = card ? card.querySelectorAll("input[data-model-favorite]") : [];
    const favorites = Array.from(favoriteInputs).filter((item) => item.checked).map((item) => item.dataset.modelFavorite);
    const currentValue = hiddenInput.value === "custom" ? (modelCustom ? modelCustom.value.trim() : "") : hiddenInput.value;
    const merged = Array.from(new Set([...favorites, currentValue].filter(Boolean)));

    dd.setItems(merged.map((model) => ({ value: model, label: model })));

    if (merged.includes(currentValue)) {
      dd.setValue(currentValue);
      updateProviderDraft(providerId, { model: currentValue, modelSelectValue: currentValue, modelCustomValue: currentValue });
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
      const favoriteModels = pu.normalizeModels(config.favoriteModels || []);
      const currentModel = typeof draft.model === "string" ? draft.model : getPreferredModel(config);
      const draftModelSelectValue = typeof draft.modelSelectValue === "string" ? draft.modelSelectValue : "";
      const modelSelectValue = draftModelSelectValue || (favoriteModels.includes(currentModel) ? currentModel : (currentModel ? "custom" : (favoriteModels[0] || "custom")));
      const modelCustomVisible = modelSelectValue === "custom";
      const modelCustomValue = typeof draft.modelCustomValue === "string" ? draft.modelCustomValue : currentModel;
      const baseUrlValue = typeof draft.baseUrl === "string" ? draft.baseUrl : (config.baseUrl || "");
      const apiKeyValue = typeof draft.apiKey === "string" ? draft.apiKey : "";
      const requiresApiKey = providerRequiresApiKey(provider);
      const hasStaticModels = providerHasStaticModels(provider);
      const modelListAccountIdValue = typeof draft.modelListAccountId === "string" ? draft.modelListAccountId : (config.modelListAccountId || "");
      const fetchedAt = config.modelsFetchedAt ? new Date(config.modelsFetchedAt).toLocaleString() : "Never";
      const isSimpleProvider = !providerRequiresApiKey(provider) && providerHasStaticModels(provider) && !provider.modelListPath;
      const providerMeta = currentModel ? `Model: ${currentModel}` : "No model selected";
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
                ${hasStaticModels ? "" : `<button class="secondary" type="button" data-action="fetch-models" data-provider-id="${provider.id}">List models</button>
                <button class="secondary" type="button" data-action="refresh-models" data-provider-id="${provider.id}">Refresh</button>`}
              </div>
            </div>
            <p class="hint">${hasStaticModels ? "Built-in model list." : `Last updated: ${pu.escapeHtml(fetchedAt)}`}</p>
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
      const currentModelVal = typeof draft.model === "string" ? draft.model : getPreferredModel(config);
      const favModels = pu.normalizeModels(config.favoriteModels || []);
      const mergedModels = Array.from(new Set([...favModels, currentModelVal].filter(Boolean)));
      const ddItems = mergedModels.map((model) => ({ value: model, label: model }));
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
    const requiresAuth = String(provider.modelListAuth || "bearer") !== "none";
    const requiresAccountId = String(provider.modelListPath || "").includes("{account_id}");
    const savedApiKey = String(config.apiKey || "").trim();
    const savedModelListAccountId = String(config.modelListAccountId || "").trim();
    if (requiresAuth && !savedApiKey && !tempApiKey) {
      status(`Add an API key for ${provider.displayName || providerId} before loading models.`);
      return;
    }
    if (requiresAccountId && !savedModelListAccountId && !tempModelListAccountId) {
      status(`Add an account ID for ${provider.displayName || providerId} before loading models.`);
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
    status(response.data.fromCache ? `Loaded saved model list for ${provider.displayName || providerId}.` : `Loaded models for ${provider.displayName || providerId}.`);
  }

  async function maybeAutoFetchModels() {
    const candidates = state.providers
      .map((provider) => ({ provider, config: state.providerConfigs[provider.id] || {} }))
      .filter(({ provider, config }) => (
        pu.providerIsConfigured(provider, config)
        && !providerHasStaticModels(provider)
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
      container.innerHTML = '<p class="hint">No saved translations yet.</p>';
      return;
    }

    const totalPages = Math.ceil(state.history.length / PAGE_SIZE);
    const page = Math.min(state.historyPage, totalPages - 1);
    const slice = state.history.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const cards = slice.map((entry) => {
      const results = (entry.results || []).map((r) => {
        const label = r.ok
          ? `${pu.escapeHtml(r.providerName)} ${pu.escapeHtml(r.model)}`
          : `${pu.escapeHtml(r.providerName || r.providerId)} - Error`;
        const text = r.ok ? pu.escapeHtml(r.translatedText || "") : pu.escapeHtml(r.error || "");
        return `<div class="history-result"><span class="history-result-label">${label}</span><p class="history-result-text">${text}</p></div>`;
      }).join("");

      return `
        <article class="history-card">
          <div class="history-title">
            <strong>${pu.escapeHtml(entry.text.slice(0, 100))}</strong>
            <div class="history-title-meta">
              <span class="history-meta">${pu.escapeHtml(entry.targetLanguage)} • ${new Date(entry.createdAt).toLocaleString()}</span>
              <button class="secondary history-copy" data-copy-index="${page * PAGE_SIZE + slice.indexOf(entry)}" type="button">Copy first result</button>
            </div>
          </div>
          ${results}
        </article>
      `;
    }).join("");

    const pagination = totalPages > 1 ? `
      <nav class="pagination">
        <button class="secondary" id="prev-page" type="button" ${page === 0 ? "disabled" : ""}>← Previous</button>
        <span>Page ${page + 1} / ${totalPages}</span>
        <button class="secondary" id="next-page" type="button" ${page >= totalPages - 1 ? "disabled" : ""}>Next →</button>
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
          navigator.clipboard.writeText(firstOk.translatedText).then(() => { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy first result"; }, 1500); });
        }
      });
    });
  }

  function fillGeneralSettings() {
    state.dropdowns["selection-trigger"].setValue(state.settings.selectionTrigger);
    state.dropdowns["modifier-key"].setValue(state.settings.modifierKey);
    renderDefaultModelSelect();
    renderModelParametersPanel();
    renderLanguageSelect("target-language", "target-language-custom", state.settings.targetLanguage);
    renderLanguageSelect("second-target-language", "second-target-language-custom", state.settings.secondTargetLanguage || "en-US");
    document.getElementById("auto-switch-second-target").checked = !!state.settings.autoSwitchToSecondTarget;
    document.getElementById("dictionary-mode-for-single-word").checked = !!state.settings.dictionaryModeForSingleWord;
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
      const isSimple = !providerRequiresApiKey(provider) && providerHasStaticModels(provider) && !provider.modelListPath;

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
          availableModels: pu.normalizeModels(current.availableModels || []),
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
        .filter((input) => input.checked)
        .map((input) => input.dataset.modelFavorite);
      const availableModels = Array.from(card ? card.querySelectorAll(".model-list input[data-model-favorite]") : [])
        .map((input) => input.dataset.modelFavorite);

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
        availableModels: pu.normalizeModels(availableModels),
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
    state.providerDrafts = {};
    state.history = response.data.history;
    state.historyPage = 0;
    if (!state.dropdowns["selection-trigger"]) {
      renderStaticDropdowns();
    }
    renderProviders();
    fillGeneralSettings();
    await maybeAutoFetchModels();
    renderDefaultModelSelect();
    renderHistory();
    status("");
  }

  async function save() {
    const saveButton = document.getElementById("save-button");
    const labelSpan = saveButton.querySelector(".visually-hidden");
    const originalLabel = saveButton.getAttribute("aria-label");
    saveButton.disabled = true;
    saveButton.classList.add("is-saving");
    if (labelSpan) labelSpan.textContent = "Saving...";
    saveButton.setAttribute("aria-label", "Saving settings");
    status("Saving…");
    try {
      const response = await api.runtime.sendMessage({
        type: messageTypes.saveOptions,
        settings: collectSettingsFromForm(),
        providerConfigs: collectProviderConfigs()
      });

      if (!response || !response.ok) {
        status(response?.error?.message || "Could not save settings.");
        return;
      }

      status("Settings saved.");
      await load();
    } finally {
      saveButton.disabled = false;
      saveButton.classList.remove("is-saving");
      if (labelSpan) labelSpan.textContent = "Save";
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
      btn.textContent = "Loading...";
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
    const card = input.closest(".provider-card");
    const enabledInput = card ? card.querySelector("input[data-field='enabled']") : null;
    if (!enabledInput) return;
    const favoriteProviderId = enabledInput.dataset.providerId;
    // Persist checked favorites to state so rerenders don't reset checkboxes
    if (favoriteProviderId && state.providerConfigs[favoriteProviderId]) {
      const allFavoriteInputs = card.querySelectorAll("input[data-model-favorite]");
      const checkedFavorites = Array.from(allFavoriteInputs)
        .filter((item) => item.checked)
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

  document.getElementById("save-button").addEventListener("click", save);
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
  load();
}(globalThis));
