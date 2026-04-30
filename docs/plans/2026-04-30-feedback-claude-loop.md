# Feedback → Claude Fix → Retest → Archive Loop

Status: Phase 1 shipped (schema + RPCs + mock runner + UI). Real `github_actions` runner pending workflow YAML wiring.

## Why

`/admin/feedback` had a manual copy/paste handoff to Claude with no audit, no automatic execution, no retest, and no archival. This change turns that into an explicit, audited end-to-end loop while keeping the existing kanban / detail drawer untouched as much as possible.

## Architecture overview

Three sibling tables drive three small state machines:

| Table | What it tracks | States |
|---|---|---|
| `feedback_routine_runs` | One row per Claude fix attempt for a story | `queued → dispatched → in_progress → fix_proposed`, terminal: `failed` / `cancelled` |
| `feedback_retest_runs` | One row per automated retest of a fix | `queued → running`, terminal: `passed` / `failed` / `error` |
| `feedback_story_events` | Structured timeline (one row per state transition) | n/a — append-only |

`feedback_stories` gains additive flags only:
- `approved_for_claude_at` / `approved_by` — human gate before any code-changing routine runs
- `needs_followup_reason` — admin says the bundle is not actionable as-is
- `archived_at` / `archived_by` / `archive_reason` — soft archive (stories with `status='archived'` AND `archived_at` set are filtered out of the default kanban)

The user-visible "phase" (`Awaiting review` / `Approved` / `Fix in progress` / `Fix proposed` / `Retesting` / …) is **derived** from these three rows by `getStoryPhase` ([src/components/admin/feedback/storyPhase.ts](../../src/components/admin/feedback/storyPhase.ts)). No persisted enum drift.

## Permissions

Every state transition is a SECURITY DEFINER RPC that asserts `has_any_role_jwt(['admin','moderator'])` — same gate the rest of feedback uses. Direct table writes go through `service_role` only; row policies are deny-by-default for `authenticated`.

## Runner adapter

Execution is pluggable via `FEEDBACK_FIX_RUNNER` (and `FEEDBACK_RETEST_RUNNER`) env vars on the Supabase Edge runtime:

- `mock` (default) — synchronous, fakes a fix + retest. Used by dev + e2e.
- `github_actions` — fires `repository_dispatch` event; a workflow runs Claude headless and POSTs back via HMAC.
- `webhook` — generic HMAC-signed POST to any URL; the receiver runs Claude however it likes.
- `api` — placeholder for direct Anthropic API + tool-use loop. Throws `not_implemented` until wired.

Adapter contract: [supabase/functions/_shared/feedback-runners/types.ts](../../supabase/functions/_shared/feedback-runners/types.ts).

### GitHub Actions runner — wiring

Required Supabase function secrets:
- `FEEDBACK_FIX_GH_REPO=tmaeder/queer-guide-hub`
- `FEEDBACK_FIX_GH_TOKEN=<PAT with workflow scope>`
- `FEEDBACK_RUNNER_HMAC_SECRET=<random 32+ bytes>`
- `FEEDBACK_FIX_GH_EVENT=claude-fix` (optional — defaults to `claude-fix`)

GitHub repo secrets (used by the workflow itself):
- `ANTHROPIC_API_KEY` — for Claude Code in the runner
- `FEEDBACK_RUNNER_HMAC_SECRET` — must match the Supabase secret (used to sign callbacks)

Workflow template lives at `.github/workflows/claude-fix.yml` (TBD — to be added when the GH-Actions runner is enabled). Outline:

```yaml
on:
  repository_dispatch:
    types: [claude-fix]
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: ${{ github.event.client_payload.prompt }}
      - name: Open PR
        # …
      - name: Callback
        run: |
          BODY=$(jq -c -n --arg run "${{ github.event.client_payload.run_id }}" \
            --arg pr "$PR_URL" --arg sha "$COMMIT_SHA" \
            '{run_id:$run, kind:"fix_proposed", pr_url:$pr, commit_sha:$sha, summary:"…"}')
          SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "${{ secrets.FEEDBACK_RUNNER_HMAC_SECRET }}" -binary | xxd -p -c 256)"
          curl -fsS -X POST "${{ github.event.client_payload.callback_url }}" \
            -H "Content-Type: application/json" -H "X-Feedback-Signature: $SIG" -d "$BODY"
```

A parallel workflow (`feedback-retest`) handles retest dispatches the same way, calling `feedback-retest-callback`.

### Webhook runner — wiring

Required:
- `FEEDBACK_FIX_WEBHOOK_URL=https://my-runner.example.com/run`
- `FEEDBACK_FIX_WEBHOOK_HMAC_SECRET=<shared secret>`
- `FEEDBACK_RUNNER_HMAC_SECRET=<random>` (for the callback the runner makes back to us)

Outbound payload (HMAC-signed via `X-Feedback-Signature`):
```json
{
  "run_id": "...", "story_id": "...", "prompt": "...",
  "callback_url": "https://<project>.supabase.co/functions/v1/claude-routine-callback",
  "callback_hmac_secret": "...",
  "ts": "2026-04-30T..."
}
```

Expected response: `{ "external_ref": "string" }`. Anything 2xx counts as accepted.

Callback contract — POST to `claude-routine-callback`:
```json
{ "run_id": "...", "kind": "progress" | "fix_proposed" | "failed",
  "status": "in_progress" | ..., "external_ref": "...",
  "pr_url": "...", "commit_sha": "...", "files_changed": [...],
  "summary": "...", "confidence": "low|medium|high", "risks": "...",
  "error": "..." }
```

## Rate limits + dedup

`dispatch_claude_routine` enforces 5/min and 50/day per admin (see `feedback_dispatch_counters`) and returns the existing live run when called with the same `(story_id, prompt_hash)` — so the UI can safely retry.

## Redaction

All prompts are built server-side in `claude-routine-dispatch`. Submission text is run through `redactSubmissionForClaude` ([supabase/functions/_shared/feedback-redact.ts](../../supabase/functions/_shared/feedback-redact.ts)) which strips:
- emails (replaced with `<email>`)
- IPv4 addresses (`<ip>`)
- `Authorization` / `Cookie` / `x-api-key` headers in network failure logs (`<redacted>`)
- entire `replies[]` and legacy `handoffs[]` arrays

Currently the client builds the prompt and the server only validates rate-limit + approval. A follow-up move-prompt-build-server-side ticket will close that gap.

## Observability

- Every RPC writes a `feedback_story_events` row with `kind`, `payload`, `actor_kind`. The drawer's "Story timeline" surface renders this.
- Edge function logs are structured (re-uses the existing logger from `feedback-embed`).
- Supabase advisors run after each migration (`mcp__supabase__get_advisors`). Phase 1 advisor follow-ups are baked into `20260430000300_feedback_routine_advisor_fixes.sql`.

## Files

| Layer | Files |
|---|---|
| DB | `supabase/migrations/20260430000{000,100,200,300}_feedback_routine_*.sql` |
| Edge | `supabase/functions/{claude-routine-dispatch,claude-routine-callback,feedback-retest-dispatch,feedback-retest-callback}/index.ts` |
| Shared | `supabase/functions/_shared/feedback-runners/{types,mock,github_actions,webhook,api,registry,retest_*}.ts`, `_shared/{hmac,feedback-redact}.ts` |
| UI | `src/components/admin/feedback/{RoutineLoopSection,StoryActivityLog,storyPhase}.tsx`, drawer integration |
| Hooks | `src/hooks/useStoryRoutine.ts` |
| Tests | `src/components/admin/feedback/__tests__/storyPhase.test.ts`, `e2e/admin-feedback-routine.spec.ts` |

## Rollback

All migrations are additive. To roll back the loop without data loss:
1. Set `FEEDBACK_FIX_RUNNER=mock` so no external calls happen.
2. Hide the `RoutineLoopSection` mount in `StoryDetailDrawer.tsx`.
3. The events table + run tables remain readable for audit.

## Follow-ups

- Move prompt building to the dispatch edge function and apply `redactSubmissionForClaude` server-side.
- Add `Archived` view to `StoriesKanban` + bulk archive in `FeedbackBulkBar`.
- Phase chip on kanban cards (`getStoryPhase` already pure).
- pgTAP tests for the RPC state machine.
- Wire `github_actions` runner end-to-end with the YAML template above.
