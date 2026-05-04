# MelonTranslate

Set up your own API key, select any text on the page → get translation.

---

## Features

- **Select-to-translate** — highlight text, popup appears instantly
- **Multiple providers** — OpenAI, Anthropic, DeepSeek, Groq, or any OpenAI-compatible endpoints
- **Read aloud** — TTS for source and translated text (via Google Translate audio)
- **Compare mode** — side-by-side translation from multiple providers
- **Dictionary mode** — single-word definitions
- **Auto language detection** — switches to secondary target when source matches primary

---

## Browser Support

| Browser | Manifest |
|---------|----------|
| Firefox 128+ | `manifest.json` |
| Chromium | `manifest.chromium.json` |

---

## Build

```bash
./scripts/build-browser-variants.sh
```

Output:
- `dist/firefox/` — Firefox build
- `dist/chrome/` — Chromium build

---

## Testing

The test harness uses Node's built-in test runner and a local mock OpenAI-compatible server.

```bash
npm run test:unit
npm run test:e2e
npm run test:package
npm run test:live
```

- `test:unit` runs pure JS tests without a browser.
- `test:e2e` builds a demo Firefox extension, installs it as a temporary XPI through geckodriver, and verifies selection translation against the mock provider.
- `test:e2e:chrome` keeps the Chrome/CDP flow available. It auto-detects `.tools/chromium/chrome-linux/chrome` when present because current Chrome stable builds may refuse automated extension loading.
- `test:package` verifies `dist/chrome` and asks Chrome/Chromium to package it as a CRX.
- `test:live` is skipped unless `.env.test` sets `MT_LIVE_RUN=true`.

Copy `.env.test.example` to `.env.test` for optional API keys and browser overrides. Firefox E2E auto-detects `.tools/firefox/firefox` and `.tools/bin/geckodriver` when present; otherwise set `FIREFOX_EXECUTABLE_PATH` and `GECKODRIVER_PATH`. Headless Linux/WSL also needs `xvfb-run`.

---

## Privacy

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

---

## License

[MIT License](LICENSE).
