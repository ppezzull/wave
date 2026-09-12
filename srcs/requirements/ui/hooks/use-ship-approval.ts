'use client'

// useShipApproval — the shared approval leg of the two-click ship, for BOTH
// surfaces (compose page + create drawer). Returns the approval object the
// agent verifies, or a terminal state the caller surfaces honestly.
//
//   device mode  → the Ledger Clear-Signs the hash-bound message (DMK)
//   session mode → the Privy session wallet personal_signs the same message
//   off          → null immediately (pre-gate behavior)
//
// The message binds sha256(canonicalJson(spec)) — a signature for one
// strategy never unlocks another.
import { useCallback, useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { useLedgerApproval, type LedgerPhase } from '@/hooks/use-ledger-approval'
import { approvalGateConfig } from '@/app/actions/ship'
import { actionHashOf, approvalMessage } from '@/lib/ledger'

export type ShipApproval =
  | { kind: 'device' | 'session'; address: string; message: string; signature: string }
  | undefined

export interface ObtainApprovalResult {
  ok: boolean
  approval?: ShipApproval
  /** Honest, user-facing reason when ok is false. */
  reason?: string
  /** Raw DMK / classifier detail — shown under the reason, never used as the title. */
  debug?: string
}

export function useShipApproval() {
  const ledger = useLedgerApproval()
  const { wallets } = useWallets()
  const [gateMode, setGateMode] = useState<'off' | 'session' | 'device'>('off')

  const refreshGate = useCallback(async () => {
    const cfg = await approvalGateConfig()
    setGateMode(cfg.mode)
    return cfg
  }, [])

  /**
   * Obtain the approval for this exact spec. MUST be called inside the
   * ship-confirm click handler (WebHID gesture requirement in device mode).
   */
  const obtainApproval = useCallback(
    async (
      spec: unknown,
      description: string,
      sessionAddress: string | undefined,
    ): Promise<ObtainApprovalResult> => {
      const gate = await refreshGate()
      if (gate.mode === 'off') return { ok: true } // no approval needed
      const message = approvalMessage(await actionHashOf(spec), description)

      if (gate.mode === 'device') {
        const res = await ledger.requestApproval({ message, expectedAddress: gate.approverAddress })
        if (res.status === 'rejected') {
          return {
            ok: false,
            reason: res.reason ?? 'Cancelled on device — nothing was shipped.',
            debug: res.debug,
          }
        }
        if (res.status === 'error' || !res.address || !res.signature) {
          return {
            ok: false,
            reason: res.reason ?? 'Ledger approval failed — nothing was shipped.',
            debug: res.debug,
          }
        }
        return {
          ok: true,
          approval: { kind: 'device', address: res.address, message, signature: res.signature },
        }
      }

      // session mode — the connected wallet signs the same message
      if (!sessionAddress) {
        return { ok: false, reason: 'Connect your wallet to approve the ship.' }
      }
      // Privy's wrapped provider first; the raw injected provider as fallback
      // (same EIP-1193 surface — some connectors expose it only via window.ethereum).
      const provider =
        wallets[0]?.provider ?? (typeof window !== 'undefined' ? window.ethereum : undefined)
      if (!provider) {
        return { ok: false, reason: 'No connected wallet available to sign the approval.' }
      }
      try {
        const signature = (await provider.request({
          method: 'personal_sign',
          params: [message, sessionAddress],
        })) as string
        return {
          ok: true,
          approval: { kind: 'session', address: sessionAddress, message, signature },
        }
      } catch (err) {
        return {
          ok: false,
          reason: `Wallet approval failed: ${String((err as Error)?.message ?? err).slice(0, 120)}`,
        }
      }
    },
    [ledger, refreshGate, wallets],
  )

  return {
    gateMode,
    obtainApproval,
    ledgerPhase: ledger.phase,
    ledgerReason: ledger.reason,
    ledgerDebug: ledger.debug,
    resetLedger: ledger.reset,
  }
}

export type { LedgerPhase }
