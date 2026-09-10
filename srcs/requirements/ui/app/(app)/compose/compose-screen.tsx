'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { useComposeStream, type StrategySpec } from '@/hooks/use-compose-stream'
import { shipStrategy, type ShipResult } from '@/app/actions/ship'
import { useWorldPublishGate } from '@/components/world-publish-gate'
import { emitProgram } from '@/app/actions/emit'
import { BytecodePane } from '@/components/bytecode-pane'
import { SafetyCardDetail } from '@/components/safety-card-detail'
import type { BytecodeInstruction, Strategy } from '@/lib/mock-data'
import { ZERO_HASH } from '@/lib/strategy/format'

const LISBOA =
  'linear-gradient(135deg, #0F3460 0%, #2A9D8F 45%, #26A69A 70%, #FFF3E0 100%)'

interface Props {
  /** Prefill from ?fork= — the author's description, byte-for-byte. */
  initialDescription: string
  forkAuthor?: string
  forkId?: string
}

interface EmitResult {
  programHex: string
  programHash: string
  bytecode: BytecodeInstruction[]
  rulesApplied?: string[]
  diff?: string
  error?: string
  detail?: string
}

function draftStrategy(
  description: string,
  spec: StrategySpec | null,
  emit: EmitResult | null,
): Strategy {
  const pair = spec?.pair
  const label =
    pair?.token0 && pair?.token1
      ? `${pair.token0.slice(0, 6)}/${pair.token1.slice(0, 6)}`
      : 'draft'
  const hash = emit?.programHash ?? ZERO_HASH
  return {
    id: '0xcompose-draft',
    programHash: hash,
    status: 'active',
    cumulativeVolumeIn: '0',
    cumulativeVolumeOut: '0',
    swapCount: 0,
    lastSwapTimestamp: 0,
    authorHandle: 'you',
    description,
    ensProgramHash: hash, // pre-ship: nothing committed yet — match on-chain draft
    committedCapital: '0',
    oracleBand: label,
    bytecode: emit?.bytecode ?? [],
    safety: emit
      ? {
          verdict: 'SAFE',
          monotonicity: 1,
          symmetry: '0 bps',
          guardTriggers: 0,
          skewVsCap: 0,
          pending: false,
        }
      : {
          verdict: 'SAFE',
          monotonicity: 0,
          symmetry: '—',
          guardTriggers: 0,
          skewVsCap: 0,
          pending: true,
        },
    retunes: [],
  }
}

function LiveSpecCard({ spec, done }: { spec: StrategySpec | null; done: boolean }) {
  const pair = spec?.pair
  const size = spec?.size
  const blocks = spec?.blocks ?? []
  const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—')
  return (
    <div
      className="rounded-[14px] p-4 bg-wave-surface border border-wave-border"
      role="status"
      aria-label={done ? 'Strategy spec compiled' : 'Strategy spec compiling'}
    >
      <p className="font-sans text-[13px] font-bold text-wave-text mb-3">
        {done ? 'Compiled spec' : 'Compiling spec…'}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[12px]">
        <div className="text-wave-muted">token0</div>
        <div className="text-wave-text truncate">{short(pair?.token0)}</div>
        <div className="text-wave-muted">token1</div>
        <div className="text-wave-text truncate">{short(pair?.token1)}</div>
        <div className="text-wave-muted">size0</div>
        <div className="text-wave-text">{size?.amount0 ?? '—'}</div>
        <div className="text-wave-muted">size1</div>
        <div className="text-wave-text">{size?.amount1 ?? '—'}</div>
        <div className="text-wave-muted">blocks</div>
        <div className="text-wave-text">
          {blocks.length ? blocks.map((b) => b.type).join(', ') : '—'}
        </div>
      </div>
    </div>
  )
}

export function ComposeScreen({ initialDescription, forkAuthor, forkId }: Props) {
  // Description IS the prompt — keep exact bytes; never trim/reflow.
  const [description, setDescription] = useState(initialDescription)
  const compose = useComposeStream()
  const [emit, setEmit] = useState<EmitResult | null>(null)
  const [emitting, setEmitting] = useState(false)
  // Ship flow (mirrors the drawer's HITL gate): idle → confirming → shipping → done|error.
  const [shipPending, setShipPending] = useState(false)
  const [shipConfirming, setShipConfirming] = useState(false)
  const [shipResult, setShipResult] = useState<ShipResult | null>(null)
  const worldGate = useWorldPublishGate()

  const canSubmit = description.length > 0 && !compose.isStreaming
  const canShip = !!compose.spec && !emitting && !shipPending && !shipResult?.ok
  const preview = draftStrategy(description, compose.partial ?? compose.spec, emit)

  // When the agent lands a StrategySpec, emit → disassemble for the bytecode pane.
  useEffect(() => {
    if (!compose.spec) return
    let cancelled = false
    setEmitting(true)
    setEmit(null)
    void (async () => {
      try {
        const out = await emitProgram(compose.spec)
        if (cancelled) return
        if (!out.ok || !out.programHash) {
          setEmit({
            programHex: '',
            programHash: ZERO_HASH,
            bytecode: [],
            error: out.error ?? 'emit failed',
            detail: out.detail,
          })
        } else {
          setEmit({
            programHex: out.programHex ?? '',
            programHash: out.programHash,
            bytecode: out.bytecode ?? [],
            rulesApplied: out.rulesApplied,
            diff: typeof out.diff === 'string' ? out.diff : undefined,
          })
        }
      } catch (err) {
        if (!cancelled) {
          setEmit({
            programHex: '',
            programHash: ZERO_HASH,
            bytecode: [],
            error: String(err),
          })
        }
      } finally {
        if (!cancelled) setEmitting(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [compose.spec])

  const handleCompile = () => {
    if (!canSubmit) return
    setEmit(null)
    void compose.compose(description)
  }

  // Destructive on-chain write — the explicit confirm step IS the HITL gate (same
  // contract as the drawer's handleShip): first click arms, second click fires.
  // The description ships with it: the agent's described announce stores the post
  // on-chain (StrategyDescribed), so forks read these exact bytes back.
  const handleShip = async () => {
    const spec = compose.spec
    if (!spec || !canShip) {
      setShipConfirming(false)
      return
    }
    if (!shipConfirming) {
      setShipConfirming(true)
      return
    }
    setShipConfirming(false)
    setShipPending(true)
    setShipResult(null)
    try {
      const specObj = {
        specVersion: Number(spec.specVersion ?? 1),
        pair: {
          token0: String(spec.pair?.token0 ?? ''),
          token1: String(spec.pair?.token1 ?? ''),
        },
        size: {
          amount0: String(spec.size?.amount0 ?? ''),
          amount1: String(spec.size?.amount1 ?? ''),
        },
        blocks: Array.isArray(spec.blocks)
          ? (spec.blocks as Array<{ type: string; [k: string]: unknown }>)
          : [],
      }
      // World ID human gate — opens the verify dialog when a proof is needed;
      // the proof then rides to shipStrategy, which re-checks it server-side.
      const gate = await worldGate.require(specObj, description)
      if (!gate.ok) {
        setShipResult({ ok: false, reason: gate.reason ?? 'World ID verification did not complete' })
        return
      }
      const result = await shipStrategy(specObj, { description, worldProof: gate.proof })
      setShipResult(result)
    } catch (err) {
      setShipResult({ ok: false, reason: String(err).slice(0, 200) })
    } finally {
      setShipPending(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-sans font-bold text-[1.5rem] text-wave-text leading-tight">
            {forkAuthor ? `Fork · ${forkAuthor}` : 'Compose'}
          </h1>
          <p className="font-sans text-[14px] text-wave-muted mt-1 max-w-xl">
            The description is the prompt — it ships byte-for-byte to the
            compiler.
          </p>
        </div>
        {forkId && (
          <Link
            href={`/s/${forkId}`}
            className="font-sans text-[13px] font-semibold underline underline-offset-4"
            style={{ color: '#2A9D8F' }}
          >
            View source strategy
          </Link>
        )}
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
        <section
          className="flex flex-col gap-3 min-h-[320px]"
          aria-labelledby="compose-intent-heading"
        >
          <h2
            id="compose-intent-heading"
            className="font-sans font-semibold text-[1rem] text-wave-text"
          >
            Public description
          </h2>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Keep ETH/USDC balanced; halt if Chainlink deviates 1.5%…"
            className="flex-1 min-h-[220px] w-full resize-y rounded-[12px] px-4 py-3 font-sans text-[15px] text-wave-text bg-wave-surface border border-wave-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wave-teal"
            aria-required="true"
            aria-label="Strategy description — also the compiler input"
            spellCheck
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCompile}
              disabled={!canSubmit}
              className="px-5 py-3 rounded-[10px] font-sans text-[15px] font-semibold text-white transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
              style={{ background: LISBOA, minHeight: '48px' }}
              aria-label="Compile description to strategy spec"
            >
              {compose.isStreaming ? 'Compiling…' : 'Compile'}
            </button>
            {compose.isStreaming && (
              <button
                type="button"
                onClick={() => compose.cancel()}
                className="font-sans text-[13px] text-wave-muted underline underline-offset-4"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handleShip}
              disabled={!canShip}
              className="px-5 py-3 rounded-[10px] font-sans text-[15px] font-semibold text-white transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
              style={{
                background: shipConfirming ? '#E5484D' : LISBOA,
                minHeight: '48px',
              }}
              aria-label={
                shipConfirming
                  ? 'Confirm: ship strategy on-chain (destructive)'
                  : 'Ship strategy on-chain'
              }
            >
              {shipPending
                ? 'Shipping…'
                : shipConfirming
                  ? 'Confirm — ship on-chain (cannot be undone)'
                  : 'Ship on-chain'}
            </button>
            <span className="font-mono text-[12px] text-wave-muted ml-auto">
              {description.length} bytes
            </span>
          </div>
          {compose.error && (
            <p className="font-sans text-[13px]" style={{ color: '#E5484D' }} role="alert">
              {compose.error}
            </p>
          )}
          {emit?.error && (
            <p className="font-sans text-[13px]" style={{ color: '#E5484D' }} role="alert">
              Emit: {emit.error}
              {emit.detail ? ` — ${typeof emit.detail === 'string' ? emit.detail : ''}` : ''}
            </p>
          )}
          {emit?.diff && (
            <pre className="font-mono text-[11px] text-wave-muted whitespace-pre-wrap rounded-[8px] p-3 bg-wave-surface border border-wave-border overflow-x-auto">
              {emit.diff}
            </pre>
          )}
        </section>

        <section className="flex flex-col gap-5 min-h-0" aria-label="Compile preview">
          <LiveSpecCard
            spec={compose.partial ?? compose.spec}
            done={!!compose.spec}
          />

          {emitting ? (
            <div className="rounded-[12px] px-5 py-6 bg-wave-surface border border-wave-border">
              <p className="font-sans text-[14px] text-wave-muted">Emitting bytecode…</p>
            </div>
          ) : preview.bytecode.length > 0 ? (
            <BytecodePane strategy={preview} />
          ) : (
            <div className="rounded-[12px] px-5 py-6 bg-wave-surface border border-wave-border">
              <h2 className="font-sans font-semibold text-[1rem] text-wave-text mb-2">
                Bytecode
              </h2>
              <p className="font-sans text-[14px] text-wave-muted">
                Tokenized program appears after a successful compile + emit.
              </p>
            </div>
          )}

          {compose.spec && !emitting ? (
            <SafetyCardDetail strategy={preview} />
          ) : (
            <div className="rounded-[14px] px-6 py-5 bg-wave-surface border border-wave-border">
              <p className="font-sans text-[14px] text-wave-muted">
                Safety card renders after a successful compile.
              </p>
            </div>
          )}

          {/* Post-ship evidence — real receipts from the agent, never fabricated. */}
          {shipPending && (
            <div
              className="rounded-[14px] px-5 py-4 bg-wave-surface border border-wave-border"
              role="status"
              aria-label="Shipping strategy on-chain"
            >
              <p className="font-sans text-[14px] text-wave-muted">
                Shipping on-chain — compile → announce (with the description) → approve →
                ship…
              </p>
            </div>
          )}
          {shipResult && !shipResult.ok && (
            <p
              className="font-sans text-[13px]"
              style={{ color: '#E5484D' }}
              role="alert"
            >
              Ship failed: {shipResult.reason ?? 'unknown error'}
            </p>
          )}
          {shipResult?.ok && (
            <div
              className="rounded-[14px] px-5 py-4 bg-wave-surface border border-wave-border"
              role="status"
              aria-label="Strategy shipped on-chain"
            >
              <p className="font-sans text-[13px] font-bold text-wave-text mb-2">
                Live on-chain
              </p>
              <div className="flex flex-col gap-1">
                {shipResult.shipTxHash && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} style={{ color: '#2A9D8F' }} aria-hidden="true" />
                    <span className="font-mono text-[13px]" style={{ color: '#2A9D8F' }}>
                      ship {shipResult.shipTxHash.slice(0, 10)}…
                      {shipResult.shipTxHash.slice(-4)}
                    </span>
                  </div>
                )}
                {shipResult.announceTxHash && (
                  <span className="font-mono text-[12px] text-wave-muted">
                    announce {shipResult.announceTxHash.slice(0, 10)}…
                    {shipResult.announceTxHash.slice(-4)}
                  </span>
                )}
                {shipResult.handle && (
                  <p className="font-sans text-[14px] text-wave-text">
                    Shipped as {shipResult.handle}
                  </p>
                )}
                {shipResult.programHash && (
                  <p className="font-mono text-[11px] text-wave-muted break-all">
                    program hash {shipResult.programHash.slice(0, 18)}…
                  </p>
                )}
                {shipResult.alreadyDeployed && (
                  <p className="font-sans text-[12px] text-wave-muted">
                    (Already on-chain — no duplicate ship sent.)
                  </p>
                )}
                {shipResult.strategyId && (
                  <Link
                    href={`/s/${shipResult.strategyId}`}
                    className="font-sans text-[13px] font-semibold underline underline-offset-4 mt-1"
                    style={{ color: '#2A9D8F' }}
                  >
                    View strategy →
                  </Link>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
      {worldGate.dialog}
    </div>
  )
}
