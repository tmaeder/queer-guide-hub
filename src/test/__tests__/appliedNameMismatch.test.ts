import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs helper shared with the CI scripts, no types.
import { findAppliedNameMismatches, normalizeMigrationName } from '../../../scripts/lib/remote-migrations.mjs';

/**
 * THE SILENT MIGRATION SKIP.
 *
 * `supabase db push` matches repo files to history BY VERSION ALONE. When two
 * files claim one version, the first to apply wins and every other one is
 * skipped PERMANENTLY — with a green deploy, and a `schema_migrations` row that
 * looks entirely normal until you read whose NAME is on it.
 *
 * It happened twice on 2026-08-29, both times to a migration that had already
 * been reviewed, merged and "deployed":
 *
 *   20261012100000  applied as `sweep_skips_attribute_kind`
 *                   so `news_vocab_dump_residue` never ran — 39 news articles
 *                   kept BDSM/drug tags, incl. `service-slave` on an article
 *                   about a historical slavery exhibit.
 *   20261019100000  applied as `entity_lifecycle_dispatchers`
 *                   so `kinktionary_overlap_deindex_complete` never ran — 131
 *                   pages kept serving verbatim non-commercially-licensed text.
 *
 * The duplicate-version check could not see either: the colliding file was
 * still on another branch at check time, so there was no duplicate IN THE REPO.
 * Comparing the applied NAME against the file name catches it with no duplicate
 * present at all, which is the only signal available before the merge.
 *
 * These tests exist because the check's own script cannot run this branch
 * without a Management API token — without them CI would be the first place the
 * logic ever executed.
 */
describe('findAppliedNameMismatches', () => {
  const isNew = (f: string) => f.includes('new_');

  it('flags a file whose version is applied under a different name', () => {
    // The real 20261019100000 collision.
    const hits = findAppliedNameMismatches(
      ['20261019100000_new_kinktionary_overlap_deindex_complete.sql'],
      new Map([['20261019100000', 'entity_lifecycle_dispatchers']]),
      isNew,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].version).toBe('20261019100000');
    expect(hits[0].remoteName).toBe('entity_lifecycle_dispatchers');
    expect(hits[0].isNew).toBe(true);
  });

  it('is silent when the applied name matches the file', () => {
    expect(
      findAppliedNameMismatches(
        ['20261022143700_kinktionary_overlap_deindex_complete.sql'],
        new Map([['20261022143700', 'kinktionary_overlap_deindex_complete']]),
        isNew,
      ),
    ).toHaveLength(0);
  });

  it('accepts the MCP recovery shape, where the remote name carries a version prefix', () => {
    // Real row: version 20260620074438 recorded as
    // `20260620100000_messages_phase0_foundations`. A correct recovery, not a
    // defect — 17 rows on main look like this and must not be reported.
    expect(
      findAppliedNameMismatches(
        ['20260620074438_messages_phase0_foundations.sql'],
        new Map([['20260620074438', '20260620100000_messages_phase0_foundations']]),
        isNew,
      ),
    ).toHaveLength(0);
    expect(normalizeMigrationName('20260620100000_messages_phase0_foundations')).toBe(
      'messages_phase0_foundations',
    );
  });

  it('defers a plain in-repo duplicate to the duplicate check', () => {
    // Both files present AND one of them is the applied one: that is check 2's
    // case, which gives better advice. Reporting it here too would double up.
    expect(
      findAppliedNameMismatches(
        ['20261012100000_sweep_skips_attribute_kind.sql', '20261012100000_news_vocab_dump_residue.sql'],
        new Map([['20261012100000', 'sweep_skips_attribute_kind']]),
        isNew,
      ),
    ).toHaveLength(0);
  });

  it('marks a pre-existing mismatch as not-new so it warns instead of failing', () => {
    // Real pre-existing row: 20260619180000 is applied as
    // `extract_worker_circuit_breakers` while the repo file is
    // `search_documents_tags_facet_all_types`. That SQL already never ran;
    // failing every unrelated PR would not change it.
    const hits = findAppliedNameMismatches(
      ['20260619180000_search_documents_tags_facet_all_types.sql'],
      new Map([['20260619180000', '20260619180000_extract_worker_circuit_breakers']]),
      () => false,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].isNew).toBe(false);
  });

  it('reports nothing when remote history is unreadable', () => {
    // null means "could not look", never "nothing is applied".
    expect(findAppliedNameMismatches(['20261019100000_anything.sql'], null, isNew)).toEqual([]);
  });

  it('ignores a version whose remote name is EMPTY', () => {
    // 71 versions applied 2026-02-24..2026-04-15 carry name = '' (older CLI,
    // immutable history). An absent name cannot contradict a filename, and
    // treating it as a mismatch failed migration-versions on every open PR in
    // the repo — none of which had touched migrations.
    expect(
      findAppliedNameMismatches(
        ['20260224193400_create_pgmq_queues_and_workflow_tables.sql'],
        new Map([['20260224193400', '']]),
        isNew,
      ),
    ).toHaveLength(0);
  });

  it('still reports a real mismatch when the remote name is present', () => {
    // Positive control for the guard above: the empty-name skip must not
    // swallow the case this function exists to catch.
    expect(
      findAppliedNameMismatches(
        ['20261019100000_kinktionary_overlap_deindex_complete.sql'],
        new Map([['20261019100000', 'entity_lifecycle_dispatchers']]),
        isNew,
      ),
    ).toHaveLength(1);
  });

  it('ignores versions that are not applied yet', () => {
    expect(
      findAppliedNameMismatches(['20261231120000_new_future.sql'], new Map(), isNew),
    ).toHaveLength(0);
  });
});
