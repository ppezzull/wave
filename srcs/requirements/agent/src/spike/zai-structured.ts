// SPIKE — does the self-hosted Gemma4-fast (Ollama) produce reliable structured
// output with think:false forced on?
//   Test A: Vercel AI SDK generateObject   (the mechanism Mastra uses under the hood)
//   Test C: Mastra Agent + structuredOutput (the real composeAgent path)
// Run: npm run spike   (loads .env via dotenv/config — needs LLM_* → Ollama/server)
//
// ⚠️ LIVE-RUN is server-side only (Ollama isn't on the dev Mac). This file
// TYPECHECKS locally (tsc) so it's ready to run there.
//
// think:false is CRITICAL: Gemma4-fast ships thinking ON → ~60s of reasoning
// before any JSON → demo timeout. We inject chat_template_kwargs:{think:false}
// via transformRequestBody (runs in the provider before the wire). Mastra's
// {id,url,apiKey} model config + providerOptions do NOT pass it through (mastra#4396).
import "dotenv/config";
import { z } from "zod/v4";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";

// `!` satisfies TS; the runtime guard below exits with a clear message if either
// is actually missing.
const BASE_URL = process.env.LLM_BASE_URL!;
const API_KEY = process.env.LLM_API_KEY ?? "dummy";
const MODEL = process.env.LLM_MODEL!;

if (!BASE_URL || !MODEL) {
  console.error("LLM_BASE_URL / LLM_MODEL missing from .env — populate them (Ollama/server) and re-run.");
  process.exit(1);
}

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

// A real slice of the 9-block DSL (oracleGuard + inventorySkew + fee).
const Proposal = z.object({
  pair: z.object({ token0: z.string(), token1: z.string() }),
  oracleGuard: z.object({
    feed: z.enum(["ETH/USD", "BTC/USD", "USDC/USD"]),
    maxDeviationBps: z.number().int().min(0).max(1000),
    mode: z.enum(["revert", "clamp"]),
  }),
  inventorySkew: z.object({
    targetRatio: z.number().min(0).max(1),
    maxSkewBps: z.number().int().min(0).max(1000),
  }),
  makerFeeBps: z.number().int().min(0).max(1000),
});

const PROMPT =
  `A market maker wants an ETH/USDC strategy: keep inventory balanced 50/50; ` +
  `halt (revert) if the ETH/USD Chainlink oracle deviates more than 1.5%; ` +
  `take a 5 bps maker fee. token0 = WETH ${WETH}, token1 = USDC ${USDC}. ` +
  `Fill the structured form exactly.`;

// Provider with think:false baked into every request body.
const provider = createOpenAICompatible({
  name: "ollama",
  baseURL: BASE_URL,
  apiKey: API_KEY,
  transformRequestBody: (args) => ({ ...args, chat_template_kwargs: { think: false } }),
});

function report(ok: boolean, label: string, obj?: unknown, err?: unknown) {
  console.log(`\n[${label}] ${ok ? "PASS ✅" : "FAIL ❌"}`);
  if (ok && obj) console.log(JSON.stringify(obj, null, 2));
  if (!ok && err) console.log(String((err as Error)?.message ?? err).slice(0, 800));
}

// ── Test A: AI SDK generateObject (Mastra's underlying mechanism) ──
async function testA(): Promise<boolean> {
  try {
    const { object } = await generateObject({
      model: provider.chatModel(MODEL),
      schema: Proposal,
      prompt: PROMPT,
      temperature: 0,
      maxOutputTokens: 400,
    });
    report(true, "A · AI SDK generateObject (think:false)", object);
    return Proposal.safeParse(object).success;
  } catch (e) {
    report(false, "A · AI SDK generateObject (think:false)", undefined, e);
    return false;
  }
}

// ── Test C: Mastra Agent + structuredOutput (the real composeAgent path) ──
async function testC(): Promise<boolean> {
  try {
    const { Agent } = await import("@mastra/core/agent");
    const agent = new Agent({
      id: "spike",
      name: "spike",
      instructions: "Fill the structured form exactly. Emit ONLY the JSON object, no prose.",
      model: provider.chatModel(MODEL),
    });
    const res = await agent.generate(PROMPT, {
      structuredOutput: {
        schema: Proposal,
        jsonPromptInjection: "auto", // non-OpenAI model → prompt injection, no 2nd call
        errorStrategy: "strict",
      },
      modelSettings: { temperature: 0, maxOutputTokens: 400 },
    });
    report(true, "C · Mastra Agent structuredOutput (think:false)", res.object);
    return res.object != null && Proposal.safeParse(res.object).success;
  } catch (e) {
    report(false, "C · Mastra Agent structuredOutput (think:false)", undefined, e);
    return false;
  }
}

const a = await testA();
const c = await testC();

console.log("\n=== VERDICT ===");
console.log(`AI SDK generateObject: ${a ? "OK" : "FAIL"}  |  Mastra Agent: ${c ? "OK" : "FAIL"}`);
if (a && c) console.log("-> Mastra-native structured output works with Gemma4-fast + think:false. composeAgent is live-ready.");
else console.log("-> partial/fail — confirm think:false is honored, the model tag, and the baseURL. Fallback: Instructor.");
