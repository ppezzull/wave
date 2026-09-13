/** IPFS CID helpers. The Graph stores the bare CID; the UI renders via a gateway. */

const CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z0-9]{20,})$/

export function normalizeCid(raw: string): string | null {
  const stripped =
    raw
      .trim()
      .replace(/^ipfs:\/\//i, '')
      .replace(/^https?:\/\/[^/]+\/ipfs\//i, '')
      .split(/[/?#]/)[0] ?? ''
  return CID_RE.test(stripped) ? stripped : null
}

export function ipfsGatewayUrl(cid: string): string {
  const gateway = (process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? 'https://ipfs.io/ipfs').replace(/\/$/, '')
  return `${gateway}/${cid}`
}
