#!/usr/bin/env bash
# Generic supervisor for long, resumable backfill jobs. Restarts the command
# indefinitely with exponential backoff (capped) until it exits cleanly. No retry
# cap — a ~2h DNS outage once killed a 50-retry-capped supervisor; resumable jobs
# (cursor file) make unbounded restarts safe.
#
# Exit-code contract with the supervised job:
#   0  → done (corpus exhausted)        → stop, success
#   42 → halted at a guard (e.g. disk)  → stop, do NOT restart (operator must act)
#   *  → crash / transient              → back off and restart (job resumes via cursor)
#
# Usage: scripts/run-supervised.sh <logfile> <cmd> [args...]
#   GEOCODE_TOKEN=sbp_... nohup scripts/run-supervised.sh \
#     scripts/output/news-fulltext.log node scripts/backfill-news-fulltext.mjs &

set -u
LOG="${1:?logfile required}"; shift
mkdir -p "$(dirname "$LOG")"

backoff=5
max_backoff=600
attempt=0

log() { echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] [supervisor] $*" | tee -a "$LOG"; }

log "starting: $* (log: $LOG)"
while true; do
  attempt=$((attempt + 1))
  log "attempt #$attempt"
  "$@" >>"$LOG" 2>&1
  code=$?
  if [ "$code" -eq 0 ]; then
    log "job exited 0 — DONE after $attempt attempt(s)."
    exit 0
  elif [ "$code" -eq 42 ]; then
    log "job exited 42 — guard halt (disk). NOT restarting. Operator action required."
    exit 42
  fi
  log "job exited $code — restarting in ${backoff}s."
  sleep "$backoff"
  backoff=$((backoff * 2))
  [ "$backoff" -gt "$max_backoff" ] && backoff=$max_backoff
done
