'use server'

// World ID publish gate — server side (Step 5 of the ETHOnline World plan).
//
// Flow (docs.world.org/world-id/idkit/integrate):
//   1. createWorldRpContext()   — sign the RP context with the Developer
//      Portal signing key (`signRequest`, EIP-191 over nonce+timestamps+action).
//   2. the browser opens IDKit with preset proofOfHuman({ signal }) where
//      signal = sha256 of the exact { description, spec } being shipped.
//   3. verifyWorldProof()       — forward the IDKit payload AS-IS to
//      POST https://developer.world.org/api/v4/verify/{rp_id} (cryptographic
//      validation happens there; the payload embeds our rp_context signature).
//      On success the nullifier is recorded, bound to the signal it was minted
//      for. The signal binding (signal_hash === hashSignal(signal)) is checked
//      BEFORE the portal call and again at consume time.
//   4. consumeVerifiedProof()   — the ship action re-derives the signal and
//      consumes the record: a proof only ever unlocks the strategy it was
//      minted for, exactly once (the portal already burned the nullifier
//      globally; the record makes one-ship-per-verify true even against a
//      client that skips the widget and replays a payload).
//
// The ledger is per-process memory — fine for the event's single ui container;
// a serverless deploy would need it in a store.
//
// Kill switch: WORLD_PUBLISH_GATE=off disables the whole gate (ship works as
// before). Dev fixture: WORLD_ID_DEV_ALLOW=on accepts the literal 'dev' proof
// so the flow is demoable before Sandbox App access lands.

import { signRequest } from '@worldcoin/idkit/signing'
import { hashSignal } from '@worldcoin/idkit/hashing'
import {
  WORLD_PUBLISH_ACTION,
  type WorldPublishConfig,
  type WorldRpContext,
} from '@/lib/world/config'

interface V4ProofShape {
  protocol_version?: string
  action?: string
  identifier?: string
  signal_hash?: string
  nullifier?: string
}

/** Nullifiers verified by this server process: nullifier → bound signal. */
const verifiedProofs = new Map<string, string>()

export async function worldPublishConfig(): Promise<WorldPublishConfig> {
  const env = process.env.WORLD_IDKIT_ENV
  return {
    gateOn: (process.env.WORLD_PUBLISH_GATE ?? 'on') !== 'off',
    devAllow: process.env.WORLD_ID_DEV_ALLOW === 'on',
    appId: process.env.WORLD_APP_ID ?? '',
    action: WORLD_PUBLISH_ACTION,
    idkitEnv: env === 'production' || env === 'sandbox' ? env : 'staging',
  }
}

/**
 * Sign a fresh RP context for the publish action. Returns null when the
 * signing key is not configured — the UI shows an honest "verification
 * unavailable" state instead of failing mid-widget.
 */
export async function createWorldRpContext(): Promise<WorldRpContext | null> {
  const key = process.env.WORLD_SIGNING_KEY
  const rpId = process.env.WORLD_RP_ID
  if (!key || !rpId) return null
  try {
    const sig = signRequest({ signingKeyHex: key, action: WORLD_PUBLISH_ACTION, ttl: 300 })
    return {
      rp_id: rpId,
      nonce: sig.nonce,
      created_at: sig.createdAt,
      expires_at: sig.expiresAt,
      signature: sig.sig,
    }
  } catch {
    return null
  }
}

/**
 * Forward the IDKit result to the Developer Portal v4 verify endpoint and, on
 * success, record the nullifier bound to `signal`. The payload is passed
 * through as-is (per the docs: no field remapping); authenticity comes from
 * the rp_context signature embedded in it.
 */
export async function verifyWorldProof(
  result: unknown,
  signal: string,
): Promise<{ ok: boolean; reason?: string }> {
  const rpId = process.env.WORLD_RP_ID
  if (!rpId) return { ok: false, reason: 'world rp_id not configured' }
  const shape = parseV4Proof(result)
  if (!shape.nullifier) return { ok: false, reason: 'malformed proof: no nullifier' }
  if (!shape.signal_hash) return { ok: false, reason: 'proof carries no signal hash' }
  if (shape.signal_hash !== hashSignal(signal)) {
    return { ok: false, reason: 'proof was minted for a different payload' }
  }
  try {
    const res = await fetch(`https://developer.world.org/api/v4/verify/${rpId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(result),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, reason: `world verify HTTP ${res.status}: ${text.slice(0, 140)}` }
    }
    verifiedProofs.set(shape.nullifier, signal)
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: `world verify unreachable: ${String(err).slice(0, 120)}` }
  }
}

/**
 * Consume a previously-verified proof for `expectedSignal` — the ship-side
 * half of the gate. The record is deleted regardless of what the caller does
 * next: one verification unlocks exactly one ship.
 */
export async function consumeVerifiedProof(
  result: unknown,
  expectedSignal: string,
): Promise<{ ok: boolean; reason?: string }> {
  const shape = parseV4Proof(result)
  if (!shape.nullifier) return { ok: false, reason: 'malformed proof: no nullifier' }
  if (shape.protocol_version !== '4.0') return { ok: false, reason: 'not a v4 proof' }
  if (shape.action !== WORLD_PUBLISH_ACTION) return { ok: false, reason: 'proof action mismatch' }
  if (shape.identifier !== 'proof_of_human') return { ok: false, reason: 'not a proof-of-human' }
  if (shape.signal_hash !== hashSignal(expectedSignal)) {
    return { ok: false, reason: 'proof does not bind this payload' }
  }
  const recorded = verifiedProofs.get(shape.nullifier)
  if (recorded === undefined) {
    return { ok: false, reason: 'proof not verified by this server (or already used)' }
  }
  if (recorded !== expectedSignal) {
    return { ok: false, reason: 'proof was verified for a different payload' }
  }
  verifiedProofs.delete(shape.nullifier)
  return { ok: true }
}

function parseV4Proof(result: unknown): V4ProofShape {
  if (!result || typeof result !== 'object') return {}
  const r = result as {
    protocol_version?: string
    action?: string
    responses?: Array<{ identifier?: string; signal_hash?: string; nullifier?: string }>
  }
  const item = Array.isArray(r.responses) ? r.responses[0] : undefined
  return {
    protocol_version: r.protocol_version,
    action: r.action,
    identifier: item?.identifier,
    signal_hash: item?.signal_hash,
    nullifier: item?.nullifier,
  }
}
