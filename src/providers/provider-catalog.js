(function initProviderCatalog(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};

  namespace.providerCatalog = [
    {
      id: "google-translate",
      displayName: "Google Translate",
      transport: "google-translate",
      defaultModel: "google-translate-web",
      baseUrl: "https://translate.googleapis.com",
      modelListPath: "",
      modelListAuth: "none",
      enabledByDefault: true,
      experimental: false,
      requiresApiKey: false,
      supportsReadAloud: true,
      staticModels: ["google-translate-web"],
      reason: "Built-in Google Translate web provider. No API key required."
    },
    {
      id: "openai",
      displayName: "OpenAI",
      transport: "openai-compatible",
      defaultModel: "gpt-5.4-mini",
      baseUrl: "https://api.openai.com/v1",
      modelListPath: "/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "anthropic",
      displayName: "Anthropic Claude",
      transport: "anthropic",
      defaultModel: "claude-haiku-4-5",
      baseUrl: "https://api.anthropic.com",
      modelListPath: "",
      modelListAuth: "none",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "deepseek",
      displayName: "DeepSeek",
      transport: "openai-compatible",
      defaultModel: "deepseek-chat",
      baseUrl: "https://api.deepseek.com/v1",
      modelListPath: "https://api.deepseek.com/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "openrouter",
      displayName: "OpenRouter",
      transport: "openai-compatible",
      defaultModel: "openai/gpt-5.4-mini",
      baseUrl: "https://openrouter.ai/api/v1",
      modelListPath: "/models/user",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false,
      extraHeaders: {
        "HTTP-Referer": "https://github.com/jamielgbr/MelonTranslate",
        "X-Title": "MelonTranslate"
      }
    },
    {
      id: "grok",
      displayName: "xAI Grok",
      transport: "openai-compatible",
      defaultModel: "grok-4-1-fast-non-reasoning",
      baseUrl: "https://api.x.ai/v1",
      modelListPath: "/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "groq",
      displayName: "Groq",
      transport: "openai-compatible",
      defaultModel: "openai/gpt-oss-20b",
      baseUrl: "https://api.groq.com/openai/v1",
      modelListPath: "/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false,
      extraHeaders: {
        "User-Agent": "melontranslate/0.1"
      }
    },
    {
      id: "fireworks",
      displayName: "Fireworks",
      transport: "openai-compatible",
      defaultModel: "accounts/fireworks/models/minimax-m2p7",
      baseUrl: "https://api.fireworks.ai/inference/v1",
      modelListPath: "https://api.fireworks.ai/v1/accounts/{account_id}/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "together",
      displayName: "Together",
      transport: "openai-compatible",
      defaultModel: "openai/gpt-oss-20b",
      baseUrl: "https://api.together.xyz/v1",
      modelListPath: "/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "baseten",
      displayName: "Baseten",
      transport: "openai-compatible",
      defaultModel: "openai/gpt-oss-120b",
      baseUrl: "https://inference.baseten.co",
      modelListPath: "/v1/models",
      modelListAuth: "baseten-api-key",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "zhipu",
      displayName: "智谱 AI",
      transport: "openai-compatible",
      defaultModel: "glm-4.5-air",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      modelListPath: "/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "zhipu-global",
      displayName: "Z.AI",
      transport: "openai-compatible",
      defaultModel: "glm-4.7",
      baseUrl: "https://api.z.ai/api/paas/v4",
      modelListPath: "/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "moonshot",
      displayName: "Moonshot",
      transport: "openai-compatible",
      defaultModel: "moonshot-v1-8k",
      baseUrl: "https://api.moonshot.cn/v1",
      modelListPath: "/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "ollama",
      displayName: "Ollama",
      transport: "openai-compatible",
      defaultModel: "gemma4:e4b",
      baseUrl: "http://127.0.0.1:11434/v1",
      modelListPath: "/models",
      modelListAuth: "none",
      enabledByDefault: false,
      experimental: false,
      requiresApiKey: false
    },
    {
      id: "custom-openai",
      displayName: "OpenAI-compatible",
      transport: "openai-compatible",
      defaultModel: "",
      baseUrl: "",
      modelListPath: "/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false
    }
  ];
}(globalThis));