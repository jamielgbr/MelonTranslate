(function initGeminiProvider(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const BaseProvider = namespace.providerBase.BaseProvider;
  const resolveTemperature = namespace.providerBase.resolveTemperature;

  function normalizeModelName(model) {
    const value = String(model || "").trim();
    return value.startsWith("models/") ? value : `models/${value}`;
  }

  function buildGeminiUrl(baseUrl, model, action, apiKey, extraParams) {
    const params = new URLSearchParams(Object.assign({ key: apiKey }, extraParams || {}));
    const base = String(baseUrl || "").replace(/\/$/, "");
    return `${base}/${normalizeModelName(model)}:${action}?${params.toString()}`;
  }

  function readTextParts(json) {
    const parts = json && json.candidates && json.candidates[0]
      && json.candidates[0].content && Array.isArray(json.candidates[0].content.parts)
      ? json.candidates[0].content.parts
      : [];
    return parts.map((part) => typeof part.text === "string" ? part.text : "").join("");
  }

  class GeminiProvider extends BaseProvider {
    buildHeaders() {
      return { "Content-Type": "application/json" };
    }

    buildPayload(request, stream) {
      const generationConfig = {};
      const temperature = resolveTemperature(this.config.temperature, 2, 0.8);
      if (temperature !== null) {
        generationConfig.temperature = temperature;
      }

      return Object.assign({
        systemInstruction: {
          parts: [{ text: this.buildPrompt(request) }]
        },
        contents: [{
          role: "user",
          parts: [{ text: String(request.text || "") }]
        }]
      }, Object.keys(generationConfig).length ? { generationConfig } : {}, stream ? {} : {});
    }

    readOutputTokens(payload) {
      if (payload && payload.usageMetadata && Number.isFinite(payload.usageMetadata.candidatesTokenCount)) {
        return Number(payload.usageMetadata.candidatesTokenCount);
      }
      return super.readOutputTokens(payload);
    }

    async translate(request, signal) {
      this.ensureConfigured();
      const startedAt = Date.now();
      const json = await this.fetchJsonWithRetry(buildGeminiUrl(
        this.normalizedBaseUrl(),
        this.config.model,
        "generateContent",
        this.config.apiKey
      ), {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(this.buildPayload(request, false))
      }, undefined, signal);

      return this.buildResult(startedAt, {
        translatedText: readTextParts(json).trim(),
        outputTokens: this.readOutputTokens(json)
      });
    }

    async translateStream(request, onChunk, signal) {
      this.ensureConfigured();
      const startedAt = Date.now();
      let translatedText = "";
      let outputTokens = null;
      const response = await this.fetchRaw(buildGeminiUrl(
        this.normalizedBaseUrl(),
        this.config.model,
        "streamGenerateContent",
        this.config.apiKey,
        { alt: "sse" }
      ), {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(this.buildPayload(request, true))
      }, signal);

      await this.readEventStream(response, (json) => {
        const chunk = readTextParts(json);
        const usageTokens = this.readOutputTokens(json);
        if (Number.isFinite(usageTokens)) {
          outputTokens = usageTokens;
        }
        if (chunk) {
          translatedText += chunk;
        }
        if (chunk || Number.isFinite(usageTokens)) {
          onChunk({
            translatedTextChunk: chunk,
            thinkingChunk: "",
            outputTokens: Number.isFinite(usageTokens) ? usageTokens : undefined
          });
        }
      }, signal);

      return this.buildResult(startedAt, {
        translatedText: translatedText.trim(),
        outputTokens: Number.isFinite(outputTokens) ? outputTokens : undefined
      });
    }
  }

  namespace.geminiProvider = {
    GeminiProvider
  };
}(globalThis));