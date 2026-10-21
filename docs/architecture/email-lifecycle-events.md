# Operational lifecycle events

`email_lifecycle_events` is a service-only, versioned event ledger for communication workflows. It records authoritative source mutations in the same transaction; a rollback removes both the mutation and its event. It does not send mail or automatically enroll anyone in a journey. No historical accounts or memberships are backfilled into welcome or promotional flows.

| Source | Event | States |
| --- | --- | --- |
| Auth user insertion | `account.created` | `created` |
| Profile username insertion/change | `profile.username.changed` | `claimed`, `removed` |
| Event attendance insertion/status change/deletion | `event.rsvp.changed` | `going`, `interested`, `not_going`, `removed` |
| Group membership insertion/deletion | `group.membership.changed` | `joined`, `left` |
| Trip membership insertion/acceptance change/deletion | `trip.membership.changed` | `invited`, `accepted`, `left` |

Unchanged usernames and RSVP states do not emit. Group role edits are not joins. Changing an already accepted trip's timestamp is not a second acceptance; owner memberships are accepted on insertion. A real leave/rejoin transition emits both transitions even when a source UUID is reused in one transaction. Null RSVP states produce no actionable event.

Each event contains an opaque event UUID and key, schema version 1, account UUID, source-row UUID, an allowed event type/state pair, and database occurrence time. There is no arbitrary JSON payload: names, group titles, destination/location, message text, intimate traits, email addresses and financial details are absent. The sensitive-state implications of membership metadata still require restricted access and retention; opaque identifiers are not a promise of anonymity.

Private database trigger functions capture the listed tables. Service callers may use `email_emit_lifecycle_event` with a stable logical key for verified integrations. Identical replays return the same event; a changed identity/state under that key fails. Missing or erased/disabled accounts are skipped rather than recreated. Public and member roles have no direct ledger or emitter access. Existing source-table RLS and authorization still govern the original product action.

Member email export includes the account's lifecycle records without internal dedupe keys. A subscriber's contact timeline includes them only after mailbox proof links the subscription to that account. The existing account-erasure barrier deletes its ledger rows transactionally, and Auth deletion also cascades. Stale emitters cannot recreate the disabled account's events. General-purpose audience predicates deliberately do not accept these membership/profile events: operational communication state does not grant marketing behavioral consent.

## Remaining work and boundaries

The ledger now supplies the bounded durable runtime described in `docs/architecture/email-journeys.md`, including versioned enrollment, waits, source exits, re-entry, leases and step idempotency. Its email action catalog is limited to account welcome; further source/preference-aware actions remain unfinished. It must re-check live source state and communication preferences before any send: a deleted RSVP/member record, left group or revoked trip invitation must stop pending work. Event occurrence order is not commit order, so a future poller must not advance a global timestamp/UUID cursor and assume all earlier transactions have committed.

Donation events must come from verified Stripe webhook processing, not an arbitrary update of the donations table; the inspected baseline permits donor row updates. No financial event adapter or purchase/revenue claim is introduced here. Contributions, publication, saved-search/catalog alerts, support, organization claims and other benchmark integration areas still need explicit adapters and policies. Provider capability, frequency/quiet hours, behavioral consent, retention jobs and provider-held data lifecycle remain separate release gates.

Apply the four email migrations in order. The dedicated SQL suite exercises actual fixture source writes, unchanged-state handling, rollback, leave/rejoin, replay conflicts, allowed event pairs, export/timeline proof, erasure and service-only grants. Fixtures mirror only the required source columns; they are not a full application baseline replay or a production-load proof.

Local verification on 2026-10-20: all four email migrations applied to a fresh isolated database, all four SQL contract suites passed after updating the shared timeline assertion to accommodate operational events, and the Supabase security advisor reported no error-level findings on that fixture database. This does not establish production baseline compatibility, production delivery, retention operations or journey execution.
