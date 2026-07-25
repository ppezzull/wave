// wave — LLM-facing strategy spec (DRAFT v0).
//
// composeAgent (NL → JSON) emits a StrategySpec; Flaviano's compiler
// (canonical.ts) turns the ordered `blocks` into 1inch SwapVM opcodes.
//
// Source of truth: docs/strategy/10-10-PLAYBOOK.md §1.5 "Strategy-block DSL".
// ⚠️ DRAFT — awaiting Flaviano's frozen `ast.ts` (specVersion: 1). Every gap
// is flagged `TODO(freeze)`; do not treat numeric bounds as final.
//
// This is the LLM shape, NOT the opcode shape: floats & symbols here. The
// compiler scales (e.g. targetRatio 0..1 → targetRatioE18 1e18) and resolves
// symbols → addresses via its own registries (oracle feed, token pair).
// zod/v4 — Mastra is built on the zod/v4 subpath (zod 3.25.x ships it); importing
// it here keeps our schema in the SAME zod world as @mastra/core, so structured
// output type-checks without a compat wrapper.
import { z } from "zod/v4";

export const SPEC_VERSION = 1 as const;

// ── primitives ───────────────────────────────────────────────────────────
const Address = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "expected a 0x-prefixed 40-hex address");

/// basis points — bounded 0..1000 (0%..10%). TODO(freeze): confirm ceiling.
const Bps = z.number().int().min(0).max(1000);

/// Chainlink feed *symbol* — the LLM never emits an address; the compiler
/// resolves via its symbol registry. TODO(freeze): extend the enum.
const FeedSymbol = z.enum(["ETH/USD", "BTC/USD", "USDC/USD"]);

// ── blocks — discriminated union ─────────────────────────────────────────
// canonical order (PLAYBOOK §1.5), enforced by the compiler:
//   deadline → concentration → decay → oracleGuard → inventorySkew
//     → makerFee → protocolFee → curve → salt
// (the 6 rejection rules — OracleGuardMustPrecedeSkew, ProtocolFeeLeMakerFee,
//  SaltMustBeTerminal, etc. — are a compiler concern, not this schema's.)

const DeadlineBlock = z.object({
  type: z.literal("deadline"),
  hours: z.number().positive().max(24 * 30),
});

// TODO(freeze): body unspecified in §1.5. Type-only placeholder keeps the
// union complete; Flaviano's ast.ts defines the real fields.
const ConcentrationBlock = z.object({ type: z.literal("concentration") });

// TODO(freeze): body unspecified. NB (Flaviano.md): backward jumps targeting
// Decay break quote/swap consistency — the compiler must never emit one.
// Type-only placeholder for now.
const DecayBlock = z.object({ type: z.literal("decay") });

const OracleGuardBlock = z.object({
  type: z.literal("oracle-guard"),
  feed: FeedSymbol,
  maxDeviationBps: Bps,
  /// default 7200s on-chain (_oracleGuard2D). TODO(freeze): confirm bounds.
  maxStalenessSecs: z.number().int().positive().max(86_400).default(7200),
  mode: z.enum(["revert", "clamp"]),
  // Band is ONE-SIDED (DECIDED — b59d5db / PLAYBOOK §1.5): the guard halts only
  // when the implied price is unfavourable to the maker beyond maxDeviationBps;
  // a maker-favourable price never trips it (the guard is the OUTER wrapper,
  // reads amountOut after the inventorySkew penalty). Two-sided is a RESERVED
  // compiler `flags` bit (unimplemented) — NOT LLM-facing, so not modelled here.
  // `mode` governs revert(0) vs clamp(1) on that one-sided deviation.
});

const InventorySkewBlock = z.object({
  type: z.literal("inventory-skew"),
  /// target balanceLt/(balanceLt+balanceGt), float 0..1. Compiler scales → 1e18.
  targetRatio: z.number().min(0).max(1),
  slopeBps: Bps,
  maxSkewBps: Bps,
  /// v2 cap on the deviation-reducing (improvement) leg — taker-favoured. MUST
  /// stay inside the oracle band or the one-sided guard leaks a bad fill
  /// (two-leg caveat, PLAYBOOK §1.5 / b59d5db).
  maxImproveBps: Bps.optional(),
});

const MakerFeeBlock = z.object({
  type: z.literal("maker-fee"),
  bps: Bps,
});

const ProtocolFeeBlock = z.object({
  type: z.literal("protocol-fee"),
  bps: Bps,
  receiver: Address,
});

const CurveBlock = z.object({
  type: z.literal("curve"),
  /// TODO(freeze): only "xyc" attested in the §1.5 example; extend the enum.
  kind: z.enum(["xyc"]),
});

// terminal block. TODO(freeze): body unspecified — salt bytes for uniqueness?
const SaltBlock = z.object({ type: z.literal("salt") });

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
export const StrategySpec = z.object({
  specVersion: z.literal(SPEC_VERSION),
  pair: z.object({ token0: Address, token1: Address }),
  /// human-readable amounts as strings (preserve precision). TODO(freeze): decimals.
  size: z.object({ amount0: z.string(), amount1: z.string() }),
  blocks: z.array(Block).min(1),
});

export type Block = z.infer<typeof Block>;
export type StrategySpec = z.infer<typeof StrategySpec>;
