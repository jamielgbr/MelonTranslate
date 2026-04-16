# MelonTranslate - A browser extension for LLM-powered translation using your own API key

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

## Privacy

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

---

## License

[MIT License](LICENSE).
