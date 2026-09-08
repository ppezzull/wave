'use server'

// faucetDrip — the UI's "Get test ETH" server action. Forwards the connected wallet
// address to the agent's faucetDrip tool, which drips Sepolia ETH from the agent's
// buffer wallet (PROD-TESTNET §4/§7). The UI holds no keys (frontend.md §8) — the
// agent process owns the faucet EOA.
//
// Unlike ship (destructive, needs the Ship-confirm HITL gate), a capped testnet drip
// from the buffer wallet needs no confirm dialog — the button click is the gate. The
// agent's own caps (0.05/drip, 6h cooldown, empty-wallet gate, per-process budget)
// bound what this endpoint can do.
//
// Mounted tool path verified: POST /api/tools/:id/execute, input wrapped under `data`
// (same shape as ship.ts, probed against the running agent).

const AGENT_URL = process.env.AGENT_URL ?? 'http://agent:3002'

// 1 transfer + 2 balance reads ≈ one Sepolia block; 60s bounds a congested wait.
const FAUCET_TIMEOUT_MS = Number(process.env.FAUCET_TIMEOUT_MS ?? 60_000)

export interface FaucetResult {
  ok: boolean
  txHash?: string
  /** Human drip size, e.g. "0.05". */
  dripped?: string
  /** The buffer wallet's address (surfaced on underfunded). */
  faucetAddress?: string
  /** Present on cooldown — seconds until the wallet may drip again. */
  retryInSec?: number
  reason?: string
}

/**
 * Drip test ETH to `address` via the agent. Returns {ok:true, txHash, …} on success or
 * {ok:false, reason} — never throws.
 */
export async function faucetDrip(address: string): Promise<FaucetResult> {
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return { ok: false, reason: 'invalid wallet address' }
  }

  let res: Response
  try {
    res = await fetch(`${AGENT_URL}/api/tools/faucetDrip/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { address } }),
      signal: AbortSignal.timeout(FAUCET_TIMEOUT_MS),
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
    output?: FaucetResult
  } & FaucetResult
  const out = (json.output ?? json) as FaucetResult

  // The agent returns ok:false + error for every expected failure; surface its reason so
  // the UI never reports a fake success.
  if (out.ok === false) {
    return { ok: false, retryInSec: out.retryInSec, reason: out.error ?? 'agent refused the drip' }
  }
  return {
    ok: true,
    txHash: out.txHash,
    dripped: out.dripped,
    faucetAddress: out.faucetAddress,
  }
}
