import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 50700101100200 — eight live, indexable glossary pages whose own
 * `description` is CORRECT and whose short/long description describe a
 * different subject. `/tags/support` led with a definition of assistance and
 * then ran 375 characters about canvas and paper; `/tags/dating` followed
 * "Exploring romantic connection" with 466 characters about dating fossils.
 *
 * Same class as 50500101100000 (rope glossary), same producer: the 2026-08-29
 * wrong-entity repair took the identifier away and deliberately left the prose,
 * so every row here carries `disposition='cleared'` in
 * `tag_wikidata_repair_audit`.
 *
 * Three properties are load-bearing and each has its own assertion:
 *
 *  1. `description` is never touched. It is the EVIDENCE that establishes the
 *     sense, and repairing only the wrong fields is the casting/trauma rule.
 *  2. `man` keeps its `long_description`. That body is already on-subject and
 *     trans-inclusive; only the essentialist one-liner contradicted the row.
 *     Rewriting correct-but-wordy prose is the LLM rewrite both auto-apply
 *     paths were retired for.
 *  3. The rows deliberately NOT repaired stay unrepaired, so a later pass can
 *     tell "left by decision" from "already fixed".
 *
 * Assertions run against COMMENT-STRIPPED SQL: this file's header quotes the
 * wrong prose it is removing almost verbatim, so a bare toContain over the raw
 * file would pass with the real statement deleted.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const FILE = '50700101100200_tag_disowned_prose_wrong_subject.sql';

/** Line comments only; this file uses no block comments. */
const sql = readFileSync(join(MIGRATIONS, FILE), 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

/** The slice of a statement that begins at its `where slug = '<slug>'`. */
const stmtFor = (slug: string): string => {
  const i = sql.indexOf(`where slug = '${slug}'`);
  expect(i).toBeGreaterThan(-1);
  const start = sql.lastIndexOf('update unified_tags', i);
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf(';', i);
  return sql.slice(start, end);
};

describe('wrong-subject prose on live glossary pages', () => {
  it('declares a non-system actor', () => {
    // keeper, bull and man are human_reviewed, and log_unified_tag_change()
    // RAISEs when an actor matching 'system:%' modifies such a row. Verified
    // against prod: without this the migration aborts on `man`.
    expect(sql).toMatch(/set_config\(\s*'app\.actor'\s*,\s*'migration:[^']+'/);
  });

  it.each([
    ['news-pride', /short_description = 'Emotion of self-worth and accomplishment'/],
    ['workshop', /short_description = 'Space for artists to work'/],
    ['support', /short_description = 'Surface for painting or drawing'/],
    ['dating', /short_description = 'Attributing a date to an object or event'/],
    ['romance', /short_description = 'Films about romantic love and relationships'/],
    ['keeper', /short_description = 'Goalkeeper in various team sports'/],
    ['bull', /short_description = 'Adult male cattle'/],
    ['man', /short_description = 'An adult human male\.'/],
  ])('only rewrites %s while it still carries the wrong subject', (slug, guard) => {
    // An unguarded UPDATE would overwrite a row a human has since corrected.
    expect(stmtFor(slug)).toMatch(guard);
  });

  it.each([
    ['workshop', /long_description like 'A workshop is a working place set aside for artists%'/],
    ['support', /long_description like 'A support is a material that forms the surface%'/],
    ['dating', /long_description like 'Chronological dating is the process%'/],
    ['romance', /long_description like 'Romance films involve romantic love stories%'/],
    ['bull', /long_description like 'A bull is an intact adult male of the species Bos taurus%'/],
  ])('guards the %s body on its own wrong-subject text too', (slug, guard) => {
    expect(stmtFor(slug)).toMatch(guard);
  });

  it('never writes description on any of the eight', () => {
    // `description` is the evidence for every repair here. An UPDATE that set
    // it would be changing the thing that justified the change.
    for (const slug of [
      'news-pride',
      'workshop',
      'support',
      'dating',
      'romance',
      'keeper',
      'bull',
      'man',
    ]) {
      const stmt = stmtFor(slug);
      // `short_description`/`long_description` contain the substring, so match
      // the bare column assignment only.
      expect(stmt).not.toMatch(/(^|[\s,])description\s*=/m);
    }
    // `description` drift REPORTS rather than aborts: this file never writes it,
    // so a difference means someone else edited it, and aborting `db push` on
    // main for that would block every migration queued behind this one.
    expect(sql).toMatch(/raise notice '[^']*description\(s\) differ/);
  });

  it('leaves man.long_description alone and asserts it survived', () => {
    const stmt = stmtFor('man');
    expect(stmt).not.toMatch(/long_description\s*=/);
    expect(sql).toMatch(/raise notice '[^']*man\.long_description differs/);
    expect(sql).toMatch(
      /long_description like 'A man is an adult human being who identifies as male%'/,
    );
  });

  it('does not touch keeper.long_description, which is already NULL', () => {
    expect(stmtFor('keeper')).not.toMatch(/long_description\s*=/);
  });

  describe('rows deliberately left alone', () => {
    it.each([
      ['lion', "short_description = 'Large cat species'"],
      ['gym', "short_description = 'Sport with exercises for balance, strength, and flexibility'"],
    ])('%s is asserted UNCHANGED rather than guessed at', (slug, text) => {
      // Guessing a sense is how this whole class arose — 50500101100000 left
      // `steer` and `warlord` for the same reason. The postcondition is what
      // makes "left by decision" distinguishable from "already fixed".
      expect(sql).not.toMatch(
        new RegExp(`update unified_tags[\\s\\S]{0,400}?where slug = '${slug}'`),
      );
      const i = sql.indexOf(`slug='${slug}'`);
      expect(i).toBeGreaterThan(-1);
      expect(sql.slice(i, i + 200)).toContain(text);
      // Reported, not raised.
      expect(sql.slice(i, i + 600)).toMatch(/raise notice/);
      expect(sql.slice(i, i + 600)).not.toMatch(/raise exception/);
    });
  });

  it("asserts the DEFECT IS GONE, not that this file's exact prose is present", () => {
    // Two properties at once. Counting updated rows proves nothing (every
    // statement is content-guarded and no-ops on a re-run), AND pinning the
    // assertion to this file's exact wording would abort `db push` on main if a
    // human writes better prose first — the repo-wide blast radius. Asserting
    // the wrong text is absent is satisfied by this fix and by a better one.
    expect(sql).toMatch(/raise exception '[^']*wrong-subject short_description\(s\) still live/);
    expect(sql).toMatch(/raise exception '[^']*wrong-subject long_description\(s\) still live/);
    // The old shape must not come back.
    expect(sql).not.toMatch(/did not reach the corrected short_description/);
  });

  it('replaces rather than retracts — no NULLed prose on these live rows', () => {
    // Every row is active and rendering, so nulling leaves a correct-but-thinner
    // page where a replacement leaves a correct one.
    expect(sql).not.toMatch(/set\s+short_description\s*=\s*null/i);
    expect(sql).not.toMatch(/long_description\s*=\s*null/i);
  });
});
