(function initModelCapabilities(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};

  const INPUT_TYPES = new Set(["text", "image", "audio", "video"]);
  const OUTPUT_TYPES = new Set(["text", "image", "audio", "video"]);
  const FEATURE_TYPES = new Set([
    "chat", "completion", "streaming", "reasoning", "reasoning-effort",
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
      item.supportedGenerationMethods,
      item.supported_parameters,
      item.supportedParameters,
      item.input_modalities,
      item.inputModalities,
      item.output_modalities,
      item.outputModalities,
      architecture.modality,
      architecture.input_modalities,
      architecture.inputModalities,
      architecture.output_modalities,
      architecture.outputModalities,
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

  function normalizeModelId(item, depth) {
    const level = Number(depth || 0);
    if (level > 4) {
      return "";
    }
    if (typeof item === "string") {
      const id = item.trim();
      return id === "[object Object]" ? "" : id;
    }
    if (typeof item === "number") {
      return String(item).trim();
    }
    if (!item || typeof item !== "object") {
      return "";
    }
    const fields = ["id", "canonical_slug", "slug", "name", "model", "model_id"];
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(item, field)) {
        const normalized = normalizeModelId(item[field], level + 1);
        if (normalized) {
          return normalized;
        }
      }
    }
    return "";
  }

  function normalizeModelLabel(item, id) {
    if (typeof item === "string") {
      return item.trim();
    }
    if (!item || typeof item !== "object") {
      return id || "";
    }
    const label = normalizeModelId(item.label || item.name || item.display_name || "");
    return label || id || "";
  }

  function readModalities(value) {
    const hints = [];
    flattenHints(value, hints);
    return unique(hints).flatMap(tokenize).filter(function(token) {
      return INPUT_TYPES.has(token) || OUTPUT_TYPES.has(token);
    });
  }

  function collectDeclaredTypeHints(source) {
    const hints = [];
    [
      source.type,
      source.model_type,
      source.modality,
      source.task,
      source.category,
      source.endpoint_type
    ].forEach(function(value) { flattenHints(value, hints); });
    return unique(hints);
  }

  function inferCapabilities(item, rawHints) {
    const input = [];
    const output = [];
    const features = [];
    const source = item && typeof item === "object" ? item : {};
    const hasStructuredMetadata = !!source && typeof item === "object";
    const architecture = source.architecture && typeof source.architecture === "object" ? source.architecture : {};

    readModalities(source.input_modalities || architecture.input_modalities).forEach(function(type) {
      if (INPUT_TYPES.has(type)) input.push(type);
    });
    readModalities(source.output_modalities || architecture.output_modalities).forEach(function(type) {
      if (OUTPUT_TYPES.has(type)) output.push(type);
    });

    collectDeclaredTypeHints(source).forEach(function(hint) {
      if (/^(?:text|text[-_ ]?(?:generation|to[-_ ]?text)|chat|chat[-_ ]?completions?)$/i.test(hint)) {
        input.push("text");
        output.push("text");
        features.push("chat");
      }
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
      if (/\btext\s*[-/]?>\s*audio\b/i.test(hint) || /\btext[-_\s]+to[-_\s]+speech\b/i.test(hint)) {
        input.push("text");
        output.push("audio");
        features.push("tts");
      }
      if (/\baudio\s*[-/]?>\s*text\b/i.test(hint) || /\bspeech[-_\s]+to[-_\s]+text\b/i.test(hint)) {
        input.push("audio");
        output.push("text");
        features.push("stt");
      }
      if (/\breasoning[-_\s]?effort\b/i.test(hint)) {
        features.push("reasoning-effort");
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
        } else if ((token === "audio" || token === "speech" || token === "voice") && !features.includes("stt") && !output.includes("text")) {
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

    if (!hasStructuredMetadata && !input.length && !output.length && !features.some(function(feature) {
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

  function inferNamedCapabilities(id, label) {
    const modelName = String(`${id || ""} ${label || ""}`).toLowerCase();
    const input = [];
    const output = [];
    const features = [];

    if (/(?:^|[/\s:_-])(?:whisper(?:-[\w.]+)?|asr|stt|speech-to-text|speech2text|transcri(?:be|ption)(?:-[\w.]+)?)(?:$|[/\s:_.-])/.test(modelName)) {
      input.push("audio");
      output.push("text");
      features.push("stt");
    }

    if (/(?:^|[/\s:_-])(?:tts(?:-[\w.]+)?|text-to-speech|text2speech|speech-synthesis|gpt-4o-mini-tts)(?:$|[/\s:_.-])/.test(modelName)) {
      input.push("text");
      output.push("audio");
      features.push("tts");
    }

    return {
      input,
      output,
      features
    };
  }

  function normalizeModelEntry(item, options) {
    const opts = options || {};
    const id = normalizeModelId(item);
    if (!id) {
      return null;
    }
    const label = normalizeModelLabel(item, id);
    const rawTypeHints = collectRawTypeHints(item);
    const existing = readExistingCapabilities(item);
    const inferred = inferCapabilities(item, rawTypeHints);
    const named = inferNamedCapabilities(id, label);
    const capabilities = {
      input: unique([].concat(existing.input, inferred.input, named.input)),
      output: unique([].concat(existing.output, inferred.output, named.output)),
      features: unique([].concat(existing.features, inferred.features, named.features))
    };
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
      .map(function(item) { return normalizeModelId(item); })
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

  function isTextGenerationMeta(meta) {
    if (!meta) {
      return false;
    }
    const features = meta.capabilities.features || [];
    if (features.some(function(feature) { return NON_TRANSLATION_FEATURES.has(feature); })) {
      return false;
    }
    if (modelHasInput(meta, "text") && modelHasOutput(meta, "text")) {
      return true;
    }
    if (
      features.includes("chat")
      || features.includes("completion")
      || features.includes("reasoning")
      || features.includes("reasoning-effort")
    ) {
      return true;
    }
    const input = meta.capabilities.input || [];
    const output = meta.capabilities.output || [];
    return !input.length && !output.length && features.every(function(feature) {
      return feature === "streaming";
    });
  }

  function isTextGenerationModel(item) {
    return isTextGenerationMeta(normalizeModelEntry(item));
  }

  function normalizeReasoningModelName(meta) {
    const label = meta && meta.label && meta.label !== meta.id ? ` ${meta.label}` : "";
    return String(`${meta && meta.id || ""}${label}`).toLowerCase();
  }

  function isDeepSeekV4PlusReasoningModel(item) {
    const meta = normalizeModelEntry(item);
    if (!meta) {
      return false;
    }
    return /(?:^|[/:\s-])(?:\w+-)?deepseek-v(?:[4-9]|\d{2,})(?:[.-]\w+)*\b/.test(normalizeReasoningModelName(meta));
  }

  function isDeepSeekHybridReasoningModel(item) {
    const meta = normalizeModelEntry(item);
    if (!meta) {
      return false;
    }
    const modelName = normalizeReasoningModelName(meta);
    if (/\bdeepseek-v3[.-]2-speciale\b/.test(modelName)) {
      return false;
    }
    return isDeepSeekV4PlusReasoningModel(meta)
      || /(?:^|[/:\s-])(?:\w+-)?deepseek-v3(?:\.\d|-\d)(?:(?:\.|-)(?!speciale\b)\w+)?\b/.test(modelName)
      || /\bdeepseek-v3p[12]\b/.test(modelName)
      || /\bdeepseek-chat(?:-v3\.1)?\b/.test(modelName);
  }

  function isAnthropicReasoningControlModel(item) {
    const meta = normalizeModelEntry(item);
    if (!isTextGenerationMeta(meta)) {
      return false;
    }
    const modelName = normalizeReasoningModelName(meta);
    return /\bclaude-3[.-]7\b.*\bsonnet\b/.test(modelName)
      || /\bclaude-(?:sonnet|opus|haiku)-4(?:[.-]\d+)?(?:[@:.-][\w:-]+)?\b/.test(modelName);
  }

  function isXaiGrokReasoningEffortModel(item) {
    const meta = normalizeModelEntry(item);
    if (!isTextGenerationMeta(meta)) {
      return false;
    }
    const modelName = normalizeReasoningModelName(meta);
    return !/\bnon[-_ ]?reasoning\b/.test(modelName) && /\bgrok-3-mini\b/.test(modelName);
  }

  function isGrok4FastReasoningModel(item) {
    const meta = normalizeModelEntry(item);
    if (!isTextGenerationMeta(meta)) {
      return false;
    }
    const modelName = normalizeReasoningModelName(meta);
    return !/\bnon[-_ ]?reasoning\b/.test(modelName) && /\bgrok-4-fast\b/.test(modelName);
  }

  function isVolcengineDoubaoReasoningModel(item) {
    const meta = normalizeModelEntry(item);
    if (!isTextGenerationMeta(meta)) {
      return false;
    }
    if (modelHasFeature(meta, "reasoning")) {
      return true;
    }
    const modelName = normalizeReasoningModelName(meta);
    return /(?:^|[/:\s-])doubao[-_]?seed(?:[\w.-]*)?\b/.test(modelName);
  }

  function isGptOssReasoningEffortModel(item) {
    const meta = normalizeModelEntry(item);
    if (!isTextGenerationMeta(meta)) {
      return false;
    }
    return /\bgpt[-_]?oss\b/.test(normalizeReasoningModelName(meta));
  }

  function isBasetenReasoningEffortModel(item) {
    const meta = normalizeModelEntry(item);
    if (!isTextGenerationMeta(meta)) {
      return false;
    }
    if (modelHasFeature(meta, "reasoning-effort")) {
      return true;
    }
    return isGptOssReasoningEffortModel(meta) || isDeepSeekV4PlusReasoningModel(meta);
  }

  function isBasetenChatTemplateReasoningModel(item) {
    const meta = normalizeModelEntry(item);
    if (!isTextGenerationMeta(meta)) {
      return false;
    }
    const modelName = normalizeReasoningModelName(meta);
    return /\bkimi-k2(?:[\w.-]*)?\b/.test(modelName) || /\bglm-4[.-]7\b/.test(modelName);
  }

  function isBasetenReasoningControlModel(item) {
    const meta = normalizeModelEntry(item);
    if (!isTextGenerationMeta(meta)) {
      return false;
    }
    return isBasetenReasoningEffortModel(meta) || isBasetenChatTemplateReasoningModel(meta);
  }

  function isTogetherReasoningEffortModel(item) {
    const meta = normalizeModelEntry(item);
    if (!isTextGenerationMeta(meta)) {
      return false;
    }
    if (modelHasFeature(meta, "reasoning-effort")) {
      return true;
    }
    return isGptOssReasoningEffortModel(meta) || isDeepSeekV4PlusReasoningModel(meta);
  }

  function isTogetherHybridReasoningModel(item) {
    const meta = normalizeModelEntry(item);
    if (!isTextGenerationMeta(meta)) {
      return false;
    }
    if (isTogetherReasoningEffortModel(meta)) {
      return false;
    }
    const modelName = normalizeReasoningModelName(meta);
    return /\bdeepseek-v3[.-]1\b/.test(modelName)
      || /\bqwen(?:\/|[-_])?qwen3[.-]5\b/.test(modelName)
      || /\bkimi-k2(?:[\w.-]*)?\b/.test(modelName)
      || /\bglm-5\b/.test(modelName)
      || /\bgemma-4-31b-it\b/.test(modelName);
  }

  function isTogetherReasoningControlModel(item) {
    const meta = normalizeModelEntry(item);
    if (!isTextGenerationMeta(meta)) {
      return false;
    }
    return isTogetherReasoningEffortModel(meta) || isTogetherHybridReasoningModel(meta);
  }

  function isOpenAICompatibleReasoningControlModel(item) {
    const meta = normalizeModelEntry(item);
    if (!isTextGenerationMeta(meta)) {
      return false;
    }

    const modelName = normalizeReasoningModelName(meta);
    if (!modelName || /\bnon[-_ ]?reasoning\b/.test(modelName)) {
      return false;
    }

    if (modelHasFeature(meta, "reasoning") || modelHasFeature(meta, "reasoning-effort")) {
      return true;
    }

    return (
      /(?:^|[/:\s-])o[134](?:[\w.-]*)?\b/.test(modelName) ||
      /(?:^|[/:\s-])gpt-5(?:[\w.-]*)?\b/.test(modelName) && !/\bgpt-5(?:[\w.-]*)?-chat\b/.test(modelName) ||
      /\bgpt[-_]?oss\b/.test(modelName) ||
      /\b(?:reasoning|reasoner|thinking|think)\b/.test(modelName) ||
      isDeepSeekHybridReasoningModel(meta) ||
      isXaiGrokReasoningEffortModel(meta) ||
      isGrok4FastReasoningModel(meta) ||
      /\bmistral-small-2603\b/.test(modelName) ||
      /\b(?:qwen3|qwq|qvq)(?:[\w.-]*)?\b/.test(modelName)
    );
  }

  function providerSupportsReasoningControl(provider, item) {
    const config = provider && typeof provider === "object" ? provider : { id: provider };
    const providerId = String(config.id || "").trim();
    const transport = String(config.transport || "").trim();
    const meta = normalizeModelEntry(item);
    if (!meta) {
      return false;
    }
    if (transport === "anthropic") {
      return isAnthropicReasoningControlModel(meta);
    }
    if (transport !== "openai-compatible") {
      return false;
    }
    if (providerId === "groq") {
      return false;
    }
    if (providerId === "grok") {
      return isXaiGrokReasoningEffortModel(meta);
    }
    if (providerId === "volcengine") {
      return isVolcengineDoubaoReasoningModel(meta);
    }
    if (providerId === "baseten") {
      return isBasetenReasoningControlModel(meta);
    }
    if (providerId === "together") {
      return isTogetherReasoningControlModel(meta);
    }
    return isOpenAICompatibleReasoningControlModel(meta);
  }

  function providerCannotDisableReasoning(provider, item) {
    const config = provider && typeof provider === "object" ? provider : { id: provider };
    const providerId = String(config.id || "").trim();
    const transport = String(config.transport || "").trim();
    const meta = normalizeModelEntry(item);
    if (transport !== "openai-compatible" || !meta) {
      return false;
    }
    return (providerId === "baseten" || providerId === "together")
      && isGptOssReasoningEffortModel(meta);
  }

  function normalizeProviderReasoningEffort(provider, item, effort) {
    if (effort === null || typeof effort === "undefined") {
      return effort;
    }
    const normalized = String(effort || "").trim().toLowerCase();
    if (normalized === "off" && providerCannotDisableReasoning(provider, item)) {
      return "low";
    }
    return normalized;
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
    const hasReasoningLabel = features.includes("reasoning")
      || features.includes("reasoning-effort")
      || isOpenAICompatibleReasoningControlModel(meta)
      || isAnthropicReasoningControlModel(meta)
      || isVolcengineDoubaoReasoningModel(meta)
      || isBasetenReasoningControlModel(meta)
      || isTogetherReasoningControlModel(meta);
    if (hasReasoningLabel) {
      labels.push("Reasoning");
    }
    if (features.includes("streaming")) {
      labels.push("Streaming");
    }
    return Array.from(new Set(labels));
  }

  function formatModelOptionLabel(providerName, model, meta) {
    const capabilityText = describeModelCapabilities(meta || model).join(", ");
    return capabilityText ? `${providerName} · ${model} · ${capabilityText}` : `${providerName} · ${model}`;
  }

  namespace.modelCapabilities = {
    normalizeModelEntry,
    normalizeModelList,
    normalizeModelId,
    normalizeModelIds,
    findModelMeta,
    isTextGenerationModel,
    isOpenAICompatibleReasoningControlModel,
    isDeepSeekV4PlusReasoningModel,
    isDeepSeekHybridReasoningModel,
    isAnthropicReasoningControlModel,
    isXaiGrokReasoningEffortModel,
    isGrok4FastReasoningModel,
    isVolcengineDoubaoReasoningModel,
    providerSupportsReasoningControl,
    providerCannotDisableReasoning,
    normalizeProviderReasoningEffort,
    isBasetenReasoningEffortModel,
    isBasetenChatTemplateReasoningModel,
    isBasetenReasoningControlModel,
    isTogetherReasoningEffortModel,
    isTogetherHybridReasoningModel,
    isTogetherReasoningControlModel,
    describeModelCapabilities,
    formatModelOptionLabel,
    modelHasFeature
  };
}(globalThis));
