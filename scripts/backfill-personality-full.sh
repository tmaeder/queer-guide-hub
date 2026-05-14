#!/bin/bash
# Full personality enrichment: find QID → fetch birth_place → match city
# Uses Wikidata search + entity API, supabase db query for DB
# Rate: ~3 req/sec (Wikidata search + entity fetch)

set -euo pipefail
UA="QueerGuide/1.0 (https://queer.guide; contact@queer.guide)"
BATCH=${1:-50}
TOTAL_UPDATED=0
TOTAL_SKIPPED=0
ROUND=0

echo "=== Full personality enrichment (batch=$BATCH) ==="

while true; do
  ROUND=$((ROUND + 1))
  ROWS=$(npx supabase db query --linked "
    SELECT id, name, nationality
    FROM personalities
    WHERE wikidata_qid IS NULL
      AND duplicate_of_id IS NULL
    ORDER BY view_count DESC NULLS LAST
    LIMIT $BATCH;
  " 2>/dev/null)

  COUNT=$(echo "$ROWS" | jq '.rows | length')
  if [ "$COUNT" = "0" ]; then
    echo "No more rows to process."
    break
  fi

  echo "Round $ROUND: Processing $COUNT personalities..."

  for i in $(seq 0 $((COUNT - 1))); do
    ID=$(echo "$ROWS" | jq -r ".rows[$i].id")
    NAME=$(echo "$ROWS" | jq -r ".rows[$i].name")
    NATIONALITY=$(echo "$ROWS" | jq -r ".rows[$i].nationality")

    # Search Wikidata
    ENCODED_NAME=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$NAME'))" 2>/dev/null)
    SEARCH=$(curl -s -H "User-Agent: $UA" \
      "https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${ENCODED_NAME}&language=en&format=json&limit=1" 2>/dev/null)

    QID=$(echo "$SEARCH" | jq -r '.search[0].id // empty')
    LABEL=$(echo "$SEARCH" | jq -r '.search[0].label // empty')
    DESC=$(echo "$SEARCH" | jq -r '.search[0].description // empty')

    if [ -z "$QID" ]; then
      # Mark as attempted so we don't retry
      npx supabase db query --linked "
        UPDATE personalities SET wikidata_qid = 'NOT_FOUND', updated_at = now() WHERE id = '${ID}';
      " 2>/dev/null > /dev/null
      TOTAL_SKIPPED=$((TOTAL_SKIPPED + 1))
      echo "  [$i] $NAME: not found on Wikidata"
      sleep 0.3
      continue
    fi

    # Basic name similarity check
    LABEL_LOWER=$(echo "$LABEL" | tr '[:upper:]' '[:lower:]')
    NAME_LOWER=$(echo "$NAME" | tr '[:upper:]' '[:lower:]')
    if [ "$LABEL_LOWER" != "$NAME_LOWER" ]; then
      # Check if one contains the other
      if ! echo "$LABEL_LOWER" | grep -qi "$NAME_LOWER" && ! echo "$NAME_LOWER" | grep -qi "$LABEL_LOWER"; then
        npx supabase db query --linked "
          UPDATE personalities SET wikidata_qid = 'NOT_FOUND', updated_at = now() WHERE id = '${ID}';
        " 2>/dev/null > /dev/null
        TOTAL_SKIPPED=$((TOTAL_SKIPPED + 1))
        echo "  [$i] $NAME: poor match ($LABEL)"
        sleep 0.3
        continue
      fi
    fi

    sleep 0.3

    # Fetch entity for birth_place (P19), nationality (P27), birth/death dates
    ENTITY=$(curl -s -H "User-Agent: $UA" \
      "https://www.wikidata.org/wiki/Special:EntityData/${QID}.json" 2>/dev/null)

    UPDATES="wikidata_qid = '${QID}', updated_at = now()"

    if [ -n "$DESC" ]; then
      ESCAPED_DESC=$(echo "$DESC" | sed "s/'/''/g")
      UPDATES="$UPDATES, description = COALESCE(NULLIF(description, ''), '${ESCAPED_DESC}')"
    fi

    # Birth place
    PLACE_QID=$(echo "$ENTITY" | jq -r ".entities.\"$QID\".claims.P19[0].mainsnak.datavalue.value.id // empty")
    if [ -n "$PLACE_QID" ]; then
      sleep 0.3
      PLACE_DATA=$(curl -s -H "User-Agent: $UA" \
        "https://www.wikidata.org/wiki/Special:EntityData/${PLACE_QID}.json" 2>/dev/null)
      PLACE_NAME=$(echo "$PLACE_DATA" | jq -r ".entities.\"$PLACE_QID\".labels.en.value // empty")
      if [ -n "$PLACE_NAME" ]; then
        ESCAPED_PLACE=$(echo "$PLACE_NAME" | sed "s/'/''/g")
        UPDATES="$UPDATES, birth_place = COALESCE(NULLIF(birth_place, ''), '${ESCAPED_PLACE}')"
      fi
    fi

    # Nationality
    CITIZEN_QID=$(echo "$ENTITY" | jq -r ".entities.\"$QID\".claims.P27[0].mainsnak.datavalue.value.id // empty")
    if [ -n "$CITIZEN_QID" ] && [ -z "$NATIONALITY" ] || [ "$NATIONALITY" = "null" ]; then
      sleep 0.3
      CITIZEN_DATA=$(curl -s -H "User-Agent: $UA" \
        "https://www.wikidata.org/wiki/Special:EntityData/${CITIZEN_QID}.json" 2>/dev/null)
      CITIZEN_NAME=$(echo "$CITIZEN_DATA" | jq -r ".entities.\"$CITIZEN_QID\".labels.en.value // empty")
      if [ -n "$CITIZEN_NAME" ]; then
        ESCAPED_CITIZEN=$(echo "$CITIZEN_NAME" | sed "s/'/''/g")
        UPDATES="$UPDATES, nationality = '${ESCAPED_CITIZEN}'"
      fi
    fi

    # Birth date
    BIRTH_TIME=$(echo "$ENTITY" | jq -r ".entities.\"$QID\".claims.P569[0].mainsnak.datavalue.value.time // empty")
    if [ -n "$BIRTH_TIME" ]; then
      BIRTH_DATE=$(echo "$BIRTH_TIME" | sed 's/^+//' | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
      if [ -n "$BIRTH_DATE" ] && [ "$BIRTH_DATE" != "0000-00-00" ]; then
        UPDATES="$UPDATES, birth_date = COALESCE(birth_date, '${BIRTH_DATE}'::date)"
      fi
    fi

    # Death date
    DEATH_TIME=$(echo "$ENTITY" | jq -r ".entities.\"$QID\".claims.P570[0].mainsnak.datavalue.value.time // empty")
    if [ -n "$DEATH_TIME" ]; then
      DEATH_DATE=$(echo "$DEATH_TIME" | sed 's/^+//' | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
      if [ -n "$DEATH_DATE" ] && [ "$DEATH_DATE" != "0000-00-00" ]; then
        UPDATES="$UPDATES, death_date = COALESCE(death_date, '${DEATH_DATE}'::date)"
      fi
    fi

    # Image
    IMAGE=$(echo "$ENTITY" | jq -r ".entities.\"$QID\".claims.P18[0].mainsnak.datavalue.value // empty")
    if [ -n "$IMAGE" ]; then
      ENCODED_IMG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$IMAGE'))" 2>/dev/null)
      UPDATES="$UPDATES, image_url = COALESCE(NULLIF(image_url, ''), 'https://commons.wikimedia.org/wiki/Special:FilePath/${ENCODED_IMG}')"
    fi

    npx supabase db query --linked "
      UPDATE personalities SET $UPDATES WHERE id = '${ID}';
    " 2>/dev/null > /dev/null

    TOTAL_UPDATED=$((TOTAL_UPDATED + 1))
    echo "  [$i] $NAME → $QID (${PLACE_NAME:-no place})"

    sleep 0.3
  done

  echo "Round $ROUND done. Updated: $TOTAL_UPDATED, Skipped: $TOTAL_SKIPPED"
  echo "---"
done

echo "=== Complete. Updated: $TOTAL_UPDATED, Skipped: $TOTAL_SKIPPED ==="
