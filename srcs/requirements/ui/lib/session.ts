// Session resolve — ONE ordered split for the whole UI.
//
//   1. Privy        wallet is connected (or still reconnecting)
//   2. Ledger       device signed in; Nano clear-signs vault / ship
//   3. Local        Anvil marker; browse-only, no signer
//   4. none
//
// Callers must not re-check Privy vs localStorage. Read `source` from
// useSessionUser (or resolveSession in tests) and use the helpers below.

export type SessionSource = 'privy' | 'ledger' | 'local' | null

export type SessionMarkerKind = 'ledger' | 'local'

export interface SessionMarker {
  address: string
  kind: SessionMarkerKind
  connectedAt: number
}

export interface SessionSnapshot {
  ready: boolean
  authenticated: boolean
  source: SessionSource
  address: string | null
}

/** Anvil account #0 — the landing "local account" door. */
export const LOCAL_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

/** Records without `kind` are real device sessions (pre-local-account). */
export function parseSessionMarker(raw: unknown): SessionMarker | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as { address?: unknown; kind?: unknown; connectedAt?: unknown }
  if (typeof o.address !== 'string' || !ADDRESS_RE.test(o.address)) return null
  return {
    address: o.address,
    kind: o.kind === 'local' ? 'local' : 'ledger',
    connectedAt: typeof o.connectedAt === 'number' ? o.connectedAt : 0,
  }
}

/**
 * Ordered identity. Privy wins even if a leftover marker is in storage
 * (chat vault then uses the wallet, not the Nano).
 */
export function resolveSession(input: {
  privyReady: boolean
  privyAuthenticated: boolean
  privyAddress?: string
  markerHydrated: boolean
  marker: SessionMarker | null
}): SessionSnapshot {
  if (input.privyReady && input.privyAuthenticated) {
    return {
      ready: true,
      authenticated: true,
      source: 'privy',
      address: input.privyAddress && ADDRESS_RE.test(input.privyAddress) ? input.privyAddress : null,
    }
  }
  if (input.marker?.kind === 'ledger') {
    return {
      ready: true,
      authenticated: true,
      source: 'ledger',
      address: input.marker.address,
    }
  }
  if (input.marker?.kind === 'local') {
    return {
      ready: true,
      authenticated: true,
      source: 'local',
      address: input.marker.address,
    }
  }
  return {
    ready: input.markerHydrated && input.privyReady,
    authenticated: false,
    source: null,
    address: null,
  }
}

/** Privy wallet personal_sign (chat vault, session-kind ship). */
export function usesWalletSign(source: SessionSource): boolean {
  return source === 'privy'
}

/** Ledger Nano clear-sign (chat vault, device-kind ship). */
export function usesDeviceSign(source: SessionSource): boolean {
  return source === 'ledger'
}

/** Session-kind ship needs a software wallet. */
export function allowsSessionApproval(source: SessionSource): boolean {
  return source === 'privy'
}

export type WalletLike = {
  provider?: { request: (args: { method: string; params: unknown[] }) => Promise<unknown> }
  getEthereumProvider?: () => Promise<{
    request: (args: { method: string; params: unknown[] }) => Promise<unknown>
  }>
}

export async function walletProvider(
  wallets: readonly WalletLike[],
): Promise<WalletLike['provider'] | undefined> {
  const w = wallets[0]
  if (w?.getEthereumProvider) {
    try {
      return await w.getEthereumProvider()
    } catch {
      /* fall through */
    }
  }
  if (w?.provider) return w.provider
  if (typeof window !== 'undefined') {
    return (window as Window & { ethereum?: WalletLike['provider'] }).ethereum
  }
  return undefined
}
