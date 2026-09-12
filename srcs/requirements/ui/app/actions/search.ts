'use server'

// Search — the right-rail input's real data path. Subgraph description
// substring match (or author lookup for a bare address). Server-side so the
// browser never sees the GraphQL endpoint (frontend.md §8).
import { subgraph } from '@/lib/clients/subgraph'

export async function searchStrategies(
  q: string,
): Promise<Array<{ id: string; description: string; author: string }>> {
  return subgraph.searchStrategies(q, 5)
}
