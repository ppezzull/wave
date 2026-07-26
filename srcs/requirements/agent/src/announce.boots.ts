// announce boots smoke — verify the announcer key is present and derives to the
// router OWNER EOA (onlyOwner). Prints the DERIVED ADDRESS + verdict ONLY; never
// the key. Demo-critical: a wrong key reverts on stage, not at compile.
// Run: npx tsx src/announce.boots.ts
import "dotenv/config";
import { announcerConfig } from "./config/env.js";

try {
  const cfg = await announcerConfig();
  console.log(JSON.stringify({
    ok: true,
    derived: cfg.address,
    expectedOwner: cfg.owner,
    verdict: "✅ announcer key derives to the router owner — announceStrategy() is callable",
  }, null, 2));
  process.exit(0);
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: (e as Error).message }, null, 2));
  process.exit(1);
}
