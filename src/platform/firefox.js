(function initFirefoxPlatform(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};

  namespace.firefoxPlatform = {
    isAvailable() {
      return typeof browser !== "undefined";
    },
    storage: {
      async get(areaName, keys) {
        return browser.storage[areaName].get(keys);
      },
      async set(areaName, value) {
        return browser.storage[areaName].set(value);
      },
      async remove(areaName, keys) {
        return browser.storage[areaName].remove(keys);
      },
      onChanged(listener) {
        browser.storage.onChanged.addListener(listener);
      }
    },
    runtime: {
      sendMessage(message) {
        return browser.runtime.sendMessage(message);
      },
      onMessage(listener) {
        browser.runtime.onMessage.addListener(listener);
      },
      connect(connectInfo) {
        return browser.runtime.connect(connectInfo);
      },
      onConnect(listener) {
        browser.runtime.onConnect.addListener(listener);
      },
      onInstalled(listener) {
        browser.runtime.onInstalled.addListener(listener);
      },
      getURL(path) {
        return browser.runtime.getURL(path);
      }
    },
    tabs: {
      async create(createProperties) {
        return browser.tabs.create(createProperties);
      },
      async sendMessage(tabId, message, options) {
        return browser.tabs.sendMessage(tabId, message, options);
      },
      async query(queryInfo) {
        return browser.tabs.query(queryInfo);
      }
    },
    action: {
      onClicked(listener) {
        browser.action.onClicked.addListener(listener);
      }
    },
    contextMenus: {
      create(item) {
          return Promise.resolve(browser.contextMenus.create(item));
      },
      removeAll() {
        return browser.contextMenus.removeAll();
      },
      onClicked(listener) {
        browser.contextMenus.onClicked.addListener(listener);
      }
    }
  };
}(globalThis));
