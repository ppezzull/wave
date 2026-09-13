'use server'

// Avatar actions — pin the image to IPFS, then relay the CID on-chain so
// The Graph can index Author.avatarCid. The bytes never go on-chain.

import { normalizeCid } from '@/lib/ipfs'

const AGENT_URL = process.env.AGENT_URL ?? 'http://127.0.0.1:3002'
const STORE_TIMEOUT_MS = 120_000
const MAX_AVATAR_BYTES = 1_500_000

export interface AvatarPinResult {
  ok: boolean
  cid?: string
  reason?: string
}

export interface AvatarPublishResult {
  ok: boolean
  txHash?: string
  cid?: string
  reason?: string
}

/** Pin a JPEG/PNG/WebP to IPFS via Pinata (PINATA_JWT). Returns the CID. */
export async function pinAvatarFile(formData: FormData): Promise<AvatarPinResult> {
  const jwt = process.env.PINATA_JWT
  if (!jwt) {
    return {
      ok: false,
      reason: 'IPFS pin is not configured (set PINATA_JWT). You can still paste an ipfs:// CID.',
    }
  }
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, reason: 'Choose an image file first.' }
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, reason: 'Avatar must be under 1.5 MB.' }
  }
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
    return { ok: false, reason: 'Avatar must be a JPEG, PNG, WebP, or GIF.' }
  }
  try {
    const body = new FormData()
    body.append('file', file, file.name || 'avatar')
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body,
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      return { ok: false, reason: `IPFS pin failed (${res.status})` }
    }
    const json = (await res.json()) as { IpfsHash?: string }
    const cid = json.IpfsHash ? normalizeCid(json.IpfsHash) : null
    if (!cid) return { ok: false, reason: 'Pinata did not return a CID.' }
    return { ok: true, cid }
  } catch (err) {
    return { ok: false, reason: `IPFS pin failed: ${String(err).slice(0, 120)}` }
  }
}

/** Relay the CID on-chain via the agent's setAvatar tool (announcer pays gas). */
export async function publishAvatar(user: string, cidOrUrl: string): Promise<AvatarPublishResult> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(user)) {
    return { ok: false, reason: 'avatar: connect a wallet first' }
  }
  const cid = normalizeCid(cidOrUrl)
  if (!cid) {
    return { ok: false, reason: 'avatar: paste an ipfs:// CID or pin a file first' }
  }
  let res: Response
  try {
    res = await fetch(`${AGENT_URL}/api/tools/setAvatar/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { user, cid } }),
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    })
  } catch (err) {
    return { ok: false, reason: `agent unreachable: ${String(err).slice(0, 120)}` }
  }
  if (!res.ok) return { ok: false, reason: `agent error ${res.status}` }
  const json = (await res.json()) as {
    ok?: boolean
    txHash?: string
    error?: string
    output?: { ok?: boolean; txHash?: string; error?: string }
  }
  const out = json.output ?? json
  if (!out.ok) return { ok: false, reason: out.error ?? 'the avatar write failed' }
  return { ok: true, txHash: out.txHash, cid }
}

/** Latest avatar gateway URL from the active network's subgraph. '' = none yet. */
export async function getAuthorAvatarUrl(address: string): Promise<string> {
  const { getAuthorAvatarUrl: read } = await import('@/lib/data')
  return read(address)
}
