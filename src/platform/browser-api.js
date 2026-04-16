(function initBrowserApi(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};
  const platform = namespace.firefoxPlatform && namespace.firefoxPlatform.isAvailable()
    ? namespace.firefoxPlatform
    : namespace.chromiumPlatform;

  namespace.browserApi = platform;
}(globalThis));