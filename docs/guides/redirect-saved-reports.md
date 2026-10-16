# Saved redirect reports and shared dashboards

The analytics dialog can save its current filters and dates as a personal report.
Loading a report restores that selection. Updating requires its current version;
deleting it also deletes its published dashboards. Reports belong to the signed-in
account and stay private unless their author explicitly enables team discovery.

Publishing requires review and confirmation. A share copies the saved filters,
so later edits to the private report do not expand its audience. By default it
captures the matching managed short links at publication. Workspace owners can
explicitly include future matching links for a folder report without fixed link
IDs. Ordinary members can publish a single link they currently have edit access
to; folder, tag, multiple-link and whole-workspace sharing require a current
workspace owner. Losing the required access suspends a share.

Public URLs use `/share/redirect-report/<opaque UUID>`. Click aggregates are the
default. Conversion counts and exact per-currency revenue require explicit opt-in.
Only country, device, browser, OS and QR breakdowns are published. Raw events,
customer IDs, destination URLs, private filters, city and referrer data are never
part of the public payload. Viewers can use 7/30-day presets or custom UTC dates,
then reset to the published dates. A selection can only narrow a captured start/
end boundary; it cannot change link scope or other saved filters. Unbounded sides
remain selectable. Start is inclusive and end is exclusive. The published report
grain is preserved. The page has no account or private analytics controls.

An optional password is hashed server-side using the existing PBKDF2 password
helper. Passwords travel only in a POST body, never URLs or query-cache keys.
Attempts and public views have database budgets; password work is budgeted before
hash verification. Access, expiry, report version and revocation are checked again
after password verification. The default expiry is 30 days; the publishing UI
also offers 7, 90 or 365 days and no expiry. Revocation is permanent for that URL;
publishing again creates a new URL. There is no auto-refresh or persistent unlock
receipt; manual refresh verifies current access again.

Public JSON uses no-store, no-referrer and noindex headers. Page responses use
no-store and no-referrer; indexing is disabled by default.
JSON varies on Authorization. The service worker bypasses redirect API and public
report paths entirely and removes old entries from its managed caches during
activation. Failed refreshes clear the rendered report, including its title.
An already opened page cannot erase a screenshot or data a viewer has copied.

Publishers can explicitly allow search indexing during review. This cannot be
combined with a password: entering a password clears and disables the option,
and both the API and database reject the combination. Existing shares stay
noindex. Publication lists show the saved choice. To change a frozen publication,
revoke it and publish a new URL with the desired settings.

For each canonical page request, the Cloudflare edge calls the live public report
endpoint with the share capability and a signed visitor relay when configured.
Only a successful, explicitly indexable report gets its escaped public title,
aggregate summary and `index,follow` metadata in server HTML. Humans and crawlers
receive the same summary. Password, expired, revoked, inaccessible, malformed,
rate-limited and unavailable responses produce generic noindex HTML; error shells
also retain no-store/no-referrer/noindex headers. Query/localized variants stay
noindex, and shared reports do not advertise locale alternates. The client follows
the sanitized flag and switches back to noindex if a refresh fails. Public view
budgets cover this edge check too, so a normal page load can use two reads (HTML
and browser JSON). There is no metadata cache or public token registry.

Allowing indexing permits discovery; it does not guarantee search inclusion.
Revocation stops future report reads and indexable HTML. Search engines control
when existing results/copies disappear.

## HTTP contract

Registered sessions use the branded `/api/redirects` proxy. All private report
operations require verified account identity; API keys cannot manage reports.

- `GET /reports`: account-owned, keyset-paginated list by default. Optional
  `view=team` lists discoverable team definitions; `view=all` includes both.
- `POST /reports`: create from a name and filters.
- `GET`, `PATCH`, `DELETE /reports/:id`: read, guarded update and delete.
- `POST /reports/:id/run`: run with current analytics access.
- `GET`, `POST /reports/:id/shares`: list and publish snapshots.
- `DELETE /reports/:id/shares/:shareId`: revoke an owned publication.

Public clients call `GET /public-report` with
`Authorization: Bearer qg_report_<UUID>`. Password-protected reads use POST with
`{"password":"…"}`. Date selections also use POST, with
`{"dates":{"start":"2026-10-01T00:00:00.000Z","end":"2026-10-08T00:00:00.000Z"}}`;
password and dates can be supplied together. Only real UTC ISO instants are
accepted. Clearing either field restores that side of the captured period.
Out-of-bounds/reversed dates return 400 and the page offers date correction/reset
without retaining stale metrics. The response exposes only the selected dates
and published boundaries, alongside sanitized aggregates. Other public filter
overrides are rejected. SQL report/share
functions and tables are service-only; anonymous clients cannot bypass the
sanitizing edge handler. Private analytics and event endpoints also accept POST
filter bodies, avoiding URL limits for larger saved selections.

## Validation and release status

Isolated migrated PostgreSQL tests cover ownership, optimistic versions, captured
scope, current permissions, conversion opt-in, dynamic folders, expiry, budgets,
revocation and private grants. The SDK harness additionally exercises the actual
HTTP handler against that database, including real password verification and
revocation. Vitest covers UI review, password handling, payload sanitization and
revoked-view clearing. `node scripts/test-redirect-report-cache.mjs` executes the
actual worker and verifies network-only routing and targeted cache cleanup.

Native desktop/mobile evidence under `outputs/redirect-dub-parity/` uses labelled
local fixtures with production fetches blocked. No live reports or shares were
created. Production migrations/deployment and controlled-account checks remain
pending. Five SDKs expose report management and optional team discovery views; production
release and controlled-account evidence remain open.


The public date extension is verified with seeded clicks on both half-open date
boundaries, private country/link filters, widening attempts, empty results and
current access loss in PostgreSQL. Actual HTTP tests additionally read date-only
and password-plus-date bodies. Native browser proof covers presets, keyboard-edited
custom dates, reset, mobile layout and revocation (`shared-report-dates-*` images).
The browser automation fill helper did not commit native segmented date changes;
keyboard input verified the actual user interaction. These remain local fixtures.


`node scripts/test-redirect-report-indexing.mjs` bundles the actual Pages middleware
and executes the native workerd HTMLRewriter. It verifies a single robots tag,
escaped title/aggregate HTML for people and bots, noindex for the closed states,
query/localized variants and error shells, and no-store throughout. Backend fetches
in that harness are isolated fixtures. SQL tests separately enforce the stored
choice/password constraint and live revocation; HTTP tests exercise the actual
handler against migrated PostgreSQL. Native `report-indexing-*` screenshots verify
review, password restrictions and mobile layout with production calls blocked.


## Team discovery

My reports is the default view. Current workspace owners can review and confirm
**Make available to team** on their own saved report. Members with analytics
access can discover its name, saved filters and dates in Team reports or All
available reports. Loading it applies those filters; results always use the
reader's current link permissions. Discovery grants no link or event access.
A team report is read only for everyone except its author. Teammates can save
a new private copy, then edit that copy. New reports and copies default to private.

Team discovery and public dashboards are independent. Only the report author
can edit/delete the definition or manage its public URLs. Updating a team report
changes the definition teammates can load, while existing public dashboards keep
their published snapshots. **Make report private** removes future team discovery
and direct team reads without silently revoking public URLs or private copies.
If the publisher loses workspace-owner rights, team discovery suspends. Current
workspace membership is required on every team list, read and run.

`POST /reports` and versioned `PATCH /reports/:id` accept `visibility: private|team`.
Only current workspace owners can publish a team definition. Responses include
`visibility` and `canEdit`; lists include `canPublishToTeam`. Another author's
account ID is omitted, while owned responses retain `owner_user_id`. Unknown,
duplicate or invalid view parameters are rejected, and API keys remain denied.

TypeScript, Python and PHP list methods accept an optional third `view` argument;
Ruby accepts `view:`. Go preserves `ListReports` and adds `ListReportsInView`.
All five native SDK integration tests opt in, discover a read-only definition,
reject another author's update and prove private reports disappear again through
the actual HTTP handler and migrated isolated database. SQL additionally proves
reader link scoping, private copying, stale versions, current-role loss, keyset
paging, strict inputs and independent public publications.

Desktop and 390px fixture captures show discovery review and read-only loading/
private copying with external requests blocked. The detector found no issues,
and the independent finish reviewer returned ship with no material fixes. This
is local evidence; no live report definition or public audience was changed.
