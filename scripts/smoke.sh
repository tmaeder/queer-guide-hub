#!/usr/bin/env bash
# Post-deploy smoke test for the search proxy.
# Usage:  SEARCH_URL=https://... bash scripts/smoke.sh

set -euo pipefail
: "${SEARCH_URL:?set SEARCH_URL}"

pass=0; fail=0
check() {
	local name=$1 body=$2 needle=$3
	if printf '%s' "$body" | grep -q "$needle"; then
		echo "  ✓ $name"; pass=$((pass+1))
	else
		echo "  ✗ $name"; fail=$((fail+1))
	fi
}

echo "== /health =="
if curl -sSf "$SEARCH_URL/health" >/dev/null 2>&1; then
	echo "  ✓ health 200"; pass=$((pass+1))
else
	echo "  ✗ health 200"; fail=$((fail+1))
fi

echo "== /search =="
resp=$(curl -sS -X POST "$SEARCH_URL/search" -H 'content-type: application/json' \
	-d '{"query":"gay bar","session_id":"smoke-test","debug":true,"hitsPerPage":3}')
printf '%s' "$resp" | head -c 300; echo
check "hits field"           "$resp" '"hits":'
check "facetDistribution"    "$resp" 'facetDistribution'
check "debug block"          "$resp" 'biasApplied'

echo "== /autocomplete =="
ac=$(curl -sS -X POST "$SEARCH_URL/autocomplete" -H 'content-type: application/json' \
	-d '{"query":"ber","limit":5}')
check "suggestions field"    "$ac" '"suggestions":'

echo "== /trending =="
tr=$(curl -sS -X POST "$SEARCH_URL/trending" -H 'content-type: application/json' \
	-d '{"types":["venue","event"],"limit":5}')
check "trending field"       "$tr" '"trending":'

echo "== /track =="
tk=$(curl -sS -X POST "$SEARCH_URL/track" -H 'content-type: application/json' \
	-d '{"session_id":"smoke-test","event_type":"click","entity_type":"venue","entity_id":"00000000-0000-0000-0000-000000000000","metadata":{"city":"berlin"}}')
check "track ok"             "$tk" '"ok":true'

echo "== /feedback =="
fb=$(curl -sS -X POST "$SEARCH_URL/feedback" -H 'content-type: application/json' \
	-d '{"session_id":"smoke-test","vote":"up","entity_type":"venue","entity_id":"00000000-0000-0000-0000-000000000000","query":"bar"}')
check "feedback ok"          "$fb" '"ok":true'

echo
echo "Passed: $pass   Failed: $fail"
test "$fail" -eq 0
