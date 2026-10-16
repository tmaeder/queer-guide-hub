# Redirect workspace isolation and domain transfer

Status: the identity/backfill and request-context foundation is implemented
locally. Multiple-workspace activation, full tenant isolation, transfer endpoints
and production transfer remain open.

The existing Redirects workspace is global. `redirect_workspace_members.user_id`
is unique globally, owners come from application `user_roles=admin`, resource
rows lack a workspace identity and several permission helpers interpret a null
principal as owner. `redirect_domain_actor` checks that global owner role. Changing
`redirect_domains.created_by` cannot move a domain into an independently secured
workspace. Existing service-role RPC execution bypasses table RLS, so adding only
RLS policies would also leave the API unsafe.

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


Managed link and inventory isolation checkpoint: migration99991792120766 converts
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
