(function initAnthropicProvider(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const BaseProvider = namespace.providerBase.BaseProvider;
  const resolveTemperature = namespace.providerBase.resolveTemperature;

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
      const json = await this.fetchJsonWithRetry(`${this.normalizedBaseUrl()}/v1/messages`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          temperature: resolveTemperature(this.config.temperature, 1, 0.8),
          max_tokens: 1024,
          system: this.buildPrompt(request),
          messages: [{ role: "user", content: request.text }]
        })
      }, undefined, signal);

      const firstContent = json.content && json.content[0] ? json.content[0].text : "";
      return this.buildResult(startedAt, {
        translatedText: firstContent.trim(),
        outputTokens: this.readOutputTokens(json)
      });
    }

    async translateStream(request, onChunk, signal) {
      this.ensureConfigured();
      const startedAt = Date.now();
      const modelName = String(this.config.model || "").toLowerCase();
      const enableThinking = modelName.includes("thinking") || modelName.includes("reasoning");
      const requestBody = {
        model: this.config.model,
        temperature: resolveTemperature(this.config.temperature, 1, 0.8),
        max_tokens: 1024,
        stream: true,
        system: this.buildPrompt(request),
        messages: [{ role: "user", content: request.text }]
      };
      if (enableThinking) {
        requestBody.thinking = {
          type: "enabled",
          budget_tokens: 512
        };
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
