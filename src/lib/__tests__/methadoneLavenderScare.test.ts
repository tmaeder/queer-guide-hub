import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 20361124161700 — methadone's prose and the Lavender Scare duplicate.
 *
 * Six things here are silently wrong if they regress:
 *
 *   1. DEMOTE BEFORE MERGE. `merge_tag_concept` REPOINTS the loser's category
 *      rows onto the winner rather than dropping them, so two `is_primary` rows
 *      land on one tag and the partial unique index rejects the whole migration
 *      (23505). The first dry run of this file aborted exactly there. The demote
 *      must stay, and must stay BEFORE the merge call.
 *
 *   2. THE MERGE DIRECTION. `lavender-scare` carries the prose, the QID and the
 *      correct slug; `lavenderscare` is an empty scrape artefact. Reversed, the
 *      merge would absorb the real entry into the blank one.
 *
 *   3. METHADONE'S QID IS CORRECT AND MUST NOT BE TOUCHED. Q179996 resolves to
 *      "(RS)-methadone" and sitelinks to en:Methadone; Wikidata has no separate
 *      medication item. The defect was prose written FROM that item's own
 *      description ("group of stereoisomers"), which is a different failure from
 *      a wrong identifier and is not fixed by clearing one.
 *
 *   4. `seo_indexable` IS SET EXPLICITLY ON BOTH REVIVES. 20361001100100 exists
 *      because a revive that moves status and review flags but not this column
 *      leaves the page invisible to crawlers with nothing to self-heal it.
 *
 *   5. `human_reviewed = true` ON BOTH. Both rows have `usage_count = 0`, and
 *      `deprecate_unused_tags` selects exactly
 *      `status='active' AND human_reviewed=false AND usage_count=0` — so a revive
 *      without the flag re-offers itself to the next sweep.
 *
 *   6. THE PROSE KEEPS ITS LOAD-BEARING FACT. A methadone entry that does not
 *      say the drug outlasts its own felt effect is not a shorter entry, it is a
 *      useless one — that gap is what makes induction and re-dosing lethal.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const FILE = '20361124161700_methadone_prose_and_lavender_scare_merge.sql';

/**
 * The file with every `--` comment line removed. Load-bearing: the header
 * restates what the SQL does, so an assertion over the raw text can be satisfied
 * by the PROSE while the statement it describes has been deleted.
 */
const code = (f: string) =>
  readFileSync(join(MIGRATIONS, f), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');

describe('20361124161700 — methadone prose + lavender-scare merge', () => {
  const sql = code(FILE);

  it('demotes the loser’s primary junction BEFORE merging', () => {
    const demote = sql.indexOf('set is_primary = false');
    const merge = sql.indexOf('merge_tag_concept(');
    expect(demote).toBeGreaterThan(-1);
    expect(merge).toBeGreaterThan(-1);
    expect(demote).toBeLessThan(merge);
    expect(sql).toMatch(/where tag_id = v_junk and is_primary/);
  });

  it('merges the empty duplicate INTO the row that has the prose', () => {
    // v_ls = lavender-scare (canonical, first arg), v_junk = lavenderscare.
    expect(sql).toMatch(/merge_tag_concept\(\s*\n?\s*v_ls,\s*v_junk,/);
    expect(sql).not.toMatch(/merge_tag_concept\(\s*\n?\s*v_junk,\s*v_ls,/);
  });

  it('never repoints or clears methadone’s Wikidata identifier', () => {
    expect(sql).not.toMatch(/wikidata_id\s*=\s*(null|'Q)/);
    // ...and asserts it survived.
    expect(sql).toMatch(/wikidata_id <> 'Q179996'/);
  });

  it('replaces the prose only while it still holds the Wikidata-derived text', () => {
    expect(sql).toMatch(/long_description ilike '%group of stereoisomers%'/);
  });

  it('sets seo_indexable explicitly on both revives', () => {
    const sets = sql.match(/seo_indexable\s*=\s*true/g) ?? [];
    expect(sets.length).toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/seo_deindex_reason\s*=\s*null/);
  });

  it('marks both rows human_reviewed so the zero-usage sweep cannot re-cull them', () => {
    const flags = sql.match(/human_reviewed\s*=\s*true/g) ?? [];
    expect(flags.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the half-life gap and the naloxone caveat in the body', () => {
    expect(sql).toMatch(/how long it lasts and how long it feels like it lasts/);
    expect(sql).toMatch(/outlasts naloxone/);
  });

  it('asserts the refile landed on the junction, not just the text column', () => {
    expect(sql).toMatch(/a\.is_primary and c\.slug = 'movements-milestones'/);
    expect(sql).toMatch(/expected only movements-milestones/);
  });

  it('re-asserts the corpus invariants a merge can break', () => {
    expect(sql).toMatch(/alias_equals_name is % corpus-wide/);
    expect(sql).toMatch(/self-alias row\(s\) exist/);
    expect(sql).toMatch(/alias\(es\) shadow a live tag corpus-wide/);
    expect(sql).toMatch(/tag_has_prose\(description, short_description\)/);
  });
});
