# Durable transactional journeys

This is an initial backend runtime, not a complete Klaviyo/ActiveCampaign/Mailchimp replacement. It supports durable control flow across the operational lifecycle ledger and one real email action: the existing account welcome. Other domain emails, promotional flows, a visual editor, goals/experiments, cadence/quiet hours and production capacity remain unfinished. Cloudflare's marketing restriction remains enforced.

## Definitions and publication

`email-journeys` uses current administrator authorization for configuration and overview. Internal cron credentials may tick the worker, but cannot publish or cancel runs. Browser roles have no direct table or RPC privileges. Save without `status` creates a draft; no active definitions or automatic historical enrollment are seeded.

An example `POST` body for creating a draft:

```json
{
  "action": "save",
  "name": "Account welcome",
  "trigger_event": "account.created",
  "trigger_state": "created",
  "reentry": "once_per_account",
  "definition": {
    "start": "profile",
    "steps": {
      "profile": {"type": "branch", "condition": "profile_exists", "yes": "welcome", "no": "settle"},
      "settle": {"type": "wait", "seconds": 60, "next": "welcome"},
      "welcome": {"type": "welcome", "next": "done"},
      "done": {"type": "end"}
    }
  }
}
```

To publish/edit, send `id`, `expected_version`, the complete definition and `status` (`active`, `paused`, `draft`, or `archived`). Version conflicts return 409. Each save snapshots a new definition; existing runs retain their version. Activation requires configured HTTPS Cloudflare delivery and an active welcome template when that action appears. `GET` returns up to 100 journeys, versions and recent runs. `POST {"action":"cancel","run_id":"<UUID>"}` cancels an unfinished run idempotently and records its authenticated operator. Archive cancels unfinished runs; pause holds them for resume.

Graphs have at most 32 named steps and 16,000 bytes. Names use lowercase letters/numbers/underscores; waits are integer seconds from 1 to 2,592,000. Groups must be acyclic and all paths terminate. Supported steps:

- `end`: completes the run.
- `wait`: persists `next` and a due time atomically; retrying an old lease cannot restart that wait.
- `branch`: evaluates `username_claimed` or `profile_exists` from the current profile when advancing, choosing `yes` or `no`.
- `welcome`: invokes the existing transactional welcome sender and requires its canonical Cloudflare receipt before completing. It is allowed only for account-created triggers; arbitrary templates, content, categories and promotional actions are not accepted.

Control-only flows may use account creation, username claimed/removed, RSVP going/interested, group join, and trip invited/accepted triggers. Those sources do not enable additional email actions. Matching source state is checked again during enrollment, claiming, execution and linked-mail submission. Deleted/changed RSVP, withdrawn invitation, left group, missing account or disabled account stops pending work.

## Execution and delivery

The minute cron invokes authenticated `POST {"action":"tick"}` through the existing vault/internal-secret pattern and `admin_automations` enable switch. Tick holds without claiming when Cloudflare delivery is unconfigured. It enrolls at most 100 events, claims up to five steps, and processes them concurrently. Wait precision and throughput are bounded by this schedule/batch; no production latency or scale claim is made.

Enrollment scans eligible unmatched events rather than advancing a global cursor. Published versions have activation intervals, so an old-version event becoming visible after a newer publication still uses its original definition. Events predating activation or occurring during a paused/draft interval are not retroactively welcomed. Events eligible before a pause can remain pending and enroll after resume. Re-entry keys support once per account, once per source record, or per event, across all versions of a journey; changing that policy does not replay historical events against the new version.

Rows are leased for two minutes with `FOR UPDATE SKIP LOCKED`. Stale leases cannot advance a step. Failures back off from 60 seconds to one hour, with at most eight attempts per step and an explicit failed state. A queued message with a later provider retry time (including daily quota reset) moves the journey to at least that time instead of exhausting its attempts early. Uncertain or terminal linked-message outcomes stop the run for operator review. Completed steps have a unique `(run, step)` record. Definition validation prevents cycles, and total progression is additionally capped. API results report advanced/held steps and action/infrastructure failures, not invented sent counts.

Linked welcome mail must still target the current primary Auth address immediately before submission; an obsolete address is held. The welcome sender and journey share `welcome:<canonical account UUID>` plus normalized recipient identity. Existing branding/content snapshots and provider uncertainty rules remain in the shared outbox/Worker. A retry reuses the first payload and cannot create a new provider submission. A successful HTTP action without a durable provider receipt cannot complete the journey step.

Journey message creation and run linking commit in one database operation. Both outbox claiming and immediate pre-dispatch authorization re-check the linked run, source and journey state. Paused messages stop consuming delivery attempts. A message requested by multiple journeys can proceed while at least one linked current step remains eligible; legacy calls without a journey remain independently controlled. Stage the legacy auth-hook/cron cutover deliberately rather than treating a journey pause as a pause of every independent welcome producer.

Cancellation/archive prevents future linked submissions, but cannot recall accepted mail or eliminate a deletion/pause that races after the final database check and before the provider request. Terminally blocked linked queue entries remain inspectable; reconciliation and retention tooling remain release requirements.

## Privacy, rollout and verification

Run/step export is account-scoped and omits internal leases, enrollment keys and operator IDs. The disabled-account erasure barrier, lifecycle-event cascade and Auth cascade remove owned runs, step outcomes and message links. The existing outbox erasure still scrubs addresses/content while retaining the minimal submission identity. No operational membership event is added as a behavioral marketing predicate.

Apply the fifth email migration, deploy `email-journeys` with `verify_jwt=false` and its own authorization, and deploy the modified welcome sender/shared dependencies. The normal backend service-role credential authorizes the internal welcome call; no new browser credential is introduced. Keep definitions draft until sender/template readiness and controlled real delivery are verified. No production definition, deployment, migration or real mail was created during local tests.

Local verification covers a fresh five-migration replay, all five SQL contract suites, fifteen Deno tests and changed endpoint type checks. Journey tests cover graph rejection, version pinning, waits, live branches, replay/re-entry, late old-version events, source withdrawal, pause/resume at the outbox boundary, cancellation/archive, retry exhaustion, daily-quota alignment, uncertain outcomes, primary-address changes, receipt requirements, export and erasure. A separate Python contract holds an actual row lock in one database connection and verifies a second worker claims a different run. It also keeps a source event uncommitted across publication, then commits it and verifies enrollment in the original version. The tests use a reduced fixture baseline; complete application-schema compatibility, real mail delivery, long-running operations and production capacity still require verification.
