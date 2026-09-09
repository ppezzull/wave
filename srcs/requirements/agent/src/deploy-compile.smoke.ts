// deploy-compile smoke — proves the compile segment of deployStrategy end-to-end:
// the REAL default compile (spawns wave-compiler's cli-emit.ts) with every on-chain
// dep stubbed, so it runs offline with no .env keys. Exit 0 + "compile OK" means
// COMPILER_ROOT resolves from this layout and the compiler accepts the spec.
import { deployStrategy } from "./actions/deployStrategy.js";

const spec = {
  specVersion: 1,
  pair: {
    token0: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    token1: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E8C8",
  },
  size: { amount0: "5", amount1: "5" },
  blocks: [
    { type: "inventorySkew", targetRatio: 0.5, slopeBps: 80, maxSkewBps: 300 },
    { type: "oracleGuard", feed: "ETH/USD", maxDeviationBps: 200, maxStalenessSecs: 600, mode: "revert" },
    { type: "curve", kind: "xyc" },
  ],
} as const;

const result = await deployStrategy(
  { spec: spec as never },
  {
    announcer: async () => ({
      address: "0x0000000000000000000000000000000000000001",
      privateKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
    }),
    announce: async () => `0x${"ab".repeat(32)}` as `0x${string}`,
    approve: async () => {},
    // Offline: uniform 18dp stub (the real path reads decimals() on-chain and
    // rides WAVE_TOKEN{0,1}_DECIMALS into the compile env for the oracle fold).
    tokenDecimals: async () => 18,
    ship: async () => `0x${"cd".repeat(32)}` as `0x${string}`,
    getOnchainProgramHash: async () => null,
  },
);

console.log(
  JSON.stringify(
    {
      strategyId: result.strategyId,
      programHash: result.programHash,
      handle: result.handle,
      approved: result.approved,
      shipped: result.shipped,
      ...(result.error ? { error: result.error } : {}),
    },
    null,
    2,
  ),
);
if (!result.programHash || result.error) {
  console.error("compile segment FAILED");
  process.exit(1);
}
console.log("compile OK");
