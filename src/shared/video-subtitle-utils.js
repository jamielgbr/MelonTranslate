(function initVideoSubtitleUtils(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const commonEnglishAbbreviations = new Set(["mr", "mrs", "ms", "dr", "prof", "sr", "jr", "vs", "etc", "e.g", "i.e"]);
  const SPACE_SCRIPT_STRONG_CLAUSE_OPENERS = [
    "but", "however", "so", "because", "although", "though", "while", "when", "if", "then", "now",
    "therefore", "meanwhile", "otherwise", "instead", "still", "yet", "also", "plus", "let's",
    "not to mention",
    "mais", "donc", "alors", "cependant", "pourtant", "parce que", "quand", "ensuite",
    "pero", "entonces", "aunque", "porque", "cuando", "sin embargo", "ademas", "además", "luego",
    "aber", "jedoch", "deshalb", "deswegen", "weil", "wenn", "während", "waehrend", "dann",
    "mas", "porém", "porem", "então", "entao", "porque", "quando",
    "ma", "però", "pero", "quindi", "tuttavia", "perché", "perche", "quando",
    "но", "однако", "поэтому", "если", "когда", "потому что", "затем"
  ];
  const SPACE_SCRIPT_WEAK_CLAUSE_OPENERS = ["and", "or", "und", "et", "y", "e", "и"];
  const SPACE_SCRIPT_LIST_OPENERS = [
    "step one", "step two", "step three", "step four", "step five",
    "first", "second", "third", "fourth", "fifth", "firstly", "secondly", "next"
  ];
  const SPACE_SCRIPT_CORRECTION_LIST_OPENERS = [
    "no step one", "no step two", "no step three", "no step four", "no step five"
  ];
  const SPACE_SCRIPT_PRIORITY_CLAUSE_OPENERS = [
    "not to mention", "then i'll", "then i’ll", "then i will"
  ];
  const SPACE_SCRIPT_DIALOGUE_RESPONSE_OPENERS = [
    "oh really", "oh wow", "oh okay", "oh yeah", "oh no", "wait what"
  ];
  const COMPACT_SCRIPT_CLAUSE_OPENERS = [
    "但是", "不过", "然而", "所以", "因此", "然后", "如果", "因为", "虽然", "另外", "还有", "其实", "只是",
    "但是呢", "不过呢", "可是", "接着", "于是",
    "でも", "しかし", "だから", "なので", "ただ", "一方", "もし", "そして", "それで", "ところが", "けれど",
    "그런데", "하지만", "그래서", "그러나", "그리고", "만약", "다만", "한편"
  ];
  const COMPACT_SCRIPT_LIST_OPENERS = [
    "第一步", "第二步", "第三步", "第四步", "第五步", "首先", "其次", "接下来",
    "まず", "次に", "第一に", "第二に", "첫째", "둘째", "다음"
  ];
  const ENGLISH_PRONOUN_CLAUSE_START_PATTERN = /^(?:i['’](?:m|ve|ll|d)|you['’](?:re|ve|ll|d)|he['’](?:s|ll|d)|she['’](?:s|ll|d)|it['’](?:s|ll|d)|we['’](?:re|ll|d)|they['’](?:re|ve|ll|d)|there['’](?:s|re))\b/i;
  const ENGLISH_BARE_I_CLAUSE_START_PATTERN = /^i\s+(?:am|was|feel|felt|think|thought|know|knew|have|had|can|will|would|should|could|might|must|want|need|got|get|look|guess|say)\b/i;
  const ENGLISH_WEAK_PRONOUN_CLAUSE_START_PATTERN = /^(?:that['’]s|that is|that\s+(?:is|was|will|would|should|could|might|must|has|had))\b/i;
  const ENGLISH_PREDICATE_CLAUSE_START_PATTERN = /^(?:has|have|had|is|are|was|were|can|will|would|should|could|might|must)\b/i;
  const NUMERIC_UNIT_START_PATTERN = /^(?:g|kg|mg|lb|lbs|oz|mm|cm|m|km|ft|in|hz|khz|mhz|ghz|v|w|kw|wh|mah|ah|gb|mb|tb|fps|k|c|f|°c|°f)\b/i;
  const WORD_LIKE_CHAR_PATTERN = /[\p{L}\p{N}_'’]/u;
  const PROTECTED_BOUNDARY_BEFORE_WORDS = new Set([
    "a", "an", "the", "to", "of", "with", "for", "in", "on", "at", "by", "from", "into", "onto", "about"
  ]);
  const QUANTIFIED_SUBJECT_HEADS = new Set([
    "all", "both", "each", "either", "every", "few", "many", "most", "neither", "none", "one", "several", "some"
  ]);
  const OBJECT_PRONOUN_SUBJECT_TAILS = new Set(["him", "her", "it", "me", "them", "these", "those", "us", "you"]);
  const PREDICATE_SUBJECT_BLOCKERS = new Set(["i", "you", "he", "she", "it", "we", "they", "this", "that", "these", "those", "what", "who", "which"]);
  const PREDICATE_PREPOSITION_ALLOWLIST = new Set(["on", "in", "with", "for", "to", "of", "by", "about", "from", "over", "under"]);

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

  function isWordLikeChar(value) {
    return WORD_LIKE_CHAR_PATTERN.test(String(value || ""));
  }

  function textStartsWithBoundaryPhrase(text, phrase) {
    const source = String(text || "").trimStart().toLocaleLowerCase();
    const target = String(phrase || "").toLocaleLowerCase();
    if (!target || !source.startsWith(target)) {
      return false;
    }
    const next = source.charAt(target.length);
    return !next || !isWordLikeChar(next);
  }

  function textStartsWithAnyBoundaryPhrase(text, phrases) {
    return (Array.isArray(phrases) ? phrases : []).some((phrase) => textStartsWithBoundaryPhrase(text, phrase));
  }

  function textEndsWithBoundaryPhrase(text, phrase) {
    const source = String(text || "").trimEnd().toLocaleLowerCase();
    const target = String(phrase || "").toLocaleLowerCase();
    if (!target || !source.endsWith(target)) {
      return false;
    }
    const previous = source.charAt(source.length - target.length - 1);
    return !previous || !isWordLikeChar(previous);
  }

  function textEndsWithAnyBoundaryPhrase(text, phrases) {
    return (Array.isArray(phrases) ? phrases : []).some((phrase) => textEndsWithBoundaryPhrase(text, phrase));
  }

  function textStartsWithCompactBoundaryPhrase(text) {
    const source = String(text || "").trimStart();
    return COMPACT_SCRIPT_CLAUSE_OPENERS.concat(COMPACT_SCRIPT_LIST_OPENERS)
      .some((phrase) => source.startsWith(phrase));
  }

  function isNumericUnitBoundary(beforeText, afterText) {
    const before = String(beforeText || "").trimEnd();
    const after = String(afterText || "").trimStart();
    return /(?:^|[\s(])\d+(?:[.,]\d+)?$/.test(before)
      && NUMERIC_UNIT_START_PATTERN.test(after);
  }

  function hasEnoughTextForPredicateBoundary(beforeText, afterText) {
    return String(beforeText || "").trim().length >= 24
      && String(afterText || "").trim().length >= 24;
  }

  function getTrailingSpaceScriptWords(text, count) {
    const words = String(text || "").toLocaleLowerCase().match(/[a-z]+(?:['’][a-z]+)?/g) || [];
    return words.slice(Math.max(0, words.length - count));
  }

  function getLeadingSpaceScriptWords(text, count) {
    const words = String(text || "").toLocaleLowerCase().match(/[a-z]+(?:['’][a-z]+)?/g) || [];
    return words.slice(0, Math.max(0, count));
  }

  function isLikelyNounCompoundBoundary(beforeWord, afterWord) {
    const left = String(beforeWord || "");
    const right = String(afterWord || "");
    if (/['’]/.test(left) || /['’]/.test(right)) {
      return false;
    }
    if (!/^[a-z][a-z'-]{2,}$/.test(left) || !/^[a-z][a-z'-]{3,}$/.test(right)) {
      return false;
    }
    if (PROTECTED_BOUNDARY_BEFORE_WORDS.has(left) || PROTECTED_BOUNDARY_BEFORE_WORDS.has(right)) {
      return false;
    }
    return /s$/.test(right) && !/(?:ss|us)$/.test(right);
  }

  function isProtectedStructuralBoundary(beforeText, afterText) {
    const beforeWords = getTrailingSpaceScriptWords(beforeText, 4);
    const afterWords = getLeadingSpaceScriptWords(afterText, 4);
    const lastBeforeWord = beforeWords[beforeWords.length - 1] || "";
    const firstAfterWord = afterWords[0] || "";
    if (PROTECTED_BOUNDARY_BEFORE_WORDS.has(lastBeforeWord)) {
      return true;
    }
    if (PROTECTED_BOUNDARY_BEFORE_WORDS.has(firstAfterWord)) {
      return true;
    }
    if (isLikelyNounCompoundBoundary(lastBeforeWord, firstAfterWord)) {
      return true;
    }
    return false;
  }

  function textEndsWithBarePredicateSubject(text) {
    const words = getTrailingSpaceScriptWords(text, 4);
    const last = words[words.length - 1] || "";
    const previous = words[words.length - 2] || "";
    const quantifier = words[words.length - 3] || "";
    if (OBJECT_PRONOUN_SUBJECT_TAILS.has(last)
      && previous === "of"
      && QUANTIFIED_SUBJECT_HEADS.has(quantifier)) {
      return true;
    }
    return PREDICATE_SUBJECT_BLOCKERS.has(last)
      && !PREDICATE_PREPOSITION_ALLOWLIST.has(previous);
  }

  function getSoftSubtitleBoundaryScore(beforeText, afterText) {
    const before = String(beforeText || "").trimEnd();
    const after = String(afterText || "").trimStart();
    if (!before || !after) {
      return 0;
    }
    if (isNumericUnitBoundary(before, after)) {
      return -90;
    }
    if (isProtectedStructuralBoundary(before, after)) {
      return -80;
    }
    if (ENGLISH_PREDICATE_CLAUSE_START_PATTERN.test(after)
      && textEndsWithBarePredicateSubject(before)) {
      return -80;
    }
    if (textEndsWithAnyBoundaryPhrase(before, SPACE_SCRIPT_STRONG_CLAUSE_OPENERS.concat(SPACE_SCRIPT_WEAK_CLAUSE_OPENERS))) {
      return 0;
    }
    let score = /[,，:：、]\s*$/.test(before) ? 62 : 0;
    if (textStartsWithCompactBoundaryPhrase(after)) {
      score = Math.max(score, 92);
    }
    if (textStartsWithAnyBoundaryPhrase(after, SPACE_SCRIPT_PRIORITY_CLAUSE_OPENERS)) {
      score = Math.max(score, 98);
    }
    if (textStartsWithAnyBoundaryPhrase(after, SPACE_SCRIPT_DIALOGUE_RESPONSE_OPENERS)) {
      score = Math.max(score, 94);
    }
    if (textStartsWithAnyBoundaryPhrase(after, SPACE_SCRIPT_CORRECTION_LIST_OPENERS)) {
      score = Math.max(score, 98);
    }
    if (textStartsWithAnyBoundaryPhrase(after, SPACE_SCRIPT_LIST_OPENERS)) {
      score = Math.max(score, 94);
    }
    if (textStartsWithAnyBoundaryPhrase(after, SPACE_SCRIPT_STRONG_CLAUSE_OPENERS)
      || ENGLISH_PRONOUN_CLAUSE_START_PATTERN.test(after)
      || ENGLISH_BARE_I_CLAUSE_START_PATTERN.test(after)) {
      score = Math.max(score, 88);
    }
    if (ENGLISH_WEAK_PRONOUN_CLAUSE_START_PATTERN.test(after)) {
      score = Math.max(score, 24);
    }
    if (hasEnoughTextForPredicateBoundary(before, after)
      && !textEndsWithBarePredicateSubject(before)
      && ENGLISH_PREDICATE_CLAUSE_START_PATTERN.test(after)) {
      score = Math.max(score, 88);
    }
    if (textStartsWithAnyBoundaryPhrase(after, SPACE_SCRIPT_WEAK_CLAUSE_OPENERS)) {
      score = Math.max(score, 42);
    }
    return score;
  }

  function addSubtitleSplitCandidate(candidates, boundary, score, sourceLength) {
    const index = Number(boundary);
    if (!Number.isFinite(index) || index <= 0 || index >= sourceLength) {
      return;
    }
    const previous = candidates.get(index) || 0;
    candidates.set(index, Math.max(previous, score));
  }

  function getReadableSubtitleSplitBoundaries(text) {
    const source = String(text || "");
    const candidates = new Map();
    source.replace(/\s+/g, (match, offset) => {
      const score = getSoftSubtitleBoundaryScore(
        source.slice(0, offset),
        source.slice(offset + match.length)
      );
      if (score >= 0) {
        addSubtitleSplitCandidate(candidates, offset, Math.max(10, score), source.length);
      }
      return match;
    });
    source.replace(/[,，:：、]/g, (match, offset) => {
      const boundary = offset + match.length;
      const score = Math.max(62, getSoftSubtitleBoundaryScore(source.slice(0, boundary), source.slice(boundary)));
      addSubtitleSplitCandidate(candidates, boundary, score, source.length);
      return match;
    });
    COMPACT_SCRIPT_CLAUSE_OPENERS.forEach((phrase) => {
      let offset = source.indexOf(phrase);
      while (offset >= 0) {
        addSubtitleSplitCandidate(candidates, offset, 92, source.length);
        offset = source.indexOf(phrase, offset + phrase.length);
      }
    });
    COMPACT_SCRIPT_LIST_OPENERS.forEach((phrase) => {
      let offset = source.indexOf(phrase);
      while (offset >= 0) {
        addSubtitleSplitCandidate(candidates, offset, 94, source.length);
        offset = source.indexOf(phrase, offset + phrase.length);
      }
    });
    SPACE_SCRIPT_CORRECTION_LIST_OPENERS.forEach((phrase) => {
      let searchFrom = 0;
      const lowerSource = source.toLocaleLowerCase();
      while (searchFrom < source.length) {
        const offset = lowerSource.indexOf(phrase, searchFrom);
        if (offset < 0) {
          break;
        }
        addSubtitleSplitCandidate(candidates, offset, 98, source.length);
        searchFrom = offset + phrase.length;
      }
    });
    return Array.from(candidates.entries())
      .map(([index, score]) => ({ index, score }))
      .sort((left, right) => left.index - right.index);
  }

  function getSubtitleSplitBoundaryIndex(candidate) {
    if (typeof candidate === "number") {
      return candidate;
    }
    return Number(candidate && (candidate.index !== undefined ? candidate.index : candidate.boundary));
  }

  function getSubtitleSplitBoundaryScore(candidate) {
    if (typeof candidate === "number") {
      return 10;
    }
    const score = Number(candidate && candidate.score);
    return Number.isFinite(score) ? score : 10;
  }

  function chooseReadableSubtitleSplitBoundary(boundaries, ideal, min, max) {
    const lower = Number(min);
    const upper = Number(max);
    const target = Number(ideal);
    const candidates = (Array.isArray(boundaries) ? boundaries : [])
      .map((candidate) => ({
        index: getSubtitleSplitBoundaryIndex(candidate),
        score: getSubtitleSplitBoundaryScore(candidate)
      }))
      .filter((candidate) => (
        Number.isFinite(candidate.index)
          && candidate.index >= lower
          && candidate.index <= upper
      ));
    if (!candidates.length) {
      return Math.max(lower, Math.min(upper, target));
    }
    const span = Math.max(1, upper - lower);
    const ranked = candidates.reduce((best, candidate) => {
      const distance = Math.abs(candidate.index - target);
      const rank = candidate.score - (distance / span) * 48;
      if (!best || rank > best.rank || (rank === best.rank && distance < best.distance)) {
        return { index: candidate.index, distance, rank };
      }
      return best;
    }, null);
    return ranked ? ranked.index : candidates[0].index;
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

  function isYouTubeAutoGeneratedTrack(track) {
    const value = track && typeof track === "object" ? track : {};
    const kind = String(value.kind || "").trim().toLowerCase();
    const vssId = String(value.vssId || value.vss_id || "").trim().toLowerCase();
    const name = String(value.name || value.label || "").trim().toLowerCase();
    const metadata = getYouTubeTimedTextMetadata(value.baseUrl || value.url || "");
    return kind === "asr"
      || String(metadata && metadata.kind || "").trim().toLowerCase() === "asr"
      || vssId.startsWith("a.")
      || /\bauto(?:matically)?[-\s]?generated\b|\bautomatic captions?\b/.test(name);
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
      const normalized = {
        id: String(value.id || index),
        start,
        end,
        text
      };
      if (value.forceBoundaryAfter) {
        normalized.forceBoundaryAfter = true;
      }
      if (value.hasSegmentTiming) {
        normalized.hasSegmentTiming = true;
      }
      return normalized;
    }).filter(Boolean).sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function readJson3SegmentOffsetMs(segment) {
    const offset = Number(segment && segment.tOffsetMs);
    return Number.isFinite(offset) && offset >= 0 ? offset : null;
  }

  function readJson3SegmentText(segment) {
    return String(segment && segment.utf8 || "");
  }

  function getJson3EventDurationMs(event, segments) {
    const duration = Number(event && event.dDurationMs);
    const maxOffset = (Array.isArray(segments) ? segments : [])
      .map(readJson3SegmentOffsetMs)
      .filter((offset) => offset !== null)
      .reduce((max, offset) => Math.max(max, offset), 0);
    if (Number.isFinite(duration) && duration > maxOffset) {
      return duration;
    }
    return maxOffset > 0 ? maxOffset + 2000 : 2000;
  }

  function getJson3SegmentRangeText(segments, startIndex, endIndex) {
    return normalizeCueText((Array.isArray(segments) ? segments : [])
      .slice(Math.max(0, startIndex), Math.max(0, endIndex) + 1)
      .map(readJson3SegmentText)
      .join(""));
  }

  function getJson3TimedSegmentRanges(segments, durationMs) {
    const timedSegments = (Array.isArray(segments) ? segments : [])
      .map((segment, index) => ({
        index,
        offset: readJson3SegmentOffsetMs(segment)
      }))
      .filter((segment) => segment.offset !== null)
      .sort((left, right) => left.index - right.index);
    if (timedSegments.length < 2) {
      return [];
    }
    return timedSegments.map((segment, timedIndex) => {
      const next = timedSegments[timedIndex + 1];
      const startIndex = timedIndex === 0 ? 0 : segment.index;
      const endIndex = next ? next.index - 1 : segments.length - 1;
      const startOffset = Math.max(0, segment.offset);
      const endOffset = Math.max(startOffset + 50, next ? next.offset : durationMs);
      return {
        startIndex,
        endIndex,
        startOffset,
        endOffset
      };
    });
  }

  function splitJson3SegmentsByTiming(event, index) {
    const startMs = Number(event && event.tStartMs);
    const segments = Array.isArray(event && event.segs) ? event.segs : [];
    const fullText = normalizeCueText(segments.map(readJson3SegmentText).join(""));
    const durationMs = getJson3EventDurationMs(event, segments);
    const baseId = String(event && event.id || index);
    const baseCue = {
      id: baseId,
      start: Number.isFinite(startMs) ? startMs / 1000 : NaN,
      end: Number.isFinite(startMs) ? (startMs + durationMs) / 1000 : NaN,
      text: fullText,
      hasSegmentTiming: segments.some((segment) => readJson3SegmentOffsetMs(segment) !== null)
    };
    const ranges = getJson3TimedSegmentRanges(segments, durationMs);
    if (!fullText || !ranges.length) {
      return [baseCue];
    }

    return ranges.map((range, rangeIndex) => ({
      id: `${baseId}:seg:${rangeIndex}`,
      start: Number.isFinite(startMs) ? (startMs + range.startOffset) / 1000 : NaN,
      end: Number.isFinite(startMs) ? (startMs + range.endOffset) / 1000 : NaN,
      text: getJson3SegmentRangeText(segments, range.startIndex, range.endIndex),
      hasSegmentTiming: true
    }));
  }

  function parseYouTubeJson3(body) {
    const json = typeof body === "string"
      ? JSON.parse(String(body || "").replace(/^\)\]\}'\s*/, "").trim())
      : body;
    const events = json && Array.isArray(json.events)
      ? json.events
      : findJson3Events(json);
    return normalizeCueList(events.flatMap(splitJson3SegmentsByTiming));
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

  function parseTtmlTimestamp(value) {
    const source = String(value || "").trim();
    if (!source) {
      return NaN;
    }
    const clock = source.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?$/);
    if (clock) {
      const hours = Number(clock[1]);
      const minutes = Number(clock[2]);
      const seconds = Number(clock[3]);
      const millis = Number(String(clock[4] || "0").padEnd(3, "0"));
      return hours * 3600 + minutes * 60 + seconds + millis / 1000;
    }
    const seconds = source.match(/^(\d+(?:\.\d+)?)s$/i);
    if (seconds) {
      return Number(seconds[1]);
    }
    const millis = source.match(/^(\d+(?:\.\d+)?)ms$/i);
    if (millis) {
      return Number(millis[1]) / 1000;
    }
    return NaN;
  }

  function parseTtmlXml(body) {
    const source = String(body || "");
    const cues = [];
    const pattern = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
    let match;
    while ((match = pattern.exec(source))) {
      const attrs = parseAttributes(match[1]);
      const start = parseTtmlTimestamp(attrs.begin || attrs.start);
      const rawEnd = parseTtmlTimestamp(attrs.end);
      const duration = parseTtmlTimestamp(attrs.dur);
      const end = Number.isFinite(rawEnd)
        ? rawEnd
        : (Number.isFinite(duration) ? start + duration : NaN);
      const text = normalizeCueText(match[2]
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, ""));
      if (Number.isFinite(start) && Number.isFinite(end) && end > start && text) {
        cues.push({
          id: String(cues.length),
          start,
          end,
          text
        });
      }
    }
    return normalizeCueList(cues);
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

  function parseSrtTimestamp(value) {
    const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
    if (!match) {
      return NaN;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const millis = Number(match[4].padEnd(3, "0"));
    if (![hours, minutes, seconds, millis].every(Number.isFinite)) {
      return NaN;
    }
    return hours * 3600 + minutes * 60 + seconds + millis / 1000;
  }

  function parseSubRip(body) {
    const source = String(body || "").replace(/\r/g, "").trim();
    if (!source) {
      return [];
    }
    const cues = [];
    source.split(/\n{2,}/).forEach((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      if (!lines.length) {
        return;
      }
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) {
        return;
      }
      const timingParts = lines[timingIndex].split("-->");
      const start = parseSrtTimestamp(timingParts[0]);
      const end = parseSrtTimestamp(timingParts[1]);
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
    const ttmlCues = parseTtmlXml(source);
    if (ttmlCues.length) {
      return ttmlCues;
    }
    return parseYouTubeSrv3Xml(source);
  }

  function parseGenericSubtitleText(body, contentType, url) {
    const source = String(body || "").trim();
    const hint = `${contentType || ""} ${url || ""}`.toLowerCase();
    if (!source) {
      return [];
    }
    if (hint.includes("srt") || /^\d+\s*\n\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/m.test(source)) {
      const cues = parseSubRip(source);
      if (cues.length) {
        return cues;
      }
    }
    return parseYouTubeTimedText(source, contentType, url);
  }

  function parseHlsAttributeList(raw) {
    const attrs = {};
    const source = String(raw || "");
    let index = 0;
    while (index < source.length) {
      while (index < source.length && /[\s,]/.test(source.charAt(index))) {
        index += 1;
      }
      const keyStart = index;
      while (index < source.length && /[A-Za-z0-9-]/.test(source.charAt(index))) {
        index += 1;
      }
      const key = source.slice(keyStart, index);
      if (!key || source.charAt(index) !== "=") {
        index += 1;
        continue;
      }
      index += 1;
      let value = "";
      if (source.charAt(index) === "\"") {
        index += 1;
        const valueStart = index;
        while (index < source.length && source.charAt(index) !== "\"") {
          index += 1;
        }
        value = source.slice(valueStart, index);
        index += 1;
      } else {
        const valueStart = index;
        while (index < source.length && source.charAt(index) !== ",") {
          index += 1;
        }
        value = source.slice(valueStart, index).trim();
      }
      attrs[key.toUpperCase()] = value;
    }
    return attrs;
  }

  function resolveUrl(rawUrl, baseUrl) {
    try {
      return new URL(String(rawUrl || "").trim(), baseUrl || globalThis.location && globalThis.location.href || "").toString();
    } catch (_) {
      return "";
    }
  }

  function extractM3u8SubtitlePlaylists(body, baseUrl) {
    const source = String(body || "");
    const playlists = [];
    source.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!/^#EXT-X-MEDIA:/i.test(trimmed) || !/TYPE=SUBTITLES/i.test(trimmed)) {
        return;
      }
      const attrs = parseHlsAttributeList(trimmed.replace(/^#EXT-X-MEDIA:/i, ""));
      const url = resolveUrl(attrs.URI || "", baseUrl);
      if (!url) {
        return;
      }
      playlists.push({
        url,
        languageCode: attrs.LANGUAGE || "",
        name: attrs.NAME || attrs.GROUP_ID || ""
      });
    });
    return playlists;
  }

  function extractM3u8MediaSegments(body, baseUrl) {
    const source = String(body || "");
    const segments = [];
    let pendingDuration = 0;
    let offset = 0;
    source.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      if (/^#EXTINF:/i.test(trimmed)) {
        const duration = Number(trimmed.replace(/^#EXTINF:/i, "").split(",")[0]);
        pendingDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
        return;
      }
      if (trimmed.charAt(0) === "#") {
        return;
      }
      const url = resolveUrl(trimmed, baseUrl);
      if (!url) {
        return;
      }
      segments.push({ url, offset, duration: pendingDuration });
      offset += pendingDuration;
      pendingDuration = 0;
    });
    return segments;
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

  function normalizeChoice(value, allowed, fallback) {
    const normalized = String(value || "").trim();
    return Array.isArray(allowed) && allowed.includes(normalized) ? normalized : fallback;
  }

  function getLearningLevels(kind) {
    const levels = namespace.constants && namespace.constants.videoSubtitleLearningLevels || {};
    return Array.isArray(levels[kind]) ? levels[kind] : [];
  }

  function normalizeSubtitleLearningLevel(kind, value, fallback) {
    return normalizeChoice(value, getLearningLevels(kind), fallback);
  }

  function normalizeSubtitleLearningMaxItems(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return 4;
    }
    return Math.max(1, Math.min(8, Math.round(number)));
  }

  function normalizeSubtitleAnnotationTypes(value) {
    const typeOptions = namespace.constants && namespace.constants.videoSubtitleAnnotationTypes || [];
    const allowed = new Set(typeOptions.map((item) => item.id));
    const source = Array.isArray(value) ? value : [value];
    const normalized = source
      .map((item) => String(item || "").trim())
      .filter((item) => allowed.has(item));
    if (!normalized.length || normalized.includes("any")) {
      return ["any"];
    }
    return Array.from(new Set(normalized));
  }

  function resolveSubtitleLearningProfile(settings, sourceLanguage) {
    const cfg = settings || {};
    const rawSourceLanguage = String(sourceLanguage || "").trim();
    const annotationTypes = normalizeSubtitleAnnotationTypes(cfg.videoBilingualSubtitlesLearningAnnotationTypes);
    const baseLanguage = getBaseLanguage(rawSourceLanguage || "en");
    if (baseLanguage === "ja") {
      return {
        sourceLanguage: rawSourceLanguage || "ja",
        baseLanguage,
        levelSystem: "JLPT",
        level: normalizeSubtitleLearningLevel("japanese", cfg.videoBilingualSubtitlesLearningJapaneseLevel, "N3"),
        maxItems: normalizeSubtitleLearningMaxItems(cfg.videoBilingualSubtitlesLearningMaxItems),
        annotationTypes
      };
    }
    if (baseLanguage === "zh") {
      return {
        sourceLanguage: rawSourceLanguage || "zh",
        baseLanguage,
        levelSystem: "HSK",
        level: normalizeSubtitleLearningLevel("chinese", cfg.videoBilingualSubtitlesLearningChineseLevel, "HSK3"),
        maxItems: normalizeSubtitleLearningMaxItems(cfg.videoBilingualSubtitlesLearningMaxItems),
        annotationTypes
      };
    }
    return {
      sourceLanguage: rawSourceLanguage || "en",
      baseLanguage: baseLanguage || "en",
      levelSystem: "CEFR",
      level: normalizeSubtitleLearningLevel("english", cfg.videoBilingualSubtitlesLearningEnglishLevel, "B1"),
      maxItems: normalizeSubtitleLearningMaxItems(cfg.videoBilingualSubtitlesLearningMaxItems),
      annotationTypes
    };
  }

  function cleanAnnotationField(value, maxLength) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
      .trim()
      .slice(0, maxLength || 160)
      .trim();
  }

  function stripJsonCodeFence(text) {
    const source = String(text || "").trim();
    const match = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return match ? match[1].trim() : source;
  }

  function extractBalancedJsonValue(text, startIndex) {
    const source = String(text || "");
    const opener = source.charAt(startIndex);
    const closer = opener === "{" ? "}" : (opener === "[" ? "]" : "");
    if (!closer) {
      return "";
    }
    const stack = [closer];
    let inString = false;
    let escaped = false;
    for (let index = startIndex + 1; index < source.length; index += 1) {
      const ch = source.charAt(index);
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
      } else if (ch === "{" || ch === "[") {
        stack.push(ch === "{" ? "}" : "]");
      } else if (ch === "}" || ch === "]") {
        if (stack.pop() !== ch) {
          return "";
        }
        if (!stack.length) {
          return source.slice(startIndex, index + 1);
        }
      }
    }
    return "";
  }

  function parseJsonFromModelText(text) {
    const source = stripJsonCodeFence(text);
    const candidates = [source];
    const firstJsonIndex = source.search(/[\[{]/);
    if (firstJsonIndex >= 0) {
      const balanced = extractBalancedJsonValue(source, firstJsonIndex);
      if (balanced) {
        candidates.push(balanced);
      }
    }
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch (_) {}
    }
    return null;
  }

  function getAnnotationArray(parsed) {
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (!parsed || typeof parsed !== "object") {
      return [];
    }
    const keys = ["items", "annotations", "terms", "words", "phrases"];
    for (const key of keys) {
      if (Array.isArray(parsed[key])) {
        return parsed[key];
      }
    }
    return parsed.term || parsed.word || parsed.phrase ? [parsed] : [];
  }

  function parseFallbackAnnotationLine(line) {
    const cleaned = cleanAnnotationField(line, 260)
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+[.)]\s+/, "");
    const match = cleaned.match(/^(.{1,80}?)(?:(?:\s*(?:=>|->|=|:)\s*)|\s+-\s+)(.{1,180})$/);
    if (!match) {
      return null;
    }
    return {
      term: cleanAnnotationField(match[1], 80),
      meaning: cleanAnnotationField(match[2], 180),
      note: ""
    };
  }

  function normalizeAnnotationItem(item) {
    if (typeof item === "string") {
      return parseFallbackAnnotationLine(item);
    }
    if (!item || typeof item !== "object") {
      return null;
    }
    const term = cleanAnnotationField(
      item.term || item.word || item.phrase || item.source || item.text || item.expression,
      80
    );
    const meaning = cleanAnnotationField(
      item.meaning || item.translation || item.explanation || item.gloss || item.target || item.definition,
      180
    );
    const note = cleanAnnotationField(item.note || item.usage || item.reason || item.hint, 100);
    if (!term || !meaning) {
      return null;
    }
    return { term, meaning, note };
  }

  function dedupeAnnotations(annotations, maxItems) {
    const seen = new Set();
    const limit = normalizeSubtitleLearningMaxItems(maxItems);
    const result = [];
    (Array.isArray(annotations) ? annotations : []).forEach((item) => {
      const normalized = normalizeAnnotationItem(item);
      if (!normalized) {
        return;
      }
      const key = normalized.term.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      result.push(normalized);
    });
    return result.slice(0, limit);
  }

  function parseSubtitleAnnotationResponse(text, options) {
    const opts = options || {};
    const parsed = parseJsonFromModelText(text);
    if (parsed !== null) {
      return dedupeAnnotations(getAnnotationArray(parsed), opts.maxItems);
    }
    const fallbackItems = String(text || "")
      .split(/\n+/)
      .map(parseFallbackAnnotationLine)
      .filter(Boolean);
    return dedupeAnnotations(fallbackItems, opts.maxItems);
  }

  function formatSubtitleAnnotations(annotations, options) {
    const opts = options || {};
    return dedupeAnnotations(annotations, opts.maxItems)
      .map((item) => {
        const note = item.note ? ` (${item.note})` : "";
        return `${item.term} = ${item.meaning}${note}`;
      })
      .join(" | ");
  }

  namespace.videoSubtitleUtils = {
    decodeHtmlEntities,
    normalizeCueText,
    splitTextBySentenceBoundaries,
    getReadableSubtitleSplitBoundaries,
    chooseReadableSubtitleSplitBoundary,
    getSoftSubtitleBoundaryScore,
    extractCaptionTracks,
    isYouTubeAutoGeneratedTrack,
    parseYouTubePlayerResponseFromText,
    withYouTubeTimedTextFormat,
    getYouTubeTimedTextMetadata,
    parseYouTubeTimedTextCapture,
    normalizeCueList,
    parseYouTubeTimedText,
    parseGenericSubtitleText,
    extractM3u8SubtitlePlaylists,
    extractM3u8MediaSegments,
    resolveSubtitleTarget,
    normalizeSubtitleLearningLevel,
    normalizeSubtitleLearningMaxItems,
    normalizeSubtitleAnnotationTypes,
    resolveSubtitleLearningProfile,
    parseSubtitleAnnotationResponse,
    formatSubtitleAnnotations
  };
}(globalThis));
