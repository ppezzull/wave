// HITL smoke — the strategy-hitl workflow: NL → compose (propose) → SUSPEND for
// review → resume(approve). Validates the "AI proposes → human approves" beat.
// Run: npx tsx src/hitl.smoke.ts   (needs .env: ZAI_* → craftshost + deepseek)
import "dotenv/config";
import { mastra } from "./mastra/index.js";

async function main() {
  const wf = mastra.getWorkflow("strategyWorkflow");
  const run = await wf.createRun();
  const start = await run.start({
    inputData: {
      nl: "token0 = WETH 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2, token1 = USDC 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48. Keep ETH/USDC balanced 50/50; halt revert if ETH/USD oracle deviates >1.5%; 5bps maker fee.",
    },
  });
  console.log("after start → status:", start.status);
  if (start.status === "suspended") {
    console.log("  (suspended at:", start.suspended, "— parked for /review)");
    const res = await run.resume({ step: start.suspended[0], resumeData: { approved: true } });
    console.log("after resume(approve) → status:", res.status);
    console.log("  result:", JSON.stringify(res.result));
    console.log("\n✅ HITL PASS — propose → suspend → approve");
  } else {
    console.log("  ⚠️ expected 'suspended', got", start.status);
  }
}

main().catch((e) => {
  console.error("❌ HITL FAIL:", (e as Error).message);
  process.exit(1);
});
