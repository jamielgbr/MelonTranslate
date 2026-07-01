(function initVideoSubtitleTranslator(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const messageTypes = namespace.messages.types;
  const utils = namespace.videoSubtitleUtils;

  const STYLE_ID = "melontranslate-video-subtitle-style";
  const BUTTON_CLASS = "mt-video-subtitle-button";
  const OVERLAY_CLASS = "mt-video-subtitle-overlay";
  const HTML5_OVERLAY_CLASS = "mt-video-subtitle-overlay-html5";
  const BATCH_SIZE = 1;
  const DOM_CAPTION_STABLE_MS = 520;
  const DOM_CAPTION_SENTENCE_STABLE_MS = 180;
  const DOM_CAPTION_HOLD_MS = 1400;
  const DOM_CAPTION_MIN_INCREMENT_CHARS = 24;
  const DOM_CAPTION_MAX_COMMIT_GAP_MS = 2800;
  const DOM_CAPTION_FORCE_COMMIT_MS = 1100;
  const DOM_CAPTION_FIRST_COMMIT_MS = 700;
  const DOM_CAPTION_FIRST_COMMIT_CHARS = 28;
  const DOM_CAPTION_SEEK_RESET_SECONDS = 2.5;
  const SUBTITLE_LOOKAHEAD_SECONDS = 35;
  const SUBTITLE_PAUSED_LOOKAHEAD_SECONDS = 6;
  const SUBTITLE_QUEUE_REFRESH_SECONDS = 8;
  const ACTIVE_CUE_LEAD_SECONDS = 0.2;
  const ACTIVE_CUE_TRAIL_SECONDS = 0.1;
  const YOUTUBE_CONTEXT_WAIT_MS = 4500;
  const YOUTUBE_CONTEXT_POLL_MS = 120;
  const MERGED_CUE_SOFT_DURATION_SECONDS = 8;
  const MERGED_CUE_SOFT_CHARS = 180;
  const MERGED_CUE_HARD_DURATION_SECONDS = 22;
  const MERGED_CUE_HARD_CHARS = 420;
  const MERGED_CUE_WEAK_BOUNDARY_MIN_DURATION_SECONDS = 2.5;
  const MERGED_CUE_WEAK_BOUNDARY_MIN_CHARS = 48;
  const MERGED_CUE_MAX_GAP_SECONDS = 1.1;
  const INTERNAL_SENTENCE_SPLIT_MIN_CHARS = 24;
  const YOUTUBE_BRIDGE_PAGE_SOURCE = "melontranslate-youtube-subtitle-bridge";
  const YOUTUBE_BRIDGE_CONTENT_SOURCE = "melontranslate-youtube-subtitle-content";
  const YOUTUBE_BRIDGE_REQUEST_SNAPSHOT = "REQUEST_TIMEDTEXT_SNAPSHOT";
  const YOUTUBE_BRIDGE_CAPTURED = "CAPTURED_TIMEDTEXT";
  const YOUTUBE_BRIDGE_SNAPSHOT = "TIMEDTEXT_SNAPSHOT";

  const state = {
    getSettings: null,
    settings: null,
    storageListenerAttached: false,
    youtubeBridgeListenerAttached: false,
    youtubeNavigationListenerAttached: false,
    mutationObserver: null,
    refreshTimer: 0,
    urlTimer: 0,
    lastUrl: "",
    generation: 0,
    active: false,
    manualActive: false,
    status: "off",
    error: "",
    video: null,
    videoId: "",
    track: null,
    cues: [],
    targetLanguage: "",
    sourceLanguage: "",
    subtitleContext: "",
    subtitleMode: "",
    translations: new Map(),
    queuedIds: [],
    queuedIdSet: new Set(),
    pendingIds: new Set(),
    failedIds: new Set(),
    activeBatches: 0,
    renderTimer: 0,
    overlay: null,
    renderedOverlayMode: "",
    renderedOverlaySourceText: "",
    renderedOverlayTargetText: "",
    renderedOverlayNextText: "",
    renderedOverlayPlainText: "",
    renderedOverlayHidden: null,
    button: null,
    wordLookupTimer: 0,
    wordLookupRequestId: 0,
    wordLookupActiveElement: null,
    wordLookupPopup: null,
    wordLookupCache: new Map(),
    currentCueKey: "",
    currentDomSubtitleId: "",
    lastQueueRefreshMediaTime: null,
    lastVideoPaused: null,
    lastVideoTime: null,
    domCaptionText: "",
    domCaptionStartedAtMs: 0,
    domCaptionChangedAtMs: 0,
    domCaptionLastSeenAtMs: 0,
    domCommittedText: "",
    domCommittedId: "",
    domCommittedAtMs: 0,
    domSourceById: new Map(),
    youtubeTimedTextEntries: [],
    autoAttemptKey: ""
  };

  function isSupportedPage() {
    return window.location.protocol === "http:" || window.location.protocol === "https:";
  }

  function isYouTubePage() {
    const host = window.location.hostname || "";
    const pu = namespace.pageUtils;
    return !!(pu && pu.hostMatchesRule(host, "youtube.com"));
  }

  function normalizeSettings(settings) {
    const cfg = settings || {};
    const rawMaxConcurrent = Number(cfg.videoBilingualSubtitlesMaxConcurrentBatches);
    const maxConcurrent = Number.isFinite(rawMaxConcurrent)
      ? Math.max(1, Math.min(4, Math.round(rawMaxConcurrent)))
      : 2;
    const rawDisplayMode = String(cfg.videoBilingualSubtitlesMode || "").trim();
    const displayMode = rawDisplayMode === "learning" || rawDisplayMode === "manual"
      ? rawDisplayMode
      : "translation";
    const rawMaxLearningItems = Number(cfg.videoBilingualSubtitlesLearningMaxItems);
    const maxLearningItems = Number.isFinite(rawMaxLearningItems)
      ? Math.max(1, Math.min(8, Math.round(rawMaxLearningItems)))
      : 4;
    const annotationTypes = utils && typeof utils.normalizeSubtitleAnnotationTypes === "function"
      ? utils.normalizeSubtitleAnnotationTypes(cfg.videoBilingualSubtitlesLearningAnnotationTypes)
      : ["any"];
    return Object.assign({}, cfg, {
      videoBilingualSubtitlesAutoTranslate: !!cfg.videoBilingualSubtitlesAutoTranslate,
      videoBilingualSubtitlesMode: displayMode,
      videoBilingualSubtitlesLearningEnglishLevel: String(cfg.videoBilingualSubtitlesLearningEnglishLevel || "B1"),
      videoBilingualSubtitlesLearningJapaneseLevel: String(cfg.videoBilingualSubtitlesLearningJapaneseLevel || "N3"),
      videoBilingualSubtitlesLearningChineseLevel: String(cfg.videoBilingualSubtitlesLearningChineseLevel || "HSK3"),
      videoBilingualSubtitlesLearningAnnotationTypes: annotationTypes,
      videoBilingualSubtitlesLearningMaxItems: maxLearningItems,
      videoBilingualSubtitlesWordLookupEnabled: cfg.videoBilingualSubtitlesWordLookupEnabled !== false,
      videoBilingualSubtitlesTopicContextEnabled: !!cfg.videoBilingualSubtitlesTopicContextEnabled,
      videoBilingualSubtitlesSkipDefaultTargetSource: cfg.videoBilingualSubtitlesSkipDefaultTargetSource !== false,
      videoBilingualSubtitlesShowPlayerButton: cfg.videoBilingualSubtitlesShowPlayerButton !== false,
      videoBilingualSubtitlesMaxConcurrentBatches: maxConcurrent
    });
  }

  function isLearningSubtitleMode() {
    return !!(state.settings && state.settings.videoBilingualSubtitlesMode === "learning");
  }

  function isManualWordLookupMode() {
    return !!(state.settings && state.settings.videoBilingualSubtitlesMode === "manual");
  }

  function isWordLookupEnabled() {
    return !!(state.settings && state.settings.videoBilingualSubtitlesWordLookupEnabled !== false);
  }

  function getSubtitleResultSettingsKey(settings) {
    const cfg = settings || {};
    return [
      cfg.videoBilingualSubtitlesMode || "translation",
      cfg.videoBilingualSubtitlesLearningEnglishLevel || "B1",
      cfg.videoBilingualSubtitlesLearningJapaneseLevel || "N3",
      cfg.videoBilingualSubtitlesLearningChineseLevel || "HSK3",
      (cfg.videoBilingualSubtitlesLearningAnnotationTypes || ["any"]).join(","),
      cfg.videoBilingualSubtitlesLearningMaxItems || 4,
      cfg.videoBilingualSubtitlesTopicContextEnabled ? "topic" : "no-topic"
    ].join("\0");
  }

  async function loadSettings() {
    if (!state.getSettings) {
      return normalizeSettings({});
    }
    state.settings = normalizeSettings(await state.getSettings());
    return state.settings;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${BUTTON_CLASS}.ytp-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        min-width: 40px;
        color: rgba(255, 255, 255, 0.86);
        font: 700 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
      }
      .${BUTTON_CLASS}.ytp-button::before {
        content: "";
      }
      .${BUTTON_CLASS} .mt-video-subtitle-button-label {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 18px;
        border: 1.5px solid currentColor;
        border-radius: 4px;
        font: 800 10px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        letter-spacing: 0 !important;
      }
      .${BUTTON_CLASS}.ytp-button.is-on {
        color: #9ee7d5;
      }
      .${BUTTON_CLASS}.ytp-button.is-loading {
        color: #fde68a;
      }
      .${BUTTON_CLASS}.ytp-button.is-error {
        color: #fecaca;
      }
      .${OVERLAY_CLASS} {
        position: absolute;
        left: 50%;
        bottom: 7.5%;
        z-index: 65;
        width: min(86%, 960px);
        transform: translateX(-50%);
        pointer-events: none;
        text-align: center;
        color: #fff;
        font: 600 clamp(15px, 2.2vw, 28px)/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        text-shadow: 0 2px 3px rgba(0, 0, 0, 0.95), 0 0 8px rgba(0, 0, 0, 0.75);
        white-space: pre-line;
        overflow-wrap: anywhere;
      }
      .${OVERLAY_CLASS}.is-takeover {
        bottom: 2.4%;
        display: flex;
        justify-content: center;
        font-weight: 400;
        text-shadow: none;
      }
      .${OVERLAY_CLASS} .mt-video-subtitle-lines {
        display: inline-flex;
        max-width: 100%;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .${OVERLAY_CLASS} .mt-video-subtitle-cue {
        display: inline;
        max-width: 100%;
        border-radius: 2px;
        padding: 1px 6px 2px;
        background: rgba(8, 8, 8, 0.75);
        color: #fff;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
        overflow-wrap: anywhere;
      }
      .${OVERLAY_CLASS} .mt-video-subtitle-cue.source-cue.is-word-lookup {
        pointer-events: auto;
      }
      .${OVERLAY_CLASS} .mt-video-subtitle-word {
        display: inline;
        border: 1px solid transparent;
        border-radius: 3px;
        padding: 0 1px;
        margin: 0 1px;
        cursor: default;
        pointer-events: auto;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
      }
      .${OVERLAY_CLASS} .mt-video-subtitle-word.is-selected {
        border-color: rgba(255, 255, 255, 0.86);
        background: rgba(255, 255, 255, 0.08);
      }
      .${OVERLAY_CLASS} .mt-video-subtitle-word.is-loading {
        animation: mt-video-subtitle-word-rainbow 0.72s linear infinite;
      }
      @keyframes mt-video-subtitle-word-rainbow {
        0% { border-color: #ef4444; box-shadow: 0 0 5px rgba(239, 68, 68, 0.9); }
        16% { border-color: #f97316; box-shadow: 0 0 5px rgba(249, 115, 22, 0.9); }
        33% { border-color: #eab308; box-shadow: 0 0 5px rgba(234, 179, 8, 0.9); }
        50% { border-color: #22c55e; box-shadow: 0 0 5px rgba(34, 197, 94, 0.9); }
        66% { border-color: #06b6d4; box-shadow: 0 0 5px rgba(6, 182, 212, 0.9); }
        83% { border-color: #6366f1; box-shadow: 0 0 5px rgba(99, 102, 241, 0.9); }
        100% { border-color: #ec4899; box-shadow: 0 0 5px rgba(236, 72, 153, 0.9); }
      }
      .mt-video-subtitle-word-popup {
        position: fixed;
        z-index: 2147483647;
        max-width: min(320px, calc(100vw - 24px));
        padding: 8px 10px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 8px;
        background: rgba(12, 12, 12, 0.94);
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.38);
        color: #fff;
        font: 500 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        pointer-events: none;
      }
      .mt-video-subtitle-word-popup.is-hidden {
        display: none;
      }
      .mt-video-subtitle-word-popup .mt-word-source {
        color: rgba(255, 255, 255, 0.72);
        font-size: 11px;
        margin-bottom: 3px;
      }
      .mt-video-subtitle-word-popup .mt-word-target {
        color: #fff;
        overflow-wrap: anywhere;
      }
      .${OVERLAY_CLASS}.is-hidden {
        display: none;
      }
      .mt-video-subtitle-takeover .ytp-caption-window-container {
        opacity: 0 !important;
      }
      .${HTML5_OVERLAY_CLASS} {
        position: fixed;
        z-index: 2147483646;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function setStatus(status, error) {
    state.status = status;
    state.error = String(error || "");
    updateButtonState();
  }

  function updateButtonState() {
    const button = state.button;
    if (!button) {
      return;
    }
    button.classList.toggle("is-on", state.status === "on");
    button.classList.toggle("is-loading", state.status === "loading");
    button.classList.toggle("is-error", state.status === "error");
    const title = state.status === "on"
      ? "Turn off bilingual subtitles"
      : state.status === "loading"
        ? "Loading bilingual subtitles"
        : state.status === "error"
          ? (state.error || "Could not load bilingual subtitles")
          : "Turn on bilingual subtitles";
    button.title = title;
    button.setAttribute("aria-label", title);
  }

  function ensureYouTubeButton() {
    const settings = state.settings || {};
    if (!isYouTubePage() || settings.videoBilingualSubtitlesShowPlayerButton === false) {
      removeButton();
      return;
    }
    const player = getYouTubePlayer();
    const controls = player && player.querySelector(".ytp-right-controls")
      || document.querySelector(".html5-video-player .ytp-right-controls")
      || document.querySelector(".ytp-right-controls");
    if (!controls) {
      return;
    }
    if (state.button && state.button.isConnected && state.button.parentElement === controls) {
      updateButtonState();
      return;
    }
    if (state.button && state.button.isConnected) {
      state.button.remove();
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ytp-button ${BUTTON_CLASS}`;
    const label = document.createElement("span");
    label.className = "mt-video-subtitle-button-label";
    label.textContent = "MT";
    button.appendChild(label);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFromManual().catch((error) => {
        setStatus("error", error && error.message ? error.message : "Could not toggle bilingual subtitles.");
      });
    });
    controls.insertBefore(button, controls.firstChild || null);
    state.button = button;
    updateButtonState();
  }

  function removeButton() {
    if (state.button && state.button.isConnected) {
      state.button.remove();
    }
    state.button = null;
  }

  function findVideo() {
    if (isYouTubePage()) {
      return chooseBestVideo(Array.from(document.querySelectorAll("video.html5-main-video, video")));
    }
    const videos = Array.from(document.querySelectorAll("video"));
    return chooseBestVideo(videos);
  }

  function getVisibleArea(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") {
      return 0;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return 0;
    }
    const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
    if (style && (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0)) {
      return 0;
    }
    return rect.width * rect.height;
  }

  function chooseBestVideo(videos) {
    return videos.sort((a, b) => {
      const score = (video) => {
        if (!video) {
          return 0;
        }
        const playerBonus = video.closest && video.closest("#movie_player, .html5-video-player") ? 1000000000 : 0;
        const mainBonus = video.classList && video.classList.contains("html5-main-video") ? 500000000 : 0;
        const playingBonus = !video.paused ? 1000000 : 0;
        return playerBonus + mainBonus + playingBonus + getVisibleArea(video);
      };
      return score(b) - score(a);
    })[0] || null;
  }

  function getYouTubePlayer() {
    const video = findVideo();
    if (video) {
      const owner = video.closest("#movie_player, .html5-video-player");
      if (owner) {
        return owner;
      }
    }
    const players = Array.from(document.querySelectorAll("#movie_player, .html5-video-player"));
    return players.sort((a, b) => getVisibleArea(b) - getVisibleArea(a))[0] || null;
  }

  function readPlayerResponseFromPlayer() {
    const player = getYouTubePlayer();
    if (!player || typeof player.getPlayerResponse !== "function") {
      return null;
    }
    try {
      const response = player.getPlayerResponse();
      return response && typeof response === "object" ? response : null;
    } catch (_) {
      return null;
    }
  }

  function readPlayerResponseFromScripts() {
    const scripts = Array.from(document.scripts || []).reverse();
    for (const script of scripts.slice(0, 80)) {
      const text = script.textContent || "";
      if (!text.includes("captionTracks") && !text.includes("ytInitialPlayerResponse")) {
        continue;
      }
      const parsed = utils.parseYouTubePlayerResponseFromText(text);
      if (parsed) {
        return parsed;
      }
    }
    return null;
  }

  function readYouTubePlayerResponse() {
    return readPlayerResponseFromPlayer() || readPlayerResponseFromScripts();
  }

  function getCurrentYouTubeTrackHint() {
    const player = getYouTubePlayer();
    if (!player || typeof player.getOption !== "function") {
      return null;
    }
    try {
      const track = player.getOption("captions", "track");
      return track && typeof track === "object" ? track : null;
    } catch (_) {
      return null;
    }
  }

  function chooseYouTubeTrack(tracks) {
    const list = Array.isArray(tracks) ? tracks : [];
    const hint = getCurrentYouTubeTrackHint();
    if (hint) {
      const languageCode = String(hint.languageCode || hint.langCode || "").trim();
      const vssId = String(hint.vssId || hint.vss_id || "").trim();
      const match = list.find((track) => (
        (vssId && track.vssId === vssId)
          || (languageCode && track.languageCode === languageCode)
      ));
      if (match) {
        return match;
      }
    }
    return list[0] || null;
  }

  function getYouTubeTrackVideoId(track) {
    if (!track || !utils || typeof utils.getYouTubeTimedTextMetadata !== "function") {
      return "";
    }
    const metadata = utils.getYouTubeTimedTextMetadata(track.baseUrl);
    return metadata ? String(metadata.videoId || "") : "";
  }

  function isYouTubeTrackForVideo(track, videoId) {
    const currentVideoId = String(videoId || "");
    const trackVideoId = getYouTubeTrackVideoId(track);
    return !currentVideoId || !trackVideoId || trackVideoId === currentVideoId;
  }

  function getCurrentYouTubeVideoId(playerResponse) {
    try {
      const url = new URL(window.location.href);
      const queryVideoId = String(url.searchParams.get("v") || "").trim();
      if (queryVideoId) {
        return queryVideoId;
      }
      const pathMatch = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/i);
      if (pathMatch) {
        return decodeURIComponent(pathMatch[1]);
      }
    } catch (_) {
      // Fall through to the player response fallback.
    }
    const responseVideoId = playerResponse
      && playerResponse.videoDetails
      && playerResponse.videoDetails.videoId;
    if (responseVideoId) {
      return String(responseVideoId);
    }
    return "";
  }

  function getBaseLanguage(tag) {
    const pu = namespace.pageUtils;
    if (pu && typeof pu.getBaseLanguage === "function") {
      return pu.getBaseLanguage(tag);
    }
    return String(tag || "").trim().toLowerCase().split("-")[0];
  }

  function addYouTubeTimedTextEntry(rawEntry) {
    if (!utils || typeof utils.parseYouTubeTimedTextCapture !== "function") {
      return;
    }
    const parsed = utils.parseYouTubeTimedTextCapture(rawEntry);
    if (!parsed || !parsed.cues || !parsed.cues.length) {
      return;
    }
    const firstCue = parsed.cues[0] || {};
    const key = [
      parsed.videoId,
      parsed.languageCode,
      parsed.targetLanguage,
      parsed.kind,
      parsed.bodyLength,
      parsed.cues.length,
      Number(firstCue.start || 0).toFixed(3),
      String(firstCue.text || "").slice(0, 80)
    ].join("\0");
    const entry = Object.assign({}, parsed, { key });
    state.youtubeTimedTextEntries = [
      entry,
      ...state.youtubeTimedTextEntries.filter((item) => item.key !== key)
    ].slice(0, 24);
  }

  function handleYouTubeBridgeMessage(event) {
    if (event.source !== window) {
      return;
    }
    const data = event.data;
    if (!data || data.source !== YOUTUBE_BRIDGE_PAGE_SOURCE) {
      return;
    }
    if (data.type === YOUTUBE_BRIDGE_CAPTURED && data.entry) {
      addYouTubeTimedTextEntry(data.entry);
      return;
    }
    if (data.type === YOUTUBE_BRIDGE_SNAPSHOT && Array.isArray(data.entries)) {
      data.entries.forEach(addYouTubeTimedTextEntry);
    }
  }

  function setupYouTubeSubtitleBridgeListener() {
    if (state.youtubeBridgeListenerAttached || !isYouTubePage()) {
      return;
    }
    state.youtubeBridgeListenerAttached = true;
    window.addEventListener("message", handleYouTubeBridgeMessage);
  }

  function requestYouTubeSubtitleBridgeSnapshot() {
    if (!isYouTubePage()) {
      return;
    }
    setupYouTubeSubtitleBridgeListener();
    window.postMessage({
      source: YOUTUBE_BRIDGE_CONTENT_SOURCE,
      type: YOUTUBE_BRIDGE_REQUEST_SNAPSHOT
    }, window.location.origin || "*");
  }

  function scoreCapturedYouTubeEntry(entry, track, videoId) {
    if (!entry || !entry.cues || !entry.cues.length) {
      return -1;
    }
    if (videoId && entry.videoId !== videoId) {
      return -1;
    }
    const trackLanguage = String(track && track.languageCode || "").trim();
    const entryLanguage = String(entry.languageCode || "").trim();
    if (trackLanguage && entryLanguage && getBaseLanguage(trackLanguage) !== getBaseLanguage(entryLanguage)) {
      return -1;
    }
    let score = 0;
    if (videoId && entry.videoId === videoId) {
      score += 8;
    }
    if (trackLanguage && entryLanguage === trackLanguage) {
      score += 5;
    } else if (trackLanguage && entryLanguage && getBaseLanguage(trackLanguage) === getBaseLanguage(entryLanguage)) {
      score += 3;
    }
    if (track && track.kind && entry.kind && track.kind === entry.kind) {
      score += 2;
    }
    if (entry.targetLanguage) {
      score -= 4;
    } else {
      score += 2;
    }
    score += Math.min(4, Math.floor(entry.cues.length / 80));
    score += Math.min(3, Math.max(0, Number(entry.capturedAt || 0)) / 1000000000000);
    return score;
  }

  function getCapturedYouTubeCues(track, videoId) {
    let best = null;
    let bestScore = -1;
    state.youtubeTimedTextEntries.forEach((entry) => {
      const score = scoreCapturedYouTubeEntry(entry, track, videoId);
      if (score < 0) {
        return;
      }
      if (!best || score > bestScore || (score === bestScore && Number(entry.capturedAt || 0) > Number(best.capturedAt || 0))) {
        best = entry;
        bestScore = score;
      }
    });
    return best && best.cues ? best.cues : [];
  }

  async function waitForCapturedYouTubeCues(track, videoId, timeoutMs) {
    requestYouTubeSubtitleBridgeSnapshot();
    let cues = getCapturedYouTubeCues(track, videoId);
    if (cues.length) {
      return cues;
    }
    const startedAt = Date.now();
    const timeout = Math.max(0, Number(timeoutMs || 0));
    while (Date.now() - startedAt < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      cues = getCapturedYouTubeCues(track, videoId);
      if (cues.length) {
        return cues;
      }
    }
    return [];
  }

  function getBestCapturedYouTubeEntryForVideo(videoId) {
    const currentVideoId = String(videoId || "");
    let best = null;
    state.youtubeTimedTextEntries.forEach((entry) => {
      if (!entry || !entry.cues || !entry.cues.length) {
        return;
      }
      if (currentVideoId && entry.videoId !== currentVideoId) {
        return;
      }
      if (entry.targetLanguage) {
        return;
      }
      if (!best || Number(entry.capturedAt || 0) > Number(best.capturedAt || 0)) {
        best = entry;
      }
    });
    return best;
  }

  async function waitForYouTubeSubtitleContext() {
    const startedAt = Date.now();
    let lastContext = null;
    requestYouTubeSubtitleBridgeSnapshot();

    while (Date.now() - startedAt < YOUTUBE_CONTEXT_WAIT_MS) {
      const video = findVideo();
      const response = readYouTubePlayerResponse();
      const videoId = getCurrentYouTubeVideoId(response);
      const tracks = utils.extractCaptionTracks(response);
      const track = chooseYouTubeTrack(tracks);
      if (video && track && isYouTubeTrackForVideo(track, videoId)) {
        return { video, response, videoId, tracks, track };
      }

      const captured = getBestCapturedYouTubeEntryForVideo(videoId);
      if (video && captured) {
        const syntheticTrack = {
          id: captured.languageCode || "captured",
          baseUrl: captured.url || "",
          languageCode: captured.languageCode || "",
          vssId: "",
          name: captured.languageCode || "Captured subtitles",
          kind: captured.kind || "",
          isTranslatable: true
        };
        return {
          video,
          response,
          videoId,
          tracks: [syntheticTrack],
          track: syntheticTrack,
          capturedCues: captured.cues
        };
      }

      lastContext = { video, response, videoId, tracks, track };
      ensureYouTubeButton();
      requestYouTubeSubtitleBridgeSnapshot();
      await new Promise((resolve) => setTimeout(resolve, YOUTUBE_CONTEXT_POLL_MS));
    }

    return lastContext || {
      video: findVideo(),
      response: readYouTubePlayerResponse(),
      videoId: getCurrentYouTubeVideoId(),
      tracks: [],
      track: null
    };
  }

  function compactUrlForLog(value) {
    const raw = String(value || "");
    return raw.length > 220 ? `${raw.slice(0, 220)}...` : raw;
  }

  function buildEmptyTrackError(track, attempts) {
    const diagnostics = {
      track: {
        languageCode: track && track.languageCode,
        name: track && track.name,
        kind: track && track.kind,
        vssId: track && track.vssId
      },
      attempts
    };
    console.warn("[MelonTranslate] YouTube subtitle track produced no cues.", diagnostics);
    if (typeof console.table === "function") {
      console.table(attempts.map((attempt) => ({
        source: attempt.source || "",
        ok: attempt.ok,
        cueCount: attempt.cueCount,
        bodyLength: attempt.bodyLength || 0,
        contentType: attempt.contentType || "",
        error: attempt.error || "",
        bodyPrefix: attempt.bodyPrefix || "",
        url: attempt.url || ""
      })));
    }
    console.warn("[MelonTranslate] Copyable subtitle diagnostics:", JSON.stringify(diagnostics, null, 2));
    return new Error("This subtitle track is empty. Check the page console for MelonTranslate subtitle diagnostics.");
  }

  async function fetchAndParseYouTubeCues(url) {
    const response = await api.runtime.sendMessage({
      type: messageTypes.fetchYouTubeSubtitleTrack,
      url
    });
    if (!response || !response.ok) {
      return {
        source: "background",
        ok: false,
        url: compactUrlForLog(url),
        error: response && response.error && response.error.message || "Could not load subtitles.",
        cueCount: 0
      };
    }
    const attempt = buildCueAttempt({
      source: "background",
      url,
      finalUrl: response.data && response.data.finalUrl || url,
      contentType: response.data && response.data.contentType || "",
      body: response.data && response.data.body || ""
    });
    const shouldTryPageFallback = !attempt.cues.length
      && (!attempt.bodyLength || /html/i.test(attempt.contentType || "") || /^<!doctype html|^<html\b/i.test(attempt.bodyPrefix || ""));
    if (!shouldTryPageFallback) {
      return attempt;
    }
    const pageAttempt = await fetchAndParseYouTubeCuesFromPage(url);
    if (pageAttempt) {
      return pageAttempt;
    }
    return attempt;
  }

  function buildCueAttempt(details) {
    const body = String(details && details.body || "");
    const contentType = String(details && details.contentType || "");
    const finalUrl = String(details && details.finalUrl || details && details.url || "");
    const cues = utils.parseYouTubeTimedText(body, contentType, finalUrl);
    return {
      source: String(details && details.source || ""),
      ok: true,
      url: compactUrlForLog(finalUrl),
      contentType,
      bodyLength: body.length,
      bodyPrefix: body.slice(0, 120),
      cueCount: cues.length,
      cues
    };
  }

  function canFetchSubtitleUrlFromPage(rawUrl) {
    try {
      const url = new URL(String(rawUrl || ""));
      return url.protocol === "https:" && url.origin === window.location.origin;
    } catch (_) {
      return false;
    }
  }

  async function fetchAndParseYouTubeCuesFromPage(url) {
    if (!canFetchSubtitleUrlFromPage(url)) {
      return null;
    }
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json,text/xml,application/xml,text/vtt,text/plain,*/*"
        }
      });
      const body = await response.text();
      if (!response.ok) {
        return {
          source: "page",
          ok: false,
          url: compactUrlForLog(response.url || url),
          error: `Could not load subtitles (${response.status}).`,
          bodyLength: body.length,
          bodyPrefix: body.slice(0, 120),
          cueCount: 0
        };
      }
      return buildCueAttempt({
        source: "page",
        url,
        finalUrl: response.url || url,
        contentType: response.headers.get("content-type") || "",
        body
      });
    } catch (error) {
      return {
        source: "page",
        ok: false,
        url: compactUrlForLog(url),
        error: error && error.message ? error.message : "Could not load subtitles from page.",
        cueCount: 0
      };
    }
  }

  async function fetchYouTubeCues(track) {
    const urls = Array.from(new Set([
      utils.withYouTubeTimedTextFormat(track.baseUrl, "json3"),
      track.baseUrl,
      utils.withYouTubeTimedTextFormat(track.baseUrl, "srv3"),
      utils.withYouTubeTimedTextFormat(track.baseUrl, "vtt")
    ].filter(Boolean)));
    const attempts = [];
    for (const url of urls) {
      const attempt = await fetchAndParseYouTubeCues(url);
      attempts.push(Object.assign({}, attempt, { cues: undefined }));
      if (attempt.cues && attempt.cues.length) {
        return attempt.cues;
      }
      if (!attempt.ok && urls.length === 1) {
        throw new Error(attempt.error || "Could not load subtitles.");
      }
    }
    throw buildEmptyTrackError(track, attempts);
  }

  function textEndsStrongSubtitleSegment(text) {
    return /[.。!?！？;；]["'”’)\]]?$/.test(String(text || "").trim());
  }

  function textEndsWeakSubtitleSegment(text) {
    return /[,，]["'”’)\]]?$/.test(String(text || "").trim());
  }

  function splitSubtitleTextByInternalSentences(text) {
    const splitter = utils && utils.splitTextBySentenceBoundaries;
    if (typeof splitter !== "function") {
      const source = normalizeSubtitleSegmentText(text);
      return source ? [source] : [];
    }
    return splitter(text, {
      normalizeText: normalizeSubtitleSegmentText,
      minTextLength: INTERNAL_SENTENCE_SPLIT_MIN_CHARS * 2,
      minPartLength: INTERNAL_SENTENCE_SPLIT_MIN_CHARS
    });
  }

  function splitCueByInternalSentenceBoundaries(cue) {
    const text = normalizeSubtitleSegmentText(cue && cue.text || "");
    const parts = splitSubtitleTextByInternalSentences(text);
    if (parts.length <= 1) {
      return text ? [Object.assign({}, cue, { text })] : [];
    }
    const start = Number(cue.start);
    const end = Number(cue.end);
    const duration = Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : parts.length;
    const totalChars = parts.reduce((sum, part) => sum + Math.max(1, part.length), 0);
    let offset = start;
    return parts.map((part, index) => {
      const isLast = index === parts.length - 1;
      const partDuration = isLast ? end - offset : duration * (Math.max(1, part.length) / totalChars);
      const partStart = offset;
      const partEnd = isLast ? end : Math.min(end, offset + partDuration);
      offset = partEnd;
      return Object.assign({}, cue, {
        id: `${cue.id}:sent:${index}`,
        start: partStart,
        end: Math.max(partStart + 0.05, partEnd),
        text: part,
        forceBoundaryAfter: textEndsStrongSubtitleSegment(part)
      });
    });
  }

  function isCjkBoundaryChar(value) {
    return /[\u3040-\u30ff\u3400-\u9fff]/.test(String(value || ""));
  }

  function appendSubtitleSegmentText(current, next) {
    const left = String(current || "");
    const right = String(next || "").trim();
    if (!left) {
      return right;
    }
    if (!right) {
      return left;
    }
    const last = left.charAt(left.length - 1);
    const first = right.charAt(0);
    const separator = /\s/.test(last)
      || /^[,，.。!?！？;；:：]/.test(first)
      || isCjkBoundaryChar(last)
      || isCjkBoundaryChar(first)
      ? ""
      : " ";
    return `${left}${separator}${right}`;
  }

  function normalizeSubtitleSegmentText(text) {
    const normalizer = utils && typeof utils.normalizeCueText === "function"
      ? utils.normalizeCueText
      : (value) => String(value || "").trim();
    return normalizer(String(text || "").replace(/\s+([,，.。!?！？;；:：])/g, "$1"));
  }

  function shouldFlushMergedSubtitleSegment(group, text) {
    if (!group.length) {
      return false;
    }
    const first = group[0];
    const last = group[group.length - 1];
    const normalized = normalizeSubtitleSegmentText(text);
    const duration = Number(last.end) - Number(first.start);
    const softLimitReached = normalized.length >= MERGED_CUE_SOFT_CHARS
      || duration >= MERGED_CUE_SOFT_DURATION_SECONDS;
    const hardLimitReached = normalized.length >= MERGED_CUE_HARD_CHARS
      || duration >= MERGED_CUE_HARD_DURATION_SECONDS;
    if (hardLimitReached) {
      return true;
    }
    if (textEndsStrongSubtitleSegment(normalized)) {
      return true;
    }
    if (textEndsWeakSubtitleSegment(normalized)) {
      return softLimitReached
        || normalized.length >= MERGED_CUE_WEAK_BOUNDARY_MIN_CHARS
        || duration >= MERGED_CUE_WEAK_BOUNDARY_MIN_DURATION_SECONDS;
    }
    return false;
  }

  function clampSubtitleSegmentOverlaps(segments) {
    return (Array.isArray(segments) ? segments : []).map((segment, index, list) => {
      const next = list[index + 1];
      if (!next || Number(next.start) >= Number(segment.end)) {
        return segment;
      }
      return Object.assign({}, segment, {
        end: Math.max(Number(segment.start) + 0.05, Number(next.start))
      });
    });
  }

  function segmentSubtitleCues(cues) {
    const source = utils.normalizeCueList(cues).flatMap(splitCueByInternalSentenceBoundaries);
    if (source.length <= 1) {
      return source;
    }
    const segments = [];
    let group = [];
    let groupText = "";

    function flushGroup() {
      if (!group.length) {
        return;
      }
      const first = group[0];
      const last = group[group.length - 1];
      const text = normalizeSubtitleSegmentText(groupText);
      if (text) {
        segments.push({
          id: `seg:${segments.length}:${first.id}:${last.id}`,
          start: first.start,
          end: last.end,
          text,
          cueIds: group.map((cue) => cue.id)
        });
      }
      group = [];
      groupText = "";
    }

    source.forEach((cue) => {
      const last = group[group.length - 1];
      if (last && cue.start - last.end > MERGED_CUE_MAX_GAP_SECONDS) {
        flushGroup();
      }

      group.push(cue);
      groupText = normalizeSubtitleSegmentText(appendSubtitleSegmentText(groupText, cue.text));
      if (cue.forceBoundaryAfter || shouldFlushMergedSubtitleSegment(group, groupText)) {
        flushGroup();
      }
    });
    flushGroup();
    return clampSubtitleSegmentOverlaps(segments.length ? segments : source);
  }

  async function loadYouTubeSubtitleSource() {
    const context = await waitForYouTubeSubtitleContext();
    const video = context.video;
    const track = context.track;
    const videoId = context.videoId || getCurrentYouTubeVideoId(context.response);
    if (!video) {
      throw new Error("Could not find the YouTube video player.");
    }
    if (!track) {
      throw new Error("Could not find a YouTube subtitle track.");
    }
    const trackMatchesCurrentVideo = isYouTubeTrackForVideo(track, videoId);
    const capturedCues = context.capturedCues || await waitForCapturedYouTubeCues(track, videoId, 240);
    if (capturedCues.length) {
      const cues = segmentSubtitleCues(capturedCues);
      console.info("[MelonTranslate] Using YouTube subtitles captured from the page.", {
        languageCode: track.languageCode,
        kind: track.kind,
        cueCount: cues.length,
        rawCueCount: capturedCues.length
      });
      return {
        kind: "youtube",
        video,
        track,
        videoId,
        cues,
        sourceLanguage: track.languageCode
      };
    }
    if (trackMatchesCurrentVideo) {
      try {
        const cues = segmentSubtitleCues(await fetchYouTubeCues(track));
        if (cues.length) {
          return {
            kind: "youtube",
            video,
            track,
            videoId,
            cues,
            sourceLanguage: track.languageCode
          };
        }
      } catch (error) {
        console.warn("[MelonTranslate] Falling back to rendered YouTube caption text.", {
          reason: error && error.message ? error.message : "Could not prefetch YouTube subtitles.",
          track: {
            languageCode: track.languageCode,
            name: track.name,
            kind: track.kind,
            vssId: track.vssId
          }
        });
      }
    } else {
      console.warn("[MelonTranslate] Skipping stale YouTube subtitle track from a different video.", {
        currentVideoId: videoId,
        trackVideoId: getYouTubeTrackVideoId(track),
        track: {
          languageCode: track.languageCode,
          name: track.name,
          kind: track.kind,
          vssId: track.vssId
        }
      });
    }
    const lateCapturedCues = await waitForCapturedYouTubeCues(track, videoId, 400);
    if (lateCapturedCues.length) {
      const cues = segmentSubtitleCues(lateCapturedCues);
      console.info("[MelonTranslate] Using YouTube subtitles captured from the page after fetch fallback.", {
        languageCode: track.languageCode,
        kind: track.kind,
        cueCount: cues.length,
        rawCueCount: lateCapturedCues.length
      });
      return {
        kind: "youtube",
        video,
        track,
        videoId,
        cues,
        sourceLanguage: track.languageCode
      };
    }
    return {
      kind: "youtube-dom",
      video,
      track,
      videoId,
      cues: [],
      sourceLanguage: track.languageCode
    };
  }

  function textTrackToCues(track) {
    const cues = Array.from(track && track.cues || []).map((cue, index) => ({
      id: String(cue.id || index),
      start: cue.startTime,
      end: cue.endTime,
      text: cue.text
    }));
    return utils.normalizeCueList(cues);
  }

  function chooseHtml5TextTrack(video) {
    const tracks = Array.from(video && video.textTracks || []);
    return tracks.find((track) => track.mode === "showing" && /subtitles|captions/i.test(track.kind || ""))
      || tracks.find((track) => /subtitles|captions/i.test(track.kind || ""))
      || tracks[0]
      || null;
  }

  async function waitForTextTrackCues(track) {
    if (!track) {
      return [];
    }
    if (track.mode === "disabled") {
      track.mode = "hidden";
    }
    let cues = textTrackToCues(track);
    if (cues.length) {
      return cues;
    }
    const startedAt = Date.now();
    while (Date.now() - startedAt < 1800) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      cues = textTrackToCues(track);
      if (cues.length) {
        return cues;
      }
    }
    return cues;
  }

  async function loadHtml5SubtitleSource() {
    const video = findVideo();
    if (!video) {
      throw new Error("Could not find a video element.");
    }
    const track = chooseHtml5TextTrack(video);
    if (!track) {
      throw new Error("Could not find a readable subtitle track.");
    }
    const cues = await waitForTextTrackCues(track);
    if (!cues.length) {
      throw new Error("This subtitle track is empty or unavailable.");
    }
    return {
      kind: "html5",
      video,
      track,
      cues,
      sourceLanguage: String(track.language || "")
    };
  }

  async function loadSubtitleSource() {
    if (isYouTubePage()) {
      return loadYouTubeSubtitleSource();
    }
    return loadHtml5SubtitleSource();
  }

  function ensureOverlay(video, kind) {
    ensureStyle();
    if (state.overlay && state.overlay.isConnected) {
      if (kind === "youtube" || kind === "youtube-dom") {
        const player = getYouTubePlayer();
        if (player && state.overlay.parentElement !== player) {
          player.appendChild(state.overlay);
          resetOverlayRenderCache();
        }
      }
      return state.overlay;
    }
    const overlay = document.createElement("div");
    overlay.className = `${OVERLAY_CLASS} is-hidden`;
    overlay.setAttribute("aria-hidden", "true");
    if (kind === "youtube" || kind === "youtube-dom") {
      const player = getYouTubePlayer();
      const host = player || video.parentElement || document.body;
      host.appendChild(overlay);
    } else {
      overlay.classList.add(HTML5_OVERLAY_CLASS);
      document.documentElement.appendChild(overlay);
    }
    state.overlay = overlay;
    resetOverlayRenderCache();
    return overlay;
  }

  function ensureActiveOverlayHost() {
    if (!state.active || !state.video || !isYouTubeSubtitleMode()) {
      return;
    }
    ensureOverlay(state.video, state.subtitleMode);
  }

  function updateHtml5OverlayPosition() {
    if (!state.overlay || !state.overlay.classList.contains(HTML5_OVERLAY_CLASS) || !state.video) {
      return;
    }
    const rect = state.video.getBoundingClientRect();
    state.overlay.style.left = `${Math.max(0, rect.left + rect.width * 0.07)}px`;
    state.overlay.style.top = `${Math.max(0, rect.top + rect.height * 0.78)}px`;
    state.overlay.style.width = `${Math.max(0, rect.width * 0.86)}px`;
  }

  function resetOverlayRenderCache() {
    state.renderedOverlayMode = "";
    state.renderedOverlaySourceText = "";
    state.renderedOverlayTargetText = "";
    state.renderedOverlayNextText = "";
    state.renderedOverlayPlainText = "";
    state.renderedOverlayHidden = null;
  }

  function hideWordLookupPopup() {
    if (state.wordLookupPopup) {
      state.wordLookupPopup.classList.add("is-hidden");
    }
  }

  function clearWordLookupState() {
    if (state.wordLookupTimer) {
      clearTimeout(state.wordLookupTimer);
      state.wordLookupTimer = 0;
    }
    state.wordLookupRequestId += 1;
    if (state.wordLookupActiveElement) {
      state.wordLookupActiveElement.classList.remove("is-selected", "is-loading");
    }
    state.wordLookupActiveElement = null;
    hideWordLookupPopup();
  }

  function removeWordLookupPopup() {
    clearWordLookupState();
    if (state.wordLookupPopup && state.wordLookupPopup.isConnected) {
      state.wordLookupPopup.remove();
    }
    state.wordLookupPopup = null;
  }

  function clearRuntimeState() {
    state.video = null;
    state.videoId = "";
    state.track = null;
    state.cues = [];
    state.targetLanguage = "";
    state.sourceLanguage = "";
    state.subtitleContext = "";
    state.subtitleMode = "";
    state.translations = new Map();
    state.queuedIds = [];
    state.queuedIdSet = new Set();
    state.pendingIds = new Set();
    state.failedIds = new Set();
    state.activeBatches = 0;
    state.currentCueKey = "";
    state.currentDomSubtitleId = "";
    state.lastQueueRefreshMediaTime = null;
    state.lastVideoPaused = null;
    state.lastVideoTime = null;
    state.domCaptionText = "";
    state.domCaptionStartedAtMs = 0;
    state.domCaptionChangedAtMs = 0;
    state.domCaptionLastSeenAtMs = 0;
    state.domCommittedText = "";
    state.domCommittedId = "";
    state.domCommittedAtMs = 0;
    state.domSourceById = new Map();
    clearWordLookupState();
    resetOverlayRenderCache();
  }

  function setTakeoverMode(enabled) {
    if (document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.toggle("mt-video-subtitle-takeover", !!enabled);
    }
  }

  function removeOverlay() {
    removeWordLookupPopup();
    if (state.overlay && state.overlay.isConnected) {
      state.overlay.remove();
    }
    state.overlay = null;
    resetOverlayRenderCache();
  }

  function stopRenderLoop() {
    if (state.renderTimer) {
      clearInterval(state.renderTimer);
      state.renderTimer = 0;
    }
  }

  function deactivate() {
    state.generation += 1;
    state.active = false;
    state.manualActive = false;
    stopRenderLoop();
    setTakeoverMode(false);
    removeOverlay();
    clearRuntimeState();
    setStatus("off");
  }

  function isYouTubeSubtitleMode() {
    return state.subtitleMode === "youtube" || state.subtitleMode === "youtube-dom";
  }

  function getSubtitleQueueLookaheadSeconds() {
    const video = state.video;
    if (video && video.paused) {
      return SUBTITLE_PAUSED_LOOKAHEAD_SECONDS;
    }
    return SUBTITLE_LOOKAHEAD_SECONDS;
  }

  function buildCueOrder(currentTime) {
    const cues = state.cues || [];
    if (!cues.length) {
      return [];
    }
    const time = Number(currentTime || 0);
    const start = Math.max(0, time - 0.5);
    const end = time + getSubtitleQueueLookaheadSeconds();
    return cues.filter((cue) => (
      cue && Number(cue.end) >= start && Number(cue.start) <= end
    ));
  }

  function rebuildQueue(currentTime) {
    const existing = new Set(state.queuedIds);
    const next = [];
    buildCueOrder(currentTime).forEach((cue) => {
      if (!cue || state.translations.has(cue.id) || state.pendingIds.has(cue.id) || state.failedIds.has(cue.id)) {
        return;
      }
      if (!existing.has(cue.id)) {
        existing.add(cue.id);
      }
      next.push(cue.id);
    });
    state.queuedIds = next;
    state.queuedIdSet = new Set(next);
  }

  function enqueuePriorityAroundCurrent() {
    if (!state.active || !state.video) {
      return;
    }
    const currentTime = Number(state.video.currentTime || 0);
    rebuildQueue(currentTime);
    state.lastQueueRefreshMediaTime = currentTime;
    processQueue();
  }

  function shouldRefreshQueueAroundPlayback(currentTime) {
    if (!state.active || !state.video || state.subtitleMode === "youtube-dom") {
      return false;
    }
    if (state.lastQueueRefreshMediaTime === null || state.lastQueueRefreshMediaTime === undefined) {
      return true;
    }
    const elapsed = Math.abs(Number(currentTime || 0) - Number(state.lastQueueRefreshMediaTime || 0));
    if (state.video.paused) {
      return elapsed >= SUBTITLE_PAUSED_LOOKAHEAD_SECONDS;
    }
    return elapsed >= SUBTITLE_QUEUE_REFRESH_SECONDS || (!state.queuedIds.length && !state.activeBatches);
  }

  function syncQueueWithPlaybackState() {
    if (!state.active || !state.video || state.subtitleMode === "youtube-dom") {
      return false;
    }
    const paused = !!state.video.paused;
    if (state.lastVideoPaused === null || state.lastVideoPaused === undefined) {
      state.lastVideoPaused = paused;
      return false;
    }
    if (paused === state.lastVideoPaused) {
      return false;
    }
    state.lastVideoPaused = paused;
    state.queuedIds = [];
    state.queuedIdSet = new Set();
    enqueuePriorityAroundCurrent();
    return true;
  }

  function getCueById(id) {
    return state.cues.find((cue) => cue.id === id) || null;
  }

  function isDomTextId(id) {
    return String(id || "").startsWith("text:");
  }

  function removeDomTextIdsFromSet(value) {
    return new Set(Array.from(value || []).filter((id) => !isDomTextId(id)));
  }

  function clearQueuedDomTextIds() {
    state.queuedIds = state.queuedIds.filter((id) => !isDomTextId(id));
    state.queuedIdSet = new Set(state.queuedIds);
  }

  function resetDomCaptionRuntime() {
    state.currentDomSubtitleId = "";
    state.domCaptionText = "";
    state.domCaptionStartedAtMs = 0;
    state.domCaptionChangedAtMs = 0;
    state.domCaptionLastSeenAtMs = 0;
    state.domCommittedText = "";
    state.domCommittedId = "";
    state.domCommittedAtMs = 0;
    state.pendingIds = removeDomTextIdsFromSet(state.pendingIds);
    state.failedIds = removeDomTextIdsFromSet(state.failedIds);
    clearQueuedDomTextIds();
  }

  function resetSubtitleResultRuntime() {
    state.generation += 1;
    state.translations = new Map();
    state.queuedIds = [];
    state.queuedIdSet = new Set();
    state.pendingIds = new Set();
    state.failedIds = new Set();
    state.activeBatches = 0;
    state.currentCueKey = "";
    state.lastQueueRefreshMediaTime = null;
    resetOverlayRenderCache();
  }

  function maybeResetDomRuntimeAfterSeek() {
    const video = state.video;
    if (!video) {
      return;
    }
    const currentTime = Number(video.currentTime || 0);
    if (!Number.isFinite(currentTime)) {
      return;
    }
    const hasPreviousTime = state.lastVideoTime !== null && state.lastVideoTime !== undefined;
    const previousTime = hasPreviousTime ? Number(state.lastVideoTime) : currentTime;
    if (hasPreviousTime && Math.abs(currentTime - previousTime) >= DOM_CAPTION_SEEK_RESET_SECONDS) {
      resetDomCaptionRuntime();
    }
    state.lastVideoTime = currentTime;
  }

  function getQueuedSubtitleText(id) {
    const cue = getCueById(id);
    if (cue) {
      return cue.text;
    }
    if (state.subtitleMode === "youtube-dom") {
      return state.domSourceById.get(id) || "";
    }
    return "";
  }

  function getVideoTopicTitle() {
    return String(document.title || "")
      .replace(/\s*-\s*YouTube\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildSubtitleTopicSampleText() {
    const cues = Array.isArray(state.cues) ? state.cues : [];
    if (!cues.length) {
      return state.subtitleMode === "youtube-dom" ? readYouTubeRenderedCaptionText() : "";
    }
    const indexes = new Set();
    const earlyCount = Math.min(18, cues.length);
    for (let index = 0; index < earlyCount; index += 1) {
      indexes.add(index);
    }
    if (cues.length > earlyCount) {
      const sampleCount = Math.min(18, cues.length - earlyCount);
      const step = Math.max(1, Math.floor((cues.length - earlyCount) / sampleCount));
      for (let index = earlyCount; index < cues.length && indexes.size < earlyCount + sampleCount; index += step) {
        indexes.add(index);
      }
    }
    const lines = [];
    const seen = new Set();
    Array.from(indexes).sort((a, b) => a - b).forEach((index) => {
      const text = normalizeRenderedCaptionText(cues[index] && cues[index].text || "");
      if (!text || seen.has(text)) {
        return;
      }
      seen.add(text);
      lines.push(text);
    });
    return lines.join("\n").slice(0, 4500).trim();
  }

  async function loadSubtitleTopicContext(generation) {
    state.subtitleContext = "";
    if (!state.settings || !state.settings.videoBilingualSubtitlesTopicContextEnabled) {
      return "";
    }
    const sampleText = buildSubtitleTopicSampleText();
    if (sampleText.length < 80) {
      return "";
    }
    try {
      const response = await api.runtime.sendMessage({
        type: messageTypes.senseSubtitleTopicContext,
        title: getVideoTopicTitle(),
        sampleText,
        targetLanguage: state.targetLanguage,
        sourceLanguage: state.sourceLanguage || "auto",
        url: window.location.href
      });
      if (generation !== state.generation || !state.active) {
        return "";
      }
      if (response && response.ok && response.data && response.data.context) {
        state.subtitleContext = String(response.data.context || "").trim();
      }
    } catch (error) {
      if (generation === state.generation && state.active) {
        state.subtitleContext = "";
      }
    }
    return state.subtitleContext;
  }

  function processQueue() {
    if (!state.active || !state.settings) {
      return;
    }
    if (isManualWordLookupMode()) {
      return;
    }
    const limit = state.settings.videoBilingualSubtitlesMaxConcurrentBatches || 2;
    while (state.activeBatches < limit && state.queuedIds.length) {
      const items = [];
      while (items.length < BATCH_SIZE && state.queuedIds.length) {
        const id = state.queuedIds.shift();
        state.queuedIdSet.delete(id);
        if (state.translations.has(id) || state.pendingIds.has(id) || state.failedIds.has(id)) {
          continue;
        }
        const text = getQueuedSubtitleText(id);
        if (!text) {
          continue;
        }
        state.pendingIds.add(id);
        items.push({ id, text });
      }
      if (!items.length) {
        continue;
      }
      translateBatch(items, state.generation);
    }
  }

  function getSubtitleLearningProfile() {
    if (utils && typeof utils.resolveSubtitleLearningProfile === "function") {
      return utils.resolveSubtitleLearningProfile(state.settings || {}, state.sourceLanguage || "auto");
    }
    return {
      levelSystem: "CEFR",
      level: "B1",
      maxItems: 4
    };
  }

  async function translateBatch(items, generation) {
    state.activeBatches += 1;
    try {
      const learningMode = isLearningSubtitleMode();
      const learningProfile = learningMode ? getSubtitleLearningProfile() : null;
      const message = {
        type: learningMode ? messageTypes.annotateSubtitleBatch : messageTypes.translateSubtitleBatch,
        items,
        targetLanguage: state.targetLanguage,
        sourceLanguage: state.sourceLanguage || "auto",
        contextStyle: "neutral",
        dictionaryModeForSingleWord: false,
        subtitleContext: state.subtitleContext || "",
        url: window.location.href
      };
      if (learningMode && learningProfile) {
        message.learningLevelSystem = learningProfile.levelSystem;
        message.learningLevel = learningProfile.level;
        message.maxAnnotations = learningProfile.maxItems;
        message.annotationTypes = learningProfile.annotationTypes;
      }
      const response = await api.runtime.sendMessage(message);
      if (generation !== state.generation || !state.active) {
        return;
      }
      if (!response || !response.ok) {
        throw new Error(response && response.error && response.error.message || "Subtitle translation failed.");
      }
      const translated = response.data && Array.isArray(response.data.items) ? response.data.items : [];
      translated.forEach((item) => {
        const id = String(item && item.id || "");
        state.pendingIds.delete(id);
        if (item && item.ok && (learningMode || String(item.translatedText || "").trim())) {
          state.translations.set(id, String(item.translatedText || "").trim());
        } else if (id) {
          state.failedIds.add(id);
        }
      });
      items.forEach((item) => state.pendingIds.delete(item.id));
      renderCurrentSubtitle();
    } catch (error) {
      if (generation !== state.generation || !state.active) {
        return;
      }
      items.forEach((item) => {
        state.pendingIds.delete(item.id);
        state.failedIds.add(item.id);
      });
      if (!state.translations.size && state.subtitleMode !== "youtube-dom") {
        setStatus("error", error && error.message ? error.message : "Subtitle translation failed.");
      }
    } finally {
      state.activeBatches = Math.max(0, state.activeBatches - 1);
      processQueue();
    }
  }

  function getActiveCues() {
    const video = state.video;
    if (!video) {
      return [];
    }
    const time = Number(video.currentTime || 0);
    return (state.cues || []).filter((cue) => (
      time >= Number(cue.start) - ACTIVE_CUE_LEAD_SECONDS && time < Number(cue.end) + ACTIVE_CUE_TRAIL_SECONDS
    ));
  }

  function getDisplayCues(activeCues) {
    const cues = Array.isArray(activeCues) ? activeCues.filter(Boolean) : [];
    if (state.subtitleMode !== "youtube" || cues.length <= 1) {
      return cues;
    }
    const latestStart = Math.max(...cues.map((cue) => Number(cue.start || 0)));
    return cues.filter((cue) => Math.abs(Number(cue.start || 0) - latestStart) < 0.001);
  }

  function getNextSubtitleContextText(displayCues) {
    const currentCues = Array.isArray(displayCues) ? displayCues.filter(Boolean) : [];
    const cues = Array.isArray(state.cues) ? state.cues : [];
    if (!currentCues.length || !cues.length || state.subtitleMode === "youtube-dom") {
      return "";
    }
    const currentIds = new Set(currentCues.map((cue) => String(cue.id || "")));
    const currentTexts = new Set(currentCues.map((cue) => normalizeRenderedCaptionText(cue.text || "")).filter(Boolean));
    const currentEnd = Math.max(...currentCues.map((cue) => Number(cue.end || 0)));
    const nextCue = cues.find((cue) => {
      if (!cue || currentIds.has(String(cue.id || ""))) {
        return false;
      }
      const text = normalizeRenderedCaptionText(cue.text || "");
      if (!text || currentTexts.has(text)) {
        return false;
      }
      return Number(cue.start || 0) >= currentEnd - 0.05;
    });
    return normalizeRenderedCaptionText(nextCue && nextCue.text || "").slice(0, 1000);
  }

  function normalizeRenderedCaptionText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .trim();
  }

  function getVisibleTextFromElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }
    if (element.closest && element.closest(`.${OVERLAY_CLASS}`)) {
      return "";
    }
    const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
    if (style && (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0)) {
      return "";
    }
    return normalizeRenderedCaptionText(element.textContent || "");
  }

  function readYouTubeRenderedCaptionText() {
    const player = getYouTubePlayer();
    const root = player || document;
    const container = root.querySelector(".ytp-caption-window-container")
      || document.querySelector(".ytp-caption-window-container");
    if (!container) {
      return "";
    }

    const segments = Array.from(container.querySelectorAll(".ytp-caption-segment"))
      .map(getVisibleTextFromElement)
      .filter(Boolean);
    if (segments.length) {
      return normalizeRenderedCaptionText(segments.join("\n"));
    }

    const windows = Array.from(container.querySelectorAll(".caption-window, .ytp-caption-window-bottom, [class*='caption-window']"))
      .map(getVisibleTextFromElement)
      .filter(Boolean);
    if (windows.length) {
      return normalizeRenderedCaptionText(windows.join("\n"));
    }

    return normalizeRenderedCaptionText(container.textContent || "");
  }

  function buildTextCueId(text) {
    let hash = 0;
    const normalized = normalizeRenderedCaptionText(text);
    for (let index = 0; index < normalized.length; index += 1) {
      hash = ((hash << 5) - hash + normalized.charCodeAt(index)) | 0;
    }
    return `text:${Math.abs(hash)}:${normalized.length}`;
  }

  function commonPrefixLength(left, right) {
    const a = normalizeRenderedCaptionText(left);
    const b = normalizeRenderedCaptionText(right);
    const max = Math.min(a.length, b.length);
    let index = 0;
    while (index < max && a[index] === b[index]) {
      index += 1;
    }
    return index;
  }

  function looksLikeSameDomCaptionWindow(previous, next) {
    const oldText = normalizeRenderedCaptionText(previous);
    const newText = normalizeRenderedCaptionText(next);
    if (!oldText || !newText) {
      return false;
    }
    if (newText.startsWith(oldText) || oldText.startsWith(newText)) {
      return true;
    }
    const shared = commonPrefixLength(oldText, newText);
    return shared >= Math.min(16, Math.floor(Math.min(oldText.length, newText.length) * 0.6));
  }

  function textLooksSentenceComplete(text) {
    return /[.!?。！？…]["')\]]?$/.test(normalizeRenderedCaptionText(text));
  }

  function getStableDomCaptionText(now) {
    const sourceText = readYouTubeRenderedCaptionText();
    if (sourceText) {
      if (sourceText !== state.domCaptionText) {
        if (!looksLikeSameDomCaptionWindow(state.domCaptionText, sourceText)) {
          state.domCaptionStartedAtMs = now;
        }
        state.domCaptionText = sourceText;
        state.domCaptionChangedAtMs = now;
      }
      if (!state.domCaptionStartedAtMs) {
        state.domCaptionStartedAtMs = now;
      }
      state.domCaptionLastSeenAtMs = now;
      return sourceText;
    }
    if (state.domCaptionText && now - state.domCaptionLastSeenAtMs <= DOM_CAPTION_HOLD_MS) {
      return state.domCaptionText;
    }
    state.domCaptionText = "";
    state.domCaptionStartedAtMs = 0;
    state.domCaptionChangedAtMs = 0;
    state.domCaptionLastSeenAtMs = 0;
    return "";
  }

  function isDomCaptionReadyForTranslation(text, now) {
    if (!text) {
      return false;
    }
    const stableFor = now - state.domCaptionChangedAtMs;
    if (textLooksSentenceComplete(text)) {
      return stableFor >= DOM_CAPTION_SENTENCE_STABLE_MS;
    }
    return stableFor >= DOM_CAPTION_STABLE_MS;
  }

  function shouldCommitDomCaption(text, now) {
    const source = normalizeRenderedCaptionText(text);
    if (!source) {
      return false;
    }
    const current = normalizeRenderedCaptionText(state.domCommittedText);
    const ready = isDomCaptionReadyForTranslation(source, now);
    const captionAge = now - Number(state.domCaptionStartedAtMs || now);
    const timeSinceCommit = now - Number(state.domCommittedAtMs || state.domCaptionStartedAtMs || now);
    const canForceFirstCommit = !current
      && source.length >= DOM_CAPTION_FIRST_COMMIT_CHARS
      && captionAge >= DOM_CAPTION_FIRST_COMMIT_MS;
    const canForceGrowingCommit = current
      && source.startsWith(current)
      && source.length - current.length >= DOM_CAPTION_MIN_INCREMENT_CHARS
      && timeSinceCommit >= DOM_CAPTION_FORCE_COMMIT_MS;
    if (!ready && !canForceFirstCommit && !canForceGrowingCommit) {
      return false;
    }
    if (!current || source === current) {
      return source !== current;
    }
    if (source.startsWith(current) && !textLooksSentenceComplete(source)) {
      const addedLength = source.length - current.length;
      const timeSinceCommit = now - Number(state.domCommittedAtMs || 0);
      if (addedLength < DOM_CAPTION_MIN_INCREMENT_CHARS && timeSinceCommit < DOM_CAPTION_MAX_COMMIT_GAP_MS) {
        return false;
      }
    }
    return true;
  }

  function commitDomCaption(text, now) {
    const source = normalizeRenderedCaptionText(text);
    const id = buildTextCueId(source);
    state.domCommittedText = source;
    state.domCommittedId = id;
    state.domCommittedAtMs = now;
    state.currentDomSubtitleId = id;
    state.domSourceById.set(id, source);
    queueDomCaptionTranslation(id, source);
    return id;
  }

  function findBestDomPrefixTranslation(sourceText) {
    const source = normalizeRenderedCaptionText(sourceText);
    let best = null;
    state.domSourceById.forEach((candidateSource, id) => {
      const candidate = normalizeRenderedCaptionText(candidateSource);
      const translation = state.translations.get(id);
      if (!candidate || !translation || !source.startsWith(candidate)) {
        return;
      }
      if (candidate.length < Math.max(8, source.length * 0.45)) {
        return;
      }
      if (!best || candidate.length > best.source.length) {
        best = { source: candidate, translation };
      }
    });
    return best ? best.translation : "";
  }

  function tokenLooksLookupWord(text) {
    const value = String(text || "").trim();
    return value.length > 0 && value.length <= 80 && /\p{L}/u.test(value);
  }

  function getWordLookupSegments(text) {
    const source = String(text || "");
    if (!source) {
      return [];
    }
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
      try {
        const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
        return Array.from(segmenter.segment(source)).map((segment) => ({
          text: segment.segment,
          word: !!segment.isWordLike && tokenLooksLookupWord(segment.segment)
        }));
      } catch (_) {}
    }
    const pattern = /[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*(?:-[\p{L}\p{N}]+)*/gu;
    const segments = [];
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(source))) {
      if (match.index > lastIndex) {
        segments.push({ text: source.slice(lastIndex, match.index), word: false });
      }
      segments.push({ text: match[0], word: tokenLooksLookupWord(match[0]) });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < source.length) {
      segments.push({ text: source.slice(lastIndex), word: false });
    }
    return segments;
  }

  function getWordLookupCacheKey(word, sentence, nextSentence) {
    return [
      state.sourceLanguage || "auto",
      state.targetLanguage || "",
      state.subtitleContext || "",
      String(sentence || "").replace(/\s+/g, " ").trim().slice(0, 500),
      String(nextSentence || "").replace(/\s+/g, " ").trim().slice(0, 500),
      String(word || "").replace(/\s+/g, " ").trim().toLowerCase()
    ].join("\0");
  }

  function ensureWordLookupPopup() {
    if (state.wordLookupPopup && state.wordLookupPopup.isConnected) {
      return state.wordLookupPopup;
    }
    const popup = document.createElement("div");
    popup.className = "mt-video-subtitle-word-popup is-hidden";
    popup.setAttribute("role", "tooltip");
    document.documentElement.appendChild(popup);
    state.wordLookupPopup = popup;
    return popup;
  }

  function positionWordLookupPopup(popup, anchor) {
    const rect = anchor.getBoundingClientRect();
    popup.style.left = "0px";
    popup.style.top = "0px";
    popup.classList.remove("is-hidden");
    const popupRect = popup.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(
      window.innerWidth - popupRect.width - margin,
      rect.left + rect.width / 2 - popupRect.width / 2
    ));
    let top = rect.top - popupRect.height - 8;
    if (top < margin) {
      top = rect.bottom + 8;
    }
    top = Math.max(margin, Math.min(window.innerHeight - popupRect.height - margin, top));
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  function showWordLookupPopup(anchor, word, translatedText) {
    if (!anchor || !anchor.isConnected || !translatedText) {
      return;
    }
    const popup = ensureWordLookupPopup();
    popup.replaceChildren();
    const source = document.createElement("div");
    source.className = "mt-word-source";
    source.textContent = word;
    const target = document.createElement("div");
    target.className = "mt-word-target";
    target.textContent = translatedText;
    popup.append(source, target);
    positionWordLookupPopup(popup, anchor);
  }

  async function startWordLookupTranslation(anchor, requestId) {
    if (!anchor || !anchor.isConnected || state.wordLookupActiveElement !== anchor) {
      return;
    }
    const word = String(anchor.dataset.word || "").trim();
    const sentence = String(anchor.dataset.sentence || "").trim();
    const nextSentence = String(anchor.dataset.nextSentence || "").trim();
    if (!word) {
      return;
    }
    anchor.classList.add("is-loading");
    const cacheKey = getWordLookupCacheKey(word, sentence, nextSentence);
    const cached = state.wordLookupCache.get(cacheKey);
    if (cached) {
      anchor.classList.remove("is-loading");
      if (requestId === state.wordLookupRequestId && state.wordLookupActiveElement === anchor) {
        showWordLookupPopup(anchor, word, cached);
      }
      return;
    }
    try {
      const response = await api.runtime.sendMessage({
        type: messageTypes.translateSubtitleWord,
        word,
        subtitleSentence: sentence,
        nextSubtitleSentence: nextSentence,
        sourceLanguage: state.sourceLanguage || "auto",
        targetLanguage: state.targetLanguage,
        subtitleContext: state.subtitleContext || "",
        url: window.location.href
      });
      if (requestId !== state.wordLookupRequestId || state.wordLookupActiveElement !== anchor || !anchor.isConnected) {
        return;
      }
      anchor.classList.remove("is-loading");
      const translatedText = response && response.ok && response.data
        ? String(response.data.translatedText || "").trim()
        : "";
      if (translatedText) {
        state.wordLookupCache.set(cacheKey, translatedText);
        showWordLookupPopup(anchor, word, translatedText);
      }
    } catch (_) {
      if (requestId === state.wordLookupRequestId && state.wordLookupActiveElement === anchor) {
        anchor.classList.remove("is-loading");
      }
    }
  }

  function handleWordLookupEnter(event) {
    const anchor = event.currentTarget;
    clearWordLookupState();
    state.wordLookupActiveElement = anchor;
    const requestId = state.wordLookupRequestId;
    anchor.classList.add("is-selected");
    state.wordLookupTimer = setTimeout(() => {
      state.wordLookupTimer = 0;
      startWordLookupTranslation(anchor, requestId);
    }, 300);
  }

  function handleWordLookupLeave(event) {
    if (state.wordLookupActiveElement === event.currentTarget) {
      clearWordLookupState();
    }
  }

  function appendSubtitleTextWithWordLookup(parent, text, nextText) {
    const source = String(text || "");
    const nextSentence = String(nextText || "").trim().slice(0, 1000);
    if (!isWordLookupEnabled()) {
      parent.textContent = source;
      return;
    }
    parent.classList.add("is-word-lookup");
    getWordLookupSegments(source).forEach((segment) => {
      if (!segment.word) {
        parent.appendChild(document.createTextNode(segment.text));
        return;
      }
      const word = document.createElement("span");
      word.className = "mt-video-subtitle-word";
      word.textContent = segment.text;
      word.dataset.word = segment.text;
      word.dataset.sentence = source.slice(0, 1000);
      word.dataset.nextSentence = nextSentence;
      word.addEventListener("mouseenter", handleWordLookupEnter);
      word.addEventListener("mouseleave", handleWordLookupLeave);
      parent.appendChild(word);
    });
  }

  function renderTakeoverSubtitle(sourceText, targetText, nextText) {
    const overlay = state.overlay;
    if (!overlay) {
      return;
    }
    const sourceValue = String(sourceText || "");
    const targetValue = String(targetText || "");
    const nextValue = String(nextText || "");
    const hidden = !sourceValue && !targetValue;
    if (
      state.renderedOverlayMode === "takeover"
      && state.renderedOverlaySourceText === sourceValue
      && state.renderedOverlayTargetText === targetValue
      && state.renderedOverlayNextText === nextValue
      && state.renderedOverlayHidden === hidden
      && overlay.classList.contains("is-takeover")
      && overlay.classList.contains("is-hidden") === hidden
    ) {
      return;
    }
    overlay.classList.add("is-takeover");
    if (hidden) {
      if (state.renderedOverlayMode !== "takeover" || state.renderedOverlayHidden !== true) {
        clearWordLookupState();
        overlay.replaceChildren();
      }
      overlay.classList.add("is-hidden");
      state.renderedOverlayMode = "takeover";
      state.renderedOverlaySourceText = sourceValue;
      state.renderedOverlayTargetText = targetValue;
      state.renderedOverlayNextText = nextValue;
      state.renderedOverlayPlainText = "";
      state.renderedOverlayHidden = true;
      return;
    }

    clearWordLookupState();
    overlay.replaceChildren();
    const lines = document.createElement("div");
    lines.className = "mt-video-subtitle-lines";
    if (sourceValue) {
      const source = document.createElement("span");
      source.className = "mt-video-subtitle-cue source-cue";
      source.dir = "auto";
      appendSubtitleTextWithWordLookup(source, sourceValue, nextValue);
      lines.appendChild(source);
    }
    if (targetValue) {
      const target = document.createElement("span");
      target.className = "mt-video-subtitle-cue target-cue";
      target.dir = "auto";
      target.textContent = targetValue;
      lines.appendChild(target);
    }
    overlay.appendChild(lines);
    overlay.classList.remove("is-hidden");
    state.renderedOverlayMode = "takeover";
    state.renderedOverlaySourceText = sourceValue;
    state.renderedOverlayTargetText = targetValue;
    state.renderedOverlayNextText = nextValue;
    state.renderedOverlayPlainText = "";
    state.renderedOverlayHidden = false;
  }

  function renderPlainSubtitle(text) {
    const overlay = state.overlay;
    if (!overlay) {
      return;
    }
    const value = String(text || "");
    const hidden = !value;
    if (
      state.renderedOverlayMode === "plain"
      && state.renderedOverlayPlainText === value
      && state.renderedOverlayHidden === hidden
      && !overlay.classList.contains("is-takeover")
      && overlay.classList.contains("is-hidden") === hidden
    ) {
      return;
    }
    overlay.classList.remove("is-takeover");
    overlay.textContent = value;
    overlay.classList.toggle("is-hidden", hidden);
    state.renderedOverlayMode = "plain";
    state.renderedOverlaySourceText = "";
    state.renderedOverlayTargetText = "";
    state.renderedOverlayNextText = "";
    state.renderedOverlayPlainText = value;
    state.renderedOverlayHidden = hidden;
  }

  function queueDomCaptionTranslation(id, text) {
    if (!id || !text || state.translations.has(id) || state.pendingIds.has(id) || state.failedIds.has(id)) {
      return;
    }
    state.domSourceById.set(id, text);
    if (state.queuedIdSet.has(id)) {
      return;
    }
    clearQueuedDomTextIds();
    state.queuedIds.unshift(id);
    state.queuedIdSet.add(id);
    processQueue();
  }

  function renderDomSubtitle() {
    const now = Date.now();
    maybeResetDomRuntimeAfterSeek();
    const liveText = getStableDomCaptionText(now);
    if (!liveText) {
      state.currentDomSubtitleId = "";
      renderTakeoverSubtitle("", "");
      return;
    }
    if (shouldCommitDomCaption(liveText, now)) {
      commitDomCaption(liveText, now);
    }

    const liveId = buildTextCueId(liveText);
    state.currentDomSubtitleId = liveId;
    const translatedText = state.translations.get(liveId) || findBestDomPrefixTranslation(liveText);
    renderTakeoverSubtitle(liveText, translatedText);
  }

  function renderCurrentSubtitle() {
    if (!state.active || !state.overlay) {
      return;
    }
    ensureActiveOverlayHost();
    if (isYouTubeSubtitleMode() && state.videoId) {
      const currentVideoId = getCurrentYouTubeVideoId();
      if (currentVideoId && currentVideoId !== state.videoId) {
        const shouldReactivate = state.manualActive;
        state.youtubeTimedTextEntries = [];
        deactivate();
        if (shouldReactivate) {
          scheduleManualReactivate(700);
        } else {
          scheduleRefresh(500);
        }
        return;
      }
    }
    updateHtml5OverlayPosition();
    if (state.subtitleMode === "youtube-dom") {
      renderDomSubtitle();
      return;
    }
    const activeCues = getActiveCues();
    const cueKey = activeCues.map((cue) => cue.id).join("|");
    const currentTime = Number(state.video && state.video.currentTime || 0);
    const queueSyncedToPlayback = syncQueueWithPlaybackState();
    if (cueKey && cueKey !== state.currentCueKey) {
      state.currentCueKey = cueKey;
      enqueuePriorityAroundCurrent();
    } else if (!queueSyncedToPlayback && shouldRefreshQueueAroundPlayback(currentTime)) {
      enqueuePriorityAroundCurrent();
    }
    const displayCues = getDisplayCues(activeCues);
    const nextSubtitleText = getNextSubtitleContextText(displayCues);
    const sourceText = displayCues
      .map((cue) => cue.text || "")
      .filter(Boolean)
      .join("\n");
    const targetText = displayCues
      .map((cue) => state.translations.get(cue.id) || "")
      .filter(Boolean)
      .join("\n");
    if (state.subtitleMode === "youtube" || isManualWordLookupMode()) {
      renderTakeoverSubtitle(sourceText, targetText, nextSubtitleText);
      return;
    }
    renderPlainSubtitle(targetText);
  }

  function startRenderLoop() {
    stopRenderLoop();
    renderCurrentSubtitle();
    state.renderTimer = setInterval(renderCurrentSubtitle, 120);
  }

  function buildActivationKey(source) {
    const trackId = source && source.track
      ? String(source.track.id || source.track.languageCode || source.track.label || "")
      : "";
    const video = source && source.video;
    const duration = video ? Math.round(Number(video.duration || 0)) : 0;
    return `${window.location.href}\0${String(source && source.videoId || "")}\0${trackId}\0${duration}`;
  }

  async function activate(options) {
    const opts = options || {};
    const manual = !!opts.manual;
    const settings = await loadSettings();
    const generation = ++state.generation;
    setStatus("loading");
    const source = await loadSubtitleSource();
    if (generation !== state.generation) {
      return { started: false, active: false, reason: "stale" };
    }
    const sample = source.kind === "youtube-dom"
      ? readYouTubeRenderedCaptionText()
      : source.cues.slice(0, 8).map((cue) => cue.text).join("\n");
    const decision = utils.resolveSubtitleTarget(settings, source.sourceLanguage, sample, { manual });
    const activationKey = buildActivationKey(source);
    if (!decision.shouldTranslate) {
      setStatus("off");
      state.autoAttemptKey = activationKey;
      return { started: false, active: false, reason: decision.reason };
    }

    state.active = true;
    state.manualActive = manual;
    state.settings = settings;
    state.video = source.video;
    state.videoId = String(source.videoId || "");
    state.track = source.track;
    state.cues = source.kind === "youtube" ? segmentSubtitleCues(source.cues) : source.cues;
    state.targetLanguage = decision.targetLanguage;
    state.sourceLanguage = decision.sourceLanguage || "auto";
    state.subtitleContext = "";
    state.subtitleMode = source.kind;
    state.translations = new Map();
    state.pendingIds = new Set();
    state.failedIds = new Set();
    state.queuedIds = [];
    state.queuedIdSet = new Set();
    state.activeBatches = 0;
    state.currentCueKey = "";
    state.currentDomSubtitleId = "";
    state.lastQueueRefreshMediaTime = null;
    state.lastVideoPaused = source.video ? !!source.video.paused : null;
    state.lastVideoTime = Number(source.video && source.video.currentTime || 0);
    state.domCaptionText = "";
    state.domCaptionStartedAtMs = 0;
    state.domCaptionChangedAtMs = 0;
    state.domCaptionLastSeenAtMs = 0;
    state.domCommittedText = "";
    state.domCommittedId = "";
    state.domCommittedAtMs = 0;
    state.domSourceById = new Map();
    state.autoAttemptKey = activationKey;
    ensureOverlay(source.video, source.kind);
    await loadSubtitleTopicContext(generation);
    if (generation !== state.generation || !state.active) {
      return { started: false, active: false, reason: "stale" };
    }
    setTakeoverMode(source.kind === "youtube" || source.kind === "youtube-dom");
    setStatus("on");
    enqueuePriorityAroundCurrent();
    startRenderLoop();
    return {
      started: true,
      active: true,
      sourceLanguage: state.sourceLanguage,
      targetLanguage: state.targetLanguage,
      cueCount: state.cues.length
    };
  }

  async function maybeAutoActivate() {
    if (!isSupportedPage() || !state.settings || !state.settings.videoBilingualSubtitlesAutoTranslate || state.active) {
      return;
    }
    if (state.autoAttemptKey && state.autoAttemptKey.startsWith(`${window.location.href}\0`)) {
      return;
    }
    try {
      await activate({ manual: false });
    } catch (_) {
      setStatus("off");
    }
  }

  async function toggleFromManual() {
    if (state.active) {
      const currentUrl = window.location.href;
      deactivate();
      state.autoAttemptKey = `${currentUrl}\0manual-off`;
      return { active: false };
    }
    const result = await activate({ manual: true });
    if (!result.started) {
      throw new Error(result.reason || "Could not start bilingual subtitles.");
    }
    return result;
  }

  function scheduleRefresh(delay) {
    if (state.refreshTimer) {
      clearTimeout(state.refreshTimer);
    }
    state.refreshTimer = setTimeout(() => {
      state.refreshTimer = 0;
      refresh().catch(() => {});
    }, Number(delay || 150));
  }

  function scheduleManualReactivate(delay) {
    setTimeout(() => {
      if (state.active || !isYouTubePage()) {
        return;
      }
      activate({ manual: true }).catch((error) => {
        setStatus("error", error && error.message ? error.message : "Could not restart bilingual subtitles.");
      });
    }, Number(delay || 500));
  }

  function setupMutationObserver() {
    if (state.mutationObserver || !document.documentElement) {
      return;
    }
    state.mutationObserver = new MutationObserver(() => {
      ensureYouTubeButton();
      if (!state.active && state.settings && state.settings.videoBilingualSubtitlesAutoTranslate) {
        scheduleRefresh(350);
      }
    });
    state.mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function setupYouTubeNavigationListeners() {
    if (state.youtubeNavigationListenerAttached || !isYouTubePage()) {
      return;
    }
    state.youtubeNavigationListenerAttached = true;
    const onNavigate = () => {
      state.youtubeTimedTextEntries = [];
      requestYouTubeSubtitleBridgeSnapshot();
      scheduleRefresh(100);
      setTimeout(ensureYouTubeButton, 250);
      setTimeout(ensureYouTubeButton, 800);
      setTimeout(ensureYouTubeButton, 1600);
    };
    window.addEventListener("yt-navigate-finish", onNavigate);
    window.addEventListener("yt-page-data-updated", onNavigate);
    window.addEventListener("popstate", onNavigate);
  }

  function startUrlWatcher() {
    if (state.urlTimer) {
      return;
    }
    state.lastUrl = window.location.href;
    state.urlTimer = setInterval(() => {
      if (state.lastUrl === window.location.href) {
        ensureYouTubeButton();
        return;
      }
      state.lastUrl = window.location.href;
      const shouldReactivate = state.active && state.manualActive;
      state.youtubeTimedTextEntries = [];
      if (state.active) {
        deactivate();
      }
      if (shouldReactivate) {
        scheduleManualReactivate(700);
      } else {
        scheduleRefresh(500);
      }
    }, 1000);
  }

  function attachStorageListener() {
    if (state.storageListenerAttached || !api.storage || !api.storage.onChanged) {
      return;
    }
    state.storageListenerAttached = true;
    api.storage.onChanged((changes, areaName) => {
      if (areaName !== "sync" || !changes || !changes[namespace.constants.storageKeys.settings]) {
        return;
      }
      const previousResultSettingsKey = getSubtitleResultSettingsKey(state.settings);
      const previousWordLookupEnabled = state.settings
        ? state.settings.videoBilingualSubtitlesWordLookupEnabled !== false
        : true;
      state.settings = normalizeSettings(changes[namespace.constants.storageKeys.settings].newValue || {});
      ensureYouTubeButton();
      if (state.active && !state.manualActive && !state.settings.videoBilingualSubtitlesAutoTranslate) {
        deactivate();
        return;
      }
      if (state.active && previousResultSettingsKey !== getSubtitleResultSettingsKey(state.settings)) {
        resetSubtitleResultRuntime();
        const generation = state.generation;
        setStatus("loading");
        loadSubtitleTopicContext(generation).finally(() => {
          if (generation !== state.generation || !state.active) {
            return;
          }
          setStatus("on");
          enqueuePriorityAroundCurrent();
          renderCurrentSubtitle();
        });
        return;
      }
      if (state.active && previousWordLookupEnabled !== (state.settings.videoBilingualSubtitlesWordLookupEnabled !== false)) {
        clearWordLookupState();
        resetOverlayRenderCache();
        renderCurrentSubtitle();
      }
      if (!state.active && state.settings.videoBilingualSubtitlesAutoTranslate) {
        scheduleRefresh(250);
      }
    });
  }

  async function refresh() {
    if (!isSupportedPage()) {
      return;
    }
    await loadSettings();
    if (!isYouTubePage() && !state.settings.videoBilingualSubtitlesAutoTranslate) {
      removeButton();
      return;
    }
    if (isYouTubePage()) {
      requestYouTubeSubtitleBridgeSnapshot();
    }
    ensureStyle();
    ensureYouTubeButton();
    setupMutationObserver();
    setupYouTubeNavigationListeners();
    startUrlWatcher();
    if (!state.active && state.settings.videoBilingualSubtitlesAutoTranslate) {
      await maybeAutoActivate();
    }
  }

  function start(getSettings) {
    state.getSettings = getSettings;
    attachStorageListener();
    refresh().catch(() => {});
  }

  namespace.videoSubtitleTranslator = {
    start,
    refresh,
    toggleFromManual,
    stop: deactivate,
    _test: {
      readPlayerResponseFromScripts,
      chooseYouTubeTrack,
      textTrackToCues,
      segmentSubtitleCues
    }
  };
}(globalThis));
