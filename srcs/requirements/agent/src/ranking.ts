// Consumer-layer ranking math — the feed sort. Pure, no I/O, no LLM.
// Spec: docs/tasks/Pietro.md §"🔢 The ranking algorithm":
//   rank = returnPct × recencyDecay × (1 + log2(1 + followers))
//
// This is the CONSUMER layer (UI getFeed() + agent feed query), NOT the subgraph
// and NOT the policy. graph-node has no computed/derived field that stays in sync
// without a block handler, so the raw aggregates are indexed (Strategy.
// cumulativeVolumeIn/Out, committedCapital, lastSwapTimestamp, followerCount) and
// BOTH consumers implement this identical formula to agree on rank.
//
// PRECISION — why BigInt, not Number. The subgraph serializes every wei value as a
// decimal STRING. 1 ETH = 1e18 wei already overflows Number.MAX_SAFE_INTEGER (≈9e15),
// so `Number(weiString)` silently loses low-order digits before any division happens.
// We parse to BigInt, divide there, then scale to a fixed-precision Number ratio.
// (Cumulative volume compounds this — a busy strategy's cumulativeVolumeIn is far
// past 1e18, so the BigInt path is mandatory, not optional.)
//
// ⚠️ returnPct NUMERATOR — realized PnL proxy, NOT true PnL. The subgraph indexes
// cumulativeVolumeIn (Σ Swap.amountIn) and cumulativeVolumeOut (Σ Swap.amountOut).
// Net realized PnL ≈ cumulativeVolumeOut − cumulativeVolumeIn (what came out minus
// what went in). TRUE returnPct is "realized + unrealized PnL" (Pietro.md), but the
// unrealized leg needs an oracle read of current inventory mark-to-market, which the
// subgraph does not have. So this is the honest, subgraph-derivable lower bound —
// documented loudly so no one mistakes it for mark-to-market return.

/** Inputs for one strategy's rank. Wei values arrive as decimal strings from the
 *  subgraph (Strategy.* fields); `lastSwapAt`/`now` are unix seconds; `followers`
 *  is the COUNT of distinct follow edges (Strategy.followerCount), not a list. */
export interface RankInput {
  cumulativeVolumeIn: string; // wei string (Σ Swap.amountIn)
  cumulativeVolumeOut: string; // wei string (Σ Swap.amountOut)
  committedCapital: string; // wei string (Aqua Pushed − Pulled) — returnPct denominator
  lastSwapAt: number; // unix seconds of last Swap (0 if never swapped)
  followers: number; // Strategy.followerCount (distinct follow edges)
  now: number; // tick / request timestamp, unix seconds
}

/** Scale factor for the BigInt division: 1e6 keeps 6 decimals of returnPct precision
 *  (0.0001%) without overflowing Number when we divide back — returnPct is a ratio,
 *  so it's always small (a strategy up 1000% is 10.0, well within Number range). */
const RETURN_PCT_SCALE = 1_000_000n;

/**
 * returnPct — realized PnL ÷ committed capital, as a ratio (0.10 = +10%, −0.05 = −5%).
 *
 * Returns `null` when the strategy is UNRANKED on this term: committedCapital ≤ 0
 * (no capital behind it → "the like is capital" bar isn't met → no return% to show).
 * The caller treats null as "listed but unranked" and sorts the strategy beneath the
 * ranked set by recency only (Pietro.md listing-threshold rule).
 *
 * Wei strings → BigInt division → scaled Number. Never throws on the math; a
 * malformed (non-numeric) wei string is a caller bug and will throw on BigInt parse,
 * which is the correct loud failure (don't fabricate a rank from garbage).
 */
export function returnPct(input: Pick<RankInput, "cumulativeVolumeIn" | "cumulativeVolumeOut" | "committedCapital">): number | null {
  const capital = BigInt(input.committedCapital);
  if (capital <= 0n) return null; // unranked: no capital → no return% (the like-is-capital bar)

  // Net realized PnL = out − in. Cumulative volumes are ≥ 0, so the result can be
  // negative (a losing strategy) — BigInt handles signed arithmetic natively.
  const netPnl = BigInt(input.cumulativeVolumeOut) - BigInt(input.cumulativeVolumeIn);

  // Divide in BigInt with a scale, then back to Number. netPnl can be negative;
  // BigInt division truncates toward zero, so we scale-then-divide for the sign to
  // come out right (−5e6 / 100 = −50000, i.e. −0.05 after unscaling).
  const scaled = (netPnl * RETURN_PCT_SCALE) / capital;
  return Number(scaled) / Number(RETURN_PCT_SCALE);
}

/**
 * recencyDecay — `0.5 ^ (hoursSinceLastSwap / 24)`, half-life 24h (Pietro.md).
 * A strategy that last swapped <24h ago is near 1.0; one idle a week is ≈0.005.
 * Returns 0 if it has never swapped (lastSwapAt === 0) — a never-traded strategy
 * has nothing to decay from, and rank() gates it out via returnPct anyway.
 */
export function recencyDecay(input: Pick<RankInput, "lastSwapAt" | "now">): number {
  if (input.lastSwapAt <= 0) return 0; // never swapped → no recency signal
  const hoursSince = Math.max(0, (input.now - input.lastSwapAt) / 3600);
  return Math.pow(0.5, hoursSince / 24);
}

/**
 * followerNudge — the `(1 + log2(1 + followers))` term (Pietro.md). A follower is a
 * nudge, not a multiplier: the 1st follower takes 1→2 (×2 rank), the 100th takes
 * 100→101 (≈×1.007). log2 not ln so the half-life intuition matches (doubling
 * followers ≈ +1 unit of nudge).
 */
export function followerNudge(followers: number): number {
  return 1 + Math.log2(1 + Math.max(0, followers));
}

/**
 * rank — the full feed sort key: `returnPct × recencyDecay × (1 + log2(1 + followers))`.
 *
 * Returns `null` when the strategy is UNRANKED (returnPct is null — no committed
 * capital). Callers sort ranked strategies (non-null) descending by this key, then
 * list unranked (null) strategies beneath, ordered by recency. This null-vs-number
 * split IS the listing-threshold rule (Pietro.md: ≥3 fills AND ≥1h age to rank);
 * returnPct's committedCapital gate is the first half of that — a capital-less
 * strategy has no return% regardless of age. (The swapCount≥3 AND age≥1h conjunct
 * is applied by the caller before calling rank(), since it needs swapCount which
 * this fn doesn't take — keeping rank() to the multiplicative formula only.)
 */
export function rank(input: RankInput): number | null {
  const rp = returnPct(input);
  if (rp === null) return null; // unranked
  return rp * recencyDecay(input) * followerNudge(input.followers);
}
