#!/bin/bash
# Re-geocode venues that were interim-snapped to their city center.
# ---------------------------------------------------------------------------
# Context: migration 20260606100000 + a one-off snap moved every "misplaced"
# venue (pin in a different city than its linked city) to its city center.
# Venues WITHOUT a usable street address stay at the center permanently.
# Venues WITH a real address were snapped as an interim fix and tagged in
# venue_coord_fixes.source = 'snap_pending_regeocode'. This script upgrades
# those to precise coordinates via country-validated Nominatim geocoding.
#
# Idempotent + resumable: a venue is "done" once it has a venue_coord_fixes
# row with source='script'. Re-running picks up where it left off.
#
# Requires: linked Supabase CLI (`supabase link`) OR run anywhere the sibling
# scripts/backfill-venue-forward-geocode.sh works. Public Nominatim → 1 req/sec.
#
# Usage: scripts/data-cleanup/fix-venue-misplaced-coords.sh [BATCH]
set -euo pipefail
UA="QueerGuide/1.0 (https://queer.guide; contact@queer.guide)"
BATCH=${1:-50}
NOMINATIM=${NOMINATIM_URL:-https://nominatim.openstreetmap.org}
SLEEP=${NOMINATIM_SLEEP:-1.1}
MAX_KM=${MAX_KM:-60}          # accept geocode only if within this many km of the linked city
TOTAL=0; FIXED=0; KEPT=0

q() { npx supabase db query --linked "$1" 2>/dev/null; }

echo "=== Re-geocode interim-snapped venues (batch=$BATCH, max_km=$MAX_KM) ==="

while true; do
  ROWS=$(q "
    SELECT DISTINCT ON (v.id) v.id, v.address, v.name,
           coalesce(co.code,'') AS cc,
           c.latitude::float AS clat, c.longitude::float AS clng
    FROM venues v
    JOIN venue_coord_fixes f ON f.venue_id = v.id AND f.source = 'snap_pending_regeocode'
    JOIN cities c ON c.id = v.city_id AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
    LEFT JOIN countries co ON co.id = v.country_id
    WHERE v.duplicate_of_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM venue_coord_fixes d WHERE d.venue_id = v.id AND d.source = 'script')
    ORDER BY v.id
    LIMIT $BATCH;
  ")

  COUNT=$(echo "$ROWS" | jq '.rows | length')
  [ "$COUNT" = "0" ] && { echo "No more venues to process."; break; }
  echo "Processing $COUNT venues..."

  for i in $(seq 0 $((COUNT - 1))); do
    ID=$(echo "$ROWS"  | jq -r ".rows[$i].id")
    ADDR=$(echo "$ROWS" | jq -r ".rows[$i].address")
    NAME=$(echo "$ROWS" | jq -r ".rows[$i].name")
    CC=$(echo "$ROWS"   | jq -r ".rows[$i].cc")
    CLAT=$(echo "$ROWS" | jq -r ".rows[$i].clat")
    CLNG=$(echo "$ROWS" | jq -r ".rows[$i].clng")
    TOTAL=$((TOTAL + 1))

    ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$ADDR" 2>/dev/null || echo "")
    CCQ=""; [ -n "$CC" ] && CCQ="&countrycodes=$(echo "$CC" | tr '[:upper:]' '[:lower:]')"
    RES=$(curl -s -H "User-Agent: $UA" \
      "${NOMINATIM}/search?format=json&q=${ENCODED}&limit=1&addressdetails=1${CCQ}" 2>/dev/null)

    LAT=$(echo "$RES" | jq -r '.[0].lat // empty')
    LON=$(echo "$RES" | jq -r '.[0].lon // empty')

    OK=0
    if [ -n "$LAT" ] && [ -n "$LON" ] && [ "$LAT" != "0" ] && [ "$LON" != "0" ]; then
      KM=$(python3 -c "
import math,sys
la,lo,ca,co=map(float,sys.argv[1:5])
R=6371.0088
dla=math.radians(ca-la); dlo=math.radians(co-lo)
a=math.sin(dla/2)**2+math.cos(math.radians(la))*math.cos(math.radians(ca))*math.sin(dlo/2)**2
print(R*2*math.asin(math.sqrt(a)))" "$LAT" "$LON" "$CLAT" "$CLNG" 2>/dev/null || echo "99999")
      if awk "BEGIN{exit !($KM <= $MAX_KM)}"; then OK=1; fi
    fi

    if [ "$OK" = "1" ]; then
      q "
        WITH cur AS (SELECT latitude AS la, longitude AS lo FROM venues WHERE id='${ID}')
        INSERT INTO venue_coord_fixes (venue_id,mode,old_lat,old_lng,new_lat,new_lng,city_id,km_before,source)
        SELECT '${ID}','regeocode',cur.la,cur.lo,${LAT}::numeric,${LON}::numeric,
               (SELECT city_id FROM venues WHERE id='${ID}'), NULL,'script' FROM cur;
        UPDATE venues SET latitude=${LAT}::numeric, longitude=${LON}::numeric,
               geocode_attempted=true, last_refreshed_at=now() WHERE id='${ID}';
      " > /dev/null
      FIXED=$((FIXED + 1))
      echo "  [$TOTAL] $NAME → ${LAT},${LON} (${KM}km from city) FIXED"
    else
      # keep the city-center snap; just mark processed so we don't retry forever
      q "
        INSERT INTO venue_coord_fixes (venue_id,mode,old_lat,old_lng,new_lat,new_lng,city_id,km_before,source)
        VALUES ('${ID}','kept_snap',NULL,NULL,NULL,NULL,
                (SELECT city_id FROM venues WHERE id='${ID}'),NULL,'script');
        UPDATE venues SET geocode_attempted=true WHERE id='${ID}';
      " > /dev/null
      KEPT=$((KEPT + 1))
      echo "  [$TOTAL] $NAME: no usable geocode (kept at city center)"
    fi
    sleep "$SLEEP"
  done
  echo "--- batch done (fixed=$FIXED kept=$KEPT) ---"
done

echo "=== Complete. Processed=$TOTAL  Re-geocoded=$FIXED  Kept-at-center=$KEPT ==="
