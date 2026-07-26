'use client'

import type { Strategy } from '@/lib/mock-data'

export function SafetyCardDetail({ strategy }: { strategy: Strategy }) {
  const { safety } = strategy
  const isSafe = safety.verdict === 'SAFE'

  const metrics = [
    { label: 'Monotonicity', value: safety.monotonicity.toFixed(2) },
    { label: 'Symmetry', value: safety.symmetry },
    { label: 'Guard Triggers', value: String(safety.guardTriggers) },
    { label: 'Skew vs Cap', value: safety.skewVsCap.toFixed(2) },
  ]

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
        style={{ background: isSafe ? '#1F9D6B' : '#E5484D' }}
        role="status"
        aria-label={`Safety verdict: ${safety.verdict}`}
      >
        <p className="font-sans font-extrabold text-[2rem] text-white mb-5 leading-none">
          {safety.verdict}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {metrics.map((m) => (
            <div key={m.label} className="flex flex-col gap-1">
              <span className="font-sans text-[12px] font-medium text-white/70">
                {m.label}
              </span>
              <span
                className="font-mono font-bold text-white leading-none"
                style={{ fontSize: '1.25rem' }}
                aria-label={`${m.label}: ${m.value}`}
              >
                {m.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
