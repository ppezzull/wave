'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Strategy } from '@/lib/mock-data'
import { useSessionUser } from '@/hooks/use-session-user'

interface DrawerState {
  open: boolean // panel is on screen (either full or minimized)
  minimized: boolean // collapsed to the floating pill
  agentStrategy?: Strategy // opening an existing pool agent conversation
  initialized: boolean // a session was started at least once this visit
  /** One-shot input prefill (fork): lands in the chat input byte-for-byte,
   * consumed by whichever AgentChat instance is mounted. */
  prefill?: string
  /** One-shot archived transcript replay: restores a saved conversation. */
  replay?: unknown[]
}

interface DrawerContextValue {
  state: DrawerState
  openCreate: (prefill?: string) => void
  openAgent: (strategy: Strategy) => void
  minimize: () => void
  restore: () => void
  close: () => void
  /** Opens the widget with an archived conversation restored. */
  openReplay: (entry: { messages: unknown[] }) => void
  /** Clears the one-shot replay after the chat consumed it. */
  consumeReplay: () => void
  /** Clears the one-shot prefill after the chat consumed it. */
  consumePrefill: () => void
}

const DrawerContext = createContext<DrawerContextValue | null>(null)

export function DrawerProvider({
  children,
  allowDemo = false,
}: {
  children: React.ReactNode
  /** Mock mode: the demo session needs no wallet — skip the auth guards. */
  allowDemo?: boolean
}) {
  const router = useRouter()
  const { ready, sessionUser } = useSessionUser()
  const [state, setState] = useState<DrawerState>({
    open: false,
    minimized: false,
    initialized: false,
  })

  // The feed is PUBLIC; the chat is the authenticated surface. The window
  // opens itself on load for signed-in visitors (desktop full / mobile pill)
  // and stays away for signed-out ones — their entry point is the landing.
  // Settled post-hydration (no SSR mismatch); closable for the rest of the visit.
  useEffect(() => {
    if (!ready && !allowDemo) return // wait for the session to resolve
    if (!allowDemo && !sessionUser) return // signed out → no widget
    const desktop = window.matchMedia('(min-width: 768px)').matches
    setState((s) =>
      s.initialized
        ? s
        : {
            open: true,
            minimized: !desktop,
            initialized: true,
          },
    )
  }, [ready, sessionUser, allowDemo])

  // Create: if a session is already live (open or minimized), just bring it
  // back into view rather than resetting the conversation. Otherwise start a
  // fresh session. A prefill (fork) lands in the input byte-for-byte; it also
  // always clears agentStrategy so a replay never sticks over a new compose.
  // Signed-out callers (Fork, Create, chat-selector links) land on `/` —
  // the auth door — instead of a chat they cannot author from.
  const openCreate = useCallback(
    (prefill?: string) => {
      if (!allowDemo && !sessionUser) {
        router.push('/')
        return
      }
      setState((s) => ({
        ...(s.initialized ? s : { ...s, initialized: true }),
        open: true,
        minimized: false,
        agentStrategy: undefined,
        ...(prefill !== undefined ? { prefill } : {}),
      }))
    },
    [allowDemo, sessionUser, router],
  )

  // Open the pool agent conversation that produced an existing strategy.
  const openAgent = useCallback(
    (strategy: Strategy) => {
      if (!allowDemo && !sessionUser) {
        router.push('/')
        return
      }
      setState({
        open: true,
        minimized: false,
        agentStrategy: strategy,
        initialized: true,
      })
    },
    [allowDemo, sessionUser, router],
  )

  const minimize = useCallback(() => setState((s) => ({ ...s, minimized: true })), [])
  const restore = useCallback(() => setState((s) => ({ ...s, open: true, minimized: false })), [])

  const close = useCallback(() => {
    setState({
      open: false,
      minimized: false,
      agentStrategy: undefined,
      initialized: false,
    })
  }, [])

  // Replay a SAVED conversation (the local archive): the widget opens with the
  // archived transcript restored — read-only history you can still continue.
  const openReplay = useCallback((entry: { messages: unknown[] }) => {
    setState({
      open: true,
      minimized: false,
      agentStrategy: undefined,
      initialized: true,
      replay: entry.messages,
    })
  }, [])

  const consumeReplay = useCallback(
    () => setState((s) => (s.replay === undefined ? s : { ...s, replay: undefined })),
    [],
  )

  const consumePrefill = useCallback(
    () => setState((s) => (s.prefill === undefined ? s : { ...s, prefill: undefined })),
    [],
  )

  return (
    <DrawerContext.Provider
      value={{
        state,
        openCreate,
        openAgent,
        minimize,
        restore,
        close,
        openReplay,
        consumeReplay,
        consumePrefill,
      }}
    >
      {children}
    </DrawerContext.Provider>
  )
}

export function useDrawer() {
  const ctx = useContext(DrawerContext)
  if (!ctx) throw new Error('useDrawer must be used within DrawerProvider')
  return ctx
}
