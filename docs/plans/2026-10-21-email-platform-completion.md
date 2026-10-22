# Email platform completion ledger

Continues the approved integrated design and benchmark matrix after PR #4542. On 2026-10-21 the user requested completion of all remaining work, retaining Cloudflare as the sole outbound provider. This ledger tracks executable evidence; an unchecked requirement is not implemented.

## Product and interaction contract

Extend the existing Email admin workspace, paper/ink visual system, shared controls and existing editor. Journeys use labelled step/connection controls, a sample-profile preview and actual run history. Preserve drafts across navigation and failed requests; stale asynchronous responses cannot replace a newer selection. Publishing, pause/resume, archive and cancellation describe their real effects and retain version-conflict recovery. Promotional controls may prepare/approve content but must never imply Cloudflare supports promotional dispatch.

## Completion sequence

- [x] Journey editor: typed graphs, validation, sample previews, immutable versions, pause/resume/archive, cancellation and actual step traces.
- [x] Campaign governance: saved audience binding, optimistic editing, immutable content versions, review/approval, deduplicated audience snapshots and inclusion/exclusion explanations; promotional delivery remains blocked.
- [ ] Content: shared rendering throughout, explicit locale fallback, validated public catalog/editorial blocks and previews.
- [ ] Remaining operational adapters: authoritative event changes/reminders, trip changes/reminders, group invitations/comments/requests, saved alerts, merchant/organization/contribution/payment notices. Every enabled adapter requires independent purpose/permission, current source/visibility and immutable logical identity; product domains without an authoritative source or qualifying permission remain explicitly excluded.
- [ ] Measurement: deterministic experiment/control assignment, declared outcome windows, verified app outcomes, recipient/step/flow reporting; no fabricated purchases, lift or automatic winner.
- [ ] Subscriber operations: contextual signup/preference surfaces, non-member management, provenance-aware import/export, suppression-preserving hygiene, privacy/export/erasure coverage.
- [ ] Operations: operator audit, retry/uncertain-state reconciliation, DLQ recovery, configured retention, health/latency metrics, bounded capacity tests and restore rehearsal.
- [ ] Production verification: appropriate tests, authenticated browser flows, production deployment, sender/receipt/native-event correlation and authorized real inbox tests.

## Explicit capability boundaries

- Marketing/newsletter dispatch cannot be completed while Cloudflare restricts Email Service to transactional mail. Keep API, SQL and transport restrictions; no override or fallback.
- Predictions without qualifying first-party data, sensitive profiling, inferred gender/sexuality/health and fabricated conversion outcomes are excluded rather than simulated as production capabilities.
- Real mail requires an expressly authorized recipient. A request for a test inbox is pending; implementation continues independently.

## Verification record

Prior release: all twelve required PR checks, Pages smoke and all-functions backend deployment passed. Eight email migrations and four scheduler jobs are live; RLS/critical RPC audit passed. Cloudflare SMTP AUTH/NOOP passed without test mail. Native lifecycle subscription is enabled. These facts do not establish full platform parity or inbox placement.


Completion checkpoint (local verification, not a deployment claim): journey/campaign workspace reviewed at 1440px and 390px, two independent reviewer findings fixed and scored resolved. Immutable campaign snapshots/reviews and operational audit pass isolated SQL contracts. Seven new source-backed notice kinds cover event/trip changes/reminders, group-request decisions, contribution decisions and signature-verified payment notifications, each independently opted in and revalidated before dispatch. Membership replacement, rescheduling, opt-out, erasure and timezone-stable fingerprints are covered. Group comments/invitations, saved alerts and merchant/organization adapters still require implementation or an explicit justified exclusion; they are not claimed here.

Operations now provide read-only durable receipt reconciliation, observed health/latency, a configured bounded body-retention job, 10,000-contact capacity contracts and a disposable PostgreSQL restore rehearsal. The recovery runbook documents DLQ handling; a live DLQ drain, production restore and actual inbox/native-event correlation remain unverified. Content localization/catalog blocks, experiment/reporting and subscriber import/public management remain unchecked. Cloudflare's restriction is a failed marketing release gate, not a reason to label these software gaps complete.


Entity recipient extension (requested 2026-10-22): current organisation, venue, linked vendor and verified user mailboxes appear in the privileged recipient directory. An operator may add a pending contact using a canonical entity reference; addresses, account ownership, status and consent cannot be supplied by that operation. Shared mailboxes deduplicate to the same subscription and suppression record. Recipient-type audience conditions compose with existing locale/topic/behaviour rules and resolve current entity contacts at evaluation time. Contact replacement does not transfer consent, and archived/disabled entities cease to match. Business listing associations do not prove ownership. Existing source-backed transactional producers and recipient-initiated subscription confirmation accept these mailboxes; arbitrary promotional dispatch remains prohibited by Cloudflare.
