# OSM import health follow-up

The approved source-recovery work requires actual upstream answers before a run
is healthy. The OSM handler currently counts unknown city queries but returns a
successful empty result even when no city answered, including in dry-run mode.

Keep the existing endpoint and normal staging/review contract. Return an explicit
503 `overpass_unavailable` when no city answered. A clean empty Overpass response
remains valid; partial failures remain visible in city counters. Limit each city
request to the remaining existing 90-second run budget, with one bounded attempt
per city so retries cannot overrun it. Preserve the current automation settings;
do not claim provider recovery or enable the paused Display job. No provider
subscription or credentials are required.

Verify the real authenticated handler with mocked complete failure, valid empty,
successful data, and exhausted run budget. Run related Overpass tests and handler
type/lint checks, merge through required CI, deploy, then verify the production
diagnostic reports the actual upstream outcome without changing schedules.
