#!/usr/bin/env bash
# Backfill all indexed tables through the ingest worker.
# Usage:  INGEST_URL=https://ingest.workers.dev INGEST_TOKEN=xxx bash scripts/backfill.sh [table]

set -euo pipefail

: "${INGEST_URL:?set INGEST_URL}"
: "${INGEST_TOKEN:?set INGEST_TOKEN}"

TABLES=(venues events cities countries personalities news_articles marketplace_listings queer_villages unified_tags)
if [[ $# -gt 0 ]]; then TABLES=("$@"); fi

for t in "${TABLES[@]}"; do
	echo "=== Backfill $t ==="
	done="false"
	# Reset cursor for full rebuild. Comment this line to resume.
	curl -sS -X POST "$INGEST_URL/backfill" \
		-H "X-QG-Token: $INGEST_TOKEN" \
		-H "Content-Type: application/json" \
		-d "{\"table\":\"$t\",\"batchSize\":100,\"reset\":true}" >/dev/null

	while [[ "$done" != "true" ]]; do
		resp=$(curl -sS -X POST "$INGEST_URL/backfill" \
			-H "X-QG-Token: $INGEST_TOKEN" \
			-H "Content-Type: application/json" \
			-d "{\"table\":\"$t\",\"batchSize\":100}")
		processed=$(echo "$resp" | grep -oE '"processed":[0-9]+' | cut -d: -f2)
		done=$(echo "$resp" | grep -oE '"done":(true|false)' | cut -d: -f2)
		echo "  +$processed rows   (done=$done)"
		[[ "$done" == "true" ]] && break
		sleep 0.2
	done
done

echo "All backfill complete."
