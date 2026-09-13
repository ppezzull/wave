'use client'

// useShipApproval — the shared approval leg of the two-click ship. The CALLER
// picks the identity per ship (the approval kind), the gate mode says which
// kinds are allowed:
//
//   device  → the Ledger Clear-Signs the hash-bound message (DMK); the
//              strategy is AUTHORED by the device — the Ledger is the pool
//              account, not a delegation from the session wallet
//   session → the connected wallet personal_signs the same message
//   both    → either, chosen at the confirm click (the prod default)
//   off     → null immediately (kill-switch, pre-gate behavior)
//
// The message binds sha256(canonicalJson(spec)) — a signature for one
// strategy never unlocks another.
import { useCallback, useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { useLedgerApproval, type LedgerPhase } from '@/hooks/use-ledger-approval'
import { approvalGateConfig } from '@/app/actions/ship'
import { actionHashOf, approvalMessage } from '@/lib/ledger'

export type GateMode = 'off' | 'session' | 'device' | 'both'
export type ApprovalKind = 'device' | 'session'

export type ShipApproval =
  | { kind: ApprovalKind; address: string; message: string; signature: string }
  | undefined

export interface ObtainApprovalResult {
  ok: boolean
  approval?: ShipApproval
  /** Honest, user-facing reason when ok is false. */
  reason?: string
  /** Raw DMK / classifier detail — shown under the reason, never used as the title. */
  debug?: string
}

/** Which identity kinds the gate mode allows. */
function allowedKinds(mode: GateMode): ApprovalKind[] {
  if (mode === 'both') return ['device', 'session']
  if (mode === 'device') return ['device']
  if (mode === 'session') return ['session']
  return []
}

export function useShipApproval() {
  const ledger = useLedgerApproval()
  const { wallets } = useWallets()
  const [gateMode, setGateMode] = useState<GateMode>('off')

  const refreshGate = useCallback(async () => {
    const cfg = await approvalGateConfig()
    setGateMode(cfg.mode)
    return cfg
  }, [])

  /**
   * Obtain the approval for this exact spec, as the CHOSEN identity. MUST be
   * called inside the ship-confirm click handler (WebHID gesture requirement
   * for the device kind).
   */
  const obtainApproval = useCallback(
    async (
      spec: unknown,
      description: string,
      sessionAddress: string | undefined,
      kind: ApprovalKind,
    ): Promise<ObtainApprovalResult> => {
      const gate = await refreshGate()
      if (gate.mode === 'off') return { ok: true } // no approval needed
      if (!allowedKinds(gate.mode).includes(kind)) {
        return {
          ok: false,
          reason: `This deployment does not accept ${kind}-kind approvals (LEDGER_GATE=${gate.mode}).`,
        }
      }
      const message = approvalMessage(await actionHashOf(spec), description)

      if (kind === 'device') {
        const res = await ledger.requestApproval({ message, expectedAddress: gate.approverAddress })
        if (res.status === 'rejected') {
          return {
            ok: false,
            reason: res.reason ?? 'Cancelled on device. Nothing was shipped.',
            debug: res.debug,
          }
        }
        if (res.status === 'error' || !res.address || !res.signature) {
          return {
            ok: false,
            reason: res.reason ?? 'Ledger approval failed. Nothing was shipped.',
            debug: res.debug,
          }
        }
        return {
          ok: true,
          approval: { kind: 'device', address: res.address, message, signature: res.signature },
        }
      }

      // session kind — the connected wallet signs the same message
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
    refreshGate,
    allowedKinds: allowedKinds(gateMode),
    obtainApproval,
    ledgerPhase: ledger.phase,
    ledgerReason: ledger.reason,
    ledgerDebug: ledger.debug,
    resetLedger: ledger.reset,
  }
}

export type { LedgerPhase }
