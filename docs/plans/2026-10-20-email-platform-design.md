# Integrated email platform

The user selected Cloudflare only on 2026-10-20 after review of the integrated backend scope. Keep the existing Supabase backend, admin identity, React Email block editor and published email branding. Cloudflare is the sole outbound email provider; do not introduce a marketing vendor or Resend fallback.

## Delivery

All application mail enters a durable Postgres outbox. Preserve the existing sendEmail contract, but throw on failure so callers cannot mark failed messages sent. Persist immutable per-recipient payloads, logical idempotency keys, attempt counts and delivery receipts. A restricted Worker uses the native Email Sending binding, which returns messageId for correlation. One Durable Object per message persists submission outcomes before returning; ambiguous outcomes are held for review rather than blindly resent. Internal/admin dispatch processes bounded batches with leased claims and explicit retries. Do not log message bodies or recipient addresses.

Cloudflare Queue event subscriptions forward native lifecycle events to an authenticated backend endpoint. Process events transactionally and idempotently; suppress hard bounces and complaints. Preserve terminal state across delayed/deferred events and retain events that race ahead of the send receipt.

## Subscribers and campaigns

Store members and non-member subscribers separately from profiles, with topic preferences, locale, subscription source and append-only consent events. Require proof of mailbox ownership before activation. Token endpoints store only hashes, use expiring single-use confirmation tokens, support one-click unsubscribe via POST, and render a confirmation form on GET so mail scanners cannot unsubscribe people. Members can manage their own preferences; admins can manage lists and inspect consent without inventing it.

Campaign drafts reference existing email templates, snapshot subject/HTML/text, store explicit audience criteria and desired schedule, and show eligible audience counts. No implicit enrollment of existing users. Do not segment on sensitive profile attributes. Admin email workspace shows campaigns, subscribers, suppressions and outbox status and links directly to the existing editor.

## Provider constraint

Cloudflare's FAQ checked on 2026-10-20 says Email Service supports transactional email only: https://developers.cloudflare.com/email-service/reference/faq/. Newsletter and marketing dispatch must therefore be explicitly blocked at API, database and transport boundaries. Drafting, audience management and consent remain available. Do not add an environment switch that misrepresents provider support. The original goal is not complete until Cloudflare supports the requested newsletter/marketing delivery or the user changes that constraint.

## Verification

Test idempotency, concurrent claims, uncertain submissions, stale leases, rate limits, consent/token ownership, unsubscribe replay, RLS and privilege boundaries, event replay/order, suppression and provider capability rejection. Run targeted frontend and backend tests, type checks, SQL execution against an isolated database and Worker dry run. Production deployment and actual mail delivery require configured sending domain, bindings, secrets and queue subscription. Current CLI discovery reports no sending subdomains; verify apex status separately before rollout.

## Expanded benchmark requirement

On 2026-10-20 the user additionally required analysis of Klaviyo, ActiveCampaign and Mailchimp and comparable strength integrated across Queer Guide. The inspected capability matrix and product-wide integration requirements are recorded in `docs/research/2026-10-20-email-platform-benchmark.md`. This expands the acceptance criteria: the delivery/consent foundation is not a completed marketing platform. Remaining work includes the event/identity spine, dynamic saved segments, durable journeys, shared eligibility/frequency rules, full content/personalization, experiments, reporting and domain adapters. Keep every missing capability visible and preserve the Cloudflare-only delivery limitation.

## Local verification notes

The branch has a dedicated `email-platform` CI workflow for Worker tests/types/dry-run, backend contracts and an isolated PostgreSQL migration/permission/consent/outbox suite. A production frontend build passed, the existing typecheck ratchet reported no new errors, targeted UI/redirect contracts passed, and desktop/mobile fixture renders had no overflow or browser errors. The existing real lazy-editor test initially timed out in a combined run; its complete seven-test file subsequently passed when isolated. These checks do not prove production sending, inbox placement, throughput, or parity with the benchmark platforms. See the research report for all remaining capability and integration gates.
Implementation decisions: explicit recipient account ownership; only verified linked subscription mailboxes and explicitly owned messages are included in account exports/erasure. Pending confirmation requests belong to their requesting account through a token-to-outbox reference. Account erasure scrubs bodies and addresses while retaining opaque message/idempotency/provider identities to block stale retries. A service-only hashed mailbox marker drops uncorrelated late provider events after erasure; new deliveries with known receipts can still receive events. This can lose an event arriving before a fresh receipt on a previously erased mailbox, so acceptance remains visible and reconciliation is required. Existing already submitted mail cannot be recalled. Account deletion and anonymization keep their existing authorization and call a shared erasure routine transactionally; direct auth deletion has a safety trigger. Export excludes subscription confirmation secrets. No behavioral tracking is introduced.


## Audience and timeline continuation

Reusable audiences use bounded, typed JSON rules with nested all/any/not groups over approved subscription traits and authoritative consent/delivery windows. Keep sensitive traits and browsing events unsupported. Save a new rule version on every edit and reject stale updates; previews recompute current data, eligibility and exclusion reasons. Contact timelines derive from existing consent/delivery records so erasure does not leave a copied event store. The admin API exposes these backend operations; visual builders, campaign binding and the general product-event/journey runtime remain required work. See `docs/architecture/email-audiences.md` for contracts and limits.

## Operational event continuation

A service-only event ledger captures account creation, username changes, RSVP changes, group join/leave and trip invitation/acceptance/leave from authoritative database writes in the same transaction. Restrict each event to its owner, opaque source ID and validated type/state; do not copy private source data. Include owned events in export and proof-linked timelines, and erase them through the existing disabled-account barrier and Auth cascade. Do not expose these operational membership events as marketing segmentation predicates or automatically enroll historic users. General journey consumption and the remaining product adapters are still outstanding. See `docs/architecture/email-lifecycle-events.md`.

## Durable journey continuation

Persist immutable journey versions, per-account/source/event re-entry identities, leased runs and step outcomes. Support a bounded acyclic graph of wait, username/profile branches, welcome and end. The initial email action reuses the existing transactional welcome renderer and canonical delivery identity; other promotional or domain email actions remain unsupported until their source/preference policies are implemented. Enrollment scans unmatched events rather than advancing a timestamp cursor, begins only after activation, and pins each run to its initial version. Pause holds persisted waits and linked outbox retries; archive cancels unfinished runs. Link welcome outbox creation and run eligibility atomically, and check that link again when claiming/submitting the message. Export and erasure cover runs and step history. No journey starts active by default or retroactively welcomes existing accounts.

## Activity delivery policy continuation

Separate the existing DM push permission from an explicit email digest opt-in, default disabled without inheriting consent. Keep essential account/service mail outside optional activity quiet hours and budgets. Store versioned delivery preferences and change history service-only; authenticate the settings endpoint and derive its owner from Auth. Revalidate current primary mailbox, unread notification, current conversation membership/mute/read state and current preferences on claim and immediately before dispatch. Hold quiet hours without spending attempts, use real time-zone conversion across DST, expire digest snapshots after 24 hours and reserve one possible digest per account per UTC day atomically before submission. Keep that reservation for ambiguous delivery and allow the same message identity to retry. Export/erase all new account-owned preference and reservation records. This first adapter covers DM digests only; general purpose classification and budgets across other product adapters remain work.

## Group mention continuation

Replace caller-authored group email with a post-mention adapter captured transactionally from actual group post writes. Keep group names, sender identity and content in the authenticated app. Require explicit independent group email opt-in at event time, preserve existing settings through older clients, and reuse shared quiet hours and a single daily activity reservation across DM and group mail. Pin original author/recipient memberships and validate current unread notification, source mention and bidirectional blocks on claim/dispatch. Canonical source identities survive mailbox/branding changes without resending. Default no backfill, quarantine unproved legacy group snapshots, and cover new sources in export/erasure. General posts/announcements/polls/comment/like/invitation emails remain unsupported until their own verified source and purpose policies exist.

## Trip invitation continuation

Add a verified existing-member trip invitation flow before sending invitation email. Derive actors from Auth, validate current accepted editor/actual-owner authority, pin original memberships and offered role, and require the recipient's explicit accept/decline on a signed-in review page. Keep trip details in the product; email uses a fixed generic review link and separate default-off opt-in captured at invitation time. Reuse shared quiet hours, daily activity reservations and immutable outbox identities. Guard pending membership role/identity/acceptance writes, serialize creation/response with erasure, retain a source-independent inviter admission counter, and integrate invite/revoke controls into trip sharing plus a Plans review link. Export/erase invitation metadata and counters. Raw legacy membership imports do not create email proof. Group source capture also acquires both parties' erasure barriers so it cannot recreate sender metadata after a concurrent scrub.


## Admin audience continuation — 2026-10-21

Connect saved audience definitions to the existing admin Email workspace using the established admin components. Provide typed nested rules and current consent/delivery previews, version-aware save/archive, preserved edits on failure, explicit conflict recovery and request revision guards. Keep unsaved audience edits across workspace tab changes. Display bounded definition/sample limits and exclusion evidence. Use the authorized admin API; do not enable campaign delivery or expose sensitive application traits. Campaign binding, journey editing and broader contact operations remain outstanding.

## Group invitation and saved-alert continuation — 2026-10-23

Continue the approved source-backed activity policy with registered-user group invitations. Capture a new invitation from its authoritative insert, only when the recipient has independently enabled the new `group_invitations` operational topic. Pin inviter membership and recipient/source identities. Link its existing unread group notification when that notification is inserted in the same invitation flow; arbitrary notification text does not establish proof. Do not backfill or send to free-text external invite addresses. Revalidate pending/unexpired invite, unchanged target/inviter/group, unread notification, active group, original inviter membership, recipient non-membership, both accounts' erasure barriers and blocks before enqueue and dispatch. A generic signed-in inbox link contains no invite token, group name or private content. Reuse operational outbox identity, quiet hours, daily reservations, export, erasure and retention.

Extend the current account email-preference list with one default-off checkbox, preserving existing topics and stale-version recovery. News saved-search digests must explicitly declare their newsletter purpose so the shared provider gate rejects them; they must not reach Cloudflare by inheriting the legacy transactional default. Saved search/query operations remain usable.

Group comment/reply delivery is excluded in this continuation: the current app has no comment producer or comment/read workflow beyond legacy tables. It needs an authoritative unread source and an explicit recipient scope before dispatch. Business-status delivery is also excluded until a verified owner/claimant source exists; listing email and merchant association cannot establish ownership. These exclusions do not imply full platform parity. Inbox delivery tests still require an expressly authorized mailbox.

Narrow UI direction contract for the invitation continuation:

- **THESIS:** A requested service email leads to an explicit, private review action; viewing never joins a group.
- **OWN-WORLD:** Preserve Queer Guide's existing paper/ink controls, shared typography and subway ground. This extends current operational surfaces; it introduces no replacement visual world.
- **STORY:** Choose the independent invitation opt-in in account settings; a source-backed invite may produce a generic notice; review the current invitation on the signed-in Groups page before choosing to join. Saved news searches remain usable while their delivery limitation is stated beside their preferences.
- **FIRST VIEWPORT:** The invitation section names its task, explains that viewing does not accept, and shows readable group names with explicit review links, or a clear loading/error/empty state. The settings continuation adds one ordinary checkbox; the saved-search popover states availability before the alert preference.
- **FORM:** Existing semantic sections, shared Button/LocalizedLink and labeled checkbox/switch controls. Bound review pages to twenty owner-scoped records, reflow long multilingual names, keep recovery controls visible, and preserve mobile touch targets. No new imagery or card system is needed.


## Mailbox durability correction — 2026-10-23

Apply the already-approved all-application-mail outbox and receipt contract to personal mailbox sends. The existing route currently sends before saving its copy, creates a fresh identity on retry, and labels provider acceptance as delivery. Correct this without changing mailbox composition or adding promotional dispatch.

Prepare the immutable outbox, private sender/request proof and queued sent copy in one transaction, with a client request UUID reused after a lost response. Derive the sender from its current claimed mailbox and Auth owner, reject changed payloads on replay, and permit reply metadata only from an owned parent. Recheck the sender's mailbox and erasure barrier before dispatch. Keep provider acceptance, deferral, uncertainty and actual delivery distinct; project canonical outbox transitions onto the sent copy, including events racing ahead of the receipt. Delete neither an outbox identity nor its proof when its visible sent copy is removed, so a retry cannot resend it. Do not backfill or relabel historical records with unproved receipts.

Extend owned export and sender erasure to the private proof and linked payload/copy, keeping opaque anti-replay identities. Preserve recipient suppressions and the Cloudflare-only transport. Save the request before transport and return its canonical identity even while delivery is pending. Existing composer feedback must say submitted or pending unless a real delivered event exists. Test atomic rollback, duplicate/concurrent requests, immutable replay, owned threading, source changes, event ordering, failed/uncertain delivery, deletion, permission boundaries and erasure without sending real mail.
