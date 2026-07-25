// The self-hosted Gemma4-fast LLM provider (OpenAI-compatible vLLM endpoint).
//
// CRITICAL — think:false. Gemma4-fast ships with thinking ON by default, so it
// emits ~60s of reasoning before any JSON → the live demo times out. We force it
// OFF by injecting `chat_template_kwargs:{think:false}` into every request body
// via transformRequestBody. This runs INSIDE the provider before the wire, so
// Mastra can't strip it — its {id,url,apiKey} model config and providerOptions
// do NOT pass chat_template_kwargs through (mastra issue #4396).
//
// Verified against the installed versions:
//   @ai-sdk/openai-compatible@1.0.46 — transformRequestBody:(args:Record<string,any>)=>Record<string,any>
//   @mastra/core@1.52.1 — MastraModelConfig accepts the LanguageModelV2 this
//   returns (shared.types.d.ts:59 — the union includes LanguageModelV2).
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { llmConfig } from "../config/env.js";

// Browser UA — the craftshost gateway is behind Cloudflare, which blocks
// non-browser clients (error 1010). Harmless on the direct Ollama endpoint.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Build the LLM. For now: qwen-haiku:4b via the craftshost gateway.
 * - think:false injected on every body (harmless; some models honor it).
 * - craftshost auth: `Authorization: Bearer <apiKey>` (the secret key) +
 *   `X-Langfuse-Public-Key: <publicKey>` header. Both required by the gateway.
 * - browser User-Agent (Cloudflare bot-block workaround).
 */
export const gemmaModel = () => {
  const { baseURL, apiKey, model, publicKey } = llmConfig();
  const headers: Record<string, string> = { "User-Agent": BROWSER_UA };
  if (publicKey) headers["X-Langfuse-Public-Key"] = publicKey;
  const provider = createOpenAICompatible({
    name: "craftshost",
    baseURL,
    apiKey,
    headers,
    transformRequestBody: (args) => ({
      ...args,
      chat_template_kwargs: { think: false },
    }),
  });
  return provider.chatModel(model);
};
