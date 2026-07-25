// SPIKE — z.ai structured output: does it produce reliable Zod objects?
//   Test A: Vercel AI SDK generateObject  (the mechanism Mastra uses under the hood)
//   Test B: Instructor + openai SDK        (the z.ai-safe fallback with retry)
// Run: npm run spike   (loads .env via dotenv)
// Verdict decides: Mastra-native parse (A OK) vs Instructor fallback (A fails).

import "dotenv/config";
import { z } from "zod";

const ZAI_BASE_URL = process.env.ZAI_BASE_URL!;
const ZAI_API_KEY = process.env.ZAI_API_KEY!;
const ZAI_MODEL = process.env.ZAI_MODEL ?? "glm-4.6";

if (!ZAI_API_KEY) {
  console.error("ZAI_API_KEY missing from .env — populate it and re-run.");
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

const prompt =
  `A market maker wants an ETH/USDC strategy: keep inventory balanced 50/50; ` +
  `halt (revert) if the ETH/USD Chainlink oracle deviates more than 1.5%; ` +
  `take a 5 bps maker fee. token0 = WETH ${WETH}, token1 = USDC ${USDC}. ` +
  `Fill the structured form exactly.`;

function report(ok: boolean, label: string, obj?: unknown, err?: unknown) {
  console.log(`\n[${label}] ${ok ? "PASS ✅" : "FAIL ❌"}`);
  if (ok && obj) console.log(JSON.stringify(obj, null, 2));
  if (!ok && err) console.log(String((err as Error)?.message ?? err).slice(0, 600));
}

// ── Test A: Vercel AI SDK generateObject (Mastra's underlying mechanism) ──
async function testA(): Promise<boolean> {
  try {
    const { generateObject } = await import("ai");
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const provider = createOpenAICompatible({ name: "zai", baseURL: ZAI_BASE_URL, apiKey: ZAI_API_KEY });
    const { object } = await generateObject({
      model: provider.chatModel(ZAI_MODEL),
      schema: Proposal,
      prompt,
    });
    report(true, "A · AI SDK generateObject", object);
    return true;
  } catch (e) {
    report(false, "A · AI SDK generateObject", undefined, e);
    return false;
  }
}

// ── Test B: Instructor (z.ai-safe, retry with validation feedback) ──
async function testB(): Promise<boolean> {
  try {
    const Instructor = (await import("@instructor-ai/instructor")).default;
    const OpenAI = (await import("openai")).default;
    const client = Instructor({
      client: new OpenAI({ baseURL: ZAI_BASE_URL, apiKey: ZAI_API_KEY }),
      mode: "JSON",
    });
    const res = await client.chat.completions.create({
      model: ZAI_MODEL,
      response_model: { schema: Proposal, name: "Proposal" },
      messages: [{ role: "user", content: prompt }],
      max_retries: 3,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    report(true, "B · Instructor", res);
    return true;
  } catch (e) {
    report(false, "B · Instructor", undefined, e);
    return false;
  }
}

const a = await testA();
const b = await testB();

console.log("\n=== VERDICT ===");
console.log(`AI SDK generateObject: ${a ? "OK" : "FAIL"}  |  Instructor: ${b ? "OK" : "FAIL"}`);
if (a) console.log("-> Mastra-native (AI SDK) structured output works with z.ai. Parse can be Mastra-native.");
else console.log("-> AI SDK generateObject fails with z.ai (the flagged issue). Use Instructor for the parse step.");
if (!b) console.log("-> WARNING: Instructor also failed — check key/baseURL/model.");
