// wave compiler — rejection rules as data (10-10-PLAYBOOK.md §1.5, Move #1).
//
// Each rule is a plain {name, predicate, message, rewrite} record: the
// reject-and-rewrite pass runs them over the RAW (as-written) spec and, on
// violation, emits a typed Rejection carrying the corrected rewrite plus the
// canonical pass's move-arrows and unified diff — the red REJECTED card.
//
// The 6 rules named in §1.5. Per Flaviano.md riga 17, the first two are
// implemented now; the other four are declared stubs (always-pass) so the
// rule *surface* is frozen while their predicates land incrementally.

import type { StrategySpec } from "./ast.js";
import { canonicalize, serializeBlock, unifiedDiff, type Move } from "./canonical.js";

export interface Rule {
  name: string;
  /// True when the spec SATISFIES the rule.
  predicate: (spec: StrategySpec) => boolean;
  message: (spec: StrategySpec) => string;
  /// Deterministic corrected spec; present only when an auto-fix exists.
  rewrite?: (spec: StrategySpec) => StrategySpec;
}

export interface Rejection {
  rule: string;
  message: string;
  /// The corrected spec (already canonicalized), when the rule can auto-fix.
  rewrite?: StrategySpec;
  /// Move-arrows + unified diff from the as-written spec to the rewrite.
  moves?: Move[];
  diff?: string;
}

const blockIndexes = (spec: StrategySpec, type: string): number[] =>
  spec.blocks.flatMap((b, i) => (b.type === type ? [i] : []));

/// Rewrites that only reorder delegate to the canonical pass.
const canonicalRewrite = (spec: StrategySpec): StrategySpec => canonicalize(spec).spec;

/// SECURITY RULE, not style (matrioska: earlier in bytecode = MORE OUTER).
/// The one-sided guard band is derived for a guard that wraps the skew and
/// reads amounts AFTER the maker-favoured penalty; a guard inside the skew
/// would band-check pre-penalty amounts and the safety argument collapses.
const oracleGuardMustPrecedeSkew: Rule = {
  name: "OracleGuardMustPrecedeSkew",
  predicate: (spec) => {
    const guards = blockIndexes(spec, "oracleGuard");
    const skews = blockIndexes(spec, "inventorySkew");
    if (guards.length === 0 || skews.length === 0) return true;
    return Math.max(...guards) < Math.min(...skews);
  },
  message: () =>
    "oracleGuard must come before inventorySkew: the guard wraps the skew (earlier = more outer) and its one-sided band is only safe reading amounts after the skew's maker-favoured penalty",
  rewrite: canonicalRewrite,
};

const protocolFeeLeMakerFee: Rule = {
  name: "ProtocolFeeLeMakerFee",
  predicate: (spec) => {
    const protocol = spec.blocks.find((b) => b.type === "protocolFee");
    if (protocol === undefined) return true;
    const maker = spec.blocks.find((b) => b.type === "makerFee");
    return protocol.bps <= (maker?.type === "makerFee" ? maker.bps : 0);
  },
  message: (spec) => {
    const protocol = spec.blocks.find((b) => b.type === "protocolFee");
    const maker = spec.blocks.find((b) => b.type === "makerFee");
    const protocolBps = protocol?.type === "protocolFee" ? protocol.bps : 0;
    const makerBps = maker?.type === "makerFee" ? maker.bps : 0;
    return `protocolFee (${protocolBps} bps) must not exceed makerFee (${makerBps} bps): the protocol's cut comes out of the maker's fee, never on top of the taker's price`;
  },
  rewrite: (spec) => {
    const maker = spec.blocks.find((b) => b.type === "makerFee");
    const makerBps = maker?.type === "makerFee" ? maker.bps : 0;
    return canonicalize({
      ...spec,
      blocks: spec.blocks.map((b) => (b.type === "protocolFee" ? { ...b, bps: makerBps } : b)),
    }).spec;
  },
};

/// TODO(rules): stubbed — predicate always passes until implemented.
const stub = (name: string, description: string): Rule => ({
  name,
  predicate: () => true,
  message: () => description,
});

export const RULES: readonly Rule[] = [
  oracleGuardMustPrecedeSkew,
  protocolFeeLeMakerFee,
  stub("SaltMustBeTerminal", "salt must be the last block (order-hash uniqueness carrier)"),
  stub(
    "OracleStalenessRequiresGuard",
    "a staleness bound is meaningless without an oracleGuard block to enforce it",
  ),
  stub("FeeAfterCurve", "fee blocks must precede the curve (fees wrap the swap core)"),
  stub("NoDuplicateDeadline", "at most one deadline block per strategy"),
];

/// Run every rule against the as-written spec. Empty array = accepted.
export function checkRules(spec: StrategySpec, rules: readonly Rule[] = RULES): Rejection[] {
  const rejections: Rejection[] = [];
  for (const rule of rules) {
    if (rule.predicate(spec)) continue;
    const rejection: Rejection = { rule: rule.name, message: rule.message(spec) };
    if (rule.rewrite !== undefined) {
      const rewritten = rule.rewrite(spec);
      // Diff against the as-written spec so the card shows the full fix.
      const { moves, diff } = diffSpecs(spec, rewritten);
      rejection.rewrite = rewritten;
      rejection.moves = moves;
      rejection.diff = diff;
    }
    rejections.push(rejection);
  }
  return rejections;
}

/// Reuse the canonical pass's diff machinery over the two block lists.
function diffSpecs(before: StrategySpec, after: StrategySpec): { moves: Move[]; diff: string } {
  const beforeLines = before.blocks.map(serializeBlock);
  const afterLines = after.blocks.map(serializeBlock);
  const moves: Move[] = [];
  before.blocks.forEach((block, from) => {
    const line = serializeBlock(block);
    const to = afterLines.indexOf(line);
    if (to !== -1 && to !== from) moves.push({ kind: block.type, from, to });
  });
  return {
    moves,
    diff: beforeLines.join("\n") === afterLines.join("\n") ? "" : unifiedDiff(beforeLines, afterLines),
  };
}
