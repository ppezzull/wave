import { getStrategyKeywords } from '@/lib/data/server'
import { WhatsNewTags } from '@/components/whats-new'

// Streams into the left rail. Must NOT be awaited in the layout — that
// blocked every page behind a full subgraph scan (frontend.md §8).
export async function RailKeywords() {
  const keywords = await getStrategyKeywords(8).catch(() => [])
  return <WhatsNewTags keywords={keywords} />
}
