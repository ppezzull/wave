// announcerConfig validation tests — the onlyOwner fail-fast (Beat B protection).
// announceStrategy() is onlyOwner: a non-owner key reverts AT RUNTIME (on stage), not
// at compile. announcerConfig MUST throw a clear error on a missing / malformed /
// wrong-owner key so we fail-fast at boot. RED-on-mutation: relax any check → its test
// fails. No real key needed — all three paths are failure modes.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { announcerConfig, EXPECTED_ANNOUNCER_OWNER } from "../config/env.js";

const KEYS = ["ANNOUNCER_PRIVATE_KEY", "SEPOLIA_PRIVATE_KEY", "MAKER_PRIVATE_KEY"] as const;
const clearKeys = () => KEYS.forEach((k) => delete process.env[k]);

// Hardhat account #0 — a valid secp256k1 key whose address is NOT the router owner.
const WRONG_OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe("announcerConfig (onlyOwner fail-fast)", () => {
  beforeEach(clearKeys);
  afterEach(clearKeys);

  it("throws a clear error when no announcer key is set", async () => {
    await expect(announcerConfig()).rejects.toThrow(/ANNOUNCER_PRIVATE_KEY missing/);
  });

  it("throws when the key is not a valid secp256k1 private key", async () => {
    process.env.ANNOUNCER_PRIVATE_KEY = "not-a-key";
    await expect(announcerConfig()).rejects.toThrow(/not a valid 0x-prefixed secp256k1/);
  });

  it("throws when a valid key derives to the WRONG address (the stage-revert guard)", async () => {
    process.env.ANNOUNCER_PRIVATE_KEY = WRONG_OWNER_KEY;
    await expect(announcerConfig()).rejects.toThrow(
      new RegExp(`NOT the router owner ${EXPECTED_ANNOUNCER_OWNER}`, "i"),
    );
  });
});
