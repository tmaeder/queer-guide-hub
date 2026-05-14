#!/usr/bin/env bash
# Regression test for the city-relevance fixes (bug #4).
# For each city in the list, asserts that searching for the lowercase name
# returns that city as hits[0] from the cities index.
#
# Usage: BASE=https://search.queer.guide bash tests/cities.sh

set -uo pipefail
BASE="${BASE:-https://search.queer.guide}"
ORIGIN="https://queer.guide"
PASS=0
FAIL=0

# Top cities the bug report flagged as wrong on prod, plus a few known-good
# ones for control.
CITIES=(
  "berlin"
  "paris"
  "tokyo"
  "san francisco"
  "munich"
  "münchen"
  "cologne"
  "zurich"
  "vienna"
  "london"
  "new york"
  "amsterdam"
  "barcelona"
  "madrid"
  "rome"
)

for city in "${CITIES[@]}"; do
  payload=$(printf '{"query":%s,"filters":{"type":"city"},"hitsPerPage":1}' "$(printf '%s' "$city" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')")
  resp=$(curl -sS -X POST "$BASE/" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d "$payload")
  got=$(printf '%s' "$resp" | python3 -c 'import sys,json; d=json.load(sys.stdin); h=d.get("hits",[]); print((h[0].get("title") or "").lower() if h else "")')
  if [ "$got" = "$city" ]; then
    echo "PASS  $city"
    PASS=$((PASS+1))
  else
    echo "FAIL  $city → '$got'"
    FAIL=$((FAIL+1))
  fi
done

echo
echo "Total: $((PASS+FAIL))   Pass: $PASS   Fail: $FAIL"
[ "$FAIL" -eq 0 ]
