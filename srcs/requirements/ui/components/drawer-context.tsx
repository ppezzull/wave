'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { Strategy } from '@/lib/mock-data'

interface DrawerState {
  open: boolean // panel is on screen (either full or minimized)
  minimized: boolean // collapsed to the floating pill
  agentStrategy?: Strategy // opening an existing pool agent conversation
  initialized: boolean // a session was started at least once this visit
  /** One-shot input prefill (fork): lands in the chat input byte-for-byte,
   * consumed by whichever AgentChat instance is mounted. */
  prefill?: string
}

interface DrawerContextValue {
  state: DrawerState
  openCreate: (prefill?: string) => void
  openAgent: (strategy: Strategy) => void
  minimize: () => void
  restore: () => void
  close: () => void
  /** Clears the one-shot prefill after the chat consumed it. */
  consumePrefill: () => void
}

const DrawerContext = createContext<DrawerContextValue | null>(null)

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DrawerState>({
    open: false,
    minimized: false,
    initialized: false,
  })

  // The chat is ALWAYS visible: the window opens itself on load (desktop) or
  // docks as the minimized pill (mobile — a full sheet would cover the page).
  // Settled post-hydration (no SSR mismatch); the user can still close or
  // minimize for the rest of the session.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)').matches
    setState({
      open: true,
      minimized: !desktop,
      initialized: true,
    })
  }, [])

  // Create: if a session is already live (open or minimized), just bring it
  // back into view rather than resetting the conversation. Otherwise start a
  // fresh session. A prefill (fork) lands in the input byte-for-byte; it also
  // always clears agentStrategy so a replay never sticks over a new compose.
  const openCreate = useCallback((prefill?: string) => {
    setState((s) => ({
      ...(s.initialized ? s : { ...s, initialized: true }),
      open: true,
      minimized: false,
      agentStrategy: undefined,
      ...(prefill !== undefined ? { prefill } : {}),
    }))
  }, [])

  // Open the pool agent conversation that produced an existing strategy.
  const openAgent = useCallback((strategy: Strategy) => {
    setState({
      open: true,
      minimized: false,
      agentStrategy: strategy,
      initialized: true,
    })
  }, [])

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

  const consumePrefill = useCallback(
    () => setState((s) => (s.prefill === undefined ? s : { ...s, prefill: undefined })),
    [],
  )

  return (
    <DrawerContext.Provider
      value={{ state, openCreate, openAgent, minimize, restore, close, consumePrefill }}
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
