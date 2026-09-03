import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `20261218100000_anorgasmia_canonical_merge.sql` takes a clinical sexual
 * dysfunction off the Fetishes shelf and merges `orgasmic-dysfunction` into
 * `anorgasmia` — AGAINST the alias direction, because Q1772397's Wikidata label
 * is "anorgasmia" and "orgasmic dysfunction" is one of its aliases.
 *
 * Everything asserted here is a property whose loss is SILENT: the migration
 * still succeeds, every constraint still holds, and the defect ships. Anything
 * the database itself refuses is left to the database and is not restated.
 *
 * Text checks against the repo, not the database, so this runs in CI without
 * credentials — same pattern as `nonplaceCityDeletion.test.ts`.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20261218100000_anorgasmia_canonical_merge.sql',
);

const sql = readFileSync(MIGRATION, 'utf8');

/** Character offset of the first match, or -1. Used only for ordering checks. */
function at(re: RegExp): number {
  const m = re.exec(sql);
  return m ? m.index : -1;
}

function expectOrdered(label: string, ...steps: Array<[string, RegExp]>) {
  const offsets = steps.map(([name, re]) => {
    const idx = at(re);
    expect(idx, `${label}: step "${name}" is missing from the migration`).toBeGreaterThan(-1);
    return { name, idx };
  });
  for (let i = 1; i < offsets.length; i += 1) {
    expect(
      offsets[i].idx,
      `${label}: "${offsets[i].name}" must come after "${offsets[i - 1].name}"`,
    ).toBeGreaterThan(offsets[i - 1].idx);
  }
}

describe('anorgasmia canonical merge', () => {
  it('deletes the Fetishes junction rather than relying on the category_id write', () => {
    // `sync_tag_category_assignment_after` DEMOTES the old primary to
    // is_primary=false and leaves it standing, while
    // `unified_tags_recompute_is_adult()` matches ANY assignment. So writing
    // category_id alone re-files the page and leaves it 18+ — which is exactly
    // the state `vaginismus` has been in since its own 2026-08-29 merge.
    expect(sql).toMatch(
      /delete from public\.tag_category_assignments\s+where tag_id = v_od and category_id = v_fetishes/,
    );
    // And the check is on is_adult, not on the category text, because the
    // category text is the half that the category_id write alone would fix.
    expect(sql).toMatch(/where id = v_od and \(is_adult or category <> 'Sexual Health'\)/);
  });

  it('merges in the direction the header argues for, not the alias direction', () => {
    // Canonical first, duplicate second. Swapping them publishes the
    // alias-named row and is not caught by any constraint.
    expect(sql).toMatch(/merge_tag_concept\(\s*v_anorg,\s*v_od,/);
  });

  it('deletes the shadow synonym before the alias it hangs off', () => {
    // `search_synonyms.tag_alias_id` is ON DELETE SET NULL, so a synonym row
    // SURVIVES its alias and keeps rewriting queries toward the merged-away
    // tag. Reversing these two statements orphans the rewrite instead of
    // removing it, and nothing fails.
    expectOrdered(
      'shadow cleanup',
      [
        'delete search_synonyms',
        /delete from public\.search_synonyms where tag_alias_id = v_alias_id/,
      ],
      ['delete tag_aliases', /delete from public\.tag_aliases where id = v_alias_id/],
    );
  });

  it('revives the survivor before merging into it', () => {
    // `sync_tag_alias_to_search_synonym` only mints the query-rewrite rule when
    // the canonical is already status='active'. Merging first still produces
    // the alias — it just silently skips the synonym.
    expectOrdered(
      'revive-then-merge',
      ['revive', /seo_indexable\s+= true,[\s\S]*?where id = v_anorg;/],
      ['merge', /merge_tag_concept\(/],
    );
  });

  it('moves what the merge core does not move, and deindexes the tombstone', () => {
    // merge_tag_concept re-points assignments and category junctions and mints
    // the redirect. It does NOT re-parent the loser's other aliases, does not
    // move tag_medical_codes, and does not deindex what it retires — the last
    // of which is why `sexual-pain-penetration-disorder` is status='merged' and
    // seo_indexable=true on prod today.
    const merge = at(/merge_tag_concept\(/);
    expect(merge).toBeGreaterThan(-1);
    for (const [name, re] of [
      [
        'medical codes',
        /update public\.tag_medical_codes set tag_id = v_anorg where tag_id = v_od/,
      ],
      [
        'aliases',
        /update public\.tag_aliases set canonical_tag_id = v_anorg where canonical_tag_id = v_od/,
      ],
      [
        'deindex tombstone',
        /set seo_indexable = false,\s*\n\s*seo_deindex_reason = 'migration:anorgasmia-canonical-merge'/,
      ],
    ] as Array<[string, RegExp]>) {
      const idx = at(re);
      expect(idx, `post-merge step "${name}" is missing`).toBeGreaterThan(-1);
      expect(idx, `post-merge step "${name}" must run after the merge`).toBeGreaterThan(merge);
    }
  });

  it('asserts the shadow on the revived slug is gone regardless of who owns it', () => {
    // Mutation-tested: the narrower `and canonical_tag_id <> v_anorg` form
    // PASSES when the Part 2 delete is removed, because the alias re-parent
    // above then sweeps the shadowing alias onto the survivor and launders it
    // into a self-alias. An assertion its own failure mode walks around is not
    // an assertion.
    expect(sql).toMatch(
      /select 1 from public\.tag_aliases where lower\(alias_slug\) = 'anorgasmia'\)/,
    );
    expect(sql).not.toMatch(/lower\(alias_slug\) = 'anorgasmia' and canonical_tag_id <> v_anorg/);
  });

  it('refuses to run before 20261217100000, and does not copy its assertion', () => {
    // That migration asserts anorgasmia is still status='deprecated' — which
    // this change makes false — and it has NOT applied, so "db push skips
    // applied versions" does not protect it. Landing this first aborts db push
    // for the whole repo on a message about anorgasmia having been revived.
    expect(sql).toMatch(
      /from supabase_migrations\.schema_migrations\s+where version = '20261217100000'/,
    );
    // The inverse: this migration must never restate the held-back assertion it
    // is deliberately superseding.
    expect(sql).not.toMatch(/slug = 'anorgasmia' and status = 'deprecated'/);
  });

  it('declares an actor, because the row it edits is human_reviewed', () => {
    // `log_unified_tag_change` RAISEs when a `system:%` actor modifies a
    // human_reviewed row, and `orgasmic-dysfunction` is one. Declared INSIDE
    // the do block: db push makes no promise that a bare statement before the
    // block shares its transaction.
    const setActor = at(
      /perform set_config\('app\.actor', 'migration:anorgasmia-canonical-merge', true\)/,
    );
    expect(setActor).toBeGreaterThan(-1);
    expect(setActor).toBeGreaterThan(at(/do \$mig\$/));
    expect(setActor).toBeLessThan(at(/update public\.unified_tags set category_id = v_sexhealth/));
  });
});
