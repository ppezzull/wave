'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Send, CheckCircle2, Minus, GripHorizontal, MessageSquare } from 'lucide-react'
import { useDrawer } from './drawer-context'
import { useComposeStream, type StrategySpec } from '@/hooks/use-compose-stream'
import { StreamNotifications } from './stream-notifications'
import { shipStrategy, type ShipResult } from '@/app/actions/ship'

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

/**
 * Compile-time safety card. Renders the REAL deterministic-compiler output (programHash,
 * emitted-byte count, applied rule rewrites, canonicalization) fetched via /api/emit — no
 * hardcoded "SAFE". The programHash is byte-exact: it is the value the on-chain program
 * carries, so it is the actual tamper-check root.
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
    error?: string
  } | null
}) {
  if (emit?.error) {
    return (
      <div
        className="animate-safety-reveal rounded-[14px] p-4 text-white"
        style={{ background: '#B0341F' }}
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
      className="animate-safety-reveal rounded-[14px] p-4 text-white"
      style={{ background: '#1F9D6B' }}
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
    </div>
  )
}

function ApprovalButtons() {
  const [decision, setDecision] = useState<'approve' | 'deny' | null>(null)
  return (
    <div className="flex gap-2 mt-1">
      <button
        onClick={() => setDecision('approve')}
        className="px-4 py-2 rounded-lg font-sans text-[14px] font-semibold min-h-[40px] transition-all duration-150"
        style={{
          border: '1px solid #2A9D8F',
          color: decision === 'approve' ? '#000000' : '#2A9D8F',
          background: decision === 'approve' ? '#2A9D8F' : 'transparent',
        }}
        aria-label="Approve strategy pause"
      >
        Approve
      </button>
      <button
        onClick={() => setDecision('deny')}
        className="px-4 py-2 rounded-lg font-sans text-[14px] font-semibold min-h-[40px] transition-all duration-150"
        style={{
          border: '1px solid #E5484D',
          color: decision === 'deny' ? '#ffffff' : '#E5484D',
          background: decision === 'deny' ? '#E5484D' : 'transparent',
        }}
        aria-label="Deny strategy pause"
      >
        Deny
      </button>
    </div>
  )
}

// Desktop window defaults + constraints
const DEFAULT_W = 460
const DEFAULT_H = 640
const MIN_W = 340
const MIN_H = 420
const PANEL_MARGIN = 24

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
      className="rounded-[14px] p-4 bg-wave-surface border border-wave-border"
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

export function CreateDrawer({ useMock = true }: { useMock?: boolean }) {
  const { state, close, minimize, restore } = useDrawer()
  const { open, minimized, forkSource, agentStrategy } = state

  const [inputValue, setInputValue] = useState('')
  // Ship flow states: idle → confirming (HITL gate) → shipping → done|error.
  // `shipped` is kept for the existing PostShipMessage branch; `shipResult` carries the
  // real on-chain evidence (tx hashes, handle, programHash) returned by the agent.
  const [shipped, setShipped] = useState(false)
  const [shipPending, setShipPending] = useState(false)
  const [shipConfirming, setShipConfirming] = useState(false)
  const [shipResult, setShipResult] = useState<ShipResult | null>(null)
  // Real compiler output for the safety card — fetched via /api/emit (spawns the wave-compiler
  // CLI: canonicalize → resolveRejections → lower → emit → disassemble). Replaces the prior
  // hardcoded "SAFE" verdict with the actual programHash + emitted-byte count + applied
  // rules. Honest label: this is COMPILE-TIME safety (byte-exact hash + rule rewrites), not
  // the full quote-grid settle simulation (out of scope for the demo).
  const [emit, setEmit] = useState<{
    programHash?: string
    bytes?: number
    rulesApplied?: number
    canonicalized?: boolean
    error?: string
  } | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Live compose stream (live mode only). Mock mode replays DEFAULT_MESSAGES.
  const compose = useComposeStream(LIVE_CHAT_COMPOSE_KEY)
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>(readLiveMessages)

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

  // When the spec finalizes, run the deterministic compiler (/api/emit) to surface the REAL
  // programHash + emitted-byte count + applied rules in the safety card. The compiler output
  // is the byte-exact evidence of what the on-chain program will carry — this is what
  // "safety-checked" means at compile time for the demo.
  useEffect(() => {
    if (useMock || !compose.spec) return
    const spec = compose.spec
    let cancelled = false
    setEmit(null)
    ;(async () => {
      try {
        const res = await fetch('/api/emit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(spec),
          signal: AbortSignal.timeout(15000),
        })
        const json = (await res.json()) as {
          programHash?: string
          bytecode?: unknown[]
          rulesApplied?: unknown[]
          canonicalized?: boolean
          error?: string
        }
        if (cancelled) return
        if (!res.ok || json.error) {
          setEmit({ error: json.error ?? `compile failed (HTTP ${res.status})` })
        } else {
          setEmit({
            programHash: json.programHash,
            bytes: Array.isArray(json.bytecode) ? json.bytecode.length : undefined,
            rulesApplied: Array.isArray(json.rulesApplied) ? json.rulesApplied.length : undefined,
            canonicalized: json.canonicalized,
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

  // Track viewport so the floating window's fixed size/position only applies on
  // desktop. On mobile the panel is a full-width docked sheet.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Floating position (desktop only). null = use default bottom-right dock.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  // Window size (desktop only).
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: DEFAULT_W,
    h: DEFAULT_H,
  })
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null)
  const resizeStart = useRef<
    { x: number; y: number; w: number; h: number } | null
  >(null)

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

  // Canned mock/demo messages. Empty in live mode (no fork/agent replay) so the
  // live compose thread owns the panel; the live branch below renders it.
  const messages: Message[] = !useMock && !forkSource && !agentStrategy
    ? []
    : forkSource
    ? [
        {
          id: 'a1',
          role: 'agent',
          content:
            "Describe your trading strategy in plain English. I'll compile it, check it for safety, and ship it on-chain.",
          timestamp: '2:14 PM',
          type: 'text',
        },
        {
          id: 'u1-fork',
          role: 'user',
          content: forkSource.description,
          timestamp: '2:14 PM',
          type: 'text',
        },
        {
          id: 'a2-fork',
          role: 'agent',
          content: 'Got it. Compiling your fork... Checking safety constraints.',
          timestamp: '2:14 PM',
          type: 'text',
        },
      ]
    : agentMessages ?? DEFAULT_MESSAGES

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [open, minimized, shipped])

  // --- Dragging (desktop) ---
  const clamp = useCallback(
    (x: number, y: number) => {
      const w = panelRef.current?.offsetWidth ?? size.w
      const h = panelRef.current?.offsetHeight ?? size.h
      const maxX = window.innerWidth - w - 8
      const maxY = window.innerHeight - h - 8
      return {
        x: Math.max(8, Math.min(x, maxX)),
        y: Math.max(8, Math.min(y, maxY)),
      }
    },
    [size.w, size.h]
  )

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragOffset.current) return
      setPos(clamp(e.clientX - dragOffset.current.dx, e.clientY - dragOffset.current.dy))
    },
    [clamp]
  )

  const onPointerUp = useCallback(() => {
    dragOffset.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    document.body.style.userSelect = ''
  }, [onPointerMove])

  const onTitlePointerDown = (e: React.PointerEvent) => {
    // Desktop only; on small screens the panel is a docked sheet.
    if (window.innerWidth < 768) return
    const el = panelRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragOffset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    // Freeze current position so the first move doesn't jump.
    setPos({ x: rect.left, y: rect.top })
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  // --- Resizing (desktop, bottom-right corner) ---
  const onResizeMove = useCallback((e: PointerEvent) => {
    if (!resizeStart.current) return
    const { x, y, w, h } = resizeStart.current
    const el = panelRef.current
    const left = el?.getBoundingClientRect().left ?? 0
    const top = el?.getBoundingClientRect().top ?? 0
    const maxW = window.innerWidth - left - 8
    const maxH = window.innerHeight - top - 8
    setSize({
      w: Math.max(MIN_W, Math.min(w + (e.clientX - x), maxW)),
      h: Math.max(MIN_H, Math.min(h + (e.clientY - y), maxH)),
    })
  }, [])

  const onResizeUp = useCallback(() => {
    resizeStart.current = null
    window.removeEventListener('pointermove', onResizeMove)
    window.removeEventListener('pointerup', onResizeUp)
    document.body.style.userSelect = ''
  }, [onResizeMove])

  const onResizePointerDown = (e: React.PointerEvent) => {
    if (window.innerWidth < 768) return
    e.stopPropagation()
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h }
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onResizeMove)
    window.addEventListener('pointerup', onResizeUp)
  }

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointermove', onResizeMove)
      window.removeEventListener('pointerup', onResizeUp)
    }
  }, [onPointerMove, onPointerUp, onResizeMove, onResizeUp])

  // Ship is a destructive on-chain write. The HITL gate is the explicit confirm step:
  // the first click arms (shipConfirming), the second click fires the agent shipStrategy
  // action. The agent signs with server keys for the demo (post-event: user wallet).
  const handleShip = async () => {
    // Stage 1 — arm the confirm gate (the destructive-op HITL approval).
    if (!shipConfirming) {
      setShipConfirming(true)
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
    try {
      const result = await shipStrategy({
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
      setShipResult(result)
      if (result.ok) {
        setShipped(true)
        // Clear the in-progress draft now that the strategy is live on-chain.
        try {
          window.localStorage.removeItem(LIVE_CHAT_COMPOSE_KEY)
          window.localStorage.removeItem(LIVE_CHAT_MESSAGES_KEY)
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

  if (!open) return null

  const title = forkSource
    ? `Fork: ${forkSource.authorHandle}`
    : agentStrategy
      ? agentStrategy.authorHandle
      : 'New strategy'

  // --- Minimized pill ---
  if (minimized) {
    return (
      <div className="fixed z-[60] bottom-4 right-4 md:bottom-6 md:right-6">
        <div
          className="flex items-center gap-2 rounded-full pl-4 pr-2 py-2 bg-wave-bg border border-wave-border shadow-2xl"
          role="dialog"
          aria-label={`${title} (minimized)`}
        >
          <MessageSquare size={16} style={{ color: '#2A9D8F' }} aria-hidden="true" />
          <button
            onClick={restore}
            className="font-sans text-[14px] font-semibold text-wave-text"
            aria-label={`Restore ${title} chat`}
          >
            {title}
          </button>
          <button
            onClick={close}
            className="w-8 h-8 flex items-center justify-center text-wave-muted hover:text-wave-text rounded-full transition-colors"
            aria-label="Close chat"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    )
  }

  // --- Full floating window ---
  // Desktop uses explicit left/top/width/height so it can be dragged + resized.
  // On mobile we drop the inline sizing entirely and let the classes render a
  // full-width docked sheet (so the input + send button are always visible).
  const desktopStyle: React.CSSProperties | undefined = !isDesktop
    ? undefined
    : pos
      ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', width: size.w, height: size.h }
      : { right: PANEL_MARGIN, bottom: PANEL_MARGIN, width: size.w, height: size.h }

  return (
    <div
      ref={panelRef}
      className="fixed z-[60] flex flex-col overflow-hidden bg-wave-bg border border-wave-border shadow-2xl
        inset-x-0 bottom-0 h-[88dvh] rounded-t-[20px]
        md:inset-x-auto md:bottom-auto md:h-auto md:rounded-[16px]
        animate-drawer-pop"
      style={desktopStyle}
      role="dialog"
      aria-label={title}
    >
      {/* Title bar (drag handle on desktop) */}
      <div
        onPointerDown={onTitlePointerDown}
        className="flex items-center gap-2 px-3 h-12 border-b border-wave-border shrink-0 md:cursor-grab md:active:cursor-grabbing select-none bg-wave-surface"
      >
        <GripHorizontal
          size={16}
          className="hidden md:block text-wave-muted shrink-0"
          aria-hidden="true"
        />
        <h2 className="font-sans text-[14px] font-semibold text-wave-text truncate flex-1">
          {title}
        </h2>
        {/* Window controls */}
        <button
          onClick={minimize}
          className="w-9 h-9 flex items-center justify-center text-wave-muted hover:text-wave-text rounded-lg transition-colors shrink-0"
          aria-label="Minimize chat"
        >
          <Minus size={16} aria-hidden="true" />
        </button>
        <button
          onClick={close}
          className="w-9 h-9 flex items-center justify-center text-wave-muted hover:text-wave-text rounded-lg transition-colors shrink-0"
          aria-label="Close chat"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="px-3 pt-3 shrink-0">
        <StreamNotifications enabled={!useMock} />
      </div>

      {/* Message thread */}
      <div
        ref={threadRef}
        className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
      >
        {messages.map((msg) => {
          if (msg.type === 'safety-card') {
            return (
              <div key={msg.id} className="max-w-[85%]">
                <InlineSafetyCard emit={null} />
                <p className="font-sans text-[11px] text-wave-muted mt-1 pl-1">
                  {msg.timestamp}
                </p>
              </div>
            )
          }

          if (msg.type === 'ship-button') {
            return (
              <div key={msg.id} className="w-full">
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

          const isAgent = msg.role === 'agent'
          return (
            <div
              key={msg.id}
              className={`flex flex-col max-w-[85%] ${
                isAgent ? 'self-start' : 'self-end'
              }`}
            >
              <div
                className={`px-4 py-3 font-sans text-[14px] text-wave-text leading-relaxed ${
                  isAgent ? 'bg-wave-surface' : ''
                }`}
                style={{
                  background: isAgent ? undefined : 'rgba(42,157,143,0.18)',
                  borderRadius: isAgent
                    ? '12px 12px 12px 4px'
                    : '12px 12px 4px 12px',
                }}
              >
                {msg.content}
              </div>
              <span
                className={`font-sans text-[11px] text-wave-muted mt-1 ${
                  isAgent ? 'pl-1' : 'pr-1 text-right'
                }`}
              >
                {msg.timestamp}
              </span>
            </div>
          )
        })}

        {/* Live compose stream (live mode only). Mock mode uses the canned
            messages above + the HITL approval demo below. */}
        {!useMock && !forkSource && !agentStrategy && liveMessages.length === 0 && (
          <div className="flex flex-col max-w-[85%] self-start">
            <div
              className="px-4 py-3 font-sans text-[14px] text-wave-text leading-relaxed bg-wave-surface"
              style={{ borderRadius: '12px 12px 12px 4px' }}
            >
              Describe your trading strategy in plain English. I&apos;ll compile
              it to a bounded spec, check it for safety, and ship it on-chain.
            </div>
          </div>
        )}
        {!useMock && liveMessages.map((msg) => {
          if (msg.kind === 'spec') {
            return (
              <div key={msg.id} className="max-w-[85%]">
                <LiveSpecCard spec={compose.partial ?? compose.spec} done={!!compose.spec} />
                {compose.isStreaming && (
                  <p className="font-sans text-[11px] text-wave-muted mt-1 pl-1">
                    filling the form…
                  </p>
                )}
              </div>
            )
          }
          const isAgent = msg.role === 'agent'
          // The compile bubble is the "Compiling…" affordance. While the LLM
          // streams, surface its live reasoning (compose.progress) instead of a
          // frozen word — a 14–120s self-hosted-model wait otherwise looks stuck.
          // Only this bubble (id prefix a-compile-) is live; other agent bubbles
          // are static canned copy.
          const isCompileBubble = isAgent && msg.id.startsWith('a-compile-')
          const liveProgress =
            isCompileBubble && compose.isStreaming && compose.progress
              ? compose.progress.replace(/\s+/g, ' ').trim().slice(-220)
              : ''
          return (
            <div
              key={msg.id}
              className={`flex flex-col max-w-[85%] ${isAgent ? 'self-start' : 'self-end'}`}
            >
              <div
                className="px-4 py-3 font-sans text-[14px] text-wave-text leading-relaxed"
                style={{
                  background: isAgent ? undefined : 'rgba(42,157,143,0.18)',
                  borderRadius: isAgent ? '12px 12px 12px 4px' : '12px 12px 4px 12px',
                }}
              >
                {isCompileBubble && compose.isStreaming ? (
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{ background: '#2A9D8F', animation: 'wave-pulse 1.1s ease-in-out infinite' }}
                      aria-hidden="true"
                    />
                    <span className="text-wave-muted">
                      {liveProgress ? `thinking… ${liveProgress}` : 'thinking…'}
                    </span>
                  </span>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          )
        })}

        {/* Live: once the spec lands, show the safety card + ship CTA (the
            compiled spec IS the form the agent filled; ship is the demo beat). */}
        {!useMock && compose.spec && (
          <>
            <div className="max-w-[85%]">
              <InlineSafetyCard emit={emit} />
            </div>
            {compose.error ? (
              <p className="font-sans text-[13px]" style={{ color: '#E5484D' }}>
                {compose.error}
              </p>
            ) : (
              <div className="w-full flex flex-col gap-2">
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
        <div className="flex flex-col max-w-[85%] self-start">
          <div
            className="px-4 py-3 font-sans text-[14px] text-wave-text leading-relaxed bg-wave-surface"
            style={{ borderRadius: '12px 12px 12px 4px' }}
          >
            {"This strategy's oracle has been stale for 4h. I want to pause execution. Approve?"}
          </div>
          <ApprovalButtons />
          <span className="font-sans text-[11px] text-wave-muted mt-2 pl-1">
            2:17 PM
          </span>
        </div>
        )}
      </div>

      {/* Input area — contained rounded field so text is never flush to the edge */}
      <div className="shrink-0 px-3 py-3 border-t border-wave-border">
        <form
          onSubmit={handleSend}
          className="flex items-center gap-1 rounded-[12px] pl-4 pr-1.5 py-1.5 bg-wave-surface border border-wave-border focus-within:border-wave-teal transition-colors"
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

      {/* Resize handle (desktop only, bottom-right corner) */}
      <div
        onPointerDown={onResizePointerDown}
        className="hidden md:flex items-end justify-end absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-20 p-1 touch-none"
        aria-hidden="true"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          className="text-wave-muted"
        >
          <path
            d="M15 5 L5 15 M15 10 L10 15 M15 15 L14.5 15"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  )
}
