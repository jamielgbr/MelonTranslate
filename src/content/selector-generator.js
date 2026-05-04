(function initSelectorGenerator(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};

  function cssEscape(value) {
    if (globalThis.CSS && typeof globalThis.CSS.escape === "function") {
      return globalThis.CSS.escape(String(value || ""));
    }
    return String(value || "").replace(/[^a-zA-Z0-9_-]/g, function(character) {
      return "\\" + character;
    });
  }

  function quoteAttribute(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function isUnique(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch (_) {
      return false;
    }
  }

  function stableClassList(element) {
    return Array.from(element.classList || [])
      .filter(function(className) {
        return !/^mt-/.test(className)
          && !/^js-/.test(className)
          && !/\d{4,}/.test(className)
          && className.length <= 48;
      })
      .slice(0, 3);
  }

  function tagName(element) {
    return String(element.tagName || "").toLowerCase();
  }

  function attributeSelector(element) {
    var tag = tagName(element);
    var attributes = ["data-testid", "data-test", "data-qa", "aria-label", "role"];
    for (var index = 0; index < attributes.length; index += 1) {
      var name = attributes[index];
      var value = element.getAttribute(name);
      if (!value || String(value).length > 80) {
        continue;
      }
      var selector = tag + "[" + name + "=\"" + quoteAttribute(value) + "\"]";
      if (isUnique(selector)) {
        return selector;
      }
    }
    return "";
  }

  function simpleSelector(element) {
    var tag = tagName(element);
    if (!tag) {
      return "";
    }
    if (element.id) {
      var idSelector = "#" + cssEscape(element.id);
      if (isUnique(idSelector)) {
        return idSelector;
      }
      return tag + idSelector;
    }
    var attr = attributeSelector(element);
    if (attr) {
      return attr;
    }
    var classes = stableClassList(element);
    if (classes.length) {
      var classSelector = tag + classes.map(function(className) {
        return "." + cssEscape(className);
      }).join("");
      if (isUnique(classSelector)) {
        return classSelector;
      }
      return classSelector;
    }
    return tag;
  }

  function nthOfTypeSelector(element) {
    var tag = tagName(element);
    var index = 1;
    var sibling = element;
    while ((sibling = sibling.previousElementSibling)) {
      if (tagName(sibling) === tag) {
        index += 1;
      }
    }
    return tag + ":nth-of-type(" + index + ")";
  }

  function generateSelector(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }
    if (element === document.documentElement) {
      return "html";
    }
    if (element === document.body) {
      return "body";
    }

    var direct = simpleSelector(element);
    if (direct && isUnique(direct)) {
      return direct;
    }

    var parts = [];
    var current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
      var part = simpleSelector(current);
      if (!part) {
        break;
      }
      if (!isUnique(part)) {
        part = nthOfTypeSelector(current);
      }
      parts.unshift(part);
      var selector = parts.join(" > ");
      if (isUnique(selector)) {
        return selector;
      }
      current = current.parentElement;
    }

    return parts.join(" > ") || direct;
  }

  namespace.selectorGenerator = {
    generateSelector: generateSelector
  };
}(globalThis));
