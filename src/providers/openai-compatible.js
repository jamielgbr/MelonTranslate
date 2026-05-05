(function initOpenAICompatibleProvider(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const BaseProvider = namespace.providerBase.BaseProvider;
  const resolveTemperature = namespace.providerBase.resolveTemperature;
  const mp = namespace.modelParams;
  const mc = namespace.modelCapabilities;

  function getConfiguredModelMeta(config) {
    const modelId = String(config && config.model || "").trim();
    return mc.findModelMeta((config && config.availableModels) || [], modelId) || mc.normalizeModelEntry(modelId, {
      source: (config && config.id) || "provider",
      updatedAt: Number(config && config.modelsFetchedAt || 0)
    });
  }

  function buildBasetenReasoningPayload(effort, meta) {
    if (!effort || !mc.isBasetenReasoningControlModel(meta)) {
      return {};
    }
    if (effort === "off") {
      return {};
    }
    if (mc.isBasetenChatTemplateReasoningModel(meta)) {
      return { chat_template_args: { enable_thinking: true } };
    }
    if (mc.isBasetenReasoningEffortModel(meta)) {
      return { reasoning_effort: effort };
    }
    return {};
  }

  function mapTogetherReasoningEffort(effort, meta) {
    if (mc.isDeepSeekV4PlusReasoningModel(meta)) {
      return effort === "high" ? "max" : "high";
    }
    return effort;
  }

  function buildTogetherReasoningPayload(effort, meta) {
    if (!effort || !mc.isTogetherReasoningControlModel(meta)) {
      return {};
    }
    if (mc.isTogetherReasoningEffortModel(meta)) {
      return effort === "off" ? {} : { reasoning_effort: mapTogetherReasoningEffort(effort, meta) };
    }
    if (mc.isTogetherHybridReasoningModel(meta)) {
      return { reasoning: { enabled: effort !== "off" } };
    }
    return {};
  }

  function buildReasoningEffortPayload(config) {
    const meta = getConfiguredModelMeta(config);
    const requestedEffort = mp.normalizeReasoningEffort(config && config.reasoningEffort);
    const effort = requestedEffort
      ? mc.normalizeProviderReasoningEffort(config, meta, requestedEffort)
      : requestedEffort;
    if (config && config.id === "groq") {
      return {};
    }
    if (config && config.id === "baseten") {
      return buildBasetenReasoningPayload(effort, meta);
    }
    if (config && config.id === "together") {
      return buildTogetherReasoningPayload(effort, meta);
    }
    if (config && config.id === "volcengine") {
      if (!effort || !mc.isVolcengineDoubaoReasoningModel(meta)) {
        return {};
      }
      if (effort === "off") {
        return {
          thinking: { type: "disabled" },
          reasoning_effort: "minimal"
        };
      }
      return {
        thinking: { type: "enabled" },
        reasoning_effort: effort
      };
    }
    if (!effort || !mc.isOpenAICompatibleReasoningControlModel(meta)) {
      return {};
    }
    if (effort === "off") {
      if (config && config.id === "openrouter") {
        return { reasoning: { enabled: false, exclude: true } };
      }
      if (mc.isDeepSeekV4PlusReasoningModel(meta)) {
        return { thinking: { type: "disabled" } };
      }
      return {};
    }
    if (config && config.id === "openrouter") {
      if (mc.isGrok4FastReasoningModel(meta)) {
        return { reasoning: { enabled: true } };
      }
      return { reasoning: { effort } };
    }
    if (config && config.id === "grok") {
      if (!mc.isXaiGrokReasoningEffortModel(meta)) {
        return {};
      }
      return { reasoning_effort: effort === "high" ? "high" : "low" };
    }
    if (mc.isDeepSeekV4PlusReasoningModel(meta)) {
      return {
        thinking: { type: "enabled" },
        reasoning_effort: "high"
      };
    }
    if (mc.isDeepSeekHybridReasoningModel(meta)) {
      return { thinking: { type: "enabled" } };
    }
    return { reasoning_effort: effort };
  }

  function collectReasoningText(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      return value.map((item) => collectReasoningText(item)).join("");
    }
    if (typeof value === "object") {
      if (typeof value.text === "string") return value.text;
      if (typeof value.content === "string") return value.content;
      if (Array.isArray(value.content)) {
        return value.content.map((item) => collectReasoningText(item)).join("");
      }
    }
    return "";
  }

  class OpenAICompatibleProvider extends BaseProvider {
    buildHeaders() {
      const headers = Object.assign(
        { "Content-Type": "application/json" },
        this.config.extraHeaders || {}
      );
      if (this.config.apiKey) {
        headers["Authorization"] = `Bearer ${this.config.apiKey}`;
      }
      return headers;
    }

    async translate(request, signal) {
      this.ensureConfigured();
      const startedAt = Date.now();
      const payload = {
        model: this.config.model,
        temperature: resolveTemperature(this.config.temperature, 2, 0.8),
        messages: [
          { role: "system", content: this.buildPrompt(request) },
          { role: "user", content: request.text }
        ]
      };
      Object.assign(payload, buildReasoningEffortPayload(this.config));

      const json = await this.fetchJsonWithRetry(`${this.normalizedBaseUrl()}/chat/completions`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(payload)
      }, undefined, signal);

      const message = json.choices && json.choices[0] && json.choices[0].message
        ? json.choices[0].message
        : {};
      return this.buildResult(startedAt, {
        translatedText: typeof message.content === "string" ? message.content.trim() : "",
        thinkingText: collectReasoningText(message.reasoning_content || message.reasoning || message.reasoning_text).trim(),
        outputTokens: this.readOutputTokens(json)
      });
    }

    async translateStream(request, onChunk, signal) {
      this.ensureConfigured();
      const startedAt = Date.now();
      const payload = {
        model: this.config.model,
        temperature: resolveTemperature(this.config.temperature, 2, 0.8),
        stream: true,
        stream_options: {
          include_usage: true
        },
        messages: [
          { role: "system", content: this.buildPrompt(request) },
          { role: "user", content: request.text }
        ]
      };
      Object.assign(payload, buildReasoningEffortPayload(this.config));

      let translatedText = "";
      let thinkingText = "";
      let outputTokens = null;

      const response = await this.fetchRaw(`${this.normalizedBaseUrl()}/chat/completions`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(payload)
      }, signal);

      await this.readEventStream(response, (json) => {
        const usageTokens = this.readOutputTokens(json);
        if (Number.isFinite(usageTokens)) {
          outputTokens = usageTokens;
        }
        const streamDelta = json.choices && json.choices[0] && json.choices[0].delta
          ? json.choices[0].delta
          : {};
        const translatedTextChunk = streamDelta.content || "";
        const thinkingChunk = collectReasoningText(
          streamDelta.reasoning_content || streamDelta.reasoning || streamDelta.reasoning_text
        );
        if (translatedTextChunk) {
          translatedText += translatedTextChunk;
        }
        if (thinkingChunk) {
          thinkingText += thinkingChunk;
        }
        if (translatedTextChunk || thinkingChunk || Number.isFinite(usageTokens)) {
          onChunk({
            translatedTextChunk,
            thinkingChunk,
            outputTokens: Number.isFinite(usageTokens) ? usageTokens : undefined
          });
        }
      }, signal);

      return this.buildResult(startedAt, {
        translatedText: translatedText.trim(),
        thinkingText: thinkingText.trim(),
        outputTokens: Number.isFinite(outputTokens) ? outputTokens : undefined
      });
    }
  }

  namespace.openAICompatibleProvider = {
    OpenAICompatibleProvider
  };
}(globalThis));
