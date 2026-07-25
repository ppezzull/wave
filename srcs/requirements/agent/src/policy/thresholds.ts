// Global policy tunables. Per-strategy limits (maxSkewBps, oracle* limits) live
// in PolicyInput. Spec: docs/strategy/AGENT.md.

export const THRESHOLDS = {
  // R1 — cumulative volume drift
  cumulativeVolumeDrift: 0.2, // ΔcumulativeVolume/committedCapital ≥ 0.20
  // R2 — inventory skew sustained
  skewSustainedFillCount: 3,
  // R3 — oracle band-edge proximity
  oracleBandEdgePct: 0.2, // within 20% of maxDeviationBps
  // R4 — return collapse
  returnDropRatio: 0.5, // 24h < 7d × 0.5
  returnDropFillCount: 3,
  // S1 — chronic underfunding
  revertCheckStreak: 3,
  // S2 — sustained loss
  stopReturnPct: -0.15,
  // S3 — oracle staleness (× strategy maxStaleness)
  oracleDeadMultiplier: 2,
  // S4 — no swaps while funded
  noSwapHours: 72,
  // M1 — grace before remove
  graceDays: 7,
} as const;
