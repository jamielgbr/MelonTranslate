(function initYouTubeSubtitleBridgeLoader(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const SCRIPT_ID = "melontranslate-youtube-subtitle-page-bridge";

  function isYouTubeHost() {
    const host = String(window.location.hostname || "").toLowerCase();
    return host === "youtube.com"
      || host.endsWith(".youtube.com")
      || host === "youtube-nocookie.com"
      || host.endsWith(".youtube-nocookie.com");
  }

  function injectBridge() {
    if (!api || !api.runtime || typeof api.runtime.getURL !== "function" || !isYouTubeHost()) {
      return;
    }
    if (document.getElementById(SCRIPT_ID)) {
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = api.runtime.getURL("src/content/youtube-subtitle-page-bridge.js");
    script.async = false;
    script.onload = () => script.remove();
    const target = document.documentElement || document.head || document.body;
    if (target) {
      target.appendChild(script);
    }
  }

  if (document.documentElement) {
    injectBridge();
  } else {
    document.addEventListener("DOMContentLoaded", injectBridge, { once: true });
  }
}(globalThis));
