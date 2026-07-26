// Ranking tests — consumer-layer feed sort. Falsifiable, RED-on-mutation.
// Spec: docs/tasks/Pietro.md §"🔢 The ranking algorithm".
// rank = returnPct × recencyDecay × (1 + log2(1 + followers))
// returnPct = (cumulativeVolumeOut − cumulativeVolumeIn) ÷ committedCapital
import { describe, expect, it } from "vitest";
import { rank, returnPct, recencyDecay, followerNudge, type RankInput } from "../ranking.js";

// Wei helpers — keep tests honest about precision (the whole point of the BigInt path).
const ETH = "1000000000000000000"; // 1e18 wei = 1 ETH
const wei = (eth: string): string => (BigInt(Math.floor(Number(eth) * 1e6)) * 1_000_000_000_000n).toString();

const NOW = 1_700_000_000; // fixed tick for deterministic recencyDecay

/** A ranked, recently-active, capital-backed strategy (baseline for mutation tests). */
const base = (over: Partial<RankInput> = {}): RankInput => ({
  cumulativeVolumeIn: wei("100"), // 100 ETH in
  cumulativeVolumeOut: wei("250"), // 250 ETH out → +150 ETH net PnL on 100 ETH capital = +150%
  committedCapital: wei("100"), // 100 ETH committed
  lastSwapAt: NOW, // just swapped → recencyDecay ≈ 1.0
  followers: 0, // no nudge (1 + log2(1) = 1)
  now: NOW,
  ...over,
});

describe("returnPct — realized PnL ÷ committed capital", () => {
  it("computes net realized return as a ratio (+150% here)", () => {
    // (250 − 100) / 100 = 1.5 = +150%
    expect(returnPct(base())).toBeCloseTo(1.5, 6);
  });

  it("is negative for a losing strategy", () => {
    // (40 − 100) / 100 = −0.6 = −60%
    expect(returnPct(base({ cumulativeVolumeOut: wei("40") }))).toBeCloseTo(-0.6, 6);
  });

  it("is zero when in == out (no PnL)", () => {
    expect(returnPct(base({ cumulativeVolumeOut: wei("100") }))).toBe(0);
  });

  it("returns null (UNRANKED) when committed capital is zero — the like-is-capital bar", () => {
    expect(returnPct(base({ committedCapital: "0" }))).toBeNull();
  });

  it("returns null when committed capital is negative (pulled more than pushed)", () => {
    // Aqua running balance can go negative on a malformed sequence; treat as unranked.
    expect(returnPct(base({ committedCapital: "-" + wei("100") }))).toBeNull();
  });

  it("stays precise at full-ETH wei magnitudes (no Number overflow)", () => {
    // 1000 ETH capital, 2500 ETH out, 1000 ETH in → +150%. Number() would lose the
    // low-order wei and drift the ratio; BigInt division must hold 1.5 exactly.
    const rp = returnPct({
      cumulativeVolumeIn: wei("1000"),
      cumulativeVolumeOut: wei("2500"),
      committedCapital: wei("1000"),
    });
    expect(rp).toBeCloseTo(1.5, 6);
  });

  it("handles wei-scale values that dwarf Number.MAX_SAFE_INTEGER without drift", () => {
    // 1e24-wei-magnitude numerator/denominator (far past 9e15 safe-int ceiling).
    const rp = returnPct({
      cumulativeVolumeIn: "1000000000000000000000000", // 1000 ETH in
      cumulativeVolumeOut: "3000000000000000000000000", // 3000 ETH out
      committedCapital: "1000000000000000000000000", // 1000 ETH capital
    });
    // (3000 − 1000) / 1000 = 2.0 = +200%
    expect(rp).toBeCloseTo(2.0, 5);
  });

  it("matches a hand ratio for small whole-ETH values", () => {
    // 3 in, 4 out, 1 capital → (4−3)/1 = 1.0 = +100%
    expect(
      returnPct({
        cumulativeVolumeIn: wei("3"),
        cumulativeVolumeOut: wei("4"),
        committedCapital: wei("1"),
      }),
    ).toBeCloseTo(1.0, 5);
  });
});

describe("recencyDecay — 24h half-life", () => {
  it("is ≈1.0 just after a swap", () => {
    expect(recencyDecay({ lastSwapAt: NOW, now: NOW })).toBeCloseTo(1.0, 6);
  });

  it("halves every 24h", () => {
    const oneDay = recencyDecay({ lastSwapAt: NOW, now: NOW + 86_400 });
    expect(oneDay).toBeCloseTo(0.5, 6);
    const twoDays = recencyDecay({ lastSwapAt: NOW, now: NOW + 2 * 86_400 });
    expect(twoDays).toBeCloseTo(0.25, 6);
  });

  it("is 0 when the strategy never swapped (lastSwapAt === 0)", () => {
    expect(recencyDecay({ lastSwapAt: 0, now: NOW })).toBe(0);
  });

  it("does not go negative if lastSwapAt is somehow in the future", () => {
    // clamped at 1.0 (max(0, negative hours) → 0.5^0 = 1.0)
    expect(recencyDecay({ lastSwapAt: NOW + 3600, now: NOW })).toBeCloseTo(1.0, 6);
  });
});

describe("followerNudge — 1 + log2(1 + followers)", () => {
  it("is 1.0 with no followers (no nudge)", () => {
    expect(followerNudge(0)).toBeCloseTo(1.0, 6);
  });

  it("doubles rank's nudge term for the 1st follower (1 → 2)", () => {
    // log2(2) = 1 → term = 2.0
    expect(followerNudge(1)).toBeCloseTo(2.0, 6);
  });

  it("grows slowly: 100 followers ≈ 1 + log2(101) ≈ 7.66", () => {
    expect(followerNudge(100)).toBeCloseTo(1 + Math.log2(101), 6);
  });

  it("treats negative input as zero (defensive)", () => {
    expect(followerNudge(-5)).toBeCloseTo(1.0, 6);
  });
});

describe("rank — the full sort key", () => {
  it("multiplies the three terms", () => {
    // base: returnPct 1.5 × recencyDecay 1.0 × nudge 1.0 = 1.5
    expect(rank(base())).toBeCloseTo(1.5, 6);
  });

  it("applies recency decay (idle 24h halves a fresh +150% rank)", () => {
    const idle = rank(base({ lastSwapAt: NOW - 86_400 })); // one day stale
    // 1.5 × 0.5 × 1.0 = 0.75
    expect(idle).toBeCloseTo(0.75, 6);
  });

  it("applies follower nudge (1 follower doubles the nudge term)", () => {
    const nudged = rank(base({ followers: 1 }));
    // 1.5 × 1.0 × 2.0 = 3.0
    expect(nudged).toBeCloseTo(3.0, 6);
  });

  it("returns null (UNRANKED) when there's no committed capital", () => {
    expect(rank(base({ committedCapital: "0" }))).toBeNull();
  });

  it("sorts a winning recent strategy above a stale one (the G2 acceptance)", () => {
    const winner = rank(base({ cumulativeVolumeOut: wei("400") })); // +300%, fresh
    const stale = rank(base({ lastSwapAt: NOW - 7 * 86_400 })); // +150%, week idle
    expect(winner).not.toBeNull();
    expect(stale).not.toBeNull();
    expect(winner!).toBeGreaterThan(stale!);
  });

  it("ranks a strategy with lower return% but more followers can beat a higher-return% lonely one", () => {
    // Nudge is bounded (log2), so this only flips for extreme follower counts —
    // documents that return% dominates but followers break ties upward.
    const lonely = rank(base({ followers: 0 })); // 1.5 × 1 × 1
    const popular = rank(base({ followers: 1023 })); // 1.5 × 1 × (1+log2(1024)) = 1.5 × 11 = 16.5
    expect(popular!).toBeGreaterThan(lonely!);
  });
});

describe("rank — precision across the pipeline", () => {
  it("the ETH-scale base ratio survives the full multiply (not just returnPct alone)", () => {
    // Same +150% as returnPct's precision test, now through the full rank() with
    // a fresh swap and zero followers → must equal 1.5, not a Number-drifted 1.499...
    expect(rank(base())).toBeCloseTo(1.5, 6);
  });
});
