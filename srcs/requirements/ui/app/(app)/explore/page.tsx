import { Suspense } from 'react'
import { getFeed, getSimilarFeed } from '@/lib/data'
import { feedPulseSig } from '@/lib/feed-pulse'
import { readSessionCookie } from '@/lib/session-cookie'
import { ExploreFeed } from './explore-feed'
import { MicroSkeleton } from '@/components/skeleton'
import { NewActivityBanner } from '@/components/new-activity-banner'

// Per-request SSR — the feed must never be baked into the build image.
export const dynamic = 'force-dynamic'

// Server-resolved feed: ranking runs on the server (never in the browser —
// see frontend.md §8). The tab toggle is the only client state. The feed
// STREAMS: the page shell renders instantly, a centered AutoSkeleton holds
// the slot while getFeed resolves (micro-SSR on the data section).
//
// force-dynamic: without it Next prerenders this page at BUILD time — the
// feed would be frozen at whatever the subgraph said during the image build.
async function FeedSection() {
  // The feed and its pulse signature resolve TOGETHER — the banner starts
  // from the exact truth this render shows, so it only signals later change.
  // Similar ranking runs here too when the session cookie is present —
  // no client hook + server action after paint.
  const hint = await readSessionCookie()
  const [{ ranked, unranked }, sig, similar] = await Promise.all([
    getFeed(),
    feedPulseSig(),
    hint?.address ? getSimilarFeed(hint.address) : Promise.resolve(undefined),
  ])
  return (
    <>
      <NewActivityBanner sig={sig} />
      <ExploreFeed ranked={ranked} unranked={unranked} similar={similar} />
    </>
  )
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<MicroSkeleton label="Loading strategies" />}>
      <FeedSection />
    </Suspense>
  )
}
