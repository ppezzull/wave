import { describe, expect, it } from "vitest";

import { SPEC_VERSION, StrategySpec } from "../src/ast.js";
import { lower } from "../src/ir.js";
import { emitProgram, programHex } from "../src/emit.js";
import { disassemble, programHash } from "../src/disassemble.js";

const token0 = "0xF62849F9A0B5Bf2913b396098F7c7019b51A820a";
const token1 = "0x5991A2dF15A8F6A256D3Ec51E99254Cd3fb576A9";

const opts = { chainId: 11155111, now: 1_800_000_000, pairBase: "token0" as const };

const referenceSpec = StrategySpec.parse({
  specVersion: SPEC_VERSION,
  pair: { token0, token1 },
  size: { amount0: "1.5", amount1: "3000" },
  blocks: [
    { type: "deadline", hours: 24 },
    { type: "oracleGuard", feed: "ETH/USD", maxDeviationBps: 150, maxStalenessSecs: 3600, mode: "revert" },
    { type: "inventorySkew", targetRatio: 0.5, slopeBps: 20, maxSkewBps: 80 },
    { type: "makerFee", bps: 25 },
    { type: "protocolFee", bps: 5, receiver: token0 },
    { type: "curve", kind: "xyc" },
    { type: "salt", value: 1 },
  ],
});

describe("disassemble", () => {
  it("round-trips: decode(emit(ir)) === ir (riga 22 bar)", () => {
    const ir = lower(referenceSpec, opts);
    const decoded = disassemble(emitProgram(ir));
    expect(decoded).toEqual(ir);
    // And re-emitting the decoded IR reproduces the bytes exactly.
    expect(programHex(emitProgram(decoded))).toBe(programHex(emitProgram(ir)));
  });

  it("throws on an opcode outside the wave slot map", () => {
    expect(() => disassemble(Uint8Array.of(255, 0))).toThrowError(/not in the wave slot map/);
  });

  it("throws on a truncated header and on truncated args", () => {
    expect(() => disassemble(Uint8Array.of(17))).toThrowError(/truncated/);
    expect(() => disassemble(Uint8Array.of(20, 8, 1, 2))).toThrowError(/ends early/);
  });

  it("decodes an empty program to an empty IR", () => {
    expect(disassemble(new Uint8Array(0))).toEqual([]);
  });
});

describe("programHash", () => {
  it("matches the frozen on-chain keccak of the reference program", () => {
    // REFERENCE_PROGRAM_HASH in swap-vm/test/ReferenceProgram.t.sol —
    // Solidity keccak256 of the same bytes. Third leg of the cross-check:
    // TS emit, Solidity build, and now TS keccak all agree.
    const bytes = emitProgram(lower(referenceSpec, opts));
    expect(programHash(bytes)).toBe("0xade72c01e03f1f3d3a6dbebbe103d02a17ae1531227a03b58ff80597e939fd26");
  });

  it("hashes the empty program to the keccak empty-input constant", () => {
    expect(programHash(new Uint8Array(0))).toBe(
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
  });
});
