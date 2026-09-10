// World publish gate — shared constants and types (no directive: this module
// is imported by both the client hook and the server actions). Environment
// overrides only resolve correctly on the server; the client never reads them
// directly — it fetches the resolved config from the worldPublishConfig server
// action, so the portal app's truth lives in exactly one place.

export const WORLD_PUBLISH_ACTION = process.env.WORLD_PUBLISH_ACTION ?? 'proofofhuman'

export interface WorldPublishConfig {
  gateOn: boolean
  devAllow: boolean
  appId: string
  /** Verification action the portal app expects (server-resolved). */
  action: string
  /** IDKit environment — 'staging' for the simulator during the event, 'production' at submission. */
  idkitEnv: 'production' | 'staging' | 'sandbox'
}

export interface WorldRpContext {
  rp_id: string
  nonce: string
  created_at: number
  expires_at: number
  signature: string
}
