'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useComposeStream, type StrategySpec } from '@/hooks/use-compose-stream'
import { BytecodePane } from '@/components/bytecode-pane'
import { SafetyCardDetail } from '@/components/safety-card-detail'
import type { BytecodeInstruction, Strategy } from '@/lib/mock-data'
import { ZERO_HASH } from '@/lib/strategy/format'

const LISBOA =
  'linear-gradient(135deg, #0F3460 0%, #2A9D8F 45%, #26A69A 70%, #FFF3E0 100%)'

interface Props {
  /** Prefill from ?fork= — the author's ENS description, byte-for-byte. */
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
    ensNode: ZERO_HASH,
    status: 'active',
    cumulativeVolumeIn: '0',
    cumulativeVolumeOut: '0',
    swapCount: 0,
    lastSwapTimestamp: 0,
    followerCount: 0,
    authorHandle: 'you',
    description,
    ensProgramHash: hash, // pre-ship: ENS not written yet — match on-chain draft
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

  const canSubmit = description.length > 0 && !compose.isStreaming
  const preview = draftStrategy(description, compose.partial ?? compose.spec, emit)

  // When the agent lands a StrategySpec, emit → disassemble for the bytecode pane.
  useEffect(() => {
    if (!compose.spec) return
    let cancelled = false
    setEmitting(true)
    setEmit(null)
    void (async () => {
      try {
        const res = await fetch('/api/emit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(compose.spec),
        })
        const json = (await res.json()) as EmitResult
        if (cancelled) return
        if (!res.ok) {
          setEmit({
            programHex: '',
            programHash: ZERO_HASH,
            bytecode: [],
            error: json.error ?? `emit HTTP ${res.status}`,
            detail: json.detail,
          })
        } else {
          setEmit(json)
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

  return (
    <div className="flex-1 flex flex-col min-h-0 px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-sans font-bold text-[1.5rem] text-wave-text leading-tight">
            {forkAuthor ? `Fork · ${forkAuthor}` : 'Compose'}
          </h1>
          <p className="font-sans text-[14px] text-wave-muted mt-1 max-w-xl">
            The description is the prompt — it ships byte-for-byte to the
            compiler and the ENS record.
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
        </section>
      </div>
    </div>
  )
}
