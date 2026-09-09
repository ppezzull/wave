// deployStrategy tests — the FIRST-DEPLOY EXECUTE arm, OFFLINE (every dep injected).
// Asserts the load-bearing ordering (announce → approve → ship), the announce-before-ship
// invariant, idempotency short-circuit, and that a mid-pipeline failure returns partial
// state with `error` instead of throwing. No Solidity, no network, no Sepolia ETH.
//
// The compile dep is stubbed to fixed bytes/hash, so this also pins the Order-shape contract:
// strategyId = keccak256(abi.encode({maker, traits:1<<254, data:programHex})), matching
// SwapVM.hash() in Aqua mode (SwapVM.sol:97) and the LiveSwapStock recipe.
import { describe, it, expect } from "vitest";
import { encodeAbiParameters, keccak256, type Address, type Hash, type Hex } from "viem";
import { deployStrategy, type StrategySpecInput } from "../actions/deployStrategy.js";

const MAKER = "0x2058C253029bB0Cf1E1aD43DfAEF63D658A8dddf" as Address;
// A throwaway private key — test-only, derives to some address; we don't care which since
// the announcer dep is stubbed. Never used on-chain.
const MAKER_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`;
const PROGRAM = "0x1504002dc6c0110014080000000000000001" as Hex; // flatFee+xycSwap+salt (LiveSwapStock shape)
const PROGRAM_HASH = keccak256(PROGRAM); // == compiler's programHash(bytes)

const ORDER_ABI = [
  {
    type: "tuple",
    components: [
      { name: "maker", type: "address" },
      { name: "traits", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
  },
] as const;
const order = { maker: MAKER, traits: 1n << 254n, data: PROGRAM };
const STRATEGY_ID = keccak256(encodeAbiParameters(ORDER_ABI, [order])) as Hex;

const SPEC: StrategySpecInput = {
  specVersion: 1,
  pair: { token0: "0xaCeA82F0464bD51d8B5Ce2cf1bE94563f5D49999", token1: "0xaF7120aE48BdeA740C861C1302F49E2f79858fE2" },
  size: { amount0: "100", amount1: "100" },
  blocks: [{ type: "flatFee", bps: 30 }, { type: "xycSwap" }, { type: "salt", value: 1 }],
};

const h = (c: string) => `0x${c.repeat(32)}` as Hash;

/** A call log lets each test assert ORDER of invocation (announce→approve→ship). */
function makeDeps(overrides: {
  getOnchainProgramHash?: (id: Hex) => Promise<Hex | null>;
  shipShouldThrow?: boolean;
} = {}) {
  const calls: string[] = [];
  const announceTx = h("ab");
  const shipTx = h("cd");
  return {
    calls,
    deps: {
      announcer: async () => ({ address: MAKER, privateKey: MAKER_KEY }),
      compile: async () => {
        calls.push("compile");
        return { programHex: PROGRAM, programHash: PROGRAM_HASH };
      },
      announce: async () => {
        calls.push("announce");
        return announceTx;
      },
      approve: async () => {
        calls.push("approve");
      },
      // Offline tests: uniform 18dp (the old client-side default) — prod reads on-chain.
      tokenDecimals: async () => 18,
      ship: async () => {
        calls.push("ship");
        if (overrides.shipShouldThrow) throw new Error("ship reverted on-chain");
        return shipTx;
      },
      getOnchainProgramHash: overrides.getOnchainProgramHash ?? (async () => null),
    },
    announceTx,
    shipTx,
  };
}

describe("deployStrategy (first-deploy EXECUTE arm)", () => {
  it("runs the full pipeline in the load-bearing order: compile→announce→approve→ship", async () => {
    const { calls, deps, announceTx, shipTx } = makeDeps();
    const r = await deployStrategy({ spec: SPEC }, deps);

    expect(r.shipped).toBe(true);
    expect(r.approved).toBe(true);
    expect(r.shipTxHash).toBe(shipTx);
    expect(r.announceTxHash).toBe(announceTx);
    expect(r.strategyId).toBe(STRATEGY_ID);
    expect(r.programHash).toBe(PROGRAM_HASH);
    expect(r.handle).toMatch(/^s-/); // display handle derived from the programHash
    // Ordering — announce MUST precede ship (subgraph drops a ship-before-announce).
    expect(calls).toEqual(["compile", "announce", "approve", "ship"]);
  });

  it("announce is always before ship — the invariant the subgraph depends on", async () => {
    const { calls, deps } = makeDeps();
    await deployStrategy({ spec: SPEC }, deps);
    expect(calls.indexOf("announce")).toBeLessThan(calls.indexOf("ship"));
  });

  it("derives strategyId = keccak256(abi.encode(Order)) — Aqua mode (SwapVM.sol:97)", async () => {
    const { deps } = makeDeps();
    const r = await deployStrategy({ spec: SPEC }, deps);
    expect(r.strategyId).toBe(STRATEGY_ID);
  });

  it("short-circuits when strategyId is already on-chain with the same programHash (idempotent)", async () => {
    const { calls, deps } = makeDeps({
      getOnchainProgramHash: async (id) => (id === STRATEGY_ID ? PROGRAM_HASH : null),
    });
    const r = await deployStrategy({ spec: SPEC }, deps);

    expect(r.shipped).toBe(true);
    expect(r.alreadyDeployed).toBe(true);
    // Compile runs (to compute strategyId for the lookup), but no writes fire.
    expect(calls).toEqual(["compile"]);
    expect(calls).not.toContain("ship");
    expect(calls).not.toContain("announce");
  });

  it("does NOT short-circuit when the existing programHash differs (re-deploy with new code)", async () => {
    const { calls, deps } = makeDeps({
      getOnchainProgramHash: async () => "0x" + "11".repeat(32) as Hex, // different hash
    });
    const r = await deployStrategy({ spec: SPEC }, deps);
    expect(r.shipped).toBe(true);
    expect(calls).toContain("ship");
  });

  it("returns partial state + error (no throw) when ship reverts mid-pipeline", async () => {
    const { deps, announceTx } = makeDeps({ shipShouldThrow: true });
    const r = await deployStrategy({ spec: SPEC }, deps);

    expect(r.shipped).toBe(false);
    expect(r.approved).toBe(true); // announce landed before ship reverted
    expect(r.announceTxHash).toBe(announceTx);
    expect(r.error).toMatch(/ship reverted/);
  });

  it("rejects a spec missing pair addresses before any write", async () => {
    const { deps } = makeDeps();
    const r = await deployStrategy({ spec: { specVersion: 1, blocks: [{ type: "x" }] } }, deps);
    expect(r.shipped).toBe(false);
    expect(r.error).toMatch(/token0\/token1/);
  });
});
