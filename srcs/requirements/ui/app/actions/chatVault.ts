'use server'

// Chat vault server actions — the relay (→ agent tool) and the restore read
// (→ active network's subgraph). The PLAINTEXT and the derived key never
// touch this file: the client encrypts before calling store, and decrypts
// after getLatest returns ciphertext.

const AGENT_URL = process.env.AGENT_URL ?? 'http://127.0.0.1:3002'
const STORE_TIMEOUT_MS = 120_000 // on-chain write + receipt wait

export interface VaultStoreResult {
  ok: boolean
  txHash?: string
  reason?: string
}

/** Relay the ENCRYPTED archive on-chain via the agent's storeChatVault tool
 *  (the announcer EOA pays gas). Input is base64 ciphertext only. */
export async function storeChatVaultOnChain(
  user: string,
  ciphertext: string,
): Promise<VaultStoreResult> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(user)) {
    return { ok: false, reason: 'chat vault: user must be a 0x…40-hex address' }
  }
  let res: Response
  try {
    res = await fetch(`${AGENT_URL}/api/tools/storeChatVault/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { user, ciphertext } }),
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    })
  } catch (err) {
    return { ok: false, reason: `agent unreachable: ${String(err).slice(0, 120)}` }
  }
  if (!res.ok) {
    return { ok: false, reason: `agent error ${res.status}` }
  }
  const json = (await res.json()) as {
    ok?: boolean
    txHash?: string
    error?: string
    output?: { ok?: boolean; txHash?: string; error?: string }
  }
  const out = json.output ?? json
  if (!out.ok) return { ok: false, reason: out.error ?? 'the vault write failed' }
  return { ok: true, txHash: out.txHash }
}

export interface LatestVault {
  /** Raw hex ciphertext (subgraph Bytes) — hexToB64 before decrypting. */
  ciphertextHex: string
  nonce: string
  timestamp: string
  txHash: string
}

/** The user's latest on-chain backup from the ACTIVE network's subgraph.
 *  null = no backup indexed (yet — Studio can lag a block or two). */
export async function getLatestChatVault(user: string): Promise<LatestVault | null> {
  const { getLatestChatVault: read } = await import('@/lib/data')
  return read(user)
}
