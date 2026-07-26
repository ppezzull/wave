// ERC-7930 encoder tests — the ONE unknown-cost ENS item (Flavio.md L9). Verified against
// the EIP-7930 spec worked example (mainnet) and the wave Sepolia router value from
// ENS-PATH.md §3. RED-on-mutation: a wrong field/length → the expected-hex assertion fails.
import { describe, it, expect } from "vitest";
import { erc7930, ensip25Key } from "../ens/erc7930.js";

describe("erc7930 (EIP-7930 interoperable address encoder)", () => {
  // Spec Example 1 — mainnet chain 1, 0x8004A169…. ENS-PATH.md §3.
  it("matches EIP-7930 spec Example 1 (mainnet, chain 1)", () => {
    expect(erc7930(1, "0x8004A169fb4a3325136eb29fa0ceb6d2e539a432")).toBe(
      "0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432",
    );
  });

  // Sepolia EnsStrategyRouter — chain 11155111 (0xaa36a7, 3-byte chainRef), 29 bytes total.
  it("encodes the Sepolia EnsStrategyRouter (3-byte minimal chainRef)", () => {
    expect(erc7930(11155111, "0xeb513fd18c391fae1513ff12c1f97bf659d052c4")).toBe(
      "0x0001000003aa36a714eb513fd18c391fae1513ff12c1f97bf659d052c4",
    );
  });

  it("emits version=1 + chainType=0 (EVM) for any chain", () => {
    const out = erc7930(11155111, "0xeb513fd18c391fae1513ff12c1f97bf659d052c4");
    expect(out.slice(0, 10)).toBe("0x00010000"); // 0001 (v1) | 0000 (EVM)
  });
});

describe("ensip25Key (ENSIP-25 attestation key)", () => {
  const router7930 = erc7930(11155111, "0xeb513fd18c391fae1513ff12c1f97bf659d052c4");
  const strategyId = `0x${"11".repeat(32)}`;

  it("builds agent-registration[<erc7930 router>][<strategyId>]", () => {
    expect(ensip25Key(router7930, strategyId)).toBe(
      `agent-registration[${router7930}][${strategyId}]`,
    );
  });

  it("rejects a strategyId containing '[' or ']' (ENSIP-25)", () => {
    expect(() => ensip25Key(router7930, "0x[bad]id")).toThrow(/must not contain/);
  });
});
