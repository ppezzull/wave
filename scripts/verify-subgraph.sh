#!/usr/bin/env bash
# Pietro Item E — verify live Sepolia subgraph has seeded strategies/swaps.
# Exit 0 when both arrays are non-empty; exit 1 while still empty (truth).
set -euo pipefail

URL="${WAVE_SUBGRAPH_URL:-https://api.studio.thegraph.com/query/1756983/wave/v0.0.4}"
QUERY='{"query":"{ strategies(first:5){ id swapCount cumulativeVolumeIn cumulativeVolumeOut committedCapital programHash } swaps(first:5){ id strategy{ id } amountIn amountOut } }"}'

echo "Querying $URL"
RESP=$(curl -sS -X POST "$URL" -H 'content-type: application/json' --data "$QUERY")
echo "$RESP" | python3 -c '
import json,sys
d=json.load(sys.stdin)
if "errors" in d:
    print("GraphQL errors:", d["errors"]); sys.exit(2)
data=d.get("data") or {}
strats=data.get("strategies") or []
swaps=data.get("swaps") or []
print(f"strategies={len(strats)} swaps={len(swaps)}")
for s in strats[:5]:
    print("  strategy", s.get("id"), "swaps", s.get("swapCount"))
for s in swaps[:5]:
    print("  swap", s.get("id"), "→", (s.get("strategy") or {}).get("id"))
if not strats or not swaps:
    print("EMPTY — seed not landed yet (Item E). Feed will rank nothing in live mode.")
    sys.exit(1)
print("OK — seed present. Flip WAVE_ENS_WIRED=true once ENS records resolve.")
'

# Tip: after OK, set in .env / ui .env.local:
#   WAVE_USE_MOCK=false
#   WAVE_ENS_WIRED=true
