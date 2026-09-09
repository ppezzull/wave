// AgentKit verification pipeline for the MCP gate. Wraps the agentkit-core
// primitives (parse → validate → signature → AgentBook) behind injectable
// deps so the whole decision path is unit-testable without World Chain or an
// RPC: tests pass stub lookupHuman/verifySignature, production wires the
// canonical createAgentBookVerifier + verifyAgentkitSignature.
import {
  parseAgentkitHeader,
  validateAgentkitMessage,
  type AgentkitPayload,
} from "@worldcoin/agentkit";

export type VerifyErrorKind =
  | "missing-header"
  | "malformed"
  | "stale-or-invalid"
  | "nonce-replayed"
  | "bad-signature"
  | "not-in-agentbook";

export interface VerifyDeps {
  /** AgentBook lookup: anonymous human identifier for the agent wallet, or null. */
  lookupHuman: (address: string) => Promise<string | null>;
  /** EIP-191/1271 signature check of the CAIP-style message against payload.address. */
  verifySignature: (payload: AgentkitPayload) => Promise<{ valid: boolean; error?: string }>;
  hasUsedNonce?: (nonce: string) => Promise<boolean>;
  recordNonce?: (nonce: string) => Promise<void>;
  /** Message freshness window in seconds (default 5 min). */
  maxAgeSeconds?: number;
}

export interface VerifyOutcome {
  ok: boolean;
  address?: string;
  humanId?: string;
  errorKind?: VerifyErrorKind;
  error?: string;
}

export async function verifyAgentkit(
  headerValue: string | undefined,
  expectedResourceUri: string,
  deps: VerifyDeps,
): Promise<VerifyOutcome> {
  if (!headerValue) {
    return { ok: false, errorKind: "missing-header", error: "missing agentkit header" };
  }

  let payload: AgentkitPayload;
  try {
    payload = parseAgentkitHeader(headerValue);
  } catch (err) {
    return { ok: false, errorKind: "malformed", error: `unparseable agentkit header: ${err}` };
  }

  const validity = await validateAgentkitMessage(payload, expectedResourceUri, {
    maxAge: deps.maxAgeSeconds ?? 300,
    checkNonce: async (nonce) => (deps.hasUsedNonce ? !(await deps.hasUsedNonce(nonce)) : true),
  });
  if (!validity.valid) {
    // Distinguish replay from plain staleness — the demo shows both paths.
    if (deps.hasUsedNonce && payload.nonce && (await deps.hasUsedNonce(payload.nonce))) {
      return { ok: false, address: payload.address, errorKind: "nonce-replayed", error: "nonce already used (replayed proof)" };
    }
    return { ok: false, address: payload.address, errorKind: "stale-or-invalid", error: validity.error ?? "stale or invalid message" };
  }

  // Signature before AgentBook: the lookup is an RPC call to World Chain —
  // only pay it once the message itself is sound and self-consistent.
  const sig = await deps.verifySignature(payload);
  if (!sig.valid) {
    return { ok: false, address: payload.address, errorKind: "bad-signature", error: sig.error ?? "signature verification failed" };
  }

  // Burn the nonce only after full success (a failed verify may be retried
  // with the same message; a successful one may not).
  if (deps.recordNonce && payload.nonce) await deps.recordNonce(payload.nonce);

  const humanId = await deps.lookupHuman(payload.address);
  if (!humanId) {
    return {
      ok: false,
      address: payload.address,
      errorKind: "not-in-agentbook",
      error: "agent wallet not registered in AgentBook — no verified human behind it",
    };
  }

  return { ok: true, address: payload.address, humanId };
}
