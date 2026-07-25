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

/** Build the Gemma4-fast language model with think:false baked into every call. */
export const gemmaModel = () => {
  const { baseURL, apiKey, model } = llmConfig();
  const provider = createOpenAICompatible({
    name: "vllm",
    baseURL,
    apiKey,
    transformRequestBody: (args) => ({
      ...args,
      chat_template_kwargs: { think: false },
    }),
  });
  return provider.chatModel(model);
};
