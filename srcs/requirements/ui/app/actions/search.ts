'use server'

// Search — the right-rail input's real data path. Subgraph description
// substring match (or author lookup for a bare address). Server-side so the
// browser never sees the GraphQL endpoint (frontend.md §8).
import { subgraphFor } from '@/lib/clients/subgraph'
import { currentNetwork } from '@/lib/networks'

export async function searchStrategies(
  q: string,
): Promise<Array<{ id: string; description: string; author: string }>> {
  const net = await currentNetwork()
  return subgraphFor(net.subgraphUrl).searchStrategies(q, 5)
}
