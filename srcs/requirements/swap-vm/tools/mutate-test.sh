#!/usr/bin/env bash
# wave mutation harness (riga 24 / Move #2): prove the invariant tests fail
# loudly when the opcode safety code is broken. RED here IS the proof.
#
#   make mutate-test MUTATION=M1   # drop the staleness revert
#   make mutate-test MUTATION=M2   # flip the one-sided band comparison
#   make mutate-test MUTATION=M3   # uncap the skew penalty
#
# Applies a single-line mutation to the instruction source, runs the wave
# invariant suites (EXPECTING failures), saves the output to
# artifacts/mutation-<M>.txt, and ALWAYS restores the original source.
set -u

cd "$(dirname "$0")/.."

GUARD=src/instructions/OracleGuard.sol
SKEW=src/instructions/InventorySkew.sol

MUTATION="${1:-${MUTATION:-}}"
if [[ -z "$MUTATION" ]]; then
  echo "usage: MUTATION=M1|M2|M3 $0  (or: $0 M1)" >&2
  exit 2
fi

case "$MUTATION" in
  M1)
    FILE="$GUARD"
    # Staleness check always passes -> stale feeds price silently.
    FROM='block.timestamp <= updatedAt + maxStaleness,'
    TO='true || block.timestamp <= updatedAt + maxStaleness,'
    EXPECT_RED="OracleGuardStaleHalt"
    ;;
  M2)
    FILE="$GUARD"
    # One-sided band flipped -> maker-favourable fills halt, unfavourable pass.
    FROM='if (ctx.swap.amountOut * den * BPS > ctx.swap.amountIn * num * (BPS + maxDeviationBps)) {'
    TO='if (ctx.swap.amountOut * den * BPS < ctx.swap.amountIn * num * (BPS + maxDeviationBps)) {'
    EXPECT_RED="OracleGuardClamp"
    ;;
  M3)
    FILE="$SKEW"
    # Penalty cap dropped -> penalties can exceed 100% and brick the strategy.
    FROM='return Math.min(slopePenalty, maxSkewBps);'
    TO='return slopePenalty;'
    EXPECT_RED="InventorySkewLiveness"
    ;;
  *)
    echo "unknown mutation: $MUTATION (want M1|M2|M3)" >&2
    exit 2
    ;;
esac

if ! grep -qF "$FROM" "$FILE"; then
  echo "mutation anchor not found in $FILE — source drifted, update tools/mutate-test.sh" >&2
  exit 3
fi

BACKUP="$(mktemp)"
cp "$FILE" "$BACKUP"
restore() { cp "$BACKUP" "$FILE"; rm -f "$BACKUP"; }
trap restore EXIT

python3 - "$FILE" "$FROM" "$TO" <<'EOF'
import sys
path, src, dst = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path).read()
open(path, "w").write(text.replace(src, dst, 1))
EOF

mkdir -p artifacts
OUT="artifacts/mutation-$MUTATION.txt"
echo "== mutation $MUTATION applied to $FILE =="
echo "== running wave invariant suites (EXPECTING RED) =="

forge test --match-path "test/invariants/{OracleGuardStaleHalt,OracleGuardClamp,InventorySkewPenalty,InventorySkewLiveness,InventorySkewAdditivity}.t.sol" > "$OUT" 2>&1
STATUS=$?

tail -n 12 "$OUT"
echo "== full output: $OUT =="

if [[ $STATUS -eq 0 ]]; then
  echo "MUTATION $MUTATION SURVIVED — the suites stayed green with broken safety code. That is a test-coverage bug." >&2
  exit 1
fi
if ! grep -q "$EXPECT_RED" "$OUT"; then
  echo "warning: failures did not include $EXPECT_RED (check $OUT)" >&2
fi
echo "MUTATION $MUTATION KILLED ✅ (tests went RED as they must)"
