import Link from 'next/link'
import { getStrategy, listStrategyIds } from '@/lib/data'
import { StrategyCard } from '@/components/strategy-card'
import { Footer } from '@/components/footer'
import { SafetyCardDetail } from '@/components/safety-card-detail'
import { BytecodePane } from '@/components/bytecode-pane'
import { HashVerify } from '@/components/hash-verify'
import { RetuneHistory } from '@/components/retune-history'
import { StreamNotifications } from '@/components/stream-notifications'

export const dynamic = 'force-dynamic'
export const dynamicParams = true

export async function generateStaticParams() {
  return (await listStrategyIds()).map((id) => ({ id }))
}

interface Props {
  params: Promise<{ id: string }>
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

          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[12px] px-4 py-3"
            style={{ background: '#16181C', border: '1px solid #2F3336' }}
          >
            <span className="font-sans text-[12px] text-wave-muted">Oracle band</span>
            <span className="font-sans text-[11px] text-wave-muted">
              (ENS intent record)
            </span>
            <span className="font-mono text-[13px] text-wave-text ml-auto">
              {strategy.oracleBand}
            </span>
          </div>

          <BytecodePane strategy={strategy} />
          <SafetyCardDetail strategy={strategy} />
          <HashVerify strategy={strategy} />
          <RetuneHistory strategy={strategy} />
        </div>
      </div>
      <Footer />
    </>
  )
}
