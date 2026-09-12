'use client'

// CreateDrawer — the chat WINDOW (the only chat surface): right-docked by
// default, draggable + resizable on desktop, docked sheet on mobile, minimize
// pill. All conversation logic lives in components/agent-chat.tsx; this file
// is the glassy chrome plus the collapsible conversation sidebar (MUI
// x-chat's features.conversationList, wave-styled): the wallet's shipped
// strategies as threads, one click to replay one.
import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { X, Minus, GripHorizontal, MessageSquare, PanelLeftClose, PanelLeft } from 'lucide-react'
import { useDrawer } from './drawer-context'
import { AgentChat } from './agent-chat'
import { ThreadRow } from './thread-row'
import { useThreads } from '@/hooks/use-threads'
import { ConnectButton } from './connect-button'

// Desktop window defaults + constraints
const DEFAULT_W = 560
const DEFAULT_H = 680
const MIN_W = 380
const MIN_H = 460
const PANEL_MARGIN = 24

/** Collapsible threads pane (desktop only — the mobile sheet has no room). */
function ConversationPane({ onClose }: { onClose: () => void }) {
  const threads = useThreads()
  return (
    <div
      className="hidden md:flex w-[240px] shrink-0 flex-col min-h-0"
      style={{
        background: 'var(--glass-fill)',
        borderRight: '1px solid var(--glass-hairline)',
      }}
      aria-label="Conversations"
    >
      <div className="flex items-center gap-2 px-3 h-12 shrink-0">
        <span className="font-sans text-[13px] font-semibold text-wave-text">
          Threads
        </span>
        <button
          onClick={onClose}
          className="ml-auto w-8 h-8 flex items-center justify-center text-wave-muted hover:text-wave-text rounded-lg transition-colors"
          aria-label="Hide conversations"
        >
          <PanelLeftClose size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto" role="listbox" aria-label="Your strategy threads">
        {threads.phase === 'resolving' || threads.phase === 'loading' ? (
          <p className="px-3 py-3 font-sans text-[12px] text-wave-muted">
            Loading your threads…
          </p>
        ) : threads.phase === 'disconnected' ? (
          <div className="px-3 py-3 flex flex-col gap-2.5 items-start">
            <p className="font-sans text-[12px] text-wave-muted">
              Connect your wallet to see your strategy threads.
            </p>
            <ConnectButton />
          </div>
        ) : threads.threads.length === 0 ? (
          <p className="px-3 py-3 font-sans text-[12px] text-wave-muted">
            No strategies yet — ship your first one and it becomes a thread.
          </p>
        ) : (
          <ul>
            {threads.threads.map((s) => (
              <li key={s.id}>
                <ThreadRow strategy={s} compact />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function CreateDrawer({ useMock = true }: { useMock?: boolean }) {
  const { state, close, minimize, restore } = useDrawer()
  const { open, minimized, agentStrategy } = state
  const [showThreads, setShowThreads] = useState(false)

  const [isDesktop, setIsDesktop] = useState(false)
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

  if (!open) return null

  const title = agentStrategy ? agentStrategy.authorHandle : 'New strategy'

  // --- Minimized pill ---
  if (minimized) {
    return (
      <div className="fixed z-[60] bottom-4 right-4 md:bottom-6 md:right-6">
        <div
          className="flex items-center gap-2 rounded-full pl-4 pr-2 py-2 glass-panel"
          style={{ borderRadius: 999 }}
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
      className="fixed z-[60] flex overflow-hidden glass-panel
        inset-x-0 bottom-0 h-[88dvh] rounded-t-[20px]
        md:inset-x-auto md:bottom-auto md:rounded-[18px]
        animate-drawer-pop"
      style={desktopStyle}
      role="dialog"
      aria-label={title}
    >
      {/* Conversation sidebar (MUI features.conversationList, wave glass) */}
      {showThreads && <ConversationPane onClose={() => setShowThreads(false)} />}

      <div className="flex flex-col flex-1 min-w-0">
        {/* Title bar (drag handle on desktop) */}
        <div
          onPointerDown={onTitlePointerDown}
          className="flex items-center gap-1.5 px-3 h-12 shrink-0 md:cursor-grab md:active:cursor-grabbing select-none"
          style={{ borderBottom: '1px solid var(--glass-hairline)' }}
        >
          <GripHorizontal
            size={16}
            className="hidden md:block text-wave-muted shrink-0"
            aria-hidden="true"
          />
          {/* Icon-only title: the wave mark carries the brand; the label stays
              available to screen readers and as a hover tooltip. */}
          <span
            className="flex-1 flex items-center min-w-0"
            title={title}
            aria-label={title}
            role="heading"
            aria-level={2}
          >
            <Image
              src="/wave-logo.png"
              alt=""
              width={22}
              height={22}
              className="h-[22px] w-[22px] shrink-0"
            />
            <span className="sr-only">{title}</span>
          </span>
          {/* Window controls */}
          <button
            onClick={() => setShowThreads((v) => !v)}
            className="w-9 h-9 flex items-center justify-center text-wave-muted hover:text-wave-text rounded-lg transition-colors shrink-0 hidden md:flex"
            aria-label={showThreads ? 'Hide conversations' : 'Show conversations'}
            aria-pressed={showThreads}
          >
            {showThreads ? (
              <PanelLeftClose size={15} aria-hidden="true" />
            ) : (
              <PanelLeft size={15} aria-hidden="true" />
            )}
          </button>
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

        <AgentChat useMock={useMock} />
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
