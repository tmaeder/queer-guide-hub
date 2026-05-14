#!/usr/bin/env bash
# POST a retest result to the Supabase feedback-retest-callback edge function
# with HMAC signing.
#
# Required env:
#   KIND_EVENT     running | passed | failed | error
#   RETEST_KIND    typecheck | lint | unit | e2e | targeted
#   RETEST_ID      feedback_retest_runs.id
#   CALLBACK_URL   https://<project>.supabase.co/functions/v1/feedback-retest-callback
#   HMAC_SECRET    shared secret
# Optional env:
#   EXIT_CODE      numeric exit code from the test runner
#   LOG_EXCERPT    JSON-encoded string (i.e. produced via `... | jq -R . | jq -s -c 'join("\n")'`)

set -euo pipefail

: "${KIND_EVENT:?KIND_EVENT required}"
: "${RETEST_KIND:?RETEST_KIND required}"
: "${RETEST_ID:?RETEST_ID required}"
: "${CALLBACK_URL:?CALLBACK_URL required}"
: "${HMAC_SECRET:?HMAC_SECRET required}"

LOG_EXCERPT_JSON="${LOG_EXCERPT:-\"\"}"
EXIT_CODE_NUM="${EXIT_CODE:-0}"

BODY=$(jq -c -n \
  --arg id "$RETEST_ID" \
  --arg status "$KIND_EVENT" \
  --arg kind "$RETEST_KIND" \
  --argjson rc "$EXIT_CODE_NUM" \
  --argjson log "$LOG_EXCERPT_JSON" \
  '{retest_id:$id, status:$status,
    result:{kind:$kind, exit_code:$rc, log_excerpt:$log}}')

SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$HMAC_SECRET" -binary | xxd -p -c 256)"

curl -fsS -X POST "$CALLBACK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Feedback-Signature: $SIG" \
  -d "$BODY"
