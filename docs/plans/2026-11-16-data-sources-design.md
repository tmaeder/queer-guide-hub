# Combined data sources

Approved by the user on 2026-11-16.

Add an admin-only Data sources entry under Data & automation at `/admin/data-sources`.
Combine all registered `scrape_sources`, `ingestion_sources`, and `news_sources` in
one searchable registry. Keep registry identity visible because the same provider
may have distinct registrations with separate schedules and controls.

Provide filters for source family/type, enabled status, and health. Show name,
URL or source identifier, target, schedule, last run, last success, and errors.
Admins can enable/disable each registration and edit its supported basic fields.
Offer Run now where the existing ingestion integration supports it. Retain the
specialized news manager for adding feeds and advanced news settings.

Read and write the existing tables under RLS; no parallel source store or
credentials editor. Paginate registry reads so all records
are included. Surface failed reads and rejected or zero-row writes explicitly.
Refresh relevant existing query caches after mutations. Keep old pipeline and
news source links usable.

Use the existing registry frame, table, buttons, and dialog patterns. Verify
normalization, filtering, pagination, table-specific writes, errors, admin access,
and navigation/archetype contracts with focused tests and type/lint checks.

Implementation discovery: the live import registry has only a deny-all RLS
placeholder, and disabled news feeds have no admin SELECT policy. Add narrowly
scoped admin SELECT/UPDATE policies for imports and admin SELECT for news.
Preserve public feed access and existing scraper policies. Rehearse the migration
and role tests in a transaction that rolls back; apply it with the normal release.
