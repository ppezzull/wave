import { Check, AlertTriangle, Clock } from 'lucide-react'
import { type Strategy, hashState, abbrevHash } from '@/lib/mock-data'

const STATE_META = {
  match: { color: '#1F9D6B', label: 'Match', Icon: Check },
  mismatch: { color: '#E5484D', label: 'Mismatch', Icon: AlertTriangle },
  pending: { color: '#F5A623', label: 'Pending', Icon: Clock },
} as const

export function HashVerify({ strategy }: { strategy: Strategy }) {
  const state = hashState(strategy)
  const meta = STATE_META[state]
  const { Icon } = meta

  const rows = [
    { label: 'On-chain hash', value: abbrevHash(strategy.programHash) },
    { label: 'ENS record hash', value: abbrevHash(strategy.ensProgramHash) },
  ]

  return (
    <section aria-labelledby="hash-verify-heading">
      <h2
        id="hash-verify-heading"
        className="font-sans font-semibold text-[1rem] text-wave-text mb-3"
      >
        Hash Verification
      </h2>

      <div className="rounded-[12px] p-5 bg-wave-surface border border-wave-border">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {rows.map((row, i) => (
            <div key={row.label} className="flex flex-col gap-2">
              {i === 1 && (
                <div className="sm:hidden h-px bg-wave-border" aria-hidden="true" />
              )}
              <span className="font-sans text-[12px] text-wave-muted">
                {row.label}
              </span>
              <span className="font-mono text-[12px] text-wave-text break-all">
                {row.value}
              </span>
              <div
                className="flex items-center gap-1.5"
                aria-label={`${row.label} ${meta.label.toLowerCase()}`}
              >
                <Icon
                  size={14}
                  strokeWidth={2.5}
                  style={{ color: meta.color }}
                  aria-hidden="true"
                />
                <span
                  className="font-sans text-[13px] font-semibold"
                  style={{ color: meta.color }}
                >
                  {meta.label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {state === 'mismatch' && (
          <p className="font-sans text-[13px] text-wave-muted mt-4 leading-relaxed">
            The deployed bytecode hash does not match the hash committed in the
            ENS record. Treat this strategy as tampered.
          </p>
        )}
        {state === 'pending' && (
          <p className="font-sans text-[13px] text-wave-muted mt-4 leading-relaxed">
            This strategy has not been wired on-chain yet. Verification will
            complete once the program hash is emitted.
          </p>
        )}
      </div>
    </section>
  )
}
