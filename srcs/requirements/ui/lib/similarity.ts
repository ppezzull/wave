// Strategy similarity — the real "For you" feed. Pure, deterministic math
// over REAL data (the deployed descriptions): TF-IDF-weighted cosine over a
// description's terms, scored against the session wallet's own deployed
// strategies (their taste profile). No embeddings API, no fabrication — the
// same inputs always produce the same ranking, and it's unit-testable.
//
// Why lexical works here: wave descriptions are dense structured signals —
// token addresses (0x…), symbols (weth/link/usdc), curve kinds (xyc,
// constant-product), fees (25 bps), guard language (oracle, deviates, halt).
// Shared addresses and vocabulary ARE strategy similarity for this corpus.

/** A described item to match against (subgraph row or hydrated Strategy —
 *  only id + description matter). */
export interface Describable {
  id: string
  description: string
}

export interface Matched {
  id: string
  /** Cosine similarity ∈ (0, 1] against the closest of the profile's own
   *  descriptions. Display as a percentage. */
  score: number
}

/** Tokenize a description: keep 0x addresses whole (the strongest signal),
 *  fold case, split words, keep numbers and unit-like tokens. */
export function tokenizeDescription(desc: string): string[] {
  if (!desc) return []
  const out: string[] = []
  // Addresses first (lowercased, whole).
  for (const addr of desc.match(/0x[0-9a-fA-F]{6,64}/g) ?? []) {
    out.push(addr.toLowerCase())
  }
  // Words/numbers minus the addresses themselves.
  const stripped = desc.replace(/0x[0-9a-fA-F]{6,64}/g, ' ')
  for (const word of stripped.toLowerCase().match(/[a-z0-9]+(?:[.\-_][a-z0-9]+)*/g) ?? []) {
    if (word.length >= 2 || /^\d+$/.test(word)) out.push(word)
  }
  return out
}

/** Term frequency map. */
export function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>()
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
  return tf
}

/** Inverse document frequency over the corpus: terms in EVERY document carry
 *  no signal ("strategy", "liquidity"); distinctive terms (an address only
 *  two strategies share) dominate. idf = ln(1 + N / df). */
export function idfMap(docs: Map<string, number>[]): Map<string, number> {
  const n = docs.length
  const df = new Map<string, number>()
  for (const doc of docs) {
    for (const term of doc.keys()) df.set(term, (df.get(term) ?? 0) + 1)
  }
  const idf = new Map<string, number>()
  for (const [term, count] of df) idf.set(term, Math.log(1 + n / count))
  return idf
}

/** TF-IDF-weighted cosine similarity ∈ [0, 1]. */
export function cosine(
  a: Map<string, number>,
  b: Map<string, number>,
  idf: Map<string, number>,
): number {
  let dot = 0
  let normA = 0
  let normB = 0
  const weight = (term: string, tf: number) => tf * (1 + (idf.get(term) ?? 0))
  for (const [term, tf] of a) normA += weight(term, tf) ** 2
  for (const [term, tf] of b) normB += weight(term, tf) ** 2
  if (normA === 0 || normB === 0) return 0
  const [small, big] = a.size <= b.size ? [a, b] : [b, a]
  for (const [term, tf] of small) {
    const other = big.get(term)
    if (other !== undefined) dot += weight(term, tf) * weight(term, other)
  }
  return dot / Math.sqrt(normA * normB)
}

/**
 * Rank the pool by similarity to the profile's own deployed descriptions.
 * score(item) = max cosine against any single own description — "closest to
 * something you already ship". Own ids are excluded; zero-score items are
 * omitted (they fall back to the leaderboard tail in the feed).
 */
export function matchFeed({ own, pool }: { own: Describable[]; pool: Describable[] }): Matched[] {
  const ownDocs = own
    .filter((s) => s.description.trim().length > 0)
    .map((s) => ({ id: s.id, tf: termFreq(tokenizeDescription(s.description)) }))
  if (ownDocs.length === 0) return []
  const poolDocs = pool
    .filter((s) => s.description.trim().length > 0)
    .map((s) => ({ id: s.id, tf: termFreq(tokenizeDescription(s.description)) }))
  const idf = idfMap([...ownDocs, ...poolDocs].map((d) => d.tf))
  const ownIds = new Set(own.map((s) => s.id.toLowerCase()))
  const scored: Matched[] = []
  for (const candidate of poolDocs) {
    if (ownIds.has(candidate.id.toLowerCase())) continue
    let best = 0
    for (const profile of ownDocs) {
      const sim = cosine(candidate.tf, profile.tf, idf)
      if (sim > best) best = sim
    }
    if (best > 0) scored.push({ id: candidate.id, score: best })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored
}
