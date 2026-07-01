(function initYouTubeSubtitlePageBridge(root) {
  const MARKER = "__melonTranslateYouTubeSubtitleBridgeV1";
  const PAGE_SOURCE = "melontranslate-youtube-subtitle-bridge";
  const CONTENT_SOURCE = "melontranslate-youtube-subtitle-content";
  const TYPE_CAPTURED = "CAPTURED_TIMEDTEXT";
  const TYPE_REQUEST_SNAPSHOT = "REQUEST_TIMEDTEXT_SNAPSHOT";
  const TYPE_SNAPSHOT = "TIMEDTEXT_SNAPSHOT";
  const MAX_ENTRIES = 16;
  const MAX_BODY_CHARS = 8000000;
  const entries = [];
  const recentKeys = new Set();

  if (root[MARKER]) {
    return;
  }
  root[MARKER] = true;

  function targetOrigin() {
    return root.location && root.location.origin ? root.location.origin : "*";
  }

  function post(type, payload) {
    root.postMessage(Object.assign({
      source: PAGE_SOURCE,
      type
    }, payload || {}), targetOrigin());
  }

  function isYouTubeTimedTextUrl(rawUrl) {
    let url;
    try {
      url = new URL(String(rawUrl || ""), root.location && root.location.href || undefined);
    } catch (_) {
      return false;
    }
    const host = url.hostname.toLowerCase();
    const isYouTubeHost = host === "youtube.com"
      || host.endsWith(".youtube.com")
      || host === "youtube-nocookie.com"
      || host.endsWith(".youtube-nocookie.com");
    return isYouTubeHost && /\/(?:api\/)?timedtext\/?$/i.test(url.pathname);
  }

  function getRequestUrl(input) {
    if (typeof input === "string") {
      return input;
    }
    if (input && typeof input.url === "string") {
      return input.url;
    }
    return "";
  }

  function getHeader(headers, name) {
    if (!headers || typeof headers.get !== "function") {
      return "";
    }
    try {
      return headers.get(name) || "";
    } catch (_) {
      return "";
    }
  }

  function remember(details) {
    const body = String(details && details.body || "");
    if (!body) {
      return;
    }
    const url = String(details && details.url || "");
    if (!isYouTubeTimedTextUrl(url)) {
      return;
    }
    if (body.length > MAX_BODY_CHARS) {
      return;
    }
    const key = `${url}\0${body.length}\0${body.slice(0, 120)}`;
    if (recentKeys.has(key)) {
      return;
    }
    recentKeys.add(key);
    if (recentKeys.size > MAX_ENTRIES * 3) {
      const first = recentKeys.values().next();
      if (!first.done) {
        recentKeys.delete(first.value);
      }
    }

    const entry = {
      id: `${Date.now()}:${Math.random().toString(36).slice(2)}`,
      source: String(details && details.source || ""),
      capturedAt: Date.now(),
      url,
      finalUrl: String(details && details.finalUrl || url),
      contentType: String(details && details.contentType || ""),
      body,
      bodyLength: body.length
    };
    entries.unshift(entry);
    entries.splice(MAX_ENTRIES);
    post(TYPE_CAPTURED, { entry });
  }

  function installFetchHook() {
    const originalFetch = root.fetch;
    if (typeof originalFetch !== "function" || originalFetch.__melonTranslateSubtitleBridge) {
      return;
    }
    function wrappedFetch() {
      const requestUrl = getRequestUrl(arguments[0]);
      const shouldCapture = isYouTubeTimedTextUrl(requestUrl);
      const responsePromise = originalFetch.apply(this, arguments);
      if (shouldCapture && responsePromise && typeof responsePromise.then === "function") {
        responsePromise.then((response) => {
          if (!response || typeof response.clone !== "function") {
            return;
          }
          const clone = response.clone();
          clone.text().then((body) => {
            remember({
              source: "fetch",
              url: requestUrl,
              finalUrl: clone.url || response.url || requestUrl,
              contentType: getHeader(clone.headers || response.headers, "content-type"),
              body
            });
          }).catch(() => {});
        }).catch(() => {});
      }
      return responsePromise;
    }
    wrappedFetch.__melonTranslateSubtitleBridge = true;
    wrappedFetch.__melonTranslateOriginalFetch = originalFetch;
    root.fetch = wrappedFetch;
  }

  function installXhrHook() {
    const XHR = root.XMLHttpRequest;
    const proto = XHR && XHR.prototype;
    if (!proto || proto.__melonTranslateSubtitleBridge) {
      return;
    }
    const originalOpen = proto.open;
    const originalSend = proto.send;
    proto.open = function openWithSubtitleCapture(method, url) {
      this.__melonTranslateSubtitleUrl = getRequestUrl(url);
      return originalOpen.apply(this, arguments);
    };
    proto.send = function sendWithSubtitleCapture() {
      const xhr = this;
      const requestUrl = xhr.__melonTranslateSubtitleUrl;
      if (isYouTubeTimedTextUrl(requestUrl)) {
        xhr.addEventListener("loadend", () => {
          try {
            const responseType = String(xhr.responseType || "");
            if (responseType && responseType !== "text") {
              return;
            }
            remember({
              source: "xhr",
              url: requestUrl,
              finalUrl: xhr.responseURL || requestUrl,
              contentType: xhr.getResponseHeader("content-type") || "",
              body: xhr.responseText || ""
            });
          } catch (_) {}
        });
      }
      return originalSend.apply(this, arguments);
    };
    proto.__melonTranslateSubtitleBridge = true;
  }

  root.addEventListener("message", (event) => {
    if (event.source !== root) {
      return;
    }
    const data = event.data;
    if (!data || data.source !== CONTENT_SOURCE || data.type !== TYPE_REQUEST_SNAPSHOT) {
      return;
    }
    post(TYPE_SNAPSHOT, { entries: entries.slice() });
  });

  installFetchHook();
  installXhrHook();
}(globalThis));
