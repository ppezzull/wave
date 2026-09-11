'use client'

// LedgerProvider — exactly ONE DeviceManagementKit per browser tab.
//
// Module-lazy dynamic import: the @ledgerhq modules are never evaluated during
// SSR (client components still render on the server), and the singleton lives
// OUTSIDE React so StrictMode's double-mount can't build two instances or
// close the real one. The chunk is preloaded on mount so the ship-confirm
// click — a WebHID user gesture — never awaits a network fetch.
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import type { DeviceManagementKit } from '@ledgerhq/device-management-kit'

type DmkLoader = () => Promise<DeviceManagementKit>

const LedgerContext = createContext<DmkLoader | null>(null)

let dmkPromise: Promise<DeviceManagementKit> | null = null

function loadDmk(): Promise<DeviceManagementKit> {
  if (!dmkPromise) {
    dmkPromise = (async () => {
      const { DeviceManagementKitBuilder } = await import('@ledgerhq/device-management-kit')
      const { webHidTransportFactory } = await import('@ledgerhq/device-transport-kit-web-hid')
      return new DeviceManagementKitBuilder().addTransport(webHidTransportFactory).build()
    })()
    // A failed load (e.g. no WebHID in this browser) must be retryable.
    dmkPromise.catch(() => {
      dmkPromise = null
    })
  }
  return dmkPromise
}

export function LedgerProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void loadDmk()
  }, [])
  const value = useMemo(() => loadDmk, [])
  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

export function useDmkLoader(): DmkLoader {
  const loader = useContext(LedgerContext)
  if (!loader) throw new Error('useDmkLoader requires <LedgerProvider>')
  return loader
}
