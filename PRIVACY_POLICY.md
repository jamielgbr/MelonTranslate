# Privacy Policy for MelonTranslate

**Effective Date**: April 13, 2026

## Overview

MelonTranslate is a open source translation browser extension. We do not collect, store, or sell your personal data.

## What We Collect

**We do not collect data about you.** MelonTranslate runs in your browser and does not send data to us.

## What Your Provider Receives

When you use MelonTranslate, the following data may be sent directly to the translation or speech provider you choose:

1. **The text you submit for translation** (selected from a page or typed directly)
2. **Source and target languages**
3. **Page URL**, when the request includes page context
4. **Your API key or other configured authentication credentials**, for providers that require them
5. **Your selected model and generation settings** (such as temperature), for providers
6. **Application identification headers**, for certain providers. Requests to OpenRouter include an `HTTP-Referer` header and an `X-Title` header to identify the application, as required by OpenRouter's API guidelines. Requests to Groq include a `User-Agent` header. No personal information is included in these headers.

If you choose Google Translate or use Google read aloud, the selected or translated text is sent directly to Google for processing.

MelonTranslate does not intercept, log, store, or analyze that request data.

## API Key Storage

- **Location**: API keys are stored locally in browser storage.
- **Encryption**: Keys are encrypted with **AES-256-GCM** using a per-installation secret stored locally.
- **Decryption**: Keys are decrypted only inside your browser when needed for a request.
- **Removal**: You can overwrite a saved key at any time from the Settings page. Saving a new value will clear the previous key from local storage.

## Translation History

- **Optional**: Translation history is disabled by default.
- **Local only**: If enabled, history is stored in your browser.
- **Deletion**: You can clear history at any time in Settings.
- **Stored fields**: Source text, target language, provider name, timestamp, and translation result.

History is never sent to us.

## Third-Party Providers

Your chosen provider handles the translation or read-aloud request. Review that provider's privacy policy to understand how it handles your data.

- [OpenAI Privacy policy](https://openai.com/privacy/)
- [Anthropic Privacy Policy](https://www.anthropic.com/privacy)
- [Google Privacy Policy](https://policies.google.com/privacy)
- [OpenRouter Privacy Policy](https://openrouter.ai/privacy)
- [together.ai Privacy Policy](https://www.together.ai/privacy)
- [Fireworks AI Privacy Notice](https://fireworks.ai/privacy-policy)
- [Baseten Privacy Policy](https://www.baseten.co/privacy-policy/)
- [Z.ai Privacy Policy](https://docs.z.ai/legal-agreement/privacy-policy)
- [智谱 隐私政策](https://docs.bigmodel.cn/cn/terms/privacy-policy)
- [Kimi/月之暗面 (China) 开放平台隐私政策](https://platform.kimi.com/docs/agreement/userprivacy)
- [Kimi/Moonshot AI (Global) OpenPlatform Privacy Policy](https://platform.kimi.ai/docs/agreement/userprivacy)

MelonTranslate is not responsible for third-party data practices.

## Browser Permissions

MelonTranslate requests only the permissions needed to run the extension:

- **`storage`**: Save settings, encrypted API keys, and optional history locally.
- **`contextMenus`**: Add a right-click translation action.
- **`activeTab`**: Read selected text from the current tab.
- **`tabs`**: Open the Settings and Compare pages.
- **`<all_urls>`**: Detect selected text and show the in-page popup on any site.

## Data Retention

- **Settings**: Stored until you uninstall the extension or clear them.
- **History**: Stored until you clear it, if history is enabled.
- **Encryption secret**: Generated once per installation and never transmitted.

## Your Controls

You can:

- **View** your saved settings in the extension
- **Overwrite** saved API keys at any time from the Settings page
- **Delete** settings and history at any time
- **Export** your settings from the Settings page

## Changes to This Policy

We may update this policy from time to time. Changes will be reflected in the project files and release notes.

## Contact

For privacy questions, open an issue in the project repository.
