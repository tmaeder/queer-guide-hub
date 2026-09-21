# Marketplace Listings Data-Quality Remediation

## Objective

Bring the marketplace's correctness, safety, media delivery, freshness, and
relationship integrity up to the standard implied by its existing completeness
score. The remediation is fully automated, backward compatible, measurable,
and reversible. Semantic changes are never hard deletes.

## Production baseline

Measured read-only on 2026-09-21 across 61,918 active listings:

- 1,624 missing descriptions, 1,252 descriptions under 80 characters, and
  2,524 listings in repeated-description groups.
- 459 listings without images, 5,182 without an optimized asset, 4,460 failed
  image optimizations, and 2,756 listings with missing image alt text. A
  150-cover sample found 18.7% below 600 px wide.
- 2,361 listings in `department='other'`; 38,521 without a fine category.
- Zero variant rows and 61,326 listings without attribute extraction. The
  variant worker auto-paused after 288 statement timeouts.
- Material category/rating contradictions, including 1,020 listings classified
  as `masturbators`, 214 as `sex_toys`, and 100 as `anal_toys` while rated SFW.
- 797 listings without source-provenance rows, 423 without merchant links, and
  1,630 inactive rows without an auditable reason.
- 27,959 links never checked and 50,903 not verified within 30 days.

The existing average `quality_score` of 88.6 does not measure these dimensions
and must remain only a compatibility composite.

## Design

### Pipeline repair

Index and replace the variant worklist with a bounded, keyset-style claim path,
then resume extraction in measurable batches. The worker populates variants,
listing-level attributes, sizes, colours, prices, availability, and facet tags.
Automation health is based on examined, changed, terminal, failed, and remaining
counts; a dispatched request with no terminal result is not productive work.

Link validation moves to durable, resumable batches with feed presence as valid
liveness evidence, per-domain concurrency, and repeated terminal responses
before deactivation. The steady-state capacity must cover the eligible catalog
within 30 days.

### Content, media, taxonomy, and safety

`image_assets` is the canonical image state machine. Retryable failures are
requeued by failure class, dimensions and terminal reasons are persisted, every
gallery asset is linked, and alt text is filled on ingest. Description recovery
uses retained source facts before constrained generation; generated copy records
its provenance and version.

Taxonomy classification follows explicit source mappings, structured source
attributes, deterministic multilingual rules, then model fallback. All semantic
changes write an admin-only before/after event carrying version and confidence.
Content rating runs after taxonomy repair and combines textual evidence with
only high-confidence category consistency. Search documents are rebuilt when a
rating becomes ineligible for Safe Mode.

### Relationships and lifecycle

Source provenance and merchant resolution become part of the commit transaction,
with deterministic backfills for existing gaps. Price history stores USD at
insert time and is backfilled from the listing/FX history. Inactive rows receive
an explicit deterministic reason. The frozen `category_id` hierarchy stays as
compatibility data; department/group/fine remain canonical.

### Governance

Nightly snapshots and the admin panel gain worker progress, variant/attribute
backlog, relationship gaps, failed/unoptimized media, stale links, taxonomy and
rating contradictions, and drain-time estimates. Listing quality is split into
completeness, media, taxonomy, safety, freshness, and linkage dimensions while
the legacy score remains available.

Rollout is automatic but reversible: 1% canary, automatic expansion after
invariant checks, kill switches, versioned event history, and automatic rollback
on abnormal distribution changes. Relevance may rank or flag but never archive
or delete by itself.

## Acceptance

- Every eligible active listing is visited by attribute extraction within 48h.
- `department='other'` falls below 2%; frozen taxonomy fixtures reach at least
  95% department and 90% group accuracy.
- No known high-confidence adult-product/Safe Mode contradiction remains.
- Source and merchant linkage are at least 98%.
- At least 95% of listings with images have a healthy optimized asset and
  missing alt text does not grow.
- At least 95% of eligible links are feed-confirmed or verified within 30 days.
- Every inactive listing has a reason and every automation reports real outcome
  counts.

