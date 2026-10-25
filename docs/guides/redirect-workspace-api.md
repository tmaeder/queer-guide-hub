# Redirect workspace resource API

Base: `https://queer.guide/api/redirects`; JSON bodies; bearer server credentials
or verified workspace account sessions. `/folders`, `/tags`, `/templates` support GET list and
POST create. `/:uuid` supports GET detail, PATCH supplied fields and DELETE.
Create returns 201 and a resource object; updates/details return 200 and that object;
delete returns `{id,deleted:true}`. Missing resources are 404. Names are unique
ignoring surrounding whitespace and case; collisions are 409.

Use `workspace:read` to read and `workspace:write` to mutate. They do not implicitly
grant link destinations, private analytics, conversion writes or token management.
Only unrestricted credentials can have workspace permissions. The creation UI/API
reject incompatible selected-link scopes, and SQL also rechecks this restriction
along with revocation/expiry. Every public Data API/RPC path remains private.

List uses `limit` (1–100, default50), UUID `cursor`, ascending UUID order and returns
`{count,data,nextCursor}`. Count is for the complete resource table. Follow the cursor
until null. Resources are shared workspace data; list pages reflect current state,
not a frozen snapshot. SDKs expose page controls for all three resource types.

| Resource  | Fields                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------- |
| folders   | name (required on create; trimmed1–100), description (string≤2,000; default empty)                   |
| tags      | name, color (gray/red/orange/yellow/green/blue/purple/pink; default gray)                            |
| templates | name, parameters (object of campaign source/medium/campaign/term/content/ref strings; default empty) |

Fields are closed to unknown properties. Null name/description/color/parameters,
arrays instead of maps and password/control query keys are rejected. Template
parameter keys use `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`,
`utm_content`, `ref`. Body limits are 64 KiB; query maps use ≤100 entries, key≤200
and value≤2,000 characters. PATCH preserves fields it omits.

Deleting a folder clears its assignments, deleting a tag removes its assignments,
and deleting a template removes the saved definition. Existing links/destinations
remain. Bulk link assignment is handled through `/links/bulk` update operations;
resource creation/renaming uses these workspace routes. Current folder member permissions are enforced by the folder-access and member
workspace APIs; see `redirect-folder-access.md`.

Verification: isolated SQL tests exercise creation/detail/list/partial updates,
FK behavior, selected-scope/revoked/read-only key denial and RPC privacy. Five SDKs
execute these real routes over local HTTP into the actual edge handler/database.
Production deployment and provider configuration remain unverified.

## Inventory across routing sources

`GET /inventory` lists current manual SHORT/PATH records, automatic slug aliases,
venue aliases, username reservations and the deployed static/client route manifest.
It requires `links:read`. The manifest is generated from `public/_redirects` and
`src/routes.tsx`; run `node scripts/sync-redirect-inventory-manifest.mjs --write`
after changing those sources. CI checks that the committed manifest matches.

Filters: `search`, `origin`, `kind` (`Manual`, `Automatic`, `Static`, `Client`),
`folderId`, `tagId`, `domainId`, `isArchived` and `excludeManaged`. Booleans use
`true`/`false`. Use `domainId=builtin` for the built-in host; omit it for all hosts.
`excludeManaged=true` omits SHORT links already shown by `/links`. Pages use
`limit` (0–100, default 50) and opaque `after` from `nextCursor`; return
`{count,data,nextCursor}`. Count includes all accessible matching records. Pages
reflect current state rather than a frozen snapshot.

Rows include semantic `id`, physical `rowId`, source, target, kind, origin, state,
statusCode and organization fields `folderId`, `tagIds`, `comment`, `isArchived`,
`metadataVersion`, `canEditMetadata`. A rule or reservation may describe a pattern
rather than a concrete URL; do not generate a QR code for placeholders/wildcards.
Several historical records can share one semantic organization key. Use `rowId`
for rendering and `id` for organization writes. Archiving changes workspace display;
it does not disable the source route.

`GET /inventory/metadata?id=<encoded semantic id>` reads fresh organization settings.
`POST /inventory/organization` requires `links:write` and accepts an array of 1–100
unique operations:

```json
[
  {
    "id": "venue_slug_redirects:old-slug",
    "version": null,
    "values": { "comment": "Historic venue URL", "isArchived": false }
  }
]
```

Read the current `metadataVersion` first and pass it as `version` (null when no
metadata exists). Only `folderId` (UUID/null), `tagIds` (UUID array), `comment`
(string up to 10,000 characters) and `isArchived` (boolean) can change. Changes
are atomic across the array. A stale version returns 409; reload and review before
retrying. These endpoints never edit routing destinations, source aliases or rules.

Current folder permissions apply to every read/write. Moving requires edit access
to the destination folder too. Hidden and unknown sources both return 404.
Selected-link credentials see only their selected managed links; they cannot
browse unrelated automatic, static or client sources. Current roles, membership
and token scope are checked again in the database for every operation.

## Account roles and shared information

Owner, Member, Viewer and Billing are current workspace roles. Viewer and Billing
have read-only Links/analytics access; folder-owner overrides and bound credential
write scopes cannot lift that cap. Members can create, rename, recolor and delete
shared workspace tags. Folder operations still follow their existing ACL rules,
and template writes remain owner-controlled. Billing here grants no application
administrator, billing-provider or payout authority.

`GET /workspace-information?kind=domains|tokens|webhooks&limit=50&after=<uuid>`
provides paginated information to every current account role. `limit` is 1–100;
omit `after` for the first page and use the returned `nextCursor` thereafter.
Unknown/duplicate parameters and invalid cursors fail 400. Writes fail 405, and
server API keys fail 403. Responses are not cached.

Domain rows expose hostname, organizational/routing state and creation time.
Key rows expose name, bounded prefix, configured scopes, current link-limit count,
member-bound status and lifecycle/usage times. Webhooks expose name, receiver
origin, event types and state. Hashes, signing keys, DNS verification proofs,
webhook paths/query strings, event bodies and private creator identities are
excluded. Credentials or active webhooks whose authorizing owner/member access
has ended are marked unavailable. Reading information never counts as key use.
The existing owner configuration endpoints keep their owner-only controls, and
direct Data API grants are unchanged.
