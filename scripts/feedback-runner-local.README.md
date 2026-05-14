# Local feedback routine runner

A long-running daemon that watches the `feedback_routine_runs` and
`feedback_retest_runs` tables for rows tagged `runner='local'` and executes
them on this machine. The "Claude Code routines on this machine" answer to
the loop's runner-adapter design (#217 → #223).

## What it does

```
admin clicks Dispatch (runner=local) in /admin/feedback
        ↓
dispatch_claude_routine RPC inserts feedback_routine_runs row, status=queued
        ↓
claude-routine-dispatch edge fn picks runner='local' adapter
adapter is a no-op: stamps external_ref='local-<runId>'
        ↓
record_routine_progress flips status → 'dispatched'
        ↓
[poller, every 30s]: SELECT * WHERE runner='local' AND status='dispatched'
        ↓
poller flips → 'in_progress', git worktree off origin/main, runs
        claude -p --max-turns 30 --permission-mode acceptEdits < prompt
        ↓
git diff → opens PR via `gh pr create`
        ↓
record_fix_proposed → kanban shows the PR link, retest buttons appear
        ↓
admin clicks Run unit / typecheck / etc. (runner=local)
        ↓
poller picks up retest, npm ci + runs the kind, posts pass/fail
```

When the retest passes, the kanban shows "Resolve | Reopen" and the loop
closes via `verify_story` + `archive_story` like any other runner.

## Required env

| var | what |
|---|---|
| `SUPABASE_URL` | `https://xqeacpakadqfxjxjcewc.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key — sensitive, do not commit |
| `FEEDBACK_RUNNER_REPO_PATH` | absolute path to a clean clone of `tmaeder/queer-guide-hub` (the daemon adds worktrees off it) |

## Optional env

| var | default | what |
|---|---|---|
| `FEEDBACK_RUNNER_REMOTE` | `origin` | git remote to push branches to |
| `FEEDBACK_RUNNER_BASE_BRANCH` | `main` | base branch for PRs |
| `FEEDBACK_RUNNER_BRANCH_PREFIX` | `feat/claude-fix-` | branch name prefix per run |
| `FEEDBACK_RUNNER_POLL_MS` | `30000` | poll interval |
| `FEEDBACK_RUNNER_MAX_TURNS` | `30` | claude `--max-turns` |
| `FEEDBACK_RUNNER_CLAUDE_BIN` | `claude` | path to claude CLI |
| `FEEDBACK_RUNNER_GH_BIN` | `gh` | path to gh CLI |
| `FEEDBACK_RUNNER_DRY_RUN` | unset | when `1`, log what would happen and skip claude / push / PR / npm ci |

## Prerequisites on this machine

- `node` (≥ 22) on PATH
- `git` on PATH
- `gh` authenticated (`gh auth status`) so `gh pr create` works without prompts
- `claude` CLI authenticated (Claude Code OAuth or `ANTHROPIC_API_KEY`)
- A clone of `tmaeder/queer-guide-hub` at `FEEDBACK_RUNNER_REPO_PATH` with `origin` pointing at the GitHub remote

## Run by hand

```bash
cd Dev/web
SUPABASE_URL=https://xqeacpakadqfxjxjcewc.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
FEEDBACK_RUNNER_REPO_PATH=/Users/tobiasmaeder/QG/Dev/web \
node scripts/feedback-runner-local.mjs
```

`--once` fires a single tick and exits — useful for cron / debugging:

```bash
FEEDBACK_RUNNER_DRY_RUN=1 node scripts/feedback-runner-local.mjs --once
```

## Run as a launchd background agent

```bash
cp scripts/feedback-runner-local.launchd.plist \
   ~/Library/LaunchAgents/guide.queer.feedback-runner.plist
# Edit the copy: replace YOUR_SERVICE_ROLE_KEY_HERE and adjust paths.
launchctl load ~/Library/LaunchAgents/guide.queer.feedback-runner.plist
launchctl list | grep feedback-runner
tail -f /tmp/feedback-runner.log
```

To stop:

```bash
launchctl unload ~/Library/LaunchAgents/guide.queer.feedback-runner.plist
```

The service-role key sits in plain text in the plist — keep your edited
copy under `~/Library/LaunchAgents` (user-only perms) and never commit it.

## Flip dispatches to use it

The runner adapter is selected per-dispatch in the admin UI — there's a
dropdown in the Dispatch card with `mock | local | github_actions | webhook | api`.
Pick `local` once for the next run; the choice is per-run, not global.

For a global default, set `FEEDBACK_FIX_RUNNER=local` /
`FEEDBACK_RETEST_RUNNER=local` as Supabase function secrets:

```bash
supabase secrets set --project-ref xqeacpakadqfxjxjcewc \
  FEEDBACK_FIX_RUNNER=local \
  FEEDBACK_RETEST_RUNNER=local
```

(The dropdown override always wins.)

## Safety

- The daemon uses `claude -p --permission-mode acceptEdits` — Claude can edit files in the worktree but cannot run arbitrary tools or shell commands beyond what the prompt asks for. If you want stricter, change to `--permission-mode plan`.
- The daemon never touches `main` directly; every fix lands on `feat/claude-fix-<run_id>` which it pushes and opens a PR for. Merging the PR is still your call.
- The HMAC secret is irrelevant for `runner=local` (no callbacks over the network).
- The service-role key bypasses RLS — guard it like a password.

## Stopping a run mid-flight

Hit Cancel in the routine card; the next call to `record_routine_progress`
will RAISE `terminal_state` and the daemon's RPC call will error out, which
the daemon logs and moves on.
