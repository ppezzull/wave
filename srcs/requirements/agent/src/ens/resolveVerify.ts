// resolveVerify — the G1 ENS proof: resolve subname → read v0.programhash → compare to the
// on-chain / source-of-truth programHash → ABORT on mismatch. The negative path (a tampered
// fixture: recorded ≠ expected → aborts) is the red proof the ENS judge wants to see.
// Spec: docs/strategy/ENS-PATH.md §7 + docs/tasks/Flavio.md L15-L16 (G1 gate).
//
// The pure compare is split out so it is unit-testable OFFLINE (no network, no key) and
// RED-on-mutation (flip the equality → the tampered-record test fails).
import { ens } from "../clients/ens.js";

export interface HashVerify {
  subname: string;
  recorded: string; // the ENS v0.programhash record ("" if absent)
  expected: string; // the on-chain / compiler programHash
  match: boolean;
}

/**
 * PURE compare — the falsifiable core. Returns match=false on a tampered/absent record
 * (does NOT throw); the I/O wrapper `resolveVerify` throws on mismatch. Case-insensitive:
 * ENS text records are not checksummed hex.
 */
export function compareProgramHash(
  recorded: string | null,
  expected: `0x${string}`,
): { recorded: string; expected: string; match: boolean } {
  const rec = (recorded ?? "").trim().toLowerCase();
  const exp = expected.trim().toLowerCase();
  return { recorded: recorded ?? "", expected, match: rec !== "" && rec === exp };
}

/**
 * resolveVerify: read the ENS v0.programhash record → compare to the on-chain programHash
 * → THROW (abort) on mismatch. The settle path calls this before ship; the demo's
 * tampered-record fixture makes this fire RED in front of the judge (G1).
 */
export async function resolveVerify(
  subname: string,
  expectedProgramHash: `0x${string}`,
): Promise<HashVerify> {
  const recorded = await ens.getTextRecord(subname, "v0.programhash");
  const cmp = compareProgramHash(recorded, expectedProgramHash);
  const result: HashVerify = { subname, ...cmp };
  if (!cmp.match) {
    throw new Error(
      `[resolveVerify] TAMPERED — ${subname}: ENS record ${recorded ?? "(absent)"} ≠ on-chain ` +
        `${expectedProgramHash}. Settle ABORTED (G1 hash-verify gate).`,
    );
  }
  return result;
}
