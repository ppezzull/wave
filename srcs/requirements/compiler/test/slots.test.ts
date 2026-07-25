// The TS half of the slots self-check (riga 20): the committed slots.ts copy
// must match swap-vm/config/slots.json (written by DumpOpcodeSlots.s.sol and
// itself pinned to the pointer-resolved table by StrategyOpcodesSlots.t.sol).
// Drift fails HERE, not at G2.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SLOTS, SLOTS_SPEC_VERSION, TABLE_LENGTH } from "../src/slots.js";

const dumpPath = join(__dirname, "..", "..", "swap-vm", "config", "slots.json");

describe("slots.ts ↔ slots.json", () => {
  const dump = JSON.parse(readFileSync(dumpPath, "utf8")) as {
    specVersion: number;
    tableLength: number;
    slots: Record<string, number>;
  };

  it("matches the forge dump exactly (both directions)", () => {
    expect(dump.slots).toEqual({ ...SLOTS });
  });

  it("matches specVersion and table length", () => {
    expect(dump.specVersion).toBe(SLOTS_SPEC_VERSION);
    expect(dump.tableLength).toBe(TABLE_LENGTH);
  });

  it("keeps the wave opcodes appended at the very end of the table", () => {
    expect(SLOTS._oracleGuard2D).toBe(TABLE_LENGTH - 2);
    expect(SLOTS._inventorySkew2D).toBe(TABLE_LENGTH - 1);
  });
});
