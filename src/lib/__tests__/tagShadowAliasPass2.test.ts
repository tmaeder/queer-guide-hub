import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The second shadow-alias pass (`20270301101000`) and the seal that stops it
 * needing a third (`20270301101100`).
 *
 * Only properties whose loss is SILENT are pinned here — the migration still
 * applies, every constraint still holds, and the defect ships. Anything the
 * database refuses on its own is left to the database.
 *
 * Text checks against the repo, not the database, so this runs in CI without
 * credentials — same pattern as `nonplaceCityDeletion.test.ts`.
 */

const DIR = join(process.cwd(), 'supabase', 'migrations');
const pass = readFileSync(join(DIR, '20270301101000_tag_shadow_alias_pass_2.sql'), 'utf8');
const seal = readFileSync(join(DIR, '20270301101100_tag_shadow_seal.sql'), 'utf8');

/** Offset of the first match in `sql`, or -1. */
const at = (sql: string, re: RegExp): number => re.exec(sql)?.index ?? -1;

/** The (alias, target) pairs in the part-A delete list. */
function deletePairs(): Array<[string, string]> {
  const block = pass.split('part A: 18 alias deletes')[1]?.split('loop')[0] ?? '';
  return [...block.matchAll(/\('([a-z-]+)','([a-z-]+)'\)/g)].map((m) => [m[1], m[2]]);
}

/** The (loser, winner) pairs in the part-B merge list. */
function mergePairs(): Array<[string, string]> {
  const block = pass.split('part B: 9 merges')[1]?.split('loop')[0] ?? '';
  return [...block.matchAll(/\('([a-z-]+)','([a-z-]+)'\)/g)].map((m) => [m[1], m[2]]);
}

describe('tag shadow alias pass 2', () => {
  it('dispositions all 27 reviewed pairs, each exactly once', () => {
    const deletes = deletePairs();
    const merges = mergePairs();
    expect(deletes).toHaveLength(18);
    expect(merges).toHaveLength(9);

    // Every shadowed slug is dispositioned once and only once. A slug appearing
    // in both lists would delete an alias and then merge the row it protects.
    const slugs = [...deletes.map(([a]) => a), ...merges.map(([l]) => l)];
    expect(new Set(slugs).size).toBe(27);

    // And the precondition counts the same 27 it reviewed, so a corpus that has
    // moved aborts rather than half-applying.
    expect(pass).toMatch(/if v_n <> 27 then/);
  });

  it('pins the nine merge directions', () => {
    // Direction is the consequential half of a merge — it decides which page
    // survives and which prose leaves circulation. Each of these was argued in
    // the header from the Wikidata label, the German-name policy of
    // 20261211120100, or the corpus's own generic/brand pattern; a silent flip
    // would look like a diff-noise reordering.
    expect(mergePairs()).toEqual([
      ['bisexuell', 'bisexual'],
      ['gayfriendly', 'lgbt-friendly'],
      ['gewalt', 'violence'],
      ['musik', 'music'],
      ['ecstasy', 'mdma'],
      ['femdom', 'female-dominance'],
      ['bimbofication', 'bimboification'],
      ['priligy', 'dapoxetine'],
      ['prozac', 'fluoxetine'],
    ]);
  });

  it('leaves sildenafil and viagra as two live pages', () => {
    // The generic/brand rule is not "always merge": viagra, cialis and levitra
    // carry their own separately-written prose and stay, while priligy and
    // prozac are byte-for-byte copies of their generic and go — the shape the
    // corpus already retired as zoloft, paxil and stendra. Merging
    // sildenafil->viagra is the mistake 20261015110000 had to undo.
    expect(deletePairs()).toContainEqual(['sildenafil', 'viagra']);
    expect(mergePairs().flat()).not.toContain('sildenafil');
    expect(mergePairs().flat()).not.toContain('viagra');
  });

  it('deletes the two reciprocal drug aliases before re-parenting', () => {
    // Left standing, they are re-parented onto the tag whose slug they carry.
    // That does NOT trip trg_tag_alias_reject_shadow — it permits
    // canonical_tag_id = the tag itself — so the shadow is laundered into a
    // self-alias and only alias_equals_name catches it. Mutation-tested.
    const deletes = deletePairs();
    expect(deletes).toContainEqual(['dapoxetine', 'priligy']);
    expect(deletes).toContainEqual(['fluoxetine', 'prozac']);
    expect(at(pass, /part A: 18 alias deletes/)).toBeLessThan(
      at(pass, /update public\.tag_aliases set canonical_tag_id = v_winner/),
    );
  });

  it('deletes each synonym before the alias it hangs off', () => {
    // search_synonyms.tag_alias_id is ON DELETE SET NULL, so the synonym
    // outlives its alias and keeps rewriting queries. Three of the 18 have one
    // (gbl, sertraline, sildenafil), so this ordering does real work here.
    expect(
      at(pass, /delete from public\.search_synonyms where tag_alias_id = v_alias/),
    ).toBeLessThan(at(pass, /delete from public\.tag_aliases where id = v_alias/));
  });

  it('demotes the loser primary before merging', () => {
    // Two is_primary rows on one tag violate
    // tag_category_assignments_one_primary_per_tag. Only gayfriendly ->
    // lgbt-friendly is cross-category today, and removing the demote reproduces
    // a real 23505 — mutation-tested.
    expect(at(pass, /set is_primary = false\s+where a\.tag_id = v_loser/)).toBeLessThan(
      at(pass, /perform public\.merge_tag_concept\(/),
    );
  });

  it('snapshots junction count as well as is_adult on every winner', () => {
    // is_adult alone only catches a stray that lands in a KINK category.
    // gayfriendly's Venue Types row is neither kink nor primary, so it would
    // ride onto a 1,415-use descriptor silently — the first draft asserted
    // nothing about it, and the mutation test is what found that.
    expect(pass).toMatch(/'junctions', \(select count\(\*\) from public\.tag_category_assignments/);
    expect(pass).toMatch(/changed is_adult or gained a category/);
  });

  it('scopes the tombstone-alias assertion to this pass, not the corpus', () => {
    // 217 aliases already sit on merged tags from earlier work, so the
    // corpus-wide form is unsatisfiable and would assert nothing. The first dry
    // run failed on exactly that.
    expect(pass).toMatch(/still parented to a row this pass merged away/);
    expect(pass).not.toMatch(
      /raise exception 'shadow pass 2: % alias\(es\) are parented to a merged tag'/,
    );
  });

  it('seals the producer in the direction the old guard did not cover', () => {
    // trg_tag_alias_reject_shadow guards writes to tag_aliases only. The new
    // trigger guards the other order — a tag arriving at `active` on a slug an
    // alias already holds.
    expect(seal).toMatch(
      /create trigger trg_tag_reject_alias_shadow\s+before insert or update of status, slug on public\.unified_tags/,
    );
    // A self-alias is a different defect and must not abort a write.
    expect(seal).toMatch(/a\.canonical_tag_id <> NEW\.id/);
  });

  it('widens unmerge_tag_concept, and proves that is a prerequisite', () => {
    // The old form deleted only the alias the merge itself created
    // (`__alias_added`), which is false whenever one already existed — all nine
    // of this pass's merges. Under the seal, the narrow form makes them
    // irreversible. Reverting it leaves the migration otherwise passing, so the
    // round-trip probe is the only thing that catches it — mutation-tested.
    expect(seal).toMatch(/delete from public\.tag_aliases where alias_slug = v_a\.duplicate_slug;/);
    expect(seal).not.toMatch(/__alias_added.*\n.*alias_type = 'synonym'/);
    expect(seal).toMatch(/public\.unmerge_tag_concept\(v_audit\)/);
    expect(seal).toMatch(/SEAL_PROBE_ROLLBACK/);
    // Synonym before alias inside the unmerge too, same FK reason.
    expect(
      at(seal, /delete from public\.search_synonyms s\s+where s\.tag_alias_id in/),
    ).toBeLessThan(
      at(seal, /delete from public\.tag_aliases where alias_slug = v_a\.duplicate_slug;/),
    );
  });

  it('verifies the seal fires rather than asserting it exists', () => {
    // A trigger that is present and inert reads identically to one that works.
    // The probe INSERTs a throwaway row rather than updating a real one: an
    // UPDATE can be refused by log_unified_tag_change instead (P0001 on a
    // human_reviewed row), and a handler accepting any P0001 would pass while
    // the seal was dead.
    expect(seal).toMatch(/present but inert/);
    expect(seal).toMatch(/sqlerrm like '%held as an alias of another tag%'/);
    expect(seal).not.toMatch(/when sqlstate 'P0001' then\s*\n\s*v_fired/);
  });

  it('refuses to seal a corpus that still violates the invariant', () => {
    expect(seal).toMatch(/20270301101000 must apply first/);
  });
});
