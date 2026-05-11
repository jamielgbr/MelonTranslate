(function initDomTextScanner(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};

  const BLOCK_SELECTOR = [
    "p",
    "li",
    "blockquote",
    "figcaption",
    "dd",
    "dt",
    "td",
    "th",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6"
  ].join(",");

  const TEXT_CONTAINER_SELECTOR = [
    "div.p",
    "div.p_mainnew",
    "div.article-body",
    "div.article-content",
    "div.entry-content",
    "div.post-body",
    "div.post-content",
    "div.story-body",
    "[data-testid='card-description']",
    "[data-testid='tweetText']",
    "article div[lang]",
    "[itemprop='articleBody']"
  ].join(",");

  const INLINE_TEXT_CONTAINER_SELECTOR = [
    "div.p",
    "div.p_mainnew",
    "[data-testid='tweetText']",
    "article div[lang]"
  ].join(",");

  const SHORT_TEXT_CONTAINER_SELECTOR = [
    "[data-testid='card-description']",
    "[data-testid='tweetText']",
    "article div[lang]"
  ].join(",");
  const SHORT_TEXT_MIN_MEANINGFUL_LENGTH = 2;
  const LIST_ITEM_MIN_MEANINGFUL_LENGTH = 2;
  const HEADING_MIN_MEANINGFUL_LENGTH = 8;
  const SUMMARY_MIN_MEANINGFUL_LENGTH = 8;
  const STANDALONE_INLINE_SEGMENT_MIN_LENGTH = 80;
  const MEANINGFUL_CHARACTER_PATTERN = /[\p{L}\p{N}]/gu;
  const STRUCTURED_LINE_ITEM_PATTERN = /^(?:(?:\d{1,2}:)?\d{1,2}:\d{2}\s*[-:\u2013\u2014]\s*\S|(?:[-*\u2022]\s+|\d{1,3}[.)]\s+|[A-Za-z][.)]\s+)\S)/u;
  const SHORT_SUMMARY_HINT_PATTERN = /(?:dek|deck|summary|description|subtitle|subhead|standfirst|lede)/i;
  const TEXT_SEGMENT_ATTR = "data-melontranslate-text-segment";
  const TEXT_SEGMENT_CONTAINER_ATTR = "data-melontranslate-segmented";
  const RICH_TEXT_FORMAT = "melontranslate-rich-v1";
  const RICH_TEXT_BOLD_OPEN = "[[MTB]]";
  const RICH_TEXT_BOLD_CLOSE = "[[/MTB]]";
  const RICH_TEXT_ITALIC_OPEN = "[[MTI]]";
  const RICH_TEXT_ITALIC_CLOSE = "[[/MTI]]";
  const RICH_TEXT_MARKER_PATTERN = /\[\[\/?MT[BI]\]\]/g;
  const STANDALONE_INLINE_SEGMENT_SELECTOR = "i,em";
  const SEGMENTABLE_CONTAINER_SELECTOR = [
    INLINE_TEXT_CONTAINER_SELECTOR,
    "p",
    STANDALONE_INLINE_SEGMENT_SELECTOR
  ].join(",");
  const BLOCK_CHILD_SEGMENT_SELECTOR = [
    "p",
    "div",
    "ol",
    "ul",
    "blockquote"
  ].join(",");

  const TEXT_BLOCK_SELECTOR = [
    BLOCK_SELECTOR,
    TEXT_CONTAINER_SELECTOR
  ].join(",");

  const ALWAYS_SKIP_CLOSEST_SELECTOR = [
    "script",
    "style",
    "noscript",
    "template",
    "textarea",
    "input",
    "select",
    "pre",
    "code",
    "kbd",
    "samp",
    "[contenteditable]:not([contenteditable='false'])",
    ".mt-immersive-translation",
    "[data-melontranslate-immersive='translation']",
    "#" + namespace.constants.popupId,
    "#melontranslate-input-button-host",
    "#melontranslate-input-panel-host"
  ].join(",");

  const DEFAULT_SKIP_CLOSEST_SELECTOR = [
    "button",
    "footer",
    "aside",
    "nav",
    "menu",
    "[role='contentinfo']",
    "[role='complementary']",
    "[role='navigation']",
    "[role='toolbar']",
    "#footer",
    "#right",
    "#sidebar",
    "#sidebar-wrapper",
    "#sidebar-wrapper-left",
    "#sidebar-wrapper-right",
    "#slashboxes",
    ".footer",
    ".site-footer",
    ".page-footer",
    ".topbar",
    ".toolbar",
    ".navbar",
    ".navigation",
    ".menu",
    ".actions",
    ".action-bar",
    ".controls",
    ".story-controls",
    ".post-actions",
    ".article-actions",
    ".login",
    ".login_r",
    ".login_rr",
    "ul[id*='nav']",
    ".sidebar",
    ".side",
    ".side-bar",
    ".rail-right",
    ".right-rail",
    ".widget",
    ".widgets",
    ".widget-area",
    ".crayons-card",
    ".author",
    ".author-info",
    ".author-card",
    ".byline",
    ".story-byline",
    ".meta",
    ".article-foot",
    ".tags",
    ".tag-bar",
    ".tag-list",
    ".tag-listing",
    ".tagline",
    ".crayons-tag",
    ".share",
    ".social",
    ".related",
    ".recommended",
    ".popular",
    ".most-read",
    "ul.flat-list.buttons"
  ].join(",");

  const EXPLICIT_TEXT_ROOT_SELECTOR = [
    "a",
    "button",
    "span",
    "strong",
    "b",
    "em",
    "i",
    "time",
    "small",
    "label",
    "summary",
    "cite",
    "figcaption",
    "div",
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6"
  ].join(",");

  const INLINE_RENDER_SELECTOR = [
    "a",
    "button",
    "span",
    "strong",
    "b",
    "em",
    "i",
    "time",
    "small",
    "label",
    "summary",
    "cite"
  ].join(",");

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function hashText(text) {
    const normalized = normalizeText(text);
    let hash = 2166136261;
    for (let index = 0; index < normalized.length; index += 1) {
      hash ^= normalized.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function isElementHidden(element) {
    if (!element || !element.getBoundingClientRect) {
      return true;
    }
    const style = window.getComputedStyle(element);
    if (!style || style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return true;
    }
    const rects = element.getClientRects();
    if (!rects || rects.length === 0) {
      return true;
    }
    const rect = element.getBoundingClientRect();
    return rect.width <= 0 || rect.height <= 0;
  }

  function isTextNodeElementHidden(element) {
    if (!element || !element.getAttribute) {
      return false;
    }
    if (element.hidden || element.getAttribute("aria-hidden") === "true") {
      return true;
    }
    const style = window.getComputedStyle(element);
    return !!style && (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0);
  }

  function shouldSkipTextElement(element) {
    return !!element && (
      element.matches(ALWAYS_SKIP_CLOSEST_SELECTOR)
        || element.matches("img,svg,canvas,video,audio,iframe,picture,source")
        || isTextNodeElementHidden(element)
    );
  }

  function getNodeText(node) {
    if (!node) {
      return "";
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || "";
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }
    if (isBrNode(node)) {
      return "\n";
    }
    if (shouldSkipTextElement(node)) {
      return "";
    }
    return Array.from(node.childNodes || []).map(getNodeText).join(" ");
  }

  function getElementText(element) {
    return normalizeText(getNodeText(element));
  }

  function stripRichTextMarkers(text) {
    return String(text || "").replace(RICH_TEXT_MARKER_PATTERN, "");
  }

  function parseFontWeight(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "bold" || raw === "bolder") {
      return 700;
    }
    if (raw === "normal" || raw === "lighter") {
      return 400;
    }
    const numeric = Number.parseInt(raw, 10);
    return Number.isFinite(numeric) ? numeric : 400;
  }

  function readElementInlineFormat(element, rootElement) {
    const state = { bold: false, italic: false };
    if (!element || element === rootElement || element.nodeType !== Node.ELEMENT_NODE) {
      return state;
    }
    if (element.matches("strong,b")) {
      state.bold = true;
    }
    if (element.matches("em,i")) {
      state.italic = true;
    }
    if (!window.getComputedStyle) {
      return state;
    }
    try {
      const style = window.getComputedStyle(element);
      const parentStyle = element.parentElement && element.parentElement.nodeType === Node.ELEMENT_NODE
        ? window.getComputedStyle(element.parentElement)
        : null;
      if (parseFontWeight(style.fontWeight) >= 600 && (!parentStyle || parseFontWeight(parentStyle.fontWeight) < 600)) {
        state.bold = true;
      }
      if (/italic|oblique/i.test(style.fontStyle || "") && (!parentStyle || style.fontStyle !== parentStyle.fontStyle)) {
        state.italic = true;
      }
    } catch (_) {}
    return state;
  }

  function appendRichTextRun(runs, text, formatState) {
    if (!text) {
      return;
    }
    const run = {
      text,
      bold: !!(formatState && formatState.bold),
      italic: !!(formatState && formatState.italic)
    };
    const previous = runs[runs.length - 1];
    if (previous && previous.bold === run.bold && previous.italic === run.italic) {
      previous.text += run.text;
      return;
    }
    runs.push(run);
  }

  function collectRichTextRuns(node, formatState, runs, rootElement) {
    if (!node) {
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      appendRichTextRun(runs, node.textContent || "", formatState);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    if (isBrNode(node)) {
      appendRichTextRun(runs, "\n", formatState);
      return;
    }
    if (shouldSkipTextElement(node)) {
      return;
    }

    const ownFormat = readElementInlineFormat(node, rootElement);
    const nextState = {
      bold: !!(formatState && formatState.bold) || ownFormat.bold,
      italic: !!(formatState && formatState.italic) || ownFormat.italic
    };
    const children = Array.from(node.childNodes || []);
    children.forEach((child, index) => {
      collectRichTextRuns(child, nextState, runs, rootElement);
      if (index < children.length - 1) {
        appendRichTextRun(runs, " ", nextState);
      }
    });
  }

  function wrapRichTextRun(run) {
    let text = run.text;
    if (run.italic) {
      text = `${RICH_TEXT_ITALIC_OPEN}${text}${RICH_TEXT_ITALIC_CLOSE}`;
    }
    if (run.bold) {
      text = `${RICH_TEXT_BOLD_OPEN}${text}${RICH_TEXT_BOLD_CLOSE}`;
    }
    return text;
  }

  function buildRichTextRequest(element, plainText) {
    if (!element || RICH_TEXT_MARKER_PATTERN.test(plainText)) {
      RICH_TEXT_MARKER_PATTERN.lastIndex = 0;
      return null;
    }
    RICH_TEXT_MARKER_PATTERN.lastIndex = 0;
    const runs = [];
    collectRichTextRuns(element, { bold: false, italic: false }, runs, element);
    const hasFormattedText = runs.some((run) => (run.bold || run.italic) && normalizeText(run.text));
    if (!hasFormattedText) {
      return null;
    }
    const markedText = normalizeText(runs.map(wrapRichTextRun).join(""));
    RICH_TEXT_MARKER_PATTERN.lastIndex = 0;
    if (!markedText || !RICH_TEXT_MARKER_PATTERN.test(markedText)) {
      RICH_TEXT_MARKER_PATTERN.lastIndex = 0;
      return null;
    }
    RICH_TEXT_MARKER_PATTERN.lastIndex = 0;
    if (normalizeText(stripRichTextMarkers(markedText)) !== plainText) {
      return null;
    }
    return {
      format: RICH_TEXT_FORMAT,
      text: markedText
    };
  }

  function hasNestedBlockCandidate(element) {
    return Array.from(element.children || []).some((child) => (
      child.matches(TEXT_BLOCK_SELECTOR) || !!child.querySelector(TEXT_BLOCK_SELECTOR)
    ));
  }

  function isInlineTextContainer(element) {
    return !!element && element.matches(INLINE_TEXT_CONTAINER_SELECTOR);
  }

  function isSegmentableContainer(element) {
    return !!element && element.matches(SEGMENTABLE_CONTAINER_SELECTOR);
  }

  function isBlockChildSegment(node) {
    return !!node && node.nodeType === Node.ELEMENT_NODE && node.matches(BLOCK_CHILD_SEGMENT_SELECTOR);
  }

  function isEmptyBlockChildSegment(node) {
    return isBlockChildSegment(node) && !normalizeText(node.textContent || "");
  }

  function isStandaloneInlineChildSegment(node, parent) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE || !node.matches(STANDALONE_INLINE_SEGMENT_SELECTOR)) {
      return false;
    }
    if (node.parentElement !== parent) {
      return false;
    }
    return hasParagraphBreaks(node)
      || normalizeText(node.textContent || "").length >= STANDALONE_INLINE_SEGMENT_MIN_LENGTH;
  }

  function isChildSegmentNode(node, parent) {
    return isBlockChildSegment(node) || isStandaloneInlineChildSegment(node, parent);
  }

  function isBrNode(node) {
    return !!node && node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR";
  }

  function isWhitespaceTextNode(node) {
    return !!node && node.nodeType === Node.TEXT_NODE && !String(node.textContent || "").trim();
  }

  function hasParagraphWhitespace(text) {
    return /(?:\r?\n\s*){2,}/.test(String(text || ""));
  }

  function hasLineBreakWhitespace(text) {
    return /(?:\r?\n\s*)+/.test(String(text || ""));
  }

  function isParagraphWhitespaceTextNode(node) {
    return !!node && node.nodeType === Node.TEXT_NODE && hasParagraphWhitespace(node.textContent);
  }

  function isLineBreakWhitespaceTextNode(node) {
    return !!node && node.nodeType === Node.TEXT_NODE && hasLineBreakWhitespace(node.textContent);
  }

  function isStructuredLineItemText(text) {
    return STRUCTURED_LINE_ITEM_PATTERN.test(normalizeText(text));
  }

  function getLineTexts(element) {
    const text = Array.from(element && element.childNodes || []).map(getNodeText).join("");
    return text.split(/\r?\n/).map(normalizeText).filter(Boolean);
  }

  function hasShortTextLineBreaks(element) {
    return !!element && element.matches(SHORT_TEXT_CONTAINER_SELECTOR) && getLineTexts(element).length >= 2;
  }

  function hasStructuredLineBreaks(element) {
    if (!hasLineBreakWhitespace(Array.from(element && element.childNodes || []).map(getNodeText).join(""))) {
      return false;
    }
    const lines = getLineTexts(element);
    return lines.length >= 2 && lines.some(isStructuredLineItemText);
  }

  function isTextOnlyElement(node) {
    return !!node
      && node.nodeType === Node.ELEMENT_NODE
      && !Array.from(node.childNodes || []).some((child) => child.nodeType === Node.ELEMENT_NODE);
  }

  function hasExplicitTextRootShape(element) {
    return !!element
      && element.matches(EXPLICIT_TEXT_ROOT_SELECTOR)
      && countMeaningfulCharacters(getElementText(element)) >= SHORT_TEXT_MIN_MEANINGFUL_LENGTH;
  }

  function isSegmentableExplicitTextRoot(element) {
    return hasExplicitTextRootShape(element)
      && (hasParagraphBreaks(element) || hasShortTextLineBreaks(element) || hasStructuredLineBreaks(element));
  }

  function isCollectableExplicitTextRoot(element) {
    return isExplicitTextRoot(element) || isSegmentableExplicitTextRoot(element);
  }

  function createInlineTextPiece(template, text) {
    if (!template || template.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(text);
    }
    const clone = template.cloneNode(false);
    clone.textContent = text;
    return clone;
  }

  function splitNodeOnLineBreakWhitespace(node) {
    const text = String(node && node.textContent || "");
    if (!node || !node.parentNode || !hasLineBreakWhitespace(text)) {
      return;
    }
    text.split(/((?:\r?\n\s*)+)/).forEach((part) => {
      if (!part) {
        return;
      }
      const replacement = hasLineBreakWhitespace(part)
        ? document.createTextNode(part)
        : createInlineTextPiece(node, part);
      node.parentNode.insertBefore(replacement, node);
    });
    node.remove();
  }

  function splitInlineParagraphNodes(element) {
    Array.from(element.childNodes || []).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE || isTextOnlyElement(node)) {
        splitNodeOnLineBreakWhitespace(node);
      }
    });
  }

  function isSegmentSeparatorNode(node) {
    return !!node && node.nodeType === Node.TEXT_NODE && hasParagraphWhitespace(node.textContent);
  }

  function isLineSegmentSeparatorNode(node) {
    return isLineBreakWhitespaceTextNode(node) && !isSegmentSeparatorNode(node);
  }

  function shouldSplitStructuredLineGroup(group) {
    const text = normalizeText(group.map(getNodeText).join(" "));
    return isStructuredLineItemText(text);
  }

  function flushInlineParagraphGroup(groups, group) {
    const text = normalizeText(group.map(getNodeText).join(" "));
    if (text && !isUrlOnlyText(text)) {
      groups.push(group.slice());
    }
    group.splice(0, group.length);
  }

  function canRefineExistingSegment(segment, parent) {
    return !!segment
      && segment.parentElement === parent
      && hasParagraphBreaks(segment)
      && !segment.querySelector(".mt-immersive-translation")
      && (segment.matches("span") || isStandaloneInlineChildSegment(segment, parent));
  }

  function refineExistingInlineSegments(element, existing) {
    const segments = [];
    let changed = false;
    existing.forEach((segment) => {
      if (!canRefineExistingSegment(segment, element)) {
        segments.push(segment);
        return;
      }
      segment.removeAttribute(TEXT_SEGMENT_ATTR);
      segment.removeAttribute(TEXT_SEGMENT_CONTAINER_ATTR);
      const refined = createInlineParagraphSegments(segment);
      if (refined.length) {
        segments.push.apply(segments, refined);
        changed = true;
        return;
      }
      segment.setAttribute(TEXT_SEGMENT_ATTR, "true");
      segments.push(segment);
    });
    if (changed) {
      element.setAttribute(TEXT_SEGMENT_CONTAINER_ATTR, "true");
    }
    return segments;
  }

  function createInlineParagraphSegments(element) {
    const existing = getDirectTextSegments(element);
    if (existing.length) {
      return refineExistingInlineSegments(element, existing);
    }
    if (element.getAttribute(TEXT_SEGMENT_CONTAINER_ATTR) === "true") {
      return existing;
    }

    splitInlineParagraphNodes(element);
    const groups = [];
    const group = [];
    let pendingBreaks = [];
    function flushPendingBreaks(nextNode) {
      if (!pendingBreaks.length) {
        return;
      }
      if (pendingBreaksShouldSplit(pendingBreaks, nextNode)) {
        flushInlineParagraphGroup(groups, group);
      } else if (pendingBreaks.length === 1) {
        group.push(pendingBreaks[0]);
      } else {
        group.push.apply(group, pendingBreaks);
      }
      pendingBreaks = [];
    }
    Array.from(element.childNodes || []).forEach((node) => {
      if (isBrNode(node)) {
        pendingBreaks.push(node);
        return;
      }
      if (isWhitespaceTextNode(node) && pendingBreaks.length) {
        pendingBreaks.push(node);
        return;
      }
      flushPendingBreaks(node);
      if (isSegmentSeparatorNode(node)) {
        flushInlineParagraphGroup(groups, group);
        return;
      }
      if (isLineSegmentSeparatorNode(node)) {
        if (element.matches(SHORT_TEXT_CONTAINER_SELECTOR) || shouldSplitStructuredLineGroup(group)) {
          flushInlineParagraphGroup(groups, group);
          return;
        }
        if (isWhitespaceTextNode(node) && !group.length) {
          return;
        }
        group.push(node);
        return;
      }
      if (isWhitespaceTextNode(node) && !group.length) {
        return;
      }
      if (isChildSegmentNode(node, element)) {
        flushInlineParagraphGroup(groups, group);
        groups.push([node]);
        return;
      }
      group.push(node);
    });
    if (pendingBreaks.filter(isBrNode).length <= 1) {
      group.push.apply(group, pendingBreaks);
    }
    flushInlineParagraphGroup(groups, group);

    const segments = [];
    groups.forEach((nodes) => {
      if (nodes.length === 1 && isChildSegmentNode(nodes[0], element)) {
        if (isStandaloneInlineChildSegment(nodes[0], element) && hasParagraphBreaks(nodes[0])) {
          segments.push.apply(segments, createInlineParagraphSegments(nodes[0]));
          return;
        }
        segments.push(markTextSegment(nodes[0]));
        return;
      }
      segments.push(createInlineTextSegment(element, nodes));
    });
    element.setAttribute(TEXT_SEGMENT_CONTAINER_ATTR, "true");
    return segments;
  }

  function isUrlOnlyText(text) {
    const normalized = normalizeText(text);
    if (!normalized) {
      return true;
    }
    const withoutUrls = normalized.replace(/(?:https?:\/\/|www\.)\S+/gi, " ");
    return countMeaningfulCharacters(withoutUrls) < Math.min(HEADING_MIN_MEANINGFUL_LENGTH, countMeaningfulCharacters(normalized));
  }

  function pendingBreaksShouldSplit(pendingBreaks, nextNode) {
    const breakCount = pendingBreaks.filter(isBrNode).length;
    return breakCount >= 2
      || (breakCount >= 1 && (
        pendingBreaks.some(isParagraphWhitespaceTextNode)
          || isParagraphWhitespaceTextNode(nextNode)
      ));
  }

  function getDirectTextSegments(element) {
    return Array.from(element.children || []).filter((child) => child.getAttribute(TEXT_SEGMENT_ATTR) === "true");
  }

  function hasParagraphBreaks(element) {
    let breakCount = 0;
    return Array.from(element.childNodes || []).some((node) => {
      if (breakCount >= 1 && isParagraphWhitespaceTextNode(node)) {
        return true;
      }
      if (isBlockChildSegment(node)) {
        return true;
      }
      if (isWhitespaceTextNode(node)) {
        return false;
      }
      if (isTextOnlyElement(node) && hasParagraphWhitespace(node.textContent)) {
        return true;
      }
      if (isBrNode(node)) {
        breakCount += 1;
        return breakCount >= 2;
      }
      breakCount = 0;
      return false;
    });
  }

  function groupInlineTextNodes(element) {
    const groups = [];
    let group = [];
    let pendingBreaks = [];

    function flushGroup() {
      if (group.length) {
        groups.push(group);
        group = [];
      }
    }

    Array.from(element.childNodes || []).forEach((node) => {
      if (isBrNode(node)) {
        pendingBreaks.push(node);
        return;
      }
      if (isWhitespaceTextNode(node) && pendingBreaks.length) {
        pendingBreaks.push(node);
        return;
      }

      if (pendingBreaksShouldSplit(pendingBreaks, node)) {
        flushGroup();
      } else if (pendingBreaks.length === 1) {
        group.push(pendingBreaks[0]);
      } else if (pendingBreaks.length > 1) {
        group.push.apply(group, pendingBreaks);
      }
      pendingBreaks = [];

      if (isChildSegmentNode(node, element)) {
        flushGroup();
        groups.push([node]);
        return;
      }

      group.push(node);
    });

    if (pendingBreaks.filter(isBrNode).length <= 1) {
      group.push.apply(group, pendingBreaks);
    }
    flushGroup();
    return groups;
  }

  function markTextSegment(element) {
    element.setAttribute(TEXT_SEGMENT_ATTR, "true");
    return element;
  }

  function createInlineTextSegment(element, nodes) {
    const segment = document.createElement("span");
    segment.setAttribute(TEXT_SEGMENT_ATTR, "true");
    element.insertBefore(segment, nodes[0]);
    nodes.forEach((node) => segment.appendChild(node));
    return segment;
  }

  function createTextSegments(element) {
    const existing = getDirectTextSegments(element);
    if (existing.length || element.getAttribute(TEXT_SEGMENT_CONTAINER_ATTR) === "true") {
      return existing;
    }
    if (!isSegmentableContainer(element) || !hasParagraphBreaks(element)) {
      return [];
    }

    const segments = [];
    groupInlineTextNodes(element).forEach((nodes) => {
      const text = normalizeText(nodes.map(getNodeText).join(" "));
      if (!text) {
        return;
      }
      if (isUrlOnlyText(text)) {
        return;
      }
      if (nodes.length === 1 && isChildSegmentNode(nodes[0], element)) {
        if (isStandaloneInlineChildSegment(nodes[0], element) && hasParagraphBreaks(nodes[0])) {
          segments.push.apply(segments, createTextSegments(nodes[0]));
        } else if (isStandaloneInlineChildSegment(nodes[0], element) || (!nodes[0].matches("ol, ul") && !hasParagraphBreaks(nodes[0]))) {
          segments.push(markTextSegment(nodes[0]));
        }
      } else {
        segments.push(createInlineTextSegment(element, nodes));
      }
    });
    element.setAttribute(TEXT_SEGMENT_CONTAINER_ATTR, "true");
    return segments;
  }

  function countMeaningfulCharacters(text) {
    const matches = String(text || "").match(MEANINGFUL_CHARACTER_PATTERN);
    return matches ? matches.length : 0;
  }

  function hasSummaryHint(element) {
    let current = element;
    let depth = 0;
    while (current && current.nodeType === Node.ELEMENT_NODE && depth < 3) {
      const descriptor = [
        current.id || "",
        current.className || "",
        current.getAttribute && current.getAttribute("data-flatplan-description") || ""
      ].join(" ");
      if (SHORT_SUMMARY_HINT_PATTERN.test(String(descriptor))) {
        return true;
      }
      current = current.parentElement;
      depth += 1;
    }
    return false;
  }

  function isTextTooShort(element, text, fallbackLength) {
    if (isUrlOnlyText(text)) {
      return true;
    }
    if (isStructuredLineItemText(text)) {
      return countMeaningfulCharacters(text) < LIST_ITEM_MIN_MEANINGFUL_LENGTH;
    }
    if (element && (element.matches(SHORT_TEXT_CONTAINER_SELECTOR) || element.closest(SHORT_TEXT_CONTAINER_SELECTOR))) {
      const minLength = Math.min(fallbackLength, SHORT_TEXT_MIN_MEANINGFUL_LENGTH);
      return countMeaningfulCharacters(text) < minLength;
    }
    if (element && element.matches("li")) {
      const minLength = Math.min(fallbackLength, LIST_ITEM_MIN_MEANINGFUL_LENGTH);
      return countMeaningfulCharacters(text) < minLength;
    }
    if (element && element.matches("h1,h2,h3,h4,h5,h6")) {
      const minLength = Math.min(fallbackLength, HEADING_MIN_MEANINGFUL_LENGTH);
      return countMeaningfulCharacters(text) < minLength;
    }
    if (element && element.matches("p,div") && hasSummaryHint(element)) {
      const minLength = Math.min(fallbackLength, SUMMARY_MIN_MEANINGFUL_LENGTH);
      return countMeaningfulCharacters(text) < minLength;
    }
    return text.length < fallbackLength;
  }

  function getMinimumTextLength(element, cfg) {
    if (cfg && cfg.explicitRoot && element === cfg.rootNode) {
      return Math.min(cfg.minLength, SHORT_TEXT_MIN_MEANINGFUL_LENGTH);
    }
    return cfg.minLength;
  }

  function isExcludedBySelector(element, selectors) {
    return Array.isArray(selectors) && selectors.some(function(selector) {
      try {
        return !!element.closest(selector);
      } catch (_) {
        return false;
      }
    });
  }

  function isExplicitTextRoot(element) {
    return hasExplicitTextRootShape(element)
      && !hasNestedBlockCandidate(element)
  }

  function getRenderStrategy(element, text) {
    if (!element || !element.matches) {
      return "inside-block";
    }
    if (element.matches("li")) {
      return "inside-list-item";
    }
    if (element.matches("td,th")) {
      return "inside-cell";
    }
    if (element.matches("[data-testid='card-headline']")) {
      return "after-block";
    }
    if (element.matches("h3.ytLockupMetadataViewModelHeadingReset,h3.shortsLockupViewModelHostMetadataTitle")) {
      return "after-block";
    }
    if (element.matches("h1,h2")) {
      return "after-block";
    }
    if (element.matches(INLINE_RENDER_SELECTOR)) {
      return countMeaningfulCharacters(text) <= 32 ? "inside-inline" : "inside-block";
    }
    if (element.matches("h3,h4,h5,h6") && countMeaningfulCharacters(text) <= 32) {
      return "inside-inline";
    }
    return "inside-block";
  }

  function buildTextBlock(element, text) {
    const block = {
      element,
      text,
      fingerprint: hashText(text),
      renderStrategy: getRenderStrategy(element, text)
    };
    const richText = buildRichTextRequest(element, text);
    if (richText) {
      block.richText = richText;
    }
    return block;
  }

  function isSkippableElement(element, options) {
    const cfg = options || {};
    const isExplicitRootElement = !!cfg.explicitRoot && element === cfg.rootNode;
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return true;
    }
    if (element.closest(ALWAYS_SKIP_CLOSEST_SELECTOR)) {
      return true;
    }
    if (!isExplicitRootElement && element.closest(DEFAULT_SKIP_CLOSEST_SELECTOR)) {
      return true;
    }
    if (isExcludedBySelector(element, cfg.excludeSelectors)) {
      return true;
    }
    if (!element.matches(TEXT_BLOCK_SELECTOR) && !(isExplicitRootElement && isCollectableExplicitTextRoot(element))) {
      return true;
    }
    if (!isExplicitRootElement && !isInlineTextContainer(element) && hasNestedBlockCandidate(element)) {
      return true;
    }
    return isElementHidden(element);
  }

  function collectSegmentBlocks(element, cfg) {
    const isExplicitRootElement = !!cfg.explicitRoot && element === cfg.rootNode;
    const existing = getDirectTextSegments(element);
    const shouldSegmentShortTextLines = hasShortTextLineBreaks(element);
    const isSegmentedExplicitRoot = isExplicitRootElement
      && (existing.length || element.getAttribute(TEXT_SEGMENT_CONTAINER_ATTR) === "true");
    const shouldSegmentExplicitRoot = isExplicitRootElement
      && element === cfg.rootNode
      && (isSegmentableExplicitTextRoot(element) || isSegmentedExplicitRoot)
      && (hasParagraphBreaks(element) || shouldSegmentShortTextLines || hasStructuredLineBreaks(element) || isSegmentedExplicitRoot);
    if (!shouldSegmentExplicitRoot && !shouldSegmentShortTextLines && !isSegmentableContainer(element)) {
      return null;
    }
    if (!existing.length && element.getAttribute(TEXT_SEGMENT_CONTAINER_ATTR) === "true") {
      return [];
    }
    if (!shouldSegmentExplicitRoot && !shouldSegmentShortTextLines && !existing.length && !hasParagraphBreaks(element)) {
      return null;
    }
    if (element.closest(ALWAYS_SKIP_CLOSEST_SELECTOR)
      || element.closest(DEFAULT_SKIP_CLOSEST_SELECTOR)
      || isExcludedBySelector(element, cfg.excludeSelectors)
      || isElementHidden(element)) {
      return [];
    }

    const segments = (shouldSegmentExplicitRoot || shouldSegmentShortTextLines)
      ? createInlineParagraphSegments(element)
      : existing.length ? existing : createTextSegments(element);
    return segments.map((segment) => {
      if (segment.closest("[data-melontranslate-immersive='translation'],.mt-immersive-translation") || isElementHidden(segment)) {
        return null;
      }
      const text = getElementText(segment);
      const minLength = getMinimumTextLength(segment, cfg);
      if (isTextTooShort(segment, text, minLength) || text.length > cfg.maxLength) {
        return null;
      }
      return buildTextBlock(segment, text);
    }).filter(Boolean);
  }

  function collectTextBlocks(rootNode, options) {
    const cfg = options || {};
    const minLength = Math.max(1, Number(cfg.minTextLength || 24));
    const maxLength = Math.max(minLength, Number(cfg.maxTextLength || namespace.constants.maxSelectionLength || 4000));
    const normalizedCfg = Object.assign({}, cfg, { minLength, maxLength, rootNode });
    const base = rootNode && rootNode.querySelectorAll ? rootNode : document;
    const candidates = base.nodeType === Node.ELEMENT_NODE
      ? (base.matches(TEXT_BLOCK_SELECTOR) || (normalizedCfg.explicitRoot && isCollectableExplicitTextRoot(base))
        ? [base].concat(Array.from(base.querySelectorAll(TEXT_BLOCK_SELECTOR)))
        : Array.from(base.querySelectorAll(TEXT_BLOCK_SELECTOR)))
      : Array.from(base.querySelectorAll(TEXT_BLOCK_SELECTOR));

    return candidates.flatMap((element) => {
      const segmentBlocks = collectSegmentBlocks(element, normalizedCfg);
      if (segmentBlocks) {
        return segmentBlocks;
      }
      if (isSkippableElement(element, normalizedCfg)) {
        return [];
      }
      const text = getElementText(element);
      const effectiveMinLength = getMinimumTextLength(element, normalizedCfg);
      if (isTextTooShort(element, text, effectiveMinLength) || text.length > maxLength) {
        return [];
      }
      return [buildTextBlock(element, text)];
    });
  }

  namespace.domTextScanner = {
    collectTextBlocks,
    hashText,
    normalizeText,
    stripRichTextMarkers
  };
}(globalThis));
