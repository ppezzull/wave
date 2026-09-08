import { getFeed } from '@/lib/data'
import { ExploreFeed } from './explore-feed'

// Server-resolved feed: ranking runs on the server (never in the browser —
// see frontend.md §8). The tab toggle is the only client state.
export default async function ExplorePage() {
  const { ranked, unranked } = await getFeed()

  return <ExploreFeed ranked={ranked} unranked={unranked} />
}
