# Unified admin review queue audit

Date: 2026-10-12 (Europe/Zurich)
Status: design approved by the user on 2026-10-12; implementation in progress.

## Objective

One highly usable queue for every task requiring administrator approval or review. `/admin` becomes the review workspace. Existing governance and review URLs retain their meaning through redirects and queue filters. Review actions happen in the workspace, with specialized controls where decisions require additional inputs.

## Evidence

Live authenticated inspection of `/admin`, `/admin/governance?mode=engines`, `/admin/governance?mode=tags`, and triage on 2026-10-12:

- Overview reported 39,120 items; Engines reported 38,081; triage reported 2,144. These were observations at different moments, not an atomic snapshot. The source code confirms distinct populations and aggregations, so timing alone cannot reconcile their scope.
- Sensitive tags awaiting review are only visible after expanding a separate tag-governance panel, which displays the 50 most-used candidates rather than a full pending count.
- Engines contains review workflows alongside coverage metrics and automation throughput. Business adoption review, personality publication, and venue categorization use specialized panels.
- Triage already supports list/detail, inline corrections, queue-specific consequence labels, safety confirmation, and keyboard controls. Preserve working capabilities and unify the missing sources around this foundation.
- Current triage filters derive queue choices from destination routes, excluding sources reviewed elsewhere. Its count projection uses only a subset of review counts.
- The Overdue shortcut builds queue keys with overdue counts and passes those keys as a queue filter. It does not filter individual overdue rows.

Code inspected in `/Users/tobiasmaeder/queer-guide-hub/admin-menu-release`, clean worktree at `ee0f63d3d`; the shared `repo` checkout has extensive unrelated uncommitted changes and an older governance baseline.

## Source coverage required

| Decision family | Current evidence / owner | Unification requirement |
| --- | --- | --- |
| Staging, reports, submissions, CMS publication, automation flags | `useUnifiedTriageQueue`, `triage_action` | Preserve existing semantics and pending predicates |
| City, venue, village, marketplace, personality proposals | Registered quality sources and triage controls | Preserve evidence, consent, safety gates, and typed field editing |
| Editorial drafts, news quality, entity links | Registered triage sources | Keep actual publication/approval consequences visible |
| Duplicate candidates and merge decisions | `dedup-review`, `duplicates`, duplicate tools | Canonical record selection in detail; distinct workflows must not be conflated |
| Business adoption / links | `OrgLinkReviewQueue`, `useBusinessSpine` | Inline target selection and configured adoption decision rather than an external-console link |
| Sensitive tag visibility | `useSensitiveTagReview` | Full paginated population; retain both approve-and-index and reviewed-keep-hidden outcomes |
| Tag enrichment proposals | `TagSuggestionsReviewPanel`, search-intelligence suggestions API | Preserve apply-failure reporting and visibility consequences |
| Tag and vocabulary merges | `TagMergeReviewQueue` | Inline pair comparison and keep-distinct/merge semantics |
| Venue categories and non-venue classification | `useVenueReviewQueue` | Editable category, source evidence, and specific decision adapters |
| Personality publication | `usePersonalityFreigabe` | Include human-decision stage; do not count automated ready-for-publication or already-public stages as pending reviews |
| Event quality issues | `EventQualityIssuesPanel` | Preserve severity, evidence, correction path, resolved/accepted outcomes, and audit notes |
| Closure / existence | `useExistenceEngine` | Pending archive decisions only; retain alive/dead evidence and reversible archive behavior |
| Group join requests | `PendingJoinRequestsPanel` | Preserve membership decision authorization and outcomes |
| Brand ownership | `BrandReviewQueue` | Preserve trust and evidence requirements and sensitive confirmation |
| Geography conflicts | `AdminGeography` review status and verification workspace | Expose actionable records and typed corrections while preserving verification checks |
| Feedback requiring admin review | `review_feedback`, feedback controller | Bring review decisions into the queue; keep ordinary staff communication in its mailbox |
| Glossary and other content publication gates | `quality_glossary` and content workflows | Inventory actual pending decisions before implementation; a quality score alone is insufficient to create a review task |

The source inventory is code evidence, not proof of live database contents. Implementation must verify current schema, source predicates, roles, and decision endpoints before adding adapters. Search remaining producers and administrative action surfaces for additional pending sources; this table is the baseline rather than a hard-coded ceiling.

## Proposed UX

- A single Review queue in navigation and at `/admin`, with one matching total from the same authorized pending population as the list.
- Search plus optional filters for decision family, content type, risk, overdue state, and source. Defaults proposed: urgent/high-risk first, then oldest; user preference question remains unanswered.
- Desktop list/detail workspace with stable action bar; mobile list followed by a focused detail view with a clear return path. URL-backed selection and filters restore review context.
- Rows explain what needs deciding, why, affected entity, source, risk, and age. Detail shows current versus proposed values, evidence, editable inputs, and the action's consequences.
- Specialized decision controls remain inline rather than sending the reviewer to a separate queue.
- Auto-advance only after confirmed success. Keep failed items visible with retryable errors. Handle stale decisions made by another reviewer truthfully.
- Bulk actions only for compatible workflows allowed by their capabilities; confidence alone must not bypass human gates. Undo appears only for supported reversible decisions.
- Engine coverage, automated throughput, recent decisions, and maintenance operations become secondary diagnostics rather than competing review homes.

## Implementation invariants and completion evidence

1. Every discovered pending producer has a registered list adapter, count predicate, detail renderer, action adapter, and role policy. Coverage is verified against current database/schema and code.
2. Queue totals, filtered totals, badges, pagination, and overdue totals match the authorized list population; counts are not sums of truncated samples.
3. Identity is unique per decision source and source record, not solely an entity UUID. Distinct decisions for the same entity remain independently selectable; duplicate exposure of one decision is eliminated.
4. Each workflow preserves its source semantics, confirmation requirements, required inputs, auditing, and any existing recovery capability.
5. Legacy review URLs reach the unified workspace with meaningful filters/selection; engine diagnostics have a separate secondary destination.
6. All actions are usable on desktop/mobile and by keyboard; loading, empty, partial-source failure, mutation failure, and concurrent-review states are verified.
7. Regression tests verify the unfiltered source union, role boundaries, actual item-level overdue filtering, count/list parity, specialized decisions, and legacy routes. Browser verification covers populated, empty/error, and responsive states.
8. Completion requires verified implementation of the full objective. A shared navigation link or embedded collection of old queues is insufficient.

## Alternatives considered

Link consolidation is smaller but leaves fragmented review workflows. Combining all old panels on one page is faster to assemble but creates multiple competing queues and poor scanning. Recommended: one shared queue with source-specific detail and decision adapters.

## Pending decision

The user explicitly approved the proposed unified Review queue design with “approval” on 2026-10-12. Default ordering uses urgent/high-risk first, then oldest.

## Implemented contract and validation

The canonical workspace is `/admin`; legacy governance modes, inbox, review,
quality, event-quality, closure, and group-request links resolve to its filters.
Forty-one registered decision sources share a role-aware list, item-level risk
and overdue filtering, stable pagination, and a common summary for sidebar and
header. Special decisions render inside the workspace; search enrichment and
brand ownership launch it rather than keeping independent approval screens.

Automatic first-check and logo-lookup checkpoints remain diagnostic. Canonical
staging and ownership decisions replace duplicate ledger exposure. Closed or
missing canonical records do not generate another corrective review task.
Bookmarked pending items resolve independently of the current page.

Validation: 179 focused frontend tests; lint; the repository typecheck ratchet
(no new errors); production build and bundle-shape checks; SQL syntax and live
source queries; rolled-back database tests covering role/visibility boundaries,
confirmation, stale decisions, brand claims, atomic staging batches, supported
undo, critical event exceptions, and audit recording. Fixture rows were confirmed
absent after rollback. The Impeccable detector reported no findings. Desktop and
mobile visual inspection used the actual components with a read-only live-data
snapshot; mobile detail focuses the item while hiding the list filters.

Database migration filenames match the versions recorded in production history.
