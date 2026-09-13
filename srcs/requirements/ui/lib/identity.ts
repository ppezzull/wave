// Identity seam — the single place the UI derives a display identity from a
// wallet address.
//
// ENS used to be the identity layer; it is gone (ETHOnline continuity). This
// seam is the stable surface every consumer codes against so the replacement
// provider lands in ONE function, not across the components.
//
// PLUG-IN POINT: swap identityFromAddress's body for a trust resolver
// (e.g. a Ledger-backed attestation) when one exists
// (server-side, cached) instead of the truncation fallback. Until then the
// seam stays pure and offline: truncated address, verifiedHuman false — never
// a fabricated name, never a fabricated verification.

export interface Identity {
  address: string
  /** Display handle — truncated address "0x1234…abcd" (no name source yet). */
  handle: string
  /** Hardware-backed "verified human" — false until a trust resolver exists. */
  verifiedHuman: boolean
  /** Anonymous human identifier from a trust resolver (null when none). */
  humanId?: string | null
}

/** Derive the Identity for a wallet address (pure, offline, never throws). */
export function identityFromAddress(address: string): Identity {
  const handle =
    address.length >= 10
      ? `${address.slice(0, 6)}…${address.slice(-4)}`
      : address
  return { address, handle, verifiedHuman: false, humanId: null }
}
