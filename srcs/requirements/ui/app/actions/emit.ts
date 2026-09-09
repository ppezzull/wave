'use server'

// emitProgram — the compile-preview server action: StrategySpec → SwapVM program
// bytes + disassembled pane rows. Spawns the wave-compiler CLI (canonicalize →
// resolveRejections → lower → emit → disassemble), keeping the NodeNext compiler
// package out of the Next bundle (its `.js` import suffixes don't resolve under
// Turbopack). Read-only — no keys, no writes; the ship action remains the only
// path to chain.
//
// It feeds the CLI the same context the agent's ship path gives it: chain-id
// (drives the Chainlink feed registry) and pair decimals (the oracleGuard fold),
// so preview bytes == ship bytes inside the hour bucket.

import { spawn } from 'node:child_process'
import path from 'node:path'
import { createPublicClient, erc20Abi, http, type Address } from 'viem'

const COMPILER_ROOT = path.resolve(process.cwd(), '../compiler')

// The spawn can only hang if tsx itself wedges; bound it so the preview pane
// always resolves. The old route had no cap (the drawer's fetch raced a 15s
// AbortSignal) — the cap now lives here, server-side, for every caller.
const EMIT_TIMEOUT_MS = 15_000

export interface EmitSpec {
  specVersion: number
  pair: { token0: string; token1: string }
  size: { amount0: string; amount1: string }
  blocks: Array<{ type: string; [k: string]: unknown }>
}

export interface EmitInstruction {
  opcode: string
  length: string
  args: string
}

export interface EmitOutput {
  ok: boolean
  programHex?: string
  programHash?: string
  bytecode?: EmitInstruction[]
  canonicalized?: boolean
  moves?: Array<Record<string, unknown>>
  diff?: unknown
  rulesApplied?: string[]
  error?: string
  detail?: string
}

/// Pair decimals (cached — they never change). The oracleGuard fold needs them
/// when the spec carries a guard; without them the compiler throws
/// MissingPairDecimals and the preview errors with its message. Matches the
/// agent's ship path (it reads decimals() and exports the same env vars), so
/// preview bytes == ship bytes.
const decimalsCache = new Map<string, number>()

async function erc20Decimals(address: string): Promise<number | undefined> {
  const key = address.toLowerCase()
  const cached = decimalsCache.get(key)
  if (cached !== undefined) return cached
  const rpcUrl = process.env.WAVE_RPC_URL ?? process.env.SEPOLIA_RPC_URL ?? process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL
  if (!rpcUrl) return undefined
  try {
    // A dead/slow RPC must never hang the preview — 3s cap, then degrade.
    const client = createPublicClient({ transport: http(rpcUrl) })
    const decimals = await Promise.race([
      client.readContract({ address: address as Address, abi: erc20Abi, functionName: 'decimals' }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('decimals read timed out')), 3_000)),
    ])
    decimalsCache.set(key, decimals)
    return decimals
  } catch {
    return undefined
  }
}

function runEmit(
  specJson: string,
  envExtra: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const tsxBin = path.join(COMPILER_ROOT, 'node_modules', '.bin', 'tsx')
    const child = spawn(tsxBin, ['src/cli-emit.ts'], {
      cwd: COMPILER_ROOT,
      env: { ...process.env, ...envExtra },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, EMIT_TIMEOUT_MS)
    child.stdout.on('data', (c) => {
      stdout += String(c)
    })
    child.stderr.on('data', (c) => {
      stderr += String(c)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: 1, stdout: '', stderr: String(err) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr, timedOut })
    })
    child.stdin.write(specJson)
    child.stdin.end()
  })
}

/**
 * Compile a StrategySpec to SwapVM program bytes. Returns the compiler output
 * on success, or { ok:false, error } — never throws.
 */
export async function emitProgram(spec: EmitSpec): Promise<EmitOutput> {
  if (!spec || !spec.pair?.token0 || !spec.pair?.token1 || !spec.blocks?.length) {
    return { ok: false, error: 'missing pair or blocks in spec' }
  }

  // Chain-id drives the Chainlink feed registry; pair decimals fold the
  // oracleGuard byte. Unresolved decimals stay unset — the compiler names
  // exactly what's missing.
  const envExtra: Record<string, string> = {}
  const chainId = process.env.WAVE_CHAIN_ID
  if (chainId) envExtra.WAVE_CHAIN_ID = chainId

  const hasOracleGuard = spec.blocks.some((b) => b?.type === 'oracleGuard')
  if (hasOracleGuard) {
    const [d0, d1] = await Promise.all([erc20Decimals(spec.pair.token0), erc20Decimals(spec.pair.token1)])
    if (d0 !== undefined) envExtra.WAVE_TOKEN0_DECIMALS = String(d0)
    if (d1 !== undefined) envExtra.WAVE_TOKEN1_DECIMALS = String(d1)
  }

  const { code, stdout, stderr, timedOut } = await runEmit(JSON.stringify(spec), envExtra)
  if (timedOut) {
    return { ok: false, error: `emit timed out after ${EMIT_TIMEOUT_MS / 1000}s` }
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(stdout) as Record<string, unknown>
  } catch {
    return {
      ok: false,
      error: 'emit CLI returned non-JSON',
      detail: stderr || stdout.slice(0, 500),
    }
  }

  if (code !== 0 || parsed.error) {
    return {
      ok: false,
      error: String(parsed.error ?? 'emit failed'),
      detail: typeof parsed.detail === 'string' ? parsed.detail : undefined,
    }
  }
  return { ok: true, ...(parsed as Omit<EmitOutput, 'ok'>) }
}
