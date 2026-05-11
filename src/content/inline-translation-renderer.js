(function initInlineTranslationRenderer(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const styleId = "melontranslate-immersive-style";
  const sourceIdAttr = "data-melontranslate-source-id";
  const richTextMarkerPattern = /\[\[(\/?)MT([BI])\]\]/g;
  const richTextStripPattern = /\[\[\/?MT[BI]\]\]/g;
  let renderedByElement = new WeakMap();
  let expandedClipStates = new WeakMap();
  let expandedClipCounts = new WeakMap();
  let expandedClipsBySource = new WeakMap();
  const renderedNodes = new Set();
  const expandedClipElements = new Set();
  let sourceIdCounter = 0;

  function ensureStyle() {
    if (document.getElementById(styleId)) {
      return;
    }
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .mt-immersive-source {
        outline: 1px solid transparent;
      }
      .mt-immersive-translation {
        box-sizing: border-box;
        display: block;
        clear: none;
        margin: 0.35em 0 0.85em;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: inherit;
        font-family: inherit;
        font-size: 1em;
        line-height: 1.35;
        letter-spacing: 0;
        overflow-wrap: anywhere;
        opacity: 1;
      }
      .mt-immersive-translation[data-render-strategy="inside-inline"],
      .mt-immersive-translation[data-render-strategy="inside-block"] {
        display: inline;
        clear: none;
        margin: 0;
        opacity: 1;
      }
      .mt-immersive-translation-content {
        box-sizing: border-box;
        color: inherit;
        font: inherit;
        overflow-wrap: anywhere;
      }
      .mt-immersive-translation[data-render-strategy="inside-block"] > .mt-immersive-translation-content {
        display: inline-block;
        margin: 0.35em 0 0.15em;
      }
      .mt-immersive-translation[data-render-strategy="inside-inline"] > .mt-immersive-translation-content {
        display: inline;
      }
      li > .mt-immersive-translation {
        margin: 0.12em 0 0;
      }
      td > .mt-immersive-translation,
      th > .mt-immersive-translation {
        margin: 0.2em 0 0;
      }
      .mt-immersive-translation[data-mode="compact"] {
        margin-top: 0.12em;
        padding: 0;
        background: transparent;
        border-radius: 0;
      }
      .mt-immersive-translation[data-expanded-heading="true"] {
        margin: 0.12em 0 0.28em;
      }
      .mt-immersive-translation.is-loading,
      .mt-immersive-translation.is-error {
        opacity: 1;
      }
      .mt-immersive-translation button {
        margin-left: 0.75em;
        padding: 0.18em 0.58em;
        border: 1px solid currentColor;
        border-radius: 6px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: 0.9em;
        cursor: pointer;
      }
      .mt-immersive-translation button:hover,
      .mt-immersive-translation button:focus-visible {
        background: rgba(15, 23, 42, 0.08);
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function clampColorChannel(value) {
    return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
  }

  function parseColorChannel(value) {
    const raw = String(value || "").trim();
    if (raw.endsWith("%")) {
      return clampColorChannel(parseFloat(raw) * 2.55);
    }
    return clampColorChannel(parseFloat(raw));
  }

  function parseAlphaChannel(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return 1;
    }
    if (raw.endsWith("%")) {
      return Math.max(0, Math.min(1, parseFloat(raw) / 100));
    }
    return Math.max(0, Math.min(1, parseFloat(raw)));
  }

  function parseRgbColor(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw || raw === "transparent") {
      return raw === "transparent" ? { red: 0, green: 0, blue: 0, alpha: 0 } : null;
    }
    const hexMatch = raw.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
    if (hexMatch) {
      const hex = hexMatch[1].length === 3
        ? hexMatch[1].split("").map((digit) => digit + digit).join("")
        : hexMatch[1];
      return {
        red: parseInt(hex.slice(0, 2), 16),
        green: parseInt(hex.slice(2, 4), 16),
        blue: parseInt(hex.slice(4, 6), 16),
        alpha: 1
      };
    }
    const rgbMatch = raw.match(/^rgba?\((.+)\)$/i);
    if (!rgbMatch) {
      return null;
    }
    const parts = rgbMatch[1].replace(/,/g, " ").replace(/\s*\/\s*/g, " / ").split(/\s+/).filter(Boolean);
    const slashIndex = parts.indexOf("/");
    const channels = slashIndex >= 0 ? parts.slice(0, slashIndex) : parts;
    const alpha = slashIndex >= 0 ? parts[slashIndex + 1] : channels[3];
    if (channels.length < 3) {
      return null;
    }
    return {
      red: parseColorChannel(channels[0]),
      green: parseColorChannel(channels[1]),
      blue: parseColorChannel(channels[2]),
      alpha: parseAlphaChannel(alpha)
    };
  }

  function blendColors(foreground, background) {
    const alpha = Math.max(0, Math.min(1, foreground.alpha));
    return {
      red: clampColorChannel((foreground.red * alpha) + (background.red * (1 - alpha))),
      green: clampColorChannel((foreground.green * alpha) + (background.green * (1 - alpha))),
      blue: clampColorChannel((foreground.blue * alpha) + (background.blue * (1 - alpha))),
      alpha: 1
    };
  }

  function getLinearColorChannel(value) {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  }

  function getRelativeLuminance(color) {
    return (0.2126 * getLinearColorChannel(color.red))
      + (0.7152 * getLinearColorChannel(color.green))
      + (0.0722 * getLinearColorChannel(color.blue));
  }

  function getContrastRatio(foreground, background) {
    const foregroundLuminance = getRelativeLuminance(foreground);
    const backgroundLuminance = getRelativeLuminance(background);
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function colorToRgbString(color) {
    return `rgb(${clampColorChannel(color.red)}, ${clampColorChannel(color.green)}, ${clampColorChannel(color.blue)})`;
  }

  function getEffectiveBackgroundColor(element) {
    const fallback = { red: 255, green: 255, blue: 255, alpha: 1 };
    if (!element || !window.getComputedStyle) {
      return fallback;
    }
    const layers = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      try {
        const background = parseRgbColor(window.getComputedStyle(current).backgroundColor);
        if (background && background.alpha > 0) {
          layers.push(background);
          if (background.alpha >= 0.99) {
            break;
          }
        }
      } catch (_) {}
      current = current.parentElement;
    }
    return layers.reverse().reduce((background, layer) => blendColors(layer, background), fallback);
  }

  function getReadableTextColor(element, sourceColorValue) {
    const sourceColor = parseRgbColor(sourceColorValue);
    if (!sourceColor || sourceColor.alpha <= 0.05) {
      return sourceColorValue || "";
    }
    const backgroundColor = getEffectiveBackgroundColor(element);
    const visibleSourceColor = sourceColor.alpha < 0.99 ? blendColors(sourceColor, backgroundColor) : sourceColor;
    if (getContrastRatio(visibleSourceColor, backgroundColor) >= 4.5) {
      return sourceColorValue || colorToRgbString(visibleSourceColor);
    }
    const darkFallback = { red: 15, green: 23, blue: 42, alpha: 1 };
    const lightFallback = { red: 255, green: 255, blue: 255, alpha: 1 };
    return getContrastRatio(lightFallback, backgroundColor) >= getContrastRatio(darkFallback, backgroundColor)
      ? colorToRgbString(lightFallback)
      : colorToRgbString(darkFallback);
  }

  function isYouTubeCardTitle(element) {
    return !!element && element.matches && element.matches("h3.ytLockupMetadataViewModelHeadingReset,h3.shortsLockupViewModelHostMetadataTitle");
  }

  function getTextStyleElement(element) {
    if (!isYouTubeCardTitle(element)) {
      return element;
    }
    return element.querySelector(".ytLockupMetadataViewModelTitle [role='text'],.shortsLockupViewModelHostEndpoint [role='text'],a [role='text'],[role='text']") || element;
  }

  function getMinimumSyncedFontSize(element) {
    if (!element || !element.matches) {
      return 0;
    }
    if (element.matches("h3.shortsLockupViewModelHostMetadataTitle")) {
      return 16;
    }
    if (element.matches("h3.ytLockupMetadataViewModelHeadingReset")) {
      return 14;
    }
    return 0;
  }

  function getSyncedFontSize(element, fontSize) {
    const minimum = getMinimumSyncedFontSize(element);
    if (!minimum) {
      return fontSize || "";
    }
    const parsed = parseFloat(fontSize);
    return Number.isFinite(parsed) ? `${Math.max(parsed, minimum)}px` : fontSize || "";
  }

  function syncContainerLayout(item, node) {
    if (!item || !item.element || !node || !window.getComputedStyle) {
      return;
    }
    try {
      const styleElement = getTextStyleElement(item.element);
      const style = window.getComputedStyle(styleElement);
      node.style.color = getReadableTextColor(styleElement, style.color) || "";
      node.style.fontFamily = style.fontFamily || "";
      node.style.fontSize = getSyncedFontSize(item.element, style.fontSize);
      node.style.fontStyle = style.fontStyle || "";
      node.style.fontWeight = style.fontWeight || "";
      node.style.lineHeight = style.lineHeight && style.lineHeight !== "normal" ? style.lineHeight : "";
    } catch (_) {}
    if (item.element.matches && item.element.matches("li")) {
      node.style.marginLeft = "";
      node.style.marginRight = "";
      return;
    }
    if (node.dataset.renderStrategy && node.dataset.renderStrategy !== "after-block") {
      node.style.marginLeft = "";
      node.style.marginRight = "";
      return;
    }
    try {
      const style = window.getComputedStyle(item.element);
      node.style.marginLeft = style.marginLeft || "";
      node.style.marginRight = style.marginRight || "";
    } catch (_) {}
  }

  function isClippingElement(element) {
    if (!element || !window.getComputedStyle) {
      return false;
    }
    try {
      const style = window.getComputedStyle(element);
      return /hidden|clip/.test([style.overflow, style.overflowX, style.overflowY].join(" "));
    } catch (_) {
      return false;
    }
  }

  function getCardTextReference(element) {
    const wrapper = element && element.closest && element.closest("[data-testid='card-text-wrapper']");
    if (!wrapper) {
      return null;
    }
    let reference = element;
    let current = element.parentElement;
    while (current && current !== wrapper) {
      reference = current;
      current = current.parentElement;
    }
    return reference;
  }

  function isLocalHeadingShell(element, source) {
    if (!element || !element.getBoundingClientRect || !source || !source.getBoundingClientRect) {
      return false;
    }
    try {
      const elementRect = element.getBoundingClientRect();
      const sourceRect = source.getBoundingClientRect();
      const localClipMaxHeight = Math.max(120, sourceRect.height * 4);
      return elementRect.height > 0
        && elementRect.height <= localClipMaxHeight
        && (isClippingElement(element) || elementRect.height <= sourceRect.height * 1.5);
    } catch (_) {
      return false;
    }
  }

  function getLocalHeadingClips(source) {
    if (!source || !source.matches || source.matches("[data-testid='card-headline']")) {
      return [];
    }
    const clips = [];
    let ancestor = source.parentElement;
    let depth = 0;
    while (ancestor && ancestor !== document.body && depth < 5) {
      if ((depth === 0 && ancestor.children.length === 1) || isLocalHeadingShell(ancestor, source)) {
        clips.push(ancestor);
      }
      ancestor = ancestor.parentElement;
      depth += 1;
    }
    return clips;
  }

  function expandLocalHeadingClips(source) {
    const clips = getLocalHeadingClips(source);
    if (!clips.length) {
      return;
    }
    expandedClipsBySource.set(source, clips);
    clips.forEach((clip) => {
      if (!expandedClipStates.has(clip)) {
        expandedClipStates.set(clip, {
          height: clip.style.height,
          minHeight: clip.style.minHeight,
          maxHeight: clip.style.maxHeight,
          overflow: clip.style.overflow,
          overflowX: clip.style.overflowX,
          overflowY: clip.style.overflowY,
          backgroundRepeat: clip.style.backgroundRepeat
        });
        expandedClipElements.add(clip);
      }
      expandedClipCounts.set(clip, (expandedClipCounts.get(clip) || 0) + 1);
      const rect = clip.getBoundingClientRect && clip.getBoundingClientRect();
      if (rect && rect.height > 0) {
        clip.style.minHeight = `${Math.ceil(rect.height)}px`;
      }
      clip.style.height = "auto";
      clip.style.maxHeight = "none";
      clip.style.overflow = "visible";
      clip.style.overflowX = "visible";
      clip.style.overflowY = "visible";
      clip.style.backgroundRepeat = "repeat";
    });
    return clips;
  }

  function restoreClipElement(clip) {
    const state = expandedClipStates.get(clip);
    if (!state) {
      return;
    }
    clip.style.height = state.height;
    clip.style.minHeight = state.minHeight;
    clip.style.maxHeight = state.maxHeight;
    clip.style.overflow = state.overflow;
    clip.style.overflowX = state.overflowX;
    clip.style.overflowY = state.overflowY;
    clip.style.backgroundRepeat = state.backgroundRepeat;
    expandedClipStates.delete(clip);
    expandedClipCounts.delete(clip);
    expandedClipElements.delete(clip);
  }

  function restoreLocalHeadingClips(source) {
    const clips = expandedClipsBySource.get(source) || [];
    clips.forEach((clip) => {
      const count = Math.max(0, (expandedClipCounts.get(clip) || 0) - 1);
      if (count > 0) {
        expandedClipCounts.set(clip, count);
      } else {
        restoreClipElement(clip);
      }
    });
    expandedClipsBySource.delete(source);
  }

  function getAfterBlockReference(item) {
    const element = item && item.element;
    if (!element || !element.matches || !element.matches("h1,h2,h3,h4,h5,h6")) {
      return element;
    }

    if (element.matches("[data-testid='card-headline']")) {
      return getCardTextReference(element) || element;
    }

    return element;
  }

  function getRenderStrategy(item) {
    if (item && item.renderStrategy) {
      return item.renderStrategy;
    }
    if (item && item.element && item.element.matches) {
      if (item.element.matches("li")) {
        return "inside-list-item";
      }
      if (item.element.matches("td,th")) {
        return "inside-cell";
      }
    }
    return "inside-block";
  }

  function createNodeForStrategy(strategy) {
    return document.createElement(strategy === "inside-inline" || strategy === "inside-block" ? "span" : "div");
  }

  function insertContainer(item, node, strategy) {
    if (strategy === "inside-list-item" || strategy === "inside-cell" || strategy === "inside-inline" || strategy === "inside-block") {
      item.element.appendChild(node);
      return;
    }
    const reference = getAfterBlockReference(item) || item.element;
    if (item.element && item.element.matches && item.element.matches("h1,h2,h3,h4,h5,h6")) {
      const clips = expandLocalHeadingClips(item.element);
      if (clips && clips.length) {
        node.dataset.expandedHeading = "true";
      }
    }
    reference.insertAdjacentElement("afterend", node);
  }

  function createContainer(item, settings) {
    const existing = renderedByElement.get(item.element);
    if (existing && existing.isConnected) {
      syncContainerLayout(item, existing);
      return existing;
    }

    const strategy = getRenderStrategy(item);
    const node = createNodeForStrategy(strategy);
    const sourceId = item.element.getAttribute(sourceIdAttr) || `mt-source-${++sourceIdCounter}`;
    node.className = "mt-immersive-translation";
    node.dataset.melontranslateImmersive = "translation";
    node.dataset.fingerprint = item.fingerprint || "";
    node.dataset.renderStrategy = strategy;
    node.setAttribute(sourceIdAttr, sourceId);
    node.dataset.mode = settings && settings.immersiveTranslationDisplayMode === "compact"
      ? "compact"
      : "below-original";
    node.__melontranslateSourceElement = item.element;
    item.element.classList.add("mt-immersive-source");
    item.element.setAttribute("data-melontranslate-immersive", "source");
    item.element.setAttribute(sourceIdAttr, sourceId);
    insertContainer(item, node, strategy);
    syncContainerLayout(item, node);
    renderedByElement.set(item.element, node);
    renderedNodes.add(node);
    return node;
  }

  function setStateClass(node, stateName) {
    node.classList.toggle("is-loading", stateName === "loading");
    node.classList.toggle("is-error", stateName === "error");
  }

  function stripRichTextMarkers(text) {
    return String(text || "").replace(richTextStripPattern, "");
  }

  function createRichTextElement(type) {
    return document.createElement(type === "B" ? "strong" : "em");
  }

  function createRichTextFragment(text) {
    const value = String(text || "");
    if (!richTextStripPattern.test(value)) {
      richTextStripPattern.lastIndex = 0;
      return null;
    }
    richTextStripPattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    const stack = [{ type: "root", node: fragment }];
    let index = 0;
    richTextMarkerPattern.lastIndex = 0;

    let match = richTextMarkerPattern.exec(value);
    while (match) {
      if (match.index > index) {
        stack[stack.length - 1].node.appendChild(document.createTextNode(value.slice(index, match.index)));
      }
      const isClosing = match[1] === "/";
      const markerType = match[2];
      if (isClosing) {
        if (stack.length <= 1 || stack[stack.length - 1].type !== markerType) {
          richTextMarkerPattern.lastIndex = 0;
          return null;
        }
        stack.pop();
      } else {
        const element = createRichTextElement(markerType);
        stack[stack.length - 1].node.appendChild(element);
        stack.push({ type: markerType, node: element });
      }
      index = richTextMarkerPattern.lastIndex;
      match = richTextMarkerPattern.exec(value);
    }

    if (index < value.length) {
      stack[stack.length - 1].node.appendChild(document.createTextNode(value.slice(index)));
    }
    richTextMarkerPattern.lastIndex = 0;
    return stack.length === 1 ? fragment : null;
  }

  function appendContainerContent(target, text, richText) {
    if (richText) {
      const fragment = createRichTextFragment(text);
      if (fragment) {
        target.appendChild(fragment);
        return;
      }
      target.textContent = stripRichTextMarkers(text);
      return;
    }
    target.textContent = String(text || "").trim();
  }

  function setContainerText(node, text, options) {
    const value = String(text || "").trim();
    const richText = !!(options && options.richText);
    const strategy = node.dataset.renderStrategy || "after-block";
    node.textContent = "";
    if (strategy === "inside-inline") {
      node.appendChild(document.createTextNode("\u00a0\u00a0"));
    } else if (strategy === "inside-block") {
      node.appendChild(document.createElement("br"));
    }
    if (strategy === "inside-inline" || strategy === "inside-block") {
      const content = document.createElement("span");
      content.className = "mt-immersive-translation-content";
      appendContainerContent(content, value, richText);
      node.appendChild(content);
      return;
    }
    appendContainerContent(node, value, richText);
  }

  function renderLoading(item, settings) {
    ensureStyle();
    const node = createContainer(item, settings);
    setStateClass(node, "loading");
    setContainerText(node, "Translating...");
    return node;
  }

  function renderTranslation(item, translatedText, settings) {
    ensureStyle();
    const node = createContainer(item, settings);
    setStateClass(node, "ready");
    setContainerText(node, translatedText, { richText: !!(item && item.renderRichText) });
    return node;
  }

  function renderError(item, message, settings, onRetry) {
    ensureStyle();
    const node = createContainer(item, settings);
    setStateClass(node, "error");
    setContainerText(node, message || "Translation failed.");
    if (typeof onRetry === "function" && !String(node.dataset.renderStrategy || "").startsWith("inside-")) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Retry";
      button.addEventListener("click", () => onRetry(item));
      node.appendChild(button);
    }
    return node;
  }

  function removeForElement(element) {
    const node = renderedByElement.get(element);
    if (node) {
      node.remove();
      renderedNodes.delete(node);
      renderedByElement.delete(element);
    }
    restoreLocalHeadingClips(element);
    if (element && element.removeAttribute) {
      element.classList.remove("mt-immersive-source");
      element.removeAttribute("data-melontranslate-immersive");
      element.removeAttribute(sourceIdAttr);
    }
  }

  function clearAll() {
    renderedNodes.forEach((node) => node.remove());
    renderedNodes.clear();
    renderedByElement = new WeakMap();
    expandedClipElements.forEach(restoreClipElement);
    expandedClipElements.clear();
    expandedClipStates = new WeakMap();
    expandedClipCounts = new WeakMap();
    expandedClipsBySource = new WeakMap();
    document.querySelectorAll("[data-melontranslate-immersive='source']").forEach((element) => {
      element.classList.remove("mt-immersive-source");
      element.removeAttribute("data-melontranslate-immersive");
      element.removeAttribute(sourceIdAttr);
    });
  }

  function cleanupDisconnected() {
    renderedNodes.forEach((node) => {
      const source = node.__melontranslateSourceElement;
      if (node.isConnected && source && source.isConnected) {
        return;
      }
      node.remove();
      renderedNodes.delete(node);
      if (source) {
        restoreLocalHeadingClips(source);
        renderedByElement.delete(source);
      }
    });
  }

  namespace.inlineTranslationRenderer = {
    clearAll,
    cleanupDisconnected,
    ensureStyle,
    removeForElement,
    renderError,
    renderLoading,
    renderTranslation
  };
}(globalThis));
