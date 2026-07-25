// compose smoke — NL → StrategySpec against the live LLM (Ollama/server).
// Run:  npx tsx src/compose.smoke.ts   (needs .env: LLM_BASE_URL / LLM_MODEL)
//
// Green: prints a validated StrategySpec. Red: throws on schema drift — the
// compiler never sees a malformed form. This is the seam Flaviano's compiler
// (canonical.ts) consumes: read StrategySpec → emit SwapVM opcodes.
import "dotenv/config";
import { compose } from "./mastra/compose.agent.js";

async function main() {
  const nl =
    "Keep ETH/USDC balanced 50/50, halt if the ETH/USD Chainlink oracle deviates more than 1.5% (revert mode), take a 5 bps maker fee.";
  console.log("prompt:", nl);
  const spec = await compose(nl);
  console.log("StrategySpec:\n" + JSON.stringify(spec, null, 2));
  console.log("\n✅ smoke PASS — NL → validated StrategySpec");
}

main().catch((e) => {
  console.error("\n❌ smoke FAIL:", (e as Error).message);
  process.exit(1);
});
