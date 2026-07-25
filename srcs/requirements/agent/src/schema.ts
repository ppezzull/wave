// wave — LLM-facing StrategySpec. ❄️ MIRRORS the frozen compiler AST
// (srcs/requirements/compiler/src/ast.ts, specVersion 1 — PR #19).
// That file is AUTHORITATIVE; this is the agent's mirror for parse/validate.
// Drift = a spec bug — keep them in sync (or import once the packages share a
// workspace).
//
// composeAgent (NL → JSON) emits a StrategySpec; the compiler (canonical.ts)
// turns the ordered `blocks` into 1inch SwapVM opcodes. This is the LLM shape
// (floats, symbols, decimal strings), NOT the opcode shape — the compiler
// scales (targetRatio → 1e18, prices → sqrt 1e18 fp) and resolves symbols →
// addresses via compiler-owned registries. Block-kind identifiers are
// lowerCamel nouns (`oracleGuard`, not "oracle-guard").
//
// zod/v4 subpath: same zod world as @mastra/core.
import { z } from "zod/v4";

export const SPEC_VERSION = 1 as const;

/// Canonical block order (enforced by canonical.ts — NOT by this schema; parsing
/// accepts any order so the reject-and-rewrite pass can show the move-arrow +
/// diff instead of an opaque parse failure).
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
const Address = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "expected a 0x-prefixed 40-hex address");

/// Basis points. Ceiling 1000 (10%) — every LLM-settable bps field. On-chain
/// args are uint16, so this is a policy bound, not a type bound.
const BPS_MAX = 1000;
const Bps = z.number().int().min(0).max(BPS_MAX);

/// Chainlink feed symbols the compiler registry resolves on Sepolia. The LLM
/// picks a symbol, never an address.
const FEED_SYMBOLS = ["ETH/USD", "BTC/USD", "LINK/USD", "USDC/USD", "DAI/USD"] as const;
const FeedSymbol = z.enum(FEED_SYMBOLS);

/// Human-readable token amount as a decimal string (≤18 fractional digits —
/// never a JS float). Token decimals are resolved by the compiler from ERC-20
/// metadata, not carried in the spec.
const DecimalAmount = z.string().regex(
  /^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/,
  "expected a decimal amount string with at most 18 fractional digits",
);

/// Strictly positive finite price (token1 per token0, in the pair's own order).
const Price = z.number().positive().finite();

// ── blocks — discriminated union on `type` (lowerCamel) ──────────────────
const DeadlineBlock = z.object({
  type: z.literal("deadline"),
  /// Hours from ship time; compiler resolves to an absolute uint40 for `_deadline`.
  hours: z.number().positive().max(24 * 30),
});

/// Maps to `_xycConcentrateGrowLiquidity2D` (2-token): on-chain args are
/// sqrt(P_min)/sqrt(P_max) in 1e18 fp. The LLM emits a plain price band; the
/// compiler does the sqrt + lt/gt normalization.
const ConcentrationBlock = z
  .object({ type: z.literal("concentration"), priceMin: Price, priceMax: Price })
  .refine((b) => b.priceMin < b.priceMax, { message: "priceMin must be strictly less than priceMax" });

/// Maps to `_decayXD` — one on-chain arg `period` (2 bytes, secs). NB: the
/// compiler must never emit a backward jump targeting this block (quote/swap
/// divergence, Decay.sol:81–83).
const DecayBlock = z.object({
  type: z.literal("decay"),
  periodSecs: z.number().int().min(1).max(65_535),
});

const OracleGuardBlock = z.object({
  type: z.literal("oracleGuard"),
  feed: FeedSymbol,
  /// Must be ≥1: a zero-width band would halt every fill.
  maxDeviationBps: Bps.min(1),
  /// On-chain arg is 2 bytes (uint16). Default 7200 = Chainlink ~3600s heartbeat
  /// + margin. Floor 60s keeps the guard meaningful.
  maxStalenessSecs: z.number().int().min(60).max(65_535).default(7200),
  mode: z.enum(["revert", "clamp"]),
  // Band is ONE-SIDED (DECIDED — PR #13 / PLAYBOOK §1.5): halts only when the
  // implied price is unfavourable to the maker beyond maxDeviationBps.
  // Two-sided is a RESERVED compiler `flags` bit — not LLM-facing. Staleness
  // ALWAYS reverts, in both modes.
});

const InventorySkewBlock = z.object({
  type: z.literal("inventorySkew"),
  /// Target balanceLt/(balanceLt+balanceGt) share, float 0..1. Compiler → 1e18.
  targetRatio: z.number().min(0).max(1),
  slopeBps: Bps, // penalty bps per 10% post-trade deviation
  maxSkewBps: Bps, // hard cap on total penalty
  /// Improvement leg (deviation-reducing) — optional (undecided if it ships).
  /// If it ships, MUST stay inside the oracle band (two-leg caveat, PR #13).
  maxImproveBps: Bps.optional(),
});

const MakerFeeBlock = z.object({ type: z.literal("makerFee"), bps: Bps });
const ProtocolFeeBlock = z.object({ type: z.literal("protocolFee"), bps: Bps, receiver: Address });
const CurveBlock = z.object({ type: z.literal("curve"), kind: z.enum(["xyc"]) });

/// Maps to `_salt` (a no-op carrying args for order-hash uniqueness). `value` is
/// REQUIRED + caller-supplied — the compiler is deterministic, never generates
/// entropy. Emitted as uint64.
const SaltBlock = z.object({
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
    /// Committed maker capital per side; both strictly positive (xyc needs both).
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
