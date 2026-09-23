# City Data Quality Programme

## Decision

Audit and govern the whole city corpus, while assigning different target states to
published places, unresolved placeholders, archived non-places, and merged rows.
Incorrect content is a harder defect than missing content.

## Quality contract

- Expose a per-city quality profile covering lifecycle, identity, geo, content,
  editorial value, imagery, relationships, taxonomy, provenance, freshness, and
  translation coverage.
- Keep completeness as a presence metric; derive publication readiness separately
  from hard blockers and warnings.
- Surface corpus totals and issue cohorts through a scorecard RPC, the admin quality
  panel, and fail-closed CI checks.
- Use stable issue codes and the existing review infrastructure rather than creating
  another editorial queue.

## Remediation order

1. Stop namesake leaks by making city-page venue and event retrieval ID-first.
2. Classify placeholders, ghosts, duplicates, and publishable rows before enrichment.
3. Require grounded provenance for descriptions and verified, distinct image assets.
4. Backfill resolvable links; queue ambiguous namesakes instead of guessing.
5. Measure taxonomy quality without treating every legitimate `other` as a defect.
6. Translate only approved source content and invalidate translations when it changes.

## Acceptance criteria

- No known wrong-city entity renders on a city detail page.
- No indexable city has a hard publication blocker.
- Published descriptions and images have machine-readable provenance.
- New wrong-subject prose, non-place identities, invalid geo, and unrelated duplicate
  hero images fail a regression gate.
- Existing backlogs are visible and ratcheted downward; missing probes never report a
  reassuring zero.

The implementation follows the full user-approved strategy in the task conversation;
this file records the durable architectural decision without duplicating operational
baselines that will change over time.
