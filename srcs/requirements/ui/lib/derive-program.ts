// Derive the on-chain program from a strategy's stored description — the
// detail page's real data source for bytecode + the honest hash check.
//
// Chain: description → the agent's composeAgent (structured StrategySpec, the
// SAME parser the ship path used) → emitProgram (the deterministic compiler
// CLI) → program bytes/hash/disassembly/rule pass. Nothing is invented: if any
// step fails, callers render pending/hidden — never a fabricated program.
//
// Cost: one LLM parse (~5s) + one compiler spawn per unique description. The
// process-lifetime cache below makes every later view instant; failures are
// negative-cached for 60s so a transient agent outage can't pin a slow page.
import 'server-only'
import { emitProgram, type EmitInstruction } from '@/app/actions/emit'

const AGENT_URL = process.env.AGENT_URL ?? 'http://agent:3002'
const GENERATE_TIMEOUT_MS = 45_000
const FAILURE_TTL_MS = 60_000

export interface DerivedProgram {
  programHash?: string
  programHex?: string
  bytecode: EmitInstruction[]
  rulesApplied: string[]
  canonicalized?: boolean
}

const cache = new Map<string, { at: number; value: DerivedProgram | null }>()

export async function deriveProgramFromDescription(
  description: string,
): Promise<DerivedProgram | null> {
  if (!description.trim()) return null
  const hit = cache.get(description)
  if (hit && (hit.value !== null || Date.now() - hit.at < FAILURE_TTL_MS)) {
    return hit.value
  }
  const value = await deriveUncached(description)
  cache.set(description, { at: Date.now(), value })
  return value
}

async function deriveUncached(description: string): Promise<DerivedProgram | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS)
    const res = await fetch(`${AGENT_URL}/api/agents/composeAgent/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: description }] }),
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = (await res.json()) as { object?: unknown }
    const spec = data?.object
    if (!spec || typeof spec !== 'object') return null
    const pair = (spec as { pair?: { token0?: string; token1?: string } }).pair
    if (!pair?.token0 || !pair?.token1) return null
    const size = (spec as { size?: { amount0?: string | number; amount1?: string | number } }).size
    const blocks = (spec as { blocks?: unknown[] }).blocks

    const out = await emitProgram({
      specVersion: 1,
      pair: { token0: String(pair.token0), token1: String(pair.token1) },
      size: {
        amount0: String(size?.amount0 ?? '0'),
        amount1: String(size?.amount1 ?? '0'),
      },
      blocks: Array.isArray(blocks)
        ? (blocks as Array<{ type: string; [k: string]: unknown }>)
        : [],
    })
    if (!out.ok || !out.programHash) return null
    return {
      programHash: out.programHash,
      programHex: out.programHex,
      bytecode: out.bytecode ?? [],
      rulesApplied: out.rulesApplied ?? [],
      canonicalized: out.canonicalized,
    }
  } catch {
    return null
  }
}
