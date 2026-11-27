# Pride Places weekly backend pipeline

Approved by the user on 18 November 2026: full weekly synchronization of all
business categories and events, Sundays at 03:00 UTC, implemented inside the
queer.guide backend pipeline.

## Contract

- Use the native backend automation registry and pg_cron. Provide an authenticated
  manual trigger through the same source handler and show progress in pipeline runs.
- Discover every current business listing and every event; follow actual pagination
  instead of fixing the current totals (807 businesses and six event listings).
- Process bounded batches with durable work state, leases, retries and recovery
  after an interrupted invocation. Do not start a second overlapping scan.
- Hash factual normalized content so unchanged records avoid repeated processing.
  Changed observations must receive fresh validation and deduplication; reuse
  canonical source identities without bypassing the ingestion gates.
- Keep existing curator corrections, verified contacts, entity-type decisions and
  quarantined values. Fill gaps through the existing commit policy and send
  conflicting or incomplete records to Review. Include professional services.
- Preserve native social profile identifiers, including Facebook numeric IDs.
  Do not infer queer ownership or publish copied marketing descriptions or images.
- Prefer visible event dates over stale JSON-LD. Preserve source date-based event
  occurrence keys, weekly recurrence, venue identity and IANA time zones. Missing
  or ambiguous dates/times go to Review; never assume a fixed UTC offset.
- Record listing coverage, changed/unchanged counts, staged records, errors and
  incomplete scans. An empty/error response must not become a successful full scan.
  Missing listings alone must not archive a canonical business or event.

## Integration

The source worker writes into ingestion_staging and the existing normalization,
validation, deduplication, review and commit engine. Backend run progress and
source-work checkpoints distinguish collection completion from downstream work.
A weekly starter and a bounded continuation mechanism both belong to the native
backend automation registry. Service-only queue writes and authenticated handlers
preserve the existing admin and internal invocation boundaries.

Use stable profile URLs for compatibility with the initial import, retain any
published native member identifiers, and keep event occurrence identities tied to
the published local date. Existing organizer mappings remain organization mappings.

## Verification and release

Test pagination and completeness, repeated and interrupted batches, unchanged and
changed content, quarantined profiles, all business categories, native Facebook
URLs, stale event dates, missing times, DST transitions and source identity reuse.
Exercise queue claims, replay, privileges and registration on isolated PostgreSQL.
Run the repository checks, deploy the source and migrations, then verify a real
complete run and the active Sunday 03:00 UTC schedule. Enable production scheduling
only after the deployed source is verified. Existing unrelated automations and
curated canonical values remain protected.
