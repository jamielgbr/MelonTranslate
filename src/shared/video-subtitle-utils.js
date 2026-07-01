(function initVideoSubtitleUtils(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const commonEnglishAbbreviations = new Set(["mr", "mrs", "ms", "dr", "prof", "sr", "jr", "vs", "etc", "e.g", "i.e"]);

  function decodeHtmlEntities(text) {
    const named = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: "\"",
      apos: "'",
      nbsp: " "
    };
    return String(text || "").replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, value) => {
      if (value.charAt(0) === "#") {
        const isHex = value.charAt(1).toLowerCase() === "x";
        const raw = isHex ? value.slice(2) : value.slice(1);
        const codePoint = parseInt(raw, isHex ? 16 : 10);
        if (Number.isFinite(codePoint)) {
          try {
            return String.fromCodePoint(codePoint);
          } catch (_) {}
        }
        return match;
      }
      return Object.prototype.hasOwnProperty.call(named, value) ? named[value] : match;
    });
  }

  function normalizeCueText(text) {
    return decodeHtmlEntities(text)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/\r/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function isStrongSentenceBoundaryChar(value) {
    return /[.。!?！？;；]/.test(String(value || ""));
  }

  function isSentenceStartAfterBoundary(value) {
    return /[A-Z0-9\u3040-\u30ff\u3400-\u9fff]/.test(String(value || ""));
  }

  function isClosingSentencePunctuation(value) {
    return /["'”’)\]]/.test(String(value || ""));
  }

  function isLikelyEnglishAbbreviation(text, punctuationIndex) {
    if (text.charAt(punctuationIndex) !== ".") {
      return false;
    }
    const before = text.slice(0, punctuationIndex + 1);
    const wordMatch = before.match(/([A-Za-z.]+)\.$/);
    const word = wordMatch ? wordMatch[1].toLowerCase() : "";
    if (commonEnglishAbbreviations.has(word)) {
      return true;
    }
    return /^[A-Za-z]$/.test(text.charAt(punctuationIndex - 1) || "")
      && /^[A-Z]\./.test(text.slice(punctuationIndex + 1, punctuationIndex + 3));
  }

  function getSentenceStartCharAfterBoundary(text, boundaryEndIndex) {
    let index = boundaryEndIndex;
    while (index < text.length && /\s/.test(text.charAt(index))) {
      index += 1;
    }
    while (index < text.length && /["'“”‘’([{]/.test(text.charAt(index))) {
      index += 1;
    }
    return text.charAt(index);
  }

  function normalizeSplitLength(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : fallback;
  }

  function splitTextBySentenceBoundaries(text, options) {
    const opts = options || {};
    const normalizeText = typeof opts.normalizeText === "function" ? opts.normalizeText : normalizeCueText;
    const minTextLength = normalizeSplitLength(opts.minTextLength, 0);
    const minPartLength = normalizeSplitLength(opts.minPartLength, 1);
    const source = String(normalizeText(text) || "");
    if (source.length < minTextLength) {
      return source ? [source] : [];
    }
    const parts = [];
    let start = 0;
    for (let index = 0; index < source.length; index += 1) {
      if (!isStrongSentenceBoundaryChar(source.charAt(index)) || isLikelyEnglishAbbreviation(source, index)) {
        continue;
      }
      let end = index + 1;
      while (end < source.length && isClosingSentencePunctuation(source.charAt(end))) {
        end += 1;
      }
      const nextStartChar = getSentenceStartCharAfterBoundary(source, end);
      if (!nextStartChar || !isSentenceStartAfterBoundary(nextStartChar)) {
        continue;
      }
      const part = String(normalizeText(source.slice(start, end)) || "");
      if (part.length >= minPartLength) {
        parts.push(part);
        start = end;
      }
    }
    const rest = String(normalizeText(source.slice(start)) || "");
    if (rest) {
      parts.push(rest);
    }
    return parts.length ? parts : (source ? [source] : []);
  }

  function getRunText(value) {
    if (!value) {
      return "";
    }
    if (typeof value.simpleText === "string") {
      return value.simpleText;
    }
    if (Array.isArray(value.runs)) {
      return value.runs.map((run) => String(run && run.text || "")).join("");
    }
    return "";
  }

  function normalizeCaptionTrack(track, index) {
    const value = track && typeof track === "object" ? track : {};
    const baseUrl = String(value.baseUrl || "").trim();
    const languageCode = String(value.languageCode || "").trim();
    if (!baseUrl || !languageCode) {
      return null;
    }
    return {
      id: String(value.vssId || value.languageCode || index),
      baseUrl,
      languageCode,
      vssId: String(value.vssId || ""),
      name: getRunText(value.name) || languageCode,
      kind: String(value.kind || ""),
      isTranslatable: value.isTranslatable !== false
    };
  }

  function extractCaptionTracks(playerResponse) {
    const captions = playerResponse
      && playerResponse.captions
      && playerResponse.captions.playerCaptionsTracklistRenderer;
    const tracks = captions && Array.isArray(captions.captionTracks)
      ? captions.captionTracks
      : [];
    return tracks.map(normalizeCaptionTrack).filter(Boolean);
  }

  function extractBalancedJson(text, startIndex) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let start = -1;
    for (let index = startIndex; index < text.length; index += 1) {
      const ch = text.charAt(index);
      if (start < 0) {
        if (ch === "{") {
          start = index;
          depth = 1;
        }
        continue;
      }
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === "\"") {
          inString = false;
        }
        continue;
      }
      if (ch === "\"") {
        inString = true;
      } else if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return text.slice(start, index + 1);
        }
      }
    }
    return "";
  }

  function parseYouTubePlayerResponseFromText(text) {
    const source = String(text || "");
    const markers = [
      "ytInitialPlayerResponse",
      "\"playerResponse\""
    ];
    for (const marker of markers) {
      let searchFrom = 0;
      while (searchFrom < source.length) {
        const markerIndex = source.indexOf(marker, searchFrom);
        if (markerIndex < 0) {
          break;
        }
        const objectStart = source.indexOf("{", markerIndex + marker.length);
        if (objectStart < 0) {
          break;
        }
        const raw = extractBalancedJson(source, objectStart);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (extractCaptionTracks(parsed).length) {
              return parsed;
            }
          } catch (_) {}
        }
        searchFrom = markerIndex + marker.length;
      }
    }
    return null;
  }

  function withYouTubeTimedTextFormat(rawUrl, format) {
    try {
      const url = new URL(String(rawUrl || ""));
      url.searchParams.set("fmt", format || "json3");
      return url.toString();
    } catch (_) {
      return String(rawUrl || "");
    }
  }

  function getYouTubeTimedTextMetadata(rawUrl) {
    let url;
    try {
      url = new URL(String(rawUrl || ""), "https://www.youtube.com");
    } catch (_) {
      return null;
    }
    const host = url.hostname.toLowerCase();
    const isYouTubeHost = host === "youtube.com"
      || host.endsWith(".youtube.com")
      || host === "youtube-nocookie.com"
      || host.endsWith(".youtube-nocookie.com");
    if (!isYouTubeHost || !/\/(?:api\/)?timedtext\/?$/i.test(url.pathname)) {
      return null;
    }
    return {
      videoId: String(url.searchParams.get("v") || ""),
      languageCode: String(url.searchParams.get("lang") || url.searchParams.get("language") || ""),
      targetLanguage: String(url.searchParams.get("tlang") || ""),
      format: String(url.searchParams.get("fmt") || ""),
      kind: String(url.searchParams.get("kind") || ""),
      name: String(url.searchParams.get("name") || "")
    };
  }

  function parseYouTubeTimedTextCapture(entry) {
    const value = entry && typeof entry === "object" ? entry : {};
    const url = String(value.finalUrl || value.url || "");
    const metadata = getYouTubeTimedTextMetadata(url);
    if (!metadata) {
      return null;
    }
    const contentType = String(value.contentType || "");
    const body = String(value.body || "");
    const cues = parseYouTubeTimedText(body, contentType, url);
    if (!cues.length) {
      return null;
    }
    return Object.assign({}, metadata, {
      url,
      contentType,
      source: String(value.source || ""),
      capturedAt: Number(value.capturedAt || 0),
      bodyLength: body.length,
      cues
    });
  }

  function normalizeCueList(cues) {
    return (Array.isArray(cues) ? cues : []).map((cue, index) => {
      const value = cue && typeof cue === "object" ? cue : {};
      const start = Number(value.start);
      const end = Number(value.end);
      const text = normalizeCueText(value.text);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) {
        return null;
      }
      return {
        id: String(value.id || index),
        start,
        end,
        text
      };
    }).filter(Boolean).sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function parseYouTubeJson3(body) {
    const json = typeof body === "string"
      ? JSON.parse(String(body || "").replace(/^\)\]\}'\s*/, "").trim())
      : body;
    const events = json && Array.isArray(json.events)
      ? json.events
      : findJson3Events(json);
    return normalizeCueList(events.map((event, index) => {
      const startMs = Number(event && event.tStartMs);
      const durationMs = Number(event && event.dDurationMs);
      const segs = Array.isArray(event && event.segs) ? event.segs : [];
      const text = segs.map((seg) => String(seg && seg.utf8 || "")).join("");
      const start = Number.isFinite(startMs) ? startMs / 1000 : NaN;
      const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs / 1000 : 2;
      return {
        id: String(event && event.id || index),
        start,
        end: start + duration,
        text
      };
    }));
  }

  function findJson3Events(value) {
    if (!value || typeof value !== "object") {
      return [];
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = findJson3Events(item);
        if (nested.length) {
          return nested;
        }
      }
      return [];
    }
    if (Array.isArray(value.events)) {
      return value.events;
    }
    for (const item of Object.values(value)) {
      const nested = findJson3Events(item);
      if (nested.length) {
        return nested;
      }
    }
    return [];
  }

  function parseAttributes(raw) {
    const attrs = {};
    String(raw || "").replace(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_, key, doubleQuoted, singleQuoted) => {
      const value = doubleQuoted !== undefined ? doubleQuoted : singleQuoted;
      attrs[key] = decodeHtmlEntities(value);
      return "";
    });
    return attrs;
  }

  function parseYouTubeTimedTextXml(body) {
    const source = String(body || "");
    const cues = [];
    const pattern = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
    let match;
    while ((match = pattern.exec(source))) {
      const attrs = parseAttributes(match[1]);
      const start = Number(attrs.start);
      const duration = Number(attrs.dur);
      const text = normalizeCueText(match[2].replace(/<[^>]+>/g, ""));
      if (Number.isFinite(start) && Number.isFinite(duration) && duration > 0 && text) {
        cues.push({
          id: String(cues.length),
          start,
          end: start + duration,
          text
        });
      }
    }
    return normalizeCueList(cues);
  }

  function parseYouTubeSrv3Xml(body) {
    const source = String(body || "");
    const rawCues = [];
    const pattern = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
    let match;
    while ((match = pattern.exec(source))) {
      const attrs = parseAttributes(match[1]);
      const startMs = Number(attrs.t);
      const durationMs = Number(attrs.d);
      const text = normalizeCueText(match[2]
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, ""));
      if (Number.isFinite(startMs) && text) {
        rawCues.push({
          id: String(rawCues.length),
          start: startMs / 1000,
          duration: Number.isFinite(durationMs) && durationMs > 0 ? durationMs / 1000 : 0,
          text
        });
      }
    }
    return normalizeCueList(rawCues.map((cue, index) => {
      const next = rawCues[index + 1];
      const fallbackEnd = next && next.start > cue.start ? next.start : cue.start + 2;
      return {
        id: cue.id,
        start: cue.start,
        end: cue.duration > 0 ? cue.start + cue.duration : fallbackEnd,
        text: cue.text
      };
    }));
  }

  function parseVttTimestamp(value) {
    const parts = String(value || "").trim().replace(",", ".").split(":");
    if (parts.length < 2 || parts.length > 3) {
      return NaN;
    }
    const seconds = Number(parts.pop());
    const minutes = Number(parts.pop());
    const hours = parts.length ? Number(parts.pop()) : 0;
    if (![hours, minutes, seconds].every(Number.isFinite)) {
      return NaN;
    }
    return hours * 3600 + minutes * 60 + seconds;
  }

  function stripVttCueSettings(value) {
    return String(value || "").trim().split(/\s+/)[0] || "";
  }

  function parseYouTubeWebVtt(body) {
    const source = String(body || "").replace(/\r/g, "");
    const blocks = source.split(/\n{2,}/);
    const cues = [];
    blocks.forEach((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      if (!lines.length) {
        return;
      }
      if (/^(WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/i.test(lines[0])) {
        return;
      }
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) {
        return;
      }
      const timingParts = lines[timingIndex].split("-->");
      const start = parseVttTimestamp(stripVttCueSettings(timingParts[0]));
      const end = parseVttTimestamp(stripVttCueSettings(timingParts[1]));
      const text = normalizeCueText(lines.slice(timingIndex + 1).join("\n").replace(/<[^>]+>/g, ""));
      if (Number.isFinite(start) && Number.isFinite(end) && end > start && text) {
        cues.push({
          id: String(cues.length),
          start,
          end,
          text
        });
      }
    });
    return normalizeCueList(cues);
  }

  function parseYouTubeTimedText(body, contentType, url) {
    const source = String(body || "").trim();
    const hint = `${contentType || ""} ${url || ""}`.toLowerCase();
    if (!source) {
      return [];
    }
    if (hint.includes("text/vtt") || hint.includes("fmt=vtt") || source.startsWith("WEBVTT")) {
      const cues = parseYouTubeWebVtt(source);
      if (cues.length) {
        return cues;
      }
    }
    if (hint.includes("json") || hint.includes("fmt=json") || source.charAt(0) === "{") {
      try {
        const cues = parseYouTubeJson3(source);
        if (cues.length) {
          return cues;
        }
      } catch (_) {}
    }
    const transcriptCues = parseYouTubeTimedTextXml(source);
    if (transcriptCues.length) {
      return transcriptCues;
    }
    return parseYouTubeSrv3Xml(source);
  }

  function getBaseLanguage(tag) {
    const pu = namespace.pageUtils;
    if (pu && typeof pu.getBaseLanguage === "function") {
      return pu.getBaseLanguage(tag);
    }
    return String(tag || "").trim().toLowerCase().split("-")[0];
  }

  function detectTextLanguage(text) {
    const pu = namespace.pageUtils;
    if (pu && typeof pu.detectTextLanguage === "function") {
      return pu.detectTextLanguage(text);
    }
    return "en";
  }

  function resolveSubtitleTarget(settings, sourceLanguage, sampleText, options) {
    const cfg = settings || {};
    const opts = options || {};
    const defaultTarget = String(cfg.targetLanguage || "en").trim();
    const secondTarget = String(cfg.secondTargetLanguage || "").trim();
    const detectedSource = String(sourceLanguage || "").trim() || detectTextLanguage(sampleText);
    const sourceMatchesDefault = !!detectedSource
      && getBaseLanguage(detectedSource) === getBaseLanguage(defaultTarget);
    const manual = !!opts.manual;

    if (!manual && cfg.videoBilingualSubtitlesSkipDefaultTargetSource !== false && sourceMatchesDefault) {
      return {
        shouldTranslate: false,
        reason: "source_matches_default_target",
        sourceLanguage: detectedSource,
        targetLanguage: secondTarget || defaultTarget
      };
    }

    return {
      shouldTranslate: true,
      reason: "",
      sourceLanguage: detectedSource || "auto",
      targetLanguage: sourceMatchesDefault && secondTarget ? secondTarget : defaultTarget
    };
  }

  namespace.videoSubtitleUtils = {
    decodeHtmlEntities,
    normalizeCueText,
    splitTextBySentenceBoundaries,
    extractCaptionTracks,
    parseYouTubePlayerResponseFromText,
    withYouTubeTimedTextFormat,
    getYouTubeTimedTextMetadata,
    parseYouTubeTimedTextCapture,
    normalizeCueList,
    parseYouTubeJson3,
    parseYouTubeTimedTextXml,
    parseYouTubeSrv3Xml,
    parseYouTubeWebVtt,
    parseYouTubeTimedText,
    resolveSubtitleTarget
  };
}(globalThis));
