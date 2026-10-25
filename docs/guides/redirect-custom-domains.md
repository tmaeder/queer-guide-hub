# Custom redirect domain setup

The Link workspace has owner-only domain registration, ownership checks, durable
Cloudflare hostname/TLS setup and an explicit branded routing check. Managed
links have separate hostname namespaces; the default remains
`https://queer.guide/go/<slug>`. Root, not-found and default expiry destinations
are resolved on branded hosts. The tracked-link builder and member editor offer domain choices and an owner-set
primary default. The active manual CMS editor also supports domain selection and atomic saves. This implementation is local; provisioning a production
hostname and deploying the dedicated relay remain release work.

## Registration and ownership

Hostnames normalize case, trailing dots and IDNs to ASCII. Schemes, ports, paths,
credentials, IP addresses, malformed/private/reserved suffixes and Queer Guide or
hosting infrastructure domains are rejected. The hostname limit leaves room for
the DNS challenge prefix. Each registration gets a distinct cryptographic TXT
challenge at `_qg-redirect.<hostname>`, with value `qg-redirect=<token>`.

Only verified owner account sessions can manage the registry. SQL rechecks the
current admin role; editable user metadata and cached client state do not grant
access. Ordinary members, API keys and anonymous callers cannot read challenges
or change domains. Tables and RPCs remain private to the service role with RLS.
Account-keyed UI state prevents a subsequent account inheriting the previous UI.

Checking DNS reserves an attempt before the external lookup: one check/domain/
minute, 30 checks/owner/hour and 100 globally/hour. The actual lookup always goes
to Cloudflare's fixed HTTPS DNS endpoint. It never fetches the submitted hostname,
follows redirects or sends the token to the resolver. Responses are streamed with
a 64 KiB cap and eight-second timeout. Only a matching question/name, TXT type,
successful DNS status and exact complete token pass. Multiple quoted TXT chunks
are supported. Redirects, malformed/truncated/oversized responses and transient
failures do not become successful proof.

Fresh proof lasts 24 hours. A definite missing record clears it; a transient
failure preserves only the existing expiry, never extends it. Replacement rotates
the challenge and immediately clears ownership proof. The result must match the
current domain version, a single-use attempt nonce and the one-minute observation
window. Concurrent edits, rotation, disable/removal or lost owner rights prevent
an old in-flight observation being applied.

## Stored defaults and lifecycle

Root, not-found and expired-link destinations accept public HTTP(S) URLs, including
public IPv4 destinations. Private addresses, credentials, relative paths and known
short-link-domain loops are rejected. Edits preserve omitted fields and use an
optimistic version. Disabling a domain blocks new ownership checks. Removal and
challenge replacement require review; removal refuses a record with a provider
hostname ID, reserving provider cleanup for the provisioning stage. Settings and
proof refreshes keep expanded setup panels open.

Signed branded routing serves these defaults after current readiness checks.
Domain namespaces, guarded CRUD/bulk, five SDK field contracts, inventory/CSV/QR
and the tracked/member builders are implemented locally. Remaining domain work
includes transfer workflows, authorized DNS auto-configuration/
forwarding setup and production rollout. Managed root-link policies and explicit
provider validation restart are implemented locally; see their sections below.

## HTTP contract

Registered owner sessions use `/api/redirects` (or the existing direct edge API):

- `GET /domains?archive=active&q=<hostname>&limit=50&cursor=<UUID>`: owner-only
  filtered keyset list and exact count. `archive` accepts `active` (default),
  `archived` or `all`; `q` matches a literal case-insensitive hostname substring.
- `POST /domains`: hostname and optional stored defaults.
- `GET /domains/:id`: current setup/proof metadata.
- `PATCH /domains/:id`: version plus changed defaults/disabled/archived state.
- `POST /domains/:id/verify`: version; reserve, check real DNS, apply current result.
- `POST /domains/:id/rotate`: version; replace challenge and clear proof.
- `DELETE /domains/:id`: JSON version; reject a provisioned hostname.

The branded proxy forwards DELETE bodies so guarded removal works there too.
The schema rejects unknown fields; callers cannot set ownership, provider IDs,
challenge tokens or readiness. API keys deliberately do not manage this account-
owner registry. Scoped links-read domain choices are a separate public-field API.

## Evidence and release

Migrated PostgreSQL verifies owner rights, distinct tokens, paging/counts,
normalization constraints, defaults/loop/private-address checks, stale writes,
nonce replay, stale observations, rotation, proof expiry/loss, transient failures,
disabled checks, provider removal guards and private grants. The actual HTTP
handler additionally runs create/verify/defaults/lost-proof/delete and API-key
rejection against that database with an isolated DNS response. Five SDKs and
examples retain their existing HTTP tests; they do not yet expose domain methods.
UI and helper tests cover instructions, explicit review, exact DNS parsing,
stream bounds, IDNs and keeping the expanded panel open after a new server version.

Native desktop/mobile screenshots use `domain-registry-*` under the existing
outputs directory. Registrations/DNS results are explicitly simulated and all
production fetches blocked. At 390 pixels client and scroll widths are both 390.
No production DNS changes, provider provisioning, live registry writes or deployment
were performed. Live controlled-domain/TLS evidence is still required for parity.

References: [Dub custom domains](https://dub.co/help/article/how-to-add-custom-domain),
[Cloudflare SaaS setup](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/),
[Cloudflare DNS JSON](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/).

## Durable hostname and certificate lifecycle

Configure the dedicated server secrets `REDIRECT_CF_ZONE_ID`,
`REDIRECT_CF_API_TOKEN` and `REDIRECT_CNAME_TARGET` for a Cloudflare for SaaS zone.
Use a zone-scoped token with SSL and Certificates Write permission, not an account
API key or the existing general Cloudflare admin tooling credentials. The CNAME
target/fallback origin and eventual Worker routing must be set up and verified by
the operator; this implementation does not silently change DNS or zone routes.
The owner API reports configuration presence and the target, never the token.
Missing/invalid configuration leaves the worker idle before claiming any work.

Connect and disconnect require explicit UI review. Connection needs fresh TXT
proof, an enabled domain and current owner permission. It queues a private job;
the API request does not provision inline. The worker leases up to three jobs for
two minutes and uses bounded, eight-second Cloudflare requests. Responses are
streamed with a 128 KiB cap. Candidate IDs, statuses and matching TXT validation
records are allowlisted; certificates/private keys and raw provider error bodies
are not returned or logged. Existing objects are checked for an exact hostname
match before binding or deletion. The stored zone and target cannot change while
provider resources or uncertain work remain. A fully disconnected registration
can bind a new configuration on its next reviewed connection.

A preflight exact-hostname lookup runs before creation. A durable single-use create
intent is recorded before POST. The adapter makes that POST once; GET and DELETE
can retry, while an uncertain create response enters review. Successful creation
receipts remain recordable after lease expiry or cancellation so an external
object cannot disappear from tracking. Cancelling makes readiness false first,
then the worker removes the known object. A confirmed delete/404 clears only the
same binding, even if another owner action raced it. Registry removal is blocked
while resources, uncertain creation or unfinished work remain.

An owner can review a matching existing provider candidate and explicitly adopt
it. Connecting adoption requires fresh ownership; cleanup-only adoption with
connection disabled can revoke an old object even after TXT ownership was lost.
The worker rechecks the exact hostname and current owner permission. Nothing is
silently adopted by hostname. This does not require the separately restricted
Cloudflare Custom Metadata feature.

For an uncertain creation with zero catalog matches, automatic creation remains
blocked. The owner must inspect Cloudflare, wait at least 15 minutes from the
recorded intent, refresh candidates within the last five minutes, and explicitly
attest absence. This clears the uncertain intent and leaves the job disconnected;
a new connection still requires separate review. Catalog lookup alone does not
claim certainty about a previously timed-out write.

Readiness requires both Cloudflare hostname and certificate statuses to be
`active`, a provider binding, fresh checks (15 minutes), enabled/current ownership,
a connection still requested, and a requester who remains a workspace owner.
Proof rotation/expiry/loss, disablement, owner-role loss and disconnect close that
flag immediately. Healthy/status-pending reads schedule another check after five
minutes; transient failures preserve the old timestamp and back off, respecting
bounded Retry-After. Twelve consecutive failures stop automatic attempts until
owner review/retry. Queue/scheduler capacity must be verified for the deployed
number of domains so checks do not age out under backlog. Certificate readiness
is not a public routing health check; the separate signed route proof gates primary selection.

The internal/admin-authorized `redirect-domain-provisioner` function consumes the
queue. Its minute cron uses the established project-local Vault `supabase_url`
and `internal_invoke_secret`. Without either, the schedule makes no HTTP call;
without dedicated provider config, the worker claims no work. Worker calls and
provider snapshots are isolated in tests; no scheduled production run is claimed.

Owner endpoints (all require the current domain version):

- `POST /domains/:id/provider/connect`: reviewed connection request.
- `POST /domains/:id/provider/refresh`: queue current status/reconciliation checks.
- `POST /domains/:id/provider/disconnect`: disable readiness, queue cleanup.
- `POST /domains/:id/provider/adopt`: reviewed `candidateId` from current results.
- `POST /domains/:id/provider/confirm-absence`: explicit `confirmedAbsent: true`.

Validation: real migrated SQL covers create-intent single use, stale leases and
operations, late receipts/cancellation cleanup, reviewed adoption/absence, changed
configuration, permission/ownership loss, private grants and removal guards.
Seventeen focused UI/adapter/worker authorization tests pass. The HTTP harness
queues through the actual handler, runs the actual adapter against an isolated
Cloudflare API and the migrated database, and proves exactly one create, pending
versus active TLS, refresh and asynchronous deletion. All five SDKs/examples keep
passing. Native `domain-provider-*` screenshots show reviewed requests, pending
and active TLS, immediate readiness loss and completed cleanup in labelled fixtures
with production requests blocked. The mobile page fits 390 pixels. TLS/provider
resources on a real controlled domain, public Worker routing, DNS target checks,
provider validation restart, domain SDKs and deployment remain open.

References: [Cloudflare activation and certificate states](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/validation-status/),
[Custom hostname API](https://developers.cloudflare.com/api/resources/custom_hostnames/methods/create/),
[Workers as fallback origin](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/).

## Hostname namespaces and authenticated routing

`domainId` on link create, update, upsert and bulk operations selects the domain.
Explicit `null` selects the built-in namespace; an omitted update preserves the
current binding, while an omitted create/upsert selects the built-in namespace.
List/count `filters.domainId` uses the same UUID/null semantics. API responses
include `domainId`, `domainHostname` and the canonical `shortUrl`. Existing ID,
folder and token permissions still apply. A new/moved binding needs current
ownership, TLS and routing proof. Existing unavailable links can still be edited
or removed. Domain deletion is restricted while links reference it.

Managed CSV includes `domainId` and roundtrips bindings. Blank update cells preserve
the binding; `null` explicitly returns it to the built-in namespace. Duplicate
checks use domain plus slug. The all-source inventory displays branded URLs and
its QR export preserves QR attribution on managed links. Ordinary external URLs
remain unannotated. Tracked-link, member and manual CMS builders select ready domains; owner primary preferences set their interactive defaults.

The dedicated `workers/redirect-domains` relay derives scope from the actual HTTPS
request URL. It forwards neither customer credentials/cookies nor customer-supplied
internal headers. Its domain-separated HMAC covers protocol, method, hostname,
path, canonical query, visitor IP and timestamp. The resolver rejects bad/old MACs,
altered routing parameters and unknown/unready domains without trying the built-in
namespace. The built-in resolver explicitly selects a null domain binding.

Every branded request rechecks current provider requester authority, enabled
state, 24-hour ownership proof and provider hostname/TLS observations no older
than 15 minutes. Click recording checks domain state again before consuming quota.
Public previews, password gates, targeting, conversions, cloaking and QR visits
continue through the same resolver. Legacy root/not-found/expired fallbacks never
count as visits. Managed root records follow normal quota/analytics behavior.
Runtime destination checks reject registered redirect-domain loops.

The owner uses **Check branded routing** after DNS and TLS setup. The browser makes
an explicit, cookie-free GET with no referrer to
`https://<hostname>/.well-known/qg-redirect`. A valid signed request records routing
proof tied to the current provider ID and protocol. It returns only readiness
and protocol; CORS permits the configured application origins without credentials.
The UI refreshes authoritative registry status and never treats an arbitrary
customer-host response as database proof. Routing proof lasts 24 hours; actual
signed traffic refreshes it after six hours. Dormant domains need a fresh check
before they can receive new link bindings. No server fetch to an arbitrary
customer hostname is introduced.

Known-provider polling renews previously owner-verified DNS proof when fewer than
six hours remain, including recovery of expired previous proof. It uses the same
bounded DNS verifier, per-domain cooldown, global/actor budgets, observation nonce,
version checks and current owner authority. Missing TXT clears readiness;
transient DNS failure never extends proof. A rotated/unverified challenge is
never verified automatically. Provider cleanup remains available independently.

## Release order and verification

1. Apply the namespace/routing migration before deploying clients that select the
   new columns, then release the redirect API, resolver and domain provisioner.
2. Configure the dedicated SaaS fallback Worker with the intended `SUPABASE_URL`,
   public `SUPABASE_ANON_KEY` and a sufficiently long `REDIRECT_RELAY_SECRET`
   matching the resolver. The committed configuration has no production URL,
   credentials, custom-host routes or workers.dev exposure. The ignored local
   fixture variables are not production credentials.
3. Review the dedicated SaaS fallback zone and Worker routing using the
   [Cloudflare Worker-as-origin setup](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/).
   Do not apply a wildcard route to the main application zone as a shortcut.
4. Provision one controlled hostname, verify TXT/TLS, run the browser routing
   check, and verify real DNS/Worker/backend traffic before moving live links.
   Exercise same-slug isolation, root/not-found/expiry defaults, password and QR
   visits, disablement, missing DNS proof, requester revocation and cleanup.

Local SQL, actual HTTP/SDK integration and Worker/resolver fixtures verify the
implementation. They do not establish real DNS, certificate issuance, deployed
routing, cron scheduling or production migration success.

## Ready choices and primary defaults

`GET /domain-choices?limit=100&cursor=<UUID>` needs `links:read` and returns only
ready `{id, hostname}` choices, count, cursor, `primaryDomainId` and
`primaryUnavailable`. Owner/unrestricted credentials and members able to create
links receive ready workspace domains. ID-bound keys and non-creating members
receive only domains used by their currently visible links and no global primary
preference. No verification token, provider metadata or private registry fields
are returned. Inactive/revoked principals fail current SQL checks.

Owner sessions use `GET /domain-preference` and
`PATCH /domain-preference` with `{domainId: UUID | null, version: UUID}`.
Selecting a custom primary requires fresh ownership/TLS/routing. Optimistic
versions prevent concurrent edits overwriting each other; deleting a domain
clears and versions its preference. API keys/members cannot manage the preference.
Existing link bindings never change. API create/upsert omission continues to
mean the built-in namespace; interactive builders submit the selected domain
explicitly.

An unavailable primary blocks automatic selection until the user explicitly
chooses another available domain. A selected hostname disappearing on refresh
also stays visibly unavailable instead of looking like a built-in fallback.
An existing unavailable binding remains selectable for repair without moving the
link. The builder uses the canonical response URL for QR export; the member list,
policy tools and CSV preserve branded identity. Domain choice queries are account
keyed, paginated with loop detection and refreshed on focus. The owner can reload
primary settings after a conflict. All live create/move operations still recheck
readiness and folder/credential permissions in SQL.

The five local SDKs expose `listDomainChoices` (TypeScript/PHP),
`list_domain_choices` (Python/Ruby) and `ListDomainChoices` (Go), with limit/cursor
pagination. Preference management remains an owner-session UI/API action.

## Atomic manual CMS records and complete link fields

The Redirects inventory opens the shared CMS editor, rather than the retired
standalone dialog. Its registered domain field adopts the primary for new records,
retains an existing unavailable binding for repairs, preserves draft choices across
field-group remounts and follows refreshed original values without writing an old
binding back. The existing CMS panels and metadata behavior remain available.
Copy/test row actions use the public branded URL, never an unscoped resolver URL.

Owner sessions use `GET /manual-records/:id`, `POST /manual-records` with `{values}`
and `PATCH /manual-records/:id` with `{values, expectedUpdatedAt}`. Accepted fields
are the manual type/source/target/status, query settings, starts/ends, visit limit,
notes and domain ID. Identity, created-by/time, click count and derived hostname
are not writable. SQL rechecks the owner role and the loaded timestamp, applies
SHORT/PATH conversion plus binding in one transaction, synchronizes policy expiry
and returns the actual complete row. Keys and ordinary members cannot use this
owner endpoint. The CMS normalizes expected conversion clears before comparing
submitted and stored fields; it does not report a successful type conversion as
silently rejected fields. Existing IDs, counts, creation metadata, other policy
fields and unrelated values stay intact. Invalid/stale conversions roll back.

The scoped managed-link API and five SDKs also support nullable `startsAt`,
`clickLimit` (positive 32-bit integer) and `notes` (up to 10,000 characters) under
existing link permissions. Omitted fields stay unchanged. Submitted start/end
ranges must be ordered; clearing expiry updates the policy copy. Managed CSV
roundtrips these fields and uses `notesJson`, preserving literal null text/empty
strings/null clearing while preventing spreadsheet formula evaluation. No
deployment or production schema success is implied by this local implementation.


## Domain filters and linked-domain facets

The inventory's domain filter groups all loaded source rules by hostname,
including manual custom hosts and built-in automatic, static and client routes.
It uses `?domain=<hostname>`; built-in www aliases share the queer.guide bucket.
An unknown bookmarked domain produces no matches. Filtering resets selection and
pagination, and exports and copied views use the same filtered rows.

The member workspace keeps `q`, `folder`, `archive=1` and `domain` in its URL.
Use a custom domain UUID or `domain=builtin` for the built-in namespace. These
compose with the server's existing search/folder/archive filters. Browser history
changes clear transient selections and destructive dialogs. Invalid domain
bookmarks show an error without requesting an unfiltered link list.

`GET /linked-domains?limit=100&cursor=<UUID>` requires `links:read`. It returns
`data: [{id, hostname, linkCount}]`, custom-domain `count`, `builtinCount`,
`nextCursor` and `revision`. Counts include all currently accessible SHORT links,
including archived and disabled links. Domains remain visible after losing
readiness, so existing links can still be found. PATH rules are excluded.
Membership, folder/ID restrictions and revocation are checked under the ACL lock.
No registry, ownership or provider fields are returned. A domain no longer in the
accessible catalog retains a neutral selected label without fetching its hidden
hostname or silently changing the filter.

This management catalog is independent of `/domain-choices`, which remains the
ready-only creation catalog. The browser reads every page with cancellation,
cursor-loop detection and a matching revision; a changed revision rejects the
combined result and requests a refresh. Each revision covers visible hostname
bindings and counts, not click activity or provider status. SDK methods return
individual pages, so callers assembling a catalog should apply the same revision
check.


## Restart hostname and certificate validation

Owner account sessions can request `POST /domains/:id/provider/restart-validation`
with the current `{version}`. This queues Cloudflare's no-change SSL PATCH for the
existing provider hostname. `Refresh provider checks` continues to read status.
Keys and member sessions cannot request a restart. The domain must be enabled,
currently verified and connected to the configured zone/target. Requests are
limited to one every five minutes and invalidate cached certificate readiness.

The durable worker first GETs and verifies the exact provider ID and hostname,
then checks the current lease/operation, binding, proof, configuration and owner
permission in SQL before consuming one restart intent. It sends only the observed
DV certificate `type` and validation `method` (txt/http/email). Unknown settings
require provider inspection. It never substitutes a method or creates a hostname
as the restart operation. Intervening refresh/disconnect actions supersede the
pending restart.

The provider response exposes `canRestartValidation`,
`validationRestartPending`, `validationRestartRequestedAt` and
`validationRestartStartedAt`. Started means authorization was consumed before the
network call, not proof that Cloudflare applied the PATCH. A crash or ambiguous
network result may leave the external outcome unknown. Status jobs continue GET
polling without repeating that PATCH; review status and request again after the
cooldown when necessary. This prevents repeated backoff resets. The UI labels
queued, attempted and superseded requests separately.

Cloudflare documents the matching SSL-object PATCH as a DCV restart in its
[Common API Calls guide](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/common-api-calls/).
Local provider simulations establish request behavior, not actual certificate
issuance or production DNS/provider configuration.


## Managed domain homepages

Create a managed root through the link API with
`{domainId: "<ready-domain-UUID>", isDomainRoot: true, target: "https://destination.example/path"}`.
The public `shortUrl` is `https://hostname/`. The returned slug is an internal
storage key and is not a public alias for the homepage. Only one root is allowed
per custom domain. Built-in and PATH roots are rejected. New root conversions or
host moves require current ownership, TLS and routing proof. Updates that omit
the flag preserve it, including repairs while a domain is unavailable.

Root upsert uses `domainId` and `isDomainRoot: true`, without requiring a slug.
Normal slug upserts exclude root records. A root and a normal link may have the
same storage slug because their public paths differ. Converting a root to a normal
link requires an available slug; conflicts roll back atomically. Existing ID/folder/
member/key permissions and metadata apply. Root links appear in normal link lists
and domain facets and can use folders, tags, comments, policies and reports.
CSV uses the `isDomainRoot` boolean alongside domainId; duplicate root identities
are rejected during import review. All five SDKs pass the same field.

The active CMS, tracked-link builder and member editor expose **Use domain
homepage**. The CMS allocates an internal slug when needed. Copy, QR and preview
URLs use the homepage, including scan-verified bulk QR exports with QR attribution.
Member prefilling creates a regular draft by default so copying a root does not
implicitly claim another domain homepage.

Signed branded `/` requests use the existing managed resolver pipeline: password,
scheduling, expiration, visit limits, targeting/experiments, previews, cloaking,
queries/UTM defaults and conversion tracking. The atomic visit recorder checks the
root-vs-normal source again before incrementing counters. Protected HEAD/bot
requests and failed password attempts do not record visits. The legacy `rootUrl`
is used only when there is no managed root record. A disabled/scheduled/expired
root never uses that legacy destination to bypass its settings. Removing the root
record restores the configured legacy fallback.

`npm run test:redirect-roots` runs the actual Worker, signed resolver and migrated
isolated PostgreSQL together, with provider/DNS/production requests excluded.
This proves local behavior; controlled real-host and deployment validation remain
part of release.


## Archive and restore

Owner domain settings include hostname search and Active, Archived and All views.
Archiving requires review and hides the domain from new-link choices and the
default registry list. Existing links, inventory facets, QR targets, signed routing,
provider work and outstanding native handoff receipts continue under their current
authorization and readiness checks. Archive is organization; use Disable or the
provider disconnect flow when routing must stop. Existing link editors preserve
an omitted current domain rather than changing its URL. Explicit authorized API
writes using a known domain ID retain the existing binding rules.

`PATCH /domains/:id` accepts `{ "version": "<current UUID>", "archived": true }`
or `false`. The API rejects stale versions and non-boolean values. Archiving the
primary domain atomically clears the new-link default and changes its preference
version; new links use `queer.guide/go` until another primary is chosen. Restore
returns the domain to active choices when its readiness checks pass, without
automatically choosing it as primary.

Isolated SQL and actual owner HTTP tests cover filtered counts/paging, scoped
choices, current-link editing, API-key/owner boundaries and concurrent versions.
The signed Worker/root resolver test archives a ready hostname and proves both
normal HEAD routing and resumption of an already issued native receipt, without
recounting the original visit. Desktop and 390px local fixtures show review,
archived readiness and restore; external DNS/provider requests are blocked.
The independent UI reviewer returned ship with no material fixes. The schema
change remains a release candidate; no live domain was archived during testing.

Reference: [Dub domain archiving](https://dub.co/help/article/archiving-domains).


## Use an existing website path

A ready domain row offers **Use under a website path**. Enter the existing website
origin (for example `https://example.com`), a path such as `/r`, and its hosting
platform. Generate and copy configuration for Cloudflare Worker Routes, Next.js,
Vercel or Netlify. This follows [Dub's external subpath adapter approach](https://dub.co/help/article/how-to-use-dub-with-subpath).

The visitor entry `https://example.com/r/community?utm_source=website` redirects
to `https://links.example.com/community?utm_source=website`. The browser moves to
the managed short-link hostname. Stored short URLs continue to use that hostname;
installing this adapter does not add a second routing namespace. Existing password,
install-page, targeting, tracking and expiration behavior runs there. Website
configuration must be installed and tested on the existing website. Generation
and copying do not change DNS, hosting or provider state.

Configuration generation requires current branded routing readiness. Origins
accept public HTTPS with a different hostname, with no credentials, port, path,
query or fragment. IDNs/case normalize. Prefixes are bounded ordinary path
segments; root, traversal, percent encodings, platform matcher syntax and reserved
account/API paths are rejected. Editing inputs or losing readiness clears old
output. Clipboard failures leave selectable configuration and clear instructions.

For Cloudflare, use a **Worker Route** on the existing proxied website origin,
scoped to the displayed path pattern. A Worker Custom Domain would replace the
website's origin handling. The module checks the configured HTTPS origin and the
exact path segment boundary. Unmatched paths stream through to the existing
website using `fetch(request)`. Matched GET/HEAD requests return an empty307 with
no-store and a fixed destination hostname. Other matched methods return405 before
forwarding. Visitors submit password/consent forms after arriving at the managed
host. Disable request URL logging on this adapter. Use the current compatibility
date when installing a new Worker project; the module needs no bindings, packages
or secrets.

Next.js generates an external temporary redirect with basePath/locale additions
disabled for the exact chosen prefix. Merge it into the existing configuration,
ahead of broader routes. Vercel also uses temporary redirects. Netlify uses302!
with bare-prefix and wildcard rules; the explicit priority can replace an existing
website page under that prefix, so choose the prefix accordingly. Next.js and
Netlify's published behavior passes queries through; provider deployment remains
an operator responsibility. Their platforms have separate caching/routing rules.

The Cloudflare adapter retains the exact encoded suffix and query, including
duplicate values and public install/QR markers. Its strict-origin-when-cross-origin
policy retains origin-level referrer analytics without forwarding the referring
page's path/query across origins. The managed resolver now also preserves repeated
incoming query values for keys absent from the target. Target and explicit
override keys retain precedence; DROP still ignores incoming/default values.

`npm run test:redirect-subpath` executes the exact generated module in workerd,
with every origin request isolated. It proves boundary/hostname/HTTPS guards,
GET/HEAD, method denial, fixed-host handling for double slashes, encoded suffixes,
exact duplicate queries, public markers and unchanged website fallback including
POST bodies. `npm run test:redirect-roots` follows its actual Location through the
signed branded Worker, resolver and migrated PostgreSQL: install pages do not
count, password GET/HEAD stays protected, the successful branded password POST
records one QR-attributed original click, and duplicate values/referrer plus query
mode precedence are retained. An automatic path-filtered CI workflow runs both.

Latest Workers5.20261015.1 types check the generated JavaScript. The checked-in
workerd fixture uses the compatibility date supported by its locked runtime; no
project dependency lock changed. Twelve UI/helper tests cover origin/prefix
validation, executable provider syntax, readiness, copying and stale-output reset.
Labeled desktop/390px fixtures fit the viewport and produce no console warnings
or errors. One detector returns[], and the independent finish reviewer approves
with no material fixes. These are local runtime/configuration proofs, not evidence
of installation on a live website.

Sources: [Cloudflare Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/),
[Next.js redirects](https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects),
[Vercel redirects](https://vercel.com/docs/routing/redirects),
[Netlify query parameters](https://docs.netlify.com/manage/routing/redirects/redirect-options/#query-parameters),
[W3C Referrer Policy](https://www.w3.org/TR/referrer-policy/).

## Owner-approved automatic DNS setup

The candidate API now supports a signed Domain Connect flow for short-link
subdomains whose closest authoritative zone uses Cloudflare or Vercel. The owner admin controls are implemented locally; provider onboarding and
controlled live approval remain open.
The fixed candidate template is `config/domain-connect/queer.guide.redirects.json`.
It creates a CNAME to `links.queer.guide.` plus the exact ownership TXT challenge
under the chosen subdomain. It does not configure an apex or unrelated records.

Server-only configuration requires `REDIRECT_DOMAIN_CONNECT_PRIVATE_JWK` (an RSA
private JWK for RS256, 2048–8192 bits), `REDIRECT_DOMAIN_CONNECT_KEY_LABEL` (one DNS
label such as `_dcpubkeyv1`) and `REDIRECT_CNAME_TARGET=links.queer.guide`. A missing
or invalid configuration returns 503 after owner authorization. There is no
unsigned fallback. Keep the key in the deployment secret store; never commit it,
return it to the browser or reuse the platform Cloudflare API token for customer
DNS. The function has its own `deno.json`/`deno.lock`; tldts and its parser core
are locked to the same versions used in the application tests.

Before enabling this in production, register and obtain provider approval for the
exact template, publish its matching public key at
`<REDIRECT_DOMAIN_CONNECT_KEY_LABEL>.domainconnect.queer.guide`, and exercise the
provider approval flow on a controlled domain. Neither the candidate template nor
a configured private key proves provider onboarding or public-key publication.
These external prerequisites have not been performed.

Owner-session endpoints (API keys and members are denied):

- `POST /domains/:id/dns-setup/discover` with `{version}` reserves an operation and
  network budget, discovers the DNS provider and checks exact template support.
  An available result enters `review` and includes the current domain challenge.
- `POST /domains/:id/dns-setup/approve` with `{version,operation}` signs the fixed
  records/callback and returns `approvalUrl`. The admin UI shows the exact CNAME/TXT names and values, requires record
  review, and sends the user to the matching provider's own approval screen. The API does not write customer DNS.
- `GET /domain-connect/:operation` resolves callback correlation for the same
  current owner and returns its domain/version. It ignores provider success
  assertions and does not change ownership.
- `POST /domains/:id/dns-setup/complete` with `{version,operation}` reserves and runs
  a fresh ownership TXT check, then applies its single-use observation through the
  existing verifier. `missing`/`unavailable` cannot become successful proof. TLS,
  SaaS hostname provisioning and signed branded routing remain separate checks.

Operations have a 15-minute application lease and are bound to the actor, domain
version and signing configuration fingerprint. Edits, challenge rotation,
archive/disable/removal, owner removal, expiry or key/label changes invalidate
pending operations. Discovery is limited to one operation/domain/minute,
30/owner/hour and 100 globally/hour before external requests. The operation table
and RPCs are service-only with RLS. Old expired operations are pruned on new
reservations. Review/sign/issue/check transitions reject replay.

The synchronous Domain Connect protocol does not give the signed provider URL
an enforced expiration. The application lease bounds callback/check processing;
it does not revoke an already issued provider URL. Applying any URL still needs
the DNS provider's authorization, and an obsolete TXT challenge cannot prove
current ownership. Do not label the provider URL as expiring after 15 minutes.

Discovery uses a public-suffix parser including private suffixes, walks only to
the registrable boundary, and honors closer delegated NS zones. DNS requests go
to one fixed HTTPS resolver; settings/API/dashboard URLs are restricted to the
supported providers and must agree with the DNS-advertised provider. All requests
reject redirects and share an eight-second deadline. DNS bodies are capped at
16 KiB, provider bodies at 32 KiB. Ambiguous aliases/TXT records, malformed
metadata and template errors fail closed. A 200 template response may have an
empty body per the protocol; a supplied version must equal the candidate version.

Proof: parser/provider cases, configuration and actual RSA signature tests; the
isolated migrated PostgreSQL suite; and the real owner HTTP handler through
stored operations, bounded provider fixtures, signed approval, callback lookup
and fresh TXT verification. No live provider approval or DNS write is implied.


The Custom domains section uses `dnsSetup.configured` and `dnsSetup.cnameTarget`
from the owner list response to show availability without exposing signing
material. Unconfigured setup has an explanation and manual instructions. The
inline review supports cancel, pending/error and unsupported-provider states;
archived/disabled domains cannot start. Callback UI reads only `domain_connect`,
loads the account-bound operation, ignores provider success parameters and
requires a fresh check. Dismissal preserves unrelated query fields. Account and
domain-version keys reset stale row state; an unmounted approval cannot navigate.

Local UI verification covers 13 registry/approval/return interactions and final
1280px/390px record-review and callback fixtures with no horizontal overflow.
The actual API contract suite also checks that public availability contains only
its boolean and fixed CNAME target. These fixture captures do not establish live
provider onboarding, approval or DNS changes.

## Native DNS instruction email

The owner API now supports native instruction email through a private durable
outbox and the shared Cloudflare email gateway. The owner domain row provides inline exact-record
review, a single recipient, email submission and private status/recovery/cancel
controls. Live configured-sender/delivery proof and rollout remain required.
No real recipient or email provider was contacted during implementation.

Explicit server configuration is `EMAIL_GATEWAY_SECRET`, `EMAIL_GATEWAY_URL`,
`REDIRECT_DOMAIN_EMAIL_FROM` (a verified sender address, optionally with a display
name), and the current `REDIRECT_CNAME_TARGET`. Missing/invalid configuration
leaves the feature unavailable. The owner domain list exposes only
`instructionMail.configured`; sender, credentials and transport fingerprints are
not returned. The gateway URL and shared secret must match the deployed
`queer-guide-email-delivery` Worker. This uses the existing email gateway, independently of Domain
Connect template onboarding or its signing key.

Owner-session routes:

- `GET /domains/:id/instructions` returns current `hostname`, domain `version`,
  `records`, a SHA-256 `snapshot` digest and the latest caller-owned `latestMail`.
  Records include the full CNAME, ownership TXT and applicable saved provider TXT
  records. The API never invents an apex A/AAAA address. Certificate records also
  affect the digest, even if a provider refresh does not change the domain version.
- `POST /domains/:id/instructions` accepts only
  `{version,snapshot,email,requestId}`. The request ID is a client UUID retained
  through an unknown HTTP response. Recipient validation permits one address,
  preserves local-part case and normalizes IDN domains. Caller-supplied records,
  content, sender, callbacks, CC/BCC and attachments are not accepted. The API
  queues once, attempts only that job immediately and returns its receipt with
  HTTP202. Read the receipt state; HTTP202 is not a delivery promise.
- `GET /domains/:id/instruction-emails/:jobId` reads a caller-owned receipt.
  `GET /domains/:id/instruction-emails?requestId=:uuid` recovers a receipt by request
  identity as `{mail:receipt|null}`, including after a domain version changes.
  With no query, the collection returns the current owner’s latest receipt for
  this domain, also as `{mail:receipt|null}`. It remains available when sending
  is unconfigured or the domain is disabled/archived; another owner’s recipient
  and receipts are never returned.
  A null lookup does not prove an earlier in-flight HTTP request can never queue.
- `POST /domains/:id/instruction-emails/:jobId/cancel` with `{}` cancels only an
  unsent, non-ambiguous job. A started request or unknown outcome cannot be
  recalled. Receipts retain truth if the owner loses permission after provider
  acceptance; that user cannot read them again until current owner access returns.

All routes deny API keys and ordinary members. SQL rechecks current owner role;
job metadata is actor-bound. The outbox, snapshots and RPCs are service-only with
RLS and cascade away when the domain/account is deleted. New mail is limited to
one job/domain/minute, ten/owner/hour and100 globally/hour. Identical replay of a
request ID returns its existing receipt without spending send quota or creating
another message; a different recipient/snapshot under that ID conflicts.

Before every send, the durable lease rechecks the current owner, domain version,
enabled/archive state, record digest and configured target. A cancelled lease or
stale unsent snapshot never reaches the provider. The exact first message payload,
including sender, is saved before sending and reused on retry. Provider requests
use the configured gateway's HTTPS `/send` endpoint, reject redirects, time out after20seconds and bound
response bodies to16KiB. Bodies/raw provider errors are not exposed or logged.

A provider receipt yields `sent`, meaning provider acceptance. It does not confirm
inbox delivery or DNS/ownership/TLS/routing readiness. Known rejection or exhausted
unsent retry yields `failed`. Lost/invalid receipts are retried with the same
message identity and persisted payload, at most eight attempts and within23hours
of queueing. The gateway's Durable Object persists submission uncertainty before
calling the native provider and never resubmits an uncertain identity. An unresolved result at
the boundary, a changed credential after an ambiguous attempt, or setup changes
after a possible send yield `uncertain`, not a false failure/cancellation. A request
already in flight can complete after a role or setup change; it cannot be recalled.

`redirect-domain-instruction-mail` is a dedicated internal-secret/current-admin
consumer, with its own frozen Deno configuration/lock. It claims at most three
jobs per invocation. The guarded once/minute cron command uses the existing
Vault `supabase_url` and `internal_invoke_secret` (matching the function’s
`INTERNAL_INVOKE_SECRET`); missing configuration makes no
HTTP call. Its named schedule can be reapplied without duplicating jobs.
On 2026-10-25 the production schedule existed but skipped HTTP because the public
project URL was absent from Vault. After verifying all five URL-dependent jobs
were Redirects jobs and the mail/domain/webhook queues were empty, the public
project URL was configured. A guarded empty-queue probe returned HTTP200 from
all five workers. Domain instruction mail and domain provisioning still reported
`configured:false`; this does not establish sender or provider readiness.

Verification covers exact records and certificate changes, idempotent queueing,
private receipts, cancellation/races, current-owner removal, immutable retries,
credential changes, expired leases, retries and uncertainty. The actual HTTP
handler runs through migrated PostgreSQL and the actual gateway/receipt adapters
with a bounded mock transport, including
lost responses after simulated acceptance. The SQL driver also executes the real
scheduler command against an isolated net/Vault seam to prove missing-secret and
invalid-project guards. Frontend controls exist, while configured sender/provider,
a controlled real email, final browser verification and the overall release remain open.

References: [Dub forwarding behavior](https://dub.co/help/article/how-to-add-custom-domain),
[Cloudflare Email Service](https://developers.cloudflare.com/email-service/),
[Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions).


The email form persists the exact request body and UUID in account/domain-scoped
session storage before POST. A lost response or postflight403 keeps the recipient
locked and offers same-request retry/status recovery. A null lookup alone never
resets an ambiguous attempt. Only an observed first pre-queue400/409/429 unlocks
editing; a previously ambiguous retry remains locked on the same response.
A different fresh domain version plus a null request lookup can retire an
uncreated stale attempt. Provider acceptance is described separately from inbox
delivery; accepted or uncertain mail requires explicit recipient acknowledgement
before a new draft/UUID. Cancellation is shown only after server confirmation.
Fresh sessions can check previous email status without preparing a new send.

Fifteen UI interaction cases and the full56-case focused suite pass. Actual owner
HTTP/migrated SQL proves private latest status on disabled/archived domains with
sending disabled, key/current-role denial, exact snapshots, immutable unknown
retries, cancellation and postflight acceptance truth. The bounded1280/390px
fixture review reports no overflow or console errors. An independent reviewer’s
fresh-session status finding was fixed and its verdict is ship; the documenter
found no new global design rules. No actual email or production write was made.
