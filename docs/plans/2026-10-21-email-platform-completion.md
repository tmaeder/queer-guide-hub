# Email platform completion ledger

Continues the approved integrated design and benchmark matrix after PR #4542. On 2026-10-21 the user requested completion of all remaining work, retaining Cloudflare as the sole outbound provider. This ledger tracks executable evidence; an unchecked requirement is incomplete; the checkpoints distinguish implemented subsets from unverified or excluded capabilities.

## Product and interaction contract

Extend the existing Email admin workspace, paper/ink visual system, shared controls and existing editor. Journeys use labelled step/connection controls, a sample-profile preview and actual run history. Preserve drafts across navigation and failed requests; stale asynchronous responses cannot replace a newer selection. Publishing, pause/resume, archive and cancellation describe their real effects and retain version-conflict recovery. Promotional controls may prepare/approve content but must never imply Cloudflare supports promotional dispatch.

## Completion sequence

- [x] Journey editor: typed graphs, validation, sample previews, immutable versions, pause/resume/archive, cancellation and actual step traces.
- [x] Campaign governance: saved audience binding, optimistic editing, immutable content versions, review/approval, deduplicated audience snapshots and inclusion/exclusion explanations; promotional delivery remains blocked.
- [x] Content workspace: versioned localized templates, explicit locale fallback, validated public catalog/editorial blocks, previews and immutable campaign content pins (PR #4573). This does not assert that every legacy producer uses the shared renderer.
- [ ] Remaining operational adapters: authoritative event changes/reminders, trip changes/reminders, group invitations/comments/requests, saved alerts, merchant/organization/contribution/payment notices. Every enabled adapter requires independent purpose/permission, current source/visibility and immutable logical identity; product domains without an authoritative source or qualifying permission remain explicitly excluded.
- [ ] Measurement: deterministic experiment/control assignment, declared outcome windows, verified app outcomes, recipient/step/flow reporting; no fabricated purchases, lift or automatic winner.
- [x] Subscriber operations: contextual signup/preference surfaces, non-member management, provenance-aware import/export, suppression-preserving hygiene, privacy/export/erasure coverage (PR #4573); production subscriber access and signup verification repaired and verified in PR #4583. Real inbox delivery remains a separate gate.
- [ ] Operations: operator audit, retry/uncertain-state reconciliation, DLQ recovery, configured retention, health/latency metrics, bounded capacity tests and restore rehearsal.
- [ ] Production verification: appropriate tests, authenticated browser flows, production deployment, sender/receipt/native-event correlation and authorized real inbox tests.

## Explicit capability boundaries

- Marketing/newsletter dispatch cannot be completed while Cloudflare restricts Email Service to transactional mail. Keep API, SQL and transport restrictions; no override or fallback.
- Predictions without qualifying first-party data, sensitive profiling, inferred gender/sexuality/health and fabricated conversion outcomes are excluded rather than simulated as production capabilities.
- Production E2E is authorized as of 2026-10-25. Controlled tests use the signed-in owner’s own mailbox; directory contacts are not test recipients.

## Verification record

Prior release: all twelve required PR checks, Pages smoke and all-functions backend deployment passed. Eight email migrations and four scheduler jobs are live; RLS/critical RPC audit passed. Cloudflare SMTP AUTH/NOOP passed without test mail. Native lifecycle subscription is enabled. These facts do not establish full platform parity or inbox placement.


Completion checkpoint (local verification, not a deployment claim): journey/campaign workspace reviewed at 1440px and 390px, two independent reviewer findings fixed and scored resolved. Immutable campaign snapshots/reviews and operational audit pass isolated SQL contracts. Seven new source-backed notice kinds cover event/trip changes/reminders, group-request decisions, contribution decisions and signature-verified payment notifications, each independently opted in and revalidated before dispatch. Membership replacement, rescheduling, opt-out, erasure and timezone-stable fingerprints are covered. Group invitation source capture and review are covered by the continuation below. Group comments lack an audited recipient/read contract in this implementation and are excluded pending that work. Additional merchant/organization notices require a verified owner/claimant service event; public directory addresses do not establish ownership. Saved editorial alerts are newsletter content and remain blocked by provider policy.

Operations now provide read-only durable receipt reconciliation, observed health/latency, a configured bounded body-retention job, 10,000-contact capacity contracts and a disposable PostgreSQL restore rehearsal. The recovery runbook documents DLQ handling; a live DLQ drain, production restore and actual inbox/native-event correlation remain unverified. PR #4573 subsequently shipped localized content/catalog blocks, subscriber import/public management, deterministic experiment/control assignment and first-party reporting. Assignment has no fabricated dispatch exposure, winner, lift or purchase outcome; actual experiment delivery/outcomes remain unverified. Cloudflare's restriction is a failed marketing release gate, not a reason to label unrelated software gaps complete.


Entity recipient extension (requested 2026-10-22): current organisation, venue, vendor and verified user mailboxes appear in the privileged recipient directory. Vendors resolve enabled merchant organisation contacts and current marketplace listing contacts; archived, deprecated and duplicate listing contacts are excluded, and listing IDs cannot shadow merchant IDs. An operator may add a pending contact using a canonical entity reference; addresses, account ownership, status and consent cannot be supplied by that operation. Shared mailboxes deduplicate to the same subscription and suppression record. Recipient-type audience conditions compose with existing locale/topic/behaviour rules and resolve current entity contacts at evaluation time. Contact replacement does not transfer consent, and archived/disabled entities cease to match. Business listing associations do not prove ownership. Existing source-backed transactional producers and recipient-initiated subscription confirmation accept these mailboxes; arbitrary promotional dispatch remains prohibited by Cloudflare.


## Group invitation continuation (deployed PR #4585)

New source-backed group invitation mail requires an actual pending invite to a registered account, independent `group_invitations` opt-in at creation, the original inviter membership, a matching unread in-product notification, current group access, no block or disabled party, and an unexpired source. Capture creates no mail and backfills nothing. Enqueue/claim/dispatch revalidate the source; accepted/read/expired invitations, membership replacement, opt-out, erasure and mailbox changes invalidate delivery. Emails link to the signed-in group list without names, invitation tokens or private content. Signed-in review is owner-scoped and paginated; opening mail or reviewing does not join a group. Sender erasure removes source metadata; owned exports omit invitation tokens.

The legacy saved-news worker now returns a truthful newsletter-policy block before database reads, outbox writes, delivery or cadence advancement. Existing saved searches and future alert preferences remain usable; the UI explains that delivery is unavailable.

Local verification: all 17 SQL suites passed with service-role Auth SELECT revoked; six concurrency scenarios passed; focused UI and Deno contracts passed. Eleven desktop, user-size and mobile captures received independent scoped UI ship review. PR #4585 deployed as 7ee4d162c3373174aa60559b8aaa058536237adb on 2026-10-23: all 12 required checks and 17,853 tests passed, backend/Pages deployment succeeded, migration 07766 and production service-role permissions/recipient directories were verified, and the live signed-in review matched the deployed build. No real test mail has been sent.


## Mailbox durability continuation (deployed PR #4697)

Personal mailbox sends previously marked provider acceptance as delivered and saved the sent copy only after sending. The correction atomically prepares an immutable outbox, private sender/request proof and queued sent copy. A lost-response retry reuses its request UUID and original payload; changed payloads conflict rather than creating an ambiguous resend. Only a currently owned mailbox can authorize submission. Owned reply metadata is validated, and receipt projection distinguishes queued, sending, accepted, deferred, uncertain and actual delivered states. Deleting a visible copy retains its send identity. Owner-scoped exports include outgoing payloads; sender erasure scrubs the linked outbox and copy without removing opaque anti-replay identities or unrelated recipient suppressions. No historical delivery claims are rewritten and no real test mail is sent.


PR #4697 deployed as 62928965aa08839531635945c896d76b35380e23 on 2026-10-23. All twelve required checks and 18,023 tests across 1,883 files passed. Backend, Pages and migration guard succeeded. Migration 99991792788296, source/RPC permissions, receipt/copy triggers, deployed handler and service-role read-only lookup were verified; the live frontend matched the merge commit. No real inbox test was sent.

## Mailbox receipt visibility continuation (deployed PR #4708)

The existing message header now reads canonical outgoing delivery status through an authenticated GET mode on the mailbox function. Only an owner/copy-bound private proof can produce a status. Legacy, foreign and absent proof reveal no delivery identity; reads never prepare, claim, finish or dispatch email, and private table permissions are unchanged. The reader rechecks status after copy updates/reconnects and polls pending, proven sends every thirty seconds while foregrounded. Query keys include the owner and copy; identity changes abort prior reads and discard their display. Failed refreshes retain a clearly labeled last verified receipt with a read-only recovery action. Inbound messages and drafts have no outgoing receipt controls. All eleven supported languages include the new labels.

Local evidence: ten handler tests and nineteen focused client tests passed, type checking introduced no errors, changed-file lint and locale parity passed. Nine scoped desktop, intermediate, mobile, RTL and narrow reflow captures were inspected. Status text measured at least 7.23:1 contrast; the refresh target is 44px high and keyboard focus is visible. Real mail was not sent. Protected CI and deployment remain pending for this continuation.


The receipt continuation also completes its arrival path: the Mail lens reads owner-scoped received and Sent metadata, excluding drafts, trash, archive and deleted copies. Cursor pagination preserves Postgres microseconds and UUID ordering. A successful compose/reply opens the canonical saved copy before the rail refreshes; valid owner mail deep links resolve outside the loaded page. Outgoing replies address the original recipient. Mail search stays within loaded mail metadata, with older pages reachable even when the current page has no match; the mixed incoming feed and unread RPC remain unchanged. The additive owner/date/id index supports this lookup without granting new access.

Final local evidence for this path: 34 focused client tests across ten files passed, including real compose/reader routing, outgoing reply recipients, account switching and pagination. All nineteen SQL suites and eight concurrency scenarios passed in disposable Postgres 17, including RLS and microsecond tie boundaries. Type checking reports 681 pre-existing errors and no new errors against the unchanged 782 baseline. Changed-file lint and all eleven public/source locale copies pass. The existing receipt states and the actual Sent rail/reader were reviewed at desktop and mobile sizes; synthetic browser compose opened its saved copy and read-only retry recovered the mailbox. Review fixtures perform no real delivery. Migration 99991792793842 remains unapplied until the protected release.


PR #4708 deployed as 3489ac55d3bc831399c78d8f642b4757a38eb81e. All twelve required checks passed, including 18,058 application tests; backend, Pages and migration guard succeeded. Migration 99991792793842 is applied. A scoped mailbox-function deployment and fresh source download verified the deployed handler after an initial CI/source discrepancy. The earlier local-only statements above describe historical checkpoints, not the current deployment state.

## Production operations continuation (2026-10-25, pre-release checkpoint)

The production audit found two native delivery events in the dead-letter queue. Original envelopes were preserved privately and replayed successfully into the authenticated receiver, with native event identities intact. The Worker had used `redirect: "error"`, which workerd rejects before network I/O. The repair uses manual redirects, retries every non-success response without following it, and normalizes decoded or JSON-text envelopes without double encoding. Status-only diagnostics disclose no recipient or event payload. A live drain remains a release verification step; replay alone does not establish that the queue consumer works.

Operations now reads native queue metrics through the existing authenticated gateway and admin-only backend. Queue reads cannot publish, consume, acknowledge or purge messages. Independent unavailable readings remain null; measured zero and unknown oldest age have distinct UI labels. No new migration, permission grant, delivery identity or promotional dispatch is introduced.

The final protected release and production verification record is maintained on [PR #4856](https://github.com/tmaeder/queer-guide-hub/pull/4856), including exact deployed versions, native-event recovery and the controlled owner-mailbox test. This section records the pre-release checkpoint; it does not infer later delivery outcomes.
