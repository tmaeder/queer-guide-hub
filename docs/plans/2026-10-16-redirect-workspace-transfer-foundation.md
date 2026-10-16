# Redirect workspace isolation and domain transfer

Status: implementation design; no tenant migration, transfer endpoint or production
transfer is implemented by this document. The full parity requirement remains open.

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
