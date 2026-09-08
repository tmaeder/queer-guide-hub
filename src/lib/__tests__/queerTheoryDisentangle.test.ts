import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 20360101101800, which separates queer theory from queerness.
 *
 * `queerness` had been enriched from Q658022 — Queer theory — so its QID,
 * wikipedia_url, short_description, long_description and all NINE of its aliases
 * came from a different concept. The migration deletes the one alias that blocks
 * reviving `queer-theory`, revives that row unpublished, re-parents the other
 * eight translations onto it, and retracts the four contaminated fields from
 * `queerness`.
 *
 * Four things here are silently wrong if they regress, which is what this file
 * exists to catch:
 *
 *   1. FK ORDER. `search_synonyms.tag_alias_id` is ON DELETE SET NULL, so a
 *      synonym survives its alias and keeps rewriting queries toward the wrong
 *      tag. Deleting the alias first orphans the rewrite instead of removing it.
 *      There are 0 such rows today, so the DB cannot fail on a wrong order —
 *      only this test can.
 *
 *   2. THE REVIVE MUST CLEAR seo_indexable. A deprecated row can still carry it
 *      true, and this one does. Clearing `status` alone publishes an unreviewed
 *      body to crawlers the moment the row goes active.
 *
 *   3. THE RETRACTION MUST NOT TOUCH `description`. It is the one field that is
 *      genuinely about queerness, and an active indexable row with no
 *      description breaks a corpus invariant — so over-retracting would leave
 *      the page unpublishable rather than merely thinner.
 *
 *   4. THE SELF-ALIAS GUARD. Re-parenting the English alias onto the revived tag
 *      would mint an alias whose slug IS its own tag's slug. Both existing
 *      guards miss that shape, so the migration asserts it itself.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const FILE = '20360101101800_queer_theory_disentangle.sql';

/**
 * The file with every `--` comment line removed.
 *
 * Load-bearing, and learned from this migration's predecessor: the header
 * restates what the SQL does, so an assertion run against the raw text can be
 * satisfied by the PROSE while the statement it describes has been deleted.
 * Mutation testing is what surfaced that; every assertion below reads `code`.
 */
const code = (f: string) =>
  readFileSync(join(MIGRATIONS, f), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');

describe('20360101101800 — queer theory / queerness disentangle', () => {
  const sql = code(FILE);

  it('deletes the synonym row before the alias it hangs off', () => {
    const syn = sql.indexOf('delete from public.search_synonyms');
    const alias = sql.indexOf('delete from public.tag_aliases where id = v_alias');
    expect(syn).toBeGreaterThan(-1);
    expect(alias).toBeGreaterThan(-1);
    expect(syn).toBeLessThan(alias);
  });

  it('resolves the alias by the pair, never by alias_slug alone', () => {
    // An alias re-pointed at some other tag since the review is a different
    // decision, so the lookup must be constrained to `queerness` too.
    const lookup = sql.slice(
      sql.indexOf('select a.id into v_alias'),
      sql.indexOf('delete from public.search_synonyms'),
    );
    expect(lookup).toMatch(/alias_slug\s*=\s*'queer-theory'/);
    expect(lookup).toMatch(/canonical_tag_id\s*=\s*v_queer/);
  });

  it('revives the row unpublished — seo_indexable is cleared explicitly', () => {
    const revive = sql.slice(
      sql.indexOf("status              = 'active'"),
      sql.indexOf('where id = v_tag'),
    );
    expect(revive).toMatch(/seo_indexable\s*=\s*false/);
    expect(revive).toMatch(/human_reviewed\s*=\s*false/);
    expect(revive).toMatch(/verification_status\s*=\s*'unverified'/);
  });

  it('does not rewrite the revived row’s prose', () => {
    // The body is correct queer-theory prose under the correct QID. Rewriting it
    // would be the LLM rewrite this repo bans, and the revive has no business
    // touching content at all.
    const revive = sql.slice(
      sql.indexOf("status              = 'active'"),
      sql.indexOf('where id = v_tag'),
    );
    expect(revive).not.toMatch(
      /\b(long_description|short_description|description|wikidata_id)\s*=/,
    );
  });

  it('retracts exactly the four Q658022-derived fields on queerness', () => {
    const retract = sql.slice(
      sql.indexOf('wikidata_id       = null'),
      sql.indexOf('where id = v_queer;'),
    );
    const assigned = [...retract.matchAll(/^\s*(\w+)\s*=\s*null,?$/gm)].map((m) => m[1]).sort();
    expect(assigned).toEqual([
      'long_description',
      'short_description',
      'wikidata_id',
      'wikipedia_url',
    ]);
  });

  it('keeps queerness’s own description, and asserts it kept it', () => {
    expect(sql).toMatch(/where id = v_queer and coalesce\(btrim\(description\), ''\) = ''/);
    expect(sql).toMatch(/lost its description/);
  });

  it('re-parents exactly the eight translations', () => {
    expect(sql).toMatch(/set canonical_tag_id = v_tag/);
    expect(sql).toMatch(/if v_n <> 8 then/);
  });

  it('guards against minting a self-alias', () => {
    // `alias_slug = t.slug` on the alias's OWN canonical tag. The shadow trigger
    // excludes this shape by design and alias_equals_name misses it on the
    // hyphen, so nothing but this assertion would catch it.
    expect(sql).toMatch(/where a\.alias_slug = t\.slug/);
    expect(sql).toMatch(/self-alias row\(s\) exist/);
  });

  it('re-asserts the corpus invariants it could break', () => {
    expect(sql).toMatch(/alias\(es\) shadow a live tag corpus-wide/);
    expect(sql).toMatch(/alias_equals_name is % corpus-wide/);
    expect(sql).toMatch(/indexable row\(s\) corpus-wide have no description/);
  });

  it('refuses to run against a corpus that has already moved', () => {
    expect(sql).toMatch(/if v_before <> 9 then/);
    expect(sql).toMatch(/status = 'deprecated'/);
  });
});
