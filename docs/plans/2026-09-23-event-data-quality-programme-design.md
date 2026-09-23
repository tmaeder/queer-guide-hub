# Event Data Quality Programme

## Decision

Introduce a versioned, evidence-based quality system for every canonical event. The programme treats upcoming and historical records with equal integrity standards while applying context-aware freshness rules: current events require recent liveness evidence, while historical events require attributable archival provenance rather than a working ticket link.

The existing `events.quality_score` remains the legacy completeness score until ranking is migrated. A separate current assessment and issue lifecycle will measure completeness, validity, linkage, provenance, media, and freshness without allowing a blended score to hide critical defects.

## Data model and interfaces

- `event_quality_current` is a one-to-one current assessment keyed by `event_id`. It stores the rubric version, six dimension scores, overall score and tier, blocker and issue codes, scope, and assessment timestamp.
- `event_quality_issues` is an admin-only lifecycle ledger. Each open issue is unique by event and issue code and stores dimension, severity, evidence, status, resolution, and audit timestamps.
- `run_event_quality_scan(batch, scope, dry_run)` detects issues and refreshes assessments idempotently without mutating public event fields.
- `event_quality_snapshot()` reports current and historical totals, dimension/tier counts, issue counts, and source-level defect rates.
- `event_quality_gate_checks()` exposes zero-tolerance invariants and monitored service levels to CI.

Critical integrity issues force the assessment tier to `fail` regardless of the aggregate score. Optional fields are never invented merely to raise completeness.

## Detection and remediation policy

Deterministic defects—invalid date order, partial or null-island coordinates, FK contradictions, unsafe URLs, broken merge pointers, and known placeholder images—are zero-tolerance. Their repairs must be evidence-backed and audited. Ambiguous descriptions, classifications, duplicates, venue matches, and coordinate conflicts enter human review.

Description checks cover meaningful length, HTML residue, source boilerplate, and suspicious exact reuse while allowing documented series copy. Image checks cover URL safety, known placeholders, excessive reuse, and downstream reachability metadata. Categories retain the controlled vocabulary and record classifier evidence and confidence. Venue linking may auto-apply only a unique exact normalized match in the same city without contradictory precise coordinates. The existing deduplication engine remains authoritative so repeated performances are not collapsed by title and date alone.

Source lineage is mandatory. Events whose source cannot be reconstructed receive an explicit unknown-source disposition. Seeded or cloned future events without current corroboration cannot receive high trust. Adapter contracts require stable source identifiers and URLs, timezone-aware dates, location evidence, normalized taxonomy, and gated images.

## Operations

The scanner deploys in shadow mode first and assesses the complete corpus without changing event records. Deterministic remediation then runs in bounded, resumable batches, followed by adapter corrections and evidence-backed enrichment. The Event Quality admin surface gains issue filters, evidence, dispositions, bulk-safe actions, SLA age, and source breakdowns; it becomes a real gated engine instead of an informational panel.

CI ultimately requires zero critical invariants, assessment within 24 hours of change, explicit dispositions for ambiguous gaps, no high-severity issue older than 14 days, and recent liveness evidence for at least 95% of active upcoming events with URLs. New scoring runs alongside ranking for two weeks before any ranking migration.

## Verification

SQL tests cover detection, severity overrides, context-aware applicability, issue resolution and reopening, idempotency, RLS, and audit preservation. Unit and adapter fixtures cover source boilerplate, shared series copy, placeholder and reused images, category confidence, venue ambiguity, coordinate provenance, and legitimate multiple performances. Production rollout begins with dry-run sampling by source and age cohort.

