'use client'

import { createContext, useContext, useState } from 'react'
import type { Strategy } from '@/lib/mock-data'

interface DrawerState {
  open: boolean // panel is on screen (either full or minimized)
  minimized: boolean // collapsed to the floating pill
  forkSource?: Strategy
  agentStrategy?: Strategy // opening an existing pool agent conversation
  initialized: boolean // a session was started at least once this visit
}

interface DrawerContextValue {
  state: DrawerState
  openCreate: () => void
  openFork: (strategy: Strategy) => void
  openAgent: (strategy: Strategy) => void
  minimize: () => void
  restore: () => void
  close: () => void
}

const DrawerContext = createContext<DrawerContextValue | null>(null)

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DrawerState>({
    open: false,
    minimized: false,
    initialized: false,
  })

  // Create: if a session is already live (open or minimized), just bring it
  // back into view rather than resetting the conversation. Otherwise start
  // a fresh, non-fork session.
  const openCreate = () =>
    setState((s) =>
      s.initialized
        ? { ...s, open: true, minimized: false }
        : { open: true, minimized: false, forkSource: undefined, initialized: true }
    )

  const openFork = (strategy: Strategy) =>
    setState({
      open: true,
      minimized: false,
      forkSource: strategy,
      agentStrategy: undefined,
      initialized: true,
    })

  // Open the pool agent conversation that produced an existing strategy.
  const openAgent = (strategy: Strategy) =>
    setState({
      open: true,
      minimized: false,
      forkSource: undefined,
      agentStrategy: strategy,
      initialized: true,
    })

  const minimize = () => setState((s) => ({ ...s, minimized: true }))
  const restore = () => setState((s) => ({ ...s, open: true, minimized: false }))

  const close = () =>
    setState({
      open: false,
      minimized: false,
      forkSource: undefined,
      agentStrategy: undefined,
      initialized: false,
    })

  return (
    <DrawerContext.Provider
      value={{ state, openCreate, openFork, openAgent, minimize, restore, close }}
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
