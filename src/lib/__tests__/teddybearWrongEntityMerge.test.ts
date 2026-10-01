/**
 * Guards 99991790620335_teddybear_wrong_entity_merge.sql.
 *
 * `/tags/teddybear` was indexable and published "a stuffed toy in the form of a bear,
 * named after Theodore Roosevelt" off `wikidata_id = Q98022605`, which resolves live to
 * a 2020 audio track by Emilie Nicolas. The correct gay-bear-culture prose was already
 * on the deindexed twin `teddy-bear`.
 *
 * Found by generalising the water-sports split: an INDEXABLE row whose despaced twin
 * holds a different `description`. That sweep returned 8 pairs and only this one is a
 * wrong-sense defect — the other seven are duplicates, and this file asserts they
 * SURVIVE.
 *
 * Assertions run over COMMENT-STRIPPED SQL. The header quotes the toy prose, the song
 * QID and the rejected patterns verbatim, so an unstripped `toContain` is satisfied by
 * the explanation while the statement is missing.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991790620335_teddybear_wrong_entity_merge';
const DIR = join(process.cwd(), 'supabase/migrations');

const raw = (() => {
  const f = readdirSync(DIR).find((x) => x.startsWith(MIGRATION));
  if (!f) throw new Error(`migration ${MIGRATION} not found in ${DIR}`);
  return readFileSync(join(DIR, f), 'utf8');
})();

/** Line-start comments only — a mid-line `--` may sit inside a literal. */
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

const work = sql.slice(0, sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

/** Comments with the `--` STRIPPED, then whitespace-collapsed. Filtering without
 *  stripping leaves the marker mid-string, so any sentence wrapping across two lines
 *  reads "... NO -- DEFAULT" and every pattern spanning the break silently fails. */
const prose = raw
  .split('\n')
  .filter((l) => /^\s*--/.test(l))
  .map((l) => l.replace(/^\s*--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

describe('the merge, and the 23505 trap it has to dodge', () => {
  it('merges the toy row INTO the correct one, not the other way round', () => {
    // v_keep is teddy-bear (correct prose), v_drop is teddybear (the toy).
    expect(work).toMatch(
      /slug = 'teddy-bear'[\s\S]{0,80}into v_keep|into v_keep[\s\S]{0,120}'teddy-bear'/,
    );
    expect(work).toMatch(/merge_tag_concept\(\s*\n?\s*v_keep, v_drop/);
  });

  it('demotes the loser primary BEFORE the merge', () => {
    // The two rows are in different categories, so merge_tag_concept REPOINTS the
    // loser's junction instead of deleting it — two is_primary rows violate
    // tag_category_assignments_one_primary_per_tag.
    const demote = work.search(/set is_primary = false/);
    const merge = work.search(/merge_tag_concept/);
    expect(demote).toBeGreaterThan(-1);
    expect(merge).toBeGreaterThan(-1);
    expect(demote).toBeLessThan(merge);
  });

  it('deletes the inherited membership after the merge', () => {
    const merge = work.search(/merge_tag_concept/);
    const del = work.search(/delete from public\.tag_category_assignments/);
    expect(del).toBeGreaterThan(merge);
    expect(work).toMatch(/category_id is distinct from v_keepcat/);
  });

  it('is soft on preconditions so a concurrent repair cannot abort main', () => {
    expect(work).toMatch(/if v_keep is null or v_drop is null then/);
    expect(work).toMatch(/raise notice/);
    // Never an exception on "already resolved".
    expect(work).not.toMatch(/if v_keep is null[\s\S]{0,120}raise exception/);
  });

  it('nulls the song identifier, and says why a merged row still needs it', () => {
    expect(work).toMatch(/wikidata_id = null, wikipedia_url = null/);
    expect(work).toContain("'Q98022605'");
    // Not hygiene: unmerge_tag_concept would otherwise resurrect it.
    expect(prose).toMatch(/unmerge_tag_concept/);
  });

  it('declares an attributed actor', () => {
    // teddybear is human_reviewed, so log_unified_tag_change() RAISES otherwise, and
    // before_data is the only copy of the prior prose.
    expect(work).toMatch(/set_config\('app\.actor'/);
    expect(work).toContain(MIGRATION);
  });
});

describe('the survivor is made into a real page', () => {
  it('fills the NULL summary from the row own description, guarded on emptiness', () => {
    expect(work).toMatch(/short_description = 'A softer, gentler bear in gay bear culture\.'/);
    expect(work).toMatch(/coalesce\(btrim\(short_description\), ''\) = ''/);
  });

  it('publishes it explicitly', () => {
    // Without this the concept loses its indexed page entirely, which is worse than
    // the defect being fixed.
    expect(work).toMatch(/seo_indexable = true/);
    expect(work).toMatch(/seo_deindex_reason = null/);
  });

  it('never rewrites the correct prose it inherited', () => {
    // teddy-bear's description and body are already right; copying or regenerating
    // them is the one-summary-many-rows defect.
    //
    // The word boundary is load-bearing: `short_description` ENDS with `description`,
    // so a bare pattern matches the summary this migration legitimately writes and
    // fails on correct code. `_` and `d` are both word characters, so `\bdescription`
    // cannot match inside `short_description`.
    expect(work).not.toMatch(/\bdescription\s*=/);
    expect(work).not.toMatch(/\blong_description\s*=/);
    // ...while the summary it DOES write is still there, so this is not vacuous.
    expect(work).toMatch(/\bshort_description\s*=/);
  });
});

describe('postconditions assert the reached state', () => {
  it('proves the toy row became a REDIRECT, not a deletion', () => {
    expect(verify).toMatch(/status <> 'merged'/);
    expect(verify).toMatch(/k\.id = d\.merged_into_id/);
  });

  it('does NOT assert seo_indexable on the merged loser', () => {
    // merge_tag_concept leaves it set on every loser (202 corpus-wide) and it is inert
    // behind the 301 — asserting it fails on correct behaviour, which a first draft did.
    const p1 = verify.slice(0, verify.indexOf('P2'));
    expect(p1).not.toMatch(/seo_indexable/);
    expect(prose).toMatch(/202 merged rows/);
    expect(prose).toMatch(/HTTP 301/);
  });

  it('proves the survivor carries the QUEER sense, on prose not a flag', () => {
    expect(verify).toMatch(/description ilike '%bear culture%'/);
    expect(verify).toMatch(/public\.tag_has_prose\(description, short_description\)/);
  });

  it('proves the toy prose reaches no live row, with patterns specific to the defect', () => {
    expect(verify).toMatch(/ilike '%Theodore Roosevelt%'/);
    expect(verify).toMatch(/ilike '%cuddly toy role%'/);
    // A bare '%stuffed toy%' matches plushophilia, which is CORRECT — that draft
    // failed its own dry run and would have aborted db push on main.
    expect(verify).not.toMatch(/ilike '%stuffed toy%'/);
    expect(verify).toMatch(/ilike '%stuffed toy in the form of a bear%'/);
  });

  it('carries plushophilia as a positive control', () => {
    // Without it, narrowing P4 far enough to pass is indistinguishable from a sweep
    // that deleted the neighbouring concept.
    expect(verify).toMatch(/slug = 'plushophilia'/);
    expect(verify).toMatch(/plushophilia was damaged/);
  });

  it('asserts exactly one primary category, and that it is the survivor own', () => {
    expect(verify).toMatch(/if v_bad <> 1 then[\s\S]{0,120}primary categories/);
    expect(verify).toMatch(/Expression & Style/);
  });

  it('asserts all three category representations agree', () => {
    expect(verify).toMatch(/t\.category = c\.name/);
    expect(verify).toMatch(/tag_category_assignments a[\s\S]{0,160}is_primary/);
  });

  it('asserts the seven untouched pairs all survive', () => {
    for (const s of [
      'bicurious',
      'bi-curious',
      'cross-dresser',
      'crossdresser',
      'face-fucking',
      'facefucking',
      'dark-room',
      'darkroom',
      'gunplay',
      'gun-play',
      'boy-toy',
      'boytoy',
      'water-sports',
      'watersports',
    ])
      expect(verify).toContain(`'${s}'`);
    expect(verify).toMatch(/if v_bad <> 14 then/);
    // And `bear` itself, which carries the community sense this repair depends on.
    expect(verify).toMatch(/slug = 'bear'/);
  });

  it('cannot be neutered by a loosened comparison or a pre-seeded counter', () => {
    expect(verify).not.toMatch(/if v_\w+ < 0 then/);
    expect(verify).not.toMatch(/where false/);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=/);
  });
});

describe('the finding is recorded, not just fixed', () => {
  it('names the identifier as a SONG, resolved live', () => {
    expect(prose).toMatch(/Emilie Nicolas/);
    expect(prose).toMatch(/Q98022605/);
  });

  it('records that the other seven pairs are duplicates, not this defect', () => {
    expect(prose).toMatch(/DUPLICATES, not\s*wrong-sense|duplicate tags/i);
    expect(prose).toMatch(/editorial/);
  });

  it('records the standing invariant breach it noticed but did not fix', () => {
    // enforce_tag_wikidata_identity forbids two ACTIVE tags sharing an identifier but
    // only fires on write, so pre-existing pairs survive it.
    expect(prose).toMatch(/only fires on write/);
  });
});
