// LedgerApprovalPanel — presentational status line for the device flow.
// Dropped next to the ship button in both ship surfaces; no logic lives here.
import type { LedgerPhase } from '@/hooks/use-ledger-approval'

const LABELS: Record<LedgerPhase, { text: string; color: string; pulse?: boolean }> = {
  idle: { text: 'Hardware approval required to ship.', color: '#8b9dc3' },
  connecting: { text: 'Select your Ledger in the browser prompt…', color: '#2A9D8F', pulse: true },
  'ready-on-device': { text: 'Unlock your Ledger (enter your PIN) if prompted.', color: '#2A9D8F', pulse: true },
  'app-opening': { text: 'Confirm opening the Ethereum app on your Ledger.', color: '#2A9D8F', pulse: true },
  'sign-on-device': {
    text: 'Review the approval message on your Ledger, then press to sign.',
    color: '#2A9D8F',
    pulse: true,
  },
  approved: { text: 'Approved on device — shipping…', color: '#2A9D8F' },
  rejected: { text: 'Cancelled on device — nothing was shipped.', color: '#E5A458' },
  error: { text: '', color: '#E5484D' }, // filled from reason
}

export function LedgerApprovalPanel({ phase, reason }: { phase: LedgerPhase; reason?: string }) {
  if (phase === 'idle') return null
  const l = LABELS[phase]
  const text = phase === 'error' ? (reason ?? 'Unexpected Ledger error.') : l.text
  return (
    <div
      className="flex items-center gap-2 font-sans text-[13px]"
      style={{ color: l.color }}
      role="status"
      aria-live="polite"
      aria-label={`Ledger approval: ${text}`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${l.pulse ? 'animate-pulse' : ''}`}
        style={{ background: l.color }}
        aria-hidden="true"
      />
      <span>{text}</span>
    </div>
  )
}
