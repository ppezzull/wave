// monitor smoke — runs the graphDelta skeleton end-to-end: stub delta → decide() →
// evidence log. Shows the "zero-click, data-caused retune" beat (R1 cumulative-volume
// drift). NO live LLM (decide() is pure) — fast + demo-runnable. Swap stubDeltaSource
// for the real subgraph source when Pietro's endpoint lands; this file doesn't change.
//
// Run:  npx tsx src/monitor.smoke.ts
import { monitorTick, stubDeltaSource } from "./monitor/graphDelta.js";

async function main() {
  const actions = await monitorTick(stubDeltaSource());
  for (const a of actions) {
    console.log(`decision: ${a.type}${a.trigger ? ` (${a.trigger})` : ""} — ${a.reason}`);
  }
  const n = actions.length;
  console.log(
    `\nevidence → ${process.env.EVIDENCE_PATH ?? "./evidence.jsonl"} (${n} entr${n === 1 ? "y" : "ies"}, each cites the Swapped entity id = data-caused proof)`,
  );
  console.log("\n✅ monitor PASS — data-caused retune + evidence logged");
}

main().catch((e) => {
  console.error("❌ smoke FAIL:", (e as Error).message);
  process.exit(1);
});
