import { getFeed, getFollowedStrategies } from '@/lib/data'
import { ExploreFeed } from './explore-feed'

// Server-resolved feed: ranking + ENS hydration run on the server (never in the
// browser — see frontend.md §8). The tab toggle is the only client state.
export default async function ExplorePage() {
  const [{ ranked, unranked }, following] = await Promise.all([
    getFeed(),
    getFollowedStrategies(),
  ])

  return (
    <ExploreFeed ranked={ranked} unranked={unranked} following={following} />
  )
}
