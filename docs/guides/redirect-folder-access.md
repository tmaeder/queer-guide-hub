# Redirects workspace access

Local candidate; migration and production release are pending.

App administrators remain workspace owners. Other accounts must be explicitly
added through **Link workspace → Manage members**. This does not grant an app
admin/editor role. Accounts must already exist; adding a membership does not send
an invitation. Machine identities have no login and act through bound API keys.

Folders default to edit access for workspace members. Administrators or folder
owners can choose edit, view, or no access and set individual overrides: owner,
editor, viewer, no access, or inherit. A workspace viewer is always read only,
even with an owner override. Unfiled managed links are editable by members and
readable by viewers. Ordinary authenticated accounts have no implicit access.

The admin access editor, membership controls and API credential binding are
implemented. Members use `/links-workspace`, outside the admin console. It offers
paged/searchable accessible links, create/edit, prefill and shared templates,
folders, tags/comments, bulk folder moves/archive/restore/confirmed deletion,
CSV import and export of selected/loaded links, QR export, read-only or editable
behavior settings, and scoped date-filtered analytics/live activity/CSV export.
Editors can rename folders; owners can delete folders and edit access. Nonempty member-owned
folders must have their links moved before deletion. View-only members can ask to edit a folder, include an optional message, inspect
or withdraw their requests, and check status. Current folder owners/workspace
administrators review pending requests and explicitly approve editor/owner access
or deny. Workspace viewers still need an administrator to upgrade their workspace
role before approval; folder owners cannot bypass that cap. Inbox notifications
are transactional with the request/decision; email jobs are durable and private.
Live delivery/configuration verification is pending. Ordinary members cannot enter the admin
console. UI query caches include the signed-in account ID; changing accounts
remounts the workspace and never displays the previous account's cached links.

## Endpoints

All paths below are relative to `https://queer.guide/api/redirects`. Use a verified
session bearer token, or an API credential where specified. Responses are private
and must not be cached.

- `GET /access-requests?view=mine|review&limit=50&cursor=UUID`: account session
  only. Mine shows the account's requests; review shows pending requests for
  folders the current principal owns. Returns `{data,count,nextCursor}`.
- `POST /access-requests`: `{folderId,message?}`; only for a currently view-only
  folder. One pending request per member/folder; repeats return its ID without
  another notification. At most one new request per folder/day and ten/member/day;
  limits return 429 with Retry-After. Messages are limited to 1,000 characters.
- `PATCH /access-requests/{id}`: `{action:"approve"|"deny",permission?:"edit"|"owner"}`.
  Current owner session required. Defaults to editor, preserves workspace role,
  rechecks active membership and grants access atomically with the decision.
- `DELETE /access-requests/{id}`: withdraw the current account's pending request.
- `GET /session`: registered account session only. Returns `role` (`owner`,
  `member`, `viewer`) and label after verifying current membership. Not a bearer
  credential discovery endpoint.
- `GET /links/{id}/variants`: `links:read`, current folder and selected-ID
  scope; returns private A/B performance rows. Missing/inaccessible links fail.
- `GET /members?offset=0`: administrator session only; `{data,count}`, 100 rows
  per page ordered by ID. Continue until the returned count is reached.
- `POST /members`: administrator session only; `{label,kind,role?,active?,userId?}`.
  `kind` is `user` or `machine`; existing account UUID required for user and
  forbidden for machine. `role` is `member` (default) or `viewer`.
- `PATCH /members/{id}`: administrator session only; any of `label,role,active`.
  Identity bindings cannot be edited. Inactive members lose API/session access.
- `DELETE /members/{id}`: administrator session only. Removes membership, folder
  overrides and all bound credentials. Deleting the Auth account also cascades
  these records; credentials never become unrestricted through deletion.
- `GET /folders/{id}/access`: owner access to the folder, with `workspace:read`
  when using a credential. Returns folder default and membership overrides.
- `PATCH /folders/{id}/access`: owner access, with `workspace:write` for keys.
  Body: `{defaultPermission?: "none"|"view"|"edit", overrides?: [{memberId,
permission: "none"|"view"|"edit"|"owner"|null}]}`. Null removes the override.
  Omitted overrides remain unchanged. Changes are atomic; at most 100 per call.

API keys with selected-link scope cannot use workspace endpoints. Bind a key on
creation with optional `memberId` in `POST /tokens`. Bound keys intersect their
explicit scopes, selected-link IDs and the member's current folder access.
Unbound keys retain workspace administrator access within their explicit scopes.
Keys cannot create or modify workspace memberships or other keys.

## Enforcement

The verified Auth user ID is resolved to a private membership principal on the
server. Clients cannot choose that principal. SQL checks current membership and
folder access for each request, including policy/presentation APIs, analytics,
events and conversion writes. Session members cannot ingest server conversions;
that still requires a scoped server key or the existing trusted native flow.

Members may create folders (becoming owner), and owners may rename/delete them.
Member deletion of a nonempty folder is rejected: move its links first. Only
workspace administrators manage global tags/templates. Folder moves require edit
access to both source and destination. Readable link rows include `canEdit`. Folder resource rows include `canEdit`
and `canManage`; the server rechecks these permissions on each mutation.

ACL reads/writes coordinate through a transaction advisory lock. Management
writers acquire it before link/batch row locks. Private membership tables and
principal functions are unavailable to anon/authenticated Data API callers.
Existing admin-only table access is preserved. Other inventory sources remain
source-managed; the member management API currently covers managed short links.

## Verification

`npm run test:redirect-sql` runs the actual migration and rolled-back permission
fixtures in isolated PostgreSQL, including hidden folders, viewer caps, moves,
creator ownership, private-RPC grants, current token binding/downgrades, policy
reads, real click analytics and conversion rejection, and Auth-delete cascades.
API and component tests cover verified-principal forwarding, absent membership,
scoped access management, explicit override removal, denied-save recovery,
membership removal confirmation, machine creation and credential binding.
No production memberships or credentials are created by these tests.

## Notification delivery and release

No production schema/function/configuration was changed while implementing this
candidate. Read-only project checks confirmed cron/Vault availability, the
existing internal invoke secret, and the absence of a Vault `supabase_url` entry.
Before enabling the scheduled consumer in a target project, configure that
project's own HTTPS Supabase URL as Vault `supabase_url`, deploy
`redirect-access-notifications`, and verify `INTERNAL_INVOKE_SECRET`,
`RESEND_API_KEY` and a verified sender (`REDIRECT_ACCESS_EMAIL_FROM`, default
`Queer Guide <noreply@queer.guide>`). Never copy another project's invoke secret.
The five-minute cron makes no request when its project URL or secret is missing.

The worker requires the existing internal-secret/service/admin gate; ordinary
accounts and user-editable role metadata cannot dispatch mail. Missing provider
configuration leaves jobs unclaimed. Five jobs per invocation use two-minute
leases, ten-second provider timeouts, fixed Resend HTTPS delivery with redirect
following disabled, and stable per-job Idempotency-Key/body/sender values.
Retries respect provider Retry-After and exponential backoff, with at most eight
attempts and a 23-hour retry window from first attempt (inside Resend's 24-hour
idempotency retention). A failed acknowledgement can recover the same job safely;
a stale lease cannot overwrite a newer claim. Permanent rejections remain failed
for operator inspection; do not blindly replay uncertain sends after the retry
window.

Emails intentionally contain generic request/decision text and a sign-in-required
workspace URL, without folder names, destinations, messages or requester identity.
Recipient addresses are private. Dispatch rechecks the recipient's current
ownership, verified address and request status, suppressing obsolete or changed
recipients. In-app notifications use the existing recipient-only inbox.

Production `service_role` lacks SELECT on Auth users; no broad Auth-table grant
is introduced. The necessary verified-address lookup is a small service-only
SECURITY DEFINER function with an empty search path and fully qualified Auth
reference. Request, decision, queue and claim functions otherwise remain invokers;
new tables/functions are unavailable to anon/authenticated Data API callers.

Release verification must use controlled accounts, confirm actual inbox routing,
provider acceptance/delivery, cron activation, role downgrade and approval
behavior, and inspect failed/queued mail. Current automated tests mock the
provider and use isolated PostgreSQL; browser screenshots use explicitly labelled
local simulations. No real email has been sent by verification.

## Recipient-bound invitations

Owners can create an invitation in Workspace settings by entering an email, name
and viewer/member role. Save the returned link and share it with that recipient;
creating an invitation sends no email. Links expire after seven days and can be
revoked from the invitation list. The secret is shown once and stored only as a
hash on the server. The list never returns it.

The recipient opens `/links-workspace`, signs in or registers, verifies the exact
invited email, then explicitly accepts. Pending invitations for the current
verified email also appear in the private account inbox, so sign-in does not
require preserving the invitation token. Links can still be pasted manually or
opened while signed in; the fragment is removed after capture. Tokens are never
saved in local or session storage. Inbox acceptance uses an invitation ID and
rechecks the account's actual verified email, creator authority and invitation
state in the database. Knowing an ID alone does not grant another account access.

Acceptance creates only link workspace membership; folder defaults apply. It
grants no site-admin role. Existing active members keep their current role;
inactive members need an owner to reactivate them. Removing an accepted member
prevents reusing the old invitation to recreate membership.

Session-only REST routes: `GET /invitations?offset=0` (100 per page),
`POST /invitations` with `{email,label,role}`, `DELETE /invitations/:id` and
`GET /invitations/received?offset=0` and `POST /invitations/accept` with either
`{token}` or a received `{id}`. Owner routes check the current owner
in the database; API credentials cannot administer or accept invitations.
Creation returns `{id,expiresAt,invitationUrl}` once. Acceptance is idempotent for
the same current member and checks the recipient's current verified email,
expiry, revocation and the creator's current owner role. Unknown or unavailable
invitations share a 404 response. Creation is limited to 20 per owner/hour and
100 globally/hour; acceptance allows 200 attempts/account/hour. Requests do not
retry automatically. After an uncertain create, review/revoke pending invitations
before issuing a replacement.
