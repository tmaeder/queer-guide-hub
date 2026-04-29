#!/usr/bin/env bash
# configure-search-intelligence.sh
#
# One-shot orchestrator for putting the Search Intelligence system live.
# Wraps the operator steps documented in the session-end guide so you don't
# need to remember the right commands in the right order.
#
# Usage:
#   scripts/configure-search-intelligence.sh [--check|--deploy|--smoke|--all]
#
# Modes:
#   --check    Verify required env vars + CLIs are present, no side effects.
#   --deploy   Run --check, then deploy edge functions and the search-proxy
#              worker.
#   --smoke    Run --check, then probe each public health endpoint.
#   --all      --check + --deploy + --smoke. Default if no mode given.
#
# Environment variables expected for --deploy:
#   SUPABASE_ACCESS_TOKEN     Supabase CLI auth (https://supabase.com/dashboard/account/tokens)
#   SUPABASE_PROJECT_REF      Defaults to xqeacpakadqfxjxjcewc
#   CLOUDFLARE_API_TOKEN      Cloudflare API token with Workers Edit
#   (or be logged in to wrangler interactively)
#
# This script makes no DB writes and does not set GUCs / env vars on the
# functions — those need a human at the Supabase + Vercel dashboards.
# See docs/search-intelligence/00-operator-checklist.md.

set -euo pipefail

# ── Constants ────────────────────────────────────────────────────────────────
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-xqeacpakadqfxjxjcewc}"
SUPABASE_BASE_URL="https://${SUPABASE_PROJECT_REF}.supabase.co"
SEARCH_PROXY_URL="${SEARCH_PROXY_URL:-https://queer-guide-search-proxy.maeder-tobiassimon.workers.dev}"

# Edge functions touched by the Search Intelligence rollup.
SI_FUNCTIONS=(
  search-intelligence
  meilisearch-sync
  translate-i18n-batch
  fetch-venue-images
  fetch-event-images
  fetch-personality-images
  fetch-village-images
)

# ── Helpers ──────────────────────────────────────────────────────────────────
RED=$'\033[31m'
GRN=$'\033[32m'
YLW=$'\033[33m'
DIM=$'\033[2m'
RST=$'\033[0m'

step() { printf '%s▶%s %s\n' "$GRN" "$RST" "$*"; }
warn() { printf '%s!%s %s\n' "$YLW" "$RST" "$*" >&2; }
fail() { printf '%s✗%s %s\n' "$RED" "$RST" "$*" >&2; exit 1; }
ok()   { printf '  %s✓%s %s\n' "$GRN" "$RST" "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

# ── Modes ────────────────────────────────────────────────────────────────────
check() {
  step 'Checking prerequisites'
  have supabase || fail 'supabase CLI not found. Install: https://supabase.com/docs/guides/cli'
  ok "supabase CLI: $(supabase --version 2>&1 | head -1)"

  have wrangler || warn 'wrangler not found — search-proxy deploy will be skipped'
  if have wrangler; then ok "wrangler: $(wrangler --version 2>&1 | head -1)"; fi

  have curl || fail 'curl not found'
  have jq   || warn 'jq not found — smoke tests will skip pretty output'

  if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
    warn 'SUPABASE_ACCESS_TOKEN not set — `supabase functions deploy` will fail unless you `supabase login` first'
  else
    ok 'SUPABASE_ACCESS_TOKEN present'
  fi

  ok "SUPABASE_PROJECT_REF=${SUPABASE_PROJECT_REF}"
  ok "SUPABASE_BASE_URL=${SUPABASE_BASE_URL}"
}

deploy_functions() {
  step 'Deploying edge functions'
  for fn in "${SI_FUNCTIONS[@]}"; do
    if [[ ! -d "supabase/functions/${fn}" ]]; then
      warn "supabase/functions/${fn} not found — skipping"
      continue
    fi
    printf '%s  ↳ deploying %s%s ' "$DIM" "$fn" "$RST"
    if supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF" >/tmp/sf-deploy.log 2>&1; then
      printf '%s✓%s\n' "$GRN" "$RST"
    else
      printf '%s✗%s\n' "$RED" "$RST"
      tail -20 /tmp/sf-deploy.log >&2
      fail "supabase functions deploy ${fn} failed"
    fi
  done
}

deploy_worker() {
  if ! have wrangler; then
    warn 'Skipping search-proxy deploy (wrangler not installed)'
    return
  fi
  step 'Deploying search-proxy worker'
  if [[ ! -d 'workers/search-proxy' ]]; then
    warn 'workers/search-proxy not found — skipping'
    return
  fi
  ( cd workers/search-proxy && wrangler deploy ) || fail 'wrangler deploy failed'
}

smoke() {
  step 'Smoke-testing public endpoints'

  # search-intelligence health (no auth required)
  local si_health
  si_health=$(curl -fsS "${SUPABASE_BASE_URL}/functions/v1/search-intelligence/health" 2>/dev/null || true)
  if [[ -n "$si_health" ]] && echo "$si_health" | grep -q '"ok":true'; then
    if echo "$si_health" | grep -q '"meili_configured":true'; then
      ok "search-intelligence/health → ok, meili configured"
    else
      warn "search-intelligence/health → ok BUT meili_configured=false (set MEILISEARCH_URL + MEILISEARCH_ADMIN_KEY env vars)"
    fi
  else
    warn "search-intelligence/health failed: ${si_health:-no response}"
  fi

  # search-proxy /health
  local sp_health
  sp_health=$(curl -fsS "${SEARCH_PROXY_URL}/health" 2>/dev/null || true)
  if [[ -n "$sp_health" ]] && echo "$sp_health" | grep -q '"ok":true'; then
    ok "search-proxy/health → ok"
  else
    warn "search-proxy/health failed: ${sp_health:-no response}"
  fi

  # /cron/reconcile reachable (expect 401 if secret not yet set, 200 if set)
  local rc_status
  rc_status=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST "${SUPABASE_BASE_URL}/functions/v1/search-intelligence/cron/reconcile" \
    -H 'X-Webhook-Secret: probe' || true)
  case "$rc_status" in
    200) ok "/cron/reconcile responded 200 (your X-Webhook-Secret matched — verify intentional)" ;;
    401) ok "/cron/reconcile responded 401 (expected; set app.search_intelligence_webhook_secret + env var to enable)" ;;
    404) warn "/cron/reconcile 404 — function not deployed yet" ;;
    *)   warn "/cron/reconcile unexpected status: ${rc_status}" ;;
  esac
}

print_followups() {
  cat <<EOF

${GRN}Done.${RST} Manual follow-ups (require credentials I can't reach):

  1. ${YLW}Set webhook secrets${RST} in Supabase SQL editor:
       ALTER DATABASE postgres SET app.search_intelligence_webhook_secret = '<secret-1>';
       ALTER DATABASE postgres SET app.translate_i18n_webhook_secret      = '<secret-2>';
     And matching env vars on the deployed functions.

  2. ${YLW}Set Vercel feature flag${RST}:
       VITE_FEATURE_SEARCH_INTELLIGENCE = 1
     Then redeploy the frontend.

  3. ${YLW}Anchor settings versions${RST}: open /admin/search-intelligence,
     for each index click "Snapshot live → desired" so the reconcile
     cron has v1 to compare against.

  4. ${YLW}Reindex events${RST} (one-time, after step 3):
     - Reindex tab → events → Reindex (sync)
     - Settings tab → events → add 'master_event_id' to filterableAttributes
       AND set as distinctAttribute → Apply.

  5. Watch for ~1 week:
       SELECT * FROM search_audit_log WHERE action LIKE 'drift.%' ORDER BY created_at DESC LIMIT 20;

EOF
}

# ── Entrypoint ───────────────────────────────────────────────────────────────
mode="${1:---all}"
case "$mode" in
  --check)  check ;;
  --deploy) check; deploy_functions; deploy_worker ;;
  --smoke)  check; smoke ;;
  --all)    check; deploy_functions; deploy_worker; smoke; print_followups ;;
  -h|--help)
    sed -n '2,30p' "$0"
    exit 0
    ;;
  *) fail "unknown mode: $mode (--check|--deploy|--smoke|--all)" ;;
esac
