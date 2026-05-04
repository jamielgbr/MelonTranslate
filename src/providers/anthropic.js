(function initAnthropicProvider(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const BaseProvider = namespace.providerBase.BaseProvider;
  const resolveTemperature = namespace.providerBase.resolveTemperature;
  const mp = namespace.modelParams;
  const mc = namespace.modelCapabilities;

  function getConfiguredModelMeta(config) {
    const modelId = String(config && config.model || "").trim();
    return mc.findModelMeta((config && config.availableModels) || [], modelId) || mc.normalizeModelEntry(modelId, {
      source: (config && config.id) || "anthropic",
      updatedAt: Number(config && config.modelsFetchedAt || 0)
    });
  }

  function buildThinkingPayload(config) {
    const effort = mp.normalizeReasoningEffort(config && config.reasoningEffort);
    if (!effort || effort === "off" || !mc.isAnthropicReasoningControlModel(getConfiguredModelMeta(config))) {
      return {};
    }
    const budgetByEffort = {
      low: 1024,
      medium: 2048,
      high: 3072
    };
    return {
      thinking: {
        type: "enabled",
        budget_tokens: budgetByEffort[effort] || budgetByEffort.medium
      }
    };
  }

  function readFirstTextContent(json) {
    const content = Array.isArray(json && json.content) ? json.content : [];
    const textBlock = content.find((block) => block && typeof block.text === "string");
    return textBlock ? textBlock.text : "";
  }

  class AnthropicProvider extends BaseProvider {
    buildHeaders() {
      return {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01"
      };
    }

    async translate(request, signal) {
      this.ensureConfigured();
      const startedAt = Date.now();
      const thinkingPayload = buildThinkingPayload(this.config);
      const requestBody = Object.assign({
        model: this.config.model,
        max_tokens: thinkingPayload.thinking ? 4096 : 1024,
        system: this.buildPrompt(request),
        messages: [{ role: "user", content: request.text }]
      }, thinkingPayload);
      if (!thinkingPayload.thinking) {
        requestBody.temperature = resolveTemperature(this.config.temperature, 1, 0.8);
      }
      const json = await this.fetchJsonWithRetry(`${this.normalizedBaseUrl()}/v1/messages`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(requestBody)
      }, undefined, signal);

      return this.buildResult(startedAt, {
        translatedText: readFirstTextContent(json).trim(),
        outputTokens: this.readOutputTokens(json)
      });
    }

    async translateStream(request, onChunk, signal) {
      this.ensureConfigured();
      const startedAt = Date.now();
      const thinkingPayload = buildThinkingPayload(this.config);
      const requestBody = Object.assign({
        model: this.config.model,
        max_tokens: thinkingPayload.thinking ? 4096 : 1024,
        stream: true,
        system: this.buildPrompt(request),
        messages: [{ role: "user", content: request.text }]
      }, thinkingPayload);
      if (!thinkingPayload.thinking) {
        requestBody.temperature = resolveTemperature(this.config.temperature, 1, 0.8);
      }

      const response = await this.fetchRaw(`${this.normalizedBaseUrl()}/v1/messages`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(requestBody)
      }, signal);

      let translatedText = "";
      let thinkingText = "";
      let outputTokens = null;
      await this.readEventStream(response, (json) => {
        const usageTokens = this.readOutputTokens(json);
        if (Number.isFinite(usageTokens)) {
          outputTokens = usageTokens;
        }

        if (json.type !== "content_block_delta" || !json.delta) {
          if (Number.isFinite(usageTokens)) {
            onChunk({ translatedTextChunk: "", thinkingChunk: "", outputTokens: usageTokens });
          }
          return;
        }

        const deltaType = String(json.delta.type || "");
        const translatedTextChunk = ((deltaType === "text_delta" || (!deltaType && typeof json.delta.text === "string")) ? json.delta.text : "") || "";
        const thinkingChunk = (deltaType === "thinking_delta" ? json.delta.thinking : "") || "";

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

  namespace.anthropicProvider = {
    AnthropicProvider
  };
}(globalThis));
