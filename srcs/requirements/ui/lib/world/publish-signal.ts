// Publish signal — the digest that binds a World ID proof to the exact
// strategy being published. Same module on client (before opening IDKit) and
// server (inside the ship action), so both sides always derive the same value.
//
// The signal is sha256(canonical JSON of { description, spec }) where the JSON
// is key-sorted at every level — resilient to property-order drift between the
// browser object and the JSON round-trip the server action receives.

import type { IDKitResult } from '@worldcoin/idkit'
import type { ShipStrategySpec } from '@/app/actions/ship'

/** What the gate hands to shipStrategy after a successful World ID verify. */
export type WorldProofPayload =
  | { kind: 'idkit'; result: IDKitResult; signal: string }
  | { kind: 'dev' }

export interface PublishPayload {
  description: string
  spec: {
    specVersion: number
    pair: { token0: string; token1: string }
    size: { amount0: string; amount1: string }
    blocks: Array<{ type: string; [k: string]: unknown }>
  }
}

/** Deterministic JSON: object keys sorted recursively, arrays keep order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
    .join(',')
  return `{${body}}`
}

export function publishPayload(
  spec: ShipStrategySpec,
  description: string,
): PublishPayload {
  return {
    description,
    spec: {
      specVersion: spec.specVersion,
      pair: { token0: spec.pair.token0, token1: spec.pair.token1 },
      size: { amount0: spec.size.amount0, amount1: spec.size.amount1 },
      blocks: spec.blocks,
    },
  }
}

/** Signal = sha256 of the canonical payload, 0x-prefixed hex. */
export async function publishSignal(spec: ShipStrategySpec, description: string): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(publishPayload(spec, description)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `0x${Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`
}
