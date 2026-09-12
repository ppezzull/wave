'use server'

// The personalized feed action — the browser passes the session wallet, the
// server computes similarity against that wallet's deployed descriptions
// (subgraph + lib/similarity.ts, all server-side; frontend.md §8). Strategy
// rows are plain serializable objects, so the full match list crosses the
// action boundary — the client doesn't re-derive anything.
import { getSimilarFeed } from '@/lib/data'
import type { Strategy } from '@/lib/data'

export interface SimilarMatch {
  strategy: Strategy
  /** Cosine similarity to the wallet's closest own description, 0-100. */
  matchPct: number
}

export async function similarFeed(address: string): Promise<SimilarMatch[] | null> {
  return getSimilarFeed(address)
}
