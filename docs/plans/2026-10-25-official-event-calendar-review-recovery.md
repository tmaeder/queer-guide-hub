# Confirm legacy date warnings from official occurrence calendars

The largest legacy date-warning sources are BKA Theater, HAZ Zürich and Lab.oratory. An October 25 probe of 82 pending warnings found 70 occurrences whose current publisher records confirm the date already stored on the event. Their AI-extracted competing dates often came from another performance or an unrelated year on a page containing multiple dates. No event date should be replaced by those competing suggestions.

## Source evidence

`collect-event-calendar-evidence.ts` reads only the three official calendar endpoints. It keeps complete response text, observation time and SHA-256 digest. Identity uses the publisher's exact occurrence key, an agreeing full start timestamp and current or original captured title. BKA additionally requires the exact production and performance page; HAZ requires its unique post slug/page; Lab.oratory requires its occurrence ID and corresponding series page. Duplicate occurrences, conflicting dates or unmatched pages produce no proof. Source reads have time and byte bounds. HAZ pages are bounded to ten.

BKA changed from wall-clock `data-tid` values to numeric performance IDs. The parser now uses explicit date/time attributes, validates any supplied epoch and accepts the modern performance links. Conflicting attributes fail closed. Existing source identity remains production plus date/time, so the change does not create duplicate events.

## Apply contract

The standalone SQL operator defaults to dry run and locks at most 20 findings per request (hard cap 50). It accepts only untouched legacy `event-agentic-enrich` date mismatches. Event and finding fingerprints, source identity, publisher/country, precise timestamp, title, capture hash/freshness and page binding must still agree. Human date edits, manual holds, duplicate events, reviewed findings and changed rows are refused. It shares the review cleanup lease and pause control.

A verified warning is resolved with explicit machine attribution and links to the exact source occurrence and captured evidence. The event's date, content, relationships and publication state remain byte-for-byte unchanged. Every finding gets complete before/after audit values. Full source captures are retained once per batch and referenced by audit ID, instead of duplicating large pages per finding. No permanent schema, function, cron or user automation is introduced, and no publication gate is relaxed.

Run the collector against a bounded native export containing current hashes, then run `run-event-calendar-recovery.mjs --input evidence.json --output receipt.json --mode dry|rehearsal|apply`. Rehearsal applies the real writes and rolls back. The receipt distinguishes eligible findings from committed resolutions; interrupted/unknown batches must be checked against native audit records before retrying.

## Verification

The native PostgreSQL fixture covers 31 source/ownership cases, dry run, production-shaped rollback, pause, non-internal actors, immutable event rows, fresh fingerprints, manual holds, duplicated proofs, wrong dates/countries/pages, stale or corrupt captures, complete source/finding audits and idempotence. Thirty-six Deno checks cover the incumbent parsers, modern BKA markup, conflicting dates, exact occurrence/page identity, captured-title support and UTC calendar validation.

The design hook's image warnings in the parser were regex/documentation false positives; a file-scoped `broken-image` exception is recorded without suppressing other files or rules.
