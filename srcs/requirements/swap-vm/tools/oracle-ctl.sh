#!/usr/bin/env bash
# Demo control for the deployed MockOracle (riga 25): deviate the price to
# arm the judge-triggered `_oracleGuard2D` halt, restore it for the happy
# path, refresh `updatedAt`, or make the feed stale on purpose.
#
#   ORACLE=0x… RPC_URL=… PK=… tools/oracle-ctl.sh status
#   … deviate 30        # push price down 30% (maker-unfavourable side arms)
#   … restore 100000000 # set answer back (raw int, e.g. 1e8 = price 1.0)
#   … touch             # updatedAt = now (fresh)
#   … stale 7201        # updatedAt = now - N secs (forces the staleness halt)
#
# Every subcommand refreshes updatedAt except `stale` (which sets it back).
set -euo pipefail

ORACLE="${ORACLE:?set ORACLE=<MockOracle address>}"
RPC_URL="${RPC_URL:?set RPC_URL}"
PK="${PK:?set PK=<private key of any EOA — the mock is open>}"

now() { cast block latest --rpc-url "$RPC_URL" --field timestamp; }
answer() { cast call "$ORACLE" "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url "$RPC_URL" | sed -n 2p | awk '{print $1}'; }
send() { cast send "$ORACLE" "$@" --rpc-url "$RPC_URL" --private-key "$PK" > /dev/null; }

case "${1:?subcommand: status|deviate|restore|touch|stale}" in
  status)
    cast call "$ORACLE" "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url "$RPC_URL"
    ;;
  deviate)
    PCT="${2:?deviate <percent-down>}"
    CUR="$(answer)"
    NEW=$(python3 -c "print($CUR * (100 - $PCT) // 100)")
    send "setAnswer(int256)" "$NEW"
    send "setUpdatedAt(uint256)" "$(now)"
    echo "answer: $CUR -> $NEW (-$PCT%), updatedAt refreshed"
    ;;
  restore)
    NEW="${2:?restore <raw answer, e.g. 100000000>}"
    send "setAnswer(int256)" "$NEW"
    send "setUpdatedAt(uint256)" "$(now)"
    echo "answer restored to $NEW, updatedAt refreshed"
    ;;
  touch)
    send "setUpdatedAt(uint256)" "$(now)"
    echo "updatedAt refreshed"
    ;;
  stale)
    SECS="${2:?stale <seconds in the past>}"
    T="$(now)"
    send "setUpdatedAt(uint256)" "$((T - SECS))"
    echo "updatedAt = now - ${SECS}s (staleness halt armed)"
    ;;
  *)
    echo "unknown subcommand: $1" >&2
    exit 2
    ;;
esac
