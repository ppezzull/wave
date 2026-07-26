// The autonomous retune, end to end, on Sepolia.
//
//   live subgraph -> policy.decide() -> R1 fires -> dock -> announce -> ship -> evidence
//
// The order of the on-chain half is not stylistic: announceStrategy MUST precede ship(),
// or the subgraph drops the Pushed for the new strategyHash (handlePushed does
// `Strategy.load(); if null return`) and the retuned strategy starts at committedCapital = 0.
//
// The retuned program comes from the compiler side (swap-vm/script/RetuneProgram.s.sol,
// the same builder whose output is pinned byte-identical to the TS emit) and is passed in
// via env, so this file never re-implements program encoding.
process.env.MONITOR_SOURCE = "subgraph";

import { keccak256 } from "viem";
import { aquaWriteClient, type MakerOrder } from "./clients/aquaWrite.js";
import { logEvidence } from "./evidence/log.js";
import { bootDeltaSource, deltaSource, monitorTick } from "./monitor/graphDelta.js";

const need = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`[retune] ${k} missing`);
  return v;
};

async function main() {
  // ── 1. decide, from LIVE Graph data ────────────────────────────────
  await bootDeltaSource();
  const src = deltaSource();
  const deltas = await src.poll();
  const delta = deltas[0];
  if (!delta) throw new Error("[retune] no delta from the subgraph");

  const actions = await monitorTick(src);
  const action = actions[0];
  console.log("decision:", JSON.stringify(action));
  console.log("caused by entity:", delta.entityId);
  if (action?.type !== "retune") {
    console.log("not a retune — stopping (the loop is data-caused, not scheduled)");
    return;
  }

  // ── 2. execute, on-chain ───────────────────────────────────────────
  const aqua = aquaWriteClient({
    aqua: need("AQUA_ADDRESS") as `0x${string}`,
    router: need("ROUTER_ADDRESS") as `0x${string}`,
    makerKey: need("MAKER_PRIVATE_KEY") as `0x${string}`,
    rpcUrl: need("SEPOLIA_RPC_URL"),
  });
  const tokens = [need("TOKEN_A"), need("TOKEN_B")] as `0x${string}`[];
  const oldHash = delta.strategyId as `0x${string}`;

  const newOrder: MakerOrder = {
    maker: need("RETUNE_MAKER") as `0x${string}`,
    traits: BigInt(need("RETUNE_TRAITS")),
    data: need("RETUNE_DATA") as `0x${string}`,
  };
  const encoded = need("RETUNE_ENCODED") as `0x${string}`;
  const newHash = keccak256(encoded);
  const amounts = [BigInt(need("RETUNE_AMOUNT_A")), BigInt(need("RETUNE_AMOUNT_B"))];

  console.log("dock  ", oldHash, "…");
  const dockTx = await aqua.dock(oldHash, tokens);
  console.log("  tx", dockTx);

  console.log("announce (BEFORE ship — the subgraph needs the row first)…");
  const annTx = await aqua.announce(newOrder, need("ENS_NODE") as `0x${string}`);
  console.log("  tx", annTx);

  console.log("ship  ", newHash, "…");
  const shipTx = await aqua.ship(encoded, tokens, amounts);
  console.log("  tx", shipTx);

  await logEvidence({
    strategyId: oldHash,
    entityId: delta.entityId,
    query: delta.query,
    delta: delta.policyInput,
    action: { ...action, retunedTo: newHash, dockTx, announceTx: annTx, shipTx } as never,
  });

  console.log("\nRETUNE COMPLETE");
  console.log("  old strategy:", oldHash, "→ Docked (subgraph: status=stopped)");
  console.log("  new strategy:", newHash, "→ announced then shipped");
}

main().catch((e) => {
  console.error("ERROR:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
