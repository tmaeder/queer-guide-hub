# Event quality queue remediation

## Goal

Resolve every open finding on `/admin/content/event-quality` by correcting event data or recording an evidence-backed disposition. Do not use the dashboard's `resolved` state to conceal a detector that still fires.

## Findings and treatment

- **LIVENESS_STALE (149):** every affected event was checked on 2026-09-28. The sources returned an inconclusive response, predominantly HTTP 403, so these records are unknown but not stale. Change the detector so staleness is based on `last_verified_at` age; retain the existing freshness-score penalty for `liveness_status = 'unknown'`.
- **IMAGE_REUSED (755):** 700 rows use one of the broad, cross-title image clusters and receive an honest media cleanup by removing the flagged image URL. Fifty-five rows are legitimate poster reuse within two same-title production/recurrence cohorts and receive an accepted disposition with an audit note.
- **NAMED_VENUE_UNLINKED (15):** rescan the ten rows that already have a venue link, link the unambiguous Zurich `Heaven Club` match, and accept the four rows for which no defensible canonical venue exists or the venue merge state is ambiguous.
- **CATEGORY_UNRESOLVED (1):** classify `Seattle Reign FC vs. Orlando Pride` as `sports`; the token `Pride` refers to the team name, not the event category.

## Execution

1. Add a migration that removes fresh `unknown` checks from `LIVENESS_STALE` while leaving freshness scoring unchanged.
2. Add a regression test proving a fresh unknown check is penalized but not stale, and an old check remains stale.
3. Apply the migration to production.
4. Perform narrowly scoped, auditable production updates for category, venue, and misleading image data. Preserve prior values in `field_provenance` where an event field changes.
5. Record accepted dispositions only for legitimate shared artwork and irreducibly ambiguous venue links.
6. Recompute event series, mark affected rows due for assessment, run the quality scanner until drained, and verify that the canonical open queue is empty.

## Safety and verification

- Scope every mutation through the currently open issue IDs or their exact event IDs/image URLs.
- Count candidate rows before each write and compare with affected-row counts afterward.
- Use the existing `decide_event_quality_issue` function for human dispositions.
- Do not delete events, venues, or source records.
- Verify with `event_quality_snapshot()`, direct open-issue counts, and the production dashboard.
