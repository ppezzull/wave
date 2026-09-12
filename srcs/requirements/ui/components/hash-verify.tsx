import { Check, AlertTriangle, Clock } from 'lucide-react'
import type { Strategy } from '@/lib/mock-data'
import { hashState, abbrevHash } from '@/lib/strategy/format'

// Hash-verify chip (frontend.md L101, Pietro.md L64).
// Two columns: the on-chain programHash vs the hash RECOMPILED from the post's
// description (lib/data/server.ts getStrategy). match → green ✓ — the post
// provably compiles to what is on-chain. mismatch → red MISMATCH (the post
// does not compile to the on-chain program; could be a rewritten post or
// parser drift — either way, do not trust the prose). pending → yellow while
// the derivation hasn't landed (no description / compile unavailable).

const STATE_META = {
  match: { color: '#1F9D6B', label: 'Match', Icon: Check },
  mismatch: { color: '#E5484D', label: 'MISMATCH', Icon: AlertTriangle },
  pending: { color: '#F5A623', label: 'Pending', Icon: Clock },
} as const

export function HashVerify({ strategy }: { strategy: Strategy }) {
  const state = hashState(strategy)
  const meta = STATE_META[state]
  const { Icon } = meta

  const rows = [
    { label: 'On-chain hash', value: abbrevHash(strategy.programHash) },
    { label: 'Committed hash', value: abbrevHash(strategy.ensProgramHash) },
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
          <p
            className="font-sans text-[13px] font-semibold mt-4 leading-relaxed"
            style={{ color: '#E5484D' }}
            role="alert"
          >
            MISMATCH — the post does not compile to the deployed program. This
            can mean an edited post, or a time-dependent instruction (the
            deadline block) rolling between compiles — the instruction table
            above shows the program as recompiled from the post today.
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
