# Automation Operations Safety Design

Date: 2026-09-26
Status: approved
Scope: `/admin/automation`, its operator RPCs, and registry lifecycle metadata

## Problem

The automation registry currently presents global and per-row controls more broadly than the backend can safely support. Manual dispatch is defined by repeatedly replaced functions, aggregate dry-run attempts every enabled job, and the global resume operation enables rows that were intentionally paused, completed, retired, or consolidated.

The operator contract must be explicit and enforced by both the database and UI.

## Decision

Use a persistent capability and lifecycle contract on `admin_automations`, backed by a maintenance-mode snapshot. This is preferred over a computed view because capabilities must be reviewable and stable, and over a frontend allowlist because the database must remain the authority.

## Registry Contract

Add these fields:

- `lifecycle_state`: `active`, `paused`, `auto_paused`, `completed`, `retired`, or `consolidated`.
- `can_run_now`: whether the registered action can be manually dispatched.
- `can_dry_run`: whether the registered action has a truthful preview implementation.
- `capability_reason`: operator-readable explanation when an action is unavailable.

Backfill conservatively. Existing disabled rows remain paused unless their descriptions already identify them as retired, completed, or consolidated. Manual execution is enabled only where the dispatcher can prove an executable registered function. Dry-run is enabled only where a truthful dry-run implementation exists; recording a zero-work audit row is not a dry-run.

Lifecycle states that represent terminal work (`completed`, `retired`, `consolidated`) cannot be re-enabled by ordinary controls.

## Dispatch Contract

- `admin_automation_run` validates registration, lifecycle, enabled state, and `can_run_now` before dispatch.
- `admin_automation_dry_run` validates `can_dry_run` and calls a declared dry-run function rather than fabricating a result.
- `admin_automation_dry_run_all` visits only eligible automations and returns structured eligible, skipped, succeeded, failed, and total-change counts.
- Function names remain identifier-validated and registry-owned; no arbitrary SQL is accepted.

## Maintenance Mode

Replace blanket pause/resume behavior with a singleton maintenance state and a snapshot of the jobs that were enabled when maintenance began.

- Entering maintenance snapshots currently enabled, non-terminal jobs and pauses exactly those jobs.
- Re-entering maintenance is idempotent.
- Exiting maintenance restores only the snapshot, provided each row is still non-terminal.
- Jobs already paused before maintenance remain paused.
- Completed, retired, and consolidated jobs are never restored.
- The result includes changed counts and the resulting maintenance state.

## UI Contract

- Replace adjacent Pause all and Resume all controls with one clearly labeled maintenance-mode control.
- Require confirmation in both directions and explain exact snapshot restoration semantics.
- Show Run now and Dry-run only when their capabilities are supported; otherwise expose the reason in job details.
- Present aggregate dry-run as a durable structured summary instead of a large toast payload.
- Render query failures explicitly.
- Use lifecycle labels that distinguish manual pause, automatic pause, and terminal states.

## Verification

- SQL regression coverage for lifecycle checks, capability enforcement, idempotent maintenance entry, exact restoration, and terminal-state exclusion.
- Frontend tests for capability-aware controls, maintenance copy/state, aggregate result handling, and fetch-error presentation.
- Typecheck and focused unit tests.
- Production changes are deployed only after migration and application verification succeed.

## Worktree Safety

The current branch contains unrelated uncommitted work. Implementation will touch only the new migration, automation page and focused tests/types, and this design document. Commits will stage explicit paths only.
