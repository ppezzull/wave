import { Suspense } from 'react'
import Link from 'next/link'
import { getStrategy, getDerivedStrategy, getSwapHistory, listStrategyIds } from '@/lib/data'
import { StrategyCard } from '@/components/strategy-card'
import { Footer } from '@/components/footer'
import { SafetyCardDetail } from '@/components/safety-card-detail'
import { BytecodePane } from '@/components/bytecode-pane'
import { HashVerify } from '@/components/hash-verify'
import { RetuneHistory } from '@/components/retune-history'
import { StreamNotifications } from '@/components/stream-notifications'
import { SwapHistory } from '@/components/swap-history'
import { DetailPanelsSkeleton, PanelSkeleton } from '@/components/skeleton'

export const dynamic = 'force-dynamic'
export const dynamicParams = true

export async function generateStaticParams() {
  return (await listStrategyIds()).map((id) => ({ id }))
}

interface Props {
  params: Promise<{ id: string }>
}

/** Slow panels: bytecode + safety + hash-verify recompile the POST through
 *  the deterministic compiler (~5s first view, cached after) — they stream in
 *  their own Suspense boundary while the base card renders instantly. */
async function DerivedPanels({ id }: { id: string }) {
  const derived = await getDerivedStrategy(id)
  if (!derived) return null
  return (
    <>
      <BytecodePane strategy={derived} />
      <SafetyCardDetail strategy={derived} />
      <HashVerify strategy={derived} />
    </>
  )
}

/** Swap fills stream separately — the Swapped index is independent of the
 *  recompile. SwapHistory renders null when empty (honest, not a fake table). */
async function SwapsSection({ id }: { id: string }) {
  const swaps = await getSwapHistory(id, 10).catch(() => [])
  return <SwapHistory swaps={swaps} />
}

export default async function StrategyDetailPage({ params }: Props) {
  const { id } = await params
  const strategy = await getStrategy(id)

  if (!strategy) {
    return (
      <>
        <section className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
          <h1 className="font-sans font-bold text-[1.5rem] text-wave-text mb-2">
            Strategy not found
          </h1>
          <p className="font-sans text-[15px] text-wave-muted mb-6 max-w-sm">
            This strategy may have been removed, or the link is incorrect.
          </p>
          <Link
            href="/explore"
            className="font-sans text-[14px] font-semibold underline underline-offset-4"
            style={{ color: '#2A9D8F' }}
          >
            Back to Explore
          </Link>
        </section>
        <Footer />
      </>
    )
  }

  return (
    <>
      <div className="flex-1 px-4 py-6">
        <div className="w-full flex flex-col gap-6">
          <StreamNotifications />
          <StrategyCard strategy={strategy} isDetailed />

          {/* Oracle band: only when the strategy actually carries one — no
              labeled blank rows for data that doesn't exist. */}
          {strategy.oracleBand ? (
            <div
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[12px] px-4 py-3"
              style={{ background: '#16181C', border: '1px solid #2F3336' }}
            >
              <span className="font-sans text-[12px] text-wave-muted">Oracle band</span>
              <span className="font-sans text-[11px] text-wave-muted">
                (intent record)
              </span>
              <span className="font-mono text-[13px] text-wave-text ml-auto">
                {strategy.oracleBand}
              </span>
            </div>
          ) : null}

          {/* Streaming sections: shells above render instantly; these fill as
              their server data resolves (micro-SSR per data section). */}
          <Suspense fallback={<DetailPanelsSkeleton />}>
            <DerivedPanels id={id} />
          </Suspense>
          <Suspense fallback={<PanelSkeleton lines={3} label="Loading swaps" />}>
            <SwapsSection id={id} />
          </Suspense>

          <RetuneHistory strategy={strategy} />
        </div>
      </div>
      <Footer />
    </>
  )
}
