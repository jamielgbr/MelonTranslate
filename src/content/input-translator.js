(function initInputTranslator(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const api = namespace.browserApi;
  const constants = namespace.constants;
  const pu = namespace.pageUtils;
  const shell = namespace.panelShell;
  const buttonHostId = "melontranslate-input-button-host";
  const panelHostId = "melontranslate-input-panel-host";
  // URL, telephone, and email fields are intentionally excluded from input translation surfaces.
  const editableInputTypes = new Set(["", "text", "search"]);
  const ignoredInputModes = new Set(["numeric", "decimal"]);
  const ignoredAutocompleteTokens = new Set([
    "email",
    "username",
    "current-password",
    "new-password",
    "one-time-code"
  ]);
  const ignoredEditableAncestorSelectors = [
    ".tagger-new"
  ];
  const ignoredEditableFeaturePatterns = [
    /\b(?:2fa|account|auth|authenticator|email|login|mfa|one time|otp|pass|passcode|passwd|password|pin|pwd|security code|secret|recovery|signin|sign in|totp|two factor|user id|userid|user name|username|verification|verify|filename|tag|hashtag|nickname)\b/i,
    /(?:账号|帐号|账户|帳號|賬戶|用戶|用户|用户名|用戶名|邮箱|郵箱|電子郵件|电子邮件|電子信箱|电子邮箱|電郵|电邮|密码|密碼|验证码|驗證碼|验证|驗證|认证|認證|身份验证|身份驗證|动态码|動態碼|动态密码|動態密碼|一次性|安全码|安全碼|两步验证|兩步驗證|二步验证|二步驗證|登录|登入|登錄|登陸)/,
    /(?:アカウント|ユーザー名|ユーザ名|ユーザーid|ユーザid|メールアドレス|メール|ｅメール|eメール|パスワード|暗証番号|認証コード|確認コード|検証コード|ワンタイム|二段階認証|二要素認証|本人確認|ログイン|サインイン|認証)/i,
    /(?:аккаунт|уч[её]тная запись|имя пользователя|пользователь|логин|пароль|эл\.?\s*почта|электронная почта|адрес электронной почты|код подтверждения|код проверки|проверочный код|одноразовый код|одноразовый пароль|двухфактор|аутентификация|авторизация|подтверждение|вход|войти)/i,
    /\b(?:adresse e mail|adresse email|authentification|code d['’ ]authentification|code de s[eé]curit[eé]|code de v[eé]rification|code unique|compte|connexion|courriel|identifiant|mot de passe|nom d['’ ]utilisateur|se connecter|utilisateur|v[eé]rification)\b/i,
    /\b(?:anmelden|anmeldung|authentifizierung|benutzer id|benutzerkennung|benutzername|best[aä]tigungscode|bestaetigungscode|e mail adresse|einmal code|einmal passwort|einmalcode|einmalpasswort|einloggen|kennwort|konto|passwort|pr[uü]fcode|pruefcode|sicherheitscode|verifizierung|zwei faktor)\b/i
  ];

  const state = {
    getSettings: null,
    settings: null,
    streamClient: null,
    activeEditable: null,
    contextMenuEditable: null,
    buttonHost: null,
    panelHost: null,
    resizeObserver: null,
    reflowFrame: 0,
    panel: null,
    quickTranslating: false,
    modelPicker: null,
    modelRevealTimer: null
  };

  function normalizeInputButtonStyle(value) {
    const styles = constants.inputButtonStyles || [];
    const normalized = String(value || "").trim();
    return styles.some((item) => item.id === normalized) ? normalized : "auto";
  }

  function normalizeInputButtonIconPosition(value) {
    const positions = constants.inputButtonIconPositions || [];
    const normalized = String(value || "").trim();
    return positions.some((item) => item.id === normalized) ? normalized : "inside-right";
  }

  function normalizeInputButtonTabPosition(value) {
    const positions = constants.inputButtonTabPositions || [];
    const normalized = String(value || "").trim();
    return positions.some((item) => item.id === normalized) ? normalized : "bottom-right";
  }

  function getInputButtonMode(settings) {
    const style = normalizeInputButtonStyle(settings && settings.inputInlineButtonStyle);
    if (style === "off" || style === "auto") {
      return style;
    }
    if (style === "icon") {
      return normalizeInputButtonIconPosition(settings && settings.inputInlineButtonIconPosition);
    }
    const tabPosition = normalizeInputButtonTabPosition(settings && settings.inputInlineButtonTabPosition);
    if (tabPosition === "top-left") {
      return "top-left-tab";
    }
    if (tabPosition === "top") {
      return "top-tab";
    }
    if (tabPosition === "top-right") {
      return "top-right-tab";
    }
    return "bottom-right-tab";
  }

  function getInputButtonHorizontalOffset(settings) {
    const number = Number(settings && settings.inputInlineButtonHorizontalOffset);
    if (!Number.isFinite(number)) {
      return 0;
    }
    return Math.max(-80, Math.min(80, Math.round(number)));
  }

  function isElement(value) {
    return value && value.nodeType === Node.ELEMENT_NODE;
  }

  function applyStoredTheme(element) {
    if (!element) {
      return;
    }
    api.storage.get("local", "melontranslateTheme").then((result) => {
      element.classList.toggle("dark", !!result && result.melontranslateTheme === "dark");
    }).catch(() => {});
  }

  function eventTouchesOwnUi(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    return path.some((item) => (
      item && (
        item.id === buttonHostId ||
        item.id === panelHostId ||
        item.id === constants.popupId
      )
    ));
  }

  function normalizeFeatureText(value) {
    return String(value || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .trim()
      .toLowerCase();
  }

  function splitAutocompleteTokens(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
  }

  function featureMatchesIgnoredPattern(value) {
    const text = normalizeFeatureText(value);
    return !!text && ignoredEditableFeaturePatterns.some((pattern) => pattern.test(text));
  }

  function getAttributeFeatureText(element) {
    if (!element || !element.getAttribute) {
      return "";
    }
    return [
      element.getAttribute("name"),
      element.getAttribute("id"),
      element.getAttribute("placeholder"),
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("class")
    ].filter(Boolean).join(" ");
  }

  function getAssociatedLabelText(element) {
    if (!element) {
      return "";
    }
    const parts = [];
    if (element.id && typeof document !== "undefined") {
      try {
        const selector = `label[for="${CSS.escape(element.id)}"]`;
        const explicitLabel = document.querySelector(selector);
        if (explicitLabel) {
          parts.push(explicitLabel.textContent);
        }
      } catch (_) {}
    }
    const wrappingLabel = element.closest && element.closest("label");
    if (wrappingLabel) {
      parts.push(wrappingLabel.textContent);
    }
    return parts.filter(Boolean).join(" ");
  }

  function getNearbyContainerFeatureText(element) {
    const parts = [];
    let current = element ? element.parentElement : null;
    let depth = 0;
    while (current && depth < 4) {
      parts.push(
        current.getAttribute("class"),
        current.getAttribute("id"),
        current.getAttribute("aria-label")
      );
      if (current.tagName === "FORM") {
        break;
      }
      current = current.parentElement;
      depth += 1;
    }
    return parts.filter(Boolean).join(" ");
  }

  function hasIgnoredEditableAncestor(element) {
    return !!element
      && !!element.closest
      && ignoredEditableAncestorSelectors.some((selector) => {
        try {
          return !!element.closest(selector);
        } catch (_) {
          return false;
        }
      });
  }

  function isIgnoredEditableField(element) {
    if (!isElement(element)) {
      return false;
    }
    if (hasIgnoredEditableAncestor(element)) {
      return true;
    }
    if (element.tagName === "INPUT") {
      const inputMode = normalizeFeatureText(element.getAttribute("inputmode"));
      const autocompleteTokens = splitAutocompleteTokens(element.getAttribute("autocomplete"));
      if (ignoredInputModes.has(inputMode)) {
        return true;
      }
      if (autocompleteTokens.some((token) => ignoredAutocompleteTokens.has(token))) {
        return true;
      }
    }
    return featureMatchesIgnoredPattern([
      getAttributeFeatureText(element),
      getAssociatedLabelText(element),
      getNearbyContainerFeatureText(element)
    ].join(" "));
  }

  function isTextInput(element) {
    if (!element || element.tagName !== "INPUT") {
      return false;
    }
    const type = String(element.getAttribute("type") || "text").trim().toLowerCase();
    return editableInputTypes.has(type)
      && !element.disabled
      && !element.readOnly;
  }

  function isTextArea(element) {
    return !!element
      && element.tagName === "TEXTAREA"
      && !element.disabled
      && !element.readOnly;
  }

  function isEditableElement(element) {
    if (!isElement(element)) {
      return false;
    }
    if (isTextInput(element) || isTextArea(element)) {
      return isVisible(element);
    }
    if (!element.isContentEditable || element.getAttribute("contenteditable") === "false") {
      return false;
    }
    if (element.getAttribute("aria-disabled") === "true") {
      return false;
    }
    return isVisible(element);
  }

  function canShowInlineButtonForEditable(element) {
    return isEditableElement(element) && !isIgnoredEditableField(element);
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) {
      return false;
    }
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function findEditable(target) {
    if (!target) {
      return null;
    }
    const start = isElement(target) ? target : target.parentElement;
    if (!start || !start.closest) {
      return null;
    }

    const field = start.closest("input, textarea");
    if (field && isEditableElement(field)) {
      return field;
    }

    const explicitEditable = start.closest("[contenteditable]");
    if (explicitEditable && isEditableElement(explicitEditable)) {
      return explicitEditable;
    }

    if (start.isContentEditable) {
      let current = start;
      let rootEditable = start;
      while (current.parentElement && current.parentElement.isContentEditable) {
        rootEditable = current.parentElement;
        current = current.parentElement;
      }
      if (isEditableElement(rootEditable)) {
        return rootEditable;
      }
    }

    return null;
  }

  function isFormField(element) {
    return element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA");
  }

  function getEditableText(element) {
    if (isFormField(element)) {
      return String(element.value || "");
    }
    return String(element.innerText !== undefined ? element.innerText : element.textContent || "");
  }

  function rangeBelongsToEditable(range, editable) {
    const node = range.commonAncestorContainer;
    const element = isElement(node) ? node : node.parentElement;
    return !!element && (element === editable || editable.contains(element));
  }

  function captureEditableText(editable) {
    if (!isEditableElement(editable)) {
      return null;
    }

    const snapshot = getEditableText(editable);
    if (isFormField(editable)) {
      const start = Number(editable.selectionStart);
      const end = Number(editable.selectionEnd);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        const selectedText = snapshot.slice(start, end).trim();
        if (selectedText) {
          return {
            editable,
            mode: "selection",
            text: selectedText.slice(0, constants.maxSelectionLength),
            snapshot,
            selectionStart: start,
            selectionEnd: end
          };
        }
      }

      const fullText = snapshot.trim();
      return fullText ? {
        editable,
        mode: "all",
        text: fullText.slice(0, constants.maxSelectionLength),
        snapshot
      } : null;
    }

    const selection = window.getSelection();
    if (selection && selection.rangeCount && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const selected = selection.toString().trim();
      if (selected && rangeBelongsToEditable(range, editable)) {
        return {
          editable,
          mode: "selection",
          text: selected.slice(0, constants.maxSelectionLength),
          snapshot,
          range: range.cloneRange()
        };
      }
    }

    const fullText = snapshot.trim();
    return fullText ? {
      editable,
      mode: "all",
      text: fullText.slice(0, constants.maxSelectionLength),
      snapshot
    } : null;
  }

  function hasInputChanged(info) {
    return !info || !info.editable || getEditableText(info.editable) !== info.snapshot;
  }

  function dispatchEditableEvents(element, text) {
    try {
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertReplacementText",
        data: text
      }));
    } catch (_) {
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setNativeValue(element, value) {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  function moveCaretAfterTextNode(node) {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function moveCaretToEnd(element) {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function insertContentEditableText(text) {
    try {
      if (document.queryCommandSupported && !document.queryCommandSupported("insertText")) {
        return false;
      }
      return !!(document.execCommand && document.execCommand("insertText", false, text));
    } catch (_) {
      return false;
    }
  }

  function getTextNodeInside(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    return walker.nextNode();
  }

  function getDraftTextNodes(editable) {
    return Array.from(editable.querySelectorAll('span[data-text="true"]'))
      .map((span) => getTextNodeInside(span))
      .filter(Boolean);
  }

  function selectDraftManagedText(editable) {
    const textNodes = getDraftTextNodes(editable);
    if (!textNodes.length) {
      return false;
    }

    const first = textNodes[0];
    const last = textNodes[textNodes.length - 1];
    const selection = window.getSelection();
    if (!selection) {
      return false;
    }

    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(last, String(last.nodeValue || "").length);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function selectAllInContentEditable(editable) {
    editable.focus();
    try {
      if (document.queryCommandSupported && document.queryCommandSupported("selectAll")) {
        document.execCommand("selectAll", false, null);
        const selection = window.getSelection();
        return !!selection && selection.rangeCount > 0 && rangeBelongsToEditable(selection.getRangeAt(0), editable);
      }
    } catch (_) {}

    const selection = window.getSelection();
    if (!selection) {
      return false;
    }
    const range = document.createRange();
    range.selectNodeContents(editable);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function replaceEditableText(info, translatedText) {
    const text = String(translatedText || "").trim();
    if (!text || hasInputChanged(info)) {
      return false;
    }

    const editable = info.editable;
    if (isFormField(editable)) {
      const before = info.mode === "selection" ? info.snapshot.slice(0, info.selectionStart) : "";
      const after = info.mode === "selection" ? info.snapshot.slice(info.selectionEnd) : "";
      const nextValue = info.mode === "selection" ? `${before}${text}${after}` : text;
      const caret = info.mode === "selection" ? before.length + text.length : nextValue.length;
      editable.focus();
      setNativeValue(editable, nextValue);
      if (typeof editable.setSelectionRange === "function") {
        try { editable.setSelectionRange(caret, caret); } catch (_) {}
      }
      dispatchEditableEvents(editable, text);
      return true;
    }

    editable.focus();
    let usedNativeInput = false;
    if (info.mode === "selection" && info.range) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(info.range);
      }
      usedNativeInput = insertContentEditableText(text);
      if (!usedNativeInput) {
        info.range.deleteContents();
        const node = document.createTextNode(text);
        info.range.insertNode(node);
        moveCaretAfterTextNode(node);
      }
    } else {
      const selectedManagedDraftText = selectDraftManagedText(editable);
      usedNativeInput = (selectedManagedDraftText || selectAllInContentEditable(editable))
        && insertContentEditableText(text);
      if (!usedNativeInput) {
        editable.textContent = text;
        moveCaretToEnd(editable);
      }
    }
    if (!usedNativeInput) {
      dispatchEditableEvents(editable, text);
    }
    return true;
  }

  function ensureButtonHost() {
    if (state.buttonHost) {
      return state.buttonHost;
    }

    const host = document.createElement("div");
    host.id = buttonHostId;
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.zIndex = "2147483646";
    host.style.display = "none";
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    const button = document.createElement("button");
    const icon = document.createElement("span");
    const label = document.createElement("span");

    style.textContent = `
      :host { all: initial; }
      .btn {
        width: 40px;
        height: 40px;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: rgba(15, 118, 110, 0.92);
        box-shadow: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        cursor: pointer;
        font-family: ui-sans-serif, system-ui, sans-serif;
        transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease, opacity 140ms ease;
      }
      .btn.dark {
        color: rgba(110, 231, 183, 0.96);
      }
      .btn:hover {
        background: transparent;
      }
      .btn:focus-visible {
        outline: 2px solid #0f766e;
        outline-offset: 2px;
      }
      .btn:disabled {
        cursor: progress;
        opacity: 0.75;
      }
      .icon-shell {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: rgba(8, 8, 8, 0.24);
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18);
        overflow: hidden;
        transition: box-shadow 0.16s ease, opacity 0.16s ease;
      }
      .mt-input-button-logo {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
        filter: none;
        transition: filter 0.16s ease, opacity 0.16s ease;
      }
      .logo-fallback {
        display: none;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        color: #d1fae5;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0;
      }
      .icon-shell.no-logo .logo-fallback {
        display: inline-flex;
      }
      .btn:hover .icon-shell {
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.28);
      }
      .btn.loading .icon-shell {
        animation: mt-input-button-rainbow 0.72s linear infinite;
      }
      .btn.error {
        color: #dc2626;
        background: transparent;
      }
      .btn.dark.error {
        color: #fca5a5;
        background: transparent;
      }
      .btn.error .icon-shell {
        box-shadow: 0 0 0 2px rgba(248, 113, 113, 0.95), 0 0 8px rgba(248, 113, 113, 0.5);
      }
      .btn.tab {
        width: 82px;
        height: 26px;
        border: 1px solid #0f766e;
        border-color: #0f766e;
        background: #0f766e;
        color: #ffffff;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.95), 0 0 10px rgba(59, 130, 246, 0.52), 0 10px 22px rgba(15, 23, 42, 0.16);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0;
        line-height: 1;
      }
      .btn.dark.tab {
        border-color: #10b981;
        background: #10b981;
        color: #052e2b;
        box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.95), 0 0 10px rgba(96, 165, 250, 0.56), 0 10px 22px rgba(0, 0, 0, 0.42);
      }
      .btn.tab:hover {
        background: #115e59;
        border-color: #115e59;
      }
      .btn.dark.tab:hover {
        background: #34d399;
        border-color: #34d399;
      }
      .btn.tab.loading {
        animation: mt-input-button-rainbow 0.72s linear infinite;
      }
      .btn.tab.error {
        border-color: #dc2626;
        background: #dc2626;
        color: #ffffff;
        box-shadow: 0 0 0 2px rgba(248, 113, 113, 0.95), 0 0 8px rgba(248, 113, 113, 0.5), 0 10px 22px rgba(15, 23, 42, 0.16);
      }
      .btn.dark.tab.error {
        border-color: #f87171;
        background: #f87171;
        color: #450a0a;
        box-shadow: 0 0 0 2px rgba(252, 165, 165, 0.95), 0 0 8px rgba(252, 165, 165, 0.5), 0 10px 22px rgba(0, 0, 0, 0.42);
      }
      .btn.tab.bottom-right-tab {
        border-radius: 0 0 8px 8px;
        border-top-color: transparent;
      }
      .btn.tab.top-tab,
      .btn.tab.top-right-tab,
      .btn.tab.top-left-tab {
        border-radius: 8px 8px 0 0;
        border-bottom-color: transparent;
      }
      .btn.tab .icon-shell {
        display: none;
      }
      .label {
        display: none;
        white-space: nowrap;
      }
      .btn.tab .label {
        display: inline;
      }
      .btn.tab.loading .label {
        opacity: 0.74;
      }
      @keyframes mt-input-button-rainbow {
        0% { box-shadow: 0 0 0 2px #ef4444, 0 0 10px rgba(239, 68, 68, 0.9), 0 10px 22px rgba(15, 23, 42, 0.16); }
        16% { box-shadow: 0 0 0 2px #f97316, 0 0 10px rgba(249, 115, 22, 0.9), 0 10px 22px rgba(15, 23, 42, 0.16); }
        33% { box-shadow: 0 0 0 2px #eab308, 0 0 10px rgba(234, 179, 8, 0.9), 0 10px 22px rgba(15, 23, 42, 0.16); }
        50% { box-shadow: 0 0 0 2px #22c55e, 0 0 10px rgba(34, 197, 94, 0.9), 0 10px 22px rgba(15, 23, 42, 0.16); }
        66% { box-shadow: 0 0 0 2px #06b6d4, 0 0 10px rgba(6, 182, 212, 0.9), 0 10px 22px rgba(15, 23, 42, 0.16); }
        83% { box-shadow: 0 0 0 2px #6366f1, 0 0 10px rgba(99, 102, 241, 0.9), 0 10px 22px rgba(15, 23, 42, 0.16); }
        100% { box-shadow: 0 0 0 2px #ec4899, 0 0 10px rgba(236, 72, 153, 0.9), 0 10px 22px rgba(15, 23, 42, 0.16); }
      }
    `;
    button.className = "btn";
    button.type = "button";
    button.setAttribute("aria-label", "Translate and replace input text");
    button.title = "Translate and replace";
    icon.className = "icon-shell";
    icon.setAttribute("aria-hidden", "true");
    const fallback = document.createElement("span");
    fallback.className = "logo-fallback";
    fallback.textContent = "MT";
    if (pu && typeof pu.getAppLogoInlineHtml === "function" && typeof pu.setHtml === "function") {
      pu.setHtml(icon, pu.getAppLogoInlineHtml("mt-input-button-logo"));
      if (!icon.querySelector("svg")) {
        icon.classList.add("no-logo");
      }
    } else {
      icon.classList.add("no-logo");
    }
    icon.appendChild(fallback);
    label.className = "label";
    label.textContent = "Translate";
    button.appendChild(icon);
    button.appendChild(label);
    shadow.appendChild(style);
    shadow.appendChild(button);
    applyStoredTheme(button);
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await quickTranslateEditable(state.activeEditable);
    });
    state.buttonHost = host;
    return host;
  }

  function getInlineButton() {
    const host = ensureButtonHost();
    return host.shadowRoot ? host.shadowRoot.querySelector(".btn") : null;
  }

  function setButtonBusy(isBusy) {
    const button = getInlineButton();
    if (!button) {
      return;
    }
    button.disabled = !!isBusy;
    button.classList.toggle("loading", !!isBusy);
    button.classList.remove("error");
    button.title = isBusy ? "Translating..." : "Translate and replace";
    button.setAttribute("aria-label", isBusy ? "Translating input text" : "Translate and replace input text");
  }

  function flashButtonError(message) {
    const button = getInlineButton();
    if (!button) {
      return;
    }
    button.disabled = false;
    button.classList.remove("loading");
    button.classList.add("error");
    button.title = message || "Could not translate";
    setTimeout(() => {
      button.classList.remove("error");
      button.title = "Translate and replace";
      button.setAttribute("aria-label", "Translate and replace input text");
    }, 1800);
  }

  function isOwnElement(element) {
    return !!element && (
      element.id === buttonHostId ||
      element.id === panelHostId ||
      element.id === constants.popupId ||
      (state.buttonHost && state.buttonHost.contains(element)) ||
      (state.panelHost && state.panelHost.contains(element))
    );
  }

  function candidateCollides(candidate) {
    const points = [
      [candidate.left + candidate.width / 2, candidate.top + candidate.height / 2],
      [candidate.left + 4, candidate.top + 4],
      [candidate.left + candidate.width - 4, candidate.top + 4],
      [candidate.left + candidate.width - 4, candidate.top + candidate.height - 4]
    ];

    return points.some(([x, y]) => {
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
        return true;
      }
      return document.elementsFromPoint(x, y).some((element) => {
        if (!element || element === document.documentElement || element === document.body || isOwnElement(element)) {
          return false;
        }
        if (state.activeEditable && (element === state.activeEditable || state.activeEditable.contains(element))) {
          return false;
        }
        const style = window.getComputedStyle(element);
        if (style.pointerEvents === "none" || style.visibility === "hidden" || style.display === "none") {
          return false;
        }
        return true;
      });
    });
  }

  function clampCandidate(candidate) {
    const margin = 6;
    return Object.assign({}, candidate, {
      left: Math.min(Math.max(candidate.left, margin), Math.max(margin, window.innerWidth - candidate.width - margin)),
      top: Math.min(Math.max(candidate.top, margin), Math.max(margin, window.innerHeight - candidate.height - margin))
    });
  }

  function clampNumber(value, min, max) {
    if (max < min) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }

  function uniqueCandidates(candidates) {
    const seen = new Set();
    return candidates.filter((candidate) => {
      const key = `${Math.round(candidate.left)}:${Math.round(candidate.top)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function applyHorizontalOffset(candidate, horizontalOffset) {
    return Object.assign({}, candidate, {
      left: candidate.left + horizontalOffset
    });
  }

  function buildFixedButtonCandidate(rect, size, gap, mode, horizontalOffset) {
    const inset = 4;
    const midTop = rect.top + (rect.height / 2) - (size / 2);
    const canFitVertically = rect.height >= size + (inset * 2);
    const insideTop = canFitVertically
      ? clampNumber(midTop, rect.top + inset, rect.bottom - size - inset)
      : midTop;
    const offset = Number(horizontalOffset) || 0;

    if (mode === "bottom-right-tab") {
      const width = 82;
      const height = 26;
      const minLeft = rect.left + inset;
      const maxLeft = rect.right - width - inset;
      const left = maxLeft >= minLeft ? maxLeft : rect.right - width;
      return applyHorizontalOffset({ left, top: rect.bottom - 1, width, height, variant: "bottom-right-tab" }, offset);
    }
    if (mode === "top-tab") {
      const width = 82;
      const height = 26;
      return applyHorizontalOffset({ left: rect.left + (rect.width / 2) - (width / 2), top: rect.top - height + 1, width, height, variant: "top-tab" }, offset);
    }
    if (mode === "top-right-tab") {
      const width = 82;
      const height = 26;
      const minLeft = rect.left + inset;
      const maxLeft = rect.right - width - inset;
      const left = maxLeft >= minLeft ? maxLeft : rect.right - width;
      return applyHorizontalOffset({ left, top: rect.top - height + 1, width, height, variant: "top-right-tab" }, offset);
    }
    if (mode === "top-left-tab") {
      const width = 82;
      const height = 26;
      return applyHorizontalOffset({ left: rect.left + inset, top: rect.top - height + 1, width, height, variant: "top-left-tab" }, offset);
    }
    if (mode === "outside-left") {
      return applyHorizontalOffset({ left: rect.left - size - gap, top: midTop, width: size, height: size }, offset);
    }
    if (mode === "top-right") {
      return applyHorizontalOffset({ left: rect.right - size, top: rect.top - size - gap, width: size, height: size }, offset);
    }
    return applyHorizontalOffset({ left: rect.right - size - inset, top: insideTop, width: size, height: size }, offset);
  }

  function buildInsideShiftButtonCandidates(rect, size, gap, horizontalOffset) {
    const inset = 4;
    const midTop = rect.top + (rect.height / 2) - (size / 2);
    const candidates = [];
    const offset = Number(horizontalOffset) || 0;
    const canFitInside = rect.width >= size + (inset * 2);
    const canFitVertically = rect.height >= size + (inset * 2);

    if (canFitInside) {
      const minLeft = rect.left + inset;
      const maxLeft = rect.right - size - inset;
      const top = canFitVertically
        ? clampNumber(midTop, rect.top + inset, rect.bottom - size - inset)
        : midTop;
      const topValues = canFitVertically
        ? [
          top,
          rect.top + inset,
          rect.bottom - size - inset
        ]
        : [top];
      const maxShift = Math.max(0, maxLeft - minLeft);
      const shiftStep = size + gap;
      const shiftValues = [
        0,
        shiftStep,
        shiftStep * 2,
        Math.round(maxShift / 2),
        maxShift
      ];

      shiftValues.forEach((shift) => {
        const left = clampNumber(maxLeft - shift, minLeft, maxLeft);
        topValues.forEach((candidateTop) => {
          candidates.push(applyHorizontalOffset({ left, top: candidateTop, width: size, height: size }, offset));
        });
      });
    }

    return candidates;
  }

  function buildAutoButtonCandidates(rect, size, gap, horizontalOffset) {
    const candidates = [
      buildFixedButtonCandidate(rect, size, gap, "inside-right", horizontalOffset),
      buildFixedButtonCandidate(rect, size, gap, "outside-left", horizontalOffset),
      buildFixedButtonCandidate(rect, size, gap, "bottom-right-tab", horizontalOffset),
      buildFixedButtonCandidate(rect, size, gap, "top-tab", horizontalOffset),
      buildFixedButtonCandidate(rect, size, gap, "top-right-tab", horizontalOffset),
      buildFixedButtonCandidate(rect, size, gap, "top-left-tab", horizontalOffset),
      ...buildInsideShiftButtonCandidates(rect, size, gap, horizontalOffset)
    ];

    // Last resort: stay visually attached to the field instead of floating
    // completely outside it.
    const midTop = rect.top + (rect.height / 2) - (size / 2);
    candidates.push(
      applyHorizontalOffset({ left: rect.right - size + 2, top: midTop, width: size, height: size }, horizontalOffset),
      applyHorizontalOffset({ left: rect.left - 2, top: midTop, width: size, height: size }, horizontalOffset)
    );

    return uniqueCandidates(candidates).map(clampCandidate);
  }

  function buildButtonCandidates(rect, size, gap, mode, horizontalOffset) {
    const normalizedMode = mode || "auto";
    if (normalizedMode === "off") {
      return [];
    }
    if (normalizedMode !== "auto") {
      return [clampCandidate(buildFixedButtonCandidate(rect, size, gap, normalizedMode, horizontalOffset))];
    }
    return buildAutoButtonCandidates(rect, size, gap, horizontalOffset);
  }

  function positionButton() {
    if (!state.activeEditable || !canShowInlineButtonForEditable(state.activeEditable)) {
      hideButton();
      return;
    }
    const mode = getInputButtonMode(state.settings);
    if (mode === "off") {
      hideButton();
      return;
    }

    const host = ensureButtonHost();
    const rect = state.activeEditable.getBoundingClientRect();
    const size = 40;
    const gap = 6;
    const horizontalOffset = getInputButtonHorizontalOffset(state.settings);
    const candidates = buildButtonCandidates(rect, size, gap, mode, horizontalOffset);
    if (!candidates.length) {
      hideButton();
      return;
    }

    const selected = mode === "auto"
      ? (candidates.find((candidate) => !candidateCollides(candidate)) || candidates[0])
      : candidates[0];
    const button = getInlineButton();
    if (button) {
      const isTopTab = selected.variant === "top-tab" || selected.variant === "top-right-tab" || selected.variant === "top-left-tab";
      const isTab = selected.variant === "bottom-right-tab" || isTopTab;
      button.classList.toggle("tab", isTab);
      button.classList.toggle("bottom-right-tab", selected.variant === "bottom-right-tab");
      button.classList.toggle("top-tab", selected.variant === "top-tab");
      button.classList.toggle("top-right-tab", selected.variant === "top-right-tab");
      button.classList.toggle("top-left-tab", selected.variant === "top-left-tab");
    }
    host.style.left = `${Math.round(selected.left)}px`;
    host.style.top = `${Math.round(selected.top)}px`;
    host.style.display = "block";
  }

  function scheduleButtonPosition() {
    if (state.reflowFrame) {
      cancelAnimationFrame(state.reflowFrame);
    }
    state.reflowFrame = requestAnimationFrame(() => {
      state.reflowFrame = 0;
      positionButton();
    });
  }

  function hideButton() {
    if (state.buttonHost) {
      state.buttonHost.style.display = "none";
    }
  }

  function deactivateEditable() {
    state.activeEditable = null;
    state.settings = null;
    observeEditable(null);
    hideButton();
  }

  function editableHasFocus(editable) {
    const active = document.activeElement;
    return !!editable
      && !!active
      && (
        active === editable
        || editable.contains(active)
      );
  }

  function observeEditable(editable) {
    if (state.resizeObserver) {
      state.resizeObserver.disconnect();
      state.resizeObserver = null;
    }
    if (typeof ResizeObserver === "function" && editable) {
      state.resizeObserver = new ResizeObserver(scheduleButtonPosition);
      state.resizeObserver.observe(editable);
    }
  }

  async function activateEditable(editable, options) {
    if (!editable || !canShowInlineButtonForEditable(editable)) {
      deactivateEditable();
      return false;
    }

    const settings = await state.getSettings();
    if (!(options && options.allowWithoutFocus) && !editableHasFocus(editable)) {
      deactivateEditable();
      return false;
    }
    if (!pu.isHostAllowedForInputButton(settings, window.location.hostname)) {
      deactivateEditable();
      return false;
    }
    if (getInputButtonMode(settings) === "off") {
      deactivateEditable();
      return false;
    }

    state.settings = settings;
    state.activeEditable = editable;
    observeEditable(editable);
    ensureButtonHost();
    scheduleButtonPosition();
    return true;
  }

  function buildInputPanelBody(_container, dom) {
    const el = dom.el;
    return [
      el("div", { class: "controls", "aria-label": "Input translation controls" }, [
        el("div", { class: "control" }, [
          el("label", { for: "mt-input-target" }, "Target"),
          el("select", { id: "mt-input-target", "data-role": "target" }),
          el("input", {
            class: "hidden",
            type: "text",
            "data-role": "target-custom",
            placeholder: "Language code"
          })
        ]),
        el("div", { class: "control" }, [
          el("label", { for: "mt-input-style" }, "Style"),
          el("select", { id: "mt-input-style", "data-role": "style" })
        ])
      ]),
      el("details", { class: "source-panel", open: true }, [
        el("summary", {}, [
          el("span", { class: "source-summary-copy" }, [
            el("label", { class: "section-label", for: "mt-input-source" }, "Source text")
          ]),
          el("span", { class: "source-summary-actions" }, [
            el("span", { class: "source-toggle-label", "aria-hidden": "true" })
          ])
        ]),
        el("div", { class: "source-body" }, [
          el("textarea", { id: "mt-input-source", "data-role": "source" })
        ])
      ]),
      el("section", { class: "translation-panel" }, [
        el("div", { class: "translation-header" }, [
          el("label", { class: "section-label", for: "mt-input-result" }, "Translation")
        ]),
        el("textarea", { id: "mt-input-result", "data-role": "result", readonly: true })
      ])
    ];
  }

  function buildInputPanelFooter(_container, dom) {
    const el = dom.el;
    return [
      el("span", { class: "status", "data-role": "status", "aria-live": "polite" }),
      el("div", { class: "actions" }, [
        el("button", { type: "button", "data-role": "translate" }, "Translate"),
        el("button", {
          class: "primary",
          type: "button",
          "data-role": "replace",
          disabled: true
        }, "Replace")
      ])
    ];
  }

  function ensurePanelHost() {
    if (state.panelHost) {
      return state.panelHost;
    }

    const host = shell.createPanelHost({
      hostId: panelHostId,
      ariaLabel: "Translate input text",
      title: "Translate input",
      closeLabel: "Close",
      extraCss: `
        .panel { min-height: 260px; }
        .translation-panel { min-height: 120px; }
        .source-body textarea {
          min-height: 62px;
          max-height: 118px;
          border: 0;
          border-radius: 0;
          background: transparent;
          padding: 0;
        }
        .translation-panel textarea {
          flex: 1 1 auto;
          min-height: 0;
          border: 0;
          border-radius: 0;
          font-size: 13px;
          line-height: 1.58;
          overflow: auto;
          padding: 10px;
          background: var(--mt-surface);
        }`,
      bodyBuilder: buildInputPanelBody,
      footerBuilder: buildInputPanelFooter
    });

    const shadow = host.shadowRoot;
    shadow.querySelector('[data-role="target"]').addEventListener("change", () => {
      const target = shadow.querySelector('[data-role="target"]');
      shadow.querySelector('[data-role="target-custom"]').classList.toggle("hidden", target.value !== "custom");
      if (state.panel) {
        state.panel.userChangedTarget = true;
      }
    });
    shadow.querySelector('[data-role="target-custom"]').addEventListener("input", () => {
      if (state.panel) {
        state.panel.userChangedTarget = true;
      }
    });
    shadow.querySelector('[data-role="source"]').addEventListener("input", handlePanelSourceInput);
    shadow.querySelector(".close").addEventListener("click", hidePanel);
    shadow.querySelector('[data-role="translate"]').addEventListener("click", () => runPanelTranslation(false));
    shadow.querySelector('[data-role="replace"]').addEventListener("click", replaceFromPanel);
    state.panelHost = host;
    return host;
  }

  function getPanelElements() {
    const host = ensurePanelHost();
    const shadow = host.shadowRoot;
    return {
      host,
      panel: shadow.querySelector(".panel"),
      modelContainer: shadow.querySelector('[data-role="model-container"]'),
      model: shadow.querySelector('[data-role="model"]'),
      target: shadow.querySelector('[data-role="target"]'),
      targetCustom: shadow.querySelector('[data-role="target-custom"]'),
      style: shadow.querySelector('[data-role="style"]'),
      source: shadow.querySelector('[data-role="source"]'),
      result: shadow.querySelector('[data-role="result"]'),
      status: shadow.querySelector('[data-role="status"]'),
      translate: shadow.querySelector('[data-role="translate"]'),
      replace: shadow.querySelector('[data-role="replace"]')
    };
  }

  function ensurePanelModelPicker(elements) {
    if (!state.modelPicker) {
      state.modelPicker = shell.createModelPicker(elements.modelContainer, {
        rootElement: elements.host.shadowRoot,
        onChange() {
          updateReplaceState();
        }
      });
    }
    return state.modelPicker;
  }

  function getModelLoadingStatus(hasModelOptions) {
    return hasModelOptions
      ? "Choose model, target, and style."
      : "Enable a provider and choose a model in Settings.";
  }

  function setPanelTargetLanguage(elements, targetLanguage) {
    const languageOptions = constants.languageOptions || [];
    const target = String(targetLanguage || "en").trim();
    const knownTarget = languageOptions.some((item) => item.code === target);
    elements.target.value = knownTarget ? target : "custom";
    elements.targetCustom.value = knownTarget ? "" : target;
    elements.targetCustom.classList.toggle("hidden", elements.target.value !== "custom");
  }

  function populatePanelOptions(elements, settings, text) {
    const languageOptions = constants.languageOptions || [];
    const targetLanguage = pu.resolveInputTargetLanguage(settings, text, settings.targetLanguage);
    elements.target.replaceChildren(...languageOptions.map((item) => {
      const option = document.createElement("option");
      option.value = item.code;
      option.textContent = `${item.label} (${item.code})`;
      return option;
    }), (() => {
      const option = document.createElement("option");
      option.value = "custom";
      option.textContent = "Custom...";
      return option;
    })());
    setPanelTargetLanguage(elements, targetLanguage);

    const styles = constants.inputContextStyles || [];
    elements.style.replaceChildren(...styles.map((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      return option;
    }));
    elements.style.value = pu.getInputContextStyle(settings.defaultInputContextStyle);
  }

  function getTargetLanguage(elements) {
    return elements.target.value === "custom"
      ? (elements.targetCustom.value.trim() || "en")
      : (elements.target.value || "en");
  }

  function getPanelSourceText(elements) {
    return String(elements.source.value || "").trim();
  }

  function getModelRoute(elements) {
    return ensurePanelModelPicker(elements).getRoute();
  }

  function placePanel(elements, editable) {
    const margin = 12;
    const panelRect = elements.panel.getBoundingClientRect();
    const editableRect = editable.getBoundingClientRect();
    const width = Math.min(panelRect.width || 340, window.innerWidth - margin * 2);
    const height = Math.min(panelRect.height || 280, window.innerHeight - margin * 2);
    const desiredLeft = editableRect.left + (editableRect.width / 2) - (width / 2);
    const below = editableRect.bottom + 10;
    const above = editableRect.top - height - 10;
    const desiredTop = below + height <= window.innerHeight - margin ? below : above;
    const left = Math.min(Math.max(desiredLeft, margin), Math.max(margin, window.innerWidth - width - margin));
    const top = Math.min(Math.max(desiredTop, margin), Math.max(margin, window.innerHeight - height - margin));
    elements.panel.style.left = `${Math.round(left)}px`;
    elements.panel.style.top = `${Math.round(top)}px`;
  }

  function updateReplaceState() {
    if (!state.panel) {
      return;
    }
    const elements = getPanelElements();
    const changed = hasInputChanged(state.panel.textInfo);
    const sourceText = getPanelSourceText(elements);
    const hasResult = !!String(state.panel.resultText || "").trim();
    const resultMatchesSource = hasResult && state.panel.resultSourceText === sourceText;
    elements.translate.disabled = state.panel.translating || !state.panel.hasModelOptions || !sourceText;
    elements.replace.disabled = !hasResult || !resultMatchesSource || changed || state.panel.translating;
    if (changed && hasResult) {
      elements.status.textContent = "Input changed. Translate again before replacing.";
    } else if (hasResult && !resultMatchesSource) {
      elements.status.textContent = "Source changed. Translate again before replacing.";
    }
  }

  function handlePanelSourceInput() {
    if (!state.panel) {
      return;
    }
    const elements = getPanelElements();
    if (state.panel.translating) {
      state.panel.token += 1;
      state.panel.translating = false;
      state.streamClient.disconnect();
    }
    state.panel.sourceText = getPanelSourceText(elements);
    state.panel.resultText = "";
    state.panel.resultSourceText = "";
    elements.result.value = "";
    elements.status.textContent = state.panel.sourceText
      ? "Source changed. Translate again before replacing."
      : "Enter source text to translate.";
    updateReplaceState();
  }

  async function openForEditable(editable) {
    if (!editable || !isEditableElement(editable)) {
      return false;
    }
    const settings = await state.getSettings();
    const textInfo = captureEditableText(editable);
    if (!textInfo) {
      return false;
    }

    const elements = getPanelElements();
    populatePanelOptions(elements, settings, textInfo.text);
    const modelPicker = ensurePanelModelPicker(elements);
    const modelOptionsReady = modelPicker.load();
    const initialHasModelOptions = modelPicker.hasOptions();
    state.panel = {
      editable,
      textInfo,
      settings,
      sourceText: textInfo.text,
      resultText: "",
      resultSourceText: "",
      translating: false,
      token: 0,
      userChangedTarget: false,
      hasModelOptions: initialHasModelOptions
    };
    elements.source.value = textInfo.text;
    elements.result.value = "";
    elements.status.textContent = initialHasModelOptions
      ? getModelLoadingStatus(true)
      : "Loading models...";
    elements.translate.disabled = !initialHasModelOptions;
    elements.replace.disabled = true;
    elements.panel.style.width = "";
    elements.panel.style.height = "";
    elements.panel.classList.remove("hidden");
    hideButton();
    shell.scheduleModelReveal(elements.panel, state, false);
    placePanel(elements, editable);
    elements.target.focus();
    const panelRef = state.panel;
    modelOptionsReady.then((hasModelOptions) => {
      if (!state.panel || state.panel !== panelRef) {
        return;
      }
      state.panel.hasModelOptions = !!hasModelOptions;
      if (!state.panel.translating && !state.panel.resultText) {
        elements.status.textContent = getPanelSourceText(elements)
          ? getModelLoadingStatus(state.panel.hasModelOptions)
          : "Enter source text to translate.";
      }
      updateReplaceState();
    });
    return true;
  }

  function appendPanelChunk(chunk, meta) {
    if (!state.panel || !state.panel.translating) {
      return;
    }
    const elements = getPanelElements();
    const text = String(chunk || "");
    if (text) {
      state.panel.resultText += text;
      elements.result.value = state.panel.resultText;
    }
    if (meta && meta.providerName && meta.model) {
      elements.status.textContent = `${meta.providerName} • ${meta.model}`;
    }
  }

  async function runPanelTranslation(bypassCache) {
    if (!state.panel || state.panel.translating) {
      return;
    }

    const elements = getPanelElements();
    let textInfo = state.panel.textInfo;
    if (hasInputChanged(textInfo)) {
      textInfo = captureEditableText(state.panel.editable);
      if (!textInfo) {
        elements.status.textContent = "There is no input text to translate.";
        return;
      }
      state.panel.textInfo = textInfo;
      state.panel.sourceText = textInfo.text;
      state.panel.resultSourceText = "";
      if (!getPanelSourceText(elements)) {
        elements.source.value = textInfo.text;
      }
    }

    const sourceText = getPanelSourceText(elements);
    if (!sourceText) {
      elements.status.textContent = "Enter source text to translate.";
      updateReplaceState();
      return;
    }

    const token = state.panel.token + 1;
    state.panel.token = token;
    state.panel.translating = true;
    state.panel.sourceText = sourceText;
    state.panel.resultText = "";
    state.panel.resultSourceText = "";
    elements.result.value = "";
    elements.status.textContent = "Translating...";
    elements.translate.disabled = true;
    elements.replace.disabled = true;

    try {
      const settings = state.panel.settings || await state.getSettings();
      const detectedSourceLanguage = pu.detectTextLanguage(sourceText);
      const requestedTargetLanguage = getTargetLanguage(elements);
      const targetLanguage = state.panel.userChangedTarget
        ? requestedTargetLanguage
        : pu.resolveInputTargetLanguage(settings, sourceText, settings.targetLanguage);
      if (!state.panel.userChangedTarget) {
        setPanelTargetLanguage(elements, targetLanguage);
      }
      const modelRoute = getModelRoute(elements);
      if (state.panel.hasModelOptions && !modelRoute.providerIds.length) {
        elements.status.textContent = "Choose a model first.";
        return;
      }

      const result = await state.streamClient.request(sourceText, {
        targetLanguage,
        sourceLanguage: detectedSourceLanguage,
        contextStyle: pu.getInputContextStyle(elements.style.value),
        dictionaryModeForSingleWord: false,
        bypassCache,
        providerIds: modelRoute.providerIds,
        modelOverrides: modelRoute.modelOverrides
      });
      if (!state.panel || state.panel.token !== token) {
        return;
      }
      state.panel.resultText = String(result.translatedText || state.panel.resultText || "").trim();
      state.panel.resultSourceText = sourceText;
      elements.result.value = state.panel.resultText;
      elements.status.textContent = `${result.providerName} • ${result.model} • ${result.latencyMs} ms${result.fromCache ? " • Cached" : ""}`;
    } catch (error) {
      if (state.panel && state.panel.token === token) {
        elements.status.textContent = error.message || "Translation failed.";
      }
    } finally {
      if (state.panel && state.panel.token === token) {
        state.panel.translating = false;
        elements.translate.disabled = false;
        updateReplaceState();
      }
    }
  }

  async function quickTranslateEditable(editable) {
    if (state.quickTranslating) {
      return false;
    }
    if (!editable || !isEditableElement(editable)) {
      flashButtonError("There is no input text to translate.");
      return false;
    }

    const textInfo = captureEditableText(editable);
    if (!textInfo) {
      flashButtonError("There is no input text to translate.");
      return false;
    }

    hidePanel();
    state.quickTranslating = true;
    setButtonBusy(true);
    let errorMessage = "";

    try {
      const settings = await state.getSettings();
      const detectedSourceLanguage = pu.detectTextLanguage(textInfo.text);
      const targetLanguage = pu.resolveInputTargetLanguage(settings, textInfo.text, settings.targetLanguage);
      const result = await state.streamClient.request(textInfo.text, {
        targetLanguage,
        sourceLanguage: detectedSourceLanguage,
        contextStyle: pu.getInputContextStyle(settings.defaultInputContextStyle),
        dictionaryModeForSingleWord: false
      });

      if (!replaceEditableText(textInfo, result.translatedText)) {
        errorMessage = hasInputChanged(textInfo)
          ? "Input changed. Try again."
          : "Could not replace input text.";
      }
    } catch (error) {
      errorMessage = error.message || "Translation failed.";
    } finally {
      state.quickTranslating = false;
      setButtonBusy(false);
      if (errorMessage) {
        flashButtonError(errorMessage);
      }
      scheduleButtonPosition();
    }

    return !errorMessage;
  }

  function replaceFromPanel() {
    if (!state.panel || state.panel.translating) {
      return;
    }
    const elements = getPanelElements();
    if (hasInputChanged(state.panel.textInfo)) {
      elements.status.textContent = "Input changed. Translate again before replacing.";
      updateReplaceState();
      return;
    }
    if (state.panel.resultSourceText !== getPanelSourceText(elements)) {
      elements.status.textContent = "Source changed. Translate again before replacing.";
      updateReplaceState();
      return;
    }
    if (!replaceEditableText(state.panel.textInfo, state.panel.resultText)) {
      elements.status.textContent = "Could not replace the input text.";
      return;
    }
    hidePanel();
    scheduleButtonPosition();
  }

  function hidePanel() {
    const hadPanel = !!state.panel;
    shell.clearModelReveal(state);
    if (state.streamClient) {
      state.streamClient.disconnect();
    }
    if (state.panelHost && state.panelHost.shadowRoot) {
      const panel = state.panelHost.shadowRoot.querySelector(".panel");
      if (panel) {
        panel.classList.remove("model-revealed");
        panel.classList.add("hidden");
      }
    }
    state.panel = null;
    if (hadPanel && state.activeEditable) {
      if (editableHasFocus(state.activeEditable)) {
        scheduleButtonPosition();
      } else {
        deactivateEditable();
      }
    }
  }

  function editableStillHasFocus() {
    return editableHasFocus(state.activeEditable) || isOwnElement(document.activeElement);
  }

  function bindDocumentEvents() {
    document.addEventListener("focusin", (event) => {
      if (eventTouchesOwnUi(event)) {
        return;
      }
      const editable = findEditable(event.target);
      if (editable) {
        activateEditable(editable).catch(() => deactivateEditable());
      } else {
        deactivateEditable();
      }
    }, true);

    document.addEventListener("mousedown", (event) => {
      if (eventTouchesOwnUi(event)) {
        return;
      }
      const editable = findEditable(event.target);
      if (!editable && !state.panel) {
        deactivateEditable();
      }
    }, true);

    document.addEventListener("focusout", () => {
      setTimeout(() => {
        if (!state.panel && !editableStillHasFocus()) {
          deactivateEditable();
        }
      }, 0);
    }, true);

    document.addEventListener("contextmenu", (event) => {
      if (eventTouchesOwnUi(event)) {
        return;
      }
      state.contextMenuEditable = findEditable(event.target);
      if (state.contextMenuEditable) {
        activateEditable(state.contextMenuEditable, { allowWithoutFocus: true }).catch(() => {});
      }
    }, true);

    document.addEventListener("input", (event) => {
      const editable = findEditable(event.target);
      if (editable && editable === state.activeEditable) {
        scheduleButtonPosition();
      }
      if (state.panel && editable === state.panel.editable) {
        updateReplaceState();
      }
    }, true);

    window.addEventListener("scroll", scheduleButtonPosition, true);
    window.addEventListener("resize", scheduleButtonPosition, true);
  }

  namespace.inputTranslator = {
    start(getSettings) {
      if (state.getSettings) {
        return;
      }
      state.getSettings = getSettings;
      state.streamClient = namespace.translationClient.create({
        onChunk: appendPanelChunk
      });
      bindDocumentEvents();
    },
    async openFromContextMenu() {
      const editable = state.contextMenuEditable && isEditableElement(state.contextMenuEditable)
        ? state.contextMenuEditable
        : findEditable(document.activeElement);
      if (!editable) {
        return false;
      }
      await activateEditable(editable, { allowWithoutFocus: true });
      // Context menu is an explicit user action, so it can translate ignored inline-button fields.
      return openForEditable(editable);
    }
  };
}(globalThis));
