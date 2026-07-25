// wave compiler — canonical-order pass (10-10-PLAYBOOK.md §1.5, Move #1).
//
// Reorders a parsed StrategySpec's blocks into CANONICAL_ORDER and reports
// exactly what moved: a `moves` list (the UI's move-arrows) and a unified
// diff of the block lines (the reject-and-rewrite card). Pure and
// deterministic — same spec in, same bytes out, no I/O, no randomness.
//
// This pass REORDERS; it does not judge. Rule violations (guard after skew,
// protocol fee above maker fee, …) are rules.ts's job — a Rejection carries
// this pass's output as its suggested rewrite.
//
// The sort is stable: blocks of the same kind keep their relative order, so
// duplicate detection (NoDuplicateDeadline) still sees the original sequence.

import { type Block, type BlockKind, CANONICAL_ORDER, type StrategySpec } from "./ast.js";

export interface Move {
  kind: BlockKind;
  from: number;
  to: number;
}

export interface CanonicalResult {
  /// The spec with blocks in canonical order (other fields untouched).
  spec: StrategySpec;
  changed: boolean;
  /// One entry per block whose index changed — the UI move-arrows.
  moves: Move[];
  /// Unified diff of the serialized block lines; "" when nothing moved.
  diff: string;
}

const KIND_RANK: Record<BlockKind, number> = Object.fromEntries(
  CANONICAL_ORDER.map((kind, rank) => [kind, rank]),
) as Record<BlockKind, number>;

/// One deterministic line per block: `type` first, remaining keys sorted.
/// (Zod preserves input key order, so raw JSON.stringify would leak the
/// caller's formatting into the diff.)
export function serializeBlock(block: Block): string {
  const { type, ...rest } = block;
  const keys = Object.keys(rest).sort();
  const fields = keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify((rest as Record<string, unknown>)[k])}`);
  return `{"type":${JSON.stringify(type)}${fields.length > 0 ? "," + fields.join(",") : ""}}`;
}

export function canonicalize(spec: StrategySpec): CanonicalResult {
  const indexed = spec.blocks.map((block, from) => ({ block, from }));
  const sorted = [...indexed].sort((a, b) => {
    const byKind = KIND_RANK[a.block.type] - KIND_RANK[b.block.type];
    return byKind !== 0 ? byKind : a.from - b.from; // stable
  });

  const moves: Move[] = [];
  sorted.forEach(({ block, from }, to) => {
    if (from !== to) moves.push({ kind: block.type, from, to });
  });

  const canonicalBlocks = sorted.map(({ block }) => block);
  const changed = moves.length > 0;
  return {
    spec: { ...spec, blocks: canonicalBlocks },
    changed,
    moves,
    diff: changed
      ? unifiedDiff(spec.blocks.map(serializeBlock), canonicalBlocks.map(serializeBlock))
      : "",
  };
}

/// Minimal unified diff (single hunk, full context) over block lines.
/// LCS-based so unmoved blocks render as context, moved ones as -/+ pairs.
export function unifiedDiff(before: string[], after: string[]): string {
  const n = before.length;
  const m = after.length;
  // lcs[i][j] = LCS length of before[i:] and after[j:]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        before[i] === after[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const lines: string[] = [`--- blocks (as written)`, `+++ blocks (canonical)`, `@@ -1,${n} +1,${m} @@`];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && before[i] === after[j]) {
      lines.push(` ${before[i]}`);
      i++;
      j++;
    } else if (j < m && (i === n || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) {
      lines.push(`+${after[j]}`);
      j++;
    } else {
      lines.push(`-${before[i]}`);
      i++;
    }
  }
  return lines.join("\n");
}
