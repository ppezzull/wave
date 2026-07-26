import { ExternalLink } from 'lucide-react'
import type { Strategy } from '@/lib/mock-data'

// Retune evidence timeline (frontend.md L112). Reads strategy.retunes —
// live hydrateStrategy() leaves this [] until Flavio's graphDelta emits real
// EvidenceEntry rows (or /api/stream forwards them). Empty state is the truth.
export function RetuneHistory({ strategy }: { strategy: Strategy }) {
  const entries = strategy.retunes

  return (
    <section aria-labelledby="retune-heading">
      <div className="flex items-center gap-2 mb-4">
        <h2
          id="retune-heading"
          className="font-sans font-semibold text-[1rem] text-wave-text"
        >
          Retune History
        </h2>
        <span
          className="flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full font-sans text-[12px] font-medium text-black leading-none"
          style={{ background: '#2A9D8F' }}
          aria-label={`${entries.length} retune entries`}
        >
          {entries.length}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-[12px] px-5 py-8 text-center bg-wave-surface border border-wave-border">
          <p className="font-sans text-[14px] text-wave-muted">
            No retunes yet. This strategy is running exactly as shipped.
          </p>
        </div>
      ) : (
        <div
          className="flex flex-col"
          role="list"
          aria-label="Retune evidence history"
        >
          {entries.map((entry, i) => (
            <div
              key={i}
              className="flex items-stretch gap-4"
              role="listitem"
              aria-label={`Retune by ${entry.entity}: ${entry.delta} - ${entry.decision}`}
            >
              <div className="flex flex-col items-center shrink-0">
                <div
                  className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                  style={{
                    background:
                      entry.decision === 'Approved' ? '#1F9D6B' : '#E5484D',
                    border: `2px solid ${
                      entry.decision === 'Approved' ? '#1F9D6B' : '#E5484D'
                    }`,
                  }}
                  aria-hidden="true"
                />
                {i < entries.length - 1 && (
                  <div
                    className="flex-1 w-px mt-1"
                    style={{ background: '#2F3336', minHeight: '32px' }}
                    aria-hidden="true"
                  />
                )}
              </div>

              <div className="flex flex-col gap-1 pb-5 min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="font-mono text-[12px] text-wave-muted">
                    {entry.entity}
                  </span>
                  <span
                    className="font-mono text-[13px] font-medium"
                    style={{
                      color: entry.deltaPositive ? '#1F9D6B' : '#E5484D',
                    }}
                  >
                    {entry.delta}
                  </span>
                  <span className="font-sans text-[13px] text-wave-text">
                    {entry.decision}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[12px] text-wave-muted">
                    {entry.tx}
                  </span>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${entry.tx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-wave-muted hover:text-wave-text transition-colors"
                    aria-label={`View transaction ${entry.tx} on Sepolia Etherscan`}
                  >
                    <ExternalLink size={11} aria-hidden="true" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
