// Chat vault — on-chain conversation backups, private by CLIENT-SIDE
// encryption.
//
// The chain is public, so "scoped to user only" means: the user's wallet
// signs ONE domain-separated message, the signature becomes an AES-256-GCM
// key (SHA-256 → WebCrypto importKey), and ONLY ciphertext ever leaves the
// browser. The agent relays the blob on-chain (ChatVault.store, announcer
// pays gas); the subgraph indexes it by user; restore = latest nonce,
// decrypted locally with the same one-signature key.
//
// ⚠️ Key derivation is DOMAIN-SEPARATED from every other signature in the
// app (approvals: "wave HITL approval [...]"; sign-in: "wave sign-in [...]").
// A vault signature can never be replayed as an approval.
'use client'

export interface VaultKey {
  key: CryptoKey
}

/** The deterministic, domain-separated message the wallet signs to derive
 *  the vault key. ASCII-only (the Ledger DMK frames by string length). */
export function vaultKeyMessage(address: string): string {
  return `wave chat vault key v1 -- ${address}`
}

/** Derive the AES-256-GCM key from a wallet signature. `sign` produces an
 *  EIP-191 personal_sign signature (Ledger clear-sign or wallet popup) —
 *  the signature IS the key material and never leaves this function. */
export async function deriveVaultKey(
  sign: (message: string) => Promise<string>,
  address: string,
): Promise<VaultKey> {
  const signature = await sign(vaultKeyMessage(address))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature))
  const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
  return { key }
}

// ── Blob format: base64(JSON{iv, ct}) — exactly what the agent relays ───────

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** Encrypt the archive JSON — AES-GCM with a fresh 12-byte IV. */
export async function encryptVaultPayload(json: string, { key }: VaultKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(json),
  )
  return toB64(new TextEncoder().encode(JSON.stringify({ iv: toB64(iv), ct: toB64(ct) })))
}

/** Decrypt a vault payload. Throws on the WRONG key (AES-GCM auth failure) —
 *  the caller surfaces an honest "wrong wallet" error, never partial data. */
export async function decryptVaultPayload(
  b64: string,
  { key }: VaultKey,
): Promise<string> {
  const { iv, ct } = JSON.parse(new TextDecoder().decode(fromB64(b64))) as {
    iv: string
    ct: string
  }
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(iv) },
    key,
    fromB64(ct),
  )
  return new TextDecoder().decode(plain)
}

/** The subgraph stores ciphertext as raw hex bytes — convert to our base64
 *  blob format before decrypting. */
export function hexToB64(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return toB64(bytes)
}
