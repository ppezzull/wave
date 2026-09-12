import { Suspense } from 'react'
import { getFeed } from '@/lib/data'
import { ExploreFeed } from './explore-feed'
import { FeedSkeleton } from '@/components/skeleton'

// Per-request SSR — the feed must never be baked into the build image.
export const dynamic = 'force-dynamic'

// Server-resolved feed: ranking runs on the server (never in the browser —
// see frontend.md §8). The tab toggle is the only client state. The feed
// STREAMS: the page shell renders instantly, skeleton rows hold the layout
// while getFeed resolves (micro-SSR on the data section).
//
// force-dynamic: without it Next prerenders this page at BUILD time — the
// feed would be frozen at whatever the subgraph said during the image build.
async function FeedSection() {
  const { ranked, unranked } = await getFeed()
  return <ExploreFeed ranked={ranked} unranked={unranked} />
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<FeedSkeleton rows={6} />}>
      <FeedSection />
    </Suspense>
  )
}
