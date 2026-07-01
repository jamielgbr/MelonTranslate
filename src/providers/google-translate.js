(function initGoogleTranslateProvider(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const BaseProvider = namespace.providerBase.BaseProvider;
  const ProviderError = namespace.providerBase.ProviderError;

  const DEFAULT_BASE_URL = "https://translate.googleapis.com";
  const DEFAULT_TTS_BASE_URL = "https://translate.google.com";
  const MAX_TTS_CHARS_PER_CHUNK = 180;
  const MAX_TTS_CHUNKS = 8;

  function normalizeString(value, fallback) {
    const normalized = String(value || "").trim();
    return normalized || fallback;
  }

  function buildTranslateUrl(baseUrl, request) {
    const url = new URL("/translate_a/single", (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "") + "/");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("dj", "1");
    url.searchParams.set("source", "input");
    url.searchParams.set("dt", "t");
    url.searchParams.set("sl", normalizeString(request.sourceLanguage, "auto"));
    url.searchParams.set("tl", normalizeString(request.targetLanguage, "en"));
    url.searchParams.set("q", String(request.text || ""));
    return url.toString();
  }

  function parseObjectPayload(json) {
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      return null;
    }

    const sentences = Array.isArray(json.sentences) ? json.sentences : [];
    const translatedText = sentences
      .map((sentence) => String(sentence && sentence.trans || ""))
      .join("")
      .trim();

    return {
      translatedText,
      detectedSourceLanguage: String(json.src || "").trim()
    };
  }

  function parseArrayPayload(json) {
    if (!Array.isArray(json)) {
      return null;
    }

    const translatedText = Array.isArray(json[0])
      ? json[0].map((sentence) => Array.isArray(sentence) ? String(sentence[0] || "") : "").join("").trim()
      : "";

    return {
      translatedText,
      detectedSourceLanguage: String(json[2] || "").trim()
    };
  }

  function parseTranslationPayload(json) {
    return parseObjectPayload(json) || parseArrayPayload(json) || {
      translatedText: "",
      detectedSourceLanguage: ""
    };
  }

  function splitReadAloudText(text, maxChars) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return [];
    }

    const limit = Math.max(32, Number(maxChars) || MAX_TTS_CHARS_PER_CHUNK);
    const segments = [];
    let remaining = normalized;

    while (remaining.length > limit) {
      let splitAt = remaining.lastIndexOf(" ", limit);
      if (splitAt < Math.floor(limit * 0.6)) {
        const prefix = remaining.slice(0, limit + 1);
        const punctuationMatches = Array.from(prefix.matchAll(/[,.!?;:，。！？；：]/g));
        if (punctuationMatches.length) {
          splitAt = punctuationMatches[punctuationMatches.length - 1].index + 1;
        }
      }
      if (splitAt <= 0) {
        splitAt = limit;
      }

      const chunk = remaining.slice(0, splitAt).trim();
      if (chunk) {
        segments.push(chunk);
      }
      remaining = remaining.slice(splitAt).trim();
    }

    if (remaining) {
      segments.push(remaining);
    }

    return segments;
  }

  function buildTtsUrl(baseUrl, text, language) {
    const url = new URL("/translate_tts", (baseUrl || DEFAULT_TTS_BASE_URL).replace(/\/$/, "") + "/");
    url.searchParams.set("ie", "UTF-8");
    url.searchParams.set("client", "tw-ob");
    url.searchParams.set("tl", normalizeString(language, "en"));
    url.searchParams.set("q", text);
    return url.toString();
  }

  function encodeAudioData(audioData) {
    const bytes = audioData instanceof Uint8Array ? audioData : new Uint8Array(audioData);
    const binary = Array.from(bytes, (value) => String.fromCharCode(value)).join("");
    return btoa(binary);
  }

  async function fetchAudioClip(url) {
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.5"
        }
      });
    } catch (networkError) {
      throw new ProviderError(`Network error: ${networkError.message}`, 0);
    }

    if (!response.ok) {
      throw new ProviderError(`Could not load read aloud audio (${response.status}).`, response.status);
    }

    const mimeType = String(response.headers.get("content-type") || "audio/mpeg").split(";")[0].trim() || "audio/mpeg";
    const audioData = await response.arrayBuffer();
    return {
      audioBase64: encodeAudioData(audioData),
      mimeType
    };
  }

  async function fetchReadAloudAudio(request) {
    const text = String(request && request.text || "").trim();
    if (!text) {
      throw new ProviderError("There is no translated text to read aloud.", 0);
    }

    const language = normalizeString(request && request.language, "en");
    const baseUrl = normalizeString(request && request.baseUrl, DEFAULT_TTS_BASE_URL);
    const segments = splitReadAloudText(text, request && request.maxCharsPerChunk);
    if (segments.length > MAX_TTS_CHUNKS) {
      throw new ProviderError("The text is too long for Google read aloud. Please shorten it and try again.", 0);
    }
    const clips = [];

    for (const segment of segments) {
      const clip = await fetchAudioClip(buildTtsUrl(baseUrl, segment, language));
      clips.push(clip);
    }

    return {
      language,
      clips,
      totalChars: text.length
    };
  }

  class GoogleTranslateProvider extends BaseProvider {
    ensureConfigured() {
      if (!this.config.baseUrl) {
        throw new ProviderError("This provider is missing a base URL.", 0);
      }
    }

    async translate(request, signal) {
      this.ensureConfigured();
      const startedAt = Date.now();
      const json = await this.fetchJsonWithRetry(buildTranslateUrl(this.config.baseUrl, request), {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      }, 1, signal);
      const parsed = parseTranslationPayload(json);

      return this.buildResult(startedAt, {
        translatedText: parsed.translatedText,
        detectedSourceLanguage: parsed.detectedSourceLanguage
      });
    }
  }

  async function detectLanguage(text, baseUrl) {
    const sample = String(text || "").substring(0, 200).trim();
    if (!sample) {
      return "en";
    }
    try {
      const url = buildTranslateUrl(baseUrl || DEFAULT_BASE_URL, {
        sourceLanguage: "auto",
        targetLanguage: "en",
        text: sample
      });
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) {
        return "en";
      }
      const json = await response.json();
      const parsed = parseTranslationPayload(json);
      return parsed.detectedSourceLanguage || "en";
    } catch (_err) {
      return "en";
    }
  }

  namespace.googleTranslateProvider = {
    GoogleTranslateProvider,
    fetchReadAloudAudio,
    detectLanguage,
    splitReadAloudText,
    MAX_TTS_CHARS_PER_CHUNK,
    MAX_TTS_CHUNKS
  };
}(globalThis));