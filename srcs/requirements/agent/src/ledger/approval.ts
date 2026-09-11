// Hardware-backed approval verification for the HITL gate (Ledger Continuity,
// plan Fase 1ter). This is the device-INDEPENDENT half: verify that an
// "approved" resume carries a fresh EIP-191 signature from the DESIGNATED
// hardware approver, bound to the specific proposal (anti-replay across
// actions). The signing half happens on the Ledger in the UI (DMK +
// SignerEth, Clear Signing shows the human-readable message); the device's
// address is pinned via LEDGER_APPROVER_ADDRESS.
import { createHash } from "node:crypto";
import { recoverMessageAddress } from "viem";

export interface LedgerApproval {
  /** Signer — must equal LEDGER_APPROVER_ADDRESS (the Ledger's ETH account). */
  address: string;
  /** Human-readable action text Clear-Signed on device; MUST embed the actionHash. */
  message: string;
  /** EIP-191 personal_sign signature over message. */
  signature: string;
}

export interface ApprovalExpectation {
  approverAddress: string;
  /** Hash binding the approval to THIS proposal — a signature for another action never verifies. */
  actionHash: string;
}

/** Stable hash of the gated proposal. JSON round-trips through the durable
 *  workflow storage preserve key order, so suspend-time and resume-time
 *  hashes match across restarts. */
export function actionHashOf(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
}

/** The exact text the device screen shows (Clear Signing) and signs. */
export function approvalMessage(actionHash: string, description: string): string {
  return `wave HITL approval [${actionHash}] — ${description}`;
}

export async function verifyLedgerApproval(
  approval: LedgerApproval,
  expectation: ApprovalExpectation,
): Promise<{ ok: boolean; error?: string }> {
  if (!expectation.approverAddress) {
    return { ok: false, error: "LEDGER_APPROVER_ADDRESS is not set" };
  }
  if (approval.address.toLowerCase() !== expectation.approverAddress.toLowerCase()) {
    return {
      ok: false,
      error: `approver mismatch: expected ${expectation.approverAddress}, got ${approval.address}`,
    };
  }
  if (!approval.message.includes(expectation.actionHash)) {
    return { ok: false, error: "message not bound to this proposal (action hash missing)" };
  }
  let recovered: string;
  try {
    recovered = await recoverMessageAddress({
      message: approval.message,
      signature: approval.signature as `0x${string}`,
    });
  } catch (err) {
    return { ok: false, error: `malformed signature: ${err}` };
  }
  if (recovered.toLowerCase() !== approval.address.toLowerCase()) {
    return { ok: false, error: `signature recovers to ${recovered}, not to the approver address` };
  }
  return { ok: true };
}
