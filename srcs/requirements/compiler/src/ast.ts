// wave compiler — canonical StrategySpec AST. ❄️ FROZEN at specVersion 1.
//
// This file is the P1↔P2 contract (10-10-PLAYBOOK.md §1.5 "Strategy-block DSL"):
// the LLM-facing shape of a strategy. Flavio's agent (agent/src/schema.ts)
// MIRRORS these types; this file is authoritative. Changing any frozen shape
// after specVersion 1 requires a spec bump, not an edit.
//
// This is the LLM shape, NOT the opcode shape: floats, symbols, decimal
// strings. The compiler (canonical.ts → ir.ts → emit.ts) scales to on-chain
// units (targetRatio → 1e18, prices → sqrt 1e18 fp) and resolves symbols →
// addresses via compiler-owned registries. The LLM never emits an oracle
// address — `feed` is a symbol resolved against FEED_REGISTRY keys.
//
// Block-kind identifiers are lowerCamel nouns (`oracleGuard`, not
// "oracle-guard") — matching the canonical-order line of §1.5. The kebab-case
// variants in the §1.5 JSON example and in the agent's DRAFT schema are
// superseded by this freeze.
//
// zod/v4 subpath: same zod world as @mastra/core (see agent/src/schema.ts).
import { z } from "zod/v4";

export const SPEC_VERSION = 1 as const;

/// Canonical block order, enforced by canonical.ts (NOT by this schema —
/// parsing accepts any order so the reject-and-rewrite pass can produce the
/// move-arrow + diff instead of an opaque parse failure).
export const CANONICAL_ORDER = [
  "deadline",
  "concentration",
  "decay",
  "oracleGuard",
  "inventorySkew",
  "makerFee",
  "protocolFee",
  "curve",
  "salt",
] as const;

export type BlockKind = (typeof CANONICAL_ORDER)[number];

// ── primitives ───────────────────────────────────────────────────────────

export const Address = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "expected a 0x-prefixed 40-hex address");

/// Basis points. ❄️ Ceiling frozen at 1000 (10%) — applies to every
/// LLM-settable bps field (fees, slope, skew caps, oracle deviation).
/// On-chain args are uint16, so this is a policy bound, not a type bound.
export const BPS_MAX = 1000;
export const Bps = z.number().int().min(0).max(BPS_MAX);

/// Chainlink feed symbols. ❄️ Frozen enum = the feeds our compiler registry
/// resolves on Sepolia (PROD-TESTNET.md §1; ETH/USD attested in §1.5). The
/// LLM picks a symbol, never an address; extending the enum is a registry +
/// spec-revision change.
export const FEED_SYMBOLS = [
  "ETH/USD",
  "BTC/USD",
  "LINK/USD",
  "USDC/USD",
  "DAI/USD",
] as const;
export const FeedSymbol = z.enum(FEED_SYMBOLS);

/// Human-readable token amount as a decimal string (preserves precision —
/// never a JS float). ❄️ Up to 18 fractional digits; token decimals are
/// resolved by the compiler from ERC-20 metadata, not carried in the spec.
export const DecimalAmount = z
  .string()
  .regex(
    /^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/,
    "expected a decimal amount string with at most 18 fractional digits",
  );

/// Strictly positive finite price (token1 per token0, in the pair's own
/// order). The compiler normalizes to the on-chain tokenLt/tokenGt
/// convention and scales to sqrt 1e18 fixed-point.
const Price = z.number().positive().finite();

// ── blocks — discriminated union on `type` ───────────────────────────────

export const DeadlineBlock = z.object({
  type: z.literal("deadline"),
  /// Hours from ship time; compiler resolves to an absolute uint40
  /// timestamp for `_deadline`. Max 30 days.
  hours: z.number().positive().max(24 * 30),
});

/// ❄️ Body frozen. Maps to `_xycConcentrateGrowLiquidity2D` (2-token only):
/// on-chain args are sqrt(P_min)/sqrt(P_max) in 1e18 fp with P =
/// tokenGt/tokenLt (XYCConcentrate.sol). The LLM emits a plain price band
/// in pair order; the compiler does the sqrt + lt/gt normalization.
export const ConcentrationBlock = z
  .object({
    type: z.literal("concentration"),
    priceMin: Price,
    priceMax: Price,
  })
  .refine((b) => b.priceMin < b.priceMax, {
    message: "priceMin must be strictly less than priceMax",
  });

/// ❄️ Body frozen. Maps to `_decayXD` — exactly one on-chain arg,
/// `period` (2 bytes, seconds; Decay.sol). Mooniswap-style MEV protection.
/// NB (Flaviano.md riga 15): the compiler must never emit a backward jump
/// targeting this block — Decay.sol:81–83 documents quote/swap divergence.
export const DecayBlock = z.object({
  type: z.literal("decay"),
  periodSecs: z.number().int().min(1).max(65_535),
});

export const OracleGuardBlock = z.object({
  type: z.literal("oracleGuard"),
  feed: FeedSymbol,
  /// Must be ≥1: a zero-width band would halt every fill.
  maxDeviationBps: Bps.min(1),
  /// ❄️ Ceiling corrected from the 86400 draft: the on-chain arg is 2 bytes
  /// (§1.5 arg table) → uint16. Default 7200 = Chainlink ~3600s heartbeat
  /// + margin. Floor 60s keeps the guard meaningful.
  maxStalenessSecs: z.number().int().min(60).max(65_535).default(7200),
  mode: z.enum(["revert", "clamp"]),
  // Band is ONE-SIDED (DECIDED — PR #13 / PLAYBOOK §1.5): halts only when
  // the implied price is unfavourable to the maker beyond maxDeviationBps.
  // Two-sided is a RESERVED compiler `flags` bit — not LLM-facing.
  // Staleness ALWAYS reverts, in both modes.
});

export const InventorySkewBlock = z.object({
  type: z.literal("inventorySkew"),
  /// Target balanceLt/(balanceLt+balanceGt) share, float 0..1.
  /// Compiler scales → targetRatioE18 (uint64, 1e18).
  targetRatio: z.number().min(0).max(1),
  /// Penalty bps per 10% post-trade deviation (uint16 on-chain).
  slopeBps: Bps,
  /// Hard cap on total penalty (uint16 on-chain).
  maxSkewBps: Bps,
  /// ⚠️ UNDECIDED whether the improvement leg ships (cut-floor keeps the
  /// penalty path only — decision lands with InventorySkew.sol, milestone 2).
  /// Kept optional so the LLM shape survives either outcome. If it ships,
  /// the improvement MUST stay inside the oracle band (two-leg caveat,
  /// PLAYBOOK §1.5 / PR #13) — enforced by rules.ts + runtime clamp.
  maxImproveBps: Bps.optional(),
});

export const MakerFeeBlock = z.object({
  type: z.literal("makerFee"),
  bps: Bps,
});

export const ProtocolFeeBlock = z.object({
  type: z.literal("protocolFee"),
  bps: Bps,
  receiver: Address,
});

export const CurveBlock = z.object({
  type: z.literal("curve"),
  /// ❄️ specVersion 1 compiles exactly one curve: constant-product
  /// (`_xycSwapXD`). Other terminal instructions exist upstream (limit,
  /// pegged, TWAP, dutch) but are NOT in this freeze — adding a kind is a
  /// spec revision, not an enum edit.
  kind: z.enum(["xyc"]),
});

/// ❄️ Body frozen. Maps to `_salt` (Controls.sol — a no-op carrying args
/// for order-hash uniqueness). `value` is REQUIRED and caller-supplied:
/// the compiler is deterministic (byte-identical emit), so it never
/// generates entropy itself. Safe-integer bound keeps it a JS number;
/// emitted as uint64.
export const SaltBlock = z.object({
  type: z.literal("salt"),
  value: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export const Block = z.discriminatedUnion("type", [
  DeadlineBlock,
  ConcentrationBlock,
  DecayBlock,
  OracleGuardBlock,
  InventorySkewBlock,
  MakerFeeBlock,
  ProtocolFeeBlock,
  CurveBlock,
  SaltBlock,
]);

// ── the spec ─────────────────────────────────────────────────────────────

export const StrategySpec = z
  .object({
    specVersion: z.literal(SPEC_VERSION),
    pair: z.object({ token0: Address, token1: Address }),
    /// Committed maker capital per side. Both strictly positive — the only
    /// curve in this freeze (xyc) needs liquidity on both sides.
    size: z.object({ amount0: DecimalAmount, amount1: DecimalAmount }),
    blocks: z.array(Block).min(1),
  })
  .refine((s) => s.pair.token0.toLowerCase() !== s.pair.token1.toLowerCase(), {
    message: "pair.token0 and pair.token1 must differ",
  })
  .refine((s) => s.size.amount0 !== "0" && s.size.amount1 !== "0", {
    message: "size amounts must be strictly positive",
  });

export type Block = z.infer<typeof Block>;
export type StrategySpec = z.infer<typeof StrategySpec>;
