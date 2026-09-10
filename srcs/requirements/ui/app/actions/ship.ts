'use server'

// shipStrategy — the UI's "Ship on-chain" server action. Forwards the finalized
// StrategySpec (from the compose agent) to the agent's shipStrategy tool, which runs the
// full pipeline in the agent process: compile → announce → approve → ship → verify. The
// UI holds no keys, no compiler, no business logic (frontend.md §8).
//
// It forwards the SPEC, never client-supplied program bytes or hashes — the agent
// re-derives everything, so nothing the browser sends can misreport the on-chain program.
//
// This is a DESTRUCTIVE on-chain write. The caller (create-drawer handleShip) MUST obtain
// explicit human approval (the Ship confirm dialog) before invoking — that is the HITL gate
// for this event demo. Agent signs with server-side .env keys; user-wallet (Privy) signing
// is the post-event hardening.
//
// Mounted tool path verified: POST /api/tools/:id/execute (probed against the running
// agent; /api/mcp/wave/:id returns 404 on the installed Mastra). The tool input is wrapped
// under `data` per Mastra's tool-execute body shape.
//
// World ID publish gate (Step 5, ETHOnline World plan): publishing is wave's
// sybil surface, so a ship requires a proof of unique human — enforced HERE,
// server-side, never in the browser. The signal is re-derived from the exact
// spec+description and the nullifier consumed one shot (see app/actions/world.ts).

import { consumeVerifiedProof, worldPublishConfig } from '@/app/actions/world'
import { publishSignal } from '@/lib/world/publish-signal'
import type { WorldProofPayload } from '@/lib/world/publish-signal'

const AGENT_URL = process.env.AGENT_URL ?? 'http://agent:3002'

// Ship is slow: compile (sub-second) + 4 Sepolia writes (announce, 2× approve, ship), each
// waiting for a receipt (~15-30s on Sepolia). Bound the total well above the sum.
const SHIP_TIMEOUT_MS = Number(process.env.SHIP_TIMEOUT_MS ?? 180_000)

export interface ShipStrategySpec {
  specVersion: number
  pair: { token0: string; token1: string }
  size: { amount0: string; amount1: string }
  blocks: Array<{ type: string; [k: string]: unknown }>
}

export interface ShipResult {
  ok: boolean
  strategyId?: string
  programHash?: string
  /** Display handle the agent attributed the ship to, e.g. "s-fab534ee". */
  handle?: string
  announceTxHash?: string
  shipTxHash?: string
  alreadyDeployed?: boolean
  /** True when this ship passed the World ID human gate (absent when the gate is off). */
  worldVerified?: boolean
  reason?: string
}

export interface ShipOptions {
  label?: string
  decimals?: number
  description?: string
  /** World ID proof from useWorldPublishGate — required when the gate is on. */
  worldProof?: WorldProofPayload
}

/**
 * Ship a strategy live via the agent. Caller MUST hold explicit human approval first.
 * Returns the agent's result on success, or { ok:false, reason } — never fabricates a ship.
 */
export async function shipStrategy(
  spec: ShipStrategySpec,
  opts: ShipOptions = {},
): Promise<ShipResult> {
  if (!spec || !spec.pair?.token0 || !spec.pair?.token1 || !spec.blocks?.length) {
    return { ok: false, reason: 'missing pair or blocks in spec' }
  }

  const cfg = await worldPublishConfig()
  if (cfg.gateOn) {
    const proof = opts.worldProof
    if (!proof) {
      return { ok: false, reason: 'World ID proof required to publish (verified humans only)' }
    }
    if (proof.kind === 'dev') {
      if (!cfg.devAllow) {
        return { ok: false, reason: 'dev proof fixture not accepted (WORLD_ID_DEV_ALLOW off)' }
      }
    } else {
      if (!opts.description) {
        return { ok: false, reason: 'description required to bind the World ID proof' }
      }
      const signal = await publishSignal(spec, opts.description)
      const v = await consumeVerifiedProof(proof.result, signal)
      if (!v.ok) {
        return { ok: false, reason: `world proof rejected: ${v.reason}` }
      }
    }
  }

  let res: Response
  try {
    res = await fetch(`${AGENT_URL}/api/tools/shipStrategy/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { spec, ...opts } }), // description rides in opts → the agent's described announce
      signal: AbortSignal.timeout(SHIP_TIMEOUT_MS),
    })
  } catch (err) {
    return { ok: false, reason: `agent unreachable: ${String(err).slice(0, 120)}` }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, reason: `agent HTTP ${res.status}: ${text.slice(0, 200)}` }
  }

  // Mastra tool-execute returns { output?: {...} } or the output object at top level.
  const json = (await res.json()) as {
    output?: ShipResult & { shipped?: boolean; error?: string }
    strategyId?: string
    programHash?: string
    handle?: string
    shipTxHash?: string
    announceTxHash?: string
    shipped?: boolean
    alreadyDeployed?: boolean
    error?: string
  }
  const out = (json.output ?? json) as ShipResult & { shipped?: boolean; error?: string }

  // The agent returns `shipped` + `error`; treat a non-shipped result as a failure with the
  // agent's reason so the UI never reports a fake success.
  if (out.shipped === false) {
    return { ok: false, reason: out.error ?? out.reason ?? 'agent did not ship' }
  }
  return {
    ok: true,
    strategyId: out.strategyId,
    programHash: out.programHash,
    handle: out.handle,
    announceTxHash: out.announceTxHash,
    shipTxHash: out.shipTxHash,
    alreadyDeployed: out.alreadyDeployed,
    worldVerified: cfg.gateOn ? true : undefined,
  }
}
