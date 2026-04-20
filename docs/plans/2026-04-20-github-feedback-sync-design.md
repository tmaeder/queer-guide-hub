# GitHub ↔ Feedback Bidirectional Sync

Date: 2026-04-20
Status: Approved — ready to implement

## Goal

Full bidirectional sync between `community_submissions` (feedback/api_error rows surfaced at `/admin/feedback`) and GitHub issues on the `queer.guide` repo. Covers webhook events, notification-inbox polling, and outbound admin actions.

## Current state

- `forward-feedback-to-github` (edge fn): creates a GH issue from a submission, stores `github_issue_url` + `github_issue_number`.
- `github-webhook` (edge fn, HMAC-verified, deduped on `x-github-delivery`): handles `issues.closed|reopened`, `issue_comment.created`, `workflow_run.completed`.

## Gaps this design closes

A. No end-to-end verification that the webhook is actually wired up on the repo.
B. Webhook ignores edits, labels, assignees, PR merges, comment edits/deletes.
C. No fallback if a webhook delivery is missed.
D. Admin actions in `/admin/feedback` (reply, status change, label) don't push back to GitHub.

## Approach: minimal extension (Approach 1)

Extend existing webhook, add a poller, add an outbound pusher, add a verify script. Reuses existing patterns; ships incrementally.

## Data model

- New table `github_event_ids(id text pk, kind text, seen_at timestamptz default now())` — generic dedup for comment ids, notification thread ids. Complements existing `webhook_deliveries`.
- New column `community_submissions.github_last_synced_at timestamptz`.
- New field on `data.replies[]` entries: `github_comment_id bigint` — dedup between webhook and poller paths.

## Component changes

### B — Extend `github-webhook`

Handlers added:
- `issues.edited` → update `data.title` / `data.description` if body/title changed.
- `issues.labeled` / `unlabeled` → mirror into `data.github_labels[]`.
- `issues.assigned` / `unassigned` → `data.github_assignees[]`.
- `pull_request.closed` with `merged=true`, linked via `Closes #N` → status `done`, resolution `fixed`, store `data.github_merge_commit`.
- `issue_comment.edited` → find reply by `github_comment_id`, update body.
- `issue_comment.deleted` → soft-mark reply with `deleted_at`.

Shared helper `syncIssueEvent()` extracted into `_shared/github-sync.ts` — reused by poller.

### A — Verify script

`scripts/verify-github-sync.ts` (runnable via `npm run verify:gh-sync`):
1. List repo webhooks via `GITHUB_PAT`, assert URL points to deployed `github-webhook`.
2. Assert subscribed events include `issues`, `issue_comment`, `pull_request`, `workflow_run`.
3. Open a test issue, post a comment, close it, reopen it — assert DB row updates within 10s per step.
4. Clean up test issue.

### C — Notifications poller

New edge fn `github-notifications-poller`, cron every 5 min.
- `GET /notifications?participating=true&since=<last_run>` with `GITHUB_PAT`.
- For each `Issue` thread: fetch issue + new comments since `last_read_at`, pass through shared `syncIssueEvent()`.
- Mark thread read via `PATCH /notifications/threads/:id`.
- Dedup via `github_event_ids` so webhook-delivered events are skipped.

### D — Outbound push (`push-feedback-to-github`)

New edge fn called from `AdminFeedback` row actions when `github_issue_number` is set:
- Admin reply added → `POST /repos/.../issues/:n/comments`; store returned `comment_id` on reply so inbound webhook for the same comment dedups.
- Status → `done` → close with `state_reason`: `fixed`→`completed`, `wontfix`/`duplicate`→`not_planned`.
- Status → `in_progress` (from `done`) → reopen.
- Label changes in kanban → `POST/DELETE /labels`.

Loop guard: inbound handler sets `data._last_source='github'` during sync; outbound skips when true, then clears.

## Rollout order

1. Migration + shared util (`github_event_ids`, `_shared/github-sync.ts`).
2. B — extend webhook.
3. A — verify script.
4. D — outbound push.
5. C — poller (safety net, ships last).

## Out of scope

- Reactions, discussions, projects, milestones.
- Cross-repo sync (only `queer.guide`).
- Backfill of historical issues.
