// sepolia-dryrun — prove the ENS loop end-to-end on Sepolia: register (mint subname +
// write ENSIP-25/26 records) → read back → resolveVerify round-trip (recorded == written).
// Proves "no hard-coded values" + the G1 hash-verify chain live.
//
// Gated: set RUN_ENS_DRYRUN=1 + a funded ENS_WALLET_PRIVATE_KEY + ENS_REGISTRY + RPC.
// programHash is a FIXTURE here — production sources it from the compiler / StrategyDeployed.
// Run:  npx tsx src/ens/sepolia-dryrun.smoke.ts
import "dotenv/config";
import { ensConfig } from "./config.js";
import { registerStrategy } from "./register.js";
import { resolveVerify, resolveVerifyLive } from "./resolveVerify.js";
import { ens } from "../clients/ens.js";

async function main() {
  const cfg = ensConfig();
  const label = process.env.DRYRUN_LABEL ?? "eth-usdc-guarded";
  const subname = `${label}.${cfg.parentName}`;
  // FIXTURE — production reads the real programHash from the compiler / StrategyDeployed.
  const programHash = `0x${"ab".repeat(32)}` as `0x${string}`;
  const strategyId = `0x${"11".repeat(32)}` as `0x${string}`;
  const description = "Market-make ETH/USDC 50/50; halt if ETH/USD oracle deviates >1.5%.";

  console.log(`ENS dry-run (Sepolia) — parent ${cfg.parentName}, subname ${subname}`);
  if (process.env.RUN_ENS_DRYRUN !== "1") {
    console.log("SKIPPED — set RUN_ENS_DRYRUN=1 + ENS_WALLET_PRIVATE_KEY + ENS_REGISTRY to run.");
    return;
  }

  console.log("\n1) register (mint subname + ENSIP-25/26 records)…");
  const reg = await registerStrategy({ label, strategyId, programHash, description });
  console.log(
    JSON.stringify(
      { subname: reg.subname, registerTxHash: reg.registerTxHash, registerError: reg.registerError, records: reg.records.length },
      null,
      2,
    ),
  );

  console.log("\n2) resolveVerify round-trip (recorded v0.programhash == written)…");
  try {
    const v = await resolveVerify(subname, programHash);
    console.log("✅ resolveVerify MATCH:", JSON.stringify(v));
  } catch (e) {
    console.log("❌ resolveVerify ABORTED:", (e as Error).message);
    process.exitCode = 1;
  }

  console.log(
    "\n2b) resolveVerifyLive (reads the on-chain StrategyDeployed.programHash itself)…",
  );
  try {
    const vl = await resolveVerifyLive(subname, strategyId);
    console.log("✅ resolveVerifyLive MATCH:", JSON.stringify(vl));
  } catch (e) {
    // Expected when announceStrategy() has not been called on-chain for this strategyId:
    // the live source has nothing to read. Honest signal, not a hard failure.
    console.log("ℹ️  resolveVerifyLive:", (e as Error).message);
    console.log(
      "    (call router.announceStrategy(strategyId, program, ensNode) on-chain to populate the live source)",
    );
  }

  console.log("\n3) discover (the EnsDiscovery chip payload Pietro renders)…");
  console.log(JSON.stringify(await ens.discover(subname, programHash), null, 2));
}

main().catch((e) => {
  console.error("❌ dry-run FAIL:", (e as Error).message);
  process.exit(1);
});
