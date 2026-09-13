// setAvatar — CID relay guard tests (offline: every on-chain touchpoint injected).
import { describe, expect, it } from "vitest";
import { setAvatar, normalizeCid } from "../actions/setAvatar.js";
import type { Address, Hash } from "viem";

const USER = "0xAB459eB72e55d8BCACf762165d96281e0996Cb95" as Address;
const USER_B = "0xB0b0000000000000000000000000000000000c0F" as Address;
const USER_C = "0xC0ffee0000000000000000000000000000000bAd" as Address;
const RELAYER = "0xC54895EfFEfb5311F29646712a04e128c58772fC" as Address;
const TX = ("0x" + "ab".repeat(32)) as Hash;
const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

function makeDeps(overrides: { setShouldThrow?: boolean } = {}) {
  const calls: { user: Address; cid: string }[] = [];
  return {
    calls,
    deps: {
      resolveRelayer: async () => ({
        address: RELAYER,
        privateKey: ("0x" + "11".repeat(32)) as `0x${string}`,
      }),
      setAvatar: async (user: Address, cid: string) => {
        calls.push({ user, cid });
        if (overrides.setShouldThrow) throw new Error("rpc down");
        return TX;
      },
      now: () => 1_000_000,
    },
  };
}

describe("normalizeCid", () => {
  it("accepts a raw CIDv1, ipfs://, and a gateway URL", () => {
    expect(normalizeCid(CID)).toBe(CID);
    expect(normalizeCid(`ipfs://${CID}`)).toBe(CID);
    expect(normalizeCid(`https://ipfs.io/ipfs/${CID}`)).toBe(CID);
  });

  it("rejects a random https URL", () => {
    expect(normalizeCid("https://example.com/me.png")).toBeNull();
  });
});

describe("setAvatar", () => {
  it("relays user + CID and returns the tx hash", async () => {
    const { calls, deps } = makeDeps();
    const r = await setAvatar({ user: USER, cid: `ipfs://${CID}` }, deps);
    expect(r.ok).toBe(true);
    expect(r.txHash).toBe(TX);
    expect(calls).toEqual([{ user: USER, cid: CID }]);
  });

  it("rejects a malformed user address before touching the chain", async () => {
    const { calls, deps } = makeDeps();
    const r = await setAvatar({ user: "0x1234", cid: CID }, deps);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/user must be/);
    expect(calls).toHaveLength(0);
  });

  it("rejects a non-CID string", async () => {
    const { calls, deps } = makeDeps();
    const r = await setAvatar({ user: USER, cid: "https://cdn.example/me.png" }, deps);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/cid must be/);
    expect(calls).toHaveLength(0);
  });

  it("enforces the per-user cooldown after a successful set", async () => {
    const { deps } = makeDeps();
    const first = await setAvatar({ user: USER_B, cid: CID }, deps);
    expect(first.ok).toBe(true);
    const second = await setAvatar({ user: USER_B, cid: CID }, deps);
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/10s/);
  });

  it("returns {ok:false} — never throws — when the relay fails", async () => {
    const { deps } = makeDeps({ setShouldThrow: true });
    const r = await setAvatar({ user: USER_C, cid: CID }, deps);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/rpc down/);
  });
});
