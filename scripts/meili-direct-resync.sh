#!/usr/bin/env bash
# Re-push all rows from a Postgres table to a Meilisearch index, batched.
# Bypasses the supabase-edge function path so we can keep working when the
# Supabase API gateway is degraded.
#
# Usage: bash scripts/meili-direct-resync.sh venues|events
# Env:   DB_URL, MEILI_URL, MEILI_KEY (master key)

set -euo pipefail
type="${1:?venues or events}"
: "${DB_URL:?}" "${MEILI_URL:?}" "${MEILI_KEY:?}"

case "$type" in
  venues)
    select="json_build_object(
      'id', id,
      'title', name,
      'description', description,
      'type', 'venue',
      'category', category,
      'address', address,
      'city', city,
      'city_id', city_id,
      'country', country,
      'tags', COALESCE(tags, '{}'::text[]),
      'target_groups', COALESCE(target_groups, '{}'::text[]),
      'services', COALESCE(services, '{}'::text[]),
      'accessibility', COALESCE(accessibility_attributes, '{}'::text[]),
      'featured', COALESCE(is_featured, false),
      'slug', slug,
      'image_url', CASE
        WHEN images IS NULL OR jsonb_typeof(to_jsonb(images))='null' THEN NULL
        WHEN jsonb_typeof(to_jsonb(images))='array' THEN to_jsonb(images)->>0
        ELSE images::text
      END,
      '_geo', CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL
        THEN json_build_object('lat', latitude::float, 'lng', longitude::float)
        ELSE NULL END
    )"
    where="WHERE COALESCE(data_source, '') <> 'refuge_restrooms'"
    ;;
  events)
    select="json_build_object(
      'id', id,
      'title', title,
      'description', description,
      'type', 'event',
      'event_type', event_type,
      'venue_name', venue_name,
      'address', address,
      'city', city,
      'city_id', city_id,
      'country', country,
      'start_date', start_date,
      'end_date', end_date,
      'is_free', is_free,
      'price_min', price_min,
      'price_max', price_max,
      'featured', COALESCE(is_featured, false),
      'target_groups', COALESCE(target_groups, '{}'::text[]),
      'accessibility', COALESCE(accessibility_attributes, '{}'::text[]),
      'slug', slug,
      'logo_url', logo_url,
      '_geo', CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL
        THEN json_build_object('lat', latitude::float, 'lng', longitude::float)
        ELSE NULL END
    )"
    where=""
    ;;
  *) echo "unknown type: $type" >&2; exit 1 ;;
esac

batch=500
offset=0
total_pushed=0
while :; do
  payload=$(mktemp)
  psql "$DB_URL" -v ON_ERROR_STOP=1 -At -c \
    "SELECT json_agg(d) FROM (SELECT $select AS d FROM $type $where ORDER BY id LIMIT $batch OFFSET $offset) s;" > "$payload"
  count=$(jq 'length // 0' "$payload" 2>/dev/null || echo 0)
  if [ "$count" -eq 0 ]; then
    rm -f "$payload"
    break
  fi
  status=$(curl -s -o /tmp/meili_resp -w '%{http_code}' -X PUT \
    "$MEILI_URL/indexes/$type/documents" \
    -H "Authorization: Bearer $MEILI_KEY" \
    -H 'Content-Type: application/json' \
    --data-binary "@$payload")
  rm -f "$payload"
  if [ "$status" != "202" ]; then
    echo "FAIL $type @offset=$offset status=$status"
    head -c 400 /tmp/meili_resp; echo
    exit 1
  fi
  total_pushed=$((total_pushed + count))
  echo "$type @offset=$offset pushed=$count total=$total_pushed"
  offset=$((offset + batch))
  [ "$count" -lt "$batch" ] && break
done
echo "DONE $type total=$total_pushed"
