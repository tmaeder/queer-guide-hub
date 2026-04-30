#!/usr/bin/env bash
# POST a routine progress / fix_proposed / failed callback to the Supabase
# claude-routine-callback edge function with HMAC signing.
#
# Required env:
#   KIND          progress | fix_proposed | failed
#   RUN_ID        feedback_routine_runs.id
#   CALLBACK_URL  https://<project>.supabase.co/functions/v1/claude-routine-callback
#   HMAC_SECRET   shared secret with the edge function
# Optional env (depends on KIND):
#   STATUS        for KIND=progress (e.g. in_progress)
#   PR_URL, COMMIT_SHA, FILES_JSON, SUMMARY, CONFIDENCE, RISKS  for fix_proposed
#   REASON        for failed

set -euo pipefail

: "${KIND:?KIND required}"
: "${RUN_ID:?RUN_ID required}"
: "${CALLBACK_URL:?CALLBACK_URL required}"
: "${HMAC_SECRET:?HMAC_SECRET required}"

case "$KIND" in
  progress)
    BODY=$(jq -c -n \
      --arg run "$RUN_ID" \
      --arg status "${STATUS:-in_progress}" \
      '{run_id:$run, kind:"progress", status:$status}')
    ;;
  fix_proposed)
    BODY=$(jq -c -n \
      --arg run "$RUN_ID" \
      --arg pr "${PR_URL:-}" \
      --arg sha "${COMMIT_SHA:-}" \
      --argjson files "${FILES_JSON:-[]}" \
      --arg summary "${SUMMARY:-}" \
      --arg confidence "${CONFIDENCE:-medium}" \
      --arg risks "${RISKS:-}" \
      '{run_id:$run, kind:"fix_proposed",
        pr_url:$pr, commit_sha:$sha, files_changed:$files,
        summary:$summary, confidence:$confidence, risks:$risks}')
    ;;
  failed)
    BODY=$(jq -c -n \
      --arg run "$RUN_ID" \
      --arg reason "${REASON:-runner_reported_failure}" \
      '{run_id:$run, kind:"failed", error:$reason}')
    ;;
  *)
    echo "unknown KIND: $KIND" >&2
    exit 1
    ;;
esac

SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$HMAC_SECRET" -binary | xxd -p -c 256)"

curl -fsS -X POST "$CALLBACK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Feedback-Signature: $SIG" \
  -d "$BODY"
