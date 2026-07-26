// resolveVerify G1 negative-path tests — the falsifiable core (compareProgramHash), tested
// OFFLINE (no network, no key). The tampered fixture MUST abort (match=false); this is the
// red proof the ENS judge sees. RED-on-mutation: flip the equality and these fail.
//
// Also covers the LIVE source: fetchOnChainProgramHash (reads StrategyDeployed) + resolveVerifyLive
// (reads ENS record AND on-chain hash itself). Both are exercised via injected stubs (no env, no
// network) — the publicClient, the router address, and the ENS text-record read are all injectable.
import { describe, it, expect, vi } from "vitest";
import { compareProgramHash, resolveVerifyLive } from "../ens/resolveVerify.js";
import { fetchOnChainProgramHash, type OnChainReadClient } from "../ens/onChainHash.js";

const GOOD = `0x${"ab".repeat(32)}` as `0x${string}`;
const SID = `0x${"11".repeat(32)}` as `0x${string}`;
const ROUTER = "0xeb513fd18c391fae1513ff12c1f97bf659d052c4" as `0x${string}`;

/** A stub OnChainReadClient returning the given canned logs (viem order: block-ascending). */
const stubClient = (
  logs: Array<{ blockNumber: bigint; args: { programHash: `0x${string}` } }>,
  head = 11_400_000n,
): OnChainReadClient =>
  ({ getBlockNumber: vi.fn(async () => head), getLogs: vi.fn(async () => logs) }) as unknown as OnChainReadClient;

describe("compareProgramHash (G1 hash-verify, pure)", () => {
  it("matches when the recorded hash equals the on-chain hash", () => {
    expect(compareProgramHash(GOOD, GOOD).match).toBe(true);
  });

  it("ABORTS (match=false) on a TAMPERED record (recorded ≠ on-chain)", () => {
    const tampered = `0x${"cd".repeat(32)}` as `0x${string}`;
    expect(compareProgramHash(tampered, GOOD).match).toBe(false);
  });

  it("aborts when the record is absent (null)", () => {
    expect(compareProgramHash(null, GOOD).match).toBe(false);
  });

  it("aborts when the record is empty", () => {
    expect(compareProgramHash("", GOOD).match).toBe(false);
  });

  it("is case-insensitive (ENS text records are not checksummed)", () => {
    expect(compareProgramHash(GOOD.toUpperCase(), GOOD).match).toBe(true);
  });

  it("trims whitespace before comparing", () => {
    expect(compareProgramHash(` ${GOOD} `, GOOD).match).toBe(true);
  });
});

describe("fetchOnChainProgramHash (on-chain source, offline)", () => {
  it("returns the programHash of the LATEST matching StrategyDeployed event", async () => {
    const client = stubClient([
      { blockNumber: 11350000n, args: { programHash: `0x${"00".repeat(32)}` } },
      { blockNumber: 11350065n, args: { programHash: GOOD } },
    ]);
    await expect(fetchOnChainProgramHash(SID, { client, router: ROUTER })).resolves.toBe(GOOD);
  });

  it("throws when no StrategyDeployed event exists for the strategyId (not announced)", async () => {
    const client = stubClient([]);
    await expect(fetchOnChainProgramHash(SID, { client, router: ROUTER })).rejects.toThrow(
      /no StrategyDeployed event/,
    );
  });

  it("honours an explicit fromBlock (skips the head lookup)", async () => {
    const getBlockNumber = vi.fn(async () => 11_400_000n);
    const getLogs = vi.fn(async () => [{ blockNumber: 11350065n, args: { programHash: GOOD } }]);
    const client = { getBlockNumber, getLogs } as unknown as OnChainReadClient;
    await fetchOnChainProgramHash(SID, { client, router: ROUTER, fromBlock: 11350000n });
    expect(getBlockNumber).not.toHaveBeenCalled();
  });
});

describe("resolveVerifyLive (G1 hash-verify, LIVE source, offline)", () => {
  const SUB = "eth-usdc-guarded.wave.eth";

  it("MATCHES when the ENS record equals the on-chain programHash", async () => {
    const v = await resolveVerifyLive(SUB, SID, {
      router: ROUTER,
      client: stubClient([{ blockNumber: 11350065n, args: { programHash: GOOD } }]),
      getTextRecord: async () => GOOD,
    });
    expect(v.match).toBe(true);
    expect(v.expected).toBe(GOOD);
  });

  it("ABORTS when the ENS record differs from the on-chain programHash (tampered)", async () => {
    const tampered = `0x${"cd".repeat(32)}` as `0x${string}`;
    await expect(
      resolveVerifyLive(SUB, SID, {
        router: ROUTER,
        client: stubClient([{ blockNumber: 11350065n, args: { programHash: GOOD } }]),
        getTextRecord: async () => tampered,
      }),
    ).rejects.toThrow(/TAMPERED/);
  });

  it("ABORTS when the ENS record is absent (null)", async () => {
    await expect(
      resolveVerifyLive(SUB, SID, {
        router: ROUTER,
        client: stubClient([{ blockNumber: 11350065n, args: { programHash: GOOD } }]),
        getTextRecord: async () => null,
      }),
    ).rejects.toThrow(/TAMPERED/);
  });

  it("ABORTS when the strategy was never announced on-chain", async () => {
    await expect(
      resolveVerifyLive(SUB, SID, {
        router: ROUTER,
        client: stubClient([]),
        getTextRecord: async () => GOOD,
      }),
    ).rejects.toThrow(/no StrategyDeployed event/);
  });
});
