#!/bin/bash
# Forward geocode venues with address but no coords/city_id
# Uses Nominatim API directly + supabase db query for DB access
# Rate limited to 1 req/sec for public Nominatim

set -euo pipefail
UA="QueerGuide/1.0 (https://queer.guide; contact@queer.guide)"
BATCH=${1:-25}
NOMINATIM=${NOMINATIM_URL:-https://nominatim.openstreetmap.org}
SLEEP=${NOMINATIM_SLEEP:-1.1}
TOTAL_MATCHED=0
TOTAL_PROCESSED=0

echo "=== Venue forward geocode (batch=$BATCH, nominatim=$NOMINATIM) ==="

while true; do
  ROWS=$(npx supabase db query --linked "
    SELECT id, address, name
    FROM venues
    WHERE city_id IS NULL AND duplicate_of_id IS NULL
      AND address IS NOT NULL AND address != ''
      AND (latitude IS NULL OR longitude IS NULL)
      AND (geocode_attempted IS NULL OR geocode_attempted = false)
    ORDER BY id
    LIMIT $BATCH;
  " 2>/dev/null)

  COUNT=$(echo "$ROWS" | jq '.rows | length')
  if [ "$COUNT" = "0" ]; then
    echo "No more rows to process."
    break
  fi

  echo "Processing $COUNT venues..."

  for i in $(seq 0 $((COUNT - 1))); do
    ID=$(echo "$ROWS" | jq -r ".rows[$i].id")
    ADDRESS=$(echo "$ROWS" | jq -r ".rows[$i].address")
    NAME=$(echo "$ROWS" | jq -r ".rows[$i].name")
    TOTAL_PROCESSED=$((TOTAL_PROCESSED + 1))

    ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$ADDRESS'''))" 2>/dev/null || echo "")
    if [ -z "$ENCODED" ]; then
      ENCODED=$(echo "$ADDRESS" | sed 's/ /%20/g; s/,/%2C/g')
    fi

    RESULT=$(curl -s -H "User-Agent: $UA" \
      "${NOMINATIM}/search?format=json&q=${ENCODED}&limit=1&addressdetails=1" 2>/dev/null)

    if [ -z "$RESULT" ] || [ "$RESULT" = "[]" ]; then
      npx supabase db query --linked "
        UPDATE venues SET geocode_attempted = true, updated_at = now() WHERE id = '${ID}';
      " 2>/dev/null > /dev/null
      echo "  [$TOTAL_PROCESSED] $NAME: no results"
      sleep "$SLEEP"
      continue
    fi

    LAT=$(echo "$RESULT" | jq -r '.[0].lat // empty')
    LON=$(echo "$RESULT" | jq -r '.[0].lon // empty')
    CITY=$(echo "$RESULT" | jq -r '.[0].address.city // .[0].address.town // .[0].address.village // .[0].address.municipality // empty')
    COUNTRY_CODE=$(echo "$RESULT" | jq -r '.[0].address.country_code // empty' | tr '[:lower:]' '[:upper:]')

    UPDATES="geocode_attempted = true, updated_at = now()"

    if [ -n "$LAT" ] && [ -n "$LON" ] && [ "$LAT" != "0" ] && [ "$LON" != "0" ]; then
      UPDATES="$UPDATES, latitude = $LAT, longitude = $LON"
    fi

    if [ -n "$CITY" ]; then
      ESCAPED_CITY=$(echo "$CITY" | sed "s/'/''/g")
      UPDATES="$UPDATES, city = '${ESCAPED_CITY}'"
    fi

    npx supabase db query --linked "
      UPDATE venues SET $UPDATES WHERE id = '${ID}';
    " 2>/dev/null > /dev/null

    # Try to match city
    if [ -n "$CITY" ]; then
      ESCAPED_CITY=$(echo "$CITY" | sed "s/'/''/g")
      npx supabase db query --linked "
        UPDATE venues v SET city_id = c.id, country_id = COALESCE(v.country_id, c.country_id)
        FROM cities c
        WHERE v.id = '${ID}' AND v.city_id IS NULL
          AND c.duplicate_of_id IS NULL
          AND c.name ILIKE '${ESCAPED_CITY}';
      " 2>/dev/null > /dev/null

      # Check alias match too
      npx supabase db query --linked "
        UPDATE venues v SET city_id = ca.city_id
        FROM city_aliases ca
        WHERE v.id = '${ID}' AND v.city_id IS NULL
          AND lower(ca.alias) = lower('${ESCAPED_CITY}');
      " 2>/dev/null > /dev/null

      # If still no match and we have country, auto-create
      if [ -n "$COUNTRY_CODE" ]; then
        npx supabase db query --linked "
          INSERT INTO cities (name, country_id, slug, data_source, latitude, longitude)
          SELECT '${ESCAPED_CITY}', co.id, 'tmp-' || gen_random_uuid(), 'nominatim-forward',
            CASE WHEN ${LAT:-0}::numeric != 0 THEN ${LAT:-0}::numeric ELSE NULL END,
            CASE WHEN ${LON:-0}::numeric != 0 THEN ${LON:-0}::numeric ELSE NULL END
          FROM countries co
          WHERE co.code = '${COUNTRY_CODE}' AND co.duplicate_of_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM cities c WHERE c.name ILIKE '${ESCAPED_CITY}' AND c.duplicate_of_id IS NULL)
            AND NOT EXISTS (SELECT 1 FROM countries cn WHERE cn.name ILIKE '${ESCAPED_CITY}')
          LIMIT 1
          ON CONFLICT (country_id, name_normalized) WHERE duplicate_of_id IS NULL DO NOTHING;

          UPDATE venues v SET city_id = c.id, country_id = COALESCE(v.country_id, c.country_id)
          FROM cities c
          WHERE v.id = '${ID}' AND v.city_id IS NULL
            AND c.duplicate_of_id IS NULL AND c.name ILIKE '${ESCAPED_CITY}';
        " 2>/dev/null > /dev/null
      fi

      TOTAL_MATCHED=$((TOTAL_MATCHED + 1))
      echo "  [$TOTAL_PROCESSED] $NAME → $CITY ($COUNTRY_CODE) [${LAT},${LON}]"
    else
      echo "  [$TOTAL_PROCESSED] $NAME: geocoded but no city name"
    fi

    sleep "$SLEEP"
  done

  echo "Batch done. Processed: $TOTAL_PROCESSED, Matched: $TOTAL_MATCHED"
  echo "---"
done

# Final sync
npx supabase db query --linked "
  UPDATE venues SET review_status = 'approved' WHERE city_id IS NOT NULL AND review_status = 'pending';
" 2>/dev/null > /dev/null

echo "=== Complete. Processed: $TOTAL_PROCESSED, Matched: $TOTAL_MATCHED ==="
