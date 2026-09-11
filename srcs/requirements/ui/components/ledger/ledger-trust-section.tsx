'use client'

// Ledger trust section (Settings) — gate mode, the pinned approver address,
// and the in-app pairing helper: derives the device's ETH address with NO
// device tap (checkOnDevice: false) so it can be copied into
// LEDGER_APPROVER_ADDRESS. Replaces the old World trust panel.
import { useEffect, useState } from 'react'
import { useLedgerApproval } from '@/hooks/use-ledger-approval'
import { approvalGateConfig } from '@/app/actions/ship'

export function LedgerTrustSection() {
  const ledger = useLedgerApproval()
  const [gate, setGate] = useState<{ mode: string; approverAddress: string }>()
  const [paired, setPaired] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    approvalGateConfig().then(setGate).catch(() => {})
  }, [])

  const pair = async () => {
    setError(undefined)
    setPaired(undefined)
    try {
      // Connect first (browser picker — user gesture), then derive.
      await ledger.requestApproval({ message: 'wave pairing' }) // walks connect+app-open
      setPaired(await ledger.getDeviceAddress())
    } catch {
      setError('Could not read the device address. Reconnect the Ledger and try again.')
    }
  }

  return (
    <section aria-labelledby="ledger-heading">
      <h2
        id="ledger-heading"
        className="font-sans font-semibold text-[1rem] text-wave-text mb-3"
      >
        Ledger trust
      </h2>
      <div className="h-px bg-wave-border mb-5" aria-hidden="true" />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-wave-border bg-wave-surface px-3 py-2.5">
          <span className="font-sans text-[14px] text-wave-text">Approval gate</span>
          <span className="font-mono text-[13px] text-wave-muted">{gate?.mode ?? '…'}</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-wave-border bg-wave-surface px-3 py-2.5">
          <span className="font-sans text-[14px] text-wave-text">Pinned approver</span>
          <span className="font-mono text-[13px] text-wave-muted truncate">
            {gate?.approverAddress
              ? `${gate.approverAddress.slice(0, 8)}…${gate.approverAddress.slice(-6)}`
              : 'not set'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void pair()}
          className="self-start px-4 py-2 rounded-[10px] font-sans text-[13px] font-semibold min-h-[40px]"
          style={{ border: '1px solid #2A9D8F', color: '#2A9D8F' }}
          aria-label="Pair the Ledger device to read its approver address"
        >
          Pair device
        </button>
        {paired && (
          <p className="font-mono text-[12px] text-wave-muted break-all" data-testid="ledger-paired-address">
            device address: {paired}
          </p>
        )}
        {error && <p className="font-sans text-[12px]" style={{ color: '#E5484D' }}>{error}</p>}
        {gate?.mode === 'off' && (
          <p className="font-sans text-[12px] text-wave-muted">
            Gate off — ships need no signature. Set LEDGER_GATE=session|device to arm it.
          </p>
        )}
      </div>
    </section>
  )
}
