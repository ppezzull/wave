'use client'

// useChatVault — back up / restore the conversation archive ON-CHAIN, private
// by client-side encryption. One wallet signature derives the AES-256-GCM key
// (domain-separated message); only ciphertext is relayed (the agent's
// storeChatVault tool → ChatVault on Sepolia, announcer pays gas); restore
// reads the user's highest-nonce row from the subgraph and decrypts locally.
//
// Determinism note: both signer paths (Privy/MetaMask personal_sign and the
// Ledger device) return DETERMINISTIC signatures for the same message+account
// — the derived key is stable, so the same wallet always unlocks the same
// vault. That is the standard "signature as key material" pattern.
import { useCallback, useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { useSessionUser } from './use-session-user'
import { useLedgerApproval } from './use-ledger-approval'
import { usesDeviceSign, usesWalletSign, walletProvider } from '@/lib/session'
import { deriveVaultKey, encryptVaultPayload, decryptVaultPayload, hexToB64 } from '@/lib/chat-vault'
import { readArchive, mergeChats, CHAT_ARCHIVE_EVENT } from '@/lib/chat-archive'
import { storeChatVaultOnChain, getLatestChatVault } from '@/app/actions/chatVault'

export type VaultPhase = 'idle' | 'signing' | 'working' | 'done' | 'error'

export function useChatVault() {
  const { sessionUser, source } = useSessionUser()
  const { wallets } = useWallets()
  const ledger = useLedgerApproval()
  const [phase, setPhase] = useState<VaultPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastTx, setLastTx] = useState<string | null>(null)

  /** Sign path comes from resolveSession — do not re-check Privy here. */
  const sign = useCallback(
    async (message: string): Promise<string> => {
      if (usesDeviceSign(source)) {
        const r = await ledger.requestApproval({ message })
        if (r.status !== 'approved' || !r.signature) {
          throw new Error(r.reason ?? 'the device signature was declined')
        }
        return r.signature
      }
      if (!usesWalletSign(source) || !sessionUser) {
        throw new Error(
          source === 'local'
            ? 'the local account has no signer — ChatVault needs a wallet or Ledger'
            : 'no connected wallet to sign with',
        )
      }
      const provider = await walletProvider(wallets)
      if (!provider) throw new Error('no connected wallet to sign with')
      return (await provider.request({
        method: 'personal_sign',
        params: [message, sessionUser.address],
      })) as string
    },
    [source, wallets, sessionUser, ledger],
  )

  /** Back the local archive up on-chain. One signature → encrypt → relay. */
  const backup = useCallback(async (): Promise<string | null> => {
    if (!sessionUser) {
      setError('sign in first — the vault key comes from your wallet')
      setPhase('error')
      return null
    }
    const archive = readArchive()
    if (archive.length === 0) {
      setError('nothing to back up yet — save a conversation first')
      setPhase('error')
      return null
    }
    setPhase('signing')
    setError(null)
    try {
      const key = await deriveVaultKey(sign, sessionUser.address)
      // The portable export format — the same file Import reads.
      const json = JSON.stringify({ app: 'wave', version: 1, chats: archive })
      const ciphertext = await encryptVaultPayload(json, key)
      setPhase('working')
      const r = await storeChatVaultOnChain(sessionUser.address, ciphertext)
      if (!r.ok) throw new Error(r.reason ?? 'the on-chain write failed')
      setLastTx(r.txHash ?? null)
      setPhase('done')
      return r.txHash ?? null
    } catch (e) {
      setError(String((e as Error).message ?? e).slice(0, 160))
      setPhase('error')
      return null
    }
  }, [sessionUser, sign])

  /** Restore the latest on-chain backup into the local archive (merge). */
  const restore = useCallback(async (): Promise<number | null> => {
    if (!sessionUser) {
      setError('sign in first — the vault key comes from your wallet')
      setPhase('error')
      return null
    }
    setPhase('working')
    setError(null)
    try {
      const latest = await getLatestChatVault(sessionUser.address)
      if (!latest) {
        throw new Error('no on-chain backup found for this wallet (on this network)')
      }
      setPhase('signing')
      const key = await deriveVaultKey(sign, sessionUser.address)
      const json = await decryptVaultPayload(hexToB64(latest.ciphertextHex), key)
      const parsed = JSON.parse(json) as { app?: string; chats?: unknown }
      if (parsed.app !== 'wave' || !Array.isArray(parsed.chats)) {
        throw new Error('the backup is not a wave archive')
      }
      const merged = mergeChats(parsed.chats)
      window.dispatchEvent(new CustomEvent(CHAT_ARCHIVE_EVENT))
      setPhase('done')
      return merged
    } catch (e) {
      setError(
        /OperationError|decrypt/i.test(String((e as Error).message))
          ? 'wrong wallet — this backup was encrypted with a different signature'
          : String((e as Error).message ?? e).slice(0, 160),
      )
      setPhase('error')
      return null
    }
  }, [sessionUser, sign])

  const reset = useCallback(() => {
    setPhase('idle')
    setError(null)
  }, [])

  return { phase, error, lastTx, backup, restore, reset, devicePhase: ledger.phase }
}
