// faucetDrip tests — the in-app buffer wallet, OFFLINE (every dep injected).
// Asserts the load-bearing guard order (address → cooldown → budget → balance → funds
// → send → record), every cap's refusal, and the never-throws contract: expected
// failures — config resolution included — return {ok:false, error} instead of
// rejecting (so the tool route never 500s, unlike deployStrategy's config-throws).
// No network, no funded key, deterministic clock.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Address, Hash } from "viem";
import { faucetDrip, memoryFaucetStore, type FaucetDeps } from "../actions/faucet.js";
import { faucetConfig } from "../config/env.js";

const RECIPIENT = "0xaF7120aE48BdeA740C861C1302F49E2f79858fE2" as Address;
const FAUCET = "0x5F86EB2879e4fDc38D84f10135be7BB97fa93eE2" as Address;
// A throwaway private key — test-only, never used on-chain.
const FAUCET_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`;

const DRIP = 5n * 10n ** 16n; // 0.05 ETH
const COOLDOWN_MS = 6 * 3_600_000;
const MAX_TOTAL = 2n * 10n ** 18n;
const NOW = 1_750_000_000_000;

const TX = "0x" + "ab".repeat(32) as Hash;

/** Stubs for every on-chain surface; `calls` pins the guard ORDER of invocation. */
function makeDeps(overrides: {
  recipientBalance?: bigint;
  faucetBalance?: bigint;
  now?: () => number;
  tunables?: FaucetDeps["tunables"];
  resolveFaucet?: FaucetDeps["resolveFaucet"];
} = {}) {
  const calls: string[] = [];
  const deps: FaucetDeps = {
    resolveFaucet: overrides.resolveFaucet ?? (async () => ({ address: FAUCET, privateKey: FAUCET_KEY })),
    tunables:
      overrides.tunables ??
      (() => ({ dripWei: DRIP, cooldownMs: COOLDOWN_MS, maxTotalWei: MAX_TOTAL })),
    balanceOf: async (addr: Address) => {
      calls.push(addr === FAUCET ? "balance:faucet" : "balance:recipient");
      if (addr === FAUCET) return overrides.faucetBalance ?? 10n * 10n ** 18n;
      return overrides.recipientBalance ?? 0n;
    },
    sendEth: async (to: Address, value: bigint) => {
      calls.push("send");
      expect(value).toBe(DRIP);
      expect(to).toMatch(/^0x[0-9a-f]{40}$/); // the action lowercases the recipient
      return TX;
    },
    store: memoryFaucetStore(),
    now: overrides.now ?? (() => NOW),
  };
  return { calls, deps };
}

describe("faucetDrip (in-app buffer wallet)", () => {
  it("drips 0.05 ETH in the guard order: recipient balance → faucet balance → send", async () => {
    const { calls, deps } = makeDeps();
    const r = await faucetDrip({ address: RECIPIENT }, deps);

    expect(r.ok).toBe(true);
    expect(r.txHash).toBe(TX);
    expect(r.dripped).toBe("0.05");
    expect(r.faucetAddress).toBe(FAUCET);
    expect(calls).toEqual(["balance:recipient", "balance:faucet", "send"]);
  });

  it("records the drip — an immediate re-drip hits the cooldown and sends nothing more", async () => {
    const { calls, deps } = makeDeps();
    await faucetDrip({ address: RECIPIENT }, deps);
    const r = await faucetDrip({ address: RECIPIENT }, deps);

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/cooldown/);
    expect(r.retryInSec).toBeGreaterThan(0);
    expect(r.retryInSec).toBeLessThanOrEqual(COOLDOWN_MS / 1000);
    expect(calls.filter((c) => c === "send")).toHaveLength(1);
  });

  it("cooldown is per-address and expires — a DIFFERENT wallet drips at once, the first again after 6h", async () => {
    const other = "0xaCeA82F0464bD51d8B5Ce2cf1bE94563f5D49999" as Address;
    const { deps } = makeDeps();
    await faucetDrip({ address: RECIPIENT }, deps);
    // Different address: unaffected by the first wallet's cooldown.
    expect((await faucetDrip({ address: other }, deps)).ok).toBe(true);
    // Same address after the cooldown: drips again.
    const later = makeDeps({ now: () => NOW + COOLDOWN_MS + 1 });
    const r = await faucetDrip({ address: RECIPIENT }, later.deps);
    expect(r.ok).toBe(true);
  });

  it("refuses a wallet that already holds ≥ one drip (empty-wallet gate)", async () => {
    const { calls, deps } = makeDeps({ recipientBalance: DRIP });
    const r = await faucetDrip({ address: RECIPIENT }, deps);

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already holds/);
    expect(calls).not.toContain("send");
  });

  it("refuses once the per-process budget is exhausted", async () => {
    // Pre-spend the budget from a DIFFERENT address so RECIPIENT's own cooldown (guard #1,
    // checked before the budget) doesn't mask the budget refusal under test.
    const store = memoryFaucetStore();
    store.record("0xaCeA82F0464bD51d8B5Ce2cf1bE94563f5D49999", DRIP, NOW);
    const { calls, deps } = makeDeps({
      tunables: () => ({ dripWei: DRIP, cooldownMs: COOLDOWN_MS, maxTotalWei: DRIP }),
    });
    deps.store = store;
    const r = await faucetDrip({ address: RECIPIENT }, deps);

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/budget exhausted/);
    expect(calls).not.toContain("send");
  });

  it("refuses when the faucet wallet itself is underfunded (< 2× drip in reserve)", async () => {
    const { calls, deps } = makeDeps({ faucetBalance: 6n * 10n ** 16n }); // 0.06 < 0.10
    const r = await faucetDrip({ address: RECIPIENT }, deps);

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/underfunded/);
    expect(r.error).toContain(FAUCET); // tells the operator where to send
    expect(calls).not.toContain("send");
  });

  it("NEVER throws — a config failure (missing key) returns {ok:false, error}", async () => {
    const { deps } = makeDeps({
      resolveFaucet: async () => {
        throw new Error("[env] FAUCET_PRIVATE_KEY missing — set it in agent/.env");
      },
    });
    const r = await faucetDrip({ address: RECIPIENT }, deps);

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/FAUCET_PRIVATE_KEY missing/);
  });

  it("rejects a malformed address before touching any dep", async () => {
    const { calls, deps } = makeDeps();
    const r = await faucetDrip({ address: "0x1234" }, deps);

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/40-hex/);
    expect(calls).toEqual([]);
  });
});

describe("faucetConfig (env fail-fast)", () => {
  const KEYS = ["FAUCET_PRIVATE_KEY", "ANNOUNCER_PRIVATE_KEY", "SEPOLIA_PRIVATE_KEY", "MAKER_PRIVATE_KEY"] as const;
  const clearKeys = () => KEYS.forEach((k) => delete process.env[k]);

  beforeEach(clearKeys);
  afterEach(clearKeys);

  it("throws a clear error when no faucet key is set anywhere in the chain", async () => {
    await expect(faucetConfig()).rejects.toThrow(/FAUCET_PRIVATE_KEY missing/);
  });

  it("falls back through the chain: SEPOLIA_PRIVATE_KEY works as the faucet key", async () => {
    process.env.SEPOLIA_PRIVATE_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001";
    const cfg = await faucetConfig();
    expect(cfg.privateKey).toBe(process.env.SEPOLIA_PRIVATE_KEY);
    expect(cfg.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it("throws when the resolved key is not valid secp256k1", async () => {
    process.env.FAUCET_PRIVATE_KEY = "not-a-key";
    await expect(faucetConfig()).rejects.toThrow(/not a valid 0x-prefixed secp256k1/);
  });
});
