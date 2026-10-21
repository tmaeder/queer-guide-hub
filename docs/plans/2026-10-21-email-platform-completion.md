# Email platform completion ledger

Continues the approved integrated design and benchmark matrix after PR #4542. On 2026-10-21 the user requested completion of all remaining work, retaining Cloudflare as the sole outbound provider. This ledger tracks executable evidence; an unchecked requirement is not implemented.

## Product and interaction contract

Extend the existing Email admin workspace, paper/ink visual system, shared controls and existing editor. Journeys use labelled step/connection controls, a sample-profile preview and actual run history. Preserve drafts across navigation and failed requests; stale asynchronous responses cannot replace a newer selection. Publishing, pause/resume, archive and cancellation describe their real effects and retain version-conflict recovery. Promotional controls may prepare/approve content but must never imply Cloudflare supports promotional dispatch.

## Completion sequence

- [ ] Journey editor: typed graphs, validation, sample previews, immutable versions, pause/resume/archive, cancellation and actual step traces.
- [ ] Campaign governance: saved audience binding, optimistic editing, immutable content versions, review/approval, deduplicated audience snapshots and inclusion/exclusion explanations; promotional delivery remains blocked.
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
