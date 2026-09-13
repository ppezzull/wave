// Hardware- or wallet-backed approval verification for the HITL gate (Ledger
// Continuity, plan Fase 1ter). This is the signer-INDEPENDENT half: verify
// that an "approved" action carries a fresh EIP-191 signature bound to the
// specific proposal (anti-replay across actions), from an allowed signer:
//   kind 'device'  — the DESIGNATED hardware approver (LEDGER_APPROVER_ADDRESS;
//                    the Ledger's ETH account, Clear-Signed via DMK in the UI)
//   kind 'session' — the ship's declared AUTHOR wallet (the Privy session
//                    wallet signs the same message; the fallback for users
//                    without hardware — still a signature, never a click)
// The hash is computed over CANONICAL JSON (recursively key-sorted) so the
// UI mirror and this side always agree regardless of key order across the
// zod parse / JSON wire / durable storage round-trips.
import { createHash } from "node:crypto";
import { recoverMessageAddress } from "viem";

export type ApprovalKind = "device" | "session";

export interface ShipApproval {
  /** Which signer class this approval claims to be. */
  kind: ApprovalKind;
  /** Claimed signer address (must match the recovered address). */
  address: string;
  /** Human-readable action text shown on the device/wallet; MUST embed the actionHash. */
  message: string;
  /** EIP-191 personal_sign signature over message. */
  signature: string;
}

/** Legacy shape kept for the workflow resume schema (device-only path). */
export interface LedgerApproval {
  address: string;
  message: string;
  signature: string;
}

export interface ApprovalExpectation {
  /** The one address allowed to sign for this approval's kind. */
  expectedAddress: string;
  /** Hash binding the approval to THIS proposal — a signature for another action never verifies. */
  actionHash: string;
}

/** Deterministic JSON: object keys sorted recursively — the same canonical
 * form the UI mirror (ui/lib/ledger.ts) derives, so the hash is independent
 * of key order on either side of the wire. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

/** Stable hash of the gated proposal — canonical (key-sorted) JSON underneath,
 * so suspend-time, resume-time and UI-side hashes always agree. */
export function actionHashOf(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex").slice(0, 32);
}

/**
 * The exact text the device screen / wallet prompt shows and signs. STRICTLY
 * ASCII and byte-identical with ui/lib/ledger.ts: the DMK signer kit frames
 * with string-length but encodes UTF-8 — a non-ASCII char desyncs the APDU
 * and the ETH app returns 6980 / an empty response ("no signature returned").
 * The verifier only requires the hash to be embedded.
 */
export function approvalMessage(actionHash: string, description: string): string {
  const ascii = (description.match(/[\x20-\x7e]+/g) ?? []).join(" ").slice(0, 200);
  return `wave HITL approval [${actionHash}] -- ${ascii}`;
}

/** Verify an approval: right claimed address, hash embedded in the message,
 * and the signature actually recovers to that address. */
export async function verifyApproval(
  approval: ShipApproval,
  expectation: ApprovalExpectation,
): Promise<{ ok: boolean; error?: string }> {
  if (!expectation.expectedAddress) {
    return { ok: false, error: "expected approver address is not set (LEDGER_APPROVER_ADDRESS / author)" };
  }
  if (approval.address.toLowerCase() !== expectation.expectedAddress.toLowerCase()) {
    return {
      ok: false,
      error: `approver mismatch: expected ${expectation.expectedAddress}, got ${approval.address}`,
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
    return { ok: false, error: `signature recovers to ${recovered}, not to the claimed address` };
  }
  return { ok: true };
}

/** Back-compat wrapper for the workflow seam (device-only, no kind field). */
export async function verifyLedgerApproval(
  approval: LedgerApproval | ShipApproval,
  expectation: { approverAddress: string; actionHash: string },
): Promise<{ ok: boolean; error?: string }> {
  return verifyApproval(
    "kind" in approval ? approval : { ...approval, kind: "device" as const },
    { expectedAddress: expectation.approverAddress, actionHash: expectation.actionHash },
  );
}
