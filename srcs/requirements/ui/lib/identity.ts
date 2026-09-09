// Identity seam — the single place the UI derives a display identity from a
// wallet address.
//
// ENS used to be the identity layer; it is gone (ETHOnline continuity). This
// seam is the stable surface every consumer codes against so the replacement
// provider lands in ONE function, not across the components.
//
// AGENTKIT PLUG-IN POINT: swap identityFromAddress's body for a World
// AgentBook lookup — resolve handle + World ID verification from the address
// (server-side, cached) instead of the truncation fallback. Until then the
// seam stays pure and offline: truncated address, verifiedHuman false — never
// a fabricated name, never a fabricated verification.

export interface Identity {
  address: string
  /** Display handle — truncated address "0x1234…abcd" (no name source yet). */
  handle: string
  /** World ID "verified human" — true when AgentBook resolves the address. */
  verifiedHuman: boolean
  /** AgentBook anonymous human identifier (null when unverified/offline). */
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
