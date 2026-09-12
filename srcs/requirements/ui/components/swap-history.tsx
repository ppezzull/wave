import type { SubgraphSwap } from '@/lib/clients/subgraph'

// Recent swaps — straight from the subgraph's Swapped index for this strategy.
// Hidden entirely when empty (a strategy that never filled shows nothing, not
// a fake table). Only the fields the query actually selects are rendered.
function short(a: string): string {
  if (!a) return '—'
  try {
    const n = BigInt(a)
    // Raw units, human-scale for typical 18dp tokens; keep 4 significant digits.
    const s = n.toString()
    if (s.length > 18) return `${s.slice(0, s.length - 18) || '0'}.${s.slice(s.length - 18, s.length - 14)}`
    return s
  } catch {
    return a.slice(0, 10)
  }
}

export function SwapHistory({ swaps }: { swaps: SubgraphSwap[] }) {
  if (swaps.length === 0) return null
  return (
    <section aria-labelledby="swaps-heading">
      <h2
        id="swaps-heading"
        className="font-sans font-semibold text-[1rem] text-wave-text mb-3"
      >
        Recent swaps
      </h2>
      <div
        className="rounded-[12px] p-5 bg-wave-surface border border-wave-border overflow-x-auto"
        role="region"
        aria-label="Recent swaps for this strategy"
      >
        <table className="w-full border-collapse">
          <thead className="sr-only">
            <tr>
              <th>Amount in</th>
              <th>Amount out</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {swaps.slice(0, 10).map((s) => (
              <tr key={s.id} className="align-baseline">
                <td className="pr-4 pb-1.5 whitespace-nowrap font-mono text-[13px] text-wave-text">
                  {short(s.amountIn)}
                </td>
                <td className="pr-4 pb-1.5 whitespace-nowrap font-mono text-[13px] text-wave-muted">
                  → {short(s.amountOut)}
                </td>
                <td className="pb-1.5 whitespace-nowrap font-sans text-[12px] text-wave-muted">
                  {s.timestamp
                    ? new Date(s.timestamp * 1000).toLocaleString()
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
