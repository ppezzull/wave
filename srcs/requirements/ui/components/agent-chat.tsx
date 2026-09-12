'use client'

// AgentChat — the conversation core of wave's create flow, rendered inside
// the floating CreateDrawer (the ONLY chat surface; /chat is a selector that
// opens this widget over the app).
//
// Flow (unchanged, device-verified): chat input → agent SSE compile
// (useComposeStream) → LiveSpecCard → deterministic emit (emitProgram) →
// InlineSafetyCard + bytecode/diff disclosures → two-click HITL ship with the
// Ledger approval gate (useShipApproval) → PostShipMessage with real receipts.
//
// Presentation: MUI x-chat as the design REFERENCE (not a dependency) —
// message parts (text / collapsible reasoning / result cards / step
// separators), author avatars with consecutive-author grouping, streaming
// status, role="log" polite transcript — all wearing the app's glass tokens
// (.glass-card / .glass-input / .glass-fill in globals.css).
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Send, CheckCircle2, ChevronDown, Sparkles } from 'lucide-react'
import { useDrawer } from './drawer-context'
import { useComposeStream, type StrategySpec } from '@/hooks/use-compose-stream'
import { useSessionUser } from '@/hooks/use-session-user'
import { StreamNotifications } from './stream-notifications'
import { shipStrategy, type ShipResult } from '@/app/actions/ship'
import { useShipApproval, type ShipApproval } from '@/hooks/use-ship-approval'
import { emitProgram, type EmitInstruction } from '@/app/actions/emit'
import { LedgerApprovalPanel } from './ledger/ledger-approval-panel'

const LISBOA =
  'linear-gradient(135deg, #0F3460 0%, #2A9D8F 45%, #26A69A 70%, #FFF3E0 100%)'

interface Message {
  id: string
  role: 'agent' | 'user'
  content: string
  timestamp: string
  type?: 'safety-card' | 'ship-button' | 'post-ship' | 'approval' | 'text'
}

const DEFAULT_MESSAGES: Message[] = [
  {
    id: 'a1',
    role: 'agent',
    content:
      "Describe your trading strategy in plain English. I'll compile it, check it for safety, and ship it on-chain.",
    timestamp: '2:14 PM',
    type: 'text',
  },
  {
    id: 'u1',
    role: 'user',
    content:
      'ETH/USDC momentum: buy when 4h RSI crosses 55 from below, sell when it crosses 45 from above. Hard stop at 3% drawdown.',
    timestamp: '2:15 PM',
    type: 'text',
  },
  {
    id: 'a2',
    role: 'agent',
    content: 'Compiling... Checking safety constraints.',
    timestamp: '2:15 PM',
    type: 'text',
  },
  {
    id: 'a3',
    role: 'agent',
    content: '',
    timestamp: '2:15 PM',
    type: 'safety-card',
  },
  {
    id: 'a4',
    role: 'agent',
    content: 'Strategy is safe. Ready to ship on-chain. Confirm?',
    timestamp: '2:16 PM',
    type: 'text',
  },
  {
    id: 'a5',
    role: 'agent',
    content: '',
    timestamp: '2:16 PM',
    type: 'ship-button',
  },
]

/** The wave agent — gradient avatar shown on the first message of each
 *  consecutive agent run (MUI ChatMessageGroup). */
function AgentAvatar() {
  return (
    <span
      className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full mt-0.5"
      style={{ background: 'linear-gradient(135deg, #2A9D8F, #0F3460)' }}
      aria-hidden="true"
    >
      <Sparkles size={13} style={{ color: '#FFF3E0' }} />
    </span>
  )
}

/** Session-wallet initials chip on user messages. */
function UserAvatar({ address }: { address?: string }) {
  const initials = address ? address.slice(2, 4).toUpperCase() : 'ME'
  return (
    <span
      className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full mt-0.5 font-mono text-[10px] font-bold"
      style={{
        background: 'var(--glass-fill)',
        border: '1px solid var(--glass-hairline)',
        color: '#2A9D8F',
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}

/** Collapsible reasoning part (MUI's reasoning part) — auto-opens while the
 *  model streams, stays collapsed afterwards; the live tail of the agent's
 *  own words, never a fabricated status. */
function ThinkingBlock({ progress, streaming }: { progress: string; streaming: boolean }) {
  const [open, setOpen] = useState(true)
  useEffect(() => {
    if (streaming) setOpen(true)
  }, [streaming])
  const tail = progress.replace(/\s+/g, ' ').trim().slice(-260)
  return (
    <div className="max-w-[85%] self-start rounded-[12px] glass-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 select-none"
        aria-expanded={open}
        aria-label={streaming ? 'Agent is thinking (live)' : 'Agent reasoning'}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background: '#2A9D8F',
            animation: streaming ? 'wave-pulse 1.1s ease-in-out infinite' : undefined,
          }}
          aria-hidden="true"
        />
        <span className="font-sans text-[12px] font-semibold text-wave-muted">
          {streaming ? 'Thinking…' : 'Thought process'}
        </span>
        <ChevronDown
          size={14}
          className={`ml-auto text-wave-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && tail && (
        <p className="px-3.5 pb-3 font-sans text-[12px] text-wave-muted leading-relaxed break-words">
          {tail}
        </p>
      )}
    </div>
  )
}

/** Hairline step separator between intent → compile → result (MUI step-start). */
function StepSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 py-0.5" aria-hidden="true">
      <span className="flex-1 h-px" style={{ background: 'var(--glass-hairline)' }} />
      <span className="font-sans text-[10px] uppercase tracking-[0.14em] text-wave-muted">
        {label}
      </span>
      <span className="flex-1 h-px" style={{ background: 'var(--glass-hairline)' }} />
    </div>
  )
}

/**
 * Compile-time safety card. Renders the REAL deterministic-compiler output (programHash,
 * emitted-byte count, applied rule rewrites, canonicalization) via the emitProgram action — no
 * hardcoded "SAFE". The programHash is byte-exact: it is the value the on-chain program
 * carries, so it is the actual tamper-check root. Includes the tokenized program and the
 * canonicalization diff as collapsed disclosures.
 *
 * Honest label: this is COMPILE-TIME verification (Zod→canonical→IR→bytecode + rule
 * rewrites), not the full quote-grid settle simulation (both directions, monotonicity,
 * split-vs-single, etc.) which is out of scope for the event demo. The card says what it
 * proved, nothing more.
 */
function InlineSafetyCard({ emit }: {
  emit: {
    programHash?: string
    bytes?: number
    rulesApplied?: number
    canonicalized?: boolean
    bytecode?: EmitInstruction[]
    diff?: string
    error?: string
  } | null
}) {
  if (emit?.error) {
    return (
      <div
        className="animate-safety-reveal rounded-[14px] p-4 text-white glass-card"
        style={{ background: 'rgba(176, 52, 31, 0.88)' }}
        role="status"
        aria-label="Strategy compile failed"
      >
        <p className="font-sans text-[15px] font-bold mb-1">Compile rejected</p>
        <p className="font-mono text-[11px] text-white/80 break-all">{emit.error}</p>
      </div>
    )
  }
  const shortHash = emit?.programHash ? `${emit.programHash.slice(0, 10)}…${emit.programHash.slice(-4)}` : '…'
  return (
    <div
      className="animate-safety-reveal rounded-[14px] p-4 text-white glass-card"
      style={{ background: 'rgba(31, 157, 107, 0.88)' }}
      role="status"
      aria-label="Strategy compiled — deterministic bytecode verified"
    >
      <p className="font-sans text-[15px] font-bold mb-3">Compiled · bytecode verified</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'program hash', value: shortHash },
          { label: 'emitted bytes', value: emit?.bytes != null ? String(emit.bytes) : '…' },
          { label: 'rule rewrites', value: emit?.rulesApplied != null ? String(emit.rulesApplied) : '…' },
          { label: 'canonicalized', value: emit?.canonicalized == null ? '…' : emit.canonicalized ? 'yes' : 'no' },
        ].map((m) => (
          <div key={m.label}>
            <p className="font-sans text-[11px] text-white/70 mb-0.5">
              {m.label}
            </p>
            <p className="font-mono font-bold text-[0.95rem] text-white">
              {m.value}
            </p>
          </div>
        ))}
      </div>
      {(emit?.bytecode?.length || emit?.diff) && (
        <div className="mt-3 flex flex-col gap-2">
          {emit?.bytecode?.length ? (
            <details className="rounded-[8px] bg-white/10">
              <summary className="cursor-pointer px-3 py-2 font-sans text-[11px] text-white/85 select-none">
                Tokenized program ({emit.bytecode.length} instruction{emit.bytecode.length === 1 ? '' : 's'})
              </summary>
              <div className="overflow-x-auto px-3 pb-2">
                <table className="w-full border-collapse font-mono text-[11px]">
                  <tbody>
                    {emit.bytecode.map((instr, i) => (
                      <tr key={i} className="align-baseline">
                        <td className="pr-3 py-0.5 text-white/90">{instr.opcode}</td>
                        <td className="pr-3 py-0.5 text-white/60">{instr.length}</td>
                        <td className="py-0.5 text-white/60 break-all">{instr.args}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
          {emit?.diff ? (
            <details className="rounded-[8px] bg-white/10">
              <summary className="cursor-pointer px-3 py-2 font-sans text-[11px] text-white/85 select-none">
                Canonicalization diff
              </summary>
              <pre className="px-3 pb-2 font-mono text-[10px] text-white/70 whitespace-pre-wrap">
                {emit.diff}
              </pre>
            </details>
          ) : null}
        </div>
      )}
      <p className="font-sans text-[10px] text-white/60 mt-3">
        Deterministic compile (Zod → canonical → IR → bytecode). Quote-grid settle sim not run.
      </p>
    </div>
  )
}

function PostShipMessage({ result }: { result: ShipResult | null }) {
  // Real on-chain evidence from the agent shipStrategy action. Falls back to a neutral
  // line only when no result is present (e.g. a stale shipped flag) — never a fake tx hash.
  if (!result || !result.ok) {
    return (
      <p className="font-sans text-[14px] text-wave-muted">
        Shipped. (No receipt returned.)
      </p>
    )
  }
  const shortHash = (h?: string) => (h ? `${h.slice(0, 10)}…${h.slice(-4)}` : null)
  const ship = shortHash(result.shipTxHash)
  const announce = shortHash(result.announceTxHash)
  return (
    <div className="flex flex-col gap-1">
      {ship && (
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} style={{ color: '#2A9D8F' }} aria-hidden="true" />
          <span className="font-mono text-[13px]" style={{ color: '#2A9D8F' }}>
            ship {ship}
          </span>
        </div>
      )}
      {announce && (
        <span className="font-mono text-[12px] text-wave-muted">announce {announce}</span>
      )}
      {result.handle && (
        <p className="font-sans text-[14px] text-wave-text">Shipped as {result.handle}</p>
      )}
      {result.programHash && (
        <p className="font-mono text-[11px] text-wave-muted break-all">
          program hash {result.programHash.slice(0, 18)}…
        </p>
      )}
      {result.alreadyDeployed && (
        <p className="font-sans text-[12px] text-wave-muted">
          (Already on-chain — no duplicate ship sent.)
        </p>
      )}
      {result.strategyId && (
        <Link
          href={`/s/${result.strategyId}`}
          className="font-sans text-[13px] font-semibold underline underline-offset-4 mt-1"
          style={{ color: '#2A9D8F' }}
        >
          View strategy →
        </Link>
      )}
    </div>
  )
}

function ApprovalButtons() {
  const [decision, setDecision] = useState<'approve' | 'deny' | null>(null)
  return (
    <div className="flex gap-2 mt-1">
      <button
        onClick={() => setDecision('approve')}
        className="glass-btn px-4 py-2 rounded-lg font-sans text-[14px] font-semibold min-h-[40px]"
        style={{
          color: decision === 'approve' ? '#000000' : '#2A9D8F',
          background: decision === 'approve' ? '#2A9D8F' : undefined,
        }}
        aria-label="Approve strategy pause"
      >
        Approve
      </button>
      <button
        onClick={() => setDecision('deny')}
        className="glass-btn px-4 py-2 rounded-lg font-sans text-[14px] font-semibold min-h-[40px]"
        style={{
          color: decision === 'deny' ? '#ffffff' : '#E5484D',
          background: decision === 'deny' ? '#E5484D' : undefined,
        }}
        aria-label="Deny strategy pause"
      >
        Deny
      </button>
    </div>
  )
}

// Live compose beat: render the StrategySpec as it streams in (the "watch the AI
// fill the form" affordance). Fields that haven't arrived yet render as muted
// placeholders — never invented. `partial` is incomplete by design until `spec`.
function LiveSpecCard({ spec, done }: { spec: StrategySpec | null; done: boolean }) {
  const pair = spec?.pair
  const size = spec?.size
  const blocks = spec?.blocks ?? []
  const token0 = pair?.token0
  const token1 = pair?.token1
  // Truncate 0x addresses for readability; placeholder when absent.
  const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—')
  return (
    <div
      className="rounded-[14px] p-4 glass-card"
      role="status"
      aria-label={done ? 'Strategy spec compiled' : 'Strategy spec compiling'}
    >
      <p className="font-sans text-[13px] font-bold text-wave-text mb-3">
        {done ? 'Compiled spec' : 'Compiling spec…'}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[12px]">
        <div className="text-wave-muted">token0</div>
        <div className="text-wave-text truncate">{short(token0)}</div>
        <div className="text-wave-muted">token1</div>
        <div className="text-wave-text truncate">{short(token1)}</div>
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

// One turn of the live compose conversation.
interface LiveMessage {
  id: string
  role: 'agent' | 'user'
  // text bubble OR a live spec card (progressive) OR the safety card + ship CTA.
  content?: string
  kind?: 'text' | 'spec' | 'ship'
  /** Persisted on the terminal spec message: the final compiled spec, so a
   * look-back after the stream state is gone still renders the real card. */
  spec?: StrategySpec
  /** Persisted on the terminal ship message: the real on-chain receipt. */
  receipt?: ShipResult
}

const LIVE_CHAT_MESSAGES_KEY = 'wave:chat:messages:v1'
const LIVE_CHAT_COMPOSE_KEY = 'wave:chat:compose:v1'

function readLiveMessages(): LiveMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const value = JSON.parse(window.localStorage.getItem(LIVE_CHAT_MESSAGES_KEY) ?? '[]') as unknown
    if (!Array.isArray(value)) return []
    return value.filter(
      (message): message is LiveMessage =>
        Boolean(message) &&
        typeof message === 'object' &&
        typeof (message as LiveMessage).id === 'string' &&
        ((message as LiveMessage).role === 'agent' || (message as LiveMessage).role === 'user') &&
        (message as LiveMessage).kind !== undefined,
    )
  } catch {
    return []
  }
}

// The ship-time description fallback: the last user text bubble of the persisted
// thread — the exact intent bytes the agent compiled (a reload clears `lastIntent`
// but restores the thread, and Ship must stay reachable with the post attached).
function lastUserText(messages: LiveMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role === 'user' && message.kind === 'text' && typeof message.content === 'string') {
      return message.content
    }
  }
  return ''
}

/** Thread-replay card — the REAL on-chain row for an already-shipped strategy
 * (subgraph: programHash, status, committed, fills). Replaces the old replay's
 * placeholder '…' card: looking back at a thread shows live data, never blanks. */
function ReplayStrategyCard({ strategy }: { strategy: import('@/lib/mock-data').Strategy }) {
  const shortHash = strategy.programHash
    ? `${strategy.programHash.slice(0, 10)}…${strategy.programHash.slice(-4)}`
    : '—'
  const committed = strategy.committedCapital
    ? `${(Number(strategy.committedCapital) / 1e18).toFixed(1)} (token units)`
    : '0'
  return (
    <div
      className="animate-safety-reveal rounded-[14px] p-4 text-white glass-card"
      style={{ background: 'rgba(31, 157, 107, 0.88)' }}
      role="status"
      aria-label="Strategy shipped on-chain"
    >
      <p className="font-sans text-[15px] font-bold mb-3">Shipped · on-chain</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'program hash', value: shortHash },
          { label: 'status', value: strategy.status },
          { label: 'committed', value: committed },
          { label: 'fills', value: String(strategy.swapCount ?? 0) },
        ].map((m) => (
          <div key={m.label}>
            <p className="font-sans text-[11px] text-white/70 mb-0.5">{m.label}</p>
            <p className="font-mono font-bold text-[0.95rem] text-white">{m.value}</p>
          </div>
        ))}
      </div>
      <Link
        href={`/s/${strategy.id}`}
        className="inline-block font-sans text-[12px] font-semibold underline underline-offset-4 mt-3 text-white"
      >
        View strategy →
      </Link>
    </div>
  )
}

export interface AgentChatProps {
  useMock?: boolean
}

export function AgentChat({ useMock = false }: AgentChatProps) {
  const { state, consumePrefill } = useDrawer()
  const { agentStrategy, prefill } = state
  // The session wallet rides the ship opts as `author` — the agent attributes the
  // strategy on-chain (factory attribute) so it lands on the user's profile. No
  // wallet → unattributed ship (ZERO sentinel), never fabricated.
  const { sessionUser } = useSessionUser()
  const { obtainApproval, ledgerPhase, ledgerReason, ledgerDebug, resetLedger } = useShipApproval()

  const [inputValue, setInputValue] = useState('')
  // The last sent intent, kept for the ship step: it is the description (the post)
  // the agent announces on-chain as StrategyDescribed. inputValue is cleared on send.
  const [lastIntent, setLastIntent] = useState('')
  // Ship flow states: idle → confirming (HITL gate) → shipping → done|error.
  // `shipped` is kept for the existing PostShipMessage branch; `shipResult` carries the
  // real on-chain evidence (tx hashes, handle, programHash) returned by the agent.
  const [shipped, setShipped] = useState(false)
  const [shipPending, setShipPending] = useState(false)
  const [shipConfirming, setShipConfirming] = useState(false)
  const [shipResult, setShipResult] = useState<ShipResult | null>(null)
  // Real compiler output for the safety card — via the emitProgram action (spawns the wave-compiler
  // CLI: canonicalize → resolveRejections → lower → emit → disassemble). Includes the
  // tokenized program + canonicalization diff for the collapsed disclosures.
  const [emit, setEmit] = useState<{
    programHash?: string
    bytes?: number
    rulesApplied?: number
    canonicalized?: boolean
    bytecode?: EmitInstruction[]
    diff?: string
    error?: string
  } | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  // Live compose stream (live mode only). Mock mode replays DEFAULT_MESSAGES.
  const compose = useComposeStream(LIVE_CHAT_COMPOSE_KEY)
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>(readLiveMessages)

  // Fork prefill (drawer-context seam): byte-for-byte into the input, consumed once.
  // StrictMode double-run no-ops — consumePrefill clears the context value.
  useEffect(() => {
    if (prefill !== undefined) {
      setInputValue(prefill)
      consumePrefill()
    }
  }, [prefill, consumePrefill])

  // Chat history is deliberately local-only: no conversation data is written
  // to the app backend, chain, or subgraph. Refreshing the page restores
  // the local draft/conversation and its last completed StrategySpec.
  useEffect(() => {
    try {
      window.localStorage.setItem(LIVE_CHAT_MESSAGES_KEY, JSON.stringify(liveMessages))
    } catch {
      // Storage is optional; the live chat remains usable when unavailable.
    }
  }, [liveMessages])

  // When the spec finalizes, run the deterministic compiler (emitProgram action) to surface
  // the REAL programHash + emitted-byte count + applied rules in the safety card. A NEW
  // spec also voids any previous ship result — without this a second compose would show
  // a stale PostShipMessage with no ship button (compose-screen's fix, ported).
  useEffect(() => {
    if (useMock || !compose.spec) return
    const spec = compose.spec
    let cancelled = false
    setEmit(null)
    setShipped(false)
    setShipResult(null)
    ;(async () => {
      try {
        const out = await emitProgram({
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
        })
        if (cancelled) return
        if (!out.ok) {
          setEmit({ error: out.error ?? 'compile failed' })
        } else {
          setEmit({
            programHash: out.programHash,
            bytes: Array.isArray(out.bytecode) ? out.bytecode.length : undefined,
            rulesApplied: Array.isArray(out.rulesApplied) ? out.rulesApplied.length : undefined,
            canonicalized: out.canonicalized,
            bytecode: Array.isArray(out.bytecode) ? out.bytecode : [],
            diff: typeof out.diff === 'string' ? out.diff : undefined,
          })
        }
      } catch (err) {
        if (!cancelled) setEmit({ error: String(err).slice(0, 160) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [useMock, compose.spec])

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [liveMessages, compose.spec, compose.partial, shipped, agentStrategy])

  // An existing pool agent conversation replays the exchange that produced
  // that strategy — reusing the same message primitives (safety card, ship).
  const agentMessages: Message[] | null = agentStrategy
    ? [
        {
          id: 'ag-a1',
          role: 'agent',
          content:
            "Describe your trading strategy in plain English. I'll compile it, check it for safety, and ship it on-chain.",
          timestamp: '2:14 PM',
          type: 'text',
        },
        {
          id: 'ag-u1',
          role: 'user',
          content: agentStrategy.description,
          timestamp: '2:15 PM',
          type: 'text',
        },
        {
          id: 'ag-a2',
          role: 'agent',
          content: 'Compiling... Checking safety constraints.',
          timestamp: '2:15 PM',
          type: 'text',
        },
        {
          id: 'ag-a3',
          role: 'agent',
          content: '',
          timestamp: '2:15 PM',
          type: 'safety-card',
        },
        {
          id: 'ag-a4',
          role: 'agent',
          content: `Shipped as ${agentStrategy.authorHandle}. It's live on-chain and taking swaps.`,
          timestamp: '2:16 PM',
          type: 'text',
        },
      ]
    : null

  // Canned mock/demo messages. Empty in live mode (no agent replay) so the
  // live compose thread owns the panel; the live branch below renders it.
  const messages: Message[] = !useMock && !agentStrategy
    ? []
    : agentMessages ?? DEFAULT_MESSAGES

  // Ship is a destructive on-chain write. The HITL gate is the explicit confirm step:
  // the first click arms (shipConfirming), the second click fires the agent shipStrategy
  // action. The approval (Ledger device or session wallet) is obtained inside the
  // confirming click — the WebHID gesture requirement.
  const handleShip = async () => {
    // Stage 1 — arm the confirm gate (the destructive-op HITL approval).
    if (!shipConfirming) {
      setShipConfirming(true)
      setShipResult(null)
      resetLedger()
      return
    }
    // Stage 2 — confirmed. Forward the finalized spec to the agent; the agent re-derives
    // bytes/hashes, so nothing client-supplied can misreport the on-chain program.
    const spec = compose.spec
    if (!spec) {
      setShipConfirming(false)
      return
    }
    setShipConfirming(false)
    setShipPending(true)
    setShipResult(null)
    // try/finally wraps EVERYTHING after setShipPending — an approval refusal must
    // not strand the button on "Shipping…" (drawer's old early-return bug, fixed here).
    try {
      // The post: the exact intent bytes the compiler consumed — the agent's described
      // announce stores them on-chain (StrategyDescribed). The thread outlives a reload
      // (localStorage) but `lastIntent` is in-memory only, so fall back to the persisted
      // user message — the same bytes, re-read.
      const description = lastIntent || lastUserText(liveMessages)
      // Ship opts: the post (description) + the author (session wallet, if connected).
      // Both are optional — the agent re-validates and degrades honestly without them.
      const shipOpts: { description?: string; author?: string; approval?: ShipApproval } = {}
      if (description) shipOpts.description = description
      if (sessionUser) shipOpts.author = sessionUser.address
      // Approval gate (Ledger Continuity) — inside this click (WebHID gesture).
      // Refusal/cancel → honest no-ship; nothing is sent to the agent.
      const approval = await obtainApproval(
        {
          specVersion: Number(spec.specVersion ?? 1),
          pair: { token0: String(spec.pair?.token0 ?? ''), token1: String(spec.pair?.token1 ?? '') },
          size: {
            amount0: String(spec.size?.amount0 ?? ''),
            amount1: String(spec.size?.amount1 ?? ''),
          },
          blocks: Array.isArray(spec.blocks) ? spec.blocks : [],
        },
        description ?? '',
        sessionUser?.address,
      )
      if (!approval.ok) {
        setShipResult({ ok: false, reason: approval.reason ?? 'Approval not granted — nothing was shipped.' })
        return
      }
      shipOpts.approval = approval.approval
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
      const result = await shipStrategy(
        specObj,
        shipOpts,
      )
      setShipResult(result)
      if (result.ok) {
        setShipped(true)
        // Persist the COMPLETED conversation for look-back: the terminal
        // thread embeds the final spec and the real receipt, so reloading the
        // chat shows the full exchange with live data — never empty cards.
        // Only the STREAM draft key is cleared (a reload must not resurrect
        // a zombie compose state); the messages key is rewritten, not removed.
        const finalThread: LiveMessage[] = [
          { id: `u-ship-${Date.now()}`, role: 'user', kind: 'text', content: description || lastUserText(liveMessages) },
          { id: `a-compile-${Date.now()}`, role: 'agent', kind: 'text', content: 'Compiling…' },
          { id: `a-spec-${Date.now()}`, role: 'agent', kind: 'spec', spec },
          { id: `a-ship-${Date.now()}`, role: 'agent', kind: 'ship', receipt: result },
        ]
        setLiveMessages(finalThread)
        try {
          window.localStorage.removeItem(LIVE_CHAT_COMPOSE_KEY)
          window.localStorage.setItem(LIVE_CHAT_MESSAGES_KEY, JSON.stringify(finalThread))
        } catch {
          // Storage optional.
        }
      }
    } catch (err) {
      setShipResult({ ok: false, reason: String(err).slice(0, 200) })
    } finally {
      setShipPending(false)
    }
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    // Byte-for-byte: do not trim — description IS the compiler input.
    const intent = inputValue
    setInputValue('')
    setLastIntent(intent)
    // Mock mode: the canned demo conversation is already on screen; sending is
    // a no-op (the input is decorative in the mock). Live mode: drive the real
    // compose stream — the agent parses the intent to a bounded StrategySpec.
    if (useMock || intent.length === 0) return
    setLiveMessages([
      { id: `u-${Date.now()}`, role: 'user', kind: 'text', content: intent },
      { id: `a-compile-${Date.now()}`, role: 'agent', kind: 'text', content: 'Compiling…' },
      { id: `a-spec-${Date.now()}`, role: 'agent', kind: 'spec' },
    ])
    void compose.compose(intent)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault()
      handleSend(e as unknown as React.FormEvent)
    }
  }

  // Author grouping (MUI ChatMessageGroup): avatar only on the first message
  // of a consecutive same-author run.
  const grouped = (list: Array<{ role?: string }>, i: number, role: 'agent' | 'user') =>
    list[i]?.role === role && list[i - 1]?.role !== role

  return (
    <div
      className="flex flex-col flex-1 min-h-0"
      aria-label="wave agent chat"
    >
      <div className="px-3 pt-3 shrink-0">
        <StreamNotifications enabled={!useMock} />
      </div>

      {/* Transcript — a polite log (MUI pattern): screen readers hear stream
          start/end once, not per token. */}
      <div
        ref={threadRef}
        className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2.5"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        <span className="sr-only" role="status">
          {compose.isStreaming ? 'Assistant is responding' : undefined}
        </span>

        {messages.map((msg, i) => {
          const isAgent = msg.role === 'agent'
          const firstOfGroup = grouped(messages, i, msg.role)

          if (msg.type === 'safety-card') {
            return (
              <div key={msg.id} className={`flex gap-2.5 max-w-[85%] ${isAgent ? 'self-start' : 'self-end'}`}>
                {firstOfGroup ? <AgentAvatar /> : <span className="w-7 shrink-0" aria-hidden="true" />}
                <div className="flex flex-col min-w-0">
                  {/* Replay of a real strategy → its REAL on-chain row; the mock
                      demo keeps the (by-design canned) placeholder card. */}
                  {agentStrategy ? (
                    <ReplayStrategyCard strategy={agentStrategy} />
                  ) : (
                    <InlineSafetyCard emit={null} />
                  )}
                  <p className="font-sans text-[11px] text-wave-muted mt-1">
                    {msg.timestamp}
                  </p>
                </div>
              </div>
            )
          }

          if (msg.type === 'ship-button') {
            return (
              <div key={msg.id} className="w-full pl-9.5" style={{ paddingLeft: 40 }}>
                {shipped ? (
                  <PostShipMessage result={null} />
                ) : (
                  <button
                    onClick={handleShip}
                    className="w-full py-3.5 font-sans text-[15px] font-semibold text-white rounded-[10px] transition-all duration-[220ms] hover:brightness-110 hover:scale-[1.005] active:scale-[0.995]"
                    style={{ background: LISBOA, minHeight: '52px' }}
                    aria-label="Confirm and ship strategy on-chain"
                  >
                    Ship on-chain
                  </button>
                )}
              </div>
            )
          }

          return (
            <div
              key={msg.id}
              className={`flex gap-2.5 max-w-[85%] ${isAgent ? 'self-start' : 'self-end flex-row-reverse'}`}
            >
              {firstOfGroup ? (
                isAgent ? <AgentAvatar /> : <UserAvatar address={sessionUser?.address} />
              ) : (
                <span className="w-7 shrink-0" aria-hidden="true" />
              )}
              <div className="flex flex-col min-w-0">
                <div
                  className={`px-4 py-3 font-sans text-[14px] text-wave-text leading-relaxed ${
                    isAgent ? 'glass-card rounded-[14px]' : 'rounded-[14px]'
                  }`}
                  style={
                    isAgent
                      ? { borderRadius: '4px 14px 14px 14px' }
                      : {
                          background: 'rgba(42,157,143,0.18)',
                          border: '1px solid var(--glass-hairline)',
                          backdropFilter: 'blur(8px)',
                          borderRadius: '14px 4px 14px 14px',
                        }
                  }
                >
                  {msg.content}
                </div>
                <span
                  className={`font-sans text-[11px] text-wave-muted mt-0.5 ${
                    isAgent ? '' : 'text-right'
                  }`}
                >
                  {msg.timestamp}
                </span>
              </div>
            </div>
          )
        })}

        {/* Live compose stream (live mode only). Mock mode uses the canned
            messages above + the HITL approval demo below. */}
        {!useMock && !agentStrategy && liveMessages.length === 0 && (
          <div className="flex gap-2.5 self-start">
            <AgentAvatar />
            <div
              className="px-4 py-3 font-sans text-[14px] text-wave-text leading-relaxed glass-card"
              style={{ borderRadius: '4px 14px 14px 14px' }}
            >
              Describe your trading strategy in plain English. I&apos;ll compile
              it to a bounded spec, check it for safety, and ship it on-chain.
            </div>
          </div>
        )}
        {!useMock && liveMessages.map((msg, i) => {
          const isAgent = msg.role === 'agent'
          const firstOfGroup = grouped(liveMessages, i, msg.role)
          // The "Compiling…" bubble becomes the live reasoning part while the
          // model streams (MUI reasoning part) — its own collapsible block,
          // not a frozen word inside a bubble.
          const isCompileBubble = isAgent && msg.kind === 'text' && msg.id.startsWith('a-compile-')
          if (isCompileBubble) {
            return (
              <div key={msg.id} className="flex gap-2.5 self-start w-[85%]">
                {firstOfGroup ? <AgentAvatar /> : <span className="w-7 shrink-0" aria-hidden="true" />}
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                  {compose.isStreaming && compose.progress ? (
                    <ThinkingBlock progress={compose.progress} streaming />
                  ) : null}
                  {!compose.isStreaming && (
                    <StepSeparator label="compiling" />
                  )}
                </div>
              </div>
            )
          }
          if (msg.kind === 'spec') {
            // Look-back: the terminal spec message carries the final spec
            // (persisted), so the card renders REAL data even after the
            // stream state is gone — never placeholder dashes.
            const specForCard = msg.spec ?? compose.partial ?? compose.spec
            return (
              <div key={msg.id} className="flex gap-2.5 self-start w-[85%]">
                <span className="w-7 shrink-0" aria-hidden="true" />
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                  <LiveSpecCard spec={specForCard} done={!!compose.spec || !!msg.spec} />
                  {compose.isStreaming && (
                    <p className="font-sans text-[11px] text-wave-muted">
                      filling the form…
                    </p>
                  )}
                </div>
              </div>
            )
          }
          if (msg.kind === 'ship' && msg.receipt) {
            return (
              <div key={msg.id} className="flex gap-2.5 self-start w-[85%]">
                <span className="w-7 shrink-0" aria-hidden="true" />
                <div className="flex flex-col gap-1 min-w-0 flex-1 glass-card rounded-[14px] px-4 py-3" style={{ borderRadius: '4px 14px 14px 14px' }}>
                  <p className="font-sans text-[13px] font-semibold text-wave-text">
                    Live on-chain
                  </p>
                  <PostShipMessage result={msg.receipt} />
                </div>
              </div>
            )
          }
          return (
            <div
              key={msg.id}
              className={`flex gap-2.5 max-w-[85%] ${isAgent ? 'self-start' : 'self-end flex-row-reverse'}`}
            >
              {firstOfGroup ? (
                isAgent ? <AgentAvatar /> : <UserAvatar address={sessionUser?.address} />
              ) : (
                <span className="w-7 shrink-0" aria-hidden="true" />
              )}
              <div
                className={`px-4 py-3 font-sans text-[14px] text-wave-text leading-relaxed ${
                  isAgent ? 'glass-card' : ''
                }`}
                style={
                  isAgent
                    ? { borderRadius: '4px 14px 14px 14px' }
                    : {
                        background: 'rgba(42,157,143,0.18)',
                        border: '1px solid var(--glass-hairline)',
                        backdropFilter: 'blur(8px)',
                        borderRadius: '14px 4px 14px 14px',
                      }
                }
              >
                {msg.content}
              </div>
            </div>
          )
        })}

        {/* Live: once the spec lands, show the safety card + ship CTA (the
            compiled spec IS the form the agent filled; ship is the demo beat).
            Suppressed once a terminal ship message exists — the persisted
            receipt takes over (no duplicate ship card on look-back). */}
        {!useMock && compose.spec && !liveMessages.some((m) => m.kind === 'ship') && (
          <>
            <div className="flex gap-2.5 self-start w-[85%]">
              <span className="w-7 shrink-0" aria-hidden="true" />
              <div className="flex flex-col gap-2 min-w-0 flex-1">
                <InlineSafetyCard emit={emit} />
              </div>
            </div>
            {compose.error ? (
              <p className="font-sans text-[13px]" style={{ color: '#E5484D' }}>
                {compose.error}
              </p>
            ) : (
              <div className="w-full flex flex-col gap-2" style={{ paddingLeft: 40 }}>
                {shipped ? (
                  <PostShipMessage result={shipResult} />
                ) : shipPending ? (
                  <div
                    className="w-full py-3.5 font-sans text-[15px] font-semibold text-white rounded-[10px] flex items-center justify-center gap-2"
                    style={{ background: LISBOA, minHeight: '52px' }}
                    aria-live="polite"
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ background: '#fff', animation: 'wave-pulse 1.1s ease-in-out infinite' }}
                      aria-hidden="true"
                    />
                    Shipping on Sepolia…
                  </div>
                ) : (
                  <button
                    onClick={handleShip}
                    className="w-full py-3.5 font-sans text-[15px] font-semibold text-white rounded-[10px] transition-all duration-[220ms] hover:brightness-110 hover:scale-[1.005] active:scale-[0.995]"
                    style={{
                      background: shipConfirming ? '#E5484D' : LISBOA,
                      minHeight: '52px',
                    }}
                    aria-label={
                      shipConfirming ? 'Confirm: ship strategy on-chain (destructive)' : 'Ship strategy on-chain'
                    }
                  >
                    {shipConfirming ? 'Confirm — ship on-chain (cannot be undone)' : 'Ship on-chain'}
                  </button>
                )}
                {shipResult && !shipResult.ok && shipResult.reason && (
                  <p className="font-sans text-[12px]" style={{ color: '#E5484D' }}>
                    {shipResult.reason}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* Live: surface a compose error with no spec (e.g. agent unreachable). */}
        {!useMock && !compose.spec && compose.error && (
          <p className="font-sans text-[13px] self-start" style={{ color: '#E5484D' }}>
            {compose.error}
          </p>
        )}

        {/* Human-in-the-loop approval scenario (mock demo only — not shown when
            replaying an already-shipped pool agent conversation, or in live mode
            where the compose stream owns the thread). */}
        {useMock && !agentStrategy && (
          <div className="flex gap-2.5 self-start">
            <span className="w-7 shrink-0" aria-hidden="true" />
            <div className="flex flex-col min-w-0">
              <div
                className="px-4 py-3 font-sans text-[14px] text-wave-text leading-relaxed glass-card"
                style={{ borderRadius: '4px 14px 14px 14px' }}
              >
                {"This strategy's oracle has been stale for 4h. I want to pause execution. Approve?"}
              </div>
              <ApprovalButtons />
              <span className="font-sans text-[11px] text-wave-muted mt-1.5">
                2:17 PM
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Ledger device phases — the only status surface for the hardware gate. */}
      {(ledgerPhase !== 'idle' || ledgerReason) && (
        <div className="px-3 shrink-0">
          <LedgerApprovalPanel phase={ledgerPhase} reason={ledgerReason} debug={ledgerDebug} />
        </div>
      )}

      {/* Input — glass pill */}
      <div className="shrink-0 px-3 py-3" style={{ borderTop: '1px solid var(--glass-hairline)' }}>
        <form
          onSubmit={handleSend}
          className="flex items-center gap-1 rounded-[12px] pl-4 pr-1.5 py-1.5 glass-input"
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="describe your strategy..."
            className="flex-1 min-w-0 font-sans text-[14px] bg-transparent outline-none placeholder:text-wave-muted placeholder:italic text-wave-text"
            aria-label="Strategy description input"
          />
          <button
            type="submit"
            className="w-9 h-9 flex items-center justify-center text-white rounded-[9px] transition-all duration-150 hover:brightness-110 shrink-0"
            style={{ background: LISBOA }}
            aria-label="Send message"
          >
            <Send size={15} aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  )
}

export { LIVE_CHAT_MESSAGES_KEY, LIVE_CHAT_COMPOSE_KEY }
