import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 20360401100300, which finishes separating queerness from queer theory.
 *
 * #3553 (20360401100100) landed first and did the identity half — it deleted the
 * `queer-theory` alias, nulled `queerness`'s wrong QID and URL, and revived
 * `queer-theory` as a published term. This migration does ONLY the residue that
 * left standing, measured on prod afterwards: the two prose fields, the eight
 * misparented translations, and the two provenance rows.
 *
 * Five things here are silently wrong if they regress:
 *
 *   1. THE RETRACTION IS CONTENT-GUARDED, not a blanket null. If someone writes
 *      real queerness prose into either field before this applies, a blanket
 *      `= null` would delete their work.
 *
 *   2. `description` IS NEVER TOUCHED. It is the one field genuinely about
 *      queerness, and `tag_has_prose(description, short_description)` is a hard
 *      zero for an active indexable row — so over-retracting would leave a
 *      55-use page unpublishable rather than merely thinner.
 *
 *   3. THE RE-PARENT IS BY EXPLICIT SLUG. "Every alias on queerness" would drag
 *      along any real translation of QUEERNESS the row gains later.
 *
 *   4. IT MUST NOT RE-ACQUIRE #3553's WORK. An earlier draft of this change
 *      (20360101101800, never applied) also deleted the alias, revived the tag
 *      and nulled the QID. Doing any of that again is how two migrations collide
 *      and break `db push` for everything behind them.
 *
 *   5. PRECONDITIONS STAY SOFT. That earlier draft aborted on exact-match
 *      premises — `queer-theory` must be deprecated, `queerness` must carry
 *      exactly 9 aliases — and a concurrent session made every one false between
 *      authoring and merge. Postconditions are what may be hard here.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const FILE = '20360401100300_queerness_prose_retraction.sql';

/**
 * The file with every `--` comment line removed.
 *
 * Load-bearing, and learned the hard way on this migration's predecessor: the
 * header restates what the SQL does, so an assertion run against the raw text
 * can be satisfied by the PROSE while the statement it describes has been
 * deleted. Mutation testing is what surfaced that; every assertion below reads
 * `code`.
 */
const code = (f: string) =>
  readFileSync(join(MIGRATIONS, f), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');

const SLUGS = [
  'queer-teorie',
  'queer-theorie',
  'queertheorie',
  'teora-cuir',
  'teora-kuir',
  'teora-queer',
  'teora-torcida',
  'thorie-queer',
];

describe('20360401100300 — queerness prose retraction', () => {
  const sql = code(FILE);

  it('retracts only prose that still holds the queer-theory text', () => {
    expect(sql).toMatch(/short_description ilike '%critical theory on non-heterosexual%'/i);
    expect(sql).toMatch(/long_description ilike 'queer theory is a field of post-structuralist%'/i);
  });

  it('never assigns queerness.description', () => {
    // Reading it in an assertion is fine; assigning it is not.
    expect(sql).not.toMatch(/^\s*set description\s*=/m);
    expect(sql).not.toMatch(/\bdescription\s*=\s*null/);
  });

  it('asserts the description survived', () => {
    expect(sql).toMatch(/coalesce\(btrim\(description\), ''\) = ''/);
    expect(sql).toMatch(/lost its description/);
  });

  it('re-parents by explicit slug, never every alias on the row', () => {
    const reparent = sql.slice(
      sql.indexOf('set canonical_tag_id = v_theory'),
      sql.indexOf('get diagnostics'),
    );
    expect(reparent).toMatch(/alias_slug in \(/);
    for (const s of SLUGS) expect(reparent).toContain(`'${s}'`);
  });

  it('asserts all eight landed on queer-theory and none stayed behind', () => {
    expect(sql).toMatch(/if v_n <> 8 then/);
    expect(sql).toMatch(/translation\(s\) still on `queerness`/);
  });

  it('drops the two Q658022 provenance rows', () => {
    expect(sql).toMatch(/delete from public\.tag_sources/);
    expect(sql).toContain('https://www.wikidata.org/wiki/Q658022');
    expect(sql).toContain('https://en.wikipedia.org/wiki/Queer_theory');
    expect(sql).toMatch(/provenance row\(s\) still on `queerness`/);
  });

  it('does not repeat what 20360401100100 already did', () => {
    // No revive, no identity write, no alias delete — those belong to #3553, and
    // repeating them is what made the earlier draft collide.
    expect(sql).not.toMatch(/status\s*=\s*'active'\s*,/);
    expect(sql).not.toMatch(/\bwikidata_id\s*=/);
    expect(sql).not.toMatch(/\bwikipedia_url\s*=/);
    expect(sql).not.toMatch(/delete from public\.tag_aliases/);
    expect(sql).not.toMatch(/deprecated_at\s*=/);
  });

  it('keeps preconditions soft — no exact-count abort a concurrent session can trip', () => {
    // `queer-theory` must be ACTIVE here (20360401100100's outcome), never
    // 'deprecated' (the state the earlier draft demanded).
    expect(sql).not.toMatch(/status = 'deprecated'/);
    expect(sql).not.toMatch(/<> 9 then/);
    expect(sql).toMatch(/slug = 'queer-theory' and status = 'active'/);
  });

  it('re-asserts the corpus invariants it could break', () => {
    expect(sql).toMatch(/where a\.alias_slug = t\.slug/);
    expect(sql).toMatch(/alias_equals_name is % corpus-wide/);
    expect(sql).toMatch(/alias\(es\) shadow a live tag corpus-wide/);
    expect(sql).toMatch(/tag_has_prose\(description, short_description\)/);
  });
});
