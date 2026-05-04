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
      defaultModel: "deepseek-v4-flash",
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
      modelListPath: "/models",
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
      baseUrl: "https://inference.baseten.co/v1",
      modelListPath: "/models",
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
      id: "volcengine",
      displayName: "Volcengine",
      transport: "openai-compatible",
      defaultModel: "doubao-seed-2-0-mini-260215",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      modelListPath: "/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "minimax",
      displayName: "MiniMax",
      transport: "openai-compatible",
      defaultModel: "MiniMax-M2.7",
      baseUrl: "https://api.minimax.io/v1",
      modelListPath: "/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "minimax-cn",
      displayName: "MiniMax (China)",
      transport: "openai-compatible",
      defaultModel: "MiniMax-M2.7",
      baseUrl: "https://api.minimaxi.com/v1",
      modelListPath: "/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "huggingface",
      displayName: "Hugging Face",
      transport: "openai-compatible",
      defaultModel: "deepseek-ai/DeepSeek-V4-Flash",
      baseUrl: "https://router.huggingface.co/v1",
      modelListPath: "/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "vercelai",
      displayName: "Vercel AI Gateway",
      transport: "openai-compatible",
      defaultModel: "openai/gpt-oss-120b",
      baseUrl: "https://ai-gateway.vercel.sh/v1",
      modelListPath: "/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "nvidia",
      displayName: "NVIDIA",
      transport: "openai-compatible",
      defaultModel: "deepseek-ai/deepseek-v4-flash",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      modelListPath: "/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "gemini",
      displayName: "Gemini",
      transport: "gemini",
      defaultModel: "gemini-2.5-flash",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      modelListPath: "/models",
      modelListAuth: "gemini-api-key",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "poe",
      displayName: "Poe",
      transport: "openai-compatible",
      defaultModel: "Claude-Haiku-4.5",
      baseUrl: "https://api.poe.com/v1",
      modelListPath: "/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "cerebras",
      displayName: "Cerebras AI",
      transport: "openai-compatible",
      defaultModel: "gpt-oss-120b",
      baseUrl: "https://api.cerebras.ai/v1",
      modelListPath: "/models",
      modelListAuth: "bearer",
      enabledByDefault: false,
      experimental: false
    },
    {
      id: "sicflow",
      displayName: "SiliconFlow",
      transport: "openai-compatible",
      defaultModel: "deepseek-ai/DeepSeek-V4-Flash",
      baseUrl: "https://api.siliconflow.cn/v1",
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
      id: "lmstudio",
      displayName: "LM Studio",
      transport: "openai-compatible",
      defaultModel: "",
      baseUrl: "http://localhost:1234/v1",
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