(function initModelParams(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const MODEL_TEMPERATURE_MAX = namespace.constants.modelTemperatureMax;

  function normalizeTemperature(value, max) {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === "string" && !value.trim()) {
      return null;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    const upper = Number.isFinite(max) ? max : MODEL_TEMPERATURE_MAX;
    const clamped = Math.min(upper, Math.max(0, numeric));
    return Math.round(clamped * 10) / 10;
  }

  function normalizeTemperatureMap(value) {
    const source = value && typeof value === "object" ? value : {};
    const out = {};
    Object.entries(source).forEach(function([model, temperature]) {
      const modelId = String(model || "").trim();
      if (!modelId) {
        return;
      }
      const normalized = normalizeTemperature(temperature, MODEL_TEMPERATURE_MAX);
      if (normalized === null) {
        return;
      }
      out[modelId] = normalized;
    });
    return out;
  }

  function normalizeModelParameterEntry(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const out = Object.assign({}, value);
    if (Object.prototype.hasOwnProperty.call(out, "temperature")) {
      const normalizedTemperature = normalizeTemperature(out.temperature, MODEL_TEMPERATURE_MAX);
      if (normalizedTemperature === null) {
        delete out.temperature;
      } else {
        out.temperature = normalizedTemperature;
      }
    }
    return Object.keys(out).length ? out : null;
  }

  function normalizeModelParameters(value) {
    const source = value && typeof value === "object" ? value : {};
    const out = {};
    Object.entries(source).forEach(function([model, params]) {
      const modelId = String(model || "").trim();
      if (!modelId) {
        return;
      }
      const normalized = normalizeModelParameterEntry(params);
      if (!normalized) {
        return;
      }
      out[modelId] = normalized;
    });
    return out;
  }

  function mergeLegacyModelTemperatures(modelParameters, modelTemperatures) {
    const out = Object.assign({}, normalizeModelParameters(modelParameters));
    const legacyMap = normalizeTemperatureMap(modelTemperatures);
    Object.entries(legacyMap).forEach(function([modelId, temperature]) {
      const current = out[modelId] && typeof out[modelId] === "object" ? out[modelId] : {};
      if (!Object.prototype.hasOwnProperty.call(current, "temperature")) {
        out[modelId] = Object.assign({}, current, { temperature: temperature });
      }
    });
    return out;
  }

  function getProviderModelParameters(providerConfig) {
    const source = providerConfig && typeof providerConfig === "object" ? providerConfig : {};
    return mergeLegacyModelTemperatures(source.modelParameters, source.modelTemperatures);
  }

  function resolveModelTemperature(modelParameters, modelId, max, defaultValue) {
    const resolvedModelId = String(modelId || "").trim();
    if (!resolvedModelId) {
      return null;
    }

    const source = modelParameters && typeof modelParameters === "object" ? modelParameters : {};
    const entry = source[resolvedModelId] && typeof source[resolvedModelId] === "object"
      ? source[resolvedModelId]
      : {};
    const normalized = normalizeTemperature(entry.temperature, max);
    return normalized === null
      ? (defaultValue === undefined ? null : defaultValue)
      : normalized;
  }

  function resolveProviderTemperature(providerConfig, explicitValue, resolvedModel, max, defaultValue) {
    const explicit = normalizeTemperature(explicitValue, max);
    if (explicit !== null) {
      return explicit;
    }

    const modelId = String(resolvedModel || (providerConfig && providerConfig.model) || "").trim();
    if (!modelId) {
      return null;
    }

    return resolveModelTemperature(getProviderModelParameters(providerConfig), modelId, max, defaultValue);
  }

  namespace.modelParams = {
    normalizeTemperature: normalizeTemperature,
    normalizeTemperatureMap: normalizeTemperatureMap,
    normalizeModelParameterEntry: normalizeModelParameterEntry,
    normalizeModelParameters: normalizeModelParameters,
    mergeLegacyModelTemperatures: mergeLegacyModelTemperatures,
    getProviderModelParameters: getProviderModelParameters,
    resolveModelTemperature: resolveModelTemperature,
    resolveProviderTemperature: resolveProviderTemperature
  };
}(globalThis));
