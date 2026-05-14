#!/bin/bash
# Backfill birth_place for personalities with wikidata_qid but no birth_place
# Uses Wikidata API directly + supabase db query for DB access
# Rate limited to ~3 req/sec to respect Wikidata terms

set -euo pipefail
UA="QueerGuide/1.0 (https://queer.guide; contact@queer.guide)"
BATCH=${1:-50}
TOTAL_UPDATED=0

echo "=== Wikidata birth_place backfill (batch=$BATCH) ==="

while true; do
  # Get batch of personalities with QID but no birth_place
  ROWS=$(npx supabase db query --linked "
    SELECT id, wikidata_qid, name
    FROM personalities
    WHERE wikidata_qid IS NOT NULL
      AND (birth_place IS NULL OR birth_place = '')
      AND city_id IS NULL
      AND duplicate_of_id IS NULL
    ORDER BY view_count DESC NULLS LAST
    LIMIT $BATCH;
  " 2>/dev/null)

  COUNT=$(echo "$ROWS" | jq '.rows | length')
  if [ "$COUNT" = "0" ]; then
    echo "No more rows to process."
    break
  fi

  echo "Processing $COUNT personalities..."

  for i in $(seq 0 $((COUNT - 1))); do
    ID=$(echo "$ROWS" | jq -r ".rows[$i].id")
    QID=$(echo "$ROWS" | jq -r ".rows[$i].wikidata_qid")
    NAME=$(echo "$ROWS" | jq -r ".rows[$i].name")

    # Fetch Wikidata entity
    ENTITY=$(curl -s -H "User-Agent: $UA" \
      "https://www.wikidata.org/wiki/Special:EntityData/${QID}.json" 2>/dev/null)

    if [ -z "$ENTITY" ] || [ "$ENTITY" = "null" ]; then
      echo "  [$i] $NAME ($QID): no entity data"
      sleep 0.3
      continue
    fi

    # Extract P19 (place of birth) QID
    PLACE_QID=$(echo "$ENTITY" | jq -r ".entities.\"$QID\".claims.P19[0].mainsnak.datavalue.value.id // empty")

    # Extract P27 (country of citizenship) QID
    CITIZEN_QID=$(echo "$ENTITY" | jq -r ".entities.\"$QID\".claims.P27[0].mainsnak.datavalue.value.id // empty")

    UPDATES=""

    if [ -n "$PLACE_QID" ]; then
      sleep 0.3
      # Resolve place name
      PLACE_ENTITY=$(curl -s -H "User-Agent: $UA" \
        "https://www.wikidata.org/wiki/Special:EntityData/${PLACE_QID}.json" 2>/dev/null)
      PLACE_NAME=$(echo "$PLACE_ENTITY" | jq -r ".entities.\"$PLACE_QID\".labels.en.value // empty")

      if [ -n "$PLACE_NAME" ]; then
        ESCAPED_PLACE=$(echo "$PLACE_NAME" | sed "s/'/''/g")
        UPDATES="birth_place = '${ESCAPED_PLACE}'"
      fi
    fi

    if [ -n "$CITIZEN_QID" ]; then
      sleep 0.3
      CITIZEN_ENTITY=$(curl -s -H "User-Agent: $UA" \
        "https://www.wikidata.org/wiki/Special:EntityData/${CITIZEN_QID}.json" 2>/dev/null)
      CITIZEN_NAME=$(echo "$CITIZEN_ENTITY" | jq -r ".entities.\"$CITIZEN_QID\".labels.en.value // empty")

      if [ -n "$CITIZEN_NAME" ]; then
        ESCAPED_CITIZEN=$(echo "$CITIZEN_NAME" | sed "s/'/''/g")
        if [ -n "$UPDATES" ]; then
          UPDATES="$UPDATES, nationality = '${ESCAPED_CITIZEN}'"
        else
          UPDATES="nationality = '${ESCAPED_CITIZEN}'"
        fi
      fi
    fi

    if [ -n "$UPDATES" ]; then
      npx supabase db query --linked "
        UPDATE personalities SET $UPDATES, updated_at = now()
        WHERE id = '${ID}';
      " 2>/dev/null > /dev/null
      echo "  [$i] $NAME: $UPDATES"
      TOTAL_UPDATED=$((TOTAL_UPDATED + 1))
    else
      echo "  [$i] $NAME ($QID): no birth_place/nationality found"
    fi

    sleep 0.3
  done

  echo "Batch done. Total updated so far: $TOTAL_UPDATED"
  echo "---"
done

echo "=== Complete. Total updated: $TOTAL_UPDATED ==="
