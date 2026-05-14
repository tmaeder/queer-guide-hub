#!/usr/bin/env bash
#
# Contract smoke tests for the search-proxy worker. Hits a deployed BASE
# (staging or prod) and verifies the wire-level invariants from the
# api-hardening PR. Intentionally no test framework — runs anywhere with
# bash + curl + jq.
#
# Usage:
#   BASE=https://search.queer.guide bash tests/contract.sh
#   BASE=https://search-staging.queer.guide bash tests/contract.sh

set -uo pipefail
BASE="${BASE:-https://search.queer.guide}"
ORIGIN="https://queer.guide"
PASS=0
FAIL=0

pass() { echo "PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL+1)); }

post() { curl -sS -X POST "$BASE$1" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d "$2"; }
status() { curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE$1" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d "$2"; }

# 1. Pagination produces disjoint sets.
P0=$(post / '{"query":"berlin","hitsPerPage":3,"page":0}' | jq -r '[.hits[].id]|@csv')
P1=$(post / '{"query":"berlin","hitsPerPage":3,"page":1}' | jq -r '[.hits[].id]|@csv')
[ -n "$P0" ] && [ "$P0" != "$P1" ] && pass "pagination disjoint" || fail "pagination disjoint (page0=$P0 page1=$P1)"

# 2. Autocomplete with types returns suggestions.
N=$(post /autocomplete '{"query":"berlin","types":["venue","event"],"limit":6}' | jq '.suggestions | length')
[ "$N" -gt 0 ] 2>/dev/null && pass "autocomplete with types[]" || fail "autocomplete with types[] (got $N)"

# 3. hitsPerPage clamped to MAX_HITS_PER_PAGE (50).
N=$(post / '{"query":"berlin","hitsPerPage":9999}' | jq '.hits | length')
[ "$N" -le 50 ] 2>/dev/null && pass "hitsPerPage clamp" || fail "hitsPerPage clamp (got $N)"

# 4. Type-confused query → 400, not 500.
S=$(status / '{"query":123}')
[ "$S" = "400" ] && pass "non-string query → 400" || fail "non-string query → $S"

# 5. Malformed JSON → 400.
S=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" --data-raw '{not json')
[ "$S" = "400" ] && pass "malformed JSON → 400" || fail "malformed JSON → $S"

# 6. Empty body → 400.
S=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" --data-raw '')
[ "$S" = "400" ] && pass "empty body → 400" || fail "empty body → $S"

# 7. Wrong Content-Type → 415.
S=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/" -H 'Content-Type: text/plain' -H "Origin: $ORIGIN" --data-raw '{"query":"berlin"}')
[ "$S" = "415" ] && pass "wrong Content-Type → 415" || fail "wrong Content-Type → $S"

# 8. Unknown top-level key → 400.
S=$(status / '{"query":"berlin","skip":10}')
[ "$S" = "400" ] && pass "unknown top-level key → 400" || fail "unknown top-level key → $S"

# 9. Unknown filter key → 400.
S=$(status / '{"query":"berlin","filters":{"weird":1}}')
[ "$S" = "400" ] && pass "unknown filter key → 400" || fail "unknown filter key → $S"

# 10. Query too short → 400.
S=$(status / '{"query":"a"}')
[ "$S" = "400" ] && pass "query length < 2 → 400" || fail "query length < 2 → $S"

# 11. /track XSS in metadata → 400.
S=$(status /track '{"event_type":"click","entity_type":"venue","entity_id":"00000000-0000-0000-0000-000000000000","session_id":"test","metadata":{"source":"<script>alert(1)</script>"}}')
[ "$S" = "400" ] && pass "/track rejects XSS metadata" || fail "/track rejects XSS metadata → $S"

# 12. /track unknown metadata key → 400.
S=$(status /track '{"event_type":"click","entity_type":"venue","entity_id":"00000000-0000-0000-0000-000000000000","metadata":{"note":"hi"}}')
[ "$S" = "400" ] && pass "/track rejects unknown metadata key" || fail "/track rejects unknown metadata key → $S"

# 13. /trending empty types → returns trending (not [] silently).
N=$(post /trending '{"types":[],"limit":3}' | jq '.trending | length')
[ "$N" -gt 0 ] 2>/dev/null && pass "/trending empty types → defaults" || fail "/trending empty types → got $N"

# 14. CORS open on / for unknown origin.
ACAO=$(curl -sS -D - -o /dev/null -X POST "$BASE/" -H 'Content-Type: application/json' -H 'Origin: https://example.com' -d '{"query":"berlin","hitsPerPage":1}' | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')
[ "$ACAO" = "*" ] && pass "CORS ACAO:* on read endpoint" || fail "CORS ACAO on read endpoint → '$ACAO'"

# 15. CORS locked on /track for unknown origin.
ACAO=$(curl -sS -D - -o /dev/null -X OPTIONS "$BASE/track" -H 'Origin: https://example.com' | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')
[ -z "$ACAO" ] && pass "CORS locked on /track for unknown origin" || fail "CORS on /track unknown origin → '$ACAO'"

echo
echo "Total: $((PASS+FAIL))   Pass: $PASS   Fail: $FAIL"
[ "$FAIL" -eq 0 ]
