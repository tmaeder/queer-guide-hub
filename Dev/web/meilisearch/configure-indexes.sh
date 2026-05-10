#!/usr/bin/env bash
# Configure Meilisearch indexes with searchable, filterable, sortable attributes and ranking rules.
# Usage: MEILI_URL=https://search.queer.guide MEILI_MASTER_KEY=xxx ./configure-indexes.sh

set -euo pipefail

MEILI_URL="${MEILI_URL:?Set MEILI_URL}"
MEILI_MASTER_KEY="${MEILI_MASTER_KEY:?Set MEILI_MASTER_KEY}"

meili() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -s -X "$method" "${MEILI_URL}${path}" \
      -H "Authorization: Bearer ${MEILI_MASTER_KEY}" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -s -X "$method" "${MEILI_URL}${path}" \
      -H "Authorization: Bearer ${MEILI_MASTER_KEY}"
  fi
  echo
}

echo "=== Creating indexes ==="
for idx in venues events cities countries news marketplace personalities tags queer_villages; do
  meili POST "/indexes" "{\"uid\":\"${idx}\",\"primaryKey\":\"id\"}"
done

echo "=== Configuring venues ==="
meili PUT "/indexes/venues/settings" '{
  "searchableAttributes": ["title", "description", "address", "city", "country", "tags", "category"],
  "filterableAttributes": ["city", "country", "category", "featured", "tags", "target_groups", "type", "_geo"],
  "sortableAttributes": ["title", "_geo"],
  "displayedAttributes": ["*"],
  "typoTolerance": {"enabled": true, "minWordSizeForTypos": {"oneTypo": 4, "twoTypos": 8}}
}'

echo "=== Configuring events ==="
meili PUT "/indexes/events/settings" '{
  "searchableAttributes": ["title", "description", "venue_name", "city", "country", "event_type"],
  "filterableAttributes": ["city", "country", "event_type", "featured", "is_free", "start_date", "target_groups", "type", "_geo"],
  "sortableAttributes": ["start_date", "title", "_geo"],
  "displayedAttributes": ["*"]
}'

echo "=== Configuring cities ==="
meili PUT "/indexes/cities/settings" '{
  "searchableAttributes": ["title", "description", "country"],
  "filterableAttributes": ["country", "country_code", "type", "_geo"],
  "sortableAttributes": ["title", "population", "_geo"],
  "displayedAttributes": ["*"]
}'

echo "=== Configuring countries ==="
meili PUT "/indexes/countries/settings" '{
  "searchableAttributes": ["title", "description", "code", "continent"],
  "filterableAttributes": ["continent", "type", "_geo"],
  "sortableAttributes": ["title", "_geo"],
  "displayedAttributes": ["*"]
}'

echo "=== Configuring news ==="
meili PUT "/indexes/news/settings" '{
  "searchableAttributes": ["title", "description", "category"],
  "filterableAttributes": ["category", "is_featured", "published_at", "type"],
  "sortableAttributes": ["published_at", "title"],
  "displayedAttributes": ["*"]
}'

echo "=== Configuring marketplace ==="
meili PUT "/indexes/marketplace/settings" '{
  "searchableAttributes": ["title", "description", "category"],
  "filterableAttributes": ["category", "featured", "price", "type"],
  "sortableAttributes": ["price", "title"],
  "displayedAttributes": ["*"]
}'

echo "=== Configuring personalities ==="
meili PUT "/indexes/personalities/settings" '{
  "searchableAttributes": ["title", "description", "profession", "lgbti_connection", "nationality"],
  "filterableAttributes": ["profession", "nationality", "is_featured", "type"],
  "sortableAttributes": ["title"],
  "displayedAttributes": ["*"]
}'

echo "=== Configuring tags ==="
meili PUT "/indexes/tags/settings" '{
  "searchableAttributes": ["title", "description", "category"],
  "filterableAttributes": ["category", "type"],
  "sortableAttributes": ["title"],
  "displayedAttributes": ["*"]
}'

echo "=== Configuring queer_villages ==="
meili PUT "/indexes/queer_villages/settings" '{
  "searchableAttributes": ["title", "description", "city", "country"],
  "filterableAttributes": ["city", "country", "featured", "type", "_geo"],
  "sortableAttributes": ["title", "_geo"],
  "displayedAttributes": ["*"]
}'

echo "=== Creating search-only API key ==="
meili POST "/keys" '{
  "description": "Search-only key for CF Worker",
  "actions": ["search"],
  "indexes": ["*"],
  "expiresAt": null
}'

echo "=== Done ==="
