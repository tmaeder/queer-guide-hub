#!/usr/bin/env bash
# Seed the `aliases` array on well-known cities so multilingual queries match
# their English forms (bug #4 / #10).
#
# This is a one-off backfill — the long-term fix is to have the city indexer
# emit aliases as part of the document. Until then, run this against a fresh
# Meilisearch deployment after configure-indexes.sh.
#
# Usage:
#   MEILI_URL=https://s.queer.guide MEILI_MASTER_KEY=xxx ./seed-city-aliases.sh

set -euo pipefail
MEILI_URL="${MEILI_URL:?Set MEILI_URL}"
MEILI_MASTER_KEY="${MEILI_MASTER_KEY:?Set MEILI_MASTER_KEY}"

# Each line is: <english_lowercase>|<aliases comma separated>
ALIASES=$(cat <<'EOF'
munich|munich,München,Muenchen
cologne|cologne,Köln,Koeln
vienna|vienna,Wien
prague|prague,Praha
florence|florence,Firenze
naples|naples,Napoli
copenhagen|copenhagen,København,Kobenhavn
warsaw|warsaw,Warszawa
lisbon|lisbon,Lisboa
athens|athens,Αθήνα,Athina
moscow|moscow,Москва,Moskva
beijing|beijing,北京,Peking
tokyo|tokyo,東京,Tōkyō,Toukyou
seoul|seoul,서울
osaka|osaka,大阪,Ōsaka
kyoto|kyoto,京都
shanghai|shanghai,上海
hong kong|hong kong,香港,Hongkong
taipei|taipei,台北,Táiběi
dubai|dubai,دبي,Dubayy
istanbul|istanbul,İstanbul,Constantinople
cairo|cairo,القاهرة,Al-Qāhirah
tel aviv|tel aviv,תל אביב,Tel-Aviv
jerusalem|jerusalem,ירושלים,القدس
bangkok|bangkok,กรุงเทพ,Krung Thep
mumbai|mumbai,मुंबई,Bombay
delhi|delhi,दिल्ली,New Delhi
bucharest|bucharest,București,Bucuresti
zurich|zurich,Zürich,Zuerich
geneva|geneva,Genève,Geneve
berlin|berlin,Berlin
paris|paris,Paris
london|london,London,Londres
new york|new york,New York,NYC
EOF
)

while IFS='|' read -r english raw_aliases; do
  [ -z "$english" ] && continue
  aliases_json=$(printf '%s' "$raw_aliases" | python3 -c 'import sys,json; print(json.dumps([s.strip() for s in sys.stdin.read().split(",") if s.strip()]))')
  resp=$(curl -s ${MEILI_CURL_OPTS:-} -X POST "${MEILI_URL}/indexes/cities/search" \
    -H "Authorization: Bearer ${MEILI_MASTER_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"q\":\"${english}\",\"limit\":5,\"attributesToRetrieve\":[\"id\",\"title\"]}")
  ids=$(printf '%s' "$resp" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("
".join(h["id"] for h in d.get("hits",[]) if h.get("title","").lower()==sys.argv[1].lower()))' "$english")
  if [ -z "$ids" ]; then
    echo "skip ${english}: no exact title match"
    continue
  fi
  while IFS= read -r doc_id; do
    [ -z "$doc_id" ] && continue
    body=$(printf '[{"id":"%s","aliases":%s}]' "$doc_id" "$aliases_json")
    out=$(curl -s ${MEILI_CURL_OPTS:-} -X PUT "${MEILI_URL}/indexes/cities/documents" \
      -H "Authorization: Bearer ${MEILI_MASTER_KEY}" \
      -H "Content-Type: application/json" \
      -d "$body")
    echo "patched ${english} (${doc_id})"
  done <<< "$ids"
done <<< "$ALIASES"

echo "Done. Wait for the index task: ${MEILI_URL}/tasks"
