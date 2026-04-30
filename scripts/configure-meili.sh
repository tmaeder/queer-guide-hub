#!/usr/bin/env bash
# Configure Meili `default` embedder to use Workers AI via REST and set
# searchable/filterable/sortable attributes per index.
#
# Synonyms are no longer applied here — the search-proxy worker (PR #175)
# loads `search_synonyms` from Postgres on a 5-minute KV cache and merges
# them with the LLM-rewrite synonyms before sending the query to Meili.
# Postgres is the source of truth. To clear the legacy static synonyms
# from the live `venues` index, run once:
#   curl -X PATCH "$MEILI_URL/indexes/venues/settings/synonyms" \
#        -H "Authorization: Bearer $MEILI_ADMIN_KEY" \
#        -H "Content-Type: application/json" -d '{}'
#
# Usage: MEILI_URL=https://meili.queer.guide MEILI_ADMIN_KEY=xxx \
#        CF_ACCOUNT=xxx CF_TOKEN=xxx bash scripts/configure-meili.sh

set -euo pipefail

: "${MEILI_URL:?}"
: "${MEILI_ADMIN_KEY:?}"
: "${CF_ACCOUNT:?}"
: "${CF_TOKEN:?}"
: "${CF_AI_GATEWAY:=qg-search}"

# Shared settings for venues/events — adapt per-index if needed.
ai_gw="https://gateway.ai.cloudflare.com/v1/${CF_ACCOUNT}/${CF_AI_GATEWAY}/workers-ai/@cf/baai/bge-base-en-v1.5"

apply() {
	local index=$1 filterable=$2 sortable=$3 searchable=$4 distinct=${5:-}
	echo "== $index =="

	curl -sS -X PATCH "$MEILI_URL/indexes/$index/settings/embedders" \
		-H "Authorization: Bearer $MEILI_ADMIN_KEY" \
		-H "Content-Type: application/json" \
		-d "{
		  \"default\": {
		    \"source\": \"rest\",
		    \"url\": \"$ai_gw\",
		    \"apiKey\": \"$CF_TOKEN\",
		    \"dimensions\": 768,
		    \"request\": { \"text\": [\"{{text}}\"] },
		    \"response\": { \"data\": [[\"{{embedding}}\"]] },
		    \"documentTemplate\": \"{{doc.title}}. {{doc.description}}. {{doc.tags}}. {{doc.city}} {{doc.country}}\"
		  }
		}" >/dev/null

	curl -sS -X PATCH "$MEILI_URL/indexes/$index/settings/filterableAttributes" \
		-H "Authorization: Bearer $MEILI_ADMIN_KEY" \
		-H "Content-Type: application/json" \
		-d "$filterable" >/dev/null

	curl -sS -X PATCH "$MEILI_URL/indexes/$index/settings/sortableAttributes" \
		-H "Authorization: Bearer $MEILI_ADMIN_KEY" \
		-H "Content-Type: application/json" \
		-d "$sortable" >/dev/null

	curl -sS -X PATCH "$MEILI_URL/indexes/$index/settings/searchableAttributes" \
		-H "Authorization: Bearer $MEILI_ADMIN_KEY" \
		-H "Content-Type: application/json" \
		-d "$searchable" >/dev/null

	if [ -n "$distinct" ]; then
		curl -sS -X PATCH "$MEILI_URL/indexes/$index/settings/distinct-attribute" \
			-H "Authorization: Bearer $MEILI_ADMIN_KEY" \
			-H "Content-Type: application/json" \
			-d "$distinct" >/dev/null
	fi
}

# `cluster_ids` is filterable on every index — PR #174 emits the field on every
# Meili doc; storefront uses it for cluster-scoped browse pages.
# `master_event_id` is the events-only distinctAttribute (PR #181) — collapses
# the per-occurrence docs back to one row per series in storefront list views.

apply venues \
	'["type","city","country","category","featured","tags","cluster_ids","_geo"]' \
	'["featured","_geo","updated_at"]' \
	'["title","description","tags","city","country","category"]'

apply events \
	'["type","city","country","event_type","featured","tags","start_date","end_date","cluster_ids","master_event_id","_geo"]' \
	'["start_date","featured","_geo"]' \
	'["title","description","tags","city","country","event_type","venue_name"]' \
	'"master_event_id"'

apply cities '["type","country","cluster_ids"]' '[]' '["title","description","country"]'
apply countries '["type","continent","cluster_ids"]' '[]' '["title","description","continent"]'
apply personalities '["type","profession","nationality","cluster_ids"]' '[]' '["title","name","description","profession","nationality"]'
apply news '["type","category","is_featured","cluster_ids"]' '["is_featured","updated_at"]' '["title","description","category"]'
apply marketplace '["type","category","featured","cluster_ids"]' '["featured"]' '["title","description","category"]'
apply tags '["type","category","cluster_ids"]' '[]' '["title","description","category"]'
apply queer_villages '["type","city","country","featured","cluster_ids"]' '["featured"]' '["title","description","city","country"]'

echo "Meili configured."
