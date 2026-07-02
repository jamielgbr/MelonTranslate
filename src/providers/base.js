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
  const chineseScriptPattern = /\p{Script=Han}/u;
  const chinesePronounSource = "(?:我|你|您|他|她|它|咱|我们|你们|他们|她们|它们|咱们)";
  const chinesePredicateSource = "(?:是|在|有|叫|爱|喜欢|需要|觉得|知道|认识|看到|看见|想|要|会|能|可以|应该)";
  const chinesePossessivePhrasePattern = new RegExp(`^${chinesePronounSource}的[\\p{Script=Han}]`, "u");
  const chineseSubjectPredicatePattern = new RegExp(
    `^${chinesePronounSource}(?:也|都|就|还)?(?:不|没)?(?:${chinesePredicateSource}|很|太|真|更|最)[\\p{Script=Han}]`,
    "u"
  );
  const chineseTrailingPredicatePattern = /[\p{Script=Han}](?:叫|是|在|有)$/u;
  const chineseSentenceParticlePattern = /[\p{Script=Han}](?:吗|呢|吧|啊|呀|啦)$/u;
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

  function looksLikeChinesePhrase(text, segments) {
    if (!chineseScriptPattern.test(text)) {
      return false;
    }

    if (chinesePossessivePhrasePattern.test(text) || chineseSubjectPredicatePattern.test(text)) {
      return true;
    }

    if (chineseSentenceParticlePattern.test(text)) {
      return true;
    }

    return segments.length > 1 && chineseTrailingPredicatePattern.test(text);
  }

  function looksLikeNoSpacePhrase(text) {
    if (!noSpaceScriptPattern.test(text)) {
      return false;
    }

    if (koreanScriptPattern.test(text) && inlineKoreanParticlePattern.test(text)) {
      return true;
    }

    const segments = getWordLikeSegments(text);
    if (looksLikeChinesePhrase(text, segments)) {
      return true;
    }

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
      if (request && request.task === "subtitle-topic-context") {
        return this.buildSubtitleTopicContextPrompt(request);
      }

      if (request && request.task === "subtitle-word-lookup") {
        return this.buildSubtitleWordLookupPrompt(request);
      }

      if (request && request.task === "subtitle-annotations") {
        return this.buildSubtitleAnnotationPrompt(request);
      }

      if (request && request.task === "subtitle-translation") {
        return this.buildSubtitleTranslationPrompt(request);
      }

      if (request.dictionaryModeForSingleWord && this.isSingleWordInput(request.text)) {
        return this.buildDictionaryPrompt(request);
      }

      const sourceLanguage = String(request.sourceLanguage || "").trim();
      const sourceHint = sourceLanguage && sourceLanguage.toLowerCase() !== "auto"
        ? `Translate from ${sourceLanguage} into ${request.targetLanguage}.`
        : `Translate the user content into ${request.targetLanguage}.`;
      const contextStyle = request.contextStyle || "auto";
      const styleHint = this.buildContextStyleHint(contextStyle);
      const subtitleContextHint = this.buildSubtitleContextHint(request.subtitleContext);
      const formattingHint = request.preserveRichTextFormatting
        ? "The user content may contain inline formatting markers [[MTB]], [[/MTB]], [[MTI]], and [[/MTI]]. Preserve these marker tokens exactly around the corresponding translated words; do not translate, remove, duplicate, escape, or explain the markers."
        : "Preserve names, technical terms, and formatting where possible.";

      return [
        "You are a precise translator.",
        sourceHint,
        styleHint,
        subtitleContextHint,
        formattingHint,
        "For short fragments, tags, search keywords, or noun phrases, translate as one concise phrase and preserve uncertain proper names or titles.",
        "Do not add explanations, alternatives, transliterations, labels, notes, or context not present in the source.",
        "Return only the translated text."
      ].filter(Boolean).join(" ");
    }

    buildSubtitleContextHint(context) {
      const value = String(context || "").replace(/\s+/g, " ").trim();
      if (!value) {
        return "";
      }
      return `Video topic context for subtitle translation: ${value} Use it only to resolve terminology, proper nouns, domain-specific meaning, and tone; do not add facts that are not present in the source subtitle.`;
    }

    buildSubtitleTranslationPrompt(request) {
      const sourceLanguage = String(request.sourceLanguage || "").trim();
      const sourceHint = sourceLanguage && sourceLanguage.toLowerCase() !== "auto"
        ? `Translate the current subtitle from ${sourceLanguage} into ${request.targetLanguage}.`
        : `Translate the current subtitle into ${request.targetLanguage}.`;
      const contextStyle = request.contextStyle || "neutral";
      const styleHint = this.buildContextStyleHint(contextStyle);
      const previousText = String(request.previousSubtitleText || "").replace(/\s+/g, " ").trim();
      const nextText = String(request.nextSubtitleText || "").replace(/\s+/g, " ").trim();

      return [
        "You are a precise subtitle translator.",
        sourceHint,
        previousText ? `Previous subtitle context: ${previousText}` : "",
        nextText ? `Next subtitle context: ${nextText}` : "",
        this.buildSubtitleContextHint(request.subtitleContext),
        styleHint,
        "Use the previous subtitle, next subtitle, and video topic context only to resolve pronouns, ellipsis, terminology, proper nouns, domain-specific meaning, and tone.",
        "Translate only the current subtitle text provided by the user message.",
        "Do not translate or summarize the previous or next subtitle context.",
        "Preserve names, technical terms, and formatting where possible.",
        "For short fragments or noun phrases, translate as one concise phrase and preserve uncertain proper names or titles.",
        "Do not add explanations, alternatives, transliterations, labels, notes, or context not present in the current subtitle.",
        "Return only the translated subtitle text."
      ].filter(Boolean).join(" ");
    }

    buildSubtitleTopicContextPrompt(request) {
      const sourceLanguage = String(request.sourceLanguage || "auto").trim() || "auto";
      const targetLanguage = String(request.targetLanguage || "target language").trim() || "target language";
      return [
        "You analyze video subtitles before translation.",
        `The subtitles will be translated from ${sourceLanguage} into ${targetLanguage}.`,
        "Read the provided video title, page metadata, and subtitle sample.",
        "Return one concise English context note for later subtitle translation.",
        "Include the likely topic/domain, product/person/place names, specialized terms, tone/register, and any translation choices that would help avoid ambiguity.",
        "Do not translate the subtitle sample.",
        "Do not invent facts beyond the title or subtitles.",
        "Return plain text only, no headings, no bullets, no JSON.",
        "Keep it under 90 words."
      ].join(" ");
    }

    buildSubtitleWordLookupPrompt(request) {
      const sourceLanguage = String(request.sourceLanguage || "auto").trim() || "auto";
      const targetLanguage = String(request.targetLanguage || "en").trim() || "en";
      const selectedWord = String(request.text || "").replace(/\s+/g, " ").trim();
      const sentence = String(request.subtitleSentence || "").replace(/\s+/g, " ").trim();
      const nextSentence = String(request.nextSubtitleSentence || "").replace(/\s+/g, " ").trim();
      return [
        "You are a language-learning subtitle vocabulary assistant.",
        `Explain the selected source word or short phrase in ${targetLanguage}.`,
        `Source language: ${sourceLanguage}.`,
        selectedWord ? `Selected text: ${selectedWord}.` : "",
        sentence ? `Subtitle sentence: ${sentence}` : "",
        nextSentence ? `Next subtitle sentence: ${nextSentence}` : "",
        this.buildSubtitleContextHint(request.subtitleContext),
        "Use the subtitle sentence, next subtitle sentence, and video topic context only to choose the correct sense.",
        "Keep the meaning concise but useful for a language learner.",
        "If helpful, use the note field for a short usage hint, part of speech, nuance, or why this meaning fits the subtitle.",
        "Return strict JSON only, with this exact shape:",
        "{\"items\":[{\"term\":\"selected source text\",\"meaning\":\"short meaning\",\"note\":\"optional short note\"}]}",
        "Do not translate the whole subtitle sentence.",
        "If the selected text is a name or title that should not be translated, put the original text in meaning and explain briefly in note."
      ].filter(Boolean).join(" ");
    }

    buildSubtitleAnnotationPrompt(request) {
      const sourceLanguage = String(request.sourceLanguage || "auto").trim() || "auto";
      const targetLanguage = String(request.targetLanguage || "en").trim() || "en";
      const levelSystem = String(request.learningLevelSystem || "CEFR").trim() || "CEFR";
      const learningLevel = String(request.learningLevel || "B1").trim() || "B1";
      const rawMaxAnnotations = Number(request.maxAnnotations);
      const maxAnnotations = Number.isFinite(rawMaxAnnotations)
        ? Math.max(1, Math.min(8, Math.round(rawMaxAnnotations)))
        : 4;
      const annotationTypeHint = this.buildSubtitleAnnotationTypeHint(request.annotationTypes);
      const previousText = String(request.previousSubtitleText || "").replace(/\s+/g, " ").trim();
      const nextText = String(request.nextSubtitleText || "").replace(/\s+/g, " ").trim();

      return [
        "You are a language-learning subtitle assistant.",
        `The subtitle source language is ${sourceLanguage}.`,
        `The learner level is ${levelSystem} ${learningLevel}.`,
        `Write meanings and notes in ${targetLanguage}.`,
        previousText ? `Previous subtitle context: ${previousText}` : "",
        nextText ? `Next subtitle context: ${nextText}` : "",
        this.buildSubtitleContextHint(request.subtitleContext),
        "Select only source-language words, fixed phrases, idioms, collocations, or grammar chunks that are likely above the learner level or especially useful.",
        "Use previous and next subtitle context only to understand the current subtitle text; every returned term must appear in the current subtitle text.",
        annotationTypeHint,
        `Return at most ${maxAnnotations} items.`,
        "Do not translate the whole subtitle sentence.",
        "Do not include obvious words below the learner level, punctuation, duplicate terms, or unrelated commentary.",
        "Keep each meaning concise and useful for reading the subtitle.",
        "Return strict JSON only, with this exact shape:",
        "{\"items\":[{\"term\":\"source term\",\"meaning\":\"short meaning\",\"note\":\"optional short note\"}]}",
        "Use source terms exactly as they appear where possible.",
        "If there is nothing useful to annotate, return {\"items\":[]}."
      ].filter(Boolean).join(" ");
    }

    buildSubtitleAnnotationTypeHint(annotationTypes) {
      const labels = {
        noun: "nouns and useful noun phrases",
        verb: "verbs and useful verb phrases",
        adjective: "adjectives and adjectival phrases",
        adverb: "adverbs and adverbial phrases",
        phrase: "fixed phrases, idioms, collocations, and grammar chunks"
      };
      const selected = (Array.isArray(annotationTypes) ? annotationTypes : [annotationTypes])
        .map((item) => String(item || "").trim())
        .filter((item) => item && item !== "any" && labels[item]);
      const unique = Array.from(new Set(selected));
      if (!unique.length) {
        return "";
      }
      return `Only annotate these types: ${unique.map((item) => labels[item]).join(", ")}.`;
    }

    buildContextStyleHint(contextStyle) {
      switch (contextStyle) {
        case "casual":
          return "Use a natural, conversational tone suitable for social media comments, chats, and replies.";
        case "formal":
          return "Use a formal, precise tone suitable for academic or professional communication.";
        case "neutral":
          return "Use a neutral journalistic tone and avoid adding opinion or emphasis not present in the source.";
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
      if (/[…．、※×！？。!?:：;；—ー（）；【】,，]/.test(normalized)) {
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
