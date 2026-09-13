// storeChatVault — the ciphertext relay's guard tests (offline: every on-chain
// touchpoint injected; env is never read).
import { describe, expect, it } from "vitest";
import { storeChatVault } from "../actions/storeChatVault.js";
import type { Address, Hash, Hex } from "viem";

const USER = "0xAB459eB72e55d8BCACf762165d96281e0996Cb95" as Address;
// The action keeps a module-level per-user cooldown map that PERSISTS across
// tests in this file — every test that must reach the store uses its own user.
const USER_B = "0xB0b0000000000000000000000000000000000c0F" as Address;
const USER_C = "0xC0ffee0000000000000000000000000000000bAd" as Address;
const RELAYER = "0xC54895EfFEfb5311F29646712a04e128c58772fC" as Address;
const TX = "0x" + "ab".repeat(32) as Hash;

// A real base64 blob ({"iv":"…","ct":"…"} shape the UI sends).
const blob = Buffer.from(JSON.stringify({ iv: "0123456789ab", ct: "c2VjcmV0" })).toString("base64");

function makeDeps(overrides: { storeShouldThrow?: boolean } = {}) {
  const calls: { user: Address; ciphertext: Hex }[] = [];
  return {
    calls,
    deps: {
      resolveRelayer: async () => ({
        address: RELAYER,
        privateKey: "0x" + "11".repeat(32) as `0x${string}`,
      }),
      store: async (user: Address, ciphertext: Hex) => {
        calls.push({ user, ciphertext });
        if (overrides.storeShouldThrow) throw new Error("rpc down");
        return TX;
      },
      now: () => 1_000_000,
    },
  };
}

describe("storeChatVault", () => {
  it("relays user + decoded ciphertext bytes and returns the tx hash", async () => {
    const { calls, deps } = makeDeps();
    const r = await storeChatVault({ user: USER, ciphertext: blob }, deps);
    expect(r.ok).toBe(true);
    expect(r.txHash).toBe(TX);
    expect(calls).toHaveLength(1);
    const seen = calls[0];
    expect(seen?.user).toBe(USER);
    // base64 decoded to raw bytes (the contract receives bytes, not the base64 string)
    expect(seen?.ciphertext).toBe(`0x${Buffer.from(blob, "base64").toString("hex")}` as Hex);
  });

  it("rejects a malformed user address before touching the chain", async () => {
    const { calls, deps } = makeDeps();
    const r = await storeChatVault({ user: "0x1234", ciphertext: blob }, deps);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/user must be/);
    expect(calls).toHaveLength(0);
  });

  it("rejects non-base64 ciphertext", async () => {
    const { calls, deps } = makeDeps();
    const r = await storeChatVault({ user: USER, ciphertext: "not base64 !!!" }, deps);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/base64/);
    expect(calls).toHaveLength(0);
  });

  it("rejects ciphertext over the 96 KB cap", async () => {
    const { calls, deps } = makeDeps();
    // 97 KB of zeros → base64 well-formed but over the cap once decoded.
    const big = Buffer.alloc(97 * 1024).toString("base64");
    const r = await storeChatVault({ user: USER, ciphertext: big }, deps);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/exceeds/);
    expect(calls).toHaveLength(0);
  });

  it("enforces the per-user cooldown after a successful store", async () => {
    const { deps } = makeDeps();
    const first = await storeChatVault({ user: USER_B, ciphertext: blob }, deps);
    expect(first.ok).toBe(true);
    const second = await storeChatVault({ user: USER_B, ciphertext: blob }, deps);
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/10s/);
  });

  it("returns {ok:false} — never throws — when the relay fails", async () => {
    const { deps } = makeDeps({ storeShouldThrow: true });
    const r = await storeChatVault({ user: USER_C, ciphertext: blob }, deps);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/rpc down/);
  });
});
