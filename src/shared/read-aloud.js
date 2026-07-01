(function initReadAloud(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const i18n = namespace.i18n || { t: function(value) { return String(value || ""); } };
  const t = i18n.t;

  const SPEAK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="currentColor"/></svg>';
  const STOP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor"/></svg>';

  function decodeAudioBase64(value) {
    const binary = atob(String(value || ""));
    return Uint8Array.from(binary, function(char) {
      return char.charCodeAt(0);
    });
  }

  function getClipBytes(clip) {
    if (clip && typeof clip.audioBase64 === "string" && clip.audioBase64) {
      return decodeAudioBase64(clip.audioBase64);
    }
    if (clip && clip.audioData instanceof ArrayBuffer) {
      return new Uint8Array(clip.audioData);
    }
    if (clip && ArrayBuffer.isView(clip.audioData)) {
      return new Uint8Array(clip.audioData.buffer, clip.audioData.byteOffset, clip.audioData.byteLength);
    }
    if (clip && Array.isArray(clip.audioData)) {
      return new Uint8Array(clip.audioData);
    }
    return new Uint8Array();
  }

  function playClip(audio, url, getToken, token) {
    return new Promise(function(resolve, reject) {
      const cleanup = function() {
        audio.onended = null;
        audio.onerror = null;
        audio.onpause = null;
      };

      audio.onended = function() { cleanup(); resolve(); };
      audio.onerror = function() { cleanup(); reject(new Error("Could not play the Google read aloud audio.")); };
      audio.onpause = function() {
        if (token !== getToken()) { cleanup(); resolve(); }
      };

      audio.src = url;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise.catch(function(error) { cleanup(); reject(error); });
      }

      if (token !== getToken()) { cleanup(); resolve(); }
    });
  }

  async function playReadAloudClips(clips, token, getToken, onAudio, onDone) {
    const audio = new Audio();
    onAudio(audio);

    for (const clip of clips) {
      if (token !== getToken()) {
        break;
      }
      const audioBytes = getClipBytes(clip);
      if (!audioBytes.byteLength) {
        throw new Error("Could not decode the Google read aloud audio.");
      }
      const blob = new Blob([audioBytes], { type: clip.mimeType || "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      try {
        await playClip(audio, url, getToken, token);
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    if (token === getToken()) {
      onDone();
    }
  }

  function stopAudioState(raState) {
    raState.token += 1;
    raState.loading = false;
    raState.playing = false;
    if (raState.audio) {
      raState.audio.pause();
      raState.audio.src = "";
      raState.audio = null;
    }
  }

  function setSvg(el, svgStr) {
    const doc = new DOMParser().parseFromString(svgStr, "text/html");
    el.replaceChildren(doc.body.firstChild);
  }

  function updateButton(button, raState, hasText, playLabel, stopLabel) {
    if (!button) {
      return;
    }
    const visible = !!hasText;
    if (typeof button.classList !== "undefined") {
      button.classList.toggle("hidden", !visible);
    }
    if (!visible) {
      button.disabled = true;
      setSvg(button, SPEAK_SVG);
      return;
    }
    if (raState.loading) {
      button.disabled = true;
      setSvg(button, SPEAK_SVG);
      button.title = t("Loading\u2026");
      button.setAttribute("aria-label", t("Loading\u2026"));
      return;
    }
    button.disabled = !hasText;
    setSvg(button, raState.playing ? STOP_SVG : SPEAK_SVG);
    button.title = raState.playing ? stopLabel : playLabel;
    button.setAttribute("aria-label", raState.playing ? stopLabel : playLabel);
  }

  namespace.readAloud = {
    SPEAK_SVG,
    STOP_SVG,
    decodeAudioBase64,
    getClipBytes,
    playClip,
    playReadAloudClips,
    stopAudioState,
    updateButton
  };
}(globalThis));
