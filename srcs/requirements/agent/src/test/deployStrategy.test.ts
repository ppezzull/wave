// deployStrategy tests — the FIRST-DEPLOY EXECUTE arm, OFFLINE (every dep injected).
// Asserts the load-bearing ordering (announce → approve → ship), the announce-before-ship
// invariant, idempotency short-circuit, and that a mid-pipeline failure returns partial
// state with `error` instead of throwing. No Solidity, no network, no Sepolia ETH.
//
// The compile dep is stubbed to fixed bytes/hash, so this also pins the Order-shape contract:
// strategyId = keccak256(abi.encode({maker, traits:1<<254, data:programHex})) — Solidity's
// abi.encode of a single struct arg = the WRAPPED form (0x20 offset word + tuple body),
// matching SwapVM.hash() in Aqua mode (SwapVM.sol:99), the router's StrategyDeployed id,
// Swapped.orderHash and the Aqua dock hash. ONE id everywhere.
import { describe, it, expect } from "vitest";
import { encodeAbiParameters, keccak256, type Address, type Hash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { actionHashOf, approvalMessage } from "../ledger/approval.js";
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
/** Solidity's abi.encode(order) — the wrapped form: 0x20 offset word + tuple body. This
 * is SwapVM.hash()'s preimage (SwapVM.sol:99, verified on the fork against the router's
 * hash() and cast abi-encode) and the ONE encoding ship() must hand Aqua, which docks
 * under keccak of the bytes as passed. */
const ORDER_WRAPPED = encodeAbiParameters(ORDER_ABI, [order]) as Hex;
const STRATEGY_ID = keccak256(ORDER_WRAPPED) as Hex;

const SPEC: StrategySpecInput = {
  specVersion: 1,
  pair: { token0: "0xaCeA82F0464bD51d8B5Ce2cf1bE94563f5D49999", token1: "0xaF7120aE48BdeA740C861C1302F49E2f79858fE2" },
  size: { amount0: "100", amount1: "100" },
  blocks: [{ type: "flatFee", bps: 30 }, { type: "xycSwap" }, { type: "salt", value: 1 }],
};

const h = (c: string) => `0x${c.repeat(32)}` as Hash;

/** A call log lets each test assert ORDER of invocation (announce→attribute→approve→ship). */
function makeDeps(overrides: {
  getOnchainProgramHash?: (id: Hex) => Promise<Hex | null>;
  shipShouldThrow?: boolean;
  attributeShouldThrow?: boolean;
} = {}) {
  const calls: string[] = [];
  const announceTx = h("ab");
  const attributeTx = h("ef");
  const shipTx = h("cd");
  // Captured ship args — the strategy BYTES are load-bearing: Aqua hashes the raw
  // abi.encode(order) body, so a wrapped encoding misses the router announcement.
  let shipStrategyArg: Hex | undefined;
  return {
    calls,
    shipStrategyArg: () => shipStrategyArg,
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
      // Task #31: authorship record — pushed to the log so order/tests can see it.
      attribute: async () => {
        calls.push("attribute");
        if (overrides.attributeShouldThrow) throw new Error("attribute reverted on-chain");
        return attributeTx;
      },
      // Offline tests: uniform 18dp (the old client-side default) — prod reads on-chain.
      tokenDecimals: async () => 18,
      ship: async (strategy: Hex) => {
        calls.push("ship");
        shipStrategyArg = strategy;
        if (overrides.shipShouldThrow) throw new Error("ship reverted on-chain");
        return shipTx;
      },
      getOnchainProgramHash: overrides.getOnchainProgramHash ?? (async () => null),
    },
    announceTx,
    attributeTx,
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

  it("ships the wrapped abi.encode(order) — Solidity's exact struct encoding (fork-wire)", async () => {
    // Aqua docks under keccak of the ship bytes AS PASSED, and the router's swap
    // execution looks the dock up by SwapVM.hash(order) = keccak of this same wrapped
    // form. Shipping any other encoding of the order (e.g. the bare 160-byte tuple
    // body) docks under a different hash: the capital indexes to a row that doesn't
    // exist and no swap can spend the liquidity — both failure modes fork-proven.
    // The 0x879f237b(app, hash) revert seen on re-ship is Aqua's duplicate-dock error
    // (same program ⇒ same dock regardless of sizes), not an encoding mismatch.
    const { deps, shipStrategyArg } = makeDeps();
    await deployStrategy({ spec: SPEC }, deps);
    const arg = shipStrategyArg();
    expect(arg).toBeDefined();
    // Starts with the 0x20 dynamic-argument offset word, then the zero-padded maker.
    expect(arg!.slice(2, 66)).toBe("0".repeat(62) + "20");
    expect(arg!.slice(66, 130)).toBe(MAKER.toLowerCase().replace("0x", "").padStart(64, "0"));
    // 6 words: offset, maker, traits, data-offset, data-len, padded data = 192 bytes.
    expect((arg!.length - 2) / 2).toBe(192);
    // Byte-exact: Solidity's canonical abi-encode of the single struct argument.
    expect(arg).toBe(encodeAbiParameters(ORDER_ABI, [order]));
  });

  it("strategyId == keccak of the shipped bytes — one id for announce, dock and subgraph", async () => {
    // The load-bearing equality: the announced bytes32, the Aqua dock hash and the
    // subgraph Strategy.id must all be the SAME hash, or handlePushed/handleSwapped
    // (which key on Aqua/SwapVM's hash) never touch the announced row.
    const { deps, shipStrategyArg } = makeDeps();
    const r = await deployStrategy({ spec: SPEC }, deps);
    expect(keccak256(shipStrategyArg()!)).toBe(r.strategyId);
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

describe("deployStrategy authorship (task #31 — attribute after announce)", () => {
  const AUTHOR = "0xAB459eB72e55d8BCACf762165d96281e0996Cb95" as Address;

  it("attributes right after announce, before approve/ship: compile→announce→attribute→approve→ship", async () => {
    const { calls, deps, attributeTx } = makeDeps();
    const r = await deployStrategy({ spec: SPEC, author: AUTHOR }, deps);

    expect(r.shipped).toBe(true);
    expect(r.attributeTxHash).toBe(attributeTx);
    // Attribution slots between announce and approve — the subgraph indexes it onto the
    // row the announce just created, and a failed attribute must not block the ship.
    expect(calls).toEqual(["compile", "announce", "attribute", "approve", "ship"]);
  });

  it("attribute failure is best-effort — ship stands, no attributeTxHash, no error", async () => {
    const { calls, deps } = makeDeps({ attributeShouldThrow: true });
    const r = await deployStrategy({ spec: SPEC, author: AUTHOR }, deps);

    expect(r.shipped).toBe(true);
    expect(r.approved).toBe(true);
    expect(r.attributeTxHash).toBeUndefined();
    expect(r.error).toBeUndefined(); // provenance is display-layer, never fails the ship
    expect(calls).toContain("ship");
  });

  it("never calls attribute when no author is passed", async () => {
    const { calls, deps } = makeDeps();
    const r = await deployStrategy({ spec: SPEC }, deps);

    expect(calls).toEqual(["compile", "announce", "approve", "ship"]);
    expect(r.attributeTxHash).toBeUndefined();
  });

  it("rejects a malformed author before any write (pre-flight, like pair validation)", async () => {
    const { calls, deps } = makeDeps();
    const r = await deployStrategy({ spec: SPEC, author: "0x1234" as Address }, deps);

    expect(r.shipped).toBe(false);
    expect(r.error).toMatch(/author/);
    expect(calls).toEqual([]); // failed before compile — no gas, no side effects
  });
});

// ── Approval gate (Ledger Continuity) ──────────────────────────────────────
// The ship pipeline refuses to write anything without a fresh signature over
// the hash-bound message when LEDGER_GATE is on. Trust ladder:
//   device  — only the pinned Ledger (LEDGER_APPROVER_ADDRESS) may sign
//   session — only the ship's `author` wallet may sign (the no-hardware fallback)
const DEVICE_KEY = "0x0000000000000000000000000000000000000000000000000000000000000002" as `0x${string}`;
const DEVICE_ADDR = privateKeyToAccount(DEVICE_KEY).address;
const SESSION_KEY = "0x0000000000000000000000000000000000000000000000000000000000000003" as `0x${string}`;
const SESSION_ADDR = privateKeyToAccount(SESSION_KEY).address;

async function signedBy(
  key: `0x${string}`,
  kind: "device" | "session",
  spec: unknown = SPEC,
  description = "test post",
) {
  const message = approvalMessage(actionHashOf(spec), description);
  const signature = await privateKeyToAccount(key).signMessage({ message });
  return { kind, address: privateKeyToAccount(key).address, message, signature };
}

/** Env-pinning wrapper: run fn with LEDGER_GATE/LEDGER_APPROVER_ADDRESS set, restore after. */
async function withGate(env: Record<string, string>, fn: () => Promise<unknown>) {
  const saved = { LEDGER_GATE: process.env.LEDGER_GATE, LEDGER_APPROVER_ADDRESS: process.env.LEDGER_APPROVER_ADDRESS };
  Object.assign(process.env, env);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe("deployStrategy approval gate (LEDGER_GATE trust ladder)", () => {
  it("cross-package parity vector — the same canonical hash the frontend pins", () => {
    // If this literal changes, ui/test/ledger.test.ts MUST change with it.
    const VECTOR = {
      specVersion: 1,
      pair: {
        token0: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
        token1: "0x779877A7B0D9E8603169DdbD7836e478b4624789",
      },
      size: { amount0: "1", amount1: "200" },
      blocks: [{ type: "curve", kind: "xyc" }],
    };
    expect(actionHashOf(VECTOR)).toBe("042b8b2f3874563dd943ea50c712a14c");
  });

  it("device mode + no approval → pre-flight error, ZERO writes", async () => {
    const { calls, deps } = makeDeps();
    const r = await withGate(
      { LEDGER_GATE: "device", LEDGER_APPROVER_ADDRESS: DEVICE_ADDR },
      () => deployStrategy({ spec: SPEC }, deps),
    ) as Awaited<ReturnType<typeof deployStrategy>>;
    expect(r.shipped).toBe(false);
    expect(r.error).toMatch(/approval required/);
    expect(calls).toEqual([]); // not even compile ran
  });

  it("device mode + valid device signature → full pipeline ships", async () => {
    const { calls, deps } = makeDeps();
    const approval = await signedBy(DEVICE_KEY, "device");
    const r = await withGate(
      { LEDGER_GATE: "device", LEDGER_APPROVER_ADDRESS: DEVICE_ADDR },
      () => deployStrategy({ spec: SPEC, description: "test post", approval }, deps),
    ) as Awaited<ReturnType<typeof deployStrategy>>;
    expect(r.shipped).toBe(true);
    expect(calls).toContain("ship");
  });

  it("device mode REFUSES a session-kind approval (hardware or nothing)", async () => {
    const { deps } = makeDeps();
    const approval = await signedBy(DEVICE_KEY, "session"); // even the right key, wrong kind
    const r = await withGate(
      { LEDGER_GATE: "device", LEDGER_APPROVER_ADDRESS: DEVICE_ADDR },
      () => deployStrategy({ spec: SPEC, description: "test post", approval }, deps),
    ) as Awaited<ReturnType<typeof deployStrategy>>;
    expect(r.shipped).toBe(false);
    expect(r.error).toMatch(/approval rejected/);
  });

  it("device mode + signature from the WRONG device → rejected", async () => {
    const { deps } = makeDeps();
    const approval = await signedBy(SESSION_KEY, "device");
    const r = await withGate(
      { LEDGER_GATE: "device", LEDGER_APPROVER_ADDRESS: DEVICE_ADDR },
      () => deployStrategy({ spec: SPEC, description: "test post", approval }, deps),
    ) as Awaited<ReturnType<typeof deployStrategy>>;
    expect(r.shipped).toBe(false);
    expect(r.error).toMatch(/approver mismatch/);
  });

  it("session mode + author's signature → ships (the no-hardware fallback)", async () => {
    const { calls, deps } = makeDeps();
    const approval = await signedBy(SESSION_KEY, "session");
    const r = await withGate(
      { LEDGER_GATE: "session" },
      () => deployStrategy({ spec: SPEC, description: "test post", author: SESSION_ADDR, approval }, deps),
    ) as Awaited<ReturnType<typeof deployStrategy>>;
    expect(r.shipped).toBe(true);
    expect(calls).toContain("ship");
  });

  it("session mode + a signature from a wallet that is NOT the author → rejected", async () => {
    const { deps } = makeDeps();
    const approval = await signedBy(DEVICE_KEY, "session"); // valid sig, wrong wallet
    const r = await withGate(
      { LEDGER_GATE: "session" },
      () => deployStrategy({ spec: SPEC, description: "test post", author: SESSION_ADDR, approval }, deps),
    ) as Awaited<ReturnType<typeof deployStrategy>>;
    expect(r.shipped).toBe(false);
    expect(r.error).toMatch(/approver mismatch/);
  });

  it("any mode + a signature bound to a DIFFERENT spec (replay) → rejected", async () => {
    const { deps } = makeDeps();
    const otherSpec = { ...SPEC, size: { amount0: "2", amount1: "400" } };
    const approval = await signedBy(DEVICE_KEY, "device", otherSpec); // signed for another strategy
    const r = await withGate(
      { LEDGER_GATE: "device", LEDGER_APPROVER_ADDRESS: DEVICE_ADDR },
      () => deployStrategy({ spec: SPEC, description: "test post", approval }, deps),
    ) as Awaited<ReturnType<typeof deployStrategy>>;
    expect(r.shipped).toBe(false);
    expect(r.error).toMatch(/action hash missing|not bound/);
  });

  it("gate off → no approval needed, exactly the pre-gate behavior", async () => {
    const { deps } = makeDeps();
    const r = await withGate({ LEDGER_GATE: "off" }, () => deployStrategy({ spec: SPEC }, deps)) as Awaited<
      ReturnType<typeof deployStrategy>
    >;
    expect(r.shipped).toBe(true);
  });
});
