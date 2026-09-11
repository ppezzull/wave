// Ledger approval tests — the verification half runs with a software key as a
// stand-in for the device (same EIP-191 personal_sign the hardware makes; the
// device's address is what LEDGER_APPROVER_ADDRESS will pin).
import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { actionHashOf, approvalMessage, verifyLedgerApproval } from "../../ledger/approval.js";

const approver = privateKeyToAccount(generatePrivateKey());
const spec = { strategy: "eth-usdc", blocks: [{ type: "curve" }] };
const hash = actionHashOf(spec);
const message = approvalMessage(hash, "ship eth-usdc guarded strategy");

describe("actionHashOf", () => {
  it("is stable for the same payload and differs across payloads", () => {
    expect(actionHashOf(spec)).toBe(hash);
    expect(actionHashOf({ different: true })).not.toBe(hash);
  });
});

describe("verifyLedgerApproval", () => {
  it("accepts a fresh signature from the designated approver, bound to this action", async () => {
    const signature = await approver.signMessage({ message });
    const r = await verifyLedgerApproval(
      { address: approver.address, message, signature },
      { approverAddress: approver.address, actionHash: hash },
    );
    expect(r.ok).toBe(true);
  });

  it("rejects a different signer (address mismatch)", async () => {
    const stranger = privateKeyToAccount(generatePrivateKey());
    const signature = await stranger.signMessage({ message });
    const r = await verifyLedgerApproval(
      { address: stranger.address, message, signature },
      { approverAddress: approver.address, actionHash: hash },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain("approver mismatch");
  });

  it("rejects a valid signature made for a DIFFERENT action (anti-replay binding)", async () => {
    const otherMessage = approvalMessage(actionHashOf({ different: true }), "another action");
    const signature = await approver.signMessage({ message: otherMessage });
    const r = await verifyLedgerApproval(
      { address: approver.address, message: otherMessage, signature },
      { approverAddress: approver.address, actionHash: hash },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain("not bound");
  });

  it("rejects garbage signatures with a malformed error", async () => {
    const r = await verifyLedgerApproval(
      { address: approver.address, message, signature: "0xdeadbeef" },
      { approverAddress: approver.address, actionHash: hash },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain("malformed");
  });

  it("flags a missing approver pin (misconfigured LEDGER_APPROVER_ADDRESS)", async () => {
    const signature = await approver.signMessage({ message });
    const r = await verifyLedgerApproval(
      { address: approver.address, message, signature },
      { approverAddress: "", actionHash: hash },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain("LEDGER_APPROVER_ADDRESS");
  });
});
