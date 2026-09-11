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
// REMOVED: World ID publish gate (the Orb requirement could not be met).
// sybil surface, so a ship requires a proof of unique human — enforced HERE,
// server-side, never in the browser. The signal is re-derived from the exact


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
  /** On-chain attribution tx (factory attribute) — present when the author was
   *  recorded. Best-effort: its absence never fails the ship. */
  attributeTxHash?: string
  shipTxHash?: string
  alreadyDeployed?: boolean
  reason?: string
}

export interface ShipOptions {
  label?: string
  decimals?: number
  description?: string
  /** The author's wallet — the agent attributes the ship to it on-chain
   *  (factory attribute) right after announce. Best-effort, display-layer. */
  author?: string
}

/**
 * Ship a strategy live via the agent. Caller MUST hold explicit human approval first.
 * `author` (the session wallet address) makes the agent attribute the ship on-chain
 * after announce — best-effort, provenance is display-layer. Returns the agent's
 * result on success, or { ok:false, reason } — never fabricates a ship.
 */
export async function shipStrategy(
  spec: ShipStrategySpec,
  opts: ShipOptions = {},
): Promise<ShipResult> {
  if (!spec || !spec.pair?.token0 || !spec.pair?.token1 || !spec.blocks?.length) {
    return { ok: false, reason: 'missing pair or blocks in spec' }
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
    attributeTxHash?: string
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
    attributeTxHash: out.attributeTxHash,
    shipTxHash: out.shipTxHash,
    alreadyDeployed: out.alreadyDeployed
  }
}
