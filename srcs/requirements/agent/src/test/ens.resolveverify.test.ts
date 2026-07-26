// resolveVerify G1 negative-path tests — the falsifiable core (compareProgramHash), tested
// OFFLINE (no network, no key). The tampered fixture MUST abort (match=false); this is the
// red proof the ENS judge sees. RED-on-mutation: flip the equality and these fail.
import { describe, it, expect } from "vitest";
import { compareProgramHash } from "../ens/resolveVerify.js";

const GOOD = `0x${"ab".repeat(32)}` as `0x${string}`;

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
