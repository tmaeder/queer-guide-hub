# Selected redirect management

Select rows individually or use the page checkbox. Selection persists across
pages up to 100 rows; changing filters starts a new selection view. The toolbar
always shows the selected count. Selected CSV export uses the selected records,
while the regular Export button exports the current filtered view. Formula-like
CSV fields are escaped for spreadsheet use.

The active view excludes archived records. Use Archive status to show archived
records or all records, and Restore to bring selected records back. Archive is
workspace organization metadata: URLs continue redirecting, enabled/scheduled/
expiry state and analytics are retained. Folder and tag filters intersect with
archive status. The page's overall inventory total includes archived records.

Move to folder supports Unfiled. Add tag and Remove tag modify only the chosen
tag, retaining other tags and comments. Archive, restore, folder, and tag actions
work across every inventory source through one admin-only atomic PostgreSQL RPC.
If one record or resource is invalid, the entire operation rolls back. Failures
keep the selection for review or retry. Changes are shared workspace state.

Delete selected links is enabled only when every selection is a managed short
link. The confirmation shows all selected sources and requires typing DELETE.
Deletion uses one atomic API batch, permanently removing the short links and
associated analytics, while preserving donation records. Automatic/static/client
routing remains managed at its original source. Uploads already served at public
asset URLs are subject to the presentation guide's retention behavior.

API clients use `PATCH /links/{id}` with `{ "isArchived": true }` to archive and
`false` to restore, or include those fields in atomic bulk updates. List/count
filters accept `isArchived: true` or `false`. Omitting the archive filter keeps
the API's existing all-links behavior. Archival scope uses `links:write`, and
listing uses `links:read`; scoped credentials cannot modify other links.

Local SQL, component, inventory selection, and API-input tests cover the changes.
This candidate still needs production migrations and native browser verification.
Richer import/upsert editing remains separate open parity work.

## QR ZIP export

Select concrete source URLs and choose Export selected QR codes. Wildcard or route
placeholder selections disable this action. Choose a shared dot/marker/color/logo
style and PNG, JPG, SVG, or all three. Prepare QR ZIP verifies the whole selection
before enabling Download QR ZIP. Preparation uses local raster rendering and
scan decoding, with at most 100 links and a 64 MB ZIP limit. It does not upload
images or call destination websites.

The ZIP contains unique numbered image filenames and `manifest.csv`, mapping
inventory ID and source to the exact encoded URL and corresponding files. QR
tracking is included for managed queer.guide /go/ short URLs. Comments/destinations
are not included in the manifest. Any failed verification stops the entire export
and names the source; change the style or selection and prepare again. A style
or format change invalidates a prepared ZIP. Logo decoding completes before
preparation can start. Cancelling or closing stops further image work; a cancel
during ZIP packaging discards its result once packaging completes. No partial
bundle is offered.

The production generator and ZIP contents are verified locally with real raster
images and an independent Python ZIP reader. Local native-browser generation was also checked at desktop and mobile sizes,
and a completed downloaded fixture ZIP passed scan and CRC inspection. Live
production behavior and workspace/domain logo precedence remain unverified or unfinished.
The archive is written with [fflate `zipSync`](https://github.com/101arrowz/fflate)
at level 0 (STORE), since PNG/JPG are already compressed.

## Managed CSV import and round-trip export

Import opens the managed short-link workflow. Paste CSV or upload a file, select
Create, Update by ID, or Upsert by slug, then Review import. The review lists each
identity/destination and expandable exact field values. Apply sends one atomic
API batch; invalid data or a slug conflict rolls back all writes. A network
failure can make the outcome unknown, so refresh the inventory before retrying.
After confirmed success, Apply is disabled until the input or mode changes.

The limit is 100 rows and 2.1 MB for the CSV and encoded API request. The bulk API
now accepts that same bounded payload size; single-link requests keep their
existing 64 KB bound. An oversized encoded request is rejected before writes.
The template download provides the supported headers. Blank cells omit fields;
update/upsert preserve those values on existing records. Upsert requires slug and
target; update requires id and at least one changed field. ID is ignored in create
and upsert modes. Slugs are normalized to lowercase. Duplicate identities within
a batch are rejected rather than silently overwriting earlier rows.

Supported fields are id, slug, target, statusCode, isEnabled, isArchived, queryMode,
queryOverride, utmDefaults, expiresAt, folderId, tagIds, and comment. Snake-case
header aliases are accepted. JSON is used for queryOverride/utmDefaults objects
and tagIds arrays. `null` clears nullable query defaults, expiry or folder values;
`[]` clears tags. Policy settings outside these fields are preserved by partial
management updates. The CSV parser supports quoted commas, escaped double quotes,
multiline comments, UTF-8 BOM, and CRLF. Unknown/duplicate headers, malformed CSV,
wrong column counts and invalid field types report errors before requests.

Export managed CSV is enabled when every selected row is a managed short link.
It reads exactly those selected IDs through the authenticated scoped API and
includes the supported management fields. Exported comments use `commentJson`
(JSON strings), preserving empty strings, quotes and newlines on reimport and
preventing spreadsheet formula interpretation. Plain `comment` columns remain
supported for handwritten CSV. Choose Update by ID to restore an exported file,
or Upsert by slug to create/update matching slugs. Any change to scope or missing
selected records stops the export rather than silently dropping rows. Files over
2.1 MB require a smaller selection.

Import path rules instead keeps the prior path-rule creation workflow. It shares
the quoted CSV parser and validates destinations/status/enabled flags before
submitting. Its legacy creation hook still reports success/errors row by row;
it does not provide the managed short-link API's atomic upsert behavior.

`npm run test:redirect-import` evaluates the actual CSV source against migrated
isolated PostgreSQL, proving create/update/upsert, retained metadata, full supported
field round trips, atomic slug-conflict rollback and revoked-credential rejection.
Local browser fixtures verify desktop/mobile review and simulated apply receipts,
with production requests blocked. A real browser template download was parsed
independently with Python. Live production import/export still awaits release.
