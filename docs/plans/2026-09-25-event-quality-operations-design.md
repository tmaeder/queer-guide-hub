# Event quality operations completion

## Goal

Make `/admin/content/event-quality` a trustworthy operational queue: every number must describe canonical events, every filter must search the full issue corpus, and every disposition must be deliberate, auditable, and reachable from an event repair workflow.

## Considered approaches

### 1. Client-only extension

Keep the existing PostgREST query, request a larger result set, and add local pagination and dialogs.

- Advantage: smallest frontend-only change.
- Rejected: filtering would remain incomplete, large transfers would grow without bound, and canonical-event rules would still be duplicated in clients.

### 2. Direct PostgREST pagination

Join `event_quality_issues` to canonical events in the client query, apply server filters, request exact counts, and paginate with ranges.

- Advantage: no new RPC.
- Trade-off: OR-searching across issue fields and joined event/source fields is awkward and brittle; the canonical contract remains implicit.

### 3. Admin RPC boundary — selected

Add a role-gated `event_quality_issue_page` RPC returning canonical rows, filtered totals, and severity totals. Keep disposition writes in the existing role-gated decision RPC. Rebuild the snapshot over canonical joins and add lifecycle reconciliation for events that become duplicates.

- Advantage: one testable database contract, exact counts, bounded payloads, and no false-negative client search.
- Trade-off: requires a migration and generated-type escape hatch until types are regenerated.

## Database design

- Reconcile existing non-canonical rows:
  - mark their open issues resolved with a machine-readable duplicate lifecycle reason;
  - remove their current quality snapshots.
- Add an `AFTER UPDATE OF duplicate_of_id` trigger that performs the same reconciliation when a canonical event becomes a duplicate.
- Recreate `event_quality_snapshot()` so totals, tiers, scopes, dimensions, cohorts, and accepted dispositions are all calculated through canonical event joins.
- Add `event_quality_issue_page(severity, query, offset, limit)`:
  - admin/moderator JWT gate;
  - canonical events only;
  - case-insensitive issue-code, source, and title search;
  - deterministic severity/age/id ordering;
  - bounded page size;
  - exact filtered total plus canonical open total.
- Preserve the existing RLS and revoke/grant posture. No anonymous access is added.

## Interface design

- Rename legacy header metrics to **Legacy quality** and **Legacy trust** so they cannot be confused with rubric dimensions.
- Explain the legacy queue, rubric queue, and shadow/enforced status inline.
- Make issue-cohort badges interactive filters.
- Replace the 250-row client subset with 50-row server pages and truthful `x–y of z` counts.
- Add filters for severity and issue/source/title search, with clear/reset and previous/next controls.
- Link event titles to their public detail for quick inspection and provide an explicit **Edit event** action into the admin editor workflow supported by the content system.
- Replace `window.prompt` with an accessible decision dialog containing issue context, evidence, the audit-note requirement, and explicit Resolve/Accept language.
- Render evidence as readable key/value rows while retaining raw JSON in a disclosure.
- Give repeated controls event- and issue-specific accessible names and use list semantics for the queue.

## Verification and release

- Add focused component/contract tests for pagination, filtering, accessible labels, canonical SQL predicates, and lifecycle reconciliation.
- Run formatting, targeted tests, typecheck, lint, full test suite, production build, secret/debug scan, and diff review.
- Run Supabase security/performance advisors before applying the production migration.
- Apply the migration, verify canonical counts and stale-row cleanup with read-only SQL, then deploy the frontend through the repository's production Cloudflare Pages workflow.
- Run authenticated production E2E covering dashboard load, truthful counts, global filtering, pagination, evidence disclosure, decision-dialog validation without submitting a mutation, event navigation, and an accessibility smoke check.

## Non-goals

- Changing the quality rubric weights or issue detectors.
- Bulk-resolving production issues during E2E.
- Redesigning the rest of the admin console.
