# Redirect workspace isolation and domain transfer

Status: the identity/backfill and request-context foundation is implemented
locally. Multiple-workspace activation, full tenant isolation, transfer endpoints
and production transfer remain open.

The original Redirects workspace was global. Resource identity, private lookup
predicates, organization names and human membership uniqueness are now scoped to
workspace. Owners still come from application `user_roles=admin` for the legacy
workspace, and new-tenant activation remains fenced. Explicit ownership, remaining
resource-key uniqueness and public/service activation work must precede workspace
creation and transfer. Changing `redirect_domains.created_by` cannot establish that
boundary. Service-role RPCs bypass table RLS, so their own workspace predicates
remain necessary alongside direct-user RLS.

## Product contract

[Dub's transfer guide](https://dub.co/help/article/how-to-transfer-domains) states
that the custom domain and all associated links move together, analytics reset,
primary domains cannot transfer, tags do not move and the actor must have access
to the destination. The transfer is irreversible. Its
[workspace model](https://dub.co/changelog/introducing-workspaces) also gives API
requests a workspace identity. These are the required behaviors, independently
of this repository's current global owner model.

A transfer must be an explicit reviewed operation with the current source and
destination workspace, hostname, affected-link count and statistics-reset warning.
Require the typed phrase `confirm transfer domain`. Persist a short-lived review
operation bound to actor, both workspaces, domain/version and link-set digest.
At execution recheck both authorizations, primary-domain status, resource versions
and limits under locks. A concurrent change invalidates review and returns a
conflict. A committed transfer receipt is idempotent; an unknown HTTP result must
be recovered by operation ID, never blindly repeated with a fresh ID.

## Identity and authorization foundation

1. Add a durable workspace UUID and a single explicit legacy workspace identity.
   Backfill existing resources into it without creating new tenants or changing
   access. Existing global application admins own only this legacy workspace;
   they do not automatically own future workspaces.
2. Make memberships workspace-bound and unique on `(workspace_id,user_id)` for
   human users. Keep machine identities, inactive state, folder grants and token
   bindings bound to the same workspace. New workspace creation/invitations must
   remain unavailable until every resource path is fenced.
3. Require explicit workspace context on new owner/member/API operations. Account
   sessions prove current membership/role in the selected workspace; tokens carry
   one immutable workspace binding and cannot select another. A workspace header
   or parameter identifies a requested tenant, never grants access.
4. Replace the null-principal owner shortcut for new tenant paths. Carry actor,
   workspace and current role separately, and recheck in SQL at each authority
   boundary. Legacy RPC wrappers remain restricted to the legacy workspace until
   callers migrate. Never set tenant context in shared mutable JavaScript state.
5. Add workspace IDs plus composite uniqueness/FKs to resources and relationships.
   A folder/tag/domain/token/report/customer must not be attached across tenants.
   Every service-role query and RPC must explicitly constrain workspace; RLS is
   an additional boundary, not a substitute for that predicate.

## Resource fence inventory

The conversion must cover all of these before exposing a second workspace:

- Links and namespace allocation, metadata, policies, domains and root links,
  folders/tags/assignments, campaign templates, scoped inventory and imports.
- Memberships, folder overrides, access requests/mail/inbox, invitations,
  preferences, primary domains, token grants/scopes and machine bindings.
- Events, variants, conversions, customer identity/journeys, reports, team report
  discovery, public snapshots/shares/passwords and analytics/export queries.
- Branding/QR/password assets and reservations, public cache revocation, deep-link
  apps/store associations, install/handoff receipts and consented attribution.
- Domain provider jobs, ownership renewal, Domain Connect reviews/callbacks,
  instruction-mail jobs/receipts, webhooks/delivery/replay and integrations.
- All API routes, five SDK contexts, owner/member UI query keys, background claims,
  resolver/gateways and static/CMS aliases. Public requests infer tenancy from the
  authoritative hostname/link, never from a caller-supplied workspace claim.

Repository-wide read/write tests must show that two owners with the same names,
folders, customer external IDs and resource slugs see only their own data; the
legacy owner's null-principal access cannot cross the legacy workspace boundary.

## Atomic transfer behavior

Keep the globally unique hostname and stable public link URLs. Move all links on
that domain together; do not allow a partial page of links to transfer. Detach
source folder/tag assignments; never copy source memberships, API keys, secrets,
customer profiles, private reports or integration credentials into the destination.
Preserve target/routing behavior and required link policies, with an explicit
mapping for each dependent resource rather than silent cross-tenant references.

Reject primary-domain transfer. Source primary preferences and other references
must not remain capable of selecting a transferred domain. Destination setup must
not claim ownership/TLS/routing from transfer alone. Invalidate source-bound setup
reviews, mail/ownership/provider leases and private caches without falsely
claiming to recall email or undo an already issued provider approval URL. Provider
jobs need a reauthorization generation so stale workers cannot update the new
workspace after commit.

Reset domain/link analytics as the documented transfer behavior requires, with a
complete dependency map for conversions/customer joins/variant counters and public
report caches. Do not delete unrelated workspace data. Webhook/outbox deliveries
must not expose source event payloads to destination subscribers, nor send new
destination events to source subscribers. Keep a minimal private transfer receipt
and authorization audit, not a hidden copy of reset analytics exposed to a new
owner. Real production transfers remain deliberate owner actions through the
review flow; no transfer is executed as part of implementation or tests.

## Implementation gates and evidence

First ship non-activated identity/backfill/schema constraints and isolated SQL
proof. Then convert authorization helpers and all resource RPCs, API/session/token
context, readers/jobs, and owner/member UI/SDK contexts. Only after two-workspace
SQL and actual HTTP/SDK isolation matrices pass can creation/switching be enabled.
Transfer review/commit/status is last, with concurrency tests for role revocation,
primary/version/link changes, stale provider/mail work and lost-response recovery.
Finish with bounded desktop/mobile review and controlled runtime release evidence.

Existing release integration ownership and intentional data-quality holds stay in
force. No change goes to the separately owned integration branch. Unavailable
provider/store credentials are not a reason to omit independent isolation work,
but local tests cannot certify live provider, app-store or production behavior.


## Identity foundation implementation checkpoint

Migration99991792110542 creates a private workspace registry and seeds one stable
legacy UUID. All40 Redirects resource tables receive a non-null workspace ID with
a constant legacy default and a validated activation fence. Provisioning rows can
exist privately, but cannot become active or hold resource data while legacy
readers remain unscoped. Workspace identities are immutable and the legacy
identity cannot be disabled/deleted. No existing data is reassigned by creator.

All40 internal relationships now use composite workspace/identifier FKs, backed
by17 parent uniqueness constraints. Existing CASCADE/RESTRICT behavior is retained;
SET NULL applies only to nullable relationship IDs, never to the workspace ID.
These FKs are initially immediate and can be deferred for a future atomic
transfer. Global identifiers and existing uniqueness rules remain until their
readers/writers have been converted.

A service-only `redirect_workspace_context` checks the current account, selected
legacy identity and owner/membership under the ACL lock. Owner authority comes
from current SQL state rather than stale JWT role metadata. Private account
`GET /session` returns workspace metadata; `GET /workspaces` returns the one
currently accessible workspace and role. API keys cannot discover account
workspaces. Private API requests reject unsupported/malformed/empty/duplicate
workspace headers before mutation; the branded gateway preserves those headers.
All five SDKs support an explicit immutable client context and account discovery.

The backfill fixture seeds existing links, events, metadata, folders/tags, domains
and membership before applying the migration, then compares every existing value
across all40 tables after migration. SQL proof covers current roles, session
spoofing, provisioning denial, immutable identity and complete table coverage.
Separate rollback-only relationship fixtures temporarily remove three activation
checks solely to prove that cross-workspace folder/tag/member/token attachments
fail at composite FKs; activation checks in the migration remain intact. Existing
delete/cleanup contracts verify cascade and SET NULL behavior. Actual HTTP/five
SDKs cover context propagation, account discovery, stale claims, invalid/unknown
selection, independent Go clients and rejected selection with no mutation.

Next: convert memberships/owners, all resource RPCs/readers/jobs, public resolution
and UI/SDK selection contexts into genuine isolated tenants. Do not remove the
activation fences or claim transfer is implemented from this foundation alone.


## Core membership and administration conversion checkpoint

Migration99991792111872 adds a private request-workspace selector and explicit
workspace predicates to22 existing core administration/ACL functions: current
principals/session context, member and credential administration/authentication/
metadata, invitations/inbox, folder resources/access/capabilities/owners, and
access requests/notifications/mail claims/acknowledgements. Inserts carry their
workspace explicitly. Unknown, inactive or foreign principals now fail rather
than becoming the null owner sentinel. Selected-link credentials cannot retain
foreign link IDs; read-only credentials cannot create links. The fixed legacy
activation guard remains and no new workspace is exposed.

The API now supplies the canonical selected workspace alongside its verified
account actor on its private service client. Member/token administration and
manual tracking use current SQL workspace role, with no cached JWT admin filter.
A separate conversion-write guard rechecks manual account owner authority under
the ACL lock; an actual HTTP race removes ownership after context verification
and proves that the conversion is denied and not inserted. Verified-account
native signup attribution retains its existing separate timing/identity rules.
This final-authority guard does not complete tenant conversion of analytics.

All40 resource tables have an additional restrictive legacy-only policy for
anon/authenticated direct Data API access, intersecting existing current-role
policies and granting no new permission. Service-role paths still need explicit
tenant predicates; these policies are not proof of service-role isolation.

Rollback-only fixtures seed a foreign workspace after temporarily removing its
resource activation checks. SQL and real owner HTTP prove that the converted
pages/counts do not expose foreign members, credentials, folders/tags/templates,
invitations or access requests; foreign IDs cannot be read/changed/deleted/
revoked/granted/authenticated. Foreign mail is neither claimed nor acknowledged.
A second human membership for the same account is exercised only in the SQL
fixture after temporarily removing global user uniqueness; session lookup still
chooses the legacy membership. The product uniqueness/activation checks remain
unchanged. Direct authenticated RLS fixtures independently deny foreign reads,
updates, deletes, inserts and workspace moves. All foreign state stays unchanged.

The previous45ce full CI exposed a missing workspace module in the older API unit
harness (29 API tests failed;1842 other files passed). The harness now loads the
real helper and models SQL context authorization separately from business RPCs.
All29 existing API cases and five new context/role/header cases pass locally;
the focused workflow now includes this file, for100 cases overall. No assertion
or production guard was weakened to repair the harness.

At that checkpoint the original helper-reference inventory still included
customer access, inventory/link mutation, password-branding actor, QR drafts and
reports. Subsequent checkpoints below convert private link/QR/report boundaries;
customer/analytics and remaining service/public readers/jobs still require tenant
conversion and model changes before removing activation fences. Workspace owner
membership, per-workspace uniqueness, multiple-workspace creation/switching and
reviewed atomic domain transfer remain required.


Managed link and inventory isolation checkpoint: migration99991792123545 converts
14 private link/inventory/policy/preview helpers to explicit workspace predicates.
Managed inventory rows must bind to their physical workspace root; client manifest
entries cannot impersonate managed rows. Legacy static/CMS coverage stays intact.
Managed list counts, metadata/tags, linked-domain facets, policy/presentation,
variant metrics and branding authorization exclude foreign resources. Link/domain/
folder/tag destinations are checked before mutation; global public URL uniqueness
still prevents takeover. Metadata/policy upsert conflicts cannot silently update or
ignore a foreign association. Foreign preview/password requests are denied before
CPU/provider budgets. The existing global abuse caps are intentionally unchanged.

Rollback-only SQL fixtures prove mixed-batch atomicity, unchanged foreign snapshots,
foreign-ID denial and metadata collision rollback. Real owner HTTP plus all five
SDK runtimes prove private list/count/inventory/facet isolation and foreign edit,
delete, upsert, domain/tag/folder assignment, policy, metadata, variants, branding
and preview denial. All existing SQL and HTTP/SDK contracts pass. No product
activation fence was removed and no production schema/configuration changed.
QR assets, reports/customers, remaining service/public readers/jobs, tenant owner
model and per-workspace uniqueness still require conversion before activation.
The domain transfer and controlled release remain open; this is not parity proof.


QR and saved-report isolation checkpoint: migration99991792121517 converts22
QR/style/logo and saved-report/share functions or triggers. Private QR lists,
serialization, inherited branding and link-style lookup constrain the selected
workspace. Logo reservation/finish checks resource identity before any attachment;
style-key upserts reject a foreign conflict atomically. The QR creation-log trigger
copies the new image's authoritative workspace. Existing principal/actor/global
abuse caps remain, alongside workspace-scoped resource quotas.

Personal/team report pages, counts, direct access, mutation, publication and share
expansion now constrain workspace. Saved-report execution supplies an explicit
workspace-root allowlist to the older analytics reader. Broad local publications
cannot collect foreign roots. Public QR/report capabilities are explicitly limited
to the sole active legacy workspace; provisioning records cannot be served or
expose password hashes, and denied public reports spend no view/hash budgets.
This is a staged legacy guard, not public multi-tenant resolution or activation.

Rollback-only SQL fixtures include foreign records owned by the same global admin,
so the tests require workspace separation independently of creator ownership.
They prove foreign style/asset/draft/report/share denials, unchanged exact snapshots,
style collision rollback, no foreign branding inheritance, local publication root
selection and creation-log workspace propagation. Existing SQL contracts pass.
Actual HTTP/five-SDK checks, final-head CI and remaining customer/analytics,
provider/public/job/cleanup paths and model conversion are required before release.
Product activation fences and global key uniqueness remain intact. No production
schema, configuration, provider, email or app-store mutation was made.


Link/QR/report verification:100 focused cases, complete migrated SQL and rollback
isolation fixtures, the40-table backfill and actual owner HTTP/five SDK runtimes
pass locally after both migrations. HTTP denials preserve exact foreign records
and report view/password budgets; the legacy inventory's legitimate read budget
is measured before the QR/report denial sequence. All2354 migration versions and
SQL bodies validate without exemptions; targeted script lint/format/diff checks
pass. Previous d511 full CI38834417691 and focused CI38834417752 both completed
successfully. New exact-head CI remains required; no live release was performed.


Customer/analytics isolation checkpoint: migration99991792122076 scopes9 customer,
conversion and analytics functions. Private customer access, profile reads/writes,
chronological events and conversion attribution use the selected workspace. A
foreign click/anchor is unavailable; global customer/event-key conflicts fail
atomically instead of returning a foreign receipt or silently keeping its anchor.
Profile reads cannot enrich local activity with a foreign same-key identity.
Global external-ID uniqueness and customer locks remain pending model conversion.

Analytics filters bind to authoritative visit workspace, preserving local visits
without a current root and existing event DTOs. Folder/tag predicates and variant
metrics are scoped. Existing authenticated invoker analytics/journey/variant RPCs
remain fixed to legacy under current-role RLS, including when a foreign header is
supplied. A separate PL/pgSQL service-role branch uses the private selector; no
selector execution grant was widened. Native signup keeps separate verified
account/timing semantics and cannot attribute a foreign click.

Complete migrated SQL, rollback-only customer/analytics fixtures,40-table backfill
and actual owner HTTP/five SDK runtimes pass locally. Coverage includes same-key
local activity with foreign identity, profile collision rollback, foreign native
attribution, direct authenticated compatibility and stale-admin denial; HTTP totals,
breakdowns, event pages, profile/journey/clear, tracking and event-key collisions
preserve exact foreign snapshots without inserting a local conversion. All2356
migration versions/bodies validate; script lint/format/diff checks pass.

PR4430 was merged externally while this work continued. The new link/QR/report and
customer work is now on feature/redirect-workspace-resource-isolation, based on
current main, in draft PR4432. No merged PR code was rewritten; its description
was restored after discovering the merge. Focused Linux CI38846628376 passes the
link/QR/report head0ef498bb6; full CI38846628390 is still finishing, and final-head
customer CI is required. Product activation fences stay intact. Public resolver,
provider/background/cleanup writers, tenant ownership/uniqueness, creation/switching
and reviewed domain transfer still require completion; no production mutation or
full parity/release claim is made.


Domain/manual/provider/mail isolation checkpoint: migration99991792216123 scopes32
functions/triggers across private domain pages/counts/choices/defaults, raw manual
records, DNS verification/Domain Connect operations, provider reservations/receipts
and instruction-mail draft/queue/status/claims/prepare/acknowledgement. Inserts carry
workspace identity; private upserts cannot attach a foreign job. Link/root/archive/
delete triggers use authoritative row workspace. Public verified-host lookup remains
explicitly legacy-only, with service workers selecting the sole active legacy
workspace. Provisioning rows cannot be served, refreshed, leased or acknowledged.
Global hostname uniqueness, global abuse caps and all activation fences remain.

Rollback-only SQL seeds a ready foreign domain/provider job, queued and leased
mail, manual record and DNS review owned by the same global admin. Private reads,
mutations, recipient recovery, public routing, worker leases/reservations and even
late provider delete receipts cannot touch them. Exact snapshots and budgets stay
unchanged. Actual owner HTTP covers foreign registry/count/choices/manual/DNS/
provider/mail paths with isolated DNS/mail adapters enabled. A transport counter
proves zero DNS/provider/Storage/email calls throughout all workspace denials.
Existing legacy provider races, immutable mail retries and delivery recovery pass.

The focused100 cases pass with two workers and unchanged assertions/timeouts.
One earlier parallel run timed out in a15-second API case. The Go diagnostic then
showed its positive ready-domain fixture heartbeat was over15 minutes old after
long compilation/suspension; production correctly excluded it. The fixture now
models ongoing provider heartbeats per request only during positive SDK examples
and the workspace isolation fixture. Later expiry tests opt out; no product expiry,
owner/route condition or test assertion was weakened. Failure messages retain the
returned domain page and sanitized readiness state. Full actual HTTP/five SDKs,
complete SQL in deployment filename order,40-table backfill and2358 migration/body
checks pass locally. Script lint/format/diff checks also pass; exact-head CI remains required before release.

PR4432 was merged externally as ea1086e4a after its866c845e8 full test job passed
(run38849393051). Parallel integration preserved its link migration allocation
99991792123545 after main advanced; QR/customer allocations remain unchanged.
The new domain migration was allocated above that version. The isolated SQL loader
now follows actual filename order for all four resource replacement migrations.
Domain work continues on feature/redirect-workspace-domain-isolation, based on
current main. Checks used isolated fixtures and executed no live provider/DNS/email
or publication writes. The domain migration has no production deployment proof. Native/webhook/cleanup and remaining public/service paths,
tenant ownership/uniqueness, creation/switching, reviewed transfer and live release
proof still remain; this checkpoint does not claim full parity or activation.


Webhook isolation checkpoint: migration99991792216136 scopes private webhook
administration, metadata/body/attempt serialization, link filters, rotation/test/
replay, worker claim/prepare/finish and retention. Resource quotas are workspace-
scoped; existing global abuse budgets remain. Event source-key uniqueness is now
(workspace_id,source_key), with once-only behavior within a workspace and independent
same-key events across workspaces. All source-key readers/writers were audited;
there are no application readers outside the converted webhook SQL family.

A private internal producer takes authoritative source-row workspace identity.
The existing elevated capture trigger passes OLD/NEW workspace, scopes conversion/
root/metadata lookups and retains all current branches including password branding.
The public service-only enqueue wrapper validates selected-workspace root/receiver
identity. Caller headers cannot choose a trigger event's tenant. Deleted-root and
coalesced lifecycle payloads keep their source identity. Authenticated callers gain
no internal-schema usage or producer execution. Activation fences remain intact.

Rollback-only SQL runs active subscriptions in both workspaces, owned by the same
global admin, under contradictory request headers. Each receives only its own
click/conversion/lifecycle data. A foreign generic inventory key under a local root
cannot leak the local link through the elevated trigger. Private foreign metadata,
credentials, payload/signing preparation and receipts are denied. Worker expired-
lease recovery and retention cannot change foreign attempts, expired secrets,
terminal histories, orphan events or budgets. Source-key reuse is independently
idempotent. Exact foreign snapshots remain unchanged while local claims succeed.

Actual owner HTTP/five SDKs pass, including foreign active/archived counts,
settings/archive/rotation/test, foreign link filters, delivery bodies/attempts/replay
and unchanged foreign outbox/budgets with live capture triggers enabled. The bounded
fixture makes zero DNS/provider/Storage/email transport calls. Complete migrated
SQL and2359 migration version/body checks pass; script lint and diff checks pass.
The40-table existing-data backfill and script format checks also pass; exact-head CI remains required.
This is12 function definitions (including a new private producer), with no UI change.
Worker dispatch still defaults to the sole active legacy workspace; native/public/
cleanup paths, multi-workspace ownership/model/dispatch, creation/switching,
reviewed domain transfer and live release proof remain open. No activation or
production/provider/publication proof is claimed by these isolated checks.


Native and asset isolation checkpoint: migration99991792216142 adds28 function
definitions across native app administration, public host-derived resolution,
association/install/handoff paths, password branding and maintenance. Public calls
use authoritative hostname identity; caller workspace headers cannot redirect public
reads. Builtin hosts and public verified-domain lookup remain legacy-only while
activation fences stay intact. Private app/branding operations and cleanup workers
use selected workspace identity; triggers use OLD/NEW identity. Asset serialization
uses an explicit private workspace helper rather than ambient request headers.

Legacy resolution fingerprints retain the pre-migration golden hash. Nonlegacy
fingerprints include workspace identity, so moving a link invalidates its prior
receipt. Foreign apps, policies, visits, handoffs, branding, cleanup leases, QR
history and password budgets remain unchanged in rollback-only SQL. Positive legacy
consent, quota, replay, receipt and asset cleanup paths still pass. Actual owner HTTP
and all five SDK runtimes pass; the isolated cleanup dispatcher makes zero external
Storage/provider calls for foreign assets. Existing-data backfill across40 tables,
2360 migration version/parser checks and script lint/format/diff checks pass locally.
No UI changed; exact-head CI remains required before release.

This checkpoint does not activate tenants, define tenant ownership, implement
creation/switching or reviewed transfer, or establish live deployment/device/provider
proof. Remaining public/service readers and resource uniqueness still need their
activation audit. Background dispatch currently serves the sole active legacy
workspace. Full parity and production release remain open.


Legacy writer audit checkpoint: migration99991792216117 closes the remaining old
service policy setter's unscoped root lookup and ON CONFLICT update. It inserts
explicit workspace identity and rejects foreign policy-key collisions atomically.
Legacy authenticated metadata/campaign/bulk RPCs retain fixed legacy identity with
explicit root/folder/tag predicates and inserts; guarded metadata upserts cannot
silently report success against an invisible foreign key. No grants were widened.
The cloaking guard uses NEW workspace for its authoritative policy/root lookup.

Rollback-only SQL verifies foreign root/policy/metadata/folder/tag denials, unchanged
foreign snapshots, positive legacy campaign/metadata/archive/policy writes and an
intentional corrupted policy-key collision. The complete SQL suite, five focused
legacy policy endpoint cases,40-table backfill,2361 migration parser/version checks,
script lint and diff checks pass locally. This audit preserves activation fences;
new workspace ownership/creation/switching, transfer and live release proof remain.


Main advanced with merge-gap audit scope migration99991792168441 while PR4437
was open. Exact-head CI correctly rejected the unpublished domain allocation below
that base. The allocator moved only the unmerged domain file from99991792131513
to99991792216123. Previously merged allocations remain unchanged. The isolated
loader sorts replacement files by actual deployment filename; reordered complete SQL, actual HTTP/five SDK runtimes and40-table backfill pass.
All2363 migration version/parser checks, script lint and diff checks pass locally.
Final-head CI and live release review remain required.


Resource-name checkpoint: migration99991792216130 changes normalized folder, tag
and UTM-template name uniqueness to (workspace_id,lower(btrim(name))). Existing
values and within-workspace duplicate rejection are preserved. All name writers
were audited; none uses a name-based ON CONFLICT target. Rollback-only SQL and
actual owner HTTP create a name already used by each foreign resource, reject a
normalized duplicate within the selected workspace and preserve foreign rows.
The complete SQL suite, actual HTTP/five SDK runtimes,40-table backfill and2364
migration parser/version checks pass locally, along with script lint/format/diff.

CI on e3630a80e passed migration allocation, cross-PR collision and SQL parsing,
but its remote-history check found separately applied event_gap_automation
(20261016175824) and marketplace_batch_gap_policy (99991792172698) missing from
that checkout. The latter already has its authoring file in open PR4439. No
unrelated production schema was changed here. To preserve deployment order above
the newly applied history, the allocator moved only unmerged webhook68542 to73751
and native72005 to73761 (full prefix999917921). Merged migrations retain their
versions. Reordered complete SQL, actual HTTP/five SDKs and backfill pass locally.
Final-head CI review remains required.
Member/customer uniqueness, owner model, creation/switching, transfer and live
release proof remain open; no second workspace is enabled by these indexes.


Membership uniqueness checkpoint: migration99991792216148 replaces global user
uniqueness with UNIQUE(workspace_id,user_id), retaining the constraint name and
machine members' nullable-user behavior. No grants, roles, active state or tenant
activation rules change. Membership/session/invitation writers already use explicit
workspace identity; no live function uses ON CONFLICT(user_id). The existing
same-account SQL matrix now runs with this real constraint intact instead of
dropping uniqueness in its fixture. Duplicates are rejected independently in both
workspaces. Foreign deactivation leaves the local session intact; an active foreign
membership cannot rescue an inactive local session. Invitation acceptance still
selects the local membership and preserves the foreign invitation.

Actual owner HTTP creates a legacy membership for the same account as a foreign
membership, rejects its local duplicate, and deletes only the local membership.
The foreign human row remains exact. Full migrated SQL, HTTP membership isolation,
40-table existing-data backfill and2365 migration version/parser checks pass locally;
script lint/format/diff checks pass. Full actual HTTP/five SDK runtime completion also passes. Final-head CI
remains required before release. No new workspace is activated. Customer/event keys,
QR/default identities, tenant owners, creation/switching, transfer and live proof
remain open.


Customer/event key checkpoint: migration99991792216156 makes customer anchors,
profiles and provider event IDs unique within workspace. Composite profile/visit
relationships retain their existing deletion behavior. Conversion/profile writers
use matching composite conflict targets; conversion replay still compares all
payload fields within the selected workspace and rejects changed data. Foreign
customer keys no longer block a legitimate local click. Customer access and row
triggers use consistent workspace-specific advisory locks, preserving the exact
legacy lock identity and ordering old/new row keys deterministically.

Rollback-only SQL creates the same customer/event IDs in two workspaces. It proves
independent conversion IDs/anchors/profiles, local replay idempotency, changed-
payload rejection, foreign-version rejection, within-workspace anchor uniqueness
and profile deletion cascading only within its workspace. Existing foreign-only
profile/journey/visit denial and authenticated legacy RLS checks still pass. The
re-enrichment fixture now creates an independent local same-key profile instead of
expecting a global-key collision. Exact foreign snapshots remain unchanged.

Actual owner HTTP exercises same customer/event IDs, correct creation/replay
statuses, mismatched payload/version denial and private profile enrichment, then
rolls those positive operations back before other isolation contracts. Full SQL,
actual HTTP/five SDK runtimes,40-table backfill and2366 migration version/parser
checks pass locally. Script lint/format/diff checks pass. No UI or grants changed;
activation fences remain. Final-head CI still requires review. On9b661e179, CI's
allocation/cross-PR checks pass but remote history reports six separately applied
missing files, alongside the unrelated event-gap trigger drift. No thresholds or
intentional data-quality holds were altered. QR/default identities, tenant owners,
creation/switching, reviewed transfer and live release proof remain open.


QR/default identity checkpoint: migration99991792216164 makes primary-domain
preferences unique on(workspace_id,singleton) and QR styles on(workspace_id,scope).
All style/logo conflict targets match those keys; another workspace's default no
longer blocks local style edits or logo reservations. Missing primary preferences
remain virtual on read and initialize only through an explicit version:null write.
Existing/stale preferences still require their actual version. The owner HTTP
boundary distinguishes explicit null from a missing or malformed version.

Private style wrappers select the request workspace. New service-only internal
style/logo helpers take authoritative row identity; owner-created public QR images
use them and derive their URL from the scoped root row. Static and managed public
QR fixtures retain their own styles/assets even under conflicting request headers.
The public token lookup retains its legacy activation guard; member/key creator
authorization and broader public activation still require the tenant-owner phase.
No grants were widened. Cleanup references and primary/domain choices were audited
against the composite keys and remain workspace-scoped.

Rollback-only SQL covers coexisting preferences/styles, independent style/logo
reservation/finish, first-write initialization, stale-write rejection, private
helper grants and exact foreign snapshots. Actual owner HTTP covers independent
style edits and preference initialization while foreign defaults stay exact.
Full migrated SQL, actual HTTP/five SDK runtimes and40-table backfill pass locally.
All2367 migration version/parser checks pass. The39 focused Edge API/primary-form
cases pass, including first save and further editing after concurrent initialization.
The draft retains an original null version rather than adopting a refreshed one.
At1280/390px, a single capture batch confirms save/conflict states without overflow
or runtime errors. This preserves the existing visual interface. Frozen Edge API checking, lint and the single design detector pass. The project
typecheck ratchet reports702 existing errors with none new; its baseline is unchanged.
Final-head CI remains required before release. Tenant owners,
creation/switching, remaining shared identities/public authorization, reviewed
transfer and live runtime/release proof remain open.


PR4437 advanced externally to90d03c7b4 by merging main's marketplace gap-policy
change. That merge is preserved on this branch. Post-integration lint/diff and all
2368 migration version/parser checks pass; Redirects source and fixture deployment
order are unchanged by the integration. Production history/trigger reconciliation
and final-head CI remain release gates.


Owner-authority checkpoint: migration99991792176060 introduces a private explicit
workspace-owner registry. App admins remain owners only of the immutable legacy
workspace; created_by and global admin status do not grant another workspace.
Nonlegacy grants may hold multiple active owners independently, with immutable
workspace/account identity. Registry writes and workspace lifecycle writes share
the existing ACL lock. Deferred guards reject activation without an active owner
and reject removing/deactivating the last active owner, while permitting an atomic
replacement. Legacy ownership continues to follow current application roles and
cannot be overridden through registry rows.

Two private owner lookup/enumeration helpers replace global-role assumptions in36
resource functions: private session/member/key/ACL/report/QR/customer/native/domain/
mail/webhook operations, public source-row checks and durable worker pre/postflight
checks. Background authority uses the resource's workspace, not caller headers.
Folder notification owners are workspace-specific. Direct authenticated legacy RLS
continues using redirect_current_owner with its existing fixed-legacy row fences.
A nonlegacy null-principal management operation will require explicit owner account
context; legacy internal/no-actor compatibility is retained. New tenant activation,
creation/switching and owner-admission HTTP controls remain unavailable.

Rollback-only owner fixtures verify independent and multiple grants, creator/admin
non-escalation, explicit revocation, ownerless activation denial, last-owner guards,
atomic replacement, private grants and preserved activation denial. Catalog proof
finds no remaining public redirect resource function reading application user_roles
except the intentionally legacy-only direct-RLS helper. Foreign resource fixtures
now carry genuine owner grants. The webhook fixture uses a foreign owner with no
application admin role and proves source-row click/conversion/lifecycle delivery
still reaches only that workspace. Actual owner HTTP/five SDK runtimes, full SQL,
40-table existing-data backfill,2369 migration version/parser checks and script
lint/format/diff checks pass locally. No UI changed and no tenant was activated;
final-head CI and live release proof remain required.

Current role reference: https://dub.co/help/article/workspace-roles (read2026-10-16).
Dub supports inviting additional owners. Its Links grid permits member tag edits
and all roles to view domains, API-key metadata and webhooks; these permissions
still need follow-through. The current page also includes Billing as a fourth
role with read-only Links permissions; that role remains open rather than being
counted as implemented. The wider owner admission/lifecycle UI, workspace creation/
switching, public/shared-host activation, domain transfer and live provider/device/
release verification remain open. Firecrawl retrieval was unavailable due to
account credits; the primary page was read directly instead.

### 2026-10-20 integration recovery

PR #4437 merged without the owner-authority commit. Rebased only that unpublished
commit onto main at 872863af9 and allocated migration 99991792517815, replacing
the unpublished 99991792176060 filename cited in the earlier checkpoint. Full
isolated SQL and 40-table backfill checks pass on this integration; all 2413
migrations pass version and PostgreSQL parser checks. No production schema or
tenant activation was changed. This follow-up remains distinct from the merged
workspace resource changes; owner admission and the activation audit remain open.

The public donation checkout's service-role click lookup now explicitly selects
the Queer Guide workspace. A submitted workspace header cannot change donation
attribution. The offline Stripe harness executes the actual checkout handler
against isolated local/foreign/expired click rows, covering one-time payments and
recurring subscription metadata plus persisted donation attribution. All ten
checkout cases and existing signed-webhook/retry/renewal attribution checks pass;
Stripe creation is simulated and sends no payments or provider requests. The
full five-SDK HTTP integration suite also passed on the recovered owner branch.

### 2026-10-25 public QR creator scope

Public QR image creator checks now use a private principal helper with the saved
image's workspace as an explicit argument. Visitor workspace/account headers do
not select the creator's authority. The private management wrapper still validates
its request selector, retains legacy internal compatibility, and denies future
workspace activation. The helper checks active workspace status under the ACL
lock, preserves folder/key/member limits and current owner checks, and defaults
to denying an absent principal without explicit owner context.

Rollback-only fixtures verify independent credentials, viewer write denial,
provisioning denial, foreign credential/owner denial, conflicting public visitor
headers, and immediate key/member/owner revocation. Full isolated SQL, actual HTTP
through all five SDK runtimes, and all 2548 migration parser checks pass locally.
Public reports and shared-host/native activation still require follow-through;
this checkpoint does not enable tenant creation or switching.

### 2026-10-25 public report resource context

Public dashboard publisher checks now bind to the public share's fixed legacy
workspace, and analytics use private helpers with that resource workspace as an
explicit argument. Member folder edit permission is checked under the existing
shared ACL lock without invoking a write-locking helper. Visitor workspace/account
headers cannot change publication authority or select another analytics tenant.
The authenticated analytics functions retain their existing legacy RLS path;
the private aggregation helpers preserve the same filters and output contract.

Rollback fixtures compare public owner totals to private analytics, retain member
conversion privacy, deny cross-workspace link IDs and provisioning workspaces,
preserve future public-share denial, and close publication after folder edit,
membership or ownership revocation. Full SQL and all five actual HTTP/SDK runtimes
pass on the revised lock-safe implementation. All 2549 migrations parse. No
production schema, authenticated grants or tenant activation fences changed.

### 2026-10-25 native host ownership decision

[Dub's current deep-link quickstart](https://dub.co/docs/concepts/deep-links/quickstart)
requires adding a custom domain to the workspace and hosting its association
files there (read 2026-10-25). Android's [association documentation](https://developer.android.com/training/app-links/configure-assetlinks)
describes domain authorization; dynamic server path rules require Android 15+.
Accordingly, future workspaces must use their registered custom domain for native
bindings. Only the immutable legacy Queer Guide workspace may use a null domain,
which denotes the shared first-party host. A database check enforces that model
for both Android and iOS, including attempts to remove a custom domain binding.

The existing app/App Clip unique indexes remain host-based: each domain UUID has
one globally unique hostname and one workspace owner. Adding workspace to the
built-in-host uniqueness key would incorrectly suggest independent authority on
the same host. Identical app identities remain permitted on different custom
hosts. The tenant-aware domain FK prevents cross-workspace domain attachment.
The old foreign native fixture now uses its own custom domain; it still proves
that forged built-in-host receipts and visitor headers do not grant access.

The full isolated SQL suite passes, including legacy association publication,
foreign built-in insertion/update denial, cross-tenant domain denial, per-host
uniqueness and preserved provisioning denial. This is a pre-activation invariant;
custom-domain public routing activation and signed store/device evidence remain
open.

### 2026-10-25 public link routing identity

Public built-in resolution now looks up the globally unique short-link slug and
its active workspace; custom-domain readiness binds to its globally unique
registered hostname and active workspace. A private link/host helper keeps visit
and snapshot writes bound to that resource. Contradictory visitor workspace
headers cannot select the tenant. Route-proof refresh uses the registered domain
workspace, while password branding and throttling derive the active workspace
from the source link UUID. Legacy fingerprints and existing quota/snapshot guards
remain intact. Native associations on the built-in host still belong only to the
legacy workspace; other workspaces use their own registered custom domains.

Rollback-only SQL fixtures cover provisioning denial, active built-in/custom/root
routing, host mismatch, current provider-requester ownership, password branding
and scoped throttle rows, lifecycle closure and no rejected-visit inflation. The
actual Pages and signed branded Worker → resolver → SQL harness additionally
checks a simulated second workspace: preserved campaigns/QR markers, password
GET/POST behavior, correct workspace on exactly three visits, and HEAD/no-count.
Full SQL, all five actual HTTP/SDK runtimes, 2551 migration parser checks and
targeted script lint/format checks pass. Native HTTP fixtures now use their own
custom domain rather than trying to insert a foreign built-in binding.

No production tenant was activated and the private selector/resource fences stay
closed. Public QR/report capability lookup still has its separate legacy-only
publication fence. Their resource-context helpers are ready, but enabling public
capabilities across active workspaces remains part of the final activation audit.

### 2026-10-25 Billing Links role and member tags

Re-read [Dub's role grid](https://dub.co/help/article/workspace-roles) on 2026-10-25.
Billing is now a supported membership/invitation/session/TypeScript SDK role with
read-only Links and analytics access. Folder-owner overrides and write-scoped
member-bound keys cannot lift that cap. It grants no application administrator,
billing-provider or payout authority. Existing owner authority and tenant fences
remain unchanged. The member editor can assign all three non-owner roles, and
recipient-bound invitations preserve an explicit Billing choice.

Members can now create, rename, recolor and delete shared workspace tags through
the scoped API and a member-workspace tag dialog. Viewer/Billing writes remain
denied. Deletion requires confirmation that the shared tag is removed from links.
Tag mutations retain the selected workspace predicate, including denial of foreign
tag IDs and preservation of independent same-name tags. UTM template writes stay
owner-controlled; folder writes retain their existing ACL rules.

Current read-only roles also cap cached link/source edit flags and already-open
organization/policy editors. This keeps the UI read-only while fresh server
capabilities are loading. SQL remains authoritative for every mutation.

The full SQL suite and all five actual HTTP/SDK runtimes pass. New HTTP cases
exercise owner-assigned Billing, session/discovery, permitted analytics, denied
link/folder/tag/key/member writes despite a folder-owner override, member tag CRUD
and preserved viewer denial. All 41 interface tests pass; API checking uses its
existing frozen Deno configuration/lock. Script/UI lint passes, all 2552 migrations
parse, and the app typecheck ratchet reports no new errors. Missing local ATProto
and fflate packages were supplied at the already-declared versions in a temporary
install; no dependency manifest or typecheck baseline was changed.

All-role domain/key/webhook metadata views, member integration installation,
additional-owner admission, workspace creation/switching/activation, atomic domain
transfer and live provider/device evidence remain open.

### 2026-10-25 all-role workspace information

A read-only account endpoint and member-workspace information dialog now let all
four current roles view domains, bounded API-key metadata and webhook metadata.
The service-only SQL reader derives its workspace from current account context,
uses explicit tenant predicates, and paginates by UUID. It never calls credential
authentication or updates key usage. Its strict serializers exclude hashes,
signing keys, DNS proofs, receiver paths/query strings, event bodies and creator
identities. Current owner/member loss closes reader access; saved keys and active
webhooks whose authorizing access changed are shown unavailable. Configured link
limits count existing tenant-bound links rather than deleted/stale IDs.

All five SDKs provide account-only information methods and exercise all three
resource kinds through actual HTTP; server-key attempts are denied. Billing,
Member and Viewer HTTP cases also read the information and verify field exclusion,
duplicate/invalid query denial and unsupported writes. SQL fixtures cover all four
roles, independent foreign rows, secret exclusion, cursor completeness, current
membership/owner revocation and preserved direct-RPC grant denial. The complete
SQL suite and five-SDK integration suite pass. Fifteen targeted dialog/workspace
tests, the frozen API Deno check, SDK TypeScript checking and app typecheck ratchet
pass; the app build succeeds and all 2553 migrations parse.

This closes the local all-role metadata gap, not tenant activation or live release
verification. Member integration installation, additional-owner admission,
workspace creation/switching/activation, atomic transfer and external provider/
device evidence remain open.

### 2026-10-25 public QR and report capability identity

Public QR image hashes and saved-report share IDs now select their immutable
resource workspace, requiring that workspace to be active. Current creator,
member, key, folder, version, password and revocation checks remain in force;
visitor workspace and actor headers cannot select a private context. Private
workspace activation and tenant write fences remain closed.

The complete SQL suite passes, including independent future-workspace creator,
member/key revocation and report totals. A rolled-back isolated HTTP fixture
checks provisioning denial, active QR/report publication, real password hashing,
password denial/acceptance, contradictory visitor headers, current workspace
status and explicit revocation. It records one visit and confirms publication
reads add none. Expected failed RPC calls use savepoints to model independent
production transactions. All five SDK runtimes and their complete HTTP matrix
pass. All 2554 migrations parse; script lint, formatting and diff checks pass.
The first SDK retry encountered host disk exhaustion in Go linking; downloaded
archives were removed and the full run then passed.

This remains local integration evidence, with production release verification
pending. Service job/retention authority, member integration installation,
additional-owner admission, tenant activation, atomic transfer and external
provider/device evidence still need work.

### 2026-10-25 global bounded retention

Internal native-handoff and QR-history retention now considers expired rows
across workspaces, including provisioning workspaces. QR asset cleanup derives
its tenant from the candidate asset and completion from the immutable asset ID
and exact lease, independent of visitor/account workspace headers. It preserves
bounded claims, expired-lease exclusion, fresh reference checks, retry/backoff
and delayed tombstone rechecks. Public role grants remain closed.

The full SQL suite passes with malformed request selection, bounded cross-tenant
expiry, live-receipt preservation, referenced-artwork preservation and forged-
lease denial. The actual cleanup dispatcher performs exactly one Storage DELETE
for the fixture's due orphan in a provisioning workspace; the test requires the
exact object key and transport and compares all other foreign state unchanged.
All denied foreground operations still make zero external calls. The complete
five-SDK HTTP matrix passes, all 2555 migrations parse and script lint/formatting
pass. These checks use isolated SQL and mocked Storage, not production deletion.

Domain, email and webhook dispatch still need source-row claim/receipt authority
before workspace activation. Member installation, owner admission, workspace
activation, atomic domain transfer and live provider/device evidence remain open.

### 2026-10-25 source-bound email workers

Instruction-mail and access-notification claims now select bounded jobs from
active workspaces and derive every subsequent predicate from the saved job's
workspace. Private explicit-workspace snapshot/folder-owner helpers preserve
current DNS setup and recipient authorization without relying on request headers.
Send preparation rechecks active workspace, current owner, setup snapshot,
transport fingerprint and exact lease. Foreground private domain readers and
workspace activation fences are unchanged.

Receipt completion identifies the source row by job ID and exact current lease,
then persists provider truth even after workspace deactivation or owner loss.
Forged and replayed completions cannot change the row. The existing unknown-send,
immutable payload, retry-window and transport-change behavior is retained.

Complete SQL tests pass for isolated future workspaces with explicit non-admin
owners, malformed visitor headers, inactive claim denial, claim/prepare
transitions, deactivation before send, and accepted receipts after deactivation
and owner loss. Earlier boundary tests now use forged worker leases when checking
no-write denial; source-row service workers deliberately accept valid leases
independent of foreground selection. The complete five-SDK HTTP matrix passes,
including native instruction mail/gateway receipt tests. All 2556 migrations
parse; script lint/formatting and diff checks pass. No real email was sent.

Domain-provider and webhook workers still need source-row authority before
activation. Member installation, owner admission, tenant activation, transfer
and live provider/device proof remain open.

### 2026-10-25 source-bound provider workers

Provider claims now select bounded jobs in active workspaces. Create, adoption,
refresh, validation restart and ownership renewal recheck current source owner
permission; foreground request headers cannot choose a worker tenant. Nonce-bound
creation receipts and confirmed provider status/deletion facts remain recordable
after deactivation or role loss, preserving external truth. Foreground private
resource endpoints and activation fences remain unchanged.

Background DNS reservation uses the source job's workspace and existing global/
actor budgets. Its dedicated completion RPC requires the exact lease, operation,
version and verification attempt plus current active workspace/owner. The actual
provider adapter uses that RPC and stops before provider refresh when the receipt
is rejected. Foreground DNS result authorization remains unchanged.

The complete SQL suite passes with a non-admin explicit future owner, malformed
headers, inactive claim denial, forged lease/nonce denial, creation/status receipts
after deactivation/owner loss, exact DNS renewal and revoked-creator refresh
denial. All five real SDK runtimes and their full HTTP matrix pass, including
background DNS renewal. Twelve provider-adapter tests pass, the API's frozen Deno
check passes and all 2557 migrations parse. Script/test lint and formatting pass.
No live provider object was created, modified, adopted or deleted by these tests.

Webhook worker authority remains before activation, along with member integration
installation, owner admission, tenant activation, atomic transfer and external
provider/device proof.

### 2026-10-25 source-bound webhook workers and receipts

Webhook workers now claim active source subscriptions and derive preparation and
completion context from the saved delivery and exact lease. Current workspace,
creator, settings generation and enabled/test state gate send preparation. A
private explicit-workspace serializer returns the internal receipt without
opening foreground cross-tenant reads. Claiming takes the exclusive ACL lock
before subscription updates, avoiding a shared-lock upgrade race.

Expired lease recovery and bounded secret/history/budget retention cover inactive
workspaces. Settings changes and owner-loss retention cancel queued work while
preserving unexpired in-flight leases. New preparation is denied immediately by
current permissions/settings generation. An already-started request can still
record its exact HTTP outcome and excerpt before its delivery closes with
scope_changed. Pause/archive confirmation text explains that a request already
sent may finish.

Complete SQL tests cover isolated future workspaces, malformed headers, inactive
claim/preparation denial, exact body/secret identity, forged/replayed leases,
receipt persistence after deactivation/owner loss, and global expiry cleanup that
preserves live receipts. Foreground denial snapshots are compared before internal
maintenance; internal retention assertions separately verify only eligible state
changes. The complete five-SDK HTTP matrix and four webhook UI tests pass. All
2558 migrations parse; script/component lint, formatting and diff checks pass.
No real webhook was delivered by these isolated tests.

Member installation, additional-owner admission, tenant creation/switching/
activation, reviewed atomic domain transfer and external provider/device proof
remain open. This is local integration evidence, with production release and
post-deployment E2E verification still pending.

### 2026-10-25 member conversion adapter credentials

Owners and Members can now configure a durable Segment/Google server-adapter
setup with a one-time, selected-link conversions:write credential. Member keys
bind the installing membership and retain current role/folder/link checks on
every conversion. Generic API-key administration remains Owner-only. Setup
metadata is sanitized and readable by all current roles; Member writes manage
only their own setups, while Owners may revoke any current-workspace setup.
Revocation updates the setup and token atomically. Account/member deletion cannot
turn the purpose key into an Owner credential.

Creation binds a stable request ID to canonical input. Replays do not issue
another key or reveal the original secret. Metadata lookup supports unknown
response recovery; lost keys require revoke/recreate. Plaintext exists only in
the first response and local component state, outside query caches. The member
and owner UIs include selected editable links, 90-day expiry, current session
rechecks, explicit revocation, adapter downloads and provider setup instructions.
Private installation rows are additionally fenced to the legacy workspace until
tenant activation is complete.

The complete SQL suite passes for purpose/scope limits, folder/role revocation,
Owner-only generic key denial, replay conflicts, metadata exclusion, current
ownership and membership deletion. The actual HTTP handler creates Member keys,
records idempotent attributed conversions, denies other/newly forbidden links and
atomically revokes keys. All five SDKs exercise create/replay/list/request lookup/
revoke, including missing receipts and account-only denial. The complete SDK
matrix passes. Twenty UI tests pass; the app builds, frozen API and standalone
SDK type checks pass, and app typechecking reports 660 errors with none new
against its existing baseline. All 2559 migrations parse; lint/format/diff checks
pass. The UI tests emit existing React act/i18next warnings.

This implements the local member credential/configuration flow. It does not
install or remove anything in a real Segment/Google account, prove provider
runtime/debugger verification, or publish SDK packages. Those remain external
release evidence alongside custom-domain/device proof. Additional-owner admission,
workspace creation/switching/activation, atomic domain transfer and final deployed
production E2E remain open.

### 2026-10-25 explicit Owner registry administration

An account-only, explicitly scoped registry API now supports paginated current
Owners/candidates, verified human-member admission and revision-bound removal.
Writes recheck current ownership under the exclusive ACL lock, preserve at least
one Owner even during provisioning, retain existing base membership on removal,
and never change application-admin roles. Global admins do not inherit another
workspace's authority. Legacy ownership is readable but continues to be managed
through existing application user administration.

Owner rows gain revisions. A guard shared with membership writes prevents member
role/status/deletion controls from concealing separate explicit Owner access;
labels remain editable. The membership UI displays that state and disables those
controls. A dedicated panel reviews the exact target/workspace before changes,
requires explicit confirmation, disables unverified/last-Owner actions and hides
cached metadata/reviews after access loss. A bound API-client factory keeps each
workspace in an immutable closure, with user/workspace-specific query keys.

The route's narrow provisioning-registry exception does not open other private
routes or tenant resources. Complete SQL tests prove current/stale/foreign/last-
Owner behavior, preserved base membership, re-admission revisions, verified-
account checks and unchanged application-role rows. Actual HTTP tests cover an
independent provisioning registry and prove business selection remains denied.
All five native SDKs perform positive scoped registry list/candidate/admit/remove
calls inside that isolated fixture, in addition to the full existing SDK matrix.
Thirteen UI/client tests, app/SDK/API type checks, the app build and all 2560
migration parses pass. The app ratchet remains 660 errors with none new; script/
component lint, formatting and diff checks pass. No real production Owner was
admitted or removed, and no new workspace was activated.

Tenant creation/switching/business activation, reviewed atomic transfer and
external provider/device/publication proof remain open. Production deployment and
post-release E2E verification remain pending the coordinated release window.

### Native signup attribution: next activation boundary

The current native signup endpoint still delegates to a conversion writer using
private request selection. Before business activation, derive its workspace from
the globally unique recorded click, verify the registering account through a
narrow private Auth lookup, and write only the fixed native signup event. Reuse
an explicit-workspace conversion helper so ordinary account/key writes preserve
their current scope and role checks. Visitor workspace headers cannot choose
signup attribution. Keep workspace activation and resource fences closed while
verifying this boundary through SQL and the actual HTTP handler.


The source boundary is now implemented in `record_redirect_signup`: the service
uses the actual verified Auth registration timestamp and an immutable click's
active source workspace. A private explicit-workspace conversion helper retains
current account/key scope checks and tenant-local event/customer idempotency.
The browser supplies only a click ID; visitor workspace headers cannot redirect
attribution, and the registrant needs no business membership in the publisher's
workspace. Fixed signup fields cannot be overwritten by browser-reported sales.

The complete SQL suite and five-language HTTP/SDK suite pass, including new
source-workspace fixtures for verified/unverified sessions and Auth records,
wrong actors, missing/inactive clicks, registration timing, repeated requests,
forged payload fields, visitor-header independence and no additional visits.
All 34 API unit tests, frozen Edge type checking, script lint/formatting and
2561 migration parses pass. No production signup or tenant activation occurred.

### Recipient-bound invitation source selection

Verified recipients can now discover active pending invitations across workspaces
and accept their saved source without prior membership or private selection.
Both recipient flows ignore visitor workspace headers; owner list/create/revoke
remain selected private operations. Actor, verified email, active source, current
source Owner, expiry/revocation and current membership checks remain under ACL
locks. Acceptance replays preserve membership identity and current role. The
inbox UI names the source workspace and excludes recipient emails/token hashes;
acceptance returns joined workspace identity for subsequent explicit selection.

Complete SQL and five-language HTTP/SDK suites pass, including independent active
source, provisioning denial, wrong session/recipient/key denial, stale Owner,
expiry/revocation, inactive membership, idempotency and visitor-header independence.
The 41 invitation/API unit tests, frozen Edge type check, targeted lint/format,
diff checks and all 2562 migration parses pass. Tenant activation and private
resource fences remain intact. No real invitation was accepted or sent.
