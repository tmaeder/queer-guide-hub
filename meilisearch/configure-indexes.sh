#!/usr/bin/env bash
# Configure Meilisearch indexes with searchable, filterable, sortable attributes and ranking rules.
# Usage: MEILI_URL=https://search.queer.guide MEILI_MASTER_KEY=xxx ./configure-indexes.sh

set -euo pipefail

MEILI_URL="${MEILI_URL:?Set MEILI_URL}"
MEILI_MASTER_KEY="${MEILI_MASTER_KEY:?Set MEILI_MASTER_KEY}"

meili() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -s ${MEILI_CURL_OPTS:-} -X "$method" "${MEILI_URL}${path}" \
      -H "Authorization: Bearer ${MEILI_MASTER_KEY}" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -s ${MEILI_CURL_OPTS:-} -X "$method" "${MEILI_URL}${path}" \
      -H "Authorization: Bearer ${MEILI_MASTER_KEY}"
  fi
  echo
}

echo "=== Creating indexes ==="
for idx in venues events cities countries news marketplace personalities tags queer_villages hotels festivals; do
  meili POST "/indexes" "{\"uid\":\"${idx}\",\"primaryKey\":\"id\"}"
done

echo "=== Configuring venues ==="
# stopWords: bug #9. The corpus is overwhelmingly LGBTQ+ so these tokens are
# in most documents and contribute zero ranking signal — they just slow the
# query and drag in irrelevant matches. Bare-token queries ('gay', 'queer',
# 'trans') still work because the worker routes them to a "browse all" path.
meili PUT "/indexes/venues/settings" '{
  "searchableAttributes": ["title", "description", "address", "city", "country", "tags", "category"],
  "filterableAttributes": ["city", "city_id", "country", "category", "featured", "tags", "cluster_ids", "target_groups", "type", "_geo"],
  "sortableAttributes": ["title", "_geo"],
  "displayedAttributes": ["*"],
  "stopWords": ["gay", "queer", "trans", "lgbt", "lgbtq", "lgbtq+", "lgbti"],
  "typoTolerance": {"enabled": true, "minWordSizeForTypos": {"oneTypo": 8, "twoTypos": 12}}
}'

echo "=== Configuring events ==="
# start_date:asc as final ranking rule so upcoming events rank before distant
# future ones when text relevance is equal.
meili PUT "/indexes/events/settings" '{
  "searchableAttributes": ["title", "description", "venue_name", "city", "country", "event_type"],
  "filterableAttributes": ["city", "city_id", "country", "event_type", "featured", "is_free", "start_date", "cluster_ids", "target_groups", "type", "_geo"],
  "sortableAttributes": ["start_date", "title", "_geo"],
  "displayedAttributes": ["*"],
  "rankingRules": ["words", "typo", "exactness", "proximity", "attribute", "sort", "start_date:asc"],
  "stopWords": ["gay", "queer", "trans", "lgbt", "lgbtq", "lgbtq+", "lgbti"],
  "typoTolerance": {"enabled": true, "minWordSizeForTypos": {"oneTypo": 8, "twoTypos": 12}}
}'

echo "=== Configuring cities ==="
# Bug #4. Exact name match must dominate so "berlin" returns Berlin, not
# Leipzig. Two changes:
#   1. Move `exactness` ahead of `proximity`/`attribute` in rankingRules.
#   2. Tighten typoTolerance so 6-char tokens like "berlin" do not fuzz-match
#      to "leipzig" (oneTypo at 8, twoTypos at 12).
# `aliases` is added as a searchable attribute so multilingual city names
# match their English forms (bug #10): the seed-city-aliases.sh script
# populates it with English/native pairs (München <-> munich, 東京 <-> tokyo).
# `population` is sortable and used as the final ranking rule so identical
# name matches break ties by city size (Berlin DE > Berlin OH).
meili PUT "/indexes/cities/settings" '{
  "searchableAttributes": ["title", "aliases", "country"],
  "filterableAttributes": ["country", "country_code", "type", "_geo"],
  "sortableAttributes": ["title", "population", "_geo"],
  "displayedAttributes": ["*"],
  "rankingRules": ["words", "typo", "exactness", "attribute", "proximity", "sort", "population:desc"],
  "typoTolerance": {"enabled": true, "minWordSizeForTypos": {"oneTypo": 8, "twoTypos": 12}}
}'

echo "=== Configuring countries ==="
meili PUT "/indexes/countries/settings" '{
  "searchableAttributes": ["title", "description", "code", "continent"],
  "filterableAttributes": ["continent", "type", "_geo"],
  "sortableAttributes": ["title", "_geo"],
  "displayedAttributes": ["*"]
}'

echo "=== Configuring news ==="
# Recency matters for news — published_at:desc as final ranking rule so newer
# articles win ties. Stop words same rationale as venues/events.
meili PUT "/indexes/news/settings" '{
  "searchableAttributes": ["title", "description", "category"],
  "filterableAttributes": ["category", "is_featured", "published_at", "type"],
  "sortableAttributes": ["published_at", "title"],
  "displayedAttributes": ["*"],
  "rankingRules": ["words", "typo", "exactness", "proximity", "attribute", "sort", "published_at:desc"],
  "stopWords": ["gay", "queer", "trans", "lgbt", "lgbtq", "lgbtq+", "lgbti"],
  "typoTolerance": {"enabled": true, "minWordSizeForTypos": {"oneTypo": 8, "twoTypos": 12}}
}'

echo "=== Configuring marketplace ==="
meili PUT "/indexes/marketplace/settings" '{
  "searchableAttributes": ["title", "description", "category"],
  "filterableAttributes": ["category", "featured", "price", "type"],
  "sortableAttributes": ["price", "title"],
  "displayedAttributes": ["*"],
  "stopWords": ["gay", "queer", "trans", "lgbt", "lgbtq", "lgbtq+", "lgbti"],
  "typoTolerance": {"enabled": true, "minWordSizeForTypos": {"oneTypo": 8, "twoTypos": 12}}
}'

echo "=== Configuring personalities ==="
meili PUT "/indexes/personalities/settings" '{
  "searchableAttributes": ["title", "description", "profession", "lgbti_connection", "nationality"],
  "filterableAttributes": ["profession", "nationality", "is_featured", "type"],
  "sortableAttributes": ["title"],
  "displayedAttributes": ["*"],
  "stopWords": ["gay", "queer", "trans", "lgbt", "lgbtq", "lgbtq+", "lgbti"],
  "typoTolerance": {"enabled": true, "minWordSizeForTypos": {"oneTypo": 8, "twoTypos": 12}}
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

echo "=== Configuring hotels ==="
meili PUT "/indexes/hotels/settings" '{
  "searchableAttributes": ["title", "description", "address", "city", "country", "hotel_type", "tags"],
  "filterableAttributes": ["city", "city_id", "country", "hotel_type", "featured", "lgbtq_friendly", "price_range", "tags", "type", "_geo"],
  "sortableAttributes": ["title", "star_rating", "price_range", "_geo"],
  "displayedAttributes": ["*"],
  "stopWords": ["gay", "queer", "trans", "lgbt", "lgbtq", "lgbtq+", "lgbti"],
  "typoTolerance": {"enabled": true, "minWordSizeForTypos": {"oneTypo": 8, "twoTypos": 12}}
}'

echo "=== Configuring festivals ==="
# start_date:asc as final ranking rule so upcoming festivals rank before
# distant future ones — same rationale as events.
meili PUT "/indexes/festivals/settings" '{
  "searchableAttributes": ["title", "description", "city", "country", "festival_type"],
  "filterableAttributes": ["city", "city_id", "country", "festival_type", "featured", "start_date", "tags", "type", "_geo"],
  "sortableAttributes": ["start_date", "title", "_geo"],
  "displayedAttributes": ["*"],
  "rankingRules": ["words", "typo", "exactness", "proximity", "attribute", "sort", "start_date:asc"],
  "stopWords": ["gay", "queer", "trans", "lgbt", "lgbtq", "lgbtq+", "lgbti"],
  "typoTolerance": {"enabled": true, "minWordSizeForTypos": {"oneTypo": 8, "twoTypos": 12}}
}'

echo "=== Creating search-only API key ==="
meili POST "/keys" '{
  "description": "Search-only key for CF Worker",
  "actions": ["search"],
  "indexes": ["*"],
  "expiresAt": null
}'

echo "=== Done ==="
