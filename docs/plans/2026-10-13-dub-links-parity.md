# Redirects: Dub Links feature parity

Objective: analyze https://dub.co/links and implement the same capabilities in
Redirects. This ledger preserves the full scope. A feature is complete only
after schema, server behavior, UI/API, tests, and applicable runtime evidence
exist. Existing local tools are a foundation, not proof of parity or deployment.

## Requirements and evidence ledger

| Requirement          | Required behavior / evidence                                                                                       | Current state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branded links        | Custom slug, random slug, editable destination; shorten arbitrary public HTTP(S) URLs                              | Candidate: public HTTP(S) destinations, random slug UI and server allocation; private/local targets rejected; hostname namespaces and signed branded routing implemented locally, pending controlled release                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| UTM builder          | Source/medium/campaign/term/content/referral; preserve queries/fragments                                           | Candidate: six campaign fields including referral; query/fragment preservation tested                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Shared UTM templates | Named workspace templates, apply/save/edit/delete in builder/settings                                              | Candidate: implemented locally; pending release                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Folders              | Create/rename/delete/move links, folder-filtered list and analytics                                                | Candidate: implemented locally; pending release                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Tags                 | Multiple colored tags, create/rename/delete, shareable filtered list and analytics                                 | Candidate: implemented locally; pending release                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Comments             | Team-visible comment on link card, clickable hyperlinks                                                            | Candidate: implemented locally; pending release                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Folder permissions   | Explicit view/edit permissions for team members, enforced in database/API                                          | Partial: member/machine bindings, folder defaults/overrides, scoped SQL/API, admin editors and member workspace; access request/review/inbox/email queue implemented locally; all-source semantics and delivery/runtime release pending                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Bulk actions         | Create/update/upsert/delete, folder/tag assignment, archive, import/export, QR export                              | Candidate for managed links: atomic create/update/upsert/deletion API and CSV review/import/export UI, archive/restore, folder/tag assignment and verified QR ZIP; production release pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Custom previews      | Uploaded OG image (1200×630, ≤1.5 MB), title≤120, description≤240, video API, crawler unfurl                       | Candidate: editor, scoped upload/presentation APIs and crawler HTML; native browser/Storage release pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| AI previews          | Generate title/description from destination content using configured AI provider                                   | Candidate: scoped draft generator with spend limits; live provider and browser verification pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Custom domains       | Verify ownership/DNS, multiple domains, primary domain, redirects on branded hostname                              | Partial: private registry, exact DNS verification, owner UI and stored defaults implemented locally; durable Cloudflare lifecycle/TLS checks implemented locally; hostname namespaces, signed relay/resolver, routing health, background proof renewal and inventory/CSV/QR/API/SDK fields implemented locally; ready choices, owner primary preference and tracked/member builders implemented locally; active manual CMS domain field and atomic owner saves implemented locally; URL domain filters and scoped linked-domain facets implemented locally; explicit provider validation restart implemented locally; real provider proof and release pending |
| Domain defaults      | Root/not-found redirects, default expiration URL, workspace/domain QR logos                                        | Partial: root/not-found/expiry settings, signed-host resolver and managed root-link policies/metadata/tracking implemented locally; QR/logo precedence and release pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Deep links           | iOS/Android association files, app page routes, fallback and deferred attribution                                  | Partial: owner-managed app identities, per-host association files and gateway behavior implemented locally; policy-aware native resolver and local Swift/Android clients implemented; deferred attribution and real device/release evidence remain open                                                                                                                                                                                                                                                                                                                                                                                                       |
| Geo targeting        | Country-specific destinations and default fallback                                                                 | Candidate: country rules and fallback tested                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Device targeting     | iOS/Android destinations, evaluated before geo                                                                     | Candidate: iOS/Android priority tested                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| A/B testing          | 2–5 destinations, weighted traffic≥10%, end date≤6 weeks, manual winner/end                                        | Candidate: editor/resolver implemented locally                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| A/B completion       | Device→geo→experiment priority; choose winner by sales/conversions, rates, clicks; leads fallback                  | Candidate: selection/metrics now fed by verified native and scoped server conversion ingestion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Password links       | Password challenge, hashed secret, no disclosure/bypass, scoped access                                             | Candidate: hashed protection, atomic throttling, signed IP relay and versioned controlled password-page branding; live release pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Expiration           | Date and expired destination URL, live enforcement without stale cached rules                                      | Candidate: date/phrase parser, custom fallback and live enforcement tested                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Link cloaking        | Explicit iframe mode with accurate iframe limitations, standard redirect fallback                                  | Candidate: HTTPS guarded iframe wrapper and persistent direct fallback; runtime release pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Branded QR           | Dots square/circle/joined; marker center square/circle; border square/rounded/circle; colors                       | Partial: dot/marker/color controls, saved workspace/domain appearance and logos, scoped individual/bulk defaults and scan verification implemented locally; hosted-image publication/copy/revoke UI and five SDKs implemented locally; release pending                                                                                                                                                                                                                                                                                                                                                                                                        |
| QR logos/export      | Workspace/domain/logo precedence and hide; SVG/PNG/JPG; clipboard image and image URL                              | Partial: saved/local logos, PNG/JPG/SVG and clipboard exports, durable logo assets/editor/cleanup implemented locally; server image-rendering service implemented locally; revocable live hosted-image profiles and five-SDK methods implemented locally; per-image custom artwork and publication/copy/revoke UI implemented locally; release pending                                                                                                                                                                                                                                                                                                        |
| Click analytics      | Real-time totals/time series, custom date/filter/export, countries/cities/devices/browsers/OS/referrers            | Candidate: SQL totals/time series, date/dimension filters, export and bounded live refresh; release pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Conversion tracking  | Click attribution, leads/signup/sale/revenue, trusted conversion ingestion and application hooks                   | Candidate: scoped ingestion, consented signup and verified Stripe hooks implemented locally                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Customer insights    | Customer journey across click→lead→sale with private event timeline                                                | Candidate: private versioned name/email/avatar enrichment, scoped chronological journey API/UI and five SDKs implemented locally; production release pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Live events          | Paginated live click/lead/sale stream, real events rather than demo data                                           | Candidate: private click/lead/sale activity with keyset pages and five-second refresh                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Shared dashboards    | Revocable scoped sharing, sanitized aggregate-only default                                                         | Candidate: saved snapshots, explicit dynamic folders, password/expiry/revoke, aggregate-only UI, date selection and live opt-in indexing implemented locally; runtime release pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Custom reports       | Custom dates, granular link/folder/tag/domain/geo/device/event filters                                             | Partial: date/dimension report UI/API, personal saved definitions and scoped sharing implemented locally; team discovery and runtime release pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Integrations         | Segment and GTM adapters; native configured integrations and provider callbacks                                    | Partial: native Segment/GTM artifacts and setup, privacy/consent gates and actual conversion/outbox handler fixtures pass; provider installation/runtime evidence pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| REST API             | Authenticated/scoped link CRUD/upsert/count/list, analytics/events, folders/tags, bulk operations                  | Partial: scoped link CRUD/upsert/count/list/mixed bulk, conversions and analytics/events; folder/tag/template resource CRUD with workspace scopes; scoped targeting/password/tracking/preview policy endpoints; domain fields/filter/canonical URLs implemented locally; deep-link fields and release pending                                                                                                                                                                                                                                                                                                                                                 |
| SDKs                 | TypeScript, Python, Go, Ruby, PHP wrappers and runnable examples covering management/tracking                      | Candidate: five native clients verified through actual HTTP handler and isolated DB; publication/release pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Webhooks             | Signed link create/update/delete/click and lead/sale events, retries, delivery history, replay and secret rotation | Candidate: durable signed outbox/dispatcher, management/history/replay/rotation UI and five receiver SDKs tested locally; live cron/transport/provider release pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Primary references

- [Product feature list](https://dub.co/links)
- [UTM templates](https://dub.co/help/article/how-to-create-utm-templates)
- [Tags](https://dub.co/help/article/how-to-use-tags)
- [Custom previews](https://dub.co/help/article/custom-link-previews)
- [QR customization](https://dub.co/help/article/custom-qr-codes)
- [Device priority](https://dub.co/help/article/device-targeting)
- [A/B rules and winner selection](https://dub.co/help/article/ab-testing)
- [Comments](https://dub.co/help/article/link-comments)
- [Public dashboards and sharing controls](https://dub.co/help/article/share-analytics)

## Implementation order

1. Durable shared templates, folders/tags, and comments for managed links and
   automatic/static inventory records using stable resource keys.
2. Link policies and resolver: public destinations, live expiry, password,
   targeting/experiments, previews/cloaking, deep links and domains.
3. Brand QR options and reusable link settings; folder permissions and bulk tools.
4. Attributed clicks/conversions, customer journeys, live reports and sharing.
5. Authenticated API/SDKs/webhooks/integrations and deployment verification.

Keep work on `feature/redirects-dub-parity`; the existing combined release has a
different owner. Do not push to its integration branch or merge this work into
it while that release is validating. External provider/domain configuration
must be evidenced; unconfigured adapters are not marked fully achieved.

## Checkpoint: workspace foundation

Implemented candidate on `feature/redirects-dub-parity`:

- Shared template CRUD and application, including referral tags and replacement
  of previous UTM values without disturbing destination queries/fragments.
- Folder/tag CRUD, multi-tag assignment, URL folder/tag filters, colored badges,
  private comments with clickable HTTP hyperlinks, and inheritance when creating
  a new campaign from an existing rule or active folder.
- Stable semantic inventory IDs for static/client aliases across source edits.
- Admin-scoped database policies and an atomic campaign-create/assignment RPC.

Evidence: `supabase/tests/redirect_link_workspace.sql` passed with schema and
fixtures rolled back, including denied ordinary-member reads/writes, unknown-tag
rollback, duplicate-tag normalization, invalid template rejection, and FK delete
behavior. Workspace/creation/list tests pass; targeted lint and formatting pass;
frontend build passes; typecheck has no new errors after matching the inherited
release's dependency tree. Desktop/mobile screenshots under
`outputs/redirect-dub-parity/` use explicitly labelled preview fixtures. No
production schema or source integration branch has been modified for this phase.

This is not completion of the overall objective. Folder permissions, filtered
analytics, bulk operations and all other missing ledger requirements remain.
Next: link policy schema/resolver and UI for public destinations, targeting,
experiments, password/expiry, previews, domains and deep links; then analytics,
conversion ingestion, API/SDK/webhooks and release verification.

## Checkpoint: targeting and access policies

Implemented locally: arbitrary public HTTP(S) destination validation; live iOS/Android
and country routing; weighted 2–5 variant experiments with six-week deadlines,
manual winner/end and automatic conversion/click-based selection; password
challenge with salted PBKDF2-SHA256 hashes; natural-language expiration entry
and optional expired destination. HEAD requests do not count. Password query
values are stripped before destination/event storage. Protected destinations
are no longer exposed by the legacy public Data API policy or resolver RPC.

A service-only atomic visit RPC checks active windows and quotas before increment
and event insertion. Variant metrics avoid click inflation when multiple
conversions join one click. Conversion storage is a foundation; no conversion
ingestion or customer-journey feature is claimed yet.

Evidence: 60 policy/resolver/editor/validation/proxy/expiration/authorization
tests passed. The actual admin edge handler denies absent/invalid identity and
non-admin roles, and sends hashes rather than passwords to privileged storage.
`npm run test:redirect-sql` runs the workspace/policy migrations and RLS, atomic
creation, quota, expiry and metrics SQL tests in isolated PGlite PostgreSQL.
Frontend and Cloudflare proxy builds passed; typecheck reported no new errors;
migration-version validation passed against the integration base. Desktop/mobile
policy screenshots use fixtures, not a production account.

No production schema was changed. These are release candidates, not live parity.
Password attempt throttling, branded password pages, custom previews/cloaking,
custom domains/deep links and all other unimplemented ledger items remain.

## Checkpoint: branded QR exports

Implemented locally: square/circle/joined dots; square/rounded/circle marker
borders; square/circle centers; custom dark/light colors; optional PNG/JPG
logo with size limits/removal; 1024px PNG/JPG and scalable SVG downloads;
clipboard image and image data URL. Rendering preserves reserved QR positioning
and timing modules, four-module quiet space and high error correction.

Every export is generated locally. It tries standard QR masks and decodes the
actual PNG pixels and compressed JPG before enabling exports. Low-contrast,
inverted, unsafe image markup and unverified outputs expose an error. No stale
preview/export remains available when a new style is invalid. A data URL is
labelled accurately; no public hosted image URL is claimed.

Evidence: 25 QR/link-builder tests passed, including all 18 style combinations
with exact payload recovery from PNG and JPG, logo-bearing codes, invalid
styles and correct export formats/filenames. Targeted lint passed. Desktop and
mobile fixture screenshots are in `outputs/redirect-dub-parity/qr-styled-*.jpg`.
Browser clipboard actions showed success, and the browser-generated styled PNG
was independently decoded to the exact tracked URL. Native download completion
is not observable in this browser; export handlers/formats are tested.

Workspace/domain defaults, persistent per-link QR branding and hosted image
URLs remain outstanding. This is still local development, not deployment or
completion of the broader parity objective.

## Checkpoint: conversion ingestion and native application hooks

Implemented locally: optional recorded click IDs on destination URLs; scoped,
expiring/revocable server credentials with private hashes; trusted lead/sale
ingestion, stable event-ID retries/conflicts, direct sale and customer-anchor
attribution; native confirmed signup validation and existing analytics-consent
gating; native Stripe paid checkout/async completion/renewal attribution using
verified signatures and stable purchase IDs. The donation FK preserves the
financial ledger when a campaign is deleted.

Private cohort reports now show lead/sale/customer totals and per-currency
revenue, using exact PostgreSQL decimal strings and integer accumulation.
Customer journeys are cross-link, chronological and keyset-paginated; historical
paths survive slug edits. Conversion data feeds the existing experiment metrics.
Admin setup supports one-time secret copying and selected-link scope/revocation.

Evidence: 42 focused tests across 13 files passed; the SQL suite passed against
isolated PGlite. `test:redirect-stripe` executes the actual webhook source with
genuine Stripe signature verification and WebCrypto, then writes into the
isolated database, proving paid-only revenue, retry deduplication, renewal
attribution and A/B metrics. It creates no payments or provider requests.
Typecheck has no new errors. Frontend/proxy builds and targeted lint passed;
final checks are recorded in `tmp/conversion-*`. Fixture screenshots are in
`outputs/redirect-dub-parity/conversion-*.jpg`.

See `docs/guides/redirect-conversions.md` for setup, contracts, units, retry rules
and remaining limitations. Production migration/provider/browser delivery is
not verified. This does not complete the full parity objective: identity
enrichment, advanced/live/shared reports, full API/SDK/webhooks/integrations,
domains/deep links/previews/cloaking, folder RBAC/bulk tools and persistent QR
branding still require implementation and release evidence.

## Checkpoint: detailed analytics and event activity

Implemented locally: bounded visitor family classification and Cloudflare city/
region/continent relay; QR visit markers; invoker/RLS analytics views and SQL
aggregation; UTC zero-filled time series; link/folder/tag/date/event/location/
device/browser/OS/domain/referrer/variant/QR filters; exact per-currency revenue;
receipt-time keyset event pages; complete matching-event CSV export; optional
five-second live polling; read-only or combined scoped credentials and read API.

The dashboard opens on results, with expandable filters, usable mobile layout,
and chart patterns/point tooltips. Reports expose normalized dimensions without
raw queries, agents, IP hashes or password fields. Earlier metadata is honestly
Unknown. Scoped read restrictions intersect user filters.

Evidence: analytics SQL tests passed in isolated PostgreSQL, including real
report calls, UTC zero buckets, folder/tag intersections, scope boundaries,
paging, exact revenue, referrer redaction and ordinary-user RLS. 25 focused tests
passed across seven files; UI filter tests also passed after the responsive
change. Native signed-Stripe regression, frontend/proxy builds, migration gates,
targeted lint and typecheck (no new errors) passed. Screenshots under
`outputs/redirect-dub-parity/analytics-*.jpg` use labelled fixtures.

`docs/guides/redirect-analytics.md` documents endpoints, filters, UTC semantics,
heuristics, limits and remaining scope. No production schema was mutated. This
is another candidate checkpoint, not completion of the full parity objective.

## Checkpoint: password attempt throttling

Implemented locally: atomic service-only reservations before password hashing;
10 attempts per link/client hash and 1,000 per link in a 15-minute window;
bounded counters and lazy retention cleanup; no-count HEAD/empty GET challenge;
fail-closed unavailable limiter; destination-free 429 challenge with Retry-After
preserved by the branded proxy. Successful checks consume the same budget.

An optional shared REDIRECT_RELAY_SECRET signs the visitor IP, slug and timestamp
between Pages and the resolver. Without valid recent proof, only the upstream
CDN address is used; arbitrary X-Forwarded-For is ignored. Deployments must
configure the matching secret to distinguish visitors behind the Pages relay.
Without it, relay visitors may share a conservative bucket.

Evidence: 19 policy/resolver/relay/proxy tests and isolated PostgreSQL suite passed for
limits, independent clients, resets, global budget, retention, private access,
invalid hashes, signed forwarding/tampering and retry behavior. Native Stripe
regression, proxy compilation, targeted lint and migration-version validation
passed; typecheck reports no new errors (704 inherited). Production
migration and matching relay-secret setup remain pending. Password-page logo
customization and the other remaining parity requirements are still outstanding.

## Checkpoint: scoped link management API

Implemented locally: managed short-link create/get/update/delete/upsert/list/count,
atomic mixed bulk operations, random slug allocation and generator UI, partial
organization/query/expiry updates, and separate link read/write credential scopes.
Selected-link scope is rechecked in SQL with expiry/revocation; creating new links
requires unrestricted scope. Verified admin sessions supply actor identity; API
keys use the verified credential owner. New destinations use the existing public
URL validation and deny short-link loops. Read projections exclude secret fields.

Actual SQL tests cover scopes, revocation, invalid-assignment and denied-late-batch
rollback, stable upserts, preserved metadata, expiry clearing, deletion cascades,
preserved donation ledger, and keyset pagination/count across 1,101 links. Typed
query/type fixture enums match the production baseline for these operations.
`docs/guides/redirect-link-management-api.md` records the API contract and limits.

This remains a candidate checkpoint. Resource folder/tag REST, policy/password/
preview/domain/deep-link API fields, SDK wrappers, archive/bulk UI/QR exports,
webhooks, integrations and production release evidence remain in the full scope.

Checkpoint validation: 34 focused tests passed across five files. Isolated SQL
and genuine signed-Stripe regression passed. Frontend/proxy builds, migration
versions and targeted lint passed. Browser fixture screenshots of desktop/mobile
credential setup are under `outputs/redirect-dub-parity/link-management-setup-*.jpg`;
no credential was created or revoked in that browser check. The setup now shows
examples matching management-only permissions and collapses the conversion guide.
Typecheck also passed its no-new-errors gate (704 inherited errors).

## Checkpoint: workspace API and five server SDKs

Implemented locally: folder/tag/template create/detail/list/patch/delete,
independent workspace read/write scopes, unrestricted-key enforcement at issuance
and SQL execution, and scope-specific request examples. Selected-link credentials
cannot edit/read shared organization. Existing link metadata survives resource
edits; deleting resources clears assignments without deleting managed links.

Five SDK sources and runnable examples cover management, shared resources,
tracking, analytics and event pages. Clients use timeouts, bounded responses,
redirect refusal, exact string revenue and explicit HTTP errors. No automatic
mutation retry occurs. `test:redirect-sdks` exercises each language through native
HTTP into the actual edge handler and migrated isolated PostgreSQL, not a mock
request recorder. The suite includes deduplicated conversions, 101-row keyset
iteration, shared resource round trips, partial edits, upserts and deletion.

Docs: `sdk/redirects/README.md` and `docs/guides/redirect-workspace-api.md`.
Package publication, production migration/deployment, remaining API policy fields,
folder-member permissions and all outstanding full-parity features remain pending.

Verification: all five native SDK tests and all five runnable examples passed
against the actual handler/database over loopback HTTP. Exact SDK revenue and
example revenue SQL totals passed. The resource SQL suite also verifies two-page
lists/counts, scope/revocation denial, partial updates and assignment cleanup.
28 focused API/input/UI tests passed; standalone SDK TypeScript declarations,
frontend/proxy builds, targeted lint and migration-version validation passed.
App typecheck has no new errors (704 inherited). The attempted native-browser
preview timed out, so browser verification of the new workspace permission
controls remains unproven; component tests and builds are the available evidence.

## Checkpoint: custom previews and framed destinations

Implemented locally: preview title/description/image/video controls, prepared raster
uploads, scoped presentation/upload APIs, metadata HTML for social unfurl agents,
and optional sandboxed frames with a direct fallback. Password checks precede
preview disclosure; crawler metadata is not a counted visit. Frame requests carry
one recorded click and conversion attribution. HTTPS guards cover active targets,
device/geo/experiment rules and later destination edits. Existing protection,
expiry and tracking survive presentation updates. Upload assets remain public;
removing a preview removes its reference, not previously published artwork.

27 focused resolver/API/editor/media tests passed. Isolated SQL tests verify scopes,
protected settings preservation, HTTPS guards and restrictive Storage policies.
All five SDKs exercise new presentation and encoded-image methods against actual
source handlers and SQL; Storage uses a fixture adapter. Native browser preview
and actual Supabase Storage upload/download verification remain outstanding,
along with production migrations/release and AI generation.

See `docs/guides/redirect-presentations.md` for behavior, scope and exact limits.
This does not complete overall parity: every missing/partial ledger row remains.

Final checkpoint checks: nine existing policy/save authorization tests also passed
(36 focused tests total). Five native SDK clients and examples, isolated SQL,
genuine signed-Stripe regression, frontend/proxy builds, SDK declarations,
targeted lint and migration-version gate passed. App typecheck reports no new
errors (704 inherited). No production bucket, schema or deployment was changed.

## Checkpoint: AI preview drafts

Implemented locally: authenticated/scoped `preview-generate` endpoint and editor
button producing reviewable title/description drafts from the saved destination's
public page content, via configured Firecrawl and the shared AI client. Generation
does not save policy or artwork. SQL spend reservations enforce global, actor,
and link hourly limits, including failed calls. Direct destination fetches are
avoided; external scraping network isolation belongs to the provider. Input,
content-response, prompt, and generated JSON limits are enforced. Configuration
and upstream failures preserve manual text. See the presentation guide for setup
and privacy details.

Local proof: helper and editor tests, actual edge-source authorization/revocation/
rate-limit tests, and migrated PostgreSQL reservations. Live provider delivery,
browser rendering, production migrations, and release remain outstanding. Other
open parity requirements above remain in scope; this checkpoint does not close
the full project.

## Checkpoint: archive and selected bulk management

Implemented locally: selection across inventory pages (100-row cap), active/
archived/all views, atomic archive/restore and folder/tag changes across manual,
automatic, static, and client inventory. Archive is organization metadata; it
preserves routing and enabled state. Adding/removing one tag retains other tags
and comments. Managed short-link deletion requires a concrete selected-link list
and typed DELETE confirmation, then uses the existing atomic scoped API. Source-
owned automatic/static rules cannot be deleted through this bulk UI. Selected
CSV export and clearing selection are available.

API link objects/patches/filters accept boolean `isArchived`; the API's default
list remains all managed links, and callers can explicitly request active or
archived records. The TypeScript SDK includes the archive field; other clients
use their existing object dictionaries. SQL rechecks scope and authorization;
ordinary members cannot change archive metadata. Failed batches roll back and
UI errors retain selection. Production migration, native browser evidence,
bulk QR export and the remaining richer import/upsert UI remain outstanding.

Validation for this checkpoint: 43 focused tests across API input/handler,
organization, selected bulk controls, and inventory views passed. Migrated
PostgreSQL tests prove authorization, archive filtering, retained routing state,
metadata preservation and rollback. Five SDK clients and their examples passed
through the actual HTTP handler and isolated SQL again. Lint and migration-version
gates pass; typecheck remains at 704 inherited errors with none new. Production
build passes. These checks do not prove native browser or production behavior.

## Checkpoint: selected QR bundles

Implemented locally: bulk QR export for 1–100 selected concrete source URLs in
PNG, JPG, SVG, or all formats, with common branded style/logo controls shared with
the single-code dialog. A prepared ZIP is offered only after every code passes
actual raster scan verification; unique safe filenames and an ID/source/encoded
URL/file manifest are included. Managed /go/ URLs carry the QR attribution marker.
Wildcard/template routes cannot be exported as concrete codes. Any code failure
rejects the whole bundle and identifies its source. Payload and final ZIP are
bounded to 64 MB. Closing/cancelling aborts between image steps; cancellation
during JSZip packaging discards the result after bounded packaging completes.
Changing format/style invalidates a prepared ZIP; logo loading disables preparing
until the upload is decoded. Exports are local and make no network requests.

Local evidence: real production generator and decoder run using a Sharp raster
canvas adapter, all archived SVG/PNG/JPG images decode correctly, and Python's
standard ZIP reader confirms filenames/count and CRC integrity. This is actual
artifact verification, not native-browser evidence. UI tests cover ready/download,
format/style invalidation, verification failures and cancellation, and single-code
export regressions. Persistent workspace/domain/link style/logo precedence,
hosted image URLs and production release remain open.

Native browser follow-up for this checkpoint: the local fixture at
`/tmp/bulk-qr-preview.html` renders the real dialog with two example URLs and
makes no production reads/writes. Codex IAB generated joined dots/rounded borders/
circle centers in all three formats, completed the ZIP download, and generated
again at a 390×844 mobile breakpoint. The downloaded file contains six scannable
SVG/PNG/JPG files plus the manifest; all exact fixture URLs and CRCs passed both
JSZip/Sharp/jsQR inspection and an independent Python ZIP reader. Desktop/mobile
screenshots and the downloaded fixture ZIP are under the workspace's
`outputs/redirect-dub-parity/bulk-qr-*`. The temporary tab was closed and viewport
reset. This proves local native-browser export, not live redirect attribution or
production deployment. 32 focused tests, lint, production build and typecheck
ratchet (704 inherited errors, none new) pass.

## Checkpoint: managed CSV review, upsert and export

Implemented locally: primary Import workflow offers create/update-by-ID/upsert-by-
slug, pasted or uploaded CSV, a review of exact normalized values and one atomic
Apply. Supported management fields round trip via the scoped selected-ID CSV
export. Quoted commas/newlines/quotes, BOM/CRLF, typed JSON, explicit null/empty
array clearing, duplicate identities and closed headers are handled. Empty cells
omit changes. Spreadsheet-safe commentJson preserves comments exactly. The bulk
API payload bound is now 2.1 MB, matching the import size bound; ordinary single-
link writes remain at 64 KB. Real 100-row requests above 64 KB are tested. The
existing path importer is retained with the quoted parser and stronger validation;
its row-by-row results remain explicit, not claimed as atomic upsert.

Evidence: 36 focused tests in four files plus the four managed-dialog tests passed
(the dialog worker was retried alone after a startup timeout under resource
contention). Actual CSV source → migrated PostgreSQL proves create/upsert/update,
metadata preservation, all supported CSV field round trips, transaction rollback
and revoked-token rejection. Lint, production build and the typecheck ratchet
(704 inherited errors, none new) pass. No new database migration is required.

Native browser proof uses a local fixture that blocks production fetches and
simulates Apply receipts. Quoted two-row upsert review, exact expandable values,
success/duplicate-submit states and real template download were verified. Python's
CSV reader confirms the downloaded template. Desktop/mobile screenshots are under
`outputs/redirect-dub-parity/managed-import-*`. The 390-pixel mobile dialog has
scrollWidth=clientWidth=390; only the 340-pixel review region scrolls to hold its
576-pixel table. Viewport was reset and temporary tab closed. Production API
import/export and remaining policy/domain/permissions/report/integration work
remain outstanding; the complete goal remains active.

## Checkpoint: scoped policy API and five SDKs

Implemented locally: GET/PATCH managed-link policy endpoints with links:read/write
and selected-link scope enforcement, partial top-level atomic merge/null removal,
expiry synchronization, password set/remove/flag-only responses and bounded hash
reservations. The existing admin writer now shares the row-lock order used by
presentation and policy writers. Merged framing rules retain their HTTPS guard.
The policy validator rejects malformed/falsy dates/maps/experiments and unknown
nested A/B fields. All five SDKs expose policy methods; TypeScript exports policy
DTO/nullable-patch types. The branded proxy preserves Retry-After.

Evidence: actual migrated SQL proves scope/revocation, preserved fields/passwords,
explicit clearing, failed-expiry rollback and independent password budgets. Native
clients exercise the real HTTP edge handler/SQL, set/remove protection, verify
stored hashes using the real PBKDF2 verifier and preserve other settings. Target
selection remains unchanged; its regression checks accompany validator changes.
See the policy API guide for the wire contract and limits. Production migrations,
release, domain/deep-link API fields and other ledger requirements remain open.

Final validation for this checkpoint: 42 API/save/proxy tests and 31 policy/
resolver/validation regressions pass, including revocation after password work
and malformed experiment weights without incidental coercion exceptions. All
five SDK clients and examples pass via real loopback HTTP and migrated SQL;
stored hashes verify with the real password verifier. SQL includes expiry-failure
rollback and independent actor/link/global budget checks. Build, lint, SDK types,
and migration versions pass. App typecheck remains 704 inherited errors, none
new. Pages production/test types now have separate configurations; the existing
`typecheck:functions` gate runs both so test coverage is retained. No production
migration/provider changes or package publication were performed.

## Checkpoint: folder access foundation and admin controls

Implemented locally: explicit existing-account/machine workspace membership;
member/viewer roles and active status; folder edit/view/none defaults with
owner/edit/view/none overrides; admin membership and folder access editors;
optional API credential binding with live folder access intersection. Removing a
member (including Auth-account deletion) deletes bound keys rather than upgrading
them to unrestricted credentials. Workspace viewers remain capped at read.

Verified sessions resolve their membership server-side without app admin roles.
Scoped SQL now applies live access to management, targeting/presentation,
analytics/events and server conversion attribution. Member folder creation grants
creator ownership. Moves require both folders to be editable; member deletion of
a nonempty folder is rejected. Global tag/template mutation stays with workspace
owners. Legacy unbound API credentials retain explicit scope semantics.

The full permissions requirement is still partial: a dedicated member workspace
route, member-aware settings/analytics UI, Ask to edit and owner notifications,
all-source inventory access semantics and native runtime/release proof remain.
Administrators can configure candidate access controls now; non-admin members
have scoped API access but cannot use the admin console. Existing production
schema, memberships, credentials and provider state are unchanged.

Validation: 32 focused API/permission-control tests pass. The complete migrated
SQL suite includes real tracked-click analytics, denied conversion writes after
access removal, policy denial, membership deletion cascades and unchanged legacy
workspace/selected-key semantics. All five native SDKs and examples still pass
through actual loopback HTTP → edge handler → isolated PostgreSQL. Build,
functions types, targeted lint and migration versions pass. App typecheck stays
at 704 inherited errors, none new. Browser screenshots `folder-access-desktop.jpg`
and `folder-access-mobile.jpg` use a local fixture with production fetches
blocked and simulated changes. Saving folder defaults/overrides and the mobile
machine form were verified; mobile scrollWidth=clientWidth=390. Temporary viewport
and tab were cleaned up. See `docs/guides/redirect-folder-access.md` for current
API semantics and explicit remaining permissions work.

## Checkpoint: authenticated member workspace

Implemented locally: `/links-workspace` uses verified membership, separate from
the app admin console. Accessible links are searched/paged with exact scoped
counts. Creation/editing, new-from-existing prefill, six UTM fields/templates,
folder/tag/comment assignment, folder creation/rename/deletion/access, selected
bulk moves/archive/restore/confirmed deletion, CSV import/export of loaded or
selected rows, QR export, behavior settings and analytics use the scoped API.
Viewers can inspect disabled behavior controls; mutations remain server-denied.
Existing admin settings and reports keep their established behavior.

New registered-session discovery and scoped variant-performance endpoints support
the member UI. Folder APIs return effective edit/manage capabilities. Account IDs
partition member, policy, access and analytics caches; account changes remount
the workspace before another account's response arrives. Private route is
noindexed. API/import errors preserve edits and selection for correction/retry.

Ask to edit/owner notifications, invitation/account discovery, all-source
inventory permission semantics and production multi-account verification remain
open. The member workspace currently manages short links; other inventory
sources remain source-managed in the admin inventory. No production schema,
permissions, memberships or credentials have been changed. All other unfinished
requirements in the main ledger remain in scope.

Validation: 99 tests across seven API/page/policy/report/import/access/SEO files
pass. Actual migrated SQL verifies effective folder capabilities (including key
scopes), permitted/denied variant metrics and prior ACL invariants. Five native
SDKs and examples pass through loopback HTTP and migrated SQL. Build, functions
types, targeted lint, formatting and migration version checks pass. App typecheck
remains 704 inherited errors, none new. Native browser proof uses a local fixture
with production fetches blocked: prefilled creation, template replacement,
updated link count, scoped report, and mobile creation dialog. Workspace and
dialog scrollWidth=clientWidth=390. Screenshots are `member-workspace-*` under
`outputs/redirect-dub-parity/`. Temporary viewport and tab were cleaned up.
Production multi-account/provider/release evidence is still outstanding.

## Checkpoint: edit access requests and durable owner notifications

Implemented locally: Ask to edit for view-only folders, optional message, own
status/withdrawal and owner review with explicit editor/owner confirmation.
Current ownership and active membership are checked at decision time; workspace
viewer caps remain intact. Duplicate pending requests do not notify twice;
per-folder/member cooldowns bound new requests. Requests, ACL grants, inbox
notifications and private mail jobs share the same transaction. Editors may now
rename folders; ownership/deletion/access management remain separate capabilities.

A secured scheduled consumer uses the configured Resend provider, stable job
idempotency, leases, bounded retries/backoff and a 23-hour ambiguity window.
Recipient changes, ownership loss and obsolete requests suppress mail. Emails
contain a generic authenticated review link without folder or requester details.
A minimal service-only verified-address definer is necessary: read-only actual
project metadata proves service_role cannot SELECT Auth users; broad Auth-table
access is not granted. Other new functions remain invokers and private.

No production state or real notifications were changed/sent. Read-only checks
found cron/Vault and the invoke secret available, but the project-local Vault URL
missing. Deployment, project URL/provider/sender verification, controlled-account
inbox/email/cron proof, invitation/account discovery and all-source permission
semantics remain open. The full original requirements ledger stays in scope.

Validation: 56 tests across nine request/API/mail/worker/member/settings files
pass. Actual migrated PostgreSQL proves request deduplication, cooldown/actor
limits, paging/privacy, current-owner decisions, workspace-viewer rejection,
editor rename, atomic grants/inbox/mail, retry delays, lease recovery/stale
acknowledgements, idempotency-window limits and recipient suppression. Provider
calls are mocked; worker tests execute the real shared authorization gate and
reject ordinary accounts/user-editable metadata. All five SDKs/examples still
pass through loopback HTTP and migrated SQL. Build, functions types, targeted
lint, formatting and migration checks pass; app types remain 704 inherited
errors, none new.

Native browser proof uses `access-request-*` screenshots under
`outputs/redirect-dub-parity/`: saved request, explicit owner selection/confirmation,
simulated approval and empty review queue, with production fetches blocked.
At 390 pixels the page has no horizontal overflow; the permission select was
constrained to its 324-pixel parent. Temporary viewport/tab were cleaned up.
These are fixture and isolated-database results, not live notifications or grants.

## Checkpoint: saved reports and public aggregate dashboards

Personal saved reports now preserve named filters and dates, with optimistic
updates, loading and cascade deletion. Explicit publication review creates a
separate captured scope. Clicks are public by default; conversion/revenue data
requires opt-in. Password, expiry, revocation and current owner/member permissions
are enforced in SQL and the HTTP handler. Workspace owners can explicitly choose
future matching folder links; ordinary members can share only one editable link.

The public page exposes sanitized aggregates only. Passwords stay out of URLs and
query-cache keys. Revoked/error refreshes remove cached titles and data. The actual
service worker now bypasses these pages and redirect APIs, purges prior managed
cache entries, and preserves unrelated offline data. Response headers additionally
prevent storage/referrer disclosure and search indexing. See
[the saved report guide](../guides/redirect-saved-reports.md) for contracts and limits.

Evidence: migrated PostgreSQL suite, actual HTTP handler with real password hash
verification and revocation, five SDKs/examples, focused UI/API tests, production
build and targeted checks. Native fixture screenshots are `saved-report-published-
desktop.jpg` and `shared-report-{desktop,mobile,revoked-mobile}.jpg` under the existing
outputs directory. The mobile page fits 390 pixels without horizontal overflow.
No production reports, shares or grants were created. Public indexing opt-in,
team report discovery, report SDK methods and production
release remain open alongside the full requirements ledger above.

### Next extension: viewer date selection

Within the approved dashboard parity scope, public viewers can select preset or
custom UTC dates and reset to the captured report dates. Changing a public date
range must never widen a saved start/end boundary or change link, folder, tag,
conversion or private dimension filters. Unbounded published boundaries allow
selection on that side. The server validates ISO instants and positive intervals,
returns only the public date bounds/selection, and performs the same password,
view budget, permission, version, expiry and revocation checks for every read.
Date inputs stay in a bounded POST body with passwords; none enter public URLs.
The existing aggregate grain stays fixed to the published report. Invalid dates
produce an actionable error without displaying stale metrics. This increment
does not settle the separate search-indexing option or production release.

## Checkpoint: viewer-controlled reporting dates

Public dashboards now offer 7/30-day presets, custom UTC instants and reset to the
published dates. The server accepts a closed date-only override object and rejects
widening of either saved boundary. Captured link scope, country/dimension filters,
conversion visibility, current permissions, password budgets, version gates and
revocation all remain enforced. Only date selection/bounds are added to public
metadata; private filters stay private. Invalid date responses remove stale
metrics while preserving a correction/reset control; unavailable dashboards also
remove the date controls.

Evidence: actual migrated PostgreSQL verifies seeded half-open date boundaries,
zero results, unchanged link/country filters, rejected widening/forged filters and
lost access. The real HTTP handler verifies date-only and password-plus-date reads
against that database, alongside all five native SDK/example runs. Fourteen focused
UI/API tests pass, production build and targeted lint pass, and application types
remain 704 inherited errors with none new. Native desktop/mobile fixture checks
confirm 61 → 21 clicks for the preset, a zero custom interval, reset to 61 and
removal on revocation. At 390 pixels client and scroll widths are both 390. The
`shared-report-dates-*` screenshots retain explicit fixture labels. Temporary
browser tab and viewport were cleaned up. No production state was changed.

### Next extension: explicit dashboard indexing

Add an off-by-default publication setting, reviewed before publishing. Password
protection and indexing cannot be combined. Existing publications stay noindex.
The edge must use the live, sanitized public report read (with its existing
budgets/permissions/version/expiry/revocation gates) before emitting indexable
HTML, rather than relying on client-only robots changes or a second metadata API.
Only explicitly indexable, unprotected shares expose their title and aggregate
summary in server HTML. Other shares retain a generic shell and noindex. All
share HTML stays no-store/no-referrer, including failures; localized/query variants
stay noindex. Indexable reports do not get generic locale alternates or unrelated
hub content. Client robots metadata follows the same sanitized flag. Revocation
can stop future publication but cannot immediately remove search-engine copies.

## Checkpoint: explicit search indexing for shared dashboards

Publishing review now includes an off-by-default indexing choice, with a visible
status on each publication. Password entry clears/disables it; API validation
and a database constraint also reject passwords plus indexing. All existing
publications retain noindex. Indexing is a frozen share setting: revoke/re-publish
to change it. No sitemap/token registry is generated.

The edge uses the live sanitized public report endpoint, including current rights,
budgets, expiry and revocation checks. Only a successful explicit opt-in publishes
the escaped title and aggregate summary in server HTML. Both human and crawler
HTML use the same summary and a single robots tag. Other states stay generic and
noindex, including backend failures and error shells. All report HTML remains
no-store/no-referrer. Query/localized variants stay noindex without backend reads;
there are no shared-report hreflang alternates. The browser follows the same flag
and resets robots metadata when a refresh reports revocation. This controls future
publication, not the timing of removal from external search-engine caches.

Evidence: SQL proves defaults, explicit stored/listed/read choice, rejected
password combinations and live revocation. Actual HTTP against migrated PostgreSQL
verifies creation, public flags and rejection/revocation, alongside five SDKs and
examples. The actual middleware runs in native workerd/HTMLRewriter and verifies
robots/headers/body behavior for people/bots, default/protected/revoked/error/rate-
limited states, query/localized variants and 404/500 shells. Eighty-seven focused
UI/API/meta tests pass. Build, functions types, targeted lint/formatting and migration
validation pass; app types remain 704 inherited errors, none new. Native fixture
proof includes default-off, password restriction, explicit review, saved status,
index→noindex on revocation and 390-pixel layout without overflow. Temporary tab
and viewport were cleaned up. No production publication/settings were changed.

### Custom domains: architecture and implementation sequence

Current evidence: managed short URLs and the public resolver use a global slug,
and the Pages relay serves only `/go/:slug`. Existing Cloudflare admin tooling
supports read operations; it is not a SaaS-hostname provisioner. Custom domains
therefore require coordinated registration/ownership, provider TLS/routing,
hostname-scoped slug allocation, resolver/API/SDK and builder/QR/inventory changes.
A TXT proof cannot stand in for working branded routing.

Use a workspace-owned domain registry with private challenges, owner-only settings,
versioned edits and disabled-first lifecycle. Verify exact `_qg-redirect.<hostname>`
TXT challenges via a fixed HTTPS DNS resolver with bounded responses, real DNS
name/type/status checks, attempt budgets and optimistic result application.
Hostnames are normalized to ASCII and reject URLs, IPs, private/reserved suffixes
and the site's own infrastructure. Domain/root/not-found/expiry defaults are
public HTTP(S) destinations, never arbitrary internal URLs. Missing or expired
ownership/provider checks must not imply readiness.

Implement in dependency order: (1) registry, real ownership verifier, owner UI and
stored defaults; (2) durable Cloudflare custom-hostname lifecycle plus TLS/routing
checks and deprovisioning; (3) hostname-scoped slug namespace, public worker/relay,
primary-domain selection and defaults in resolver, CRUD/bulk/SDK, builder/QR and
all-source inventory. DNS controls remain explicit; do not alter existing DNS or
provision paid external resources during local verification. Preserve all phases
in the parity ledger until native provider and controlled-domain evidence exists.

## Checkpoint: private custom-domain registry and ownership checks

The owner workspace now registers multiple domains and presents exact TXT
instructions. The production verifier uses bounded Cloudflare DNS-over-HTTPS
reads, exact name/type/token matching, cooldown and owner/global budgets before
network calls, and single-use/versioned/short-lived result application. Fresh
proof expires after 24 hours; definite loss clears it and transient errors cannot
extend it. Domain settings retain root/not-found/expiry defaults and disabled
state, reject private/looping destinations and prevent orphaning provider records
on removal. Setup panels stay open when a successful action changes versions.
The branded proxy now forwards guarded DELETE bodies.

This is the first prerequisite stage, not working custom-domain routing. The UI
explicitly separates ownership from TLS and serving; it does not emit active
branded URLs or primary choices. The full phase sequence above remains required.
Additional domain archive/transfer/subpath, authorized DNS auto-configuration and
forwardable setup workflows discovered in the current Dub documentation stay in
scope. See [Custom domain setup](../guides/redirect-custom-domains.md).

Evidence: migrated PostgreSQL verifies owner-only access/private grants, unique
challenges, defaults, cooldown, version/nonce/observation races, rotation, expiry,
transient failures, loss/disabled states and provider cleanup guard. Actual HTTP
through the edge handler into that database verifies the DNS flow with an isolated
provider response, including a cooldown before a second DNS call, stale edits,
lost proof, deletion and API-key denial. Five SDKs/examples still pass. Native
`domain-registry-*` screenshots show pending/verified/rotated states, saved defaults
and mobile wrapping at 390 pixels with no horizontal overflow. Browser tab and
viewport were cleaned up. All DNS results/registrations in browser proof are
labelled fixtures; no production DNS, provider or registry state was changed.

### Provider lifecycle design

Use a durable per-domain desired-state job with zone/CNAME-target binding, leased
claims, bounded retries and a recorded create intent before Cloudflare POST. A
preflight exact-hostname lookup rejects silent adoption of existing objects.
GET/DELETE can retry; uncertain POST outcomes enter owner review instead of being
posted again. A late create receipt records the provider object even if the
request was cancelled meanwhile, then queues cleanup. Lease/intent guards prevent
stale status results from activating anything. An explicit reviewed adoption can
reconcile an exact provider candidate after fresh TXT proof for connection (or solely
for cleanup while connection stays disabled after ownership loss); do not depend on
Cloudflare Custom Metadata, which is not available to every account.

Connect requires fresh proof, enabled domain and current owner permission. A
pending connection can be cancelled; a known object is deleted only using its
stored zone/ID after an exact hostname check. A possibly created but unknown
object prevents domain registration removal until reconciliation proves absence
or adopts then disconnects it. Edits/rotation/lost ownership cannot become stale
TLS readiness. Provider status, certificate status, validation records, attempt
state and sanitized failure information are visible to owners. The worker is
internal/admin authorized, configured with dedicated least-privilege provider
secrets, and remains idle when configuration is absent. No provider/DNS writes
are performed in local validation. Public hostname routing/namespaces and actual
controlled-domain deployment remain the following required stage.

## Checkpoint: durable Cloudflare hostname/TLS lifecycle

Dedicated provider configuration now enables reviewed connection, status refresh,
disconnection, existing-object reconciliation and guarded absence confirmation.
The API queues work; an internal/admin worker consumes private leased jobs. Exact
preflight, recorded single-use creation intent and late receipt tracking prevent
blind POST retries and cancellation orphans. A timed-out create enters review.
Cleanup rechecks the exact stored hostname/zone/ID and handles confirmed absence;
unknown creations block registration deletion. Candidate adoption is explicit;
cleanup-only adoption cannot enable readiness. An aged uncertain intent with a
fresh empty lookup can be cleared only after explicit owner absence attestation.
Configuration binding can change only after full disconnection.

Provider activation and certificate status are distinct. Readiness requires fresh
active statuses plus current ownership/enabled/owner/request state, and is closed
immediately by disconnect, role loss or proof invalidation. Healthy polling,
backoff/Retry-After, attempt caps and owner-visible validation/error states are
implemented. Missing config leaves the worker idle. The minute schedule uses the
existing project-local internal invoke mechanism, but no actual schedule/provider
execution or live configuration is claimed here. Public Worker routing, DNS target
and controlled-domain checks, provider validation restart, domain namespaces,
primary selection and all integration/release requirements remain open.

Evidence: migrated PostgreSQL proves intent/lease/operation guards, late receipt
cleanup, uncertainty/review/absence, fresh TLS conditions, configuration binding,
private grants and registry deletion guard. Seventeen focused UI/adapter/real-auth-
worker tests pass. Actual HTTP → edge handler → migrated queue → actual adapter →
isolated Cloudflare API proves one POST, pending vs active TLS, polling and queued
cleanup; all five SDKs/examples retain their tests. Build, functions types, targeted
lint/formatting and migration validation pass; app types remain 704 inherited
errors with none new. Native `domain-provider-*` desktop/mobile screenshots show
review, queued/pending/active certificate states and disconnection. At 390 pixels
client and scroll widths are both 390. Temporary browser tab/viewport were cleaned
up. Provider/DNS state in native tests is explicitly simulated and all production
requests blocked. No production Cloudflare, DNS, registry or deployment writes.

### Hostname namespaces and signed public routing

Add a domain foreign key to managed SHORT links, with uniqueness per domain and a
separate default `/go/` namespace. The built-in resolver must explicitly filter
that namespace, never select an arbitrary same-slug record. Preserve link-ID
scopes, folder permissions, atomic bulk/upsert, policies and attribution.
Store the immutable public hostname alongside each binding for inventory reads;
clients cannot override that derived value. Binding new/moved links requires a
ready domain; edits to an existing unavailable domain can still repair its links.

A dedicated Cloudflare SaaS relay takes hostname/path from its actual request URL,
strips incoming internal headers, and signs method, hostname, path, canonical
query and visitor IP with a domain-separated HMAC. The resolver verifies the
signature and consistency before looking up the domain. Unknown/unready domains
never fall back to the built-in namespace. Current domain/owner/TLS rights are
checked in SQL, including again at click recording. Root/not-found/expired
fallbacks use stored defaults, while previews, passwords, targeting, conversions,
QR attribution and cloaking keep the existing resolver behavior.

An explicit browser GET to the branded health endpoint proves that public DNS/TLS
and the deployed relay reach this backend; only its signed, authorized request
records a routing check tied to the provider ID and protocol. No server-side
fetch to a user-supplied hostname is introduced. Current TLS/ownership plus a
recent matching routing check gates choices/binding/primary. Background provider
checks renew previously verified TXT proofs before expiry, using the same bounded
DNS verifier and current owner authority. Missing proof closes routing. The full
builder, primary, inventory, CSV/QR, five SDK and controlled-deployment integration
requirements remain in scope; managed root-link policies and provider validation
restart also remain explicit follow-up requirements.

Implemented locally: hostname foreign keys and scoped unique indexes, explicit
built-in null namespace, canonical API URLs/domain filters, scoped upsert/bulk,
immutable inventory hostnames, and readiness checks for new/moved bindings.
A dedicated Cloudflare SaaS relay signs actual URL scope and strips untrusted
internal/customer auth headers. The resolver verifies protocol/method/host/path/
query/IP/time, isolates domains without fallback, retains passwords/previews/
cloaking/targeting/conversions/QR attribution, and uses stored domain defaults.
Current authority/ownership/TLS gates resolution and atomic visit recording.
Both older visit/click entry points now delegate to those same guards. A branded
request cannot count against a link moved back into the built-in namespace.

The owner panel runs a bounded, explicit browser health GET with no credentials,
referrer, cache or redirects and refreshes authoritative registry readiness.
Signed health/traffic records proof bound to provider ID/protocol; active traffic
refreshes after six hours, proof expires after 24 hours. Known-provider polling
renews previous ownership proof using existing nonce/version/budget/DNS controls;
rotated or never-verified challenges require explicit initial verification.
Inventory, legacy source display, managed CSV namespace roundtrips/duplicate
checks/template and inventory QR attribution now preserve branded identity.
TypeScript types and the five SDK field contract are documented.

Evidence: all migrated SQL tests pass, including same-slug/default-domain
isolation, spoofed derived hostname, missing/stale routing proof, provider change,
stale TLS, disabled domain, revoked requester, namespace transition and legacy
entry-point guards. Actual owner HTTP → SQL → actual provider adapter exercises
route-proof gating, canonical URLs, scoped list/upsert and background DNS renewal;
all five native SDKs/examples pass. 110 focused tests across 13 files pass,
including actual Worker → resolver execution, MAC tampering, password/preview/QR
behavior, bounded forms, browser health flow, CSV and inventory regressions.
Worker types and local bundle dry run pass. App types remain 704 inherited errors
with none new; functions types, targeted lint/formatting, production build and
2273 unique/parseable migrations pass. Actual CSV → SQL integration also passes.
Native browser verified the owner routing check and responsive controls; mobile
client/scroll width are both 390. Saved local-fixture evidence:
`outputs/redirect-dub-parity/domain-routing-ready-desktop.jpg` and
`domain-routing-ready-mobile.jpg` in the shared workspace root. Temporary tab and
viewport were cleaned up; production requests were blocked in the fixture.

This is a checkpoint, not full Dub parity or a production rollout. Still required:
domain choices/primary preference and full builder/member integration, broader
all-source folder semantics, managed root-link policies, provider validation
restart, remaining domain lifecycle/DNS automation, and every other open feature
in this ledger. Dedicated Worker/zone routing, real DNS/TLS, scheduled renewal,
production migrations, release/PR/push and controlled-domain verification remain
unperformed. No production provider/DNS/database/deployment writes were made.

### Domain choices, primary preference and interactive builders

Use a private versioned singleton workspace preference for the primary hostname.
Only current owner sessions may change it, and choosing a custom primary requires
current ownership, TLS and routing proof. Selecting the built-in domain clears
the preference. This changes interactive creation defaults, never existing links;
the documented API omission behavior remains the built-in namespace.

A links-read endpoint supplies paginated ready public domain IDs/hostnames without
challenge/provider data. Creators see ready workspace domains; credentials bound
to existing IDs and non-creating members see only domains already used by visible
links. Current scope, member activity and folder permissions are checked in SQL.
Return primary availability explicitly so a failed primary never silently changes
the interactive creation URL. Client pagination must detect repeated cursors.

The admin builder and member editor use one shared accessible domain selector,
show the selected canonical URL, submit explicit domain IDs through scoped atomic
link mutations and use the returned shortUrl for QR/export. Existing bindings can
be preserved when a domain becomes unavailable, so repair remains possible; new
or moved bindings still require readiness. Account-keyed queries and current SQL
checks prevent stale client choices granting access. Owner primary controls use
optimistic versions and re-fetch availability; no DNS/provider writes are added.

Implemented locally: private versioned primary preference with owner-only writes,
ready-only public-field domain catalog, scoped/cursor-paginated reads, five native
SDK choice methods, shared accessible selector, tracked-link builder and member
editor domain selection. Builders preserve campaign/prefill/folder/tag fields,
submit explicit bindings through scoped atomic APIs and use canonical returned
URLs. Member list, policy context and QR attribution retain branded identity.
Existing unavailable bindings can be repaired; unavailable primaries or vanished
selected choices never silently appear as a built-in fallback. Preference drafts
retain their editing version across refresh and provide an explicit reload after
conflict. Account-keyed choices detect pagination loops and changing primaries.

Evidence: migrated SQL tests cover private grants, current role/scope revocation,
ready-only fields, creator vs viewer/ID-bound visibility, pagination, stale writes,
disabled primary, explicit clearing and unchanged existing links. Actual HTTP
handler → migrated PostgreSQL proves public-field choices, owner-only primary,
version conflicts, disconnected availability and FK/version clearing on domain
removal. All five SDKs exercise their new choice methods over real local HTTP and
retain their existing management/policy/tracking examples. Fifty-one focused tests
across six files pass, including unavailable-domain repair, disappearing explicit
choices, primary conflicts, canonical builder URLs and paging. A prior report
assertion was updated to include its existing safe allowIndexing=false default.

Native local-fixture browser proof verifies owner primary save → builder default →
preserved campaign/prefill → saved branded URL → generated QR. The actual mobile
screenshot QR decodes to the branded URL plus qg_qr=1. At 390 pixels client and
scroll widths are both 390. Evidence is in shared workspace outputs:
primary-domain-saved-desktop.jpg, domain-builder-primary-mobile.jpg and
domain-builder-saved-qr-mobile.jpg. The preview blocks production requests; its
ready domain/API responses are explicitly simulated. Temporary tab/viewport were
cleaned up. App types remain 704 inherited, none new; functions types, lint,
build and migration validation pass. No production writes or deployments.

Full parity remains open. The legacy raw-table creation form still uses the
built-in domain; domain filter UX, managed root-link policies, provider validation
restart, remaining domain lifecycle/DNS automation and all other unfinished ledger
features remain required, as do controlled real-domain and production release
verification. This checkpoint does not claim full domain/Dub parity or rollout.

### Legacy form completion and full-field atomic saves

Preserve the existing manual form's SHORT/PATH modes, conversions, scheduling,
query settings, visit limits and notes while adding the shared domain selector.
Use an owner-only service RPC/API for its whole raw record so a type/domain change
and policy-expiry synchronization commit together, with fresh owner authority and
current custom-domain binding checks. Do not use an intermediate client save to
convert the type or attach a domain. Path records always clear domain bindings;
new short links use the interactive primary default, while existing unavailable
bindings can still be preserved for repair. Reset the form/choice state between
records. Keep the existing raw row return contract for its caller.

Extend the existing scoped managed-link contract with startsAt, clickLimit and
notes, validated by the shared input helper and persisted in atomic management
mutations. The owner manual endpoint maps the same shared validation plus path/
match-kind constraints, rejects arbitrary row fields and never grants raw record
management to members or keys. Existing link-ID/folder/credential checks continue
for scoped managed-link writes. Verify SHORT/PATH conversions, same-slug custom
namespaces, unavailable bindings, field preservation, expiry synchronization,
role/key denials and rollback on invalid updates through migrated SQL/real HTTP.

Implemented locally: the active shared CMS editor now uses a registered domain
field and an owner-only atomic record API. Inspection showed the old standalone
dialog was retired, so the implementation targets the actual inventory → CMS
path and preserves its panels/metadata. Fresh owner checks, optimistic timestamps,
complete SHORT/PATH conversions, current custom bindings, policy-expiry sync and
actual row returns are enforced in SQL. Expected conversion clears are normalized
before the CMS compares submitted/stored values. Domain drafts survive group
remounts; server refresh does not reapply an old binding. Copy/test actions use
canonical public URLs. The first-save callback now receives the persisted ID so
the inventory is invalidated for new records too.

Managed APIs, TypeScript types and all five native HTTP test clients cover
startsAt, clickLimit and notes. Shared validation preserves omitted/null semantics;
CSV roundtrips scheduling and limits plus spreadsheet-safe notesJson, including
literal null text and null clearing. The isolated bootstrap now models the
existing production notes/created_at columns used by these functions.

Evidence: migrated SQL and actual owner HTTP verify full fields, same-slug custom
conversion without an intermediate builtin collision, role/key/readonly denials,
stale writes, failed-conversion rollback, unavailable-domain repair, binding clears
and expiry synchronization without losing other policy settings. Eighty-one
focused tests across 12 files pass, including the actual CMS hook/registered field,
ordinary organization-editor regressions, native field validation and CSV. Actual
CSV → migrated SQL and all five SDKs/examples pass. Native browser exercised the
real CMSEditorLayout and registry: primary selection, save, visit limit 12, second
save and tab switching. At 390 pixels client/scroll widths are both 390. Evidence
in shared workspace outputs: manual-cms-domain-saved-desktop.jpg,
manual-cms-limit-saved-mobile.jpg, manual-cms-domain-mobile.jpg. Its API/domain
responses are explicitly simulated and production requests blocked. Temporary
browser tab/viewport were cleaned up. App types remain 704 inherited errors with
none new; functions types, lint, build and migration validation pass.

This remains a parity checkpoint. Domain filter UX, managed root-link policies,
provider validation restart, remaining domain lifecycle/DNS automation and all
other unfinished ledger features remain required, along with real DNS/TLS,
controlled-domain, production migration/deployment, release and publication proof.
No production writes or deployments occurred.

### Domain filter views and scoped linked-domain facets

Add URL-backed domain filters to the all-source inventory and member workspace.
The inventory derives source hostnames from its complete loaded rows, including
manual custom hosts and built-in automatic/static/client routes. Changing the
filter resets pagination and selection; exports and shared views use the same
filtered rows. Unknown retained filters produce zero matches rather than silently
showing all domains. Built-in aliases normalize to the canonical site bucket.

Member domain facets come from a new links-read-only paginated endpoint over
currently visible managed links, not the ready-domain creation catalog or private
registry. Return public hostname/ID and accessible link counts plus builtin count;
keep domains with disabled/unverified/archived links, and exclude every inaccessible
folder/ID. Recheck membership/key scope and revocation under the existing ACL lock.
The linked-domain catalog must never become a creation-readiness signal.
Member filters compose domain UUID/null with search/folder/archive server filters,
are reflected in shareable URLs and reset selections/cursors on change. A domain
removed from the current facet response stays selected with a neutral label;
never disclose its hidden hostname or silently replace the filter. Queries are
account-keyed, cancelable and detect cursor loops. Add equivalent paged SDK reads
and verify scoped counts, inactive domains, revocation and end-to-end filter UX.

Implemented locally: URL-backed inventory hostname filters and member UUID/builtin
filters, composing search, folder and archive state. Unknown/invalid bookmarks
never fall back to all links. Filter changes and browser history clear bulk
selection and destructive dialogs. Inaccessible/vanished domain selections retain
a neutral label. Inventory exports and copied views use the filtered rows.

The new service-only redirect_linked_domains SQL and links:read HTTP endpoint
count only currently visible SHORT links, retaining disabled/archived links and
inactive domains without registry/provider joins. ACL scope is rechecked under
its shared lock. All five SDKs expose paged reads. Account-keyed browser reads
support cancellation, cursor-loop detection and matching catalog revisions;
readiness still comes exclusively from the separate domain-choices catalog.

Evidence: migrated SQL verifies counts, PATH exclusion, archived/disabled and
unverified domain visibility, minimal fields, page boundaries, folder/ID scope,
inactive/revoked principals and service-only grants. Actual HTTP verifies custom
and builtin filtering, inactive-domain fields and a revision change after a
manual type move. All five native SDKs/examples pass. Twenty-eight focused tests
across four files pass, covering filter composition, unknown bookmarks, browser
history selection clearing, account isolation, pagination cancellation/loops and
revision changes. Native browser verified both actual views using the labeled
local fixture with production requests blocked. The inventory narrows 402 source
rules to the one disabled branded fixture link and clears previous selection;
the read-only member view narrows two links to that same link. At 390px client
and scroll widths both measure 390. Screenshots in shared outputs:
domain-filter-inventory-desktop.jpg and domain-filter-member-mobile.jpg.
Temporary browser tab and viewport were cleaned up. Build passes in 19.36s;
functions types and targeted lint/format pass. App types retain 704 inherited
errors with none new. All 2,276 migration versions and SQL grammar checks pass.

This is another local parity checkpoint. Managed root-link policies, provider
validation restart, remaining domain lifecycle/DNS automation, native/deferred
deep links, durable QR styles, branded password pages, customer enrichment,
report SDK/team discovery, integrations, durable outgoing webhooks, remaining
permissions/account discovery and controlled real-service/release validation
remain required. No production migrations, DNS/provider writes, deployments,
package publication or release have occurred in this checkpoint.

### Restart provider validation

Continue the approved domain lifecycle design with an explicit owner restart
control. A direct synchronous PATCH would bypass durable authorization and lease
coordination; automatically PATCHing every status refresh would reset provider
backoff without owner intent. Instead, add a versioned restart request tied to the
current provider operation in the existing durable job. Require enabled, freshly
verified ownership, a known connected provider ID and matching zone/target, with
a five-minute request cooldown. Enqueue a status refresh and invalidate cached
certificate readiness immediately.

After GET verifies the exact provider hostname/ID, reserve a single-use restart
under the ACL lock and current lease/operation, provider binding, owner permission,
proof and configuration. Only then send a no-change SSL PATCH using the observed
method/type. Support only the workspace's DV/txt-or-http-or-email configuration;
reject missing/unrecognized values rather than changing certificate settings.
Cancellation or intervening refresh makes an older request ineligible. Consuming
the request before PATCH ensures worker crashes or ambiguous network outcomes
cannot automatically repeat it. Subsequent jobs inspect status; an owner may
request again after cooldown if needed. No new hostname creation or DNS changes.
Expose queued/started timestamps and explain this uncertainty in the UI/docs.

Verify SQL permissions, stale versions/leases/bindings and lost proof, request
cooldown, one-use reservation and cancellation; adapter GET/PATCH exact payload,
timeout/non-repeat and mismatches; owner HTTP denial for keys/members; and UI
restart eligibility/status without conflating it with read-only refresh.
Source: Cloudflare Common API Calls, retrieved 2026-10-14:
https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/common-api-calls/

Implemented locally: an explicit owner-only validation restart now queues a
single-use intent on the existing provider operation. The new migration adds
private request/start state, a versioned request RPC and a service-only reservation
RPC. Fresh ownership, enabled domain, known binding, exact zone/target, current
owner, lease and operation are rechecked; five-minute cooldown and readiness
invalidation are enforced in SQL. A GET confirms hostname/ID before authorization;
the adapter PATCHes matching observed DV SSL type/method. Ambiguous results and
worker crashes never cause an automatic second PATCH; status polling continues.
Intervening refresh/disconnect supersedes pending intent. UI distinguishes refresh
from restart and displays queued, attempted and superseded states.

Evidence: migrated SQL covers owner/stale-version/configuration denial, readiness
invalidation, duplicate/cooldown rejection, refresh job kind, stale lease/provider
binding, null provider, expired proof, revoked owner, single-use reservation,
attempt timestamps, cancellation and private grants. Actual owner HTTP through
migrated SQL and the real adapter/provider simulator proves queued behavior,
key denial, one exact PATCH with no extra hostname POST, cooldown and GET-only
subsequent refresh. All five native SDKs/examples pass. Twenty-seven focused tests
across five files pass, including unknown SSL configuration, object mismatch,
ambiguous PATCH/non-repeat, routing and existing provider setup regressions.
Native browser verified the real provider panel in a labeled local fixture:
restart queues, disables during cooldown, then displays the attempted status;
390px client/scroll widths both equal 390. Screenshots in shared outputs:
validation-restart-queued-desktop.jpg and validation-restart-attempted-mobile.jpg.
Temporary tab/viewport cleaned up. Build passes in 20.95s; app typecheck retains
704 inherited errors with none new; functions types and targeted lint/format pass.
All 2,277 migration versions and grammar checks pass. No production writes,
provider calls, DNS changes, deployment or package publication occurred.

This remains progress toward the full goal. Managed root-link advanced policies,
remaining domain lifecycle/DNS automation, native/deferred deep links, durable QR
styles, branded password pages, customer enrichment, report SDK/team discovery,
integrations, outgoing webhooks, remaining permissions/account discovery and
controlled real-service/release verification remain required.

### Managed domain-root links

Represent a branded homepage as a managed SHORT link with isDomainRoot=true,
constrained to a non-null custom domain and unique per domain. Keep an internal
valid slug for storage/API identity, but expose the canonical URL as https://host/;
the internal slug path must not resolve the root row. This preserves existing
link IDs, folder/tag/comment organization, previews, policies, analytics and
conversion attribution. A separate root-policy store would duplicate enforcement;
a root-only redirect to a normal short URL would leak the second URL and bypass
canonical root previews. Use the existing managed pipeline instead.

Expose the flag through management APIs/SDKs, CMS and builders, preserve omitted
update semantics, normalize PATH conversions to false, and include CSV support.
New root bindings require current domain readiness just like new host bindings.
Uniqueness and builtin/PATH rejection live in SQL. Root upsert addresses the
unique domain root; slug upserts must not accidentally edit a root row. Root
listing, inventory, copy, QR and preview canonical URLs retain the homepage.

For signed branded '/' traffic, look up the domain root row and apply the same
password/scheduling/expiry/visit-limit/targeting/preview/cloaking/tracking pipeline.
Only if no root row exists use the legacy rootUrl fallback. Disabled/scheduled/
expired roots must never fall back to legacy rootUrl. Atomic click recording
rechecks root-vs-slug path identity as well as current domain readiness so a
concurrent conversion cannot count against the wrong source. Builtin '/' stays
outside this feature. Verify DB, actual HTTP/resolver, UI, CSV/SDK and canonical
URLs, including password failure/HEAD/bot no-click behavior and root uniqueness.
Reference: https://dub.co/changelog/root-domain-links (retrieved 2026-10-14).

Implemented locally: custom domain homepages are managed SHORT rows with a
non-null custom binding, isDomainRoot flag and a unique root index. Normal slug
uniqueness excludes roots, so storage keys cannot collide with public namespace
semantics. Root upserts address the domain root; normal upserts exclude roots.
SQL/API/manual saves preserve omitted flags and normalize PATH conversions. New
root conversions require ready routing. Management responses expose the homepage
shortUrl; inventory, CMS tools, member links, copied URLs and QR use it.

The signed '/' resolver runs the existing full policy/visit pipeline. Legacy
rootUrl applies only when no managed root exists. Internal slugs never resolve a
root. Atomic visit recording rechecks root-vs-normal source identity. Builders,
member editing and the active CMS offer Use domain homepage; the CMS allocates an
internal slug when omitted. A native browser save exposed a stale internal-slug
preview; the shared CMS domain field now displays the canonical root, with a
regression test. Prefilling a root creates a regular draft by default.

CSV and TypeScript types expose the root flag; all five native SDKs create,
upsert and delete roots through actual loopback HTTP/migrated SQL. CSV source
through migrated SQL verifies root upsert and full update roundtrip. Root metadata,
folder/tag permissions, policies, reports and conversions reuse the managed ID.
Bulk QR exports now pass trusted hostnames through URL validation (fixing the
existing branded-link bulk gap) and mark managed custom-root/slug QR attribution;
real PNG scan decoding verifies both. Normal path exports retain their old URLs.

Evidence: SQL covers unique/custom-only roots, per-domain identity, root upsert,
normal/roots sharing a storage slug, failed-conversion rollback, current route
readiness, repair preservation, PATH cleanup and concurrent source identity
checks. npm run test:redirect-roots executes the actual Worker → signed resolver →
migrated PostgreSQL, proving absent-only legacy fallback, password failure and
POST success, protected HEAD no-count, root canonical previews/bot no-count,
QR/conversion attribution, device targeting, atomic quota, disabled/scheduled/
expired behavior and blocked storage-slug access. Eighty-seven focused tests in
eight files plus eleven link-tools/real QR ZIP tests pass. The five SDKs/examples,
CSV and SQL suites pass. Native browser exercised the actual CMSEditorLayout with
labeled simulated domain/API responses and production requests blocked: homepage
save without a slug, canonical preview after save, and 390px client/scroll widths
both 390. Screenshots in shared outputs: managed-root-cms-desktop.jpg and
managed-root-cms-mobile.jpg. Temporary browser tab/viewport cleaned up.

This remains a local parity checkpoint. Remaining domain lifecycle/DNS automation,
native/deferred deep links, durable QR styles, branded password pages, customer
enrichment, report SDK/team discovery, integrations, outgoing webhooks, remaining
permissions/account discovery and controlled real-service/release verification
remain required. No production writes, DNS/provider changes, deployments or
package publication occurred.

Validation for this root-link checkpoint: final build 20.98s; functions types and
targeted lint/format pass. App ratchet remains 704 inherited errors with none new;
the baseline was not regenerated. All 2,278 migration versions and PostgreSQL 17
grammar/body-balance checks pass. Working changes are limited to this feature and
its documented branded bulk-QR fix.

### Durable QR preferences and branding

Add versioned owner-managed workspace QR preferences and domain overrides;
resolve effective settings only for currently accessible managed link IDs. Reuse
the current renderer and scan-before-export guarantees. A separate preference
record keeps branding edits independent of provider/DNS proof and domain settings
versions. Domain overrides inherit missing fields from workspace defaults, then
built-in appearance. Owner changes recheck permissions and optimistic version in
SQL. Machine/member reads return only effective settings for visible links and
never enumerate private domain setup. Exports must load defaults before generating,
retain explicit local edits and provide retry/explicit standard-style fallback
on read failure instead of silently bypassing saved branding.

First wire saved shape/color preferences through individual and bulk exports and
provide workspace/domain editors. Reject unknown fields and invalid colors/shapes
in both API and SQL. Enforce 4.5:1 dark-on-light contrast on effective combinations,
including every domain override affected by a workspace update; invalid edits
roll back. Reset removes overrides and restores inheritance. Account-keyed reads
and cancellation prevent stale-account results. Bulk presets must resolve per
managed row while preserving one explicit export override for the selection.

Complete this foundation with controlled raster logo uploads, hosted assets,
domain-over-workspace precedence, explicit per-export custom/hide controls and
hosted QR image URLs. Do not store unbounded raster data in preference JSON or
allow arbitrary server-side image fetches. Durable asset cleanup and release proof
remain required alongside these follow-up pieces; saved styles alone do not
complete the QR branding requirement.
Reference: https://dub.co/changelog/custom-qr-code-logo (retrieved 2026-10-14).

Implemented locally: versioned private workspace/domain appearance records,
owner GET/PATCH/reset controls, scoped single/batch effective reads, and five SDK
getters. Partial API fields inherit workspace/built-in defaults; null removes
fields or resets all overrides. SQL validates shape/color fields and effective
contrast, including every domain affected by a workspace write, with atomic
rollback and stale-version rejection. Current member/folder/ID/revocation scope
is checked under the ACL lock; effective responses contain only ID/style/source.
Settings can be repaired while a linked domain is unavailable.

Workspace and expanded-domain settings expose saved appearance editors. Drafts
capture their initial version across background refresh and are account scoped;
conflicts require explicit reload. Unique field IDs support multiple editors.
Individual exports pass managed IDs through the saved-style hook, wait for fresh
reads and offer retry or explicit standard fallback on failure. Local overrides
remain export-only; returning to saved settings refetches current defaults.
Generation is cancelable. Bulk exports fetch per-link styles once plus owner
workspace defaults for non-managed rules, render each code's appearance, and let
one explicit custom style override the selection. Prepared ZIPs are hidden when
account/selection/settings identity changes. Returning from standard fallback to
saved styles rechecks the current scoped response.

Evidence: SQL verifies default/inheritance/reset behavior, first-write/version
conflicts, private grants, unknown fields/shapes, contrast rollback across domain
overrides, current scoped batches, revoked keys and unavailable-domain reads.
Actual HTTP/migrated SQL verifies minimal single/batch responses, key denial for
private settings, write conflicts, invalid methods/duplicate IDs and reset. All
five native SDKs/examples pass, including their effective-style getters. Forty-
nine focused tests across nine files pass, including background-refresh conflicts,
account isolation, explicit individual/bulk fallback, fallback recovery, common
bulk overrides and prepared-bundle invalidation. Real QR ZIP tests rasterize and
decode per-row presets and verify their distinct saved colors in SVG outputs.
Native browser exercises the actual editor and QR generator/scan verifier using
labeled simulated preference responses with production requests blocked: save
workspace joined dots, inherit in domain/QR, save a rounded domain override,
reset to workspace, and 390px client/scroll widths both 390. Screenshots in shared
outputs: saved-qr-domain-desktop.jpg and saved-qr-inherited-mobile.jpg. Temporary
browser tab/viewport cleaned up. Build 21.50s; functions types and targeted lint/
format pass. App ratchet remains 704 inherited errors with none new; no baseline
regeneration. All 2,279 migration versions and grammar checks pass.

This is the saved-appearance foundation, not full QR branding completion. Hosted
raster logo assets, workspace/domain logo precedence, explicit custom/hide behavior,
durable asset cleanup and hosted QR image URLs remain next. The full remaining
domain lifecycle/DNS automation, native/deferred deep links, branded password
pages, customer enrichment, report SDK/team discovery, integrations, outgoing
webhooks, remaining permissions/account discovery and controlled real-service/
release verification remain required. No production writes, Storage uploads,
DNS/provider changes, deployments or package publication occurred.

### Hosted QR logo assets and precedence

Use a dedicated public raster bucket with restrictive direct-write/list policies,
private immutable asset records and versioned preference attachments. Never put
raster data or caller-supplied image URLs in preference JSON. Owner uploads accept
bounded PNG/JPG bytes (at most 1.5 MB and 1024px per dimension), derive MIME/dimensions
and SHA-256 on the server, reserve an immutable UUID object key, then upload with
no overwrite/redirects and a bounded request. Recheck actor, reservation expiry
and expected preference version before atomically attaching and versioning it.
Unknown upload outcomes remain reserved for cleanup; no automatic second upload.

A durable service-only cleanup queue claims expired reservations and unreferenced
replaced assets, with leases, rechecked references and retries through the Storage
API. A grace period protects in-flight reads. Retain tombstones and recheck them
periodically so late uploads cannot become permanent untracked objects. A separate
internal/admin worker and configured cron drive cleanup. Never delete raw Storage
metadata with SQL. Domain deletion keeps asset metadata for cleanup.

Owner preferences add logoMode (inherit/none/custom) and a controlled clearLogo
operation. Hide/inherit can retain the current uploaded logo for reuse; explicit
clear drops its reference. Effective reads expose only public asset metadata and
logo source. Domain custom/none overrides workspace; inherited domains use the
workspace logo. Explicit per-export custom/hide wins over saved choices. Shapes
remain independent, so a common bulk color/style override must not copy one
domain's logo to other codes. Client loading uses fixed project Storage URLs,
bounded body/MIME/digest verification, cancellation, deduplicated assets and a
bounded aggregate logo budget. Missing saved images require retry or explicit
hide/custom/standard selection; never silently substitute another brand's logo.

Implement asset lifecycle/API/worker first, then connect the saved-logo editor and
individual/bulk renderers to it. Hosted QR output image URLs remain a separate
required follow-up; hosted logos do not complete that output requirement.
References (retrieved 2026-10-14):
https://supabase.com/docs/guides/storage/uploads/standard-uploads
https://supabase.com/docs/guides/storage/management/delete-objects

Hosted-logo backend implemented locally: dedicated public raster bucket with
restrictive direct write/list policies; private immutable asset records; owner
versioned upload reservations; bounded no-overwrite Storage POST; and current
owner/version/expiry rechecks before atomic attachment. PNG/JPG MIME/dimensions
are inspected from bytes (1.5 MB/1024px limits) and SHA-256 is computed server-side.
Unknown outcomes retain reservations and never trigger a second automatic POST.
Owner preferences accept independent inherit/none/custom modes and clearLogo;
hide/inherit retain the scoped upload for reuse, while explicit clear releases
it. Effective API reads expose only public asset metadata, deterministic fixed-
project URLs and source. Domain overrides/hide take precedence over workspace.

The private cleanup queue uses leases/reference checks, one-hour replacement/read
grace, backoff and exact-key Storage API deletions. Referenced retained assets are
excluded. Deleted-domain assets retain cleanup metadata. Tombstones are rechecked
one day after deletion and every 30 days afterward; they cannot be reattached.
The internal/admin cleanup function and configured minute cron are implemented.
Indexes support recent-upload budgets, pending scopes, references and due cleanup.
No raw Storage metadata is deleted with SQL.

Evidence: migrated SQL verifies metadata/owner checks, missing custom uploads,
workspace/domain/hide/inherit precedence, retained references, stale versions,
revoked owners, consumed/expired reservations, deleted-domain scope, retries,
lease acknowledgement, tombstones, pending budgets and private grants. Actual
loopback owner HTTP → migrated SQL → real bounded Storage transport against an
isolated response adapter verifies PNG/JPG uploads, exact public URL/metadata,
key denial, rejection before upload, current-owner revocation after bytes, lost
receipts without retries, quotas/Retry-After, physical orphan/replacement cleanup
and late-object deletion. Fixture physical objects are cleared at the end. All
five native SDKs/examples pass with the additive metadata contract. Twenty-five
focused tests across six files pass, including the actual cleanup handler's
internal/admin authorization, sanitized failures, fixed origins/keys and body/
receipt bounds. The post-format cleanup/transport subset also passes. App ratchet
remains 704 inherited errors with none new, Pages functions checks and targeted
lint/format pass, build 19.19s. All 2,280 migration versions/grammar checks pass.
Supabase deployment/Deno runtime, real Storage/policies/CORS/cron and cleanup
throughput remain unverified release work; no production calls were made.

This is the asset/API stage, not saved-logo UI or full branding completion. Next:
add logo metadata types and bounded/digest-checked client loading, owner upload/
retained/hide/clear controls, and explicit per-export custom/hide/saved choices.
Bulk appearance overrides must preserve each row's saved logo unless the user
explicitly overrides logos; deduplicate/bound loaded assets and avoid serializing
repeated large data URIs into cache/fingerprint keys. Hosted QR output image URLs
remain required afterward. The full remaining domain lifecycle/DNS automation,
native/deferred deep links, branded password pages, customer enrichment, report
SDK/team discovery, integrations, outgoing webhooks, permissions/account discovery
and controlled release/publication proof remain intact. No production Storage
uploads/deletions, DNS/provider changes, deployments or publication occurred.

### Saved-logo editor and QR export integration

Connected owner workspace/domain settings to the versioned logo upload/mode/clear
API. Uploads are locally inspected and decoded before review; saving uses the
version captured at selection rather than silently rebasing on background GETs.
Mode edits/clearing capture their observed version too. Hide/inherit retain custom
artwork for reuse; clearing is reviewed separately and restores inheritance.
Appearance/logo drafts block conflicting controls. Account/domain changes discard
logo drafts, late mutation results update only their captured cache, and explicit
reload resets local state. Public hosting is disclosed beside the upload control.

Individual and bulk exports hydrate effective logos from exact configured bucket
URLs, bound body/MIME/dimensions/byte length/SHA-256/decode, cancel stale work and
time out. Asset reads are deduplicated, limited to three concurrent transfers and
16 MB of unique logo bytes per selection; each image remains capped at 1.5 MB and
1024px per dimension. Failures require retry or explicit hide/standard fallback.
Hiding/custom logos skip saved images but still require a fresh scoped style read.
Common bulk appearance edits preserve each code's saved logo; explicit custom/hide
applies across the selection. Saved appearance and saved logo resets are separate.
Cache/fingerprint keys contain appearance and short asset/local identities, never
repeated base64 images. Account, selection and branding changes hide old prepared
artifacts. Local file reads also gate download/preparation.

Evidence: 67 focused tests across ten files pass, including real PNG/JPG loaders,
metadata/URL/digest/size/header/decode rejection, bounded concurrency/sibling abort,
aggregate budgets, explicit missing-image recovery, owner conflicts/retention/clear,
account round trips, custom/hide precedence, artifact invalidation and real ZIP
rasterization/decoding with distinct logos. Native browser fixture uses actual
components/rendering/scan checks with API/Storage responses simulated and production
requests blocked: upload and inheritance, hide/restore, bulk common appearance and
a downloaded two-logo PNG/JPG/SVG ZIP verified; all four downloaded raster files
decode to canonical URLs with QR attribution. Mobile 390px has no horizontal
overflow. Evidence: outputs/redirect-dub-parity/saved-qr-logos-{desktop,mobile}.jpg
in the shared workspace. App ratchet: 704 inherited errors, none new; targeted lint
passes; production build passes (19.54s).

Hosted QR output image URLs remain the next QR follow-up, alongside real deployed
Storage/policies/CORS/cron and cleanup-throughput verification. Full remaining
domain lifecycle/DNS automation, native/deferred deep links, branded password
pages, customer enrichment, report SDK/team discovery, integrations, outgoing
webhooks, permissions/account discovery and controlled release/publication remain
required. No production writes, deployments or package publication occurred.

### Hosted QR rendering architecture

Use an image-generating service (as Dub does), rather than persist three redundant
QR rasters for every style edit. A service-only Cloudflare Worker will share the
existing SVG geometry/contrast/quiet-zone/high-ECC rules and use a bundled, pinned
Wasm rasterizer; verify actual rendered pixels for each candidate mask and verify
JPEG after compression. Support SVG/PNG/JPG with bounded output sizes. Free text,
unsafe protocols, credentials, unbounded inputs and arbitrary remote logo URLs are
not accepted. Never fetch the encoded destination URL.

GET image URLs carry validated URL/appearance parameters and optionally a fixed-
bucket immutable logo key plus SHA-256; controlled logo reads are bounded and fully
decoded. POST generation additionally accepts bounded local PNG/JPG artwork. A
Pages /api/qr service-binding relay provides the public site URL without exposing
privileged keys. The Worker has no direct production route, a request/IP limiter,
no-store/private-image responses, safe CORS and sanitized failures. Public image
retrieval must never invoke redirect resolution or record a click/consume quota.

First build and verify the rendering/HTTP service and relay. Follow with scoped
saved-default lookup, UI hosted-image copying and five-SDK image URL contracts.
Sharing local per-export artwork through a durable hosted URL needs an explicit
controlled asset/recipe save that does not silently replace workspace defaults;
preserve this requirement for the authoring integration. A POST returning image
bytes alone does not satisfy hosted URLs for local custom artwork. Deployment,
real binding/rate-limit/cold-start/resource validation and public-route proof stay
required before claiming release. Existing broad implementation approval applies.

References retrieved 2026-10-14:
https://dub.co/docs/api-reference/endpoint/retrieve-a-qr-code
https://github.com/dubinc/dub/blob/main/apps/web/app/api/qr/route.tsx
https://github.com/thx/resvg-js/blob/main/wasm/index.d.ts
https://developers.cloudflare.com/workers/runtime-apis/webassembly/
https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

### Hosted QR rendering service checkpoint

Implemented a private-route Worker and public Pages /api/qr service-binding relay.
GET/HEAD produces SVG/PNG/JPG from validated URL/appearance parameters at 256, 512
or 1024 pixels; POST additionally accepts bounded inline PNG/JPG artwork. Shared
browser/server SVG geometry keeps contrast, high ECC, positioning modules and
quiet zones consistent. A pinned bundled resvg Wasm rasterizer tries masks and
verifies actual pixels; JPEG is checked after compression too. Wasm allocations
are freed per mask. No destination fetch, redirect lookup, click/quota recording,
remote fonts or runtime Wasm downloads occur.

Saved-logo keys are restricted to the fixed project/public bucket, require a
SHA-256 and use bounded/no-redirect/no-credential reads. PNG CRC/full decode uses
the supported streaming API; JPEG full decode has resolution/memory limits. Real
workerd testing exposed pngjs's private synchronous zlib API incompatibility; the
streaming path resolves it and preserves validation of truncated/corrupt artwork.
Bodies, URL/query lengths, shapes/colors, sizes, MIME and logo dimensions are
bounded. Unknown/duplicate parameters and unsafe URL schemes/credentials fail.
A real binding limits requests per edge IP (30/60s, not a global quota). Responses
are no-store, no-referrer, nosniff, noindex and CORS-safe. SVG CSP permits only
embedded data artwork. Errors are sanitized; Pages strips cookies/API credentials
and untrusted forwarding headers. Worker invocation logs are disabled.

Evidence: 71 focused tests across ten files pass, including all 18 supported shape
combinations through real Wasm, independent raster decoding, controlled logo URLs/
SHA/MIME, bounded bodies and unsafe inputs, truncated PNGs, excessive QR density,
HEAD/OPTIONS, rate-limit and relay contracts, plus existing owner/export/bulk
lifecycles. Native npm run test:redirect-qr starts/stops its own fresh workerd
instance and verifies HTTP SVG/PNG/JPG, inline PNG/JPG logos, exact canonical QR
attribution, validation, HEAD/OPTIONS and the actual local rate-limit binding.
An additional branded native PNG independently decoded and is saved in shared
outputs/redirect-dub-parity/hosted-qr-worker.png. The installed runtime only supports
2026-10-13, so native tests explicitly override that date; configured 2026-10-14
runtime proof remains required. Worker strict TS, Pages/function-test TS, targeted
lint and app build pass (18.19s); app ratchet remains 704 inherited errors, none new. Wrangler dry-run bundles the Wasm module at about
1.01 MiB gzip with no remote upload.

This completes the rendering/HTTP foundation, not complete hosted QR parity. Next:
scoped saved-default resolution, UI image URL copying, durable URL authoring for
local custom artwork without replacing defaults, and five-SDK URL contracts.
Real Pages binding, configured-date cold starts/resource limits, Storage/CORS and
controlled deployment remain required. Full remaining domain lifecycle/DNS
automation, native/deferred deep links, branded password pages, customer enrichment,
report SDK/team discovery, integrations, outgoing webhooks, permissions/account
discovery and controlled release/publication stay in scope. No production writes
or deployments occurred.

### Scoped live QR image links

Use durable opaque capability records rather than public link-ID enumeration or
stateless tickets that cannot be revoked individually. Owners, current members
and keys with links:read can explicitly create an image link for a currently
visible managed SHORT record. Owner inventory exports can also create one for an
explicit HTTP(S) URL, inheriting workspace defaults. A 256-bit random bearer is
returned once in image URLs; only its SHA-256 is stored. A private versioned row
binds the originating owner/member/key, optional link, appearance overrides and
inherit/hide logo choice, with optional expiry and explicit revocation. Default
is no expiry until revoked, suitable for embeds; downloaded codes retain the
encoded ordinary redirect URL and are unaffected by image-link revocation.

Every public retrieval rechecks that creator's current role/membership/key scope,
expiry and folder/link access under the existing ACL lock. It emits only canonical
short URL (including managed domain roots), QR appearance and controlled effective
logo metadata. No destination, passwords, notes, identity, folder data or analytics
are exposed. Link deletion cascades; lost access/revocation/expiry closes retrieval.
Generating an image never resolves the redirect or consumes a visit/quota.

The authenticated API creates/lists/revokes records. The public capability endpoint
returns minimal profile data only to the bearer; the Worker fetches it with bounded
reads and no redirects, then uses its existing validated rendering path. share
requests accept only output format/size, so they cannot override the authorized
payload or smuggle a logo URL. Worker/Pages responses remain no-store/no-referrer.
Creation has per-principal active/hourly and global-hourly budgets. List/revoke
remain scoped; owners can manage all workspace image links. Local custom artwork
still needs a separate reviewed asset attachment that preserves workspace defaults;
keep that, UI authoring/copy and five-SDK contracts as required follow-ups.

### Revocable live image profiles and five-SDK contracts

Implemented explicit create/list/versioned-revoke APIs and private hash-only QR
image capability records. Current owner sessions can publish visible managed links
or explicit inventory URLs; current member/key links:read scopes can publish only
visible SHORT records. Every public profile lookup rechecks the originating
owner/member/key, current folder/ID scope and expiry/revocation. Link/user/key/member
deletion cascades. Only canonical short URL (including custom-domain roots), tracked
flag, effective appearance and controlled public logo metadata leave the public
endpoint. Private destinations, passwords, notes, folder and identity data do not.
Image lookup/rendering does not resolve redirects, consume quotas or record visits.

Each publication returns PNG/JPG/SVG imageUrls containing a random 256-bit bearer
once; only SHA-256 is persisted. Default lifetime is until revoked, with optional
expiry within a year. Live workspace/domain branding and inherit/hide choices are
resolved at retrieval; explicit appearance overrides remain. List metadata never
returns bearer/hash; authors manage their own publications and owners can manage
all. Shared Worker requests permit only format/size options, fetch the fixed API
endpoint with the publishable key and bounded no-redirect/no-store transport, and
never silently fall back on missing/revoked/broken profiles. TypeScript, Python,
Ruby, PHP and Go now expose create/list/revoke methods and their native tests.

Creation budgets enforce 100 active records/60 per hour per principal and 600/hour
globally, with Retry-After 3600. A private creation ledger survives redirect/creator
cascades, so deletion cannot erase hourly budgets. The existing internal QR cleanup
worker prunes bounded batches of ledger records older than two days and image
records revoked/expired for 90 days, preserving active permanent publications.
Indexes support current-principal, references, hourly budgets and retention scans.
No raw Storage metadata is deleted. Migration version 99991791996360 was allocated
with the repository renumber tool; all 2,281 versions and Postgres 17 grammar/body
checks pass. No production schema, Storage, DNS or provider state was changed.

Evidence: migrated SQL covers canonical roots, dynamic styles, hidden artwork,
scoped publication/list/revoke, member impersonation denial, folder/key/owner access
changes, expiry, deletion, stale versions, no visit changes, private grants, active/
hourly/global budgets, deletion-resistant history and bounded retention. Actual
owner/key HTTP -> actual edge handler -> migrated SQL -> real bounded Worker profile
and asset loaders -> real Wasm verifies domain JPEG/workspace PNG inheritance and
style changes, SVG embedding and independent PNG/JPG decoding of exact tracked
URLs; revocation returns 404 rather than fallback. HTTP tests prove private API
access cannot use a public image bearer, only-own list/revoke, stale conflict and
429/Retry-After. All five native SDK tests/examples pass with the additive methods.
Eighty-eight focused tests across 13 files pass. The native workerd script passes
including unconfigured-profile/override denial; its explicit local date is still
2026-10-13 versus configured 2026-10-14. Worker and SDK strict TS, app ratchet (704
inherited errors, none new), Pages/function-test TS, targeted lint, format and app
build pass (21.32s). Wrangler dry-run is about 1.01 MiB gzip with no upload.
Supabase/Deno deployment, real gateway/Storage/CORS/cron and retention throughput,
configured-date cold starts/resource budgets and real Pages service binding still
need controlled release verification; HTTP fixtures are not deployed proof.

Next QR work remains durable local-artwork attachments that preserve workspace
preferences, complete UI authoring/copy/revoke and controlled release. The full
remaining domain lifecycle/DNS automation, native/deferred deep links, branded
password pages, customer enrichment, report SDK/team discovery, integrations,
outgoing webhooks, permissions/account discovery and publication remain required.
The overall Dub parity goal remains active.

### Per-image custom artwork publication

Extend explicit image creation with optional bare-base64 PNG/JPG artwork. Keep
these uploads separate from saved workspace/domain defaults. Custom publications
start pending and expose no public profile/image URL until verified and attached.
Reserve an immutable asset under the creator/current grant version and existing
asset budgets; fully render/scan-check it through the fixed site QR service before
Storage upload. Check the PNG response/verification header with bounded reads,
never follow redirects or fetch a caller URL. A verification/storage failure keeps
the draft and reservation for cleanup; never blindly repeat an uncertain upload.
Recheck the creator, current link scope, grant version, expiry and reservation
before atomically marking the asset active and publication published.

Use the existing controlled public raster bucket/immutable asset lifecycle. Add
image references to cleanup guards so referenced artwork cannot be deleted. On
revocation or image/link/creator deletion, release the asset with the read grace;
pending drafts expire in 15 minutes and are pruned after one day. Pending expired
records do not consume the active publication limit, but their creation/upload
budget history remains. Public reads reject drafts. Rendering custom image
artwork takes precedence over workspace/domain defaults and leaves those settings
unchanged. Add the input/types/method coverage to all five SDKs. Complete UI
publication/copy/revoke controls afterward, with preview/account/selection identity
guards. Existing broad implementation approval applies; production release and
real service-binding/gateway/Storage/cron proof remain required.

### Custom image artwork publication checkpoint

Implemented POST /qr-images logo bytes across owner/member/key authoring and all
five SDKs. Custom requests create private 15-minute drafts, reserve an immutable
asset under the original creator/version and quotas, fully decode/render/scan-check
through the fixed site QR service, upload once, then recheck current creator/link
access, version, reservation and expiry before atomic publication. Only successful
published responses include imageUrls. Verification checks the attested PNG MIME,
1024px dimensions and bounded body over fixed HTTPS without redirects/credentials.
No caller URL is fetched. The QR service emits the verification header only after
actual pixel scan checks. Workspace/domain preferences are never changed.

Per-image artwork wins over saved defaults in public profiles. Asset cleanup and
lease acknowledgement now guard both preference and image references. Revoke or
image/link/creator deletion releases assets with the one-hour read grace. Pending
drafts stay non-public, expire after 15 minutes and are pruned after one day;
expired drafts do not consume active publication slots, but creation/upload budget
history persists. Unknown upload receipts never cause a second POST. Asset
metadata/tombstones remain tracked for late-object cleanup. Base64 validation now
uses a bounded linear pattern, avoiding recursive regexp overflow for large valid
raster files. SDK metadata includes pending/published state and public logoAsset.

Evidence: migrated SQL covers private drafts, outsider/stale reservation denial,
canonical/minimal reservation data, cross-scope attachment denial, publication and
unchanged workspace defaults, consumed reservations, reference-safe cleanup,
revocation grace, revoked key/current-version finalization denial, expired draft
pruning/orphan tracking, pending-upload budget and link-deletion cleanup. Actual
HTTP -> migrated SQL -> real QR verifier/Wasm -> bounded Storage adapter -> final
attachment exercises all five native SDK custom-image methods, public custom SVG
embedding, retained defaults, protected/released physical assets, invalid/truncated
artwork and unavailable verification before Storage, lost receipts without retry,
owner revocation after bytes, private failed drafts and eventual physical cleanup.
All five SDKs/examples pass and fixture objects are cleaned. Ninety-three focused
tests across 14 files pass, including large valid raster base64 and verification
response/transport bounds. Native workerd verifies attested SVG/PNG/JPG output.
App ratchet remains 704 inherited errors, none new; strict Worker/SDK and Pages
function checks, targeted lint, format and build pass (23.65s). All 2,282 migration
versions and Postgres 17 grammar/body checks pass. Wrangler dry-run is about
1.01 MiB gzip. No production writes/uploads/deletions/deployments occurred.

Next: complete frontend hosted-image authoring, copy and revoke controls with
account/selection/branding identity guards and native browser evidence. The fixed
site Pages binding/QR Worker must be deployed before custom publication can pass
verification; real gateway/Storage/CORS/cron/retention throughput and configured
2026-10-14 runtime proof remain release work (local workerd supports 2026-10-13).
The overall goal remains active with domain lifecycle/DNS automation, native/
deferred deep links, branded password pages, customer enrichment, report SDK/team
discovery, integrations, outgoing webhooks, permissions/account discovery and
controlled release/publication still required.

### Hosted QR controls design

Use the existing single-code export surface for publication; a separate settings
page would disconnect the published image from its preview, and automatic
publication on download would create unwanted public capabilities. Add an inline
Hosted image section after local export actions. Explicit publish captures label,
optional 30-day/one-year/unlimited lifetime, saved/live or explicit appearance,
and inherited/hidden/local-custom artwork. Saved appearance follows future
workspace/domain changes; explicit appearance stays fixed. Custom artwork is
publicly hosted and never updates workspace/domain preferences. State that image
URLs can be used by anyone who has them and are only returned once.

Keep bearer URLs solely in component state, never query caches or query keys.
After successful creation, fetch the fixed-origin PNG without credentials,
redirects, cache or referrer, bound/decode/scan its bytes against the intended
redirect URL, then enable PNG/JPG/SVG URL copying and show the verified preview.
If hosted verification fails, preserve the created record and offer retry preview
or revoke; never repeat the create request automatically. Freeze export edits
while publishing. Account/URL/link selection changes remount the controls; late
responses cannot appear in another scope. Use aborts and scoped cache keys.

An explicit expandable management list shows all currently accessible image
records, with labels, dates, publication/revoked/expired status and current-link
indicator. Owners may see workspace records; other authors see their own. Use
server cursor pagination and fail on repeated cursors. Never reconstruct lost
bearers. Versioned revoke requires an inline confirmation describing the impact
on embeds and preserving downloaded codes. Reload on conflict; keep captured
versions during confirmation. Empty/loading/error/retry states and responsive
labels use existing form, button and typography tokens. Broad approved scope
covers this design; verify publication, failed previews, races, pagination and
revocation in focused tests and a local desktop/mobile browser fixture.

### Hosted QR publication controls checkpoint

Single-code QR exports now expose explicit label/lifetime publication, live saved
or fixed selected appearance, inherited/hidden/custom artwork, verified hosted
preview, PNG/JPG/SVG URL copying and scoped cursor-paginated management. Bearers
remain only in component state; account/URL/link changes abort old work and reset
secret state. Export edits are frozen during publication. The browser bounds,
decodes and independently scans the hosted PNG against the selected tracked URL
before exposing copy fields. Failed preview preserves the record and retries the
preview without another create. Revoke confirms impact, captures the selected
version, requires reload on conflict and preserves downloaded codes. Confirmation
receives focus and scrolls into view on mobile. Empty/loading/error/retry states
use incumbent admin primitives. Long labels wrap; row actions keep compact copy.

A browser integration check caught duplicate sibling React keys on the style
editor and new hosted controls; the hosted key now has its own prefix. A full
export regression test ensures one editor survives QR and publication updates.
The frontend imports current SDK source types explicitly rather than stale built
SDK declarations. The Worker exposes its verification/Retry-After headers through
CORS for cross-origin previews; attestation remains gated by actual render scans.

Evidence: 102 focused tests across 15 files pass, including inherited/fixed/custom
input contracts, fixed-origin/same-bearer response validation, nonadvancing cursor
rejection, untrusted/oversized preview denial, no copying before verification,
no bearer query caching, retry without duplicate publication, account remount
aborts/late-response isolation, version conflict handling and cursor-page revoke.
App ratchet remains 704 inherited errors, none new; targeted lint and format pass.
App build passes (30.70s). Desktop/mobile native browser fixture uses actual QR
rendering and independent hosted image scan with API responses simulated and
production network requests blocked. It exercises SVG clipboard copying, custom
artwork plus 30-day expiry, confirmation focus/no horizontal overflow at 390px,
revoke and refreshed management status. Evidence images are in outputs/redirect-
dub-parity/hosted-qr-publish-desktop.jpg, hosted-qr-revoke-mobile.png and
hosted-qr-management-desktop.png in the shared root. Temporary browser tab closed
and viewport reset. No production writes or deployments occurred.

The local API/SDK/UI QR publication flow is implemented. Real Pages service
binding, Supabase gateway/Storage/CORS/cron and configured-date runtime/resource
checks remain controlled release work. The overall goal stays active; required
remaining domain lifecycle/DNS automation, native/deferred deep links, branded
password pages, customer enrichment, report SDK/team discovery, integrations,
outgoing webhooks, permission/account discovery and release/publication are not
removed from scope by this checkpoint.

### Saved report SDK contracts design

Dub Links advertises customizable reports, shared dashboards and five-language
programmatic access. Redirects already implements private personal report CRUD,
versioned edits, scoped aggregate execution and explicit share creation/revocation,
but its five SDKs omit these operations. Add named methods in TypeScript, Python,
Ruby, PHP and Go for create/get/list/update/delete/run reports, create/list/revoke
shares and read a public report. Keep the existing transport and response bounds,
HTTP error/Retry-After handling and no automatic write retries.

Use a current account-session credential for private report methods, preserving
personal ownership and current membership checks. Machine API keys continue to
receive 403; broadening reports into a workspace-owned resource would change
existing semantics and is not needed for SDK completeness. Public readers use
a separate client whose bearer is qg_report_<share UUID>; the public method sends
only optional password/date fields in a POST body and never URL query parameters.
Explicit share calls retain snapshot/live-folder scope, conversion/indexing
opt-ins, password and expiry controls. No implicit publication during create/run.

TypeScript gets exact saved-report/filter/share inputs and metadata responses,
with decimal revenue preserved as strings in aggregate result types. The dynamic
SDKs use their incumbent maps. Native tests must execute every new method through
the actual HTTP handler and migrated database, including personal CRUD/version
conflicts, session-vs-key denial, plain/protected public reads, body date filters,
share revocation, deletion cascade and page cursors. Documentation explains the
three credential kinds and production-release status. Existing approved feature
scope covers this additive design; no schema or production writes are planned.

### Saved report SDK contracts checkpoint

TypeScript, Python, Ruby, PHP and Go now expose named saved-report create/get/list/
versioned-update/delete/run methods, explicit share create/list/revoke methods,
and GET/POST public aggregate reads. Private report methods use current account
sessions, preserving personal ownership and membership/events checks. Machine
keys still receive 403 and another valid workspace owner cannot read personal
reports. Public readers use a separate qg_report_<share UUID> capability client;
password/date inputs stay in bounded POST bodies, never query parameters. No
operation publishes implicitly or adds retries. Transport limits and HTTP status/
Retry-After errors remain. TypeScript exports exact filter/metadata/share/public
DTOs; aggregate decimal revenue remains strings. PHP serializes empty filter and
date arrays as objects, including explicit empty public POST bodies.

All five native SDK suites and all five examples pass through the actual HTTP
handler and migrated isolated PostgreSQL. Each native suite executes all ten
new methods, two-page cursors, stale edits, other-account and machine-key denial,
private aggregate execution, exact decimal-string response types, plain/protected
public reads, body-only date changes, revocation and report-deletion cascade.
PHP additionally verifies empty filter/date objects. Final SQL confirms native
SDK reports are cleaned before subsequent HTTP fixtures. Existing link/root,
resource/policy, QR/custom-artwork, domain lifecycle, conversions and sanitized
share checks continue to pass. Strict TypeScript SDK checking/declaration emission
and Python/Ruby/PHP syntax checks pass; Go formatting and native compile/tests
pass using the existing ignored runtime. No schema changes, production writes,
remote provider/DNS calls or package publication occurred. Credential/method
contracts and release status are documented in sdk/redirects/README.md.

The report SDK gap is implemented locally. Required team discovery/account and
permission/invite work remains, alongside domain lifecycle/DNS automation, native/
deferred deep links, branded password pages, customer enrichment, Segment/GTM,
signed outgoing webhooks and controlled service/infrastructure release and SDK
publication. The full Dub parity goal remains active; this checkpoint does not
prove production readiness or remove remaining scope.

### Private customer enrichment design

Attach a versioned private profile (name, email, HTTPS avatar URL) to an existing
recorded external customer ID. Keep conversion IDs/events immutable. A separate
service-only RLS table avoids widening existing Data API views or public dashboard
DTOs. Read profiles and chronological journeys through authenticated scoped APIs;
read requires events:read and a currently visible customer visit/conversion.
Writes/clear require links:write plus events:read and edit authority over every
attributed link for the customer, avoiding cross-folder identity changes through
a partial key/member grant. Recheck current key/member/owner under the shared ACL
lock. Members cannot impersonate another actor. Unknown/unseen identities return 404. Use version null for first enrichment and current UUID for subsequent writes;
clear removes only identity fields and advances the version, preserving journeys
and conflict protection. Reject arbitrary metadata/unsafe avatar URLs; no backend
fetch or automatic enrichment from public sites.

Add GET/PATCH/DELETE /customers/profile and GET /customers/journey using encoded
customer IDs in query/body fields, not path interpolation. Journey keyset cursors
retain scope on every page. All five SDKs gain profile/journey/edit/clear methods.
The existing journey panel shows an inline profile and explicit versioned edit/
clear controls; account/customer selection keys prevent stale profile display.
Avatar loads are anonymous with no referrer and an initial fallback. Public
reports stay aggregate-only and never include profiles. Trusted applications can
supply consented identity through the API; no implicit disclosure during tracking.
Verify real SQL scope/version/clear/private grants and actual owner/member/key
HTTP plus five native SDKs, focused UI races/conflicts and desktop/mobile browser.

### Customer identity and scoped journeys checkpoint

Implemented service-only RLS profiles for existing external customer IDs, with
versioned optional name/email/HTTPS avatar, current actor/key/member validation,
scoped reads and identity-only clear. Writes require events:read plus links:write
and edit access to every attributed link; partial grants and viewers cannot alter
shared identity. Customer attribution and profile scope checks serialize per
customer. Clear advances the version and preserves journeys. Anchor deletion
cascades identity removal; explicit later enrichment can re-anchor to a remaining
conversion without restoring erased fields. Profile fields never enter public
report DTOs, redirect payloads or event exports; there is no backend avatar fetch.

GET/PATCH/DELETE /customers/profile and chronological GET /customers/journey use
opaque IDs in encoded query/body fields and bounded paired cursors. All five SDKs
expose profile get/update/clear and journey methods, including exact response types
in TypeScript. The conversion panel and analytics activity table open the same
private profile/journey surface. Editing prefills identity and captures a version;
conflicts require discard/reload. Clearing is confirmed and preserves the timeline.
Account/customer changes remount drafts and abort reads, query keys include the
account, denied refreshes hide old identity, and anonymous no-referrer avatars
fall back safely. Conversion cache keys now include the current account as well.

Evidence: full migrated platform SQL passes including profile/private grants,
unknown identity, stale insert/edit/clear resurrection denial, partial key/member
edits, impersonation, viewer caps, scoped hidden-source exclusion, chronological
cursor pages, unsafe input, current-key revoke, FK erase and explicit safe
re-enrichment. All five native SDKs/examples pass through actual HTTP/migrated SQL;
new methods exercise opaque UTF-8 IDs with colon/slash/ampersand, stale versions,
pages and identity-only clearing. Real HTTP additionally moves a customer sale to
a hidden link, proves partial-grant edit denial and scoped exclusion, restores the
fixture and proves public reports exclude stored name/email. Twelve focused tests
across four files pass, covering input/cursor bounds, returned-identity guards,
prefill/background version conflict, clear, late saves after account remount,
denied-refresh hiding and anonymous avatar fallback. Targeted lint/format and
strict SDK TS pass. App ratchet remains 704 inherited errors, none new; build passes
(32.29s). All 2,283 migration versions and Postgres 17 grammar/body checks pass.
Desktop/mobile browser fixtures verify edit/save, viewer permissions and identity
clear while retaining visits/leads/sales, with no horizontal overflow at 390px.
API is simulated there; CSP/fetch block remote requests. Shared evidence images:
outputs/redirect-dub-parity/customer-identity-desktop.png,
customer-identity-mobile.png and customer-identity-cleared-mobile.png. Tab closed
and viewport reset. No production/schema/provider writes or publication occurred.

Customer enrichment is implemented locally. Continue through signed outgoing
webhooks, Segment/GTM, native/deferred deep links, branded password pages, domain
lifecycle/DNS automation, team/account/invites/all-source permissions and controlled
infrastructure release plus SDK publication. The full goal remains active.

### Durable outgoing webhooks design

Current Dub references include link.created/link.updated/link.deleted/link.clicked,
lead.created and sale.created, plus event logs. Implement those six events and an
explicit webhook.test event, not only the earlier click/lead/sale ledger subset.
Use a transactional PostgreSQL outbox; inline callback fetches would hold public
redirects hostage to receivers, and a memory queue would lose accepted events.
Configured endpoints are workspace-owner managed. Current owner sessions and
unrestricted owner-minted keys with workspace:write plus events:read can manage
subscriptions; members and ID-limited keys cannot expose workspace events.

Create/update/pause/archive/restore endpoints, choose event types and optional
managed link IDs, and show a random 256-bit signing secret once on create/rotate.
Private RLS subscription/event/delivery/attempt tables expose only explicit DTOs.
Default event data omits customer identities, destinations, query/referrer secrets,
passwords and private notes; an explicit customer-ID opt-in includes only the
external ID, never enriched name/email/avatar. Link lifecycle updates deduplicate
within a transaction, excluding visit counters, with latest canonical short URL;
policy/metadata/tag changes are also updates. A narrow private-schema trigger
queues immutable event metadata without widening client grants. No receiver call
occurs inside a click/conversion transaction. Optional bounded pg_net wakeups and
a minutely cron both invoke the internal dispatcher using existing Vault config.

Drain bounded leased jobs with one active delivery per endpoint and current owner/
subscription checks. Settings changes cancel pending deliveries via a routing
version; already-sent in-flight messages cannot be recalled. Store attempts before
network IO, recover expired leases, retry network/non-2xx failures with bounded
exponential backoff and Retry-After, and fail terminally after eight attempts.
Delivery is at least once: stable event IDs/body permit consumer deduplication.
Manual replay reviews the stored event/current endpoint and version, preserves
logical event ID and attempt history, and never silently replays on writes.
Retain completed delivery history for 30 days and remove expired prior secrets.

Use Standard Webhooks HMAC-SHA256 over id.timestamp.rawBody with webhook-id,
webhook-timestamp and webhook-signature headers, plus delivery/key-version tracing.
Rotation has a 24-hour overlap and dual signatures; queued jobs use current keys.
All five SDKs expose management/history/test/replay/rotation and bounded constant-
time receiver verification, checking timestamp tolerance and raw bytes before JSON.

For outbound requests, validate HTTPS and public DNS/IP addresses on every attempt,
pin the chosen public IP with Deno.connect, then Deno.startTls verifies the original
hostname with normal trust roots. Use HTTP/1.1 with exact body length, no cookies/
credentials/redirects, bounded headers and a 4KB plain response excerpt. This
avoids DNS rebinding without excluding Cloudflare-hosted receivers (Workers raw
TCP cannot serve that complete destination set). Close pending/active sockets on
timeout; never fall back to ordinary unpinned fetch. Recheck the leased job after
DNS and before signing/sending. Deno is now available as an isolated official
2.9.6 runtime under ignored tmp/deno-runtime; production Edge runtime proof remains
required. Native tests use local TLS with a test-only trusted CA/connector mapping,
assert public-IP pin and hostname checks and make no third-party callback writes.

Owner UI uses incumbent form/list controls for subscription choices, one-time
secret copy, current version edits, pause/archive confirmation, test delivery,
raw event/response/history inspection, replay review and rotation review. Bearer
secrets stay in local state. Account/selection changes reset drafts/secrets and
abort reads; stale writes require reload. Verify SQL transactions/ACL/leases/
retention, actual HTTP/all five SDKs, native TLS/SSRF/signature vectors, UI races
and desktop/mobile evidence before controlled release. This design is within the
approved full feature scope and does not mark other requirements complete.

Sources: https://dub.co/blog/introducing-webhooks,
https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md,
https://docs.deno.com/api/deno/network/ and
https://supabase.com/docs/guides/functions/connect-to-postgres.

### Outgoing webhook implementation and local evidence (2026-10-14)

Migration `99991792014604_redirect_webhooks.sql` adds service-only subscriptions,
transactional event/outbox capture, one lease per endpoint, bounded retry and
retention, versioned routing cancellation, test/replay, secret rotation overlap,
and a Vault-backed minutely dispatch job when pg_cron is available. Lifecycle,
click, lead, and sale triggers exclude private destinations/profile identity;
customer IDs are subscription opt-in. Current-owner and unrestricted-owner-key
checks run in SQL. Native Edge management/history endpoints and the private
dispatcher are implemented; the gateway configuration delegates authentication
to their existing internal-secret/account guards.

The dispatcher resolves fixed DoH A/AAAA queries, refuses any private/mixed DNS
answer, connects to the selected numeric address, verifies the peer, and upgrades
TLS against the original hostname with normal trust roots. It never follows
receiver redirects or forwards caller credentials. It rechecks the lease after
DNS and before signing. Parallel acknowledgements settle before returning an
error. Rounds stop after 40 seconds before starting further work; each delivery
has a 20-second bound. SQL cleanup and leases remain durable on process failure.
No optional per-insert pg_net wakeup was added: the durable minute schedule is
used to avoid creating network jobs inside high-volume click transactions.

Owner controls in Link workspace include version-preserving prefill, filtered
subscriptions, customer-ID opt-in, pause/archive confirmation, restore paused,
explicit tests, one-time signing secret copy, rotation, payload/response/attempt
history and explicit same-payload replay. Account/selection remounts abort late
requests and remove secret state. All five SDKs expose eleven management/history
methods plus raw-body verification helpers with five-minute timestamp tolerance
and bounded dual rotation signatures.

Evidence: complete platform SQL passes with real capture, lifecycle coalescing,
no click-counter lifecycle events, payload privacy, scoped key denial, current
owner loss, rotation, stable retry body, eight-attempt exhaustion, paginated
attempts, stale mutation/replay rejection and 30-day pruning. Nine native Deno
transport tests pass, including a real trusted local CA/TCP/TLS handshake and a
wrong-hostname rejection. Four admin interaction tests pass (prefill/version,
secret erasure on account switch, no /null history reads, stale draft reload).
Five SDK native runtimes pass all management methods over HTTP -> actual handler
-> migrated isolated PostgreSQL, and share independent HMAC fixtures for valid,
tampered, expired and rotation verification. Strict TypeScript SDK checks pass;
app ratchet remains 704 inherited errors, none new. All 2284 migration versions
are unique and migration PostgreSQL 17 grammar checks pass.

Actual browser controls were exercised in a local API-simulated preview with
production fetches blocked: edit/save, receipt inspection, explicit replay,
desktop/mobile layout. Screenshots at
`outputs/redirect-dub-parity/webhook-management-desktop.png` and
`webhook-management-mobile.png` document local layout, not live queue delivery.
Native test CA files remain disposable ignored tmp artifacts. Production Edge
TCP/TLS, cron/Vault invocation, gateway auth, multiaccount role revocation,
rate/resource budgets and controlled receiver receipts still require release
proof. No production webhook receiver, schema, Worker or site was changed.

This feature is a local release candidate. The overall Dub parity goal remains
active: Segment/GTM, native/deferred deep links, branded password pages, domain
archive/transfer/subpaths and authorized DNS automation, team/account discovery
and invitations/all-source folder permissions, plus controlled infrastructure
release and SDK publication are still required. Existing QR/customer/report
candidates also retain their documented production verification requirements.

### Native Segment/GTM integration design (2026-10-14)

Dub's current Segment guide explicitly includes both a destination (Segment ->
conversions) and a source (customer events -> Segment). Implement both with native
Segment Functions, whose documented handlers and secret settings are available
without registering a new global catalog product. Alternative approaches are a
plain webhook URL (insufficient inbound native mapping) or a new global catalog
submission (requires provider approval outside this repository). Native Source
and Destination Functions plus in-product setup are the implementation choice.
Do not claim a global Segment catalog listing or an installed account connection.

The Destination Function maps configurable lead/sale event names, stable message
IDs, customer userId, click ID properties/context traits, currency, explicit
major-unit six-decimal amounts and optional occurredAt into the existing scoped
conversion endpoint. Store an ID-limited conversions:write key in Segment's
secret setting; fixed queer.guide API origin only. Ignore unrelated events and
source events carrying the Redirects-origin marker to prevent a feedback loop.
Reject missing/unsafe IDs, numeric precision loss and missing sale currency;
retry provider network/429/5xx via Segment RetryError with stable event IDs, while
surface permanent validation/permission errors without leaking credentials or
response payloads. Do not import arbitrary Segment traits as private profiles.

The Source Function verifies Standard Webhooks original raw request text with
Node crypto/timingSafeEqual, bounded timestamp/body/signatures and optional old
secret during rotation, before parsing. Map explicit supported events into native
Segment.track using stable messageId and a Redirects source marker. Customer-ID
opt-in maps to userId; otherwise use event/click IDs as anonymousId. Copy only
allowlisted sanitized properties and retain decimal amounts as strings. Support
test events with a clear provider test event, and dedup stable messageId. Real
Segment debugger tests must verify raw-body availability and dedup behavior; the
official example buildpack supports request.text(), but is not production-runtime
proof. No settings in global state or logs.

GTM uses an importable server-container template with sandbox APIs, strict send
permission for https://queer.guide/api/redirects/track/{lead,sale}, typed fields,
a server-side conversion key and configured stable event/customer/click IDs.
Only validated trusted application/server events are conversion inputs; generic
browser dataLayer pushes must not fabricate verified payments. A browser helper
can expose consented attribution and events after trusted backend confirmation
for GTM trigger wiring, with no private key or browser conversion API calls.
Consent revocation clears attribution and disables subsequent pushes. Template
must report failure/success exactly once, bound requests, reject redirects, and
avoid forwarding unrelated event data, credentials or profile identity.

Owner setup UI offers downloadable provider source/template artifacts, field
mapping guidance, safe key/secret storage instructions, outbound subscription
prefill, and explicit local-vs-installed status. Existing API/SDK idempotency and
folder/link grants remain authoritative. Verify artifacts in provider-like
sandboxes plus actual HTTP -> migrated SQL fixtures; add native Google template
sandbox assertions and Segment inbound/outbound loop/precision/signature tests.
Actual Segment/GTM account installation, debugger receipts, third-party consent
and live delivery configuration remain release requirements, alongside the
existing Edge/cron deployment. Continue independent features while awaiting the
requested iOS/Android app IDs; app associations cannot be published with guessed
application identities.

Primary sources:
https://dub.co/docs/integrations/segment
https://dub.co/docs/integrations/google-tag-manager
https://www.twilio.com/docs/segment/connections/functions/destination-functions
https://www.twilio.com/docs/segment/connections/functions/source-functions
https://github.com/segmentio/functions-library/blob/master/buildpack/boreal/window.js
https://developers.google.com/tag-platform/tag-manager/server-side/api
https://developers.google.com/tag-platform/tag-manager/datalayer

### Native Segment/GTM implementation and evidence (2026-10-14)

Provider-specific downloadable artifacts are implemented in
`public/integrations/redirects/`: native Segment Destination/Source Functions,
an importable Google server-container template and a consented browser attribution
helper. The setup panel in Link workspace presents both Segment directions,
scoped secret settings, event/amount mappings and an explicit outbound webhook
prefill/review using the existing one-time secret/version/receipt controls.
Setup/form state is remounted on account changes; create review is a dedicated
editor, so it does not duplicate the full webhook list. Webhook field IDs are
unique when multiple editors appear. Provider installation status remains
explicitly unverified. No API key is collected in the browser setup form.

Native Segment inbound mapping rejects unsafe numeric revenue, preserves exact
major-unit decimal strings, requires stable IDs, avoids arbitrary profile traits
and skips our outbound origin marker. Ten-second handler/transport receipt
bounds and stable event IDs make unknown outcomes safely deduplicable at the API;
only provider temporary/429/5xx failures request Segment retries. Response bodies
are released without reading private fields. Native outbound mapping verifies
raw-body Standard Webhooks signatures and rotation/timestamps using Node crypto,
then emits allowlisted `Segment.track` events with stable message ID and source
marker. Customer IDs require the subscription opt-in.

The Google template uses sanctioned sandbox APIs (including RE2), a SERVER-only
container context, explicit trusted-backend and analytics-consent gates, typed
bounded fields, and exactly two permitted HTTPS conversion destinations. It
reports one receipt and keeps server credentials out of web tags. The browser
helper makes no network/API writes, validates UUID/30-day attribution, preserves
dataLayer, supports explicit CMP grants/revocation and handles cookie-disabled
storage without uncaught errors. Its attribution event is not a payment proof.

Evidence: provider-like sandbox assertions pass for exact decimal limits,
loop prevention, private-field omission, rotated/tampered/expired signatures,
fixed URLs/permission declarations, timeout and receipt failures, invalid tag
fields, consent/trust gates and cookie/attribution erasure. Six React tests across
integration/webhook controls pass. The five-SDK HTTP suite adds a full adapter
fixture: limited server key -> actual HTTP/handler -> migrated conversion SQL,
duplicate Segment lead, exact Segment/GTM sale amounts -> signed real transactional
outbox bodies -> native Segment.track, followed by origin-loop suppression. No
foreign API is called. App ratchet stays at 704 inherited errors, none new;
targeted lint passes and the production build passes (~20 seconds).

Actual desktop/mobile browser setup was exercised in the isolated API-simulated
preview with production fetches blocked: native Segment download links,
source-URL review with exact prefill and privacy default, review close, provider
switch and Google downloads/helper. Evidence images:
`outputs/redirect-dub-parity/segment-setup-desktop.png` and
`gtm-setup-mobile.png`. Test tabs closed and viewport reset. This confirms local
UI behavior; actual Segment runtime raw-body/dedup, secret redaction, Google
native import/sandbox/runtime permissions/redirect behavior, real consent wiring
and provider debugger installation remain required release evidence. The global
provider catalog has not been submitted or claimed. Local artifacts are not yet
published to the live site.

PR4378 (tracking/prefill/QR original work) was rechecked and is MERGED from
feature/redirect-link-tools; it does not contain this parity branch's later
candidates. The overall goal remains active. Native/deferred deep links need the
requested real iOS Team/bundle ID and Android package/signing fingerprints.
Other independent work continues: branded password pages, domain lifecycle/DNS
automation, invitations/account/all-source permissions, plus controlled
infrastructure release, provider debugger tests and SDK publication.

### Branded password page design (2026-10-14)

Add per-managed-link password-page branding, independently of social preview and
QR preferences. A simple HTTPS image URL would allow third-party tracking and
uncontrolled changes; embedding preview images would conflate distinct features.
Choose immutable controlled PNG/JPG uploads through the existing public
redirect-brand-assets bucket and durable reservation/cleanup infrastructure.
A new private versioned branding record references its own asset. A short plain
brand label and custom logo are explicitly public decoration; no destination,
password/hash, customer identity or owner notes appear before unlock.

Expose scoped GET/PATCH and upload for `/links/{id}/password-branding`. Read uses
links:read, edit/upload requires links:write plus current folder edit and selected
IDs. Owner sessions are verified against current role; member sessions must match
the principal. Keys are scoped server callers. Store the original principal in a
15-minute immutable upload reservation; finish rechecks current grants, link,
version, exact scope and reservation. Bound PNG/JPG to 1.5 MB and 1024 px, use
SHA-256 metadata, no SVG/remote URL/logo ID selection, one Storage POST without
blind unknown-outcome retry, existing actor/global/per-link pending budgets and
late-object tombstone cleanup. Add branding references to every cleanup guard;
replaced/cleared/deleted-link assets get the existing one-hour cleanup grace.

The public resolver looks up only minimal published brand label/asset after the
valid managed link is found. Password challenges, incorrect-password and
throttled pages show the same branding; errors fail to the generic page when
branding cannot be read rather than disclosing destinations or bypassing the
password. Renderer accepts only the fixed bucket/UUID image URL, escapes the
plain label, gives logo dimensions/alt text, uses anonymous no-referrer images,
and restricts img-src to the configured Storage origin. A failed logo decode
keeps the usable password form. HEAD remains empty. Password hashing, POST form
secret handling, attempt quotas and signed relay remain unchanged.

The policy dialog includes a separate branding editor with version-preserving
prefill, upload/progress, clear-logo, explicit saved public preview, conflict
reload and account/link remount/cancellation. All five SDKs expose branding read,
versioned label/clear and controlled upload. Verify migrated SQL grants/current
revocation/version/cascade/cleanup, actual HTTP reservation -> Storage -> finish,
public resolver challenge/throttle/header isolation, malformed images/URLs, native
SDKs and desktop/mobile public/editor UI. Actual Storage/cleanup/gateway release
proof remains required; a preview-only image is not feature completion.

### Password-page branding implementation and local evidence (2026-10-14)

Migration `99991792014610_redirect_password_branding.sql` adds independent private,
versioned per-SHORT branding, explicit public label/minimal immutable asset
metadata, current owner/member/key/link/folder checks, bounded upload reservations
and same-principal/current-version finish. Existing shared asset claim/receipt
cleanup excludes branding references; clear/replace/delete schedules the one-hour
grace. Parent delete/type statement locks preserve ACL-before-row order during
FK releases. Branding changes emit sanitized link.updated events without exposing
artwork or labels in outgoing lifecycle payloads.

Private GET/PATCH and POST logo endpoints use the existing fixed Storage transport
and validated PNG/JPG input. The public handler reads only minimal branding after
finding a valid password-protected managed link. Challenge, incorrect-password
and throttle pages are decorated with escaped plain labels, fixed bucket images,
anonymous/no-referrer requests and restrictive CSP. HEAD skips decoration and
stays empty. Missing/unavailable decoration leaves a usable password form; no
password value, hash or destination is embedded by the branding renderer.

The link-behavior dialog adds a separate editor, with version-preserving name
prefill, byte/dimension/actual browser decode checks, verified saved-image preview,
explicit clear review, conflict reload, independent name/upload saves and retained
unsaved names after an own upload. Account/link keys abort late writes and clear
drafts; denied reads hide prior decoration. The surrounding policy dialog cache
now includes account/principal, remounts forms across accounts/links, hides data
after denied refresh and prevents an old form's completion from closing a newer
one. Branding is shown for managed SHORT rows. All five SDKs implement typed
read, versioned name/clear and controlled upload methods.

Evidence: full migrated SQL passes including scoped hidden links, viewer caps,
member impersonation denial, version/principal/role/key changes during upload,
retained labels, public field privacy, attached-logo exclusion from cleanup and
FK release. Five native SDK/HTTP suites exercise all three methods through actual
handlers, migrated SQL and exact immutable Storage bytes. Additional owner HTTP
proves stale/SVG rejection before Storage, one unknown-receipt POST, no lost-owner
attachment, minimal public fields and physical orphan/delete cleanup. The SDK
fixture now uses an actual current owner as key creator, rather than an impossible
random creator without a user/role. Cleanup fixture rounds scale to its additional
assets and never claim a retained branding reference.

Twenty-six focused public/editor/resolver tests pass across four files, plus the
actual domain Worker -> signed root resolver -> migrated SQL suite proves escaped
brand label/controlled image metadata, empty HEAD, no pre-password destination or
visits, wrong-password branding and successful original policy behavior. Native
Deno checks for API/resolver and strict TypeScript SDK checks pass. App ratchet is
704 inherited errors, none new. All 2285 versions are unique and migrations pass
the PostgreSQL 17 grammar; production build passes (~21 seconds). Targeted lint
passes. Native provider/storage execution remains separate release evidence.

Actual browser editor QA used a synthetic PNG in an isolated API/Storage fixture:
FileChooser/read/decode, immutable upload, SHA/dimension verification (128px
natural dimensions), saved name preserving logo, clear review and completed
removal preserving the label. Desktop/mobile images at
`outputs/redirect-dub-parity/password-branding-editor-desktop.png`,
`password-branding-editor-mobile.png`, `password-branding-cleared-mobile.png`.
`password-public-mobile.png` renders the actual public HTML with only controlled
image transport substituted locally and a visible fixture caption; real CSP/
metadata/auth behavior is independently checked by the resolver tests. No
production asset/data was changed. Tabs closed and viewport reset.

A read-only authenticated check of the actual live admin page shows **20,354
redirects** and pagination over 408 pages, confirming the original empty-list
issue is resolved. Original PR4378 remains merged; later candidates are local.

### Current-owner credential audit design (2026-10-14)

Correction to the preceding baseline-only finding: ordered migration
99991792014410_redirect_link_policies.sql already drops redirects_public_read
and revokes public execution of resolve_short_redirect. Preserve this established
password-aware routing and add an effective-schema regression check; no redundant
public routing redesign is required. Production policy state remains uninspected.

The confirmed gap is unbound owner API keys: management_scope returns their IDs
without checking the creator's current admin role, and authentication validates
only hash, expiry and declared scopes. Recheck current creator role in the shared
scope function and invoke scope validation during authentication. Bound member
keys retain their existing active member, folder and selected-ID checks. Acquire
the common ACL lock before credential/role rows and role mutation statements;
role loss then serializes with in-flight authorized database transactions. Scope
checks remain service-only. Keep trusted internal NULL principals unchanged;
owner-session actor propagation and all-source discovery are a separate pending
audit. Test role removal/restoration, no nonexistent owner, current member scope,
unchanged selected-ID limitations and effective public table/RPC denial. Update
older fixtures to create real owners instead of impossible random creator IDs.

### Current-owner keys implementation and evidence (2026-10-14)

Migration 99991792013725 checks the current creator admin role for unbound owner
keys in the common management scope and runs current scope validation during
credential authentication. Role mutations acquire the established ACL statement
lock before rows; authentication acquires ACL then locks its token for update,
so concurrent last-used writes do not upgrade shared token locks. Bound keys
retain active member/folder/selected-ID checks. Scope helpers remain service-only.
Old impossible random-creator SQL/CSV fixtures now create actual current owners.

Full platform SQL, actual CSV -> migrated PostgreSQL, and all five native SDK ->
HTTP -> Edge handler -> migrated SQL suites pass. Regression checks deny both new
authentication and subsequent resource operations after creator role loss,
reject an existing ordinary creator, retain selected IDs and permit restored
roles. Effective ordered-schema checks confirm legacy public SELECT is absent,
raw resolver execution denied to anon/authenticated, and ordinary accounts cannot
read SHORT targets. All 2286 migration versions are unique; Postgres 17 grammar
checks pass. No production schema or provider configuration was changed.

Remaining work includes current owner-session actor propagation, all-source
member listing/organization, account discovery/invitations, domain transfer/archive
and automated DNS, native/deferred deep links with real application identities,
controlled infrastructure release, provider installation/runtime evidence and
SDK publication. The implementation branch is prepared for draft review; this is
not full completion or a claim these candidates are deployed.

### Review branch and current-main release checks (2026-10-14)

Draft PR https://github.com/tmaeder/queer-guide-hub/pull/4417 is attached to this
chat; feature/redirects-dub-parity is pushed independently of the other owner's
release branch. Current origin/main is merged, including its target normalization
fix. Three regression cases preserve relative, uppercase absolute and normalized
single-slash HTTPS targets with query/fragment and HEAD/GET visit semantics;
the newer live policy/domain/password resolver remains intact.

After integration: 18 resolver tests, actual root Worker/signed resolver/SQL,
full platform SQL and five SDK HTTP suites pass. Native Deno API/resolver checks,
2320 unique migration versions/PostgreSQL 17 grammar and build (~20 seconds)
pass. App ratchet is 702 inherited errors, none new (current baseline 782); no
baseline was expanded. Fixture screenshots remain local QA, not release proof.

Both CI and deploy Edge-test jobs now generate disposable certificate fixtures
before Deno discovery. TLS tests resolve fixture URLs relative to their module,
so they work from both repository root and the workflows' supabase/functions
working directory. Nine transport/TLS tests pass from both locations without
relaxing TLS validation. Fixture generation uses no dependencies or credentials;
private test keys remain ignored under tmp and are freshly generated each run.
The draft remains incomplete; no merge/deploy is claimed.

### Authoritative member administration design (2026-10-14)

The /members route currently checks an admin JWT and performs privileged table
reads/mutations separately. Replace its service-client table operations with a
single service-only RPC receiving the actual session user. Under the common ACL
lock it checks the current admin role before listing, creating, patching or
removing members. Keep current REST field validation, offset pagination and
response shapes, and validate fields again in SQL. No machine key may administer
membership. This preserves existing UI behavior while closing stale-role and
check-to-write gaps. Member queries include account identity, use no retained
cache after unmount, and denied refresh suppresses earlier rows. Remount member
form state by account so late responses cannot clear another account's draft.
Verify actual HTTP -> migrated SQL, lost actor role, missing/ordinary actor,
existing user/machine creation and safe field restrictions.

### Member administration and CI remediation evidence (2026-10-14)

Service-only member administration now checks the actual acting user's current
admin role under the ACL lock in the same transaction as listing/mutations. Both
SQL and REST validate fields; membership identity cannot be rebound by PATCH.
Member cache keys include the account and use gcTime 0; account changes remount
form drafts, denied refresh hides old rows, and late old mutation completion
cannot clear the current account's draft. Four UI tests pass. Full SQL and actual
HTTP/migrated SQL prove machine creation/list/patch/delete, scoped-key denial,
missing/ordinary actor denial and stale admin-claim read/delete rejection. All
five native SDK suites pass. App remains 702 inherited errors, none new; build
passes (~24 seconds), native API Deno check passes, focused lint passes.

The first draft CI exposed migration ordering against current main: this branch's
unmerged migration versions had been overtaken by 34 newer main migrations.
All 34 branch-only, never-deployed migrations were renumbered using the mandatory
allocator, in their original dependency order; reference updates were performed
by that tool. No main/applied migration was renamed. A fresh effective-schema,
version/grammar, root-routing and five SDK run verifies the resulting names/order.

CI lint corrections retain deliberate ASCII-control rejection with explained
rule annotations, document the intentional GET branch, use const in the dispatcher
test and preserve generated ambient Worker declarations without a runtime import.
Local full lint must exclude ignored tmp/.wrangler artifacts created by runtime
fixtures; no production-source directory is excluded. CodeQL's two findings were
in test assertions: password-page destination absence and HTML escaping. Those
assertions now reject any matching destination host and check tags regardless of
case. Seven report-page tests and 25 focused resolver/password/member tests pass;
new CodeQL/CI results remain to be checked after push.

Latest draft CI now clears lint, CodeQL and local-version ordering; its migration
job still fails because production history contains an unrelated applied migration
20261014210405_editorial_rejection_history absent from the repository. Read-only
Supabase history confirmed its name and sole 867-byte statement. That exact
recorded SQL is recovered at its already-applied version; it is not renumbered,
re-applied or replaced with a no-op. This follows the drift job's recovery
instruction and does not change production. The historical migration adds a
nullable generated uniqueness discriminator for rejected editorial drafts.

### Owner-session scope context design (2026-10-14)

Shared management functions use NULL as the trusted workspace-owner/internal
principal. For authenticated browser sessions, the Edge handler will construct
its own service client with x-qg-redirect-session-actor set solely from the
verified Auth user; inbound headers/JSON cannot choose it. PostgREST exposes that
header as a transaction-scoped request.headers setting. The shared scope function
checks its actual current admin role under the ACL lock before a NULL principal
receives unrestricted access. Bound user-session principals must match the
authenticated actor. Server API keys and internal jobs keep explicit key scopes
or their trusted service-only behavior; public roles cannot invoke this helper.

This avoids rewriting every signature or introducing synthetic owner member IDs
that existing member/key helpers would misinterpret. Actor-specific domain,
branding, report and webhook functions continue their explicit current-role
checks. Direct service table writes outside scope functions (notably credential
management) remain a separate audit, so this is not a claim all session mutations
are checked yet. SQL tests and the actual HTTP harness must pass request context
per SQL statement without leakage between requests and prove stale owner claims,
wrong member identity and spoofed incoming headers cannot grant access.

Primary request-context reference:
https://postgrest.org/en/stable/references/transactions.html

### Owner-session scope context implementation and evidence (2026-10-14)

Verified browser identities now get a separately constructed service client whose
actor header comes only from Auth.getUser; an inbound header cannot set it. The
shared service-only scope checks the current owner role for NULL principals and
the matching user for member sessions under ACL locks. Native HTTP fixtures
materialize request.headers separately in each migrated SQL statement; trusted
job fixtures reset it to an empty object. Full SQL and five SDK HTTP suites pass,
including stale admin-claim /links denial and an inbound spoof naming another
current owner still denied. Member identity mismatch and current ordinary-user
owner-scope escalation are denied. Native Deno, lint (no errors) and 2323-migration
Postgres 17 grammar checks pass. These changes do not affect the frontend build.

Next authorization audit: credential creation/list/revoke still uses direct
service-table operations, and direct authenticated Redirects RLS/organization
RPCs still trust cached admin JWT roles. Bring those paths under actual current
owner checks without changing public automatic-alias routing or granting members
raw table access; continue all-source discovery/organization afterward.

### Direct Redirects RLS and legacy owner policy design (2026-10-15)

The remaining authenticated table policies and organization RPCs use the cached
admin JWT claim. Add a narrow no-argument current-owner check for Redirects,
using the actual auth.uid and current user_roles entry under the ACL/role locks.
Use it only for Redirects private/admin RLS and its campaign/organization RPCs;
do not change the app's global JWT helper or public automatic-alias routing.
No member gets raw private-table access. Existing admins keep the same abilities;
revoked roles lose direct table writes/reads without waiting for a new JWT.

Legacy save-redirect-policy will send the verified actor context on its service
client and the policy setter will invoke shared write scope, closing the earlier
service bypass while retaining trusted internal fixtures/jobs. Update old SQL
fixtures that claim admin without an actual user/role to use real owners. Verify
cached admin claims after current role removal, ordinary account denial, unchanged
current owner organization behavior, private table/grant policy shapes and legacy
policy save behavior. Token administration remains next, followed by all-source
member management and invitation/discovery flows.

### Direct current-owner RLS implementation and evidence (2026-10-15)

The narrow no-argument Redirects owner helper checks actual auth.uid/current role
under the shared ACL lock. It uses no row-locking SELECT, so PostgREST's read-only
table GET transactions remain usable; the role-mutation statement trigger uses
the exclusive same lock. Eleven private/admin table policy sets replace only the
admin JWT predicate, preserving all other predicates, commands and roles. Campaign,
metadata and bulk organization RPCs use the current helper. Public automatic-alias
routing and the global app JWT helper are unchanged. No raw member-table grants
were added; anonymous callers cannot execute the owner helper.

Legacy policy saving now sends only the verified actor, calls scoped policy writes
and reports role revocation as 403. Password changes reserve the existing actor/
link/global hourly budget before PBKDF2, giving 429/Retry-After before hashing.
Five handler tests pass, covering actual forwarded context, revoked role, hashing/
removal and pre-hash quota denial. Full migrated SQL proves retained current owner
organization abilities, denied direct reads/inserts and metadata/campaign calls
with a stale admin claim, denied legacy owner policy writes and successful reads
in a READ ONLY transaction. A first policy-shape assertion matched the retained
SQL output alias AS has_role_jwt; it was corrected to inspect actual function calls.
All five SDK HTTP suites still pass; native Deno and lint pass, and all 2324 SQL
migrations pass PostgreSQL 17 grammar. Old admin fixtures now have real users/roles
and actual sub claims. No production migration was applied.

Latest draft CI has passed migration-history/version, lint and CodeQL checks.
The critical-data-quality job reports production city_safety_gate_drift with two
venue records (ceiling zero). This is production data queried by that job; these
Redirects candidates have not changed production. Record it as release evidence,
not a reason to weaken the gate or modify unrelated venue data without a reviewed
fix. Continue independent Redirects work: authoritative credential administration,
all-source membership, account discovery/invitations, remaining domain/app features
and controlled infrastructure/provider/SDK release.

### Authoritative credential administration design (2026-10-15)

Replace /tokens owner-session service-table operations with a service-only RPC
that checks the verified acting user's current admin role in the same ACL-locked
transaction as list/create/revoke. Preserve the existing response fields, 100-row
offset pages and explicit member/selected-link binding. Validate name, expiry,
scopes, links, active member, digest and prefix again in SQL. The server generates
the secret and sends only its digest to SQL; return metadata containing neither
hash nor secret and expose the secret once after a successful creation. Caller
JSON cannot select actor, hash or prefix. Revoke stays idempotent and immediately
invalidates scope/auth checks. Test current/lost/ordinary actors, stale JWT claims,
unknown/hidden bindings, shape/privacy and actual HTTP behavior. Preserve the
existing current creator checks for unbound keys and current member checks for
bound keys. This closes the remaining direct service write identified in /tokens.

### Credential administration implementation and evidence (2026-10-15)

Service-only list/create/revoke now validates the actual current owner in the
same ACL-locked transaction, including scope/expiry/member/SHORT binding checks.
An explicit metadata projection excludes hashes, secrets and creator identity;
only the Edge handler returns its generated secret after successful insertion.
Revocation is idempotent and invalidates subsequent authentication. Unregistered/
machine callers cannot manage credentials. SQL and actual HTTP -> migrated SQL
prove current/ordinary/lost-owner checks, stale JWT list/create/revoke denial,
invalid/inactive bindings, one-time response, private lists and key revocation.
All five native SDK suites still pass with those owner HTTP tests.

Credential cache keys include account identity; metadata and mutation entries use
gcTime 0. Unmount aborts requests, creation never automatically retries, and
account changes remount drafts/secrets. A late old-account response cannot render
or clear a new draft. Denied refresh hides private rows/secrets and disables
creation; failed mutations refresh the current account's list to review unknown
receipts. Eleven UI/hook tests pass, including distinct account caches, physical
mutation-cache removal for a successful secret, aborted pending creation, denied
refresh and cross-account late receipts. The selected-link picker now includes
custom-domain/root SHORT rows and excludes PATH even when its source starts /go/.

Native Deno, lint and PostgreSQL 17 grammar pass (2325 migrations). App ratchet
remains 702 inherited errors, none new; production build passes (~19 seconds).
This remains a candidate awaiting controlled publication. No production key,
member, schema, provider or asset was created or changed. Account/invitation and
all-source workspace work, remaining domain/app behavior and live release evidence
remain active scope; the production venue data-quality gate is still recorded
separately. No overall completion is claimed.

Credential authentication now returns denial for inactive/revoked authority, as
it already did for expiry/missing scope. Later resource checks still raise 42501.
This keeps known lost-owner/member credentials at HTTP 403 instead of older API
branches treating their auth RPC error as transient 503 and retrying it. Full SQL
and five native SDK HTTP suites pass, including a newly created key's /links
request after its creator loses admin role. No privileges were broadened.

### All-source member inventory design (2026-10-15)

The live owner inventory already spans manual SHORT/PATH, fourteen slug-alias
families, venue/username aliases and declarative static/client rules. Member
workspace and scoped REST listings currently expose managed SHORT rows only.
Extend member inventory/organization to the actual sources, retaining the existing
managed-link editor and analytics rather than pretending automatic routes are
editable short links.

Client-only filtering is insufficient for API keys and private comments; copying
all live aliases into another table would become stale. Use a service-only database
view over the real alias/manual rows plus a generated, source-controlled static/
client manifest derived from the existing parsers. The Edge handler alone supplies
the manifest; caller bodies cannot inject it. No public source routing or target
entity content permission changes. View permission covers the source/destination
route descriptor and workspace metadata; source records remain owned by their
original routing/entity systems.

Add paginated /inventory and private metadata/organization endpoints with current
owner/member/key/folder/selected-ID enforcement under the ACL lock. Unrestricted
owner keys can view all; selected-ID keys retain only their allowed managed SHORT
rows. Members see unfiled sources and their readable folders, and may change only
comments/tags/archive/folder organization when their current rank and links:write
allow it. Require destination edit permission for folder moves. Keep public aliases
publicly routable independently of private workspace listing. Unknown/hidden records
share the same unavailable response; recheck grants and existence for every write.
Bulk organization is atomic, source-base fields are immutable through these routes,
and metadata versions preserve drafts across concurrent edits.

Static/client rows keep the existing semantic metadata keys. Tag aliases have a
physical bigint ID; support a distinct row identity if duplicate source histories
appear, while metadata continues following the semantic source URL. Read-only
production schema inspection confirms all fourteen alias foreign keys are UUID,
venue aliases have UUID IDs, tag aliases have bigint IDs and the others use old
slug/username keys. A read-only aggregate found zero duplicate tag source URLs.
No individual routing records were returned or changed for this schema discovery.

The member page gets an Other redirects section with source/kind/search/folder/
archive filters, clear read-only base-field labels, private metadata editor,
folder/tag/archive actions and applicable source copy/QR/managed-link prefill.
Never fabricate concrete targets for client parameterized descriptors. Update
five SDKs, REST docs and the existing scoped permission SQL/HTTP/UI fixtures.
Verify hidden/unfiled/folder/selected-key boundaries across all sources, stale
writes, role/permission revocation, immutable routing and generated-manifest parity.
Owner inventory behavior and the existing managed-link capabilities remain intact.

### All-source inventory candidate checkpoint (2026-10-15)

A service-only live source view, generated 399-rule static/client manifest,
scoped inventory paging, versioned metadata and atomic organization RPCs are
implemented locally. No routing source table is copied or modified. Metadata
revisions use UUIDs and are stamped for existing owner paths too. Source tags
with physical bigint IDs retain distinct row identities while sharing the old
semantic metadata key. Private view/functions are revoked from public clients.

The member workspace now includes Other redirects, source-kind filtering,
organization drafts, archive/restore, source copy/QR and managed-link prefill.
Parameterized, reservation and regex source definitions do not fabricate concrete
QR URLs. Metadata drafts keep their original version; explicit reload replaces
conflicted drafts. Atomic selected-source folder/tag/archive controls are also
implemented. The manifest generator is checked in the Node lint CI job, which
has TypeScript installed; the Deno-only job remains dependency-independent.

Local evidence so far: full SQL tests cover all source kinds, hidden folders,
view/edit ranks, selected-key bounds, inactive members, immutable routing,
versions and atomic rollback. Five SDKs expose/list/get/organize and pass actual
HTTP -> handler -> migrated SQL, in addition to their existing full suites.
Sixteen focused member/source UI tests pass, native Deno and TypeScript SDK checks
pass, app ratchet is 702 inherited errors with none new and production build
passes (~27 seconds). Targeted lint has no errors. Still finish this phase's
bulk-control tests, browser checks, docs, current full verification and review;
this checkpoint is not full all-source or overall completion. All changes remain
local candidates. No production routing/data/schema has been modified.

### All-source validation and CI repair (2026-10-15)

The candidate now passes 18 member/source UI tests, including versioned bulk
organization, conflict/no-retry behavior and source-kind selection reset. Browser
fixture checks verified bulk archive, fresh organization prefill/comment save and
390px layout. The fixture blocks external requests and uses simulated records;
its screenshot is `outputs/redirect-dub-parity/all-source-mobile.png` in the shared
workspace. It is not production evidence. API and five SDK docs now describe
source definitions, opaque row/cursor identities, metadata-only writes and grants.

The existing global workspace write lock serializes metadata creation as well as
updates. A conditional upsert also checks the expected revision before returning
a saved result. Full isolated SQL and all five native SDK HTTP/SQL suites pass.
A local PostgreSQL/Wasm fixture of 20,354 PATH records returned 50-row owner/member
pages in 269/651 ms respectively. Those timings are local smoke evidence only.
The 399-rule generated manifest and all 2,326 migration grammar checks passed.
The production build passed in 34 seconds before the final semantic typography
adjustments; final app type/build verification follows below.

CI on the previous pushed head additionally exposed route-family omissions,
missing schema type columns, a stale CMS test expectation and the raw typography
ratchet. These are corrected using existing page families/semantic tokens and the
three columns actually introduced by branch migrations. All 67 targeted tests pass.
The 18-combination QR rasterizer test is parameterized per combination, preserving
every decode assertion while avoiding one aggregate 15-second CI timeout.

Read-only migration history inspection found applied version 20261014225550,
`event_safety_after_venue_geography`, absent from Git. Its sole recorded 1,014-byte
statement is recovered verbatim as a migration file. No DDL was executed, no
version was renumbered and no placeholder SQL was added. The independent
production city-safety gate failure and overall parity/release requirements remain
open; this candidate is not an overall completion claim.

Final candidate verification: app typecheck is 702 inherited errors, none new;
production build passed in 34.55 seconds, Deno check passed and targeted lint has
zero errors (one existing-style Fast Refresh mixed-export warning). Candidate
60981554c is pushed to draft PR4417. Production was not deployed or mutated.

Latest CI additionally identified `venues.zzzzzz_venues_safety_gated` as a trigger
without a creating migration. A read-only comparison of all 2,290 applied history
versions against tracked files found exactly one missing file: 20261014231145,
`venue_safety_after_geography`. Its exact recorded statement is recovered too;
this accounts for the production trigger and preserves reproducible rebuilds.
No trigger or data was changed by this recovery. CI must run again on this head.

### Invitation design under the approved parity scope (2026-10-15)

Existing member administration requires an account UUID. The next capability is
recipient-bound invitations for the current shared link workspace. Three options
were considered: owner account search (still excludes people who have not signed
up), emailed invites (requires explicit delivery configuration/authorization), or
owner-copyable invitation links bound to a verified email. Implement the last
option first. No email is sent by creating an invitation.

Only a current owner can list/create/revoke. Create generates a 256-bit random
secret server-side, stores its hash and returns a fragment-based link once. A
seven-day expiry, per-owner/global creation budgets and current-creator-role
recheck constrain outstanding grants. Invites offer member/viewer roles only.
Acceptance requires a verified account matching the invited email. It creates an
ordinary workspace membership with existing folder defaults. An existing active
membership retains its current role; an inactive membership requires explicit
owner reactivation. It never grants site-admin rights or silently upgrades an
existing viewer. Invalid/expired/revoked/mismatched invites share one response.
Replays by the same accepted account return the same membership; other accounts
cannot use the secret. Revoking a pending invite does not remove an accepted
member; normal member controls manage membership after acceptance.

Keep invitation tables/functions private to service_role, check authority under
the existing ACL transaction lock, avoid logging secrets, and clear one-time link
state on account change/unmount. The member page accepts a pasted invite or a
fragment, strips it from browser history after capture, and refreshes access on
success. Test database, real handler and UI boundaries (recipient confirmation,
role loss, replay, expiry, revocation, viewer preservation and account lifecycle).
This does not introduce multiple independent tenant workspaces or claim native
app/provider/runtime release evidence.

### Recipient-bound invitation candidate (2026-10-15)

Implemented owner list/create/revoke and verified-account acceptance, private
hashed storage, seven-day validity, 20-owner/100-global hourly creation budgets
and 200-account hourly acceptance budget. Owner authority is rechecked under the
ACL lock. A narrow security-definer boolean Auth helper checks the actual verified
recipient without giving the runtime direct Auth email read permissions. Pending
links are manually shared; no message/email delivery was invoked.

Acceptance preserves an existing active member's role and rejects an inactive
member. An accepted invite cannot recreate a deleted membership. The SQL tests
caught the latter null-membership replay and it was fixed before publication.
Expired/revoked/wrong-recipient/unverified/lost-creator invites share the unavailable
response. Lists never expose hashes or secrets. API credentials cannot administer
or accept invites, and owner session loss is enforced by actual database roles.

Owner settings now includes invitation creation, one-time link display/hide and
pending/expired/revoked/accepted state. The member page accepts an explicit paste
or fragment, clears fragment history and consumes a 15-minute, tab-scoped sign-in
handoff once. Sign-in navigation excludes the token from the redirect query.
Account-keyed remounts and lifetime guards discard late old-account receipts.
No automatic mutation retry occurs. Explicit native browser fixture tests cover
creation/acceptance and 390px layout; external requests are blocked, all data is
simulated and no email was sent. Screenshot: shared workspace
`outputs/redirect-dub-parity/invitation-mobile.png`.

Evidence: full isolated SQL (including creation budget, current role/verified
recipient, expiry/revocation, viewer preservation, replay and no public grants),
actual HTTP -> handler -> migrated SQL in the existing five-SDK suite, six UI/auth
handoff tests, member/member-administration regressions, native Deno and targeted
lint pass. Production build passes (52.48 seconds); final ratchet check follows.
This closes the local single-workspace invitation candidate, not multiple tenant
workspace controls, external delivery or the overall parity/release objective.
On the previous pushed head both migration history and critical data-quality CI
gates now pass after the exact recorded migrations were recovered. Full CI must
run again after the invitation changes are pushed.

### Native-link association design under the approved scope (2026-10-15)

The next phase supplies host-specific app registration and association documents.
Static environment-only JSON would prevent admin configuration and multiple apps;
generated files in the build would become stale after app/domain changes. Use a
private, owner-managed live registry and fixed public renderers instead. This is
one part of the full native/deferred-link requirement; resolver/SDK/deferred
attribution and actual-device verification remain required after this foundation.

Each binding names a built-in or registered custom hostname, platform, public app
identifier, Android signing fingerprints, allowed short-link paths and enabled
state. Start disabled. iOS uses a full application identifier (prefix plus bundle
ID); Android uses package plus one or more release signing fingerprints. Save and
delete use optimistic revisions. Only actual current owners can administer;
machine/member credentials cannot publish associations. Recheck the publishing
owner and custom-domain ownership/provider/TLS readiness for every public fetch.
Serve only explicitly public association fields, never registry labels, creators,
challenges or domain defaults. Disable/delete takes effect on the next fetch,
subject to Apple/Android's own cached association lifecycle.

Generate Apple's `applinks` appIDs/components and Android's Digital Asset Links
statements plus Android 15+ dynamic path rules. Built-in paths are restricted to
/go/; custom host paths stay under that host. Require the app's static manifest/
entitlements to agree; Android versions below 15 do not apply dynamic rules.
No wildcard app identifiers, arbitrary JSON, credential sharing or webcredentials
claims are accepted. The public endpoint is JSON-only, bounded, no-store and never
redirects or fetches submitted destinations. Pages handles both built-in hosts
before localization/SEO/static fallback. The branded Worker handles the exact
well-known paths before normal slug routing; HTTP methods and upstream responses
are bounded and validated. Unconfigured/disabled hosts return empty documents;
unready custom hosts return unavailable, with no SPA/error-HTML masquerading as JSON.

The native app must resolve the received canonical link through the policy-aware
resolver before opening app content, including password, expiry, quota, targeting
and attribution rules. App associations alone do not prove this behavior. Keep
all protected-link/native/deferred requirements open until the native flow and
actual runtime evidence exist. No real identifiers were provided yet; use clearly
labelled test identifiers only in isolated fixtures and never publish them live.

Sources reviewed: Apple's Supporting associated domains and TN3155 (app IDs,
components, per-host HTTPS without redirects), Android's Configure website
associations and dynamic rules (signing certificates, per-host JSON and Android
15+ path rules), and Cloudflare's current Workers/Pages routing guidance.

### Native association and invitation inbox checkpoint (2026-10-15)

App identities, signing fingerprints, short-link path scope and explicit
publication now have an owner-only private registry, optimistic edits/removal,
current publisher/domain checks and a sanitized public projection. Apple and
Android generators serve both built-in hosts and the actual branded hostname
through the fixed public gateway before SEO/locale/asset/slug fallback. Responses
are bounded JSON without redirects, visitor credentials or relay secrets. Public
publication has a database byte budget with headroom for platform envelopes.

Full SQL tests cover default-disabled publication, both platforms, stale versions,
private grants, built-in path restrictions, cross-host isolation, stale TLS,
disabled domains/bindings, current publisher revocation and byte-budget rollback.
Five SDKs and actual owner/public HTTP -> handler -> migrated SQL checks pass.
The test runner now refreshes its simulated domain provider heartbeat between
native child processes; a long machine suspension had expired the original
15-minute positive fixture before Go. Production time checks were not changed.
The app registry/generator/Pages/Worker tests pass (25 focused cases across the
feature and typography checks). Deno, native Worker types, app typecheck (702
inherited, none new), production build, manifest parity and routing guard pass.
Gateway tests exercise actual Pages middleware and branded Worker JSON output.
The latest source changes still need final verification on their pushed head.

Native-browser fixture checks verified a default-disabled iOS registration,
edit/remove controls, Android fingerprint fields and 390px layout. No real app
was configured/published. The fixture blocks external requests and stores only
simulated data. Screenshot in the shared workspace:
`outputs/redirect-dub-parity/native-app-mobile.png`. Association files alone do
not complete native resolution, fallback/deferred attribution, app installation,
OS caches/verification or production hosting. Those remain in scope.

CodeQL on the prior head flagged two test-only writes of a fixed invitation token
to session storage (alerts1071/1072), not a real credential leak. Instead of
renaming the fixture to hide the warning, the runtime handoff is replaced with a
verified-account invitation inbox. No invitation token is persisted across
sign-in. Private inbox reads join the actual confirmed Auth email, current owner
role and pending/unrevoked/unexpired invitations; returned fields omit email and
secret/hash. Acceptance by ID uses the same verified-recipient and invitation
state checks as token acceptance. IDs do not authorize a different account.

The new SQL/HTTP/UI tests verify inbox scoping, confirmation, no token storage,
wrong-recipient denial, accepted/revoked/lost-owner removal and legacy pasted-token
support. Existing role preservation, deleted-member replay protection, expiry,
revocation and creation/attempt budgets remain. This supersedes the earlier
15-minute browser-storage handoff design and tests. No alerts were dismissed or
gates weakened. CodeQL must verify the new head. The previous pushed head's full
unit/integration test job and migration/data-quality checks passed; final release
and all remaining parity requirements remain unproven.

Final local verification for this checkpoint: app typecheck stays at 702 inherited
errors with none new; strict Pages production/test and branded Worker type checks
pass. Gateway tests live in the existing Cloudflare test project, preserving its
actual runtime types without introducing Cloudflare globals into browser types.
All 42 focused cases pass; the three gateway cases also pass again in the Cloudflare test project; full isolated SQL, all five
SDK/actual HTTP suites, Deno, targeted lint, manifest and routing guards pass.
The production build passed in 33.60 seconds. Wrangler 4.148.0 dry-run bundles the
branded Worker at 15.42 KiB (4.59 KiB gzip) and exits without upload/deployment.
The recipient inbox's native browser fixture shows explicit acceptance and removal
of the pending row; screenshot `outputs/redirect-dub-parity/invitation-inbox.png`.
All browser data is simulated, with external calls blocked. No production app,
association, provider, DNS, database or storage state was changed.

PR4417 merged externally at 2026-10-15 05:29 UTC as 198f18bd7 with head4ec7c8cc5.
The new native association/inbox work is synchronized with that main and belongs
in a focused follow-up PR. Prior-head checks and CodeQL alerts belong to the
merged PR; require fresh analysis of the follow-up. A merged PR does not by itself
prove successful production migrations, gateway deployment or native runtime.

PR4422 CodeQL reports success with no new alerts in changed code. Its migration
check found applied version20261015090032 absent from Git; read-only history
inspection recovered the sole 724-byte statement named
`20261015080702_event_safety_flag_write_guard` exactly into its recorded version
file. No production DDL/data was executed. The independent production quality gate
reports 15 current safety-flag inconsistencies (venues6, organizations9). Those
remain a release blocker; this work does not weaken that gate or rewrite data.

### Policy-aware native resolution design under the approved scope

Association files are only host authorization. The next phase resolves a canonical
short URL for an app through the actual existing web resolver and visit transaction.
A second native-only policy engine would drift; scraping/following web redirects
would lose password/expiry/preview semantics. Use explicit vendor Accept content
negotiation on the same built-in/branded URLs, with one shared policy/visit path.

Accept `application/vnd.queer-guide.redirect+json`. Successful responses are HTTP200
with protocol1, canonicalUrl, destination, original statusCode, mode(navigate/web)
and a nullable clickId. Expiry/default-domain fallbacks and cloaking use web mode.
Error responses keep the original status and return a closed error envelope,
never destination/policy/password HTML. HEAD returns no body and records no visit.
Native requests use form-encoded password POSTs only; reject password query fields.
Wrong/missing passwords share the challenge; existing throttles remain atomic.

Device/geo/A-B/expiry/disabled/quota checks and loop guards remain in the current
resolver. Preview crawlers cannot avoid a native visit by changing their UA.
Only presentation rendering differs. Native attribution defaults to denied and
is exposed only when both link tracking and the explicit attribution-consent
header are enabled. Otherwise omit clickId and strip tracking IDs from the result.
Aggregate visit behavior remains existing behavior. Do not persist a device ID or
fingerprint, infer consent, or implement probabilistic deferred matching.

Both gateways forward only the normalized native Accept/consent flags. They keep
existing signed IP/hostname relays, never follow a redirect, bound/revalidate the
native response schema/canonical source, strip unexpected fields/headers and fail
clearly on old HTML/redirect upstreams. Preserve existing ordinary web behavior.
The native clients must use HTTPS and configured short-host allowlists, keep
passwords out of URLs, handle web fallbacks explicitly, avoid automatic retries,
and obtain explicit consent before retaining/forwarding attribution. Native SDKs,
deferred attribution, actual entitlements/devices and controlled rollout remain
required after the transport foundation; no transport fixture is OS verification.

### Native transport candidate checkpoint

Explicit native Accept/consent headers now pass through both existing gateways
into the actual web resolver. Success/error envelopes are closed and bounded;
source/destination/attribution invariants are validated again at the gateway.
There is no separate native policy or visit implementation. Password queries are
rejected for native requests; forms/throttles still apply. Native attribution is
absent until both link tracking and explicit consent allow it. Expiry/default
fallbacks and cloaking return web mode, with no native app navigation promise.

Tests also demonstrated an existing credential-forwarding problem: a successful
password POST on a stored307 link returned307, preserving the form body. All
successful password submissions now use effective303; ordinary requests keep
configured status. This follows RFC9110 section15.4.4/15.4.8 and is tested across
all configured redirect codes. Native transport remains HTTP200 with the effective
status in its payload. HEAD now observes an exhausted quota without incrementing.

The actual Pages/Worker -> resolver -> migrated PostgreSQL fixture covers protected
POST/HEAD/challenges, query-secret rejection, consent off/on, iOS targeting,
canonical roots, default and expiry fallbacks, atomic quota and disabled state.
The harness models Node's streaming duplex requirement separately from Cloudflare
and creates a fresh native root after the web deletion assertions. No production
or external destination was contacted. Native SDKs, deferred attribution, actual
app identifiers/entitlements/devices and release remain required after this phase.

Native transport verification: all 44 focused tests pass, plus the actual
Pages/Worker/resolver/PostgreSQL root-link fixture. Strict Pages production/test
and branded Worker types, Deno resolver check, targeted lint and 2,332 migration
grammar checks pass. App typecheck remains at 702 inherited errors with none new.
The production build passes. Wrangler dry-run bundles 23.42 KiB (6.41 KiB gzip),
without deployment. Prior PR4422 test/critical-path/a11y/lint/CodeQL jobs all passed;
its migration history and independent data-quality failures require fresh CI.
Read-only inspection confirms the 15 drifted rows have stored true/expected false
(venues6, organizations9). Current venue/org safety triggers omit direct flag
writes, and the org safety trigger precedes address-derived country changes.
No production reconciliation or trigger change has been performed.

Authoritative new history changes the safety-blocker interpretation:
20261015170028 identifies the 15 venue/organization rows as deliberate review
holds with detached geography. The blanket safety-write guard/reconciliation
candidate was reverted before any production application, because it would clear
those holds. The applied gate now counts those records in a high-severity review
backlog; no threshold or protection is changed by Redirects. Recover its exact
missing history file for CI, then require fresh checks.

### Swift native client candidate

A local iOS15+/macOS12+ Swift package now consumes the reviewed native transport
through actual URLSession streaming, with explicit short/content host allowlists,
form password submission, default-denied consent, no cookie/cache/credential
storage, ten-second limits, 64KiB response budgets, cancellation and a redirect
refusal delegate. Closed payload/source/URL/UUID invariants are validated before
a typed result is returned. Only default-port HTTPS app-owned destinations in
navigate mode may enter app routing; other valid destinations require a browser.
Denied consent strips unexpected attribution from both the result and URL.

The package compiles with Swift6.3.2 on Apple Foundation with warnings as errors.
Nine executable contract groups use actual URLSession and isolated URLProtocol
fixtures; a macOS CI workflow runs the same package build/compiler/contract runner.
Command Line Tools here omit XCTest/Swift Testing, so the runner uses only Swift
standard-library assertions and compiles the real SDK source unchanged. No native
OS association/device, production endpoint, app install or deferred-attribution
proof is claimed. Android, deterministic deferred handoff, real app identifiers/
signing/entitlements, provider/runtime rollout and publication remain required.

Read-only production verification after the independently applied hold migration:
city_safety_gate_drift critical failures0; city_safety_review_holds high failures15
(venues6, organizations9). Recovered version20261015170028 exact sole2,886-byte
statement into its recorded version/name file; no SQL executed. All2,333 migration
files pass grammar/body validation. The final native Swift package/contract check
passes after the source-host case-insensitivity regression was added.

Final-head CI verified the Swift contracts and production critical quality gate.
An unrelated applied migration advanced the floor to99991792083673. Read-only
history confirms the native app/inbox migrations are unapplied; allocator moved
them to99991792085653 and99991792085751 respectively. Its first inbox allocation
collided in the same second with a sibling worktree; the version check caught it
and a fresh allocator version resolved it. No applied history was renumbered.
All2,333 local versions are unique and the version check passes. The only other
open PR4423 claims99991792083683, with no overlap. Full isolated platform SQL and
all five server SDK/actual HTTP suites pass again using the renamed migrations.
Cross-PR script itself lacks a local GH_TOKEN, so fresh CI remains authoritative.

The renumbered head passed Swift CI and its ordering check, but concurrent postal
work applied20261015173513 without a committed history file. Recovered the exact
sole2,361-byte postal_drain_single_admin_begin statement from read-only history.
It is already applied and must not be renumbered. All2,334 migrations pass SQL
grammar/body checks. Local differential version verification warns only because
that newly recovered low version needs remote credentials; authoritative history
was read through the Supabase connector, and CI will recheck with its token.
No postal cron or automation was executed or changed by this recovery.

Android preparation: the official Temurin JDK21.0.12.1+1 arm64 archive was
SHA256-verified against Adoptium metadata and extracted only under ignored tmp.
The runtime works. No Android source is implemented yet. Official OkHttp README
and Maven Central metadata agree on5.5.0, supporting Android21+/Java8+, with
Okio/Kotlin runtime dependencies and AndroidX Startup initialization. Consider a
scoped OkHttp client to guarantee per-client no-cookie/no-auth behavior rather
than java.net.HttpURLConnection's process-global CookieHandler. Native package
configuration and signed-device proof remain open.

### Android native client candidate and canonical root correction

A local Java API usable by Kotlin/Java Android apps now consumes the same native
protocol. It uses dedicated OkHttp5.5.0 with no cookies/cache/authenticators/
interceptors, redirect refusal, retryOnConnectionFailure=false, a ten-second whole
call deadline, bounded64KiB streams and single-use execute/enqueue calls. The
async API delivers typed results/errors on an I/O worker; its documented coroutine
bridge connects cancellation to the actual socket. The SDK owns/cleans its pool
and rejects use after close, including already-created unexecuted calls.

Actual loopback TLS contracts (ephemeral SAN certificates, restricted DNS and
socket routing; no external requests) pass password/form/Unicode/plus handling,
default-denied/granted attribution, private cookie isolation, app/browser mode,
canonical source, malformed/unsafe payloads and URLs, all error statuses/retry
bounds, known/chunked response limits, no Location following, connection-drop
nonretry, synchronous/async cancellation and the actual ten-second deadline.
Library/tests compile against Java8 API with source warnings as errors. Only the
intentional Java8 target-obsolescence warning is disabled. Android supplies JSON;
provided/test JVM JSON/TLS/mock-server dependencies are not bundled in client
source. The Ubuntu CI job uses the same native contract command with JDK21/Maven.
This is JVM/client transport evidence, not an Android install/build or signed
App Link device proof. Package publication and production rollout remain open.

Bare branded source hosts exposed an empty-path vs canonical-slash mismatch.
Both clients now normalize that comparison to '/' without changing the request's
query/fragment semantics. Swift's package and all ten contract groups pass after
the added root regression. Existing final pre-Android PR head has no failures;
only full tests/critical paths were still running at the latest observation.
Deferred install/attribution, actual native app identities/signing/entitlements,
device/provider release and the other original scope requirements remain open.

Android transport errors now discard raw messages/causes (which may contain an
upstream status line/URL), returning stable transport_failure/cancelled/client_closed
metadata. Synchronous/async cancellation and connection-drop tests verify that
boundary. Both clients explicitly reject ports outside0..65535 while preserving
valid external nonstandard ports as browser fallback. Final native suites are
repeated for those source changes. No TS/SQL production behavior changed in this
Android/root normalization phase; broader checks from the native transport phase
remain the relevant evidence for that unchanged code.

A real TLS negative control then demonstrated that org.json accepted an unquoted
protocol key. The Android production decoder now uses strict Moshi1.15.2 (current
stable metadata verified at Maven Central), keeping JSON only as a test fixture
serializer. The formerly failing case, single quotes and trailing documents now
pass rejection tests. No Kotlin reflection/code generation or native context is
required. Repeated full TLS/native Java8 contracts pass after the parser change.
The final Swift package and ten groups pass, including bare roots and invalid
ports. Pre-Android head5a8d59dec has every required CI check green, including full
tests, critical paths, migration versions, data quality and its configured CodeQL.

The two SDK workflows now initialize native-language CodeQL before their actual
compiler commands and analyze afterward, with scoped security-events write and
path-filtered runs. Existing CodeQL covered JS/Python/actions only; it does not
prove Java/Swift security analysis. Fresh native CodeQL/CI must prove the new SDK
head. No production or signed-device proof is inferred from those checks.

Fresh Android CI exposed the repository-wide *.xml ignore: the locally tested POM
was omitted from the first SDK commit. A narrow SDK/.gitignore !pom.xml exception
now tracks that exact build descriptor. The previous native Java CI stopped in
setup-java's cache lookup before compiling; it was not evidence about the client
runtime. The local compiler/TLS evidence remains valid and CI must rerun.
Concurrent production migration20261015180715 added four postal queue pruning
triggers without a repo file. Recovered its exact3,073-byte sole statement from
read-only history; this restores both history and trigger provenance checks. No
production cron/queue/trigger/data mutation was performed by this recovery.

The first Swift CodeQL run ended when the contract runner's180-second compiler
cap terminated the traced build before compiler output. That job is terminal, not
an observation timeout. Keep the regular native contracts untraced, then initialize
CodeQL and run a separate direct SDK compiler command with persistent output and
the job's20-minute budget before analysis. The same separation is used for Java,
forcing a clean production-source build under tracing. No test/analysis gate was
disabled and fresh CI is required to prove this pipeline.

Both SDK contract runners now load their baseline body from the actual backend
nativeResolution producer through a shared Node helper, with no network/DB calls.
Malformed and policy/navigation cases mutate that real body. This removes the
separate hardcoded success schema and makes a protocol producer/client mismatch
visible. Native workflows also run when resolver/gateway/protocol inputs change.
Local Android TLS contracts pass against that actual producer; the Swift package
and all ten contract groups pass against the same actual backend fixture.

PR4422 was updated externally by merging main as12a6639c7. Inspected the seven-file
base change and fast-forwarded the clean checkout; native sources were unchanged.
The new base floor99991792085742 overtook the unapplied app registry migration.
Read-only history confirms neither native app/inbox candidate is applied; allocator
moved only the app registry to99991792088922. The inbox remains above the floor.
The local version check's only uncertainty is the recovered applied180715 history
file without local remote credentials; it must not be renumbered. CI has those
credentials. Full isolated SQL and grammar checks are repeated after synchronization.

On the updated base, Android native contracts and Java CodeQL completed successfully.
Swift's untraced package/contracts passed; its distinct traced compiler step remains
live at job116594867235 and must be observed to completion, not restarted because
an observation window elapsed. The deferred native design now specifies atomic
one-visit receipts, live policy/version rechecks, original cohort preservation,
Play delivery, App Clip/group delivery and explicit consent/lifecycle rules. Real
platform setup/device proof and the other full-scope requirements remain required.

Swift native job116594867235 subsequently completed successfully, including its
direct traced build and CodeQL analysis. Both native language jobs are now proven
on the synchronized base; no source changes occurred in the migration rename.
The full isolated redirect SQL suite passes and2,339 migrations pass grammar/body
checks after that base update. Deferred linking itself is still unimplemented;
the committed design is the specification for the next phase, not completion
evidence. Its iOS path has the Clip create the original receipt while serving its
own useful functionality; the browser must not pre-mint a duplicate visit.

PR4422 merged externally at2026-10-15 18:54:57UTC as0680410b037f26e17e803bce31a4cd866c89497f
with headc8bea7364. The App Clip work began after read-only history confirmed the
registry migration was unapplied; merging made that original file immutable.
Restored its exact merged contents and moved the new column/check/index and
function replacements into allocator-created99991792095483_redirect_native_app_clips.
The isolated DB harness now applies this explicit successor. No old version is
rewritten or renamed for the App Clip addition, and no production DDL is executed.

The optional App Clip identity has owner UI/API input, typed/private DTO state,
parent/platform invariants enforced by SQL as well as input/render validation,
per-host uniqueness, publication/removal and private-label boundaries. Apple AASA
gets a bounded appclips.apps list only when configured, enabled and ready. Parent
Universal Link paths remain unchanged; Android's document remains byte-equivalent.
Gateways reconstruct this exact new root permission and reject unrelated/duplicate
Clip IDs, unknown permissions or fields. Domain/role/readiness checks also apply.

Current evidence:18 focused UI/helper/gateway cases, full isolated SQL, all five
server SDK/actual HTTP suites (including Clip creation/publication and role loss),
strict Pages production/tests and Worker types, app702 inherited errors with none
new, targeted lint, and full Edge API Deno check with an isolated lock/global npm
cache. The initial Deno npm-mode/frozen checks lacked existing transitive type
packages; no shared lock or type baseline was changed. Production build29.36s;
Worker dry-run24.84KiB/6.71KiB gzip;2,339-migration grammar checks passed before the
successor split. Repeat SQL/grammar after that split. Local browser save/edit retains
the Clip value with publication disabled; desktop and390px layouts are readable,
content width390px (no horizontal overflow). Screenshots app-clip-desktop.png and
app-clip-mobile.png are labelled isolated fixtures with external requests blocked.
This host authorization does not yet implement receipt creation/redemption or
prove a signed Clip/install/App Group transition. Those remain in the full scope.

After splitting the successor, full SQL and all five SDK/actual HTTP suites pass
again; the2,340-file grammar and unique-version checks pass. The original merged
registry file has no diff. No production app/association/data/provider state was
changed. The App Clip work belongs in a focused successor PR to merged4422.

The native resolver now loads link, policy, password hash and semantic routing
fingerprint in one service-only SQL snapshot. The visit writer locks redirect ->
policy and compares that original fingerprint before invoking the existing quota/
event writer. Counters, notes and generic update timestamps do not invalidate the
fingerprint; routing, protection, namespace, scheduling and quota changes do.
Timestamp inputs use epoch values so session time zones cannot change the digest.
The source path is checked against the locked link as well as the existing host/
root/readiness checks. Both web and native resolutions use this path; HEAD and
expired fallback behavior remain without visit writes. Deploy the additive SQL
before the resolver; there is no fallback to an unguarded visit on RPC failure.

Actual Pages -> resolver -> migrated PostgreSQL tests change a target after its
snapshot and rotate a password after verification, before the final write. Both
return closed410 without events; the current password alone succeeds.27 resolver
tests, full isolated SQL, all five server SDK/HTTP suites, Deno resolver check,
strict Pages/Worker types, lint and app ratchet702 inherited/none new pass. The
first server SDK run lacked the ignored Go runtime on PATH; with the installed
runtime it passes. No baseline, shared Deno lock or production state changed.

Added private deferred receipt transaction primitives behind a new default-false
app handoff flag. Creation checks explicit consent, conversion tracking, current
publisher/app/path/host readiness and the routing snapshot, then reserves the
visit and inserts a SHA256 digest-bound receipt atomically. Digest collisions roll
back the event/counter. Receipt state binds original click, app revision, source,
routing fingerprint and expiration; query/variant/destination stay in the existing
event. TTL is capped at24h and link/experiment expiration. Live private context
loads the current password and fingerprint together. Final locked consumption
checks current routing/app/role/source/expiry and the freshly selected original
destination/cohort, returns the original click once and creates no extra visit,
even at the already-reserved quota cap. Event/link deletion cascades receipts.
Cleanup is bounded to500 expired rows and is service-only. No raw receipt token,
password, visitor identity or device identifier is added to the receipt table.

SQL verifies opt-out defaults, denied consent, one-event reservation, quota and
collision rollback, source/target/cohort scope, replay, binding/policy/password/
publisher revocation, link/experiment TTL, bounded cleanup and cascade/private
Data API boundaries. This is the database foundation only: public native create/
resume transport, owner store configuration, browser install UI, automatic Play/
App Group adapters, signed-device proof and scheduled cleanup rollout still need
implementation/verification. No existing binding is opted in, and no production
DDL/app/provider state is changed. Keep the full goal active.

App Clip PR4430's first CI completed security/build/accessibility and migration
checks; the critical-path run had248 passes,18 skips and two live admin review
queue scope failures (initial queue/heading/response waits), outside these local
redirect fixtures. Its test job was still running at inspection. Preserve those
gates and inspect fresh CI rather than treating local redirect tests as an all-
repository release proof.

The next transport layer is now implemented behind the same default-false private
handoff flag. Creation/resumption requires native negotiation, explicit consent,
matching bounded action/app/token headers and a reserved install/resume marker.
Gateways reject malformed requests before proxying; the resolver also checks them,
so an older gateway dropping headers cannot turn a marked resume into a counted
visit. Tokens are header-only; creation returns validated token/ISO-expiry metadata,
redemption returns an explicit consumed acknowledgement, and success missing those
headers fails as an unknown outcome. The six-field JSON body is unchanged.

The handler uses the existing password throttle and shared target selector, restores
an unchanged original A/B bucket and query from the private event, applies an IP-
hash handoff budget and invokes the atomic create/consume functions. Cloaked or
expired navigation cannot mint a handoff. Current source/domain readiness, app and
publisher checks still apply. A quota already reserved by creation does not count
again at resume. Receipt expiry also respects a legacy policy expires_at value;
read-only production history confirmed the two pending migrations were unapplied
before adding that cap. No production schema or data mutation was made.

Evidence:40 focused protocol/resolver/gateway cases; full isolated SQL (including
legacy policy expiry); real Pages and signed branded-root Worker -> handler -> DB
creation/resumption; digest-only storage; original query/cohort/click, exhausted
original quota, current password, marker/consent denial, replay and rate limiting.
The first combined HTTP case exhausted the deliberately unchanged password throttle
using earlier tests' visitor; a separate fixture visitor tests the new flow without
weakening that throttle. Deno handler and strict Pages/Worker types pass; targeted
lint passes; Worker dry-run28.17KiB/7.48KiB gzip, no upload. Public receipt transport
is no longer missing. Owner store configuration, native SDK receipt methods and
platform adapters, browser UI, cleanup activation, signed-device/provider proof and
the rest of the full parity ledger remain open. Existing bindings stay opted out.

Both native core SDKs now expose explicit receipt create/resume methods. Swift
returns a typed resolution+receipt and resume result; Android reuses its existing
single-execution/cancellable synchronous/async call type with typed receipt and
consumed state. They require current explicit consent, add only the reserved marker
and bounded headers, use form POSTs (including no-password handoffs), validate
creation expiry/capability and consumed acknowledgement, reject web-mode/missing-
click outcomes and preserve the existing host/body/deadline/cookie/auth/navigation
boundaries. Receipts have canonical query-free source, binding UUID and bounded
TTL; string/debug descriptions redact capability values. They retain no state and
perform no automatic retry. Reserved marker/token query input fails preflight.

The shared native wire helper now produces creation bodies/metadata through the
actual backend response/receipt producers. Both native contract runners load that
fixture in addition to the ordinary six-field body. Swift's package builds with
warnings as errors and12 contract groups pass against real URLSession/URLProtocol;
Android Java8 compiles and actual confined TLS/OkHttp tests pass for receipt headers,
synchronous creation/async resume, original click/destination, consent/preflight,
expired/malformed/missing metadata and no unknown-result retries, alongside its
existing cookie/URL/body/cancellation/deadline cases. Fresh native CodeQL/CI is
still required for this head. Core SDK receipt APIs are no longer missing; platform
persistence/attempt adapters, browser/store controls, actual signed delivery,
publication and the other full parity requirements remain open. No production
or signing/provider state was changed, and existing app handoffs remain disabled.


Owner installation configuration is implemented in the existing native app editor
and session API. Public app name and fixed-provider store identity are distinct
from the private label; iOS additionally validates parent Clip and App Group.
SQL enforces complete metadata before opt-in, current publication, strict types,
optimistic revisions and automatic opt-out when older clients unpublish. The
service-only host/path choice projection excludes private configuration and
rechecks owner/role/readiness. No browser landing consumer is claimed yet.

Evidence:18 UI/helper cases, full isolated SQL including direct constraint and
private projection tests, actual owner HTTP and all five server SDK suites, and
Pages/signed Worker-to-resolver receipt integration pass. Strict Pages/Worker and
Deno API checks, targeted lint, the production build and app ratchet (702 inherited,
none new) pass. Desktop and390px fixture captures show save/edit persistence with
no horizontal overflow. One bounded Impeccable review returned ship; the independent
documenter confirmed no new design tokens or system rules. Fixture IDs only, with
external requests blocked. No production publication or signing/provider change.

CI for a6dc61fb7 passed critical paths, all application/native suites, a11y and
CodeQL. The migration gate found two pending versions overtaken by an unrelated
applied migration. Read-only production history confirmed all four candidate
migrations unapplied; the allocator renumbered them in dependency order. GitGuardian
also reports one finding without file-level annotations in its GitHub result;
its diagnosis remains open and is not waived by these local checks.
