'use client'

// CreateDrawer — the chat WINDOW (the only chat surface): a floating
// bottom-right-docked window at every desktop size (draggable + resizable),
// a full-width docked sheet on mobile, minimize pill. All conversation logic
// lives in components/agent-chat.tsx; this file is the glassy chrome plus the
// collapsible conversation sidebar (MUI x-chat's features.conversationList,
// wave-styled): the wallet's shipped strategies as threads, one click to
// replay one.
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { X, Minus, Bookmark, GripHorizontal, MessageSquare, PanelLeftClose, PanelLeft } from 'lucide-react'
import { useDrawer } from './drawer-context'
import { AgentChat, LIVE_CHAT_MESSAGES_KEY } from './agent-chat'
import { saveToArchive, type ArchiveMessage } from '@/lib/chat-archive'
import { ThreadRow } from './thread-row'
import { useThreads } from '@/hooks/use-threads'
import { ConnectButton } from './connect-button'
import { MicroSkeleton } from '@/components/skeleton'

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
          <MicroSkeleton label="Loading threads" className="px-3 py-4" />
        ) : threads.phase === 'disconnected' ? (
          <div className="px-3 py-3 flex flex-col gap-2.5 items-start">
            <p className="font-sans text-[12px] text-wave-muted">
              Connect your wallet to see your strategy threads.
            </p>
            <ConnectButton />
          </div>
        ) : threads.threads.length === 0 ? (
          <p className="px-3 py-3 font-sans text-[12px] text-wave-muted">
            No strategies yet. Ship your first one and it becomes a thread.
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

/** Minimized chat chip — right-rail slot on desktop, fixed fallback on mobile. */
export function MinimizedChatPill() {
  const { state, restore, close } = useDrawer()
  if (!state.open || !state.minimized) return null
  const title = state.agentStrategy ? state.agentStrategy.authorHandle : 'New strategy'
  return (
    <div
      className="mt-auto flex w-fit items-center gap-2 self-start rounded-full py-2 pl-4 pr-2 glass-panel"
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
        className="flex h-8 w-8 items-center justify-center rounded-full text-wave-muted transition-colors hover:text-wave-text"
        aria-label="Close chat"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

function useSaveConversation() {
  const [savedFlash, setSavedFlash] = useState(false)
  const saveCurrentConversation = useCallback(() => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(LIVE_CHAT_MESSAGES_KEY) ?? '[]') as unknown
      const messages = Array.isArray(raw) ? (raw as ArchiveMessage[]) : []
      const saved = saveToArchive(messages)
      setSavedFlash(Boolean(saved))
      if (saved) setTimeout(() => setSavedFlash(false), 1600)
    } catch {
      // nothing to save
    }
  }, [])
  return { savedFlash, saveCurrentConversation }
}

/** The chat floats at every desktop size now — no rail slot remains (the
 *  minimized pill is fixed bottom-right). DockedChatPanel was removed with
 *  the rail hosting. */

export function CreateDrawer({ useMock = true }: { useMock?: boolean }) {
  const { state, close, minimize } = useDrawer()
  const { open, minimized, agentStrategy } = state
  const [showThreads, setShowThreads] = useState(false)
  const { savedFlash, saveCurrentConversation } = useSaveConversation()

  const [isDesktop, setIsDesktop] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Track viewport so the floating window's fixed size/position only applies on
  // desktop. On mobile the panel is a full-width docked sheet.
  useLayoutEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)')
    const update = () => setIsDesktop(desktop.matches)
    update()
    desktop.addEventListener('change', update)
    return () => desktop.removeEventListener('change', update)
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

  // Minimized: a fixed bottom-right chip at every desktop size (the rail no
  // longer hosts the chat — it floats).
  if (minimized) {
    return (
      <div className="fixed z-[60] bottom-4 right-4">
        <MinimizedChatPill />
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
      // Farcaster-style dock: pinned to the TOP-right, aligned with the
      // layout columns' top edge — a right-hand column until dragged away.
      // Default dock: pinned BOTTOM-right — the chat is a floor-level window
      // (the old top-right dock read as a second header; the rail no longer
      // hosts it, so nothing sits under it but the page).
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
          <span className="sr-only" role="heading" aria-level={2}>
            {title}
          </span>
          <span className="min-w-0 flex-1" aria-hidden="true" />
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
            onClick={saveCurrentConversation}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors shrink-0 ${
              savedFlash ? 'text-wave-teal' : 'text-wave-muted hover:text-wave-text'
            }`}
            aria-label="Save conversation to your archive"
            title={savedFlash ? 'Saved' : 'Save conversation'}
          >
            <Bookmark size={15} fill={savedFlash ? 'currentColor' : 'none'} aria-hidden="true" />
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
