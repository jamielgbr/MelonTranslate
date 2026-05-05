(function initChromiumPlatform(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};

  function promisify(callbackInvoker) {
    return new Promise((resolve, reject) => {
      callbackInvoker((result) => {
        const runtimeError = chrome.runtime && chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        resolve(result);
      });
    });
  }

  namespace.chromiumPlatform = {
    isAvailable() {
      return typeof chrome !== "undefined" && typeof browser === "undefined";
    },
    storage: {
      async get(areaName, keys) {
        return promisify((done) => chrome.storage[areaName].get(keys, done));
      },
      async set(areaName, value) {
        return promisify((done) => chrome.storage[areaName].set(value, done));
      },
      async remove(areaName, keys) {
        return promisify((done) => chrome.storage[areaName].remove(keys, done));
      },
      onChanged(listener) {
        chrome.storage.onChanged.addListener(listener);
      }
    },
    runtime: {
      sendMessage(message) {
        return promisify((done) => chrome.runtime.sendMessage(message, done));
      },
      onMessage(listener) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          Promise.resolve(listener(message, sender))
            .then((response) => sendResponse(response))
            .catch((error) => sendResponse({ ok: false, error: { message: error.message } }));
          return true;
        });
      },
      connect(connectInfo) {
        return chrome.runtime.connect(connectInfo);
      },
      onConnect(listener) {
        chrome.runtime.onConnect.addListener(listener);
      },
      onInstalled(listener) {
        chrome.runtime.onInstalled.addListener(listener);
      },
      getManifest() {
        return chrome.runtime.getManifest();
      },
      getURL(path) {
        return chrome.runtime.getURL(path);
      }
    },
    tabs: {
      async create(createProperties) {
        return promisify((done) => chrome.tabs.create(createProperties, done));
      },
      async sendMessage(tabId, message, options) {
        if (options) {
          return promisify((done) => chrome.tabs.sendMessage(tabId, message, options, done));
        }
        return promisify((done) => chrome.tabs.sendMessage(tabId, message, done));
      },
      async query(queryInfo) {
        return promisify((done) => chrome.tabs.query(queryInfo, done));
      }
    },
    scripting: {
      async executeScript(details) {
        return promisify((done) => chrome.scripting.executeScript(details, done));
      }
    },
    action: {
      onClicked(listener) {
        chrome.action.onClicked.addListener(listener);
      }
    },
    contextMenus: {
      create(item) {
          return promisify((done) => chrome.contextMenus.create(item, done));
      },
      removeAll() {
        return promisify((done) => chrome.contextMenus.removeAll(done));
      },
      onClicked(listener) {
        chrome.contextMenus.onClicked.addListener(listener);
      }
    }
  };
}(globalThis));
