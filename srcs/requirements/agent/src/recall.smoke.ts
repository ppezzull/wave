// recall smoke — proves memory recall engages when a scope is passed (A1). Two turns
// on the SAME (resource, thread) via the instance (storage wired → Memory resolves its
// storage → no "Memory requires a storage provider" throw). Turn 2 MUST load turn 1
// from history (result.rememberedMessages > 0) — that's the proof recall engages, the
// same mechanism compose() and the HITL workflow now use.
//
// Run:  npx tsx src/recall.smoke.ts   (needs .env: ZAI_* → craftshost, live LLM)
import "dotenv/config";
import { mastra } from "./mastra/index.js"; // constructs Mastra → wires LibSQLStore into composeAgent
import { StrategySpec } from "./schema.js";

// Same scope across both turns → turn 2 recalls turn 1.
const SCOPE = { resource: "recall-smoke", thread: "recall-session" };

const T1 =
  "token0 = WETH 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2, token1 = USDC 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48. Keep ETH/USDC balanced 50/50; take a 5 bps maker fee.";
const T2 =
  "Same pair as before, but tighten the safety band: halt (revert) if the ETH/USD Chainlink oracle deviates more than 1%.";

// Same option shape compose()/generateOptions() use — memory scope is the thing under test.
const opts = () => ({
  structuredOutput: {
    schema: StrategySpec,
    jsonPromptInjection: "auto" as const,
    errorStrategy: "strict" as const,
  },
  modelSettings: { temperature: 0, maxOutputTokens: 1000 },
  memory: SCOPE,
});

async function main() {
  const agent = mastra.getAgent("composeAgent");

  console.log("turn 1 …");
  const r1 = await agent.generate(T1, opts());
  if (!r1.object) throw new Error("turn 1: model returned no structured object");
  console.log("  blocks:", (r1.object as { blocks?: { type: string }[] }).blocks?.map((b) => b.type));

  console.log("turn 2 (same scope — should recall turn 1) …");
  const r2 = await agent.generate(T2, opts());
  if (!r2.object) throw new Error("turn 2: model returned no structured object");

  const remembered = r2.rememberedMessages?.length ?? 0;
  console.log(`  turn 2 rememberedMessages: ${remembered}`);
  if (remembered === 0) {
    console.error("❌ FAIL — turn 2 loaded NO history; memory recall did not engage");
    process.exit(1);
  }
  console.log("\n✅ recall PASS — scope engages memory, turn 2 recalled turn 1");
}

main().catch((e) => {
  console.error("\n❌ smoke FAIL:", (e as Error).message);
  process.exit(1);
});
