(function initProviderBase(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};

  class ProviderError extends Error {
    constructor(message, statusCode) {
      super(message);
      this.name = "ProviderError";
      this.statusCode = statusCode || 0;
    }
    isAuthError() { return this.statusCode === 401 || this.statusCode === 403; }
    isRateLimited() { return this.statusCode === 429; }
    isServerError() { return this.statusCode >= 500; }
    isRetryable() { return this.isRateLimited() || this.isServerError(); }
    category() {
      if (this.isAuthError()) return "auth";
      if (this.isRateLimited()) return "rate_limit";
      if (this.isServerError()) return "server";
      if (this.statusCode === 0) return "network";
      return "client";
    }
  }

  function resolveTemperature(value, max, defaultValue) {
    if (value === null || value === undefined) {
      return defaultValue === undefined ? null : defaultValue;
    }
    if (typeof value === "string" && !value.trim()) {
      return defaultValue === undefined ? null : defaultValue;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return defaultValue === undefined ? null : defaultValue;
    }
    const upper = Number.isFinite(Number(max)) ? Number(max) : 2;
    const clamped = Math.min(upper, Math.max(0, numeric));
    return Math.round(clamped * 10) / 10;
  }

  function getErrorCategory(error, fallbackCategory) {
    return error && typeof error.category === "function"
      ? error.category()
      : (fallbackCategory || "network");
  }

  function createWordSegmenter() {
    if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
      return null;
    }
    try {
      return new Intl.Segmenter(undefined, { granularity: "word" });
    } catch (_) {
      return null;
    }
  }

  const wordSegmenter = createWordSegmenter();
  const noSpaceScriptPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
  const japaneseScriptPattern = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
  const koreanScriptPattern = /\p{Script=Hangul}/u;
  const japaneseParticleSource = "(?:が|を|は|へ|に|で|と|も|や|の|から|まで|より|だけ|ほど)";
  const japaneseParticlePattern = new RegExp(`^${japaneseParticleSource}$`, "u");
  const inlineJapaneseParticlePattern = new RegExp([
    "[\\p{Script=Han}\\p{Script=Katakana}A-Za-z0-9]",
    japaneseParticleSource,
    "[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}A-Za-z0-9]"
  ].join(""), "u");
  const koreanParticleSource = [
    "에서", "으로", "부터", "까지", "보다", "에게", "한테", "하고",
    "은", "는", "가", "을", "를", "와", "과", "도", "만", "께"
  ].join("|");
  const inlineKoreanParticlePattern = new RegExp(
    `[\\p{Script=Hangul}](?:${koreanParticleSource})[\\p{Script=Hangul}]`,
    "u"
  );

  function getWordLikeSegments(text) {
    if (!wordSegmenter) {
      return [];
    }
    try {
      return Array.from(wordSegmenter.segment(text))
        .filter((segment) => segment.isWordLike)
        .map((segment) => segment.segment);
    } catch (_) {
      return [];
    }
  }

  function looksLikeNoSpacePhrase(text) {
    if (!noSpaceScriptPattern.test(text)) {
      return false;
    }

    if (koreanScriptPattern.test(text) && inlineKoreanParticlePattern.test(text)) {
      return true;
    }

    const segments = getWordLikeSegments(text);
    if (!segments.length) {
      return japaneseScriptPattern.test(text) && inlineJapaneseParticlePattern.test(text);
    }

    const hasJapaneseParticle = japaneseScriptPattern.test(text)
      && segments.some((segment) => japaneseParticlePattern.test(segment));
    if (hasJapaneseParticle && segments.length > 1) {
      return true;
    }

    return segments.length > 3;
  }

  class BaseProvider {
    constructor(config) {
      this.config = config;
    }

    ensureConfigured() {
      if (this.config.requiresApiKey !== false && !this.config.apiKey) {
        throw new ProviderError("This provider is missing an API key.", 0);
      }
      if (!this.config.baseUrl && this.config.transport !== "unsupported") {
        throw new ProviderError("This provider is missing a base URL.", 0);
      }
    }

    normalizedBaseUrl() {
      return String(this.config.baseUrl || "").replace(/\/$/, "");
    }

    buildResult(startedAt, extras) {
      return Object.assign({
        providerId: this.config.id,
        providerName: this.config.displayName,
        model: this.config.model,
        latencyMs: Date.now() - startedAt
      }, extras);
    }

    buildPrompt(request) {
      if (request.dictionaryModeForSingleWord && this.isSingleWordInput(request.text)) {
        return this.buildDictionaryPrompt(request);
      }

      const sourceLanguage = String(request.sourceLanguage || "").trim();
      const sourceHint = sourceLanguage && sourceLanguage.toLowerCase() !== "auto"
        ? `Translate from ${sourceLanguage} into ${request.targetLanguage}.`
        : `Translate the user content into ${request.targetLanguage}.`;
      const contextStyle = request.contextStyle || "auto";
      const styleHint = this.buildContextStyleHint(contextStyle);

      return [
        "You are a precise translator.",
        sourceHint,
        styleHint,
        "Preserve names, technical terms, and formatting where possible.",
        "Return only the translated text."
      ].filter(Boolean).join(" ");
    }

    buildContextStyleHint(contextStyle) {
      switch (contextStyle) {
        case "casual-comment":
          return "Use a natural, conversational tone suitable for social media comments, chats, and replies.";
        case "formal-academic":
          return "Use a formal, precise tone suitable for academic or professional communication.";
        case "auto":
        default:
          return "";
      }
    }

    buildPromptPreview(request) {
      const systemPrompt = this.buildPrompt(request);
      const userPrompt = String(request && request.text || "");
      return [
        "[system]",
        systemPrompt,
        "",
        "[user]",
        userPrompt
      ].join("\n");
    }

    isSingleWordInput(text) {
      const normalized = String(text || "").trim();
      if (!normalized || normalized.length > 64) {
        return false;
      }

      if (/\s/.test(normalized)) {
        return false;
      }

      // Sentence-ending/interrogative punctuation indicates a phrase, not a word
      if (/[…．、※×！？。!?—ー（）；【】,，]/.test(normalized)) {
        return false;
      }

      if (looksLikeNoSpacePhrase(normalized)) {
        return false;
      }

      return /[\p{L}\p{N}]/u.test(normalized);
    }

    buildDictionaryPrompt(request) {
      return [
        "You are a bilingual dictionary assistant.",
        `The user provided a single word. Write explanation in ${request.targetLanguage}.`,
        "Keep the original word unchanged.",
        "Do not add unrelated commentary.",
        "Return plain text only in this exact format:",
        "Word: <original word>",
        "Pronunciation: <IPA or simple phonetic if known>",
        "Part of speech: <primary part of speech>",
        "Meanings:",
        "1. <short meaning>",
        "2. <short meaning if needed>",
        "Example: <short example sentence>",
        "Example translation: <translation of the example in target language>",
        `Translate the labels (such as "Word", "Pronunciation", "Part of speech", "Meanings", "Example", and "Example translation") into ${request.targetLanguage}`,
        "If any field is uncertain, keep it brief rather than inventing detail."
      ].join(" ");
    }

    _throwApiError(status, json) {
      const detail = json.error
        ? json.error.message || json.error.type || JSON.stringify(json.error)
        : "Request failed";
      throw new ProviderError(`${status}: ${detail}`, status);
    }

    async _readJsonBody(response) {
      const text = await response.text();
      try {
        return text ? JSON.parse(text) : {};
      } catch (_) {
        return { raw: text };
      }
    }

    readOutputTokens(payload) {
      if (!payload || typeof payload !== "object") {
        return null;
      }
      const usage = payload.usage;
      if (usage && typeof usage === "object") {
        const raw = usage.completion_tokens ?? usage.output_tokens;
        if (Number.isFinite(raw)) {
          return Number(raw);
        }
      }
      const nested = payload.message && payload.message.usage && payload.message.usage.output_tokens;
      if (Number.isFinite(nested)) {
        return Number(nested);
      }
      return null;
    }

    async fetchJson(url, init, signal) {
      let response;
      try {
        const opts = signal ? Object.assign({}, init, { signal }) : init;
        response = await fetch(url, opts);
      } catch (networkError) {
        if (networkError.name === "AbortError") { throw networkError; }
        throw new ProviderError(`Network error: ${networkError.message}`, 0);
      }

      const json = await this._readJsonBody(response);
      if (!response.ok) {
        this._throwApiError(response.status, json);
      }
      return json;
    }

    async fetchJsonWithRetry(url, init, maxRetries, signal) {
      const retries = maxRetries !== undefined ? maxRetries : 2;
      let lastError;
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (signal && signal.aborted) { throw new DOMException("The operation was aborted.", "AbortError"); }
        try {
          return await this.fetchJson(url, init, signal);
        } catch (error) {
          if (error.name === "AbortError") { throw error; }
          lastError = error;
          const retryable = error instanceof ProviderError ? error.isRetryable() : true;
          if (attempt < retries && retryable) {
            const delayMs = Math.pow(2, attempt) * 1000 + Math.random() * 200;
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          } else {
            throw error;
          }
        }
      }
      throw lastError;
    }

    async fetchRaw(url, init, signal) {
      try {
        const opts = signal ? Object.assign({}, init, { signal }) : init;
        return await fetch(url, opts);
      } catch (networkError) {
        if (networkError.name === "AbortError") { throw networkError; }
        throw new ProviderError(`Network error: ${networkError.message}`, 0);
      }
    }

    async readEventStream(response, onData, signal) {
      if (!response.ok) {
        const json = await this._readJsonBody(response);
        this._throwApiError(response.status, json);
      }

      if (!response.body) {
        throw new ProviderError("Streaming response body is not available.", 0);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processFrames = (text) => {
        const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const frames = normalized.split("\n\n");
        const pending = frames.pop() || "";

        for (const frame of frames) {
          const lines = frame.split("\n").map((line) => line.trim()).filter(Boolean);
          for (const line of lines) {
            if (!line.startsWith("data:")) {
              continue;
            }
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") {
              continue;
            }
            let json;
            try {
              json = JSON.parse(payload);
            } catch (_) {
              continue;
            }
            onData(json);
          }
        }

        return pending;
      };

      while (true) {
        if (signal && signal.aborted) {
          reader.cancel();
          throw new DOMException("The operation was aborted.", "AbortError");
        }
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        buffer = processFrames(buffer);
      }

      buffer += decoder.decode();
      processFrames(`${buffer}\n\n`);
    }

    async translateStream(request, onChunk, signal) {
      const result = await this.translate(request, signal);
      if (result.translatedText) {
        onChunk({
          translatedTextChunk: result.translatedText,
          thinkingChunk: ""
        });
      }
      return result;
    }
  }

  namespace.providerBase = {
    BaseProvider,
    ProviderError,
    resolveTemperature,
    getErrorCategory
  };
}(globalThis));
