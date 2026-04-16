(function initOpenAICompatibleProvider(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const BaseProvider = namespace.providerBase.BaseProvider;
  const resolveTemperature = namespace.providerBase.resolveTemperature;

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

      const json = await this.fetchJsonWithRetry(`${this.normalizedBaseUrl()}/chat/completions`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(payload)
      }, undefined, signal);

      return this.buildResult(startedAt, {
        translatedText: json.choices && json.choices[0] && json.choices[0].message
          ? json.choices[0].message.content.trim()
          : "",
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
