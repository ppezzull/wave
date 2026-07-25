// wave compiler — lowering: canonical StrategySpec → IR (10-10-PLAYBOOK.md
// §1.5, Move #1).
//
// The IR is a flat list of {op, args} where `op` is the instruction's
// Solidity function name (slot resolution is emit.ts's job) and `args` are
// the EXACT on-chain arg bytes, packed per each instruction's ArgsBuilder
// layout. Everything here is deterministic: same spec + options → same
// bytes. Floats from the LLM shape are scaled through fixed decimal grids
// (1e-6 for ratios, 1e-12 for prices) before any bigint math — never through
// runtime-dependent float paths.
//
// lower() REQUIRES a canonical spec (run canonical.ts + rules.ts first) —
// emitting a non-canonical order would silently break the wrapping
// semantics (earlier = more outer), so it throws instead.

import { CANONICAL_ORDER, type Block, type StrategySpec } from "./ast.js";
import { resolveFeed, type FeedInfo } from "./registry.js";
import type { OpName } from "./slots.js";

export class CompileError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CompileError";
  }
}

export interface LowerOptions {
  chainId: number;
  /// Ship-time unix seconds — resolves `deadline.hours` to an absolute uint40.
  now: number;
  /// Which pair token is the feed's BASE asset (the app knows its pair).
  pairBase: "token0" | "token1";
  /// Demo override (MockAggregatorV3) — replaces the registry feed.
  feedOverride?: FeedInfo;
}

export interface IrInstruction {
  op: OpName;
  args: Uint8Array;
}

const MODE_BYTE = { revert: 0, clamp: 1 } as const;
/// LLM bps are 10_000-based; Fee.sol's BPS base is 1e9 → ×1e5.
const FEE_BASE_SCALE = 100_000n;

export function lower(spec: StrategySpec, opts: LowerOptions): IrInstruction[] {
  assertCanonicalOrder(spec);
  const token0IsLt = spec.pair.token0.toLowerCase() < spec.pair.token1.toLowerCase();
  return spec.blocks.map((block) => lowerBlock(block, spec, opts, token0IsLt));
}

function lowerBlock(
  block: Block,
  spec: StrategySpec,
  opts: LowerOptions,
  token0IsLt: boolean,
): IrInstruction {
  switch (block.type) {
    case "deadline":
      return {
        op: "_deadline",
        args: uintBE(BigInt(opts.now) + BigInt(Math.round(block.hours * 3600)), 5),
      };
    case "concentration": {
      // On-chain args: sqrt(P)·1e18 with P = tokenGt per tokenLt; the LLM
      // band is token1-per-token0 in pair order. Floor-rounded isqrt.
      const pMin = token0IsLt ? block.priceMin : 1 / block.priceMax;
      const pMax = token0IsLt ? block.priceMax : 1 / block.priceMin;
      return {
        op: "_xycConcentrateGrowLiquidity2D",
        args: concat(uintBE(sqrtPriceX18(pMin), 32), uintBE(sqrtPriceX18(pMax), 32)),
      };
    }
    case "decay":
      return { op: "_decayXD", args: uintBE(BigInt(block.periodSecs), 2) };
    case "oracleGuard": {
      const feed = opts.feedOverride ?? resolveFeed(opts.chainId, block.feed);
      const baseIsLt = (opts.pairBase === "token0") === token0IsLt;
      return {
        op: "_oracleGuard2D",
        args: concat(
          addressBytes(feed.address),
          uintBE(BigInt(feed.decimals), 1),
          uintBE(BigInt(block.maxStalenessSecs), 2),
          uintBE(BigInt(block.maxDeviationBps), 2),
          uintBE(BigInt(MODE_BYTE[block.mode]), 1),
          uintBE(baseIsLt ? 1n : 0n, 1),
        ),
      };
    }
    case "inventorySkew": {
      if (block.maxImproveBps !== undefined && block.maxImproveBps !== 0) {
        throw new CompileError(
          "ImproveLegReserved",
          `inventorySkew.maxImproveBps is reserved (improvement leg cut — see InventorySkew.sol decision record); got ${block.maxImproveBps}`,
        );
      }
      // targetRatio is the LT-token share (ast.ts freeze) — 1e-6 grid → 1e18.
      const targetRatioE18 = BigInt(Math.round(block.targetRatio * 1e6)) * 10n ** 12n;
      return {
        op: "_inventorySkew2D",
        args: concat(
          uintBE(targetRatioE18, 8),
          uintBE(BigInt(block.slopeBps), 2),
          uintBE(BigInt(block.maxSkewBps), 2),
          uintBE(0n, 2), // maxImproveBps RESERVED
        ),
      };
    }
    case "makerFee":
      return { op: "_flatFeeAmountInXD", args: uintBE(BigInt(block.bps) * FEE_BASE_SCALE, 4) };
    case "protocolFee":
      return {
        op: "_aquaProtocolFeeAmountInXD",
        args: concat(uintBE(BigInt(block.bps) * FEE_BASE_SCALE, 4), addressBytes(block.receiver)),
      };
    case "curve":
      // specVersion 1: only "xyc" parses (ast.ts enum).
      return { op: "_xycSwapXD", args: new Uint8Array(0) };
    case "salt":
      return { op: "_salt", args: uintBE(BigInt(block.value), 8) };
  }
}

function assertCanonicalOrder(spec: StrategySpec): void {
  const rank = new Map(CANONICAL_ORDER.map((kind, i) => [kind, i] as const));
  let prev = -1;
  for (const block of spec.blocks) {
    const r = rank.get(block.type)!;
    if (r < prev) {
      throw new CompileError(
        "NonCanonicalOrder",
        `blocks are not in canonical order at "${block.type}" — run canonicalize() (and rules.ts) before lowering`,
      );
    }
    prev = r;
  }
}

/// sqrt(price)·1e18, floor. Price snapped to a 1e-12 grid first so the
/// result is platform-independent.
function sqrtPriceX18(price: number): bigint {
  const priceE12 = BigInt(Math.round(price * 1e12));
  if (priceE12 <= 0n) {
    throw new CompileError("PriceUnderflow", `concentration price ${price} is below the 1e-12 grid`);
  }
  // sqrt(priceE12 · 1e24) = sqrt(price)·1e18
  return isqrt(priceE12 * 10n ** 24n);
}

export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new CompileError("NegativeSqrt", "isqrt of negative");
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

// ── byte packing ─────────────────────────────────────────────────────────

export function uintBE(value: bigint, byteLength: number): Uint8Array {
  if (value < 0n || value >= 1n << BigInt(8 * byteLength)) {
    throw new CompileError("UintOverflow", `${value} does not fit in ${byteLength} bytes`);
  }
  const out = new Uint8Array(byteLength);
  let v = value;
  for (let i = byteLength - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

export function addressBytes(address: string): Uint8Array {
  const hex = address.slice(2);
  const out = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
