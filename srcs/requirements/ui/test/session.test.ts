import { describe, it, expect } from 'vitest'
import {
  parseSessionMarker,
  resolveSession,
  usesWalletSign,
  usesDeviceSign,
  allowsSessionApproval,
  LOCAL_ACCOUNT,
} from '@/lib/session'

describe('parseSessionMarker', () => {
  it('rejects junk', () => {
    expect(parseSessionMarker(null)).toBeNull()
    expect(parseSessionMarker({})).toBeNull()
    expect(parseSessionMarker({ address: '0xhi' })).toBeNull()
  })
  it('legacy records without kind are ledger', () => {
    const m = parseSessionMarker({
      address: LOCAL_ACCOUNT,
      connectedAt: 1,
    })
    expect(m).toEqual({ address: LOCAL_ACCOUNT, kind: 'ledger', connectedAt: 1 })
  })
  it('keeps an explicit local kind', () => {
    const m = parseSessionMarker({
      address: LOCAL_ACCOUNT,
      kind: 'local',
      connectedAt: 2,
    })
    expect(m?.kind).toBe('local')
  })
})

describe('resolveSession order', () => {
  const marker = {
    address: LOCAL_ACCOUNT,
    kind: 'local' as const,
    connectedAt: 1,
  }
  const device = { ...marker, kind: 'ledger' as const }

  it('1. Privy wins over a leftover local marker', () => {
    const s = resolveSession({
      privyReady: true,
      privyAuthenticated: true,
      privyAddress: '0x1111111111111111111111111111111111111111',
      markerHydrated: true,
      marker,
    })
    expect(s).toEqual({
      ready: true,
      authenticated: true,
      source: 'privy',
      address: '0x1111111111111111111111111111111111111111',
    })
    expect(usesWalletSign(s.source)).toBe(true)
    expect(usesDeviceSign(s.source)).toBe(false)
  })

  it('1b. Privy authenticated without a wallet yet is still Privy', () => {
    const s = resolveSession({
      privyReady: true,
      privyAuthenticated: true,
      markerHydrated: true,
      marker: device,
    })
    expect(s.source).toBe('privy')
    expect(s.address).toBeNull()
    expect(usesWalletSign(s.source)).toBe(true)
  })

  it('2. Ledger device when Privy is out', () => {
    const s = resolveSession({
      privyReady: true,
      privyAuthenticated: false,
      markerHydrated: true,
      marker: device,
    })
    expect(s.source).toBe('ledger')
    expect(usesDeviceSign(s.source)).toBe(true)
    expect(allowsSessionApproval(s.source)).toBe(false)
  })

  it('3. Local marker when Privy is out', () => {
    const s = resolveSession({
      privyReady: true,
      privyAuthenticated: false,
      markerHydrated: true,
      marker,
    })
    expect(s.source).toBe('local')
    expect(usesWalletSign(s.source)).toBe(false)
    expect(usesDeviceSign(s.source)).toBe(false)
    expect(allowsSessionApproval(s.source)).toBe(false)
  })

  it('4. waits for Privy + marker hydrate before ready', () => {
    const s = resolveSession({
      privyReady: false,
      privyAuthenticated: false,
      markerHydrated: false,
      marker: null,
    })
    expect(s).toEqual({
      ready: false,
      authenticated: false,
      source: null,
      address: null,
    })
  })
})
