'use client'

import type { Strategy } from '@/lib/mock-data'

// Safety — the compiler's REAL rule pass. The four numeric metrics this card
// used to show (monotonicity / symmetry / guard triggers / skew vs cap) were
// UI inventions: the compiler computes none of them. What it does compute is
// the rejection-rule pass (rule NAMES) and the canonicalization flag — those
// are rendered here, data not decoration.
export function SafetyCardDetail({ strategy }: { strategy: Strategy }) {
  const { safety } = strategy
  const isPending = !!safety.pending
  const isSafe = !isPending && safety.verdict === 'SAFE'
  const rules = safety.rulesApplied ?? []
  // Guard presence from the ACTUAL emitted program (opcode names) — not from
  // the rule-rewrite list, which only counts rewrites.
  const guardOpcodes = (strategy.bytecode ?? [])
    .filter((b) => /guard/i.test(b.opcode))
    .map((b) => b.opcode)

  return (
    <section aria-labelledby="safety-heading">
      <h2
        id="safety-heading"
        className="font-sans font-semibold text-[1rem] text-wave-text mb-3"
      >
        Safety
      </h2>

      <div
        className="rounded-[14px] px-6 py-5 animate-safety-reveal"
        style={{
          background: isPending ? '#71767B' : isSafe ? '#1F9D6B' : '#E5484D',
        }}
        role="status"
        aria-label={`Safety verdict: ${isPending ? 'PENDING' : safety.verdict}`}
      >
        <p className="font-sans font-extrabold text-[2rem] text-white mb-4 leading-none">
          {isPending ? 'PENDING' : safety.verdict}
        </p>

        {isPending ? (
          <p className="font-sans text-[13px] text-white/80">
            {strategy.description
              ? 'The compiler rule pass did not complete — nothing is inferred.'
              : 'No description to recompile — the rule pass cannot run.'}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <span className="font-sans text-[12px] font-medium text-white/70">
                  Rule rewrites
                </span>
                <span
                  className="font-mono font-bold text-white leading-none"
                  style={{ fontSize: '1.25rem' }}
                >
                  {rules.length}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-sans text-[12px] font-medium text-white/70">
                  Canonicalized
                </span>
                <span
                  className="font-mono font-bold text-white leading-none"
                  style={{ fontSize: '1.25rem' }}
                >
                  {safety.canonicalized ? 'yes' : 'no'}
                </span>
              </div>
            </div>
            {rules.length > 0 && (
              <ul className="flex flex-col gap-1" aria-label="Rules applied">
                {rules.map((r) => (
                  <li key={r} className="font-mono text-[11px] text-white/85 break-all">
                    {/guard/i.test(r) ? '⛨ ' : '✓ '}
                    {r}
                  </li>
                ))}
              </ul>
            )}
            <p className="font-sans text-[11px] text-white/60">
              {guardOpcodes.length > 0
                ? `Oracle guard in program: ${guardOpcodes.join(', ')}`
                : 'No oracle-guard instruction in this program (constant-product only).'}
            </p>
            <p className="font-sans text-[10px] text-white/60 mt-1">
              Deterministic compile-time rule pass (Zod → canonical → IR →
              bytecode). Quote-grid settle simulation not run.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
