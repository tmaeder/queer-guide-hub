#!/usr/bin/env bash
# One-shot deploy: install deps, set secrets, deploy both workers, configure meili,
# attach supabase webhooks, run full backfill, smoke test.
#
# Required env:
#   CF_API_TOKEN             Cloudflare API token (Workers Scripts Edit + AI Gateway + AI Read)
#   CF_ACCOUNT_ID            7aa3765cc5f50f2b681b782eb4a8d296
#   MEILISEARCH_URL          e.g. https://meili.queer.guide
#   MEILISEARCH_ADMIN_KEY    Meili admin key
#   MEILISEARCH_SEARCH_KEY   Meili search-only key (public)
#   SUPABASE_URL             https://xqeacpakadqfxjxjcewc.supabase.co
#   SUPABASE_SERVICE_KEY     service role JWT
#   SUPABASE_DB_URL          postgres://... for psql (optional)
#
# Optional:
#   INGEST_TOKEN             if unset, generated
#   ADMIN_TOKEN              if unset, generated

set -euo pipefail

for v in CF_API_TOKEN CF_ACCOUNT_ID MEILISEARCH_URL MEILISEARCH_ADMIN_KEY \
         MEILISEARCH_SEARCH_KEY SUPABASE_URL SUPABASE_SERVICE_KEY; do
	if [[ -z "${!v:-}" ]]; then
		echo "missing env: $v" >&2; exit 1
	fi
done

INGEST_TOKEN="${INGEST_TOKEN:-$(openssl rand -hex 24)}"
ADMIN_TOKEN="${ADMIN_TOKEN:-$(openssl rand -hex 24)}"
export CLOUDFLARE_API_TOKEN="$CF_API_TOKEN"
export CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT_ID"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "== 1. Create AI Gateway qg-search (idempotent) =="
curl -sS -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/ai-gateway/gateways" \
	-H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
	-d '{"id":"qg-search","cache_ttl":604800,"cache_invalidate_on_update":true,"collect_logs":true,"rate_limiting_interval":60,"rate_limiting_limit":0,"rate_limiting_technique":"sliding"}' \
	| grep -E '"(success|errors)":' || true

echo "== 2. Deploy search worker =="
cd "$ROOT/worker"
npm ci --silent
cat > .dev.vars <<EOF
MEILISEARCH_SEARCH_KEY=$MEILISEARCH_SEARCH_KEY
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY
ADMIN_TOKEN=$ADMIN_TOKEN
EOF

echo "$MEILISEARCH_SEARCH_KEY" | npx wrangler secret put MEILISEARCH_SEARCH_KEY
echo "$SUPABASE_URL"           | npx wrangler secret put SUPABASE_URL
echo "$SUPABASE_SERVICE_KEY"   | npx wrangler secret put SUPABASE_SERVICE_KEY
echo "$ADMIN_TOKEN"            | npx wrangler secret put ADMIN_TOKEN

npx wrangler deploy
SEARCH_URL=$(npx wrangler deployments list --name queer-guide-search-proxy 2>/dev/null | head -n 30 | grep -oE 'https://[a-z0-9\-]+\.workers\.dev' | head -1 || true)
SEARCH_URL="${SEARCH_URL:-https://queer-guide-search-proxy.workers.dev}"
echo "search: $SEARCH_URL"

echo "== 3. Deploy ingest worker =="
cd "$ROOT/worker-ingest"
npm ci --silent
echo "$MEILISEARCH_ADMIN_KEY" | npx wrangler secret put MEILISEARCH_ADMIN_KEY
echo "$SUPABASE_URL"          | npx wrangler secret put SUPABASE_URL
echo "$SUPABASE_SERVICE_KEY"  | npx wrangler secret put SUPABASE_SERVICE_KEY
echo "$INGEST_TOKEN"          | npx wrangler secret put INGEST_TOKEN
npx wrangler deploy
INGEST_URL=$(npx wrangler deployments list --name queer-guide-search-ingest 2>/dev/null | head -n 30 | grep -oE 'https://[a-z0-9\-]+\.workers\.dev' | head -1 || true)
INGEST_URL="${INGEST_URL:-https://queer-guide-search-ingest.workers.dev}"
echo "ingest: $INGEST_URL"

echo "== 4. Configure Meilisearch =="
MEILI_URL="$MEILISEARCH_URL" \
MEILI_ADMIN_KEY="$MEILISEARCH_ADMIN_KEY" \
CF_ACCOUNT="$CF_ACCOUNT_ID" \
CF_TOKEN="$CF_API_TOKEN" \
  bash "$ROOT/scripts/configure-meili.sh"

echo "== 5. Supabase webhooks =="
if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
	psql "$SUPABASE_DB_URL" -c "ALTER DATABASE postgres SET app.ingest_token = '$INGEST_TOKEN'"
	sed "s|queer-guide-search-ingest.workers.dev|$(echo "$INGEST_URL" | sed 's|https://||')|g" \
		"$ROOT/scripts/setup-webhooks.sql" | psql "$SUPABASE_DB_URL"
else
	echo "SUPABASE_DB_URL not set — run scripts/setup-webhooks.sql manually in the SQL editor"
	echo "Remember: ALTER DATABASE postgres SET app.ingest_token = '$INGEST_TOKEN'"
fi

echo "== 6. Backfill =="
INGEST_URL="$INGEST_URL" INGEST_TOKEN="$INGEST_TOKEN" \
  bash "$ROOT/scripts/backfill.sh"

echo "== 7. Smoke test =="
SEARCH_URL="$SEARCH_URL" bash "$ROOT/scripts/smoke.sh"

echo
echo "Done. Tokens (save these):"
echo "  INGEST_TOKEN = $INGEST_TOKEN"
echo "  ADMIN_TOKEN  = $ADMIN_TOKEN"
echo "  Search URL   = $SEARCH_URL"
echo "  Ingest URL   = $INGEST_URL"
