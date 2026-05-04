(function initModelCapabilities(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};

  const INPUT_TYPES = new Set(["text", "image", "audio", "video"]);
  const OUTPUT_TYPES = new Set(["text", "image", "audio", "video"]);
  const FEATURE_TYPES = new Set([
    "chat", "completion", "streaming", "reasoning",
    "tts", "stt", "embedding", "rerank", "moderation", "vision"
  ]);
  const NON_TRANSLATION_FEATURES = new Set(["tts", "stt", "embedding", "rerank", "moderation"]);

  function unique(list) {
    return Array.from(new Set((Array.isArray(list) ? list : [])
      .map(function(value) { return String(value || "").trim().toLowerCase(); })
      .filter(Boolean)));
  }

  function flattenHints(value, out) {
    if (value === null || typeof value === "undefined") {
      return;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const text = String(value).trim();
      if (text) {
        out.push(text);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(function(item) { flattenHints(item, out); });
      return;
    }
    if (typeof value === "object") {
      Object.keys(value).forEach(function(key) {
        if (value[key] === true) {
          out.push(key);
        } else if (typeof value[key] === "string" || Array.isArray(value[key])) {
          flattenHints(value[key], out);
        }
      });
    }
  }

  function collectRawTypeHints(item) {
    if (!item || typeof item !== "object") {
      return [];
    }
    const architecture = item.architecture && typeof item.architecture === "object" ? item.architecture : {};
    const topProvider = item.top_provider && typeof item.top_provider === "object" ? item.top_provider : {};
    const hints = [];
    [
      item.type,
      item.model_type,
      item.modality,
      item.task,
      item.category,
      item.endpoint_type,
      item.capability,
      item.capabilities,
      item.supported_generation_methods,
      item.supported_parameters,
      item.input_modalities,
      item.output_modalities,
      architecture.modality,
      architecture.input_modalities,
      architecture.output_modalities,
      topProvider.modality
    ].forEach(function(value) { flattenHints(value, hints); });
    return unique(hints);
  }

  function tokenize(value) {
    return String(value || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  function normalizeModelId(item) {
    if (typeof item === "string") {
      return item.trim();
    }
    if (!item || typeof item !== "object") {
      return "";
    }
    return String(item.id || item.canonical_slug || item.slug || item.name || "").trim();
  }

  function normalizeModelLabel(item, id) {
    if (typeof item === "string") {
      return item.trim();
    }
    if (!item || typeof item !== "object") {
      return id || "";
    }
    return String(item.label || item.name || item.display_name || id || "").trim();
  }

  function readModalities(value) {
    const hints = [];
    flattenHints(value, hints);
    return unique(hints).flatMap(tokenize).filter(function(token) {
      return INPUT_TYPES.has(token) || OUTPUT_TYPES.has(token);
    });
  }

  function inferCapabilities(item, rawHints) {
    const input = [];
    const output = [];
    const features = [];
    const source = item && typeof item === "object" ? item : {};
    const architecture = source.architecture && typeof source.architecture === "object" ? source.architecture : {};

    readModalities(source.input_modalities || architecture.input_modalities).forEach(function(type) {
      if (INPUT_TYPES.has(type)) input.push(type);
    });
    readModalities(source.output_modalities || architecture.output_modalities).forEach(function(type) {
      if (OUTPUT_TYPES.has(type)) output.push(type);
    });

    rawHints.forEach(function(hint) {
      const tokens = tokenize(hint);
      if (/\btext\s*[-/]?>\s*text\b/i.test(hint) || /\btext\s+to\s+text\b/i.test(hint)) {
        input.push("text");
        output.push("text");
      }
      if (/\btext\s*[-/]?>\s*image\b/i.test(hint) || /\bimage\s+generation\b/i.test(hint)) {
        input.push("text");
        output.push("image");
      }
      if (/\btext\s*[-/]?>\s*audio\b/i.test(hint) || /\btext\s+to\s+speech\b/i.test(hint)) {
        input.push("text");
        output.push("audio");
        features.push("tts");
      }
      if (/\baudio\s*[-/]?>\s*text\b/i.test(hint) || /\bspeech\s+to\s+text\b/i.test(hint)) {
        input.push("audio");
        output.push("text");
        features.push("stt");
      }

      tokens.forEach(function(token) {
        if (token === "llm" || token === "language" || token === "chat") {
          input.push("text");
          output.push("text");
          features.push("chat");
        } else if (token === "completion" || token === "completions") {
          input.push("text");
          output.push("text");
          features.push("completion");
        } else if (token === "stream" || token === "streaming") {
          features.push("streaming");
        } else if (token === "reasoning" || token === "think" || token === "thinking") {
          features.push("reasoning");
        } else if (token === "vision" || token === "multimodal") {
          input.push("image");
          output.push("text");
          features.push("vision");
        } else if (token === "image" || token === "images") {
          if (!input.length) input.push("text");
          output.push("image");
        } else if (token === "audio" || token === "speech" || token === "voice") {
          output.push("audio");
        } else if (token === "tts") {
          input.push("text");
          output.push("audio");
          features.push("tts");
        } else if (token === "stt" || token === "transcription" || token === "transcribe") {
          input.push("audio");
          output.push("text");
          features.push("stt");
        } else if (token === "embedding" || token === "embeddings") {
          input.push("text");
          features.push("embedding");
        } else if (token === "rerank" || token === "reranker") {
          input.push("text");
          features.push("rerank");
        } else if (token === "moderation") {
          input.push("text");
          features.push("moderation");
        }
      });
    });

    if (!input.length && !output.length && !features.some(function(feature) {
      return NON_TRANSLATION_FEATURES.has(feature);
    })) {
      input.push("text");
      output.push("text");
      features.push("chat");
    }

    if (output.includes("text") && input.includes("text") && !features.includes("chat")) {
      features.push("chat");
    }

    return {
      input: unique(input).filter(function(type) { return INPUT_TYPES.has(type); }),
      output: unique(output).filter(function(type) { return OUTPUT_TYPES.has(type); }),
      features: unique(features).filter(function(feature) { return FEATURE_TYPES.has(feature); })
    };
  }

  function readExistingCapabilities(item) {
    const caps = item && typeof item === "object" && item.capabilities && typeof item.capabilities === "object"
      ? item.capabilities
      : {};
    return {
      input: unique(caps.input || []).filter(function(type) { return INPUT_TYPES.has(type); }),
      output: unique(caps.output || []).filter(function(type) { return OUTPUT_TYPES.has(type); }),
      features: unique(caps.features || []).filter(function(feature) { return FEATURE_TYPES.has(feature); })
    };
  }

  function normalizeModelEntry(item, options) {
    const opts = options || {};
    const id = normalizeModelId(item);
    if (!id) {
      return null;
    }
    const rawTypeHints = collectRawTypeHints(item);
    const existing = readExistingCapabilities(item);
    const inferred = inferCapabilities(item, rawTypeHints);
    const capabilities = {
      input: unique([].concat(existing.input, inferred.input)),
      output: unique([].concat(existing.output, inferred.output)),
      features: unique([].concat(existing.features, inferred.features))
    };
    const label = normalizeModelLabel(item, id);
    return {
      id,
      label: label || id,
      capabilities,
      rawTypeHints,
      source: opts.source || "provider",
      updatedAt: Number(opts.updatedAt || Date.now())
    };
  }

  function normalizeModelList(list, options) {
    const seen = new Set();
    const out = [];
    (Array.isArray(list) ? list : []).forEach(function(item) {
      const meta = normalizeModelEntry(item, options);
      if (!meta || seen.has(meta.id)) {
        return;
      }
      seen.add(meta.id);
      out.push(meta);
    });
    return out;
  }

  function normalizeModelIds(list) {
    return Array.from(new Set((Array.isArray(list) ? list : [])
      .map(normalizeModelId)
      .filter(Boolean)));
  }

  function findModelMeta(models, modelId) {
    const id = String(modelId || "").trim();
    if (!id) {
      return null;
    }
    return normalizeModelList(models).find(function(model) {
      return model.id === id;
    }) || null;
  }

  function modelHasInput(meta, type) {
    return !!meta && !!meta.capabilities && Array.isArray(meta.capabilities.input)
      && meta.capabilities.input.includes(type);
  }

  function modelHasOutput(meta, type) {
    return !!meta && !!meta.capabilities && Array.isArray(meta.capabilities.output)
      && meta.capabilities.output.includes(type);
  }

  function modelHasFeature(meta, feature) {
    return !!meta && !!meta.capabilities && Array.isArray(meta.capabilities.features)
      && meta.capabilities.features.includes(feature);
  }

  function isTextGenerationModel(item) {
    const meta = typeof item === "string" ? normalizeModelEntry(item) : normalizeModelEntry(item);
    if (!meta) {
      return false;
    }
    const features = meta.capabilities.features || [];
    if (features.some(function(feature) { return NON_TRANSLATION_FEATURES.has(feature); })) {
      return false;
    }
    return modelHasInput(meta, "text") && modelHasOutput(meta, "text");
  }

  function describeModelCapabilities(item) {
    const meta = normalizeModelEntry(item);
    if (!meta) {
      return ["Unknown"];
    }
    const labels = [];
    const input = meta.capabilities.input || [];
    const output = meta.capabilities.output || [];
    const features = meta.capabilities.features || [];
    if (features.includes("tts") || (input.includes("text") && output.includes("audio"))) {
      labels.push("TTS");
    } else if (features.includes("stt") || (input.includes("audio") && output.includes("text"))) {
      labels.push("STT");
    } else if (features.includes("embedding")) {
      labels.push("Embedding");
    } else if (features.includes("rerank")) {
      labels.push("Rerank");
    } else if (features.includes("moderation")) {
      labels.push("Moderation");
    } else if (input.includes("image") && output.includes("text")) {
      labels.push("Vision");
    } else if (output.includes("image")) {
      labels.push("Image");
    } else if (input.includes("text") && output.includes("text")) {
      labels.push("Text");
    }
    if (features.includes("reasoning")) {
      labels.push("Reasoning");
    }
    if (features.includes("streaming")) {
      labels.push("Streaming");
    }
    return labels.length ? Array.from(new Set(labels)) : ["Unknown"];
  }

  function formatModelOptionLabel(providerName, model, meta) {
    const capabilityText = describeModelCapabilities(meta || model).join(", ");
    return `${providerName} · ${model} · ${capabilityText}`;
  }

  namespace.modelCapabilities = {
    normalizeModelEntry,
    normalizeModelList,
    normalizeModelId,
    normalizeModelIds,
    findModelMeta,
    isTextGenerationModel,
    describeModelCapabilities,
    formatModelOptionLabel,
    modelHasInput,
    modelHasOutput,
    modelHasFeature
  };
}(globalThis));
