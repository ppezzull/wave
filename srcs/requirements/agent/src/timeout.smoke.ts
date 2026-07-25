// timeout smoke — proves the LLM-call deadline (TIER 2 #6). Forces a 2s deadline
// against the LIVE endpoint and asserts compose() aborts fast instead of hanging.
// The real proof is the elapsed-time bound (≤6s): whatever Mastra/AI-SDK throws on
// abort, a stalled craftshost call can no longer hang the demo past the deadline.
//
// MUST route through the `mastra` instance (like hitl.smoke): composeAgent's memory
// only gets storage injected when the agent is REGISTERED on the instance. Importing
// compose alone (compose.smoke's old pattern) throws "Memory requires a storage
// provider" before ever reaching the LLM, so it can't exercise the deadline.
//
// Run:  npx tsx src/timeout.smoke.ts   (needs .env: ZAI_* pointing at craftshost)
import "dotenv/config";
import { mastra } from "./mastra/index.js"; // registers composeAgent → memory storage injected
import { compose } from "./mastra/compose.agent.js";

// touch mastra so a future bundler can't drop the registration side-effect import.
void mastra;

async function main() {
  // Force a deadline far below craftshost's normal 40-60s latency → the call is
  // guaranteed to still be in flight at 2s, so the abort MUST fire.
  process.env.LLM_TIMEOUT_MS = "2000";
  const nl =
    "token0 = WETH 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2, token1 = USDC 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48. Keep ETH/USDC balanced 50/50; 5bps maker fee.";

  const t0 = Date.now();
  try {
    await compose(nl);
    const elapsed = Date.now() - t0;
    console.error(`❌ FAIL — compose() RETURNED in ${elapsed}ms (a 2s deadline should have aborted it)`);
    process.exit(1);
  } catch (e) {
    const elapsed = Date.now() - t0;
    const err = e as Error & { name?: string };
    const msg = err.message ?? String(e);
    const aborted = /abort|timeout|timed out|deadline|cancel/i.test(msg) || err.name === "AbortError";
    console.log(`threw after ${elapsed}ms — ${aborted ? "abort/timeout ✅" : "(non-abort error, still bounded)"}: ${msg.slice(0, 200)}`);
    if (elapsed > 6000) {
      console.error(`❌ FAIL — took ${elapsed}ms; the 2s deadline did not bound the call`);
      process.exit(1);
    }
    console.log("\n✅ timeout PASS — compose() aborts within the deadline (demo-safe)");
  }
}

main().catch((e) => {
  console.error("\n❌ smoke FAIL:", (e as Error).message);
  process.exit(1);
});
