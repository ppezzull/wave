'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Send, CheckCircle2, Minus, GripHorizontal, MessageSquare } from 'lucide-react'
import { useDrawer } from './drawer-context'

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
    content:
      'Strategy is safe. Ready to ship as eth-usdc-momentum.wave.eth. Confirm?',
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

function InlineSafetyCard() {
  return (
    <div
      className="animate-safety-reveal rounded-[14px] p-4 text-white"
      style={{ background: '#1F9D6B' }}
      role="status"
      aria-label="Strategy safety result: SAFE"
    >
      <p className="font-sans text-lg font-bold mb-3">SAFE</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Monotonicity', value: '0.97' },
          { label: 'Symmetry', value: '12 bps' },
          { label: 'Guard Triggers', value: '3' },
          { label: 'Skew vs Cap', value: '0.04' },
        ].map((m) => (
          <div key={m.label}>
            <p className="font-sans text-[11px] text-white/70 mb-0.5">
              {m.label}
            </p>
            <p className="font-mono font-bold text-[1rem] text-white">
              {m.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function PostShipMessage() {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={14} style={{ color: '#2A9D8F' }} aria-hidden="true" />
        <span className="font-mono text-[13px]" style={{ color: '#2A9D8F' }}>
          tx 0x1a2b3c4d5e6f...7890
        </span>
      </div>
      <p className="font-sans text-[14px] text-wave-text">
        Registered as eth-usdc-momentum.wave.eth
      </p>
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

export function CreateDrawer() {
  const { state, close, minimize, restore } = useDrawer()
  const { open, minimized, forkSource, agentStrategy } = state

  const [inputValue, setInputValue] = useState('')
  const [shipped, setShipped] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

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

  const messages: Message[] = forkSource
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

  const handleShip = () => {
    setShipped(true)
    setTimeout(() => {
      close()
      setShipped(false)
    }, 2000)
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    setInputValue('')
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

      {/* Message thread */}
      <div
        ref={threadRef}
        className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
      >
        {messages.map((msg) => {
          if (msg.type === 'safety-card') {
            return (
              <div key={msg.id} className="max-w-[85%]">
                <InlineSafetyCard />
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
                  <PostShipMessage />
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

        {/* Human-in-the-loop approval scenario (not shown when replaying an
            already-shipped pool agent conversation) */}
        {!agentStrategy && (
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
