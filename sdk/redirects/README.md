# Redirects server SDKs

Local SDK sources for TypeScript, Python, Go, Ruby and PHP. Each client targets
queer.guide's Redirects API contract; these are not Dub SDK aliases. They cover
managed link CRUD/upsert/count/list/bulk, folder/tag/template CRUD/list, private
analytics and event pages, lead/sale tracking, presentation/image-upload methods,
QR publication and personal saved reports/shared dashboards. Link iterators follow keyset
pages and reject repeated cursors. Resource and event pages expose their cursors
for explicit iteration.

Use server credentials from **API and conversion setup**. Scopes are independent:
`links:read`, `links:write`, `workspace:read`, `workspace:write`, `events:read`,
`conversions:write`. Workspace scopes require unrestricted credentials; keys limited
to selected link IDs cannot change or read shared resources. Keep credentials in
server environment variables. No SDK performs token creation or privilege changes.

Clients use HTTPS by default (`https://queer.guide/api/redirects`), reject credentials
in base URLs, and allow plain HTTP only on loopback for development. Requests have
10-second transport timeouts, refuse redirects and cap responses at 8 MiB. Go additionally
accepts request contexts; TypeScript's generic request accepts an AbortSignal.
HTTP failures raise API errors carrying status and Retry-After. There are no
automatic retries, especially for create/update/delete. Retry conversion ingestion
with a stable event ID; pass money as decimal strings to preserve all six supported
decimal places. Revenue responses remain exact strings by currency.

## Workspace context

Account-session clients can call `getSession` / `get_session` / `GetSession` and
`listWorkspaces` / `list_workspaces` / `ListWorkspaces` to discover their current
workspace UUIDs and current roles. These account-only methods reject server API keys.
Pass an optional offset (default 0) for pages of up to 100; responses include
`count` and nullable `nextOffset`. `currentWorkspaceId` is null for an unavailable
explicit selection or an account without active access. Discovery never grants
access or silently replaces an unavailable explicit workspace.
The server reads current membership/owner state; stale admin claims do not grant
workspace access.

All current account roles, including Viewer and Billing, can read shared
configuration through `listWorkspaceInformation(kind, limit, after)` (TypeScript
and PHP), `list_workspace_information(kind, limit, after)` (Python/Ruby), or
`ListWorkspaceInformation(ctx, kind, limit, after)` (Go). Choose `domains`, `tokens`
or `webhooks`; pages contain `data`, `count`, and `nextCursor`. Server API keys
cannot call this account-only endpoint. Key prefixes are bounded and webhook
receivers expose only their origin; signing secrets, credential hashes and DNS
proofs are excluded. Current owner/member authority is rechecked, and access loss
can mark a saved credential or webhook unavailable.

Bind a client to a discovered UUID with TypeScript `options.workspaceId`, Python
`workspace_id=`, Ruby `workspace_id:`, PHP `workspaceId:` (fourth constructor
argument), or Go `client.WithWorkspace(id)`. Go returns a separate client copy;
other constructors retain their selected context. Requests carry the
`X-Qg-Redirect-Workspace` header. UUIDs are validated and normalized before
transport. The header selects a requested context and never grants permission.

The current implementation exposes only the explicit legacy workspace. Omitting
the option selects that workspace for existing clients. Other UUIDs fail403;
empty, duplicate or malformed selections fail400. The branded gateway preserves
these selections, including invalid empty values, so it cannot silently turn a
rejected selection into a mutation in the legacy workspace. New workspace
activation and domain transfer remain unavailable until all resource paths are
scoped. This foundation has not been deployed or published to package registries.

## Local usage

These sources have not been published to package registries. Copy the relevant
source into server code or use the local package/module. No third-party runtime
libraries are required. TypeScript compilation uses the repository's TypeScript.

| Language              | Source                    | Minimum runtime         | Example command (from repository root)                                                               |
| --------------------- | ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| TypeScript/JavaScript | `typescript/index.ts`     | Node 22+                | `npx tsc -p sdk/redirects/typescript/tsconfig.json` then `node sdk/redirects/typescript/example.mjs` |
| Python                | `python/redirects.py`     | Python 3.8+             | `python3 sdk/redirects/python/example.py`                                                            |
| Go                    | `go/redirects.go`         | Go 1.23+                | From `sdk/redirects/go`: `go run ./cmd/example`                                                      |
| Ruby                  | `ruby/redirects.rb`       | Ruby 2.6+               | `ruby sdk/redirects/ruby/example.rb`                                                                 |
| PHP                   | `php/RedirectsClient.php` | PHP 8.1+, HTTPS streams | `php sdk/redirects/php/example.php`                                                                  |

Set `REDIRECT_API_TOKEN` and optionally `REDIRECT_API_BASE` and `REDIRECT_TARGET`.
Each example creates a random short link and prints its short URL. To exercise
tracking, supply an existing recorded `REDIRECT_CLICK_ID`, `REDIRECT_CUSTOMER_ID`
and stable `REDIRECT_EVENT_ID`. Optional `REDIRECT_AMOUNT` plus `REDIRECT_CURRENCY`
sends a sale; its event ID appends `:sale` to the supplied lead event ID. Creation
needs workspace-wide `links:write`; tracking also needs `conversions:write`.

Python example in server code:

```python
from redirects import RedirectsClient
client = RedirectsClient(token)
link = client.create_link({"target": "https://example.com/register"})["link"]
for record in client.iterate_links({"isEnabled": True}):
    print(record["shortUrl"])
client.track_sale({"clickId": click_id, "customerExternalId": customer_id,
                   "eventId": invoice_id, "amount": "49.900001", "currency": "CHF"})
```

Equivalent method names follow each language's conventions (`createLink` / `CreateLink`
/ `create_link`). `request` / `Request` exposes the owned API path for additional
supported endpoints. See `docs/guides/redirect-link-management-api.md` and
`docs/guides/redirect-workspace-api.md` for fields, permissions and semantics.

## Verification

`npm run test:redirect-sdks` starts a loopback HTTP server, loads the actual edge
handler and uses the real migrations in isolated PGlite PostgreSQL. It runs all
five native runtimes, creates and edits shared resources and assigned links,
updates/upserts/deletes, writes lead/sale events with deduplicated retries, reads
analytics/events, follows a 101-row paged list, refuses redirects and preserves
429 retry headers without automatic retries. Final SQL checks prove five leads,
five sales and exact `249.500005` total. All five runnable examples are then
executed against that same isolated API with tracked leads/sales, producing a
verified ten-sale total of `254.500010`. No production API, credentials, payment
provider or schema is touched.

Go must be available on PATH or configured via `REDIRECT_GO_BIN`; the local agent's
verified vendor runtime was kept under ignored `tmp/go-runtime`. The test command
does not download runtimes. Production migrations/release, package publication,
remaining domain/deep-link methods and external integrations remain pending; outgoing webhook methods are implemented locally and await deployment validation.

Presentation APIs are documented in `docs/guides/redirect-presentations.md`.
The SDK integration suite checks all five presentation/upload wrappers with real
encoded raster bytes; file storage uses a fixture adapter.

Policy management is available through getPolicy/updatePolicy (TypeScript/PHP),
get_policy/update_policy (Python/Ruby), and GetPolicy/UpdatePolicy (Go). Use
links:read for reads and links:write for patches. The response exposes policy and
hasPassword only; top-level null policy fields remove a setting, and password:null
removes protection. See [the policy API guide](../../docs/guides/redirect-policy-api.md)
for fields, complete examples, hash limits and expiry/merge semantics.

## Branded hostname namespaces

Pass `domainId` (a registered domain UUID) in link create/upsert/update or bulk
input. Pass `null` to select the built-in `/go/` namespace. Omitted updates preserve
the current binding; omitted create/upsert selects the built-in namespace. The
same slug can exist on different domains. List/count filters accept the same
UUID/null `domainId`. Responses include the canonical `shortUrl`, `domainId` and
`domainHostname`; use `shortUrl` instead of constructing a URL from the slug.

A new or moved binding requires current ownership, TLS and signed public-routing
proof. Existing folder/member/token permissions still apply. Domain registration,
provider setup and routing checks are owner-session controls; these SDKs do not
acquire those privileges. Python/Ruby/PHP dictionaries and Go `Object` pass the
same fields as TypeScript `LinkInput`. The implementation and SDKs remain local
sources awaiting production rollout/publication.

Ready domain choices are available through `listDomainChoices(limit, cursor)` in
TypeScript/PHP, `list_domain_choices` in Python/Ruby and `ListDomainChoices(ctx,
limit, cursor)` in Go. The page includes public ID/hostname fields, count, cursor
and primary availability. Read scope and current link/member restrictions apply.
Primary preference writes require an owner account session; keys do not gain
registry or primary-setting privileges. Interactive builders use the saved
primary initially, while API omission remains the built-in namespace.

Managed link input/response includes nullable `startsAt`, `clickLimit` and `notes`.
Dates normalize to UTC; a submitted start/end range must be ordered. Visit limits
are positive 32-bit integers; null removes the limit. Notes accept up to 10,000
characters. Omitted update fields are preserved. All five native HTTP test clients
exercise these fields. Manual CMS type/source conversions are a separate owner-
session endpoint and are not granted to server keys.

Linked-domain management facets are available through `listLinkedDomains(limit,
cursor)` (TypeScript/PHP), `list_linked_domains` (Python/Ruby), and
`ListLinkedDomains(ctx, limit, cursor)` (Go). Pages contain accessible domain
ID/hostname/linkCount entries, custom-domain count, builtinCount, nextCursor and
revision. They include inactive domains used by visible SHORT links and exclude
inaccessible folders/IDs. These facets do not establish creation readiness; use
listDomainChoices for that. When combining pages, reject a changed revision and
restart the read. Domain UUID/null filters on list/count continue to apply.

For a managed domain homepage, create/upsert with `isDomainRoot: true`, a ready
custom `domainId` and `target`. Root upsert identifies the existing root by domain
and does not require a slug. There is one root per domain; normal slug upserts
exclude it. Responses expose `isDomainRoot` and canonical `shortUrl` ending in `/`.
Use that URL for sharing/QR. The returned storage slug is not a public root alias.
Omitted update flags preserve the current value. All normal policies, scoped
permissions, metadata, analytics and conversion APIs apply to the same link ID.
Five native integration tests create, upsert and delete a managed root through
the actual HTTP API against an isolated ready-domain fixture.

Effective saved QR appearance is available through `getQrStyle(id)` in
TypeScript/PHP, `get_qr_style(id)` in Python/Ruby and `GetQRStyle(ctx, id)` in Go.
Responses contain id, the resolved shape/colors and source
(default/workspace/domain), plus effectiveLogo and logoSource. A present logo
contains only public raster metadata and its fixed-project hosted URL. Current links:read, folder and ID restrictions apply;
owner preference endpoints remain unavailable to keys. All five native tests
exercise these getters. See [saved QR styles](../../docs/guides/redirect-qr-branding.md)
for precedence, batching, versions and remaining hosted-logo/image work.

## Live QR image links

Create an explicitly shared image for a managed link using `createQrImage(data)`
(TypeScript/PHP), `create_qr_image(data)` (Python/Ruby), or
`CreateQRImage(ctx, data)` (Go). Data requires `linkId` and can include `label`,
`expiresAt` (null for no expiry), partial `style` and `logoMode: inherit | none`.
Defaults follow current workspace/domain branding. Creation requires links:read
and current folder/ID access. Explicit arbitrary URL publication is restricted to
an owner account session, rather than server keys.

For an installation page, pass `purpose: "install"` with a managed `linkId`.
Optional `entryQuery` carries public campaign fields, for example
`utm_source=poster&ref=community%2Bfriends`; no password, click ID or private
handoff fields are accepted. It is normalized, limited to32 fields/2048 bytes,
and included after the fixed public install marker. The complete entry URL must
fit2048 bytes. Existing clients/records default to `purpose: "visit"`. Hosted
installation images follow the current canonical link and branding, including
custom artwork verification. Their metadata reports `purpose`; public profiles
retain the minimal URL/style/logo shape. Creation/rendering never mints a native
receipt or records a visit.

The creation response contains id/version/metadata plus `imageUrls.png`, `.jpg`
and `.svg`. Each URL contains a random bearer capability, returned once; save the
URL if you intend to embed it. The list API does not return the bearer or hash.
Default lifetime is until revoked. Public retrieval rechecks current creator and
link access, resolves the canonical short URL (including managed domain roots),
and never fetches the destination or records a click. Only output format/size may
be changed on a shared URL. Workspace/domain appearance and logo changes affect
future image requests; explicit appearance overrides and hidden logos remain.

List with `listQrImages(limit, cursor)` / `list_qr_images` /
`ListQRImages(ctx, limit, cursor)`. Revoke with `revokeQrImage(id, version)` /
`revoke_qr_image` / `RevokeQRImage(ctx, id, version)`. Lists contain own publications;
workspace owners can manage all. Revocation closes future image retrieval; it
does not erase downloaded images or revoke the ordinary redirect encoded inside.

Creation limits are 100 active image links and 60 creations/hour per principal,
600 creations/hour globally, with 429/Retry-After 3600. Deleting redirects cannot
erase the short-lived creation ledger. Clients do not automatically retry writes.
All five native SDK tests exercise creation, list and versioned revocation against
the actual API/migrated database. Separate full-path HTTP/Wasm tests verify live
branding changes and independently decode generated PNG/JPG images.

These endpoints and wrappers are local implementation, not a released package or
production endpoint. Per-export custom artwork and UI publication/copy/revoke
are implemented locally; controlled deployment remains required.

Custom artwork uses the same create method with `logo` containing bare-base64
PNG/JPG bytes (up to 1.5 MB and 1024px per dimension). Mode is implicitly custom;
explicit custom mode is also accepted, while inherit/none cannot accompany bytes.
The server creates a private 15-minute draft, reserves an immutable asset, fully
renders and scan-verifies through the fixed QR service, uploads once and rechecks
current permissions/version before publication. Only published responses contain
imageUrls; `state` and `logoAsset` describe the publication/artwork. Workspace and
domain preferences are unchanged. A failed/unknown upload leaves a private draft
for cleanup; do not blindly retry writes. List/revoke can manage failed drafts.
Uploaded raster artwork is public, with a read grace before physical cleanup after
revocation/deletion. Downloaded/previously fetched images cannot be erased.

## Personal saved reports and shared dashboards

Report methods use a **current account-session access token**, passed as the
client credential. They preserve personal report ownership and current workspace
membership/events access. Scoped machine API keys receive 403 for private report
management. Clients do not sign in or refresh sessions; the calling application
supplies a current token and creates a new client after refreshing it.

All five languages expose the same operations, using their usual naming:

| Operation              | TypeScript / PHP                 | Python / Ruby                       | Go                                    |
| ---------------------- | -------------------------------- | ----------------------------------- | ------------------------------------- |
| Create personal report | `createReport(data)`             | `create_report(data)`               | `CreateReport(ctx, data)`             |
| Get report             | `getReport(id)`                  | `get_report(id)`                    | `GetReport(ctx, id)`                  |
| Cursor page            | `listReports(limit, cursor)`     | `list_reports(limit, cursor)`       | `ListReports(ctx, limit, cursor)`     |
| Versioned edit         | `updateReport(id, data)`         | `update_report(id, data)`           | `UpdateReport(ctx, id, data)`         |
| Delete report          | `deleteReport(id)`               | `delete_report(id)`                 | `DeleteReport(ctx, id)`               |
| Run saved filters      | `runReport(id)`                  | `run_report(id)`                    | `RunReport(ctx, id)`                  |
| Explicit publication   | `createReportShare(id, data)`    | `create_report_share(id, data)`     | `CreateReportShare(ctx, id, data)`    |
| List publications      | `listReportShares(id)`           | `list_report_shares(id)`            | `ListReportShares(ctx, id)`           |
| Revoke publication     | `revokeReportShare(id, shareId)` | `revoke_report_share(id, share_id)` | `RevokeReportShare(ctx, id, shareID)` |
| Read public aggregates | `readPublicReport(data?)`        | `read_public_report(data)`          | `ReadPublicReport(ctx, data)`         |

Python and Ruby page options are keyword arguments. Go always takes an explicit
limit and uses an empty cursor for the first page; the others default to 50.
Create takes `{name, filters}`; filters support link/folder/tag scope, UTC dates,
event kind, geo/device/referrer/domain/variant/bot/QR choices and interval. Edits
take the current `version` and optional name/filters; reload after a 409 conflict.
Owned report metadata preserves the API's `created_at`, `updated_at`, `owner_user_id`
names. Aggregate money remains decimal strings; no SDK converts it to floats.

Creating/running a private report does not publish it. Share creation requires
`title` and reviewed `reportVersion`; optional settings are `scopeMode` (snapshot
or live folder), `includeConversions`, `allowIndexing`, `password` and `expiresAt`.
The default is click-only, non-indexed, frozen link selection and 30-day expiry;
explicit null expiry lasts until revoked. Live folder shares retain the backend's
owner requirement. Password-protected shares cannot opt into indexing. A later
report edit does not silently change the published filters.

```ts
const account = new RedirectsClient(currentAccountAccessToken);
let report = await account.createReport({
  name: 'Newsletter',
  filters: { linkIds: [linkId], qr: true, interval: 'day' },
});
const aggregates = await account.runReport(report.id);
report = await account.updateReport(report.id, {
  version: report.version,
  name: 'Reviewed newsletter',
});
const share = await account.createReportShare(report.id, {
  title: 'Newsletter clicks',
  reportVersion: report.version,
});
// Separate capability client: never substitute an account credential here.
const reader = new RedirectsClient('qg_report_' + share.id);
const publicAggregates = await reader.readPublicReport();
await account.revokeReportShare(report.id, share.id);
```

The public client receives only sanctioned aggregate fields and can POST a
password and/or `{dates: {start, end}}` without URL query parameters. Omit data for
GET (Python/Ruby default nil/None, Go nil); provide an object/map for POST. Date
selection is restricted to the published reporting period. Public reads retain
rate-limit, password, current access, expiry and revocation checks. Deleting a
personal report revokes its shares through the existing deletion cascade.

Native SDK tests use two isolated current account sessions plus a scoped key.
Each language exercises every method, page cursors, stale version conflicts,
other-account/key denial, exact revenue types, public date bodies, password gates,
revocation and deletion cascade through the actual handler/migrated PostgreSQL.
PHP additionally checks empty filter/date objects. Report records are cleaned
before the rest of the suite runs. These remain local SDK sources and require
controlled API rollout and package publication before release.

## Customer identity and journeys

All five clients expose getCustomer(id), updateCustomer(id, data),
clearCustomer(id, version) and customerJourney(id, limit, cursor), with their
usual snake_case / Go method naming. IDs are opaque UTF-8 text and are sent in
encoded query/body fields, so slashes, colons, spaces and ampersands are supported.
Journey cursors are objects containing at and id, not link-list UUID cursors.

Read requires events:read and a currently visible attributed link. Profile edits
and clearing additionally require links:write and edit access to every customer
link, preserving shared identity across folder/ID restrictions. Writes take the
current UUID version, or null for the first enrichment, and optional name/email/
avatarUrl fields. Blank/null clears a field. Clear removes only identity and
advances the version; it preserves visits/conversions. Conflicts return 409.
Profiles and journeys remain private; public dashboard DTOs never include them.

```ts
let customer = await api.getCustomer(externalCustomerId);
customer = await api.updateCustomer(externalCustomerId, {
  version: customer.version,
  name: 'Avery',
  email: 'avery@example.com',
});
const page = await api.customerJourney(externalCustomerId, 50);
await api.clearCustomer(externalCustomerId, customer.version);
```

Supply identity only through explicit application calls with appropriate consent.
There is no automatic scrape/enrichment, avatar fetch or implicit public sharing.
Native tests verify all four methods, encoded IDs, version conflicts, cursor
pages, identity-only clearing and preserved journeys against the real API/SQL.
The HTTP fixture additionally proves partial-grant edit denial, hidden-source
exclusion and public-report identity isolation. See the conversion guide for the
service-only table, deletion lifecycle, profile limits and UI behavior.

## Signed outgoing webhooks

Owner account sessions and unrestricted owner-created server keys can manage
webhooks. Keys require `events:read` and `workspace:read` for reads, or
`events:read` and `workspace:write` for mutations. Member and link-limited keys
cannot subscribe to workspace events. The creator must remain an owner.

All five clients expose create/get/list/update/archive, rotate-secret/test,
list/get deliveries, list attempts, and replay methods (`createWebhook` in
TypeScript/PHP, `CreateWebhook` in Go, `create_webhook` in Python/Ruby).
Pause uses an update with `enabled: false`; restore uses `restore: true` and an
explicit enabled state. Writes require the current `version`. A stale version
returns 409. Paginated history cursors are decimal **strings**, not JavaScript
numbers. Throttled creation, rotation, testing, or replay returns `{retryAfter}`;
check this union before using a returned record. Clients never retry mutations.

```typescript
const result = await owner.createWebhook({
  name: 'Conversion receiver',
  url: 'https://your-domain.com/webhooks',
  eventTypes: ['lead.created', 'sale.created'],
  includeCustomerId: false,
});
if ('retryAfter' in result) throw new Error(`Wait ${result.retryAfter} seconds`);
// Store result.secret in your receiver's secret manager now. Reads never return it.
```

Supported events are `link.created`, `link.updated`, `link.deleted`,
`link.clicked`, `lead.created`, and `sale.created`. Tests emit `webhook.test`.
Payloads contain event ID/type/timestamp and bounded event data. Destination
URLs, passwords, query/referrer parameters, IP addresses, private customer
names/email/avatar, and notes are excluded. Customer external IDs are an explicit
subscription option. Sale amounts remain decimal strings.

Verify the **original request bytes before JSON parsing** with the SDK helper:

```typescript
import { verifyWebhook } from './typescript/index.js';
const valid = await verifyWebhook(secret, rawRequestBytes, {
  id: request.headers.get('webhook-id') ?? '',
  timestamp: request.headers.get('webhook-timestamp') ?? '',
  signature: request.headers.get('webhook-signature') ?? '',
});
if (!valid) return new Response('Invalid signature', { status: 401 });
// Atomically deduplicate webhook-id and process the event, then acknowledge 2xx.
```

Python exports `verify_webhook`; Ruby uses `QueerGuide.verify_webhook`; PHP uses
`RedirectsClient::verifyWebhook`; Go uses `VerifyWebhook(secrets, body, id,
timestamp, signature, now)`. Helpers accept rotation signatures, compare complete
MACs without an early byte mismatch exit, reject timestamps beyond five minutes,
and enforce a 32 KiB body limit. Keep receiver clocks synchronized. Verification
alone does not deduplicate events.

A delivery succeeds only on HTTP 2xx. Other responses/network failures retry up
to eight times with exponential backoff and bounded Retry-After. Redirects are
never followed. Retries and manual replay retain event ID and exact body; replay
may therefore resend the original customer-ID choice. Rotation signs with both
current and previous secrets during a 24-hour overlap. Pause/archive/routing
changes cancel pending and leased work; a request already in flight cannot be
recalled. Completed payloads, bounded response excerpts, and attempts remain
inspectable for 30 days. New signing secrets appear once on creation/rotation.

The isolated verification suite runs with
`REDIRECT_DENO_BIN=/path/to/deno npm run test:redirect-webhooks`. It generates a
local test CA, proves pinned TCP/TLS delivery and wrong-hostname rejection, and
never alters production trust roots or sends foreign callbacks. Deployment of
`redirect-webhooks-dispatch`, the migration, and Vault-backed minute cron remains
necessary. Set the existing `supabase_url`/`internal_invoke_secret` Vault records
and matching Edge `INTERNAL_INVOKE_SECRET`; verify real scheduled receipts before
claiming production availability. No webhook secrets belong in browser storage.

## Native Segment and Google Tag Manager adapters

The Link workspace includes provider setup and downloads. These are local
implementation candidates; the UI does not claim that an external account is
installed or verified. Published assets are under `/integrations/redirects/`:

| Artifact                        | Native provider context                                  | Credential                                                           |
| ------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| `segment-destination.js`        | Segment Destination Function, `onTrack`                  | Secret `apiKey` setting with a scoped `conversions:write` server key |
| `segment-source.js`             | Segment Source Function, `onRequest` and `Segment.track` | Secret `signingSecret`, optional `previousSigningSecret`             |
| `google-server-conversions.tpl` | Google Tag Manager **server** container template         | Server variable holding a scoped conversion key                      |
| `browser-attribution.js`        | Optional Google **web** container / destination website  | No private credential                                                |

Segment inbound settings `leadEvent` / `saleEvent` default to `Sign Up` / `Order
Completed`. Map `userId`, stable `messageId`, optional `qg_click_id` in properties
or context.traits, and an optional valid timestamp. Sales require uppercase
`currency` and `properties.amount_decimal` in **major currency units**, with at
most six decimals. Prefer a decimal string; unsafe numeric revenue is rejected.
Retries use `segment:` plus the same messageId. Unrelated events and
`qg_redirects_origin: 'redirects'` events are ignored. Only trusted backend events
should enter the conversion destination. No arbitrary traits/profile identity
are imported. Temporary/429/5xx failures throw Segment RetryError; permanent
permission/input/redirect responses fail without leaking their response body.
A ten-second handler deadline and transport timeout bound receipt waiting;
unknown outcomes can be retried by Segment with the stable ID.

For outbound events, install the Source Function, then use its HTTPS URL in the
setup form to review/create a webhook. The one-time returned signing secret goes
in Segment's **secret** setting. The adapter verifies exact raw body bytes and a
five-minute timestamp tolerance before mapping allowlisted properties to native
`Segment.track`. It preserves amounts as strings and sets a stable `qg:` message
ID and origin marker. Anonymous event/click IDs are used unless the subscription
explicitly includes customer external IDs. During rotation, put the previous key
in `previousSigningSecret` for the 24-hour overlap. Verify actual raw text and
message-ID deduplication in Segment's debugger before production use; local
sandboxes do not establish the provider's runtime behavior.

Import the `.tpl` under Templates in a Google **server** container running image
2.0.0 or newer. Set kind, server key, opaque customer ID, stable event ID, event
name, optional click ID, and exact sale amount/currency. The tag requires both
analytics consent and trusted backend validation. It uses a bounded POST to one
of two fixed conversion URLs; its only permission is those URLs. It emits one
success or failure callback. Use Preview to verify permissions, redirect handling
and real API receipts before publishing the container. Checkout starts or
unverified browser amounts are not verified payment events.

The optional browser helper never writes conversions or sends network requests.
After your consent manager resolves analytics consent, call:

```javascript
qgRedirects.setConsent(true); // captures a valid qg_click_id from the current URL
const clickId = qgRedirects.getClickId(); // pass to your trusted backend event
qgRedirects.setConsent(false); // clears attribution storage and the host-only cookie
```

It shares the app's validated 30-day attribution storage format, writes a
host-only `qg_click_id` cookie (Secure on HTTPS, SameSite=Lax), and pushes one
`qg_redirect_attribution` dataLayer event per attributed click per page. It
preserves the existing dataLayer. Trigger tracking tags only while consent is
granted, and call the deny path on revocation. Storage/cookie restrictions fail
safely. No email/amount/order details are scraped from URL or page fields.

`npm run test:redirect-integrations` verifies provider-like sandbox behavior.
`npm run test:redirect-sdks` additionally drives these same adapters through
actual local HTTP, scoped API authentication, migrated PostgreSQL, signed real
outbox payloads, and native source mapping. It performs no Segment/Google account
writes and cannot replace provider account installation/debugger proof.

## Branded password pages

Managed short links have independent password-page branding. All clients expose
`getPasswordBranding`, `updatePasswordBranding`, and `uploadPasswordLogo` (the
corresponding snake_case / Go names follow the existing conventions).
`GET /links/{id}/password-branding` requires read access. Name/clear updates use
PATCH with the current nullable `version`; uploads use POST on `/logo` with
`{version, image}` and base64 PNG/JPG bytes. Writes require current link edit
access and selected IDs/folder grants. The key creator must remain an owner for
unbound owner keys. Viewer and expired/revoked credentials cannot publish.

```typescript
let branding = await api.getPasswordBranding(linkId);
branding = await api.updatePasswordBranding(linkId, {
  version: branding.version,
  brandName: 'Community events',
});
const upload = await api.uploadPasswordLogo(linkId, branding.version, pngBase64);
if ('retryAfter' in upload) throw new Error(`Wait ${upload.retryAfter} seconds`);
branding = upload;
// Clear the custom logo while preserving the public label:
branding = await api.updatePasswordBranding(linkId, {
  version: branding.version,
  clearLogo: true,
});
```

The plain brand name (up to 80 characters) and logo are explicitly public
pre-unlock decoration. They are separate from social previews, QR preferences,
and private customer identity. Logos are immutable controlled objects, capped
at 1.5 MB and 1024 px per dimension; remote image URLs, SVG and arbitrary asset ID
selection are unavailable. Stale updates return 409. Pending uploads expire after
15 minutes, finish rechecks the original principal/current grants/version, and
unknown receipts never trigger a second automatic Storage POST. Replaced/cleared
or deleted-link logos enter the existing cleanup queue with a one-hour grace.

The resolver decorates valid managed-link password challenges, incorrect-password
and throttled pages. It escapes labels, restricts image URLs/CSP to the fixed
Storage bucket origin, sends no referrer or credentials with the image, retains
the usable form on decoration failures and returns an empty HEAD body. Existing
password hashes/attempt budgets and destination access remain separate. The
editor preserves drafts/version conflicts across background reads, aborts old
account/link writes, and saves names separately from logo uploads without losing
an unsaved name. Private branding API reads and public minimal metadata have
separate contracts. Live Storage/cleanup/gateway checks and the pending base-table
RLS audit must pass before production availability is claimed.

## All-source inventory

All five clients expose `listInventory`, `getInventoryMetadata` and
`organizeInventory` using each language's naming convention (`list_inventory`,
`ListInventory`, etc.). Inventory includes PATH rules, automatic aliases and
static/client definitions, subject to current folder permissions. Use `links:read`
for reads and `links:write` for organization. `listInventory` accepts filters, limit
and an opaque `after` cursor; follow the returned `nextCursor`. Set
`domainId: "builtin"` to select the built-in host.

Read fresh metadata before writing. Organization accepts an array of unique
`{id, version, values}` operations, where `version` is the returned UUID or null.
Values may contain folderId, tagIds, comment and isArchived only. Writes are atomic;
a conflict requires reviewing the current version before retrying. Routing remains
controlled by its source. Pattern and reservation definitions are not concrete QR
URLs. See the inventory section in `docs/guides/redirect-workspace-api.md`.

## Native installed-app resolution

The credential-free [Swift package](swift/README.md) resolves canonical short URLs
for iOS15+/macOS12+. It is separate from the five server management/conversion
clients above. Its default consent is denied, it uses the live resolver policies,
and it returns explicit app/browser navigation decisions. Run
`node scripts/test-redirect-swift.mjs` on macOS. The [Android Java/Kotlin client](android/README.md) uses the same policy/consent
protocol with a dedicated OkHttp transport. Run `node scripts/test-redirect-android.mjs`
with JDK21/Maven. Both clients remain local candidates; deterministic deferred
attribution, signed-device evidence and package publication remain open.


Team report discovery is opt in. Lists default to personal reports; use optional
`view=team` or `view=all` with TypeScript/Python/PHP's third list argument or Ruby's
`view:` keyword. Go offers `ListReportsInView(ctx, limit, cursor, view)` alongside
the compatible personal `ListReports`. Current owners can set `visibility: team`
on their own create/update; updates require the current version. Team readers
receive `canEdit: false` and no author's account ID. Their runs use current link
permissions; they cannot edit/delete the source or manage its public shares. Save
a new report with the loaded filters to create a private copy. Set visibility to
`private` to withdraw discovery; independent public snapshots remain managed by
their own share methods. Publisher-owner and reader-member rights are checked on
every request. API keys cannot list or manage report definitions.

## Account-managed conversion adapter setups

All five server SDKs expose setup creation, metadata pagination, request receipt
lookup and revocation. These methods require an account session; Owner/Member
writes issue only a selected-link `conversions:write` credential. Generic key
administration remains Owner-only.

| Operation | TypeScript / PHP | Python / Ruby | Go |
| --- | --- | --- | --- |
| List | `listIntegrationSetups` | `list_integration_setups` | `ListIntegrationSetups` |
| Create | `createIntegrationSetup` | `create_integration_setup` | `CreateIntegrationSetup` |
| Recover request | `lookupIntegrationSetup` | `lookup_integration_setup` | `LookupIntegrationSetup` |
| Revoke | `revokeIntegrationSetup` | `revoke_integration_setup` | `RevokeIntegrationSetup` |

Create input is `{requestId, provider, name, linkIds, expiresAt}`. Generate a UUID
request ID once and retain that exact input for retries. Creation returns
`{created, installation, credential}`; only the first response includes the
one-time plaintext credential. Replays return a null credential. Lookup returns
`{installation}` with null when the authenticated installer's request was not
committed. Recover metadata and revoke/recreate if the original key was lost.

The member UI chooses a 90-day expiry; API/SDK callers may choose an expiry within
one year. Current member/folder permissions still cap every conversion. Setup
metadata and credential usage do not claim provider installation or verification:
finish the native adapter's provider steps and verify an actual attributed event.

A null lookup does not cancel a request that may still be in flight. Retry that
setup using its original request ID and unchanged input.

## Explicit workspace Owners

Account sessions with current workspace Owner access can use these registry
methods. Keep the selected workspace in the client's immutable workspace option
(or Go's `WithWorkspace` clone).

| Operation | TypeScript / PHP | Python / Ruby | Go |
| --- | --- | --- | --- |
| Owners | `listWorkspaceOwners` | `list_workspace_owners` | `ListWorkspaceOwners` |
| Candidates | `listOwnerCandidates` | `list_owner_candidates` | `ListOwnerCandidates` |
| Admit | `admitWorkspaceOwner` | `admit_workspace_owner` | `AdmitWorkspaceOwner` |
| Remove | `removeWorkspaceOwner` | `remove_workspace_owner` | `RemoveWorkspaceOwner` |

Admission takes the current member ID and reviewed base role. Removal takes the
Owner's account UUID and current revision. Recheck metadata after a conflict;
never substitute a fresh revision without review. At least one Owner must remain.
Admission does not grant application-admin roles. The legacy workspace's Owners
remain application admins and cannot be changed through these registry methods.
Registry administration can prepare co-Owners during provisioning without opening
any private business-resource route or activating that workspace.
