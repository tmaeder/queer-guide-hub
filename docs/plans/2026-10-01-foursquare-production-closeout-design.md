# Foursquare production closeout design

Date: 2026-10-01
Status: Approved by delegated operator authority

## Objective

Close the remaining operational gaps in the free Foursquare integration, repair
the unsafe publication path found in the Swiss canary, make run health
truthful, and prove the corrected behavior end to end in production.

## Production evidence

The initial canary loaded 1,279 categories and staged 190 Swiss places. Exact
matches enriched existing venues safely, but the generic ingestion pipeline
also published 33 unmatched records on Foursquare category evidence alone.
That cohort contains clear false positives, including a government debt office
and businesses whose owners have the surname Gay. Provider taxonomy is useful
discovery evidence, but it is not sufficient publication evidence.

The sync-state rows also retain only the final batch statistics. This makes a
successful 1,279-row category import appear as 279 rows and makes the delta
summary omit eligible records handled by earlier batches.

## Considered approaches

1. Let the generic pipeline drain every candidate. This is operationally easy
   but repeats the production false-positive failure and is rejected.
2. Research and decide every provider-only candidate manually. This can recover
   more venues but is slow, non-repeatable, and cannot protect future releases.
3. Add a durable Foursquare discovery gate, quarantine the already published
   unmatched cohort, retain candidates for independent corroboration, and keep
   exact existing-venue matches automatic. This is the selected approach.

## Design

### Publication safety

- Mark every unmatched Foursquare OS/API discovery with a durable
  `requires_editorial_review` flag in normalized metadata.
- Preserve automatic processing for stable existing identities and CLI exact
  matches at confidence 0.95 or above.
- Teach validation, deduplication, and review-gate stages that the source flag
  cannot be downgraded to `auto` by generic confidence thresholds.
- Create or retain a review item for every gated discovery.
- Quarantine the 33 already-created provider-only venues by changing their
  venue review state from `approved` to `pending` and mark them for attention.
  Do not delete them; provenance and rollback evidence remain intact.
- Requeue the corresponding staging records as `pending_review`. Resolve the
  one failed commit as review-only rather than repeatedly retrying it.

### Honest run health

- Allow the sync client to send one authenticated finalization request after
  all batches complete.
- Finalization writes cumulative counters and the final cursor without
  reprocessing data.
- Keep per-batch responses unchanged for resumability.
- Add tests proving finalization rejects malformed totals and cannot perform a
  write without normal internal/admin authentication.

### Operations

- Register `source-foursquare-free` with `verify_jwt = false`; the function's
  own internal/admin authorization remains the application gate.
- Keep the stable function slug as the production route. The normal deploy
  workflow may deploy the legacy slug, but it can no longer change the routed
  implementation.
- Provide a repeatable, fail-closed operator command for a release. Portal
  tokens remain short-lived and must not be committed or logged. A schedule
  without a renewable credential would be dishonest automation, so release
  execution stays explicit while a monthly reminder monitors freshness.

### Production acceptance test

The production test must demonstrate:

1. Stable function authentication and dry-run response.
2. A synthetic unmatched queer-category record stays in review and never
   creates a public venue.
3. A synthetic exact match is marked duplicate against an existing venue and
   can follow the automatic enrichment path.
4. Finalized run statistics equal cumulative client totals.
5. Public venue browsing/search still works and quarantined canary records are
   not publicly accessible.
6. API budget remains inside the hard free allowance and no Premium endpoint is
   called.

Synthetic production records use a unique test release and are removed or
terminally rejected after assertions, without deleting canonical venues.
