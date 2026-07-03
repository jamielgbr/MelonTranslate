(function initHostPermissions(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const allSitesPermission = { origins: ["<all_urls>"] };

  function getApi(apiOverride) {
    return apiOverride || namespace.browserApi;
  }

  function canCheck(apiOverride) {
    const api = getApi(apiOverride);
    return !!(api && api.permissions && typeof api.permissions.contains === "function");
  }

  function canRequest(apiOverride) {
    const api = getApi(apiOverride);
    return !!(api && api.permissions && typeof api.permissions.request === "function");
  }

  async function containsAllSites(apiOverride) {
    const api = getApi(apiOverride);
    if (!canCheck(api)) {
      return true;
    }

    try {
      return !!(await api.permissions.contains(allSitesPermission));
    } catch (_) {
      return true;
    }
  }

  async function requestAllSites(apiOverride) {
    const api = getApi(apiOverride);
    if (!canRequest(api)) {
      return true;
    }

    return !!(await api.permissions.request(allSitesPermission));
  }

  namespace.hostPermissions = {
    canCheck,
    canRequest,
    containsAllSites,
    requestAllSites
  };
}(globalThis));
