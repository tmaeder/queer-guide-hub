#!/usr/bin/env bash
#
# Watch one PR until it reaches a terminal state. One stdout line per event,
# for piping into a Monitor-style notifier.
#
# Usage: scripts/watch-pr.sh <pr-number> [poll-seconds]
#
# ── Why this exists ────────────────────────────────────────────────────────
# The inline loop this replaces ended `gh pr view … || echo '{}'`, so a FAILED
# PROBE produced an empty object, matched none of the break conditions, and
# looped silently to its 60-minute timeout. Measured on PR #4115 on
# 2026-10-04: the watch reported "[Monitor timed out]" while the PR had
# actually MERGED half an hour earlier.
#
# That is the failure class worth naming: **a failed probe was indistinguishable
# from "nothing terminal happened"**. Both produced silence, and silence is
# what the caller reads as "still waiting". `gh pr view --json` goes through
# GraphQL with its own rate limit separate from REST, so a probe genuinely does
# fail under load — this is not a hypothetical.
#
# So: every probe failure EMITS. A transient one emits once and keeps trying
# (emitting per tick would be a firehose that gets the monitor auto-stopped);
# MAX_FAILS consecutive failures emit and EXIT NON-ZERO, because at that point
# the watch cannot see the PR at all and must say so rather than keep producing
# reassuring silence.
#
# Checks are reported for fail/cancel only. A pass-by-pass narration of ~35
# required checks is noise, and the caller already learns the outcome from the
# terminal line.
#
# ── Two probe guards, and keep both ────────────────────────────────────────
# A non-zero `gh` exit and a zero-exit body with no `.state` are checked
# SEPARATELY, because a rate-limit or error payload can arrive on stdout with
# status 0. Measured by mutation: killing either one alone leaves the negative
# control still failing loudly (the sibling catches it), so neither looks
# load-bearing on its own — but killing BOTH restores the original silence
# exactly, `exit 124` with zero output. Do not drop one as redundant.

set -uo pipefail

PR="${1:?usage: watch-pr.sh <pr-number> [poll-seconds]}"
POLL="${2:-60}"

# Consecutive failed probes before giving up. 3 at the default 60s poll rides
# out a rate-limit window or a brief API blip without going blind for long.
MAX_FAILS=3

fails=0
warned=0
prev=""

while true; do
  # ── Probe 1: merge/auto-merge state. The load-bearing one.
  if ! st=$(gh pr view "$PR" --json state,mergeStateStatus,autoMergeRequest 2>&1); then
    fails=$((fails + 1))
    if [ "$fails" -ge "$MAX_FAILS" ]; then
      echo "PROBE FAILED ${fails}x — cannot read PR ${PR}, giving up (last: $(printf '%s' "$st" | tr '\n' ' ' | cut -c1-160))"
      exit 1
    fi
    [ "$warned" -eq 0 ] && echo "PROBE FAILED (${fails}/${MAX_FAILS}) on PR ${PR}, retrying — not a merge state, the watch is blind" && warned=1
    sleep "$POLL"
    continue
  fi

  # Valid JSON is a separate question from a zero exit: a rate-limit body can
  # arrive on stdout with status 0. `.state` must be present and non-empty, or
  # this is not an answer about the PR.
  if ! state=$(printf '%s' "$st" | jq -re '.state // empty' 2>/dev/null); then
    fails=$((fails + 1))
    if [ "$fails" -ge "$MAX_FAILS" ]; then
      echo "PROBE UNPARSEABLE ${fails}x — PR ${PR} returned no .state, giving up"
      exit 1
    fi
    [ "$warned" -eq 0 ] && echo "PROBE UNPARSEABLE (${fails}/${MAX_FAILS}) on PR ${PR} — the watch is blind" && warned=1
    sleep "$POLL"
    continue
  fi

  # A probe answered. Reset so a later blip gets its own warning.
  if [ "$fails" -ne 0 ]; then
    echo "PROBE RECOVERED on PR ${PR} after ${fails} failure(s)"
    fails=0
    warned=0
  fi

  # ── Probe 2: failing checks. Advisory, so a failure here only warns —
  # losing it must not stop the terminal-state watch above.
  if cs=$(gh pr checks "$PR" --json name,bucket 2>/dev/null); then
    cur=$(printf '%s' "$cs" |
      jq -r '.[] | select(.bucket=="fail" or .bucket=="cancel") | "\(.bucket | ascii_upcase): \(.name)"' 2>/dev/null |
      sort)
    # Only newly-failing checks, so a standing failure is not re-announced.
    comm -13 <(printf '%s\n' "$prev") <(printf '%s\n' "$cur") 2>/dev/null
    prev="$cur"
  fi

  merge=$(printf '%s' "$st" | jq -r '.mergeStateStatus // "UNKNOWN"')
  auto=$(printf '%s' "$st" | jq -r 'if .autoMergeRequest == null then "off" else "on" end')

  case "$state" in
  MERGED)
    echo "MERGED: PR ${PR} landed on main"
    exit 0
    ;;
  CLOSED)
    echo "CLOSED without merging: PR ${PR}"
    exit 0
    ;;
  esac

  # Non-terminal states that nonetheless mean the PR will never land unattended.
  # Auto-merge does NOT lift a BEHIND branch under strict branch protection, and
  # a lift can disarm auto-merge — so both are stalls, not waiting.
  case "$merge" in
  BEHIND)
    echo "BEHIND: main moved, PR ${PR} needs a lift (auto-merge will not do it)"
    exit 0
    ;;
  DIRTY)
    echo "CONFLICT: PR ${PR} has merge conflicts"
    exit 0
    ;;
  esac

  if [ "$auto" = "off" ] && [ "$merge" != "UNKNOWN" ]; then
    echo "STALL: auto-merge is DISARMED on PR ${PR} (state ${merge}) — needs re-arming"
    exit 0
  fi

  sleep "$POLL"
done
