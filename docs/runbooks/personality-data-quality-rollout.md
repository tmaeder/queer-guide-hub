# Personality data-quality rollout

This rollout applies the contracts from
`99991790020000_personality_data_quality_contracts.sql` without bulk-unpublishing
the existing catalogue. Run it separately in each environment and keep the
database migration, Edge Functions, and frontend from the same release.

## 1. Preflight

1. Take a database backup and record the release SHA.
2. Run the repository SQL parser, TypeScript checks, focused Vitest suite, and
   `supabase/tests/personality_data_quality_v2.sql` against a disposable database.
3. Capture the existing personality dashboard and publication-gate output.
4. Confirm the retired `profession_facets_refresh` job remains disabled. Its
   target is a live view and must not be scheduled as a materialized-view refresh.

## 2. Deploy in dependency order

1. Apply the migration.
2. Deploy `pipeline-normalize`, `pipeline-validate`, `pipeline-quality-score`, and
   `personality-refresh`.
3. Deploy the API/frontend release that reads `personality_public_profiles` and
   explicit news/event relationships.
4. Run `scripts/check-data-quality-gates.mjs`.

Do not run a bulk backfill in the same change window as the schema deployment.
The migration only performs deterministic contract cleanup: sentinel QIDs,
structured legacy fields, known placeholder images, stale queue rows, and signal
compaction. Every rewritten value is recorded in
`private.personality_remediation_audit`.

## 3. Measure before writing

Use a service-role session:

```sql
select public.personality_quality_dashboard();
select * from public.personality_quality_gate_checks();
select public.run_personality_quality_backfill(500, 'encyclopedia', true);
select public.run_personality_quality_backfill(500, 'adult', true);
```

The dry runs must report the expected candidate counts and make no changes.
Investigate critical public failures before any score backfill. Existing public
rows stay available unless an identity, safety, consent, or clearly wrong-image
case requires editorial review.

## 4. Backfill in reversible batches

Run one cohort at a time, beginning with the encyclopedia cohort:

```sql
select public.run_personality_quality_backfill(250, 'encyclopedia', false);
select public.run_personality_quality_backfill(250, 'adult', false);
```

After each batch:

1. Save the RPC result and dashboard snapshot in the release evidence.
2. Re-run `personality_quality_gate_checks()`.
3. Sample changed rows and confirm score dimensions, canonical tags, image state,
   claim sources, and queue state.
4. Stop if critical failures increase or public read-model counts regress.

Keep batches between 250 and 500 rows. Adult records use their separate rubric
and retain the explicit-consent publication gate.

## 5. Ongoing operations

- Run `prune_personality_quality_signals(interval '30 days')` from the existing
  maintenance scheduler after the nightly quality recompute.
- Alert on any non-zero critical gate, broken/orphan image or entity links,
  automation failures, and cohort-level score drift.
- Resolve `personality_tag_review_queue` labels into aliases or canonical tags;
  never publish unresolved source labels directly.
- Add sensitive claim provenance through `personality_claim_sources` before a
  draft is moved to public.

## Rollback

Roll back the application first so it stops depending on the read model. Restore
individual rewritten fields from `private.personality_remediation_audit`; do not
blindly reverse the entire migration after editors have begun using the new
tables. New normalized rows can be retained safely because legacy columns remain
in place during the compatibility window.
