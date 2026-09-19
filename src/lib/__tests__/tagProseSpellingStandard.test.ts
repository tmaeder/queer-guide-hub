import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99970101100000 — the spelling axis, batch 11 (65 rows, 77 substitutions).
 *
 * 1. THE RULE HAS AN EXCEPTION AND THE EXCEPTION DOES MOST OF THE WORK.
 *    `styleguide_rules.spelling-and-units` (severity `should`) reads "Follow the
 *    source material's spelling; otherwise American." So an encyclopedic row, a
 *    WHO classification and a binomial genus name all legitimately keep their
 *    spelling. The file must assert those SURVIVE, or a later pass reads the
 *    omission as an oversight and sweeps them.
 *
 * 2. THE REGEX IS A CANDIDATE GENERATOR, NEVER A DEFECT LIST. `circumcised` and
 *    `bruised` are correct American English; `glamour` is the PRIMARY American
 *    spelling; `Haemophilus` is a genus name. Each is asserted intact.
 *
 * 3. THE DRIVER AND THE VERIFY LIST MUST BE THE SAME 77 PAIRS. A count match
 *    alone passes even when a pair differs between them, so this compares the
 *    extracted sets, not their sizes.
 *
 * 4. `replace()` CANNOT AUTHOR PROSE, which is the whole safety argument: every
 *    other byte survives by construction rather than by retyping. The file must
 *    therefore never contain a literal description assignment.
 */

const MIG = join(
  process.cwd(),
  'supabase/migrations/99970101100000_tag_description_spelling_standard.sql',
);
const sql = readFileSync(MIG, 'utf8');
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const rewrite = bare.slice(bare.indexOf('do $rewrite$'), bare.indexOf('do $verify$'));
const verify = bare.slice(bare.indexOf('do $verify$'));

/** Comment prose with line breaks and leading `--` collapsed: a phrase that
 *  wraps across two comment lines is invisible to a single-line pattern. */
const prose = sql
  .split('\n')
  .filter((l) => l.trimStart().startsWith('--'))
  .map((l) => l.trim().replace(/^--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

const pairsIn = (block: string) =>
  (block.match(/\('[a-z0-9-]+',\s*'[^']+'/g) ?? []).map((m) =>
    m.replace(/[()']/g, '').replace(/,\s*/, ','),
  );

describe('batch 11 — the spelling axis', () => {
  it('declares 77 substitutions over 65 distinct rows', () => {
    const pairs = pairsIn(rewrite);
    expect(pairs).toHaveLength(77);
    expect(new Set(pairs).size).toBe(77);
    expect(new Set(pairs.map((p) => p.split(',')[0])).size).toBe(65);
  });

  it('verifies exactly the pairs it applies — the same set, not the same count', () => {
    const applied = pairsIn(rewrite).sort();
    const checked = pairsIn(verify.slice(0, verify.indexOf('v_ok <> 77'))).sort();
    expect(checked).toEqual(applied);
  });

  it('repairs only by replace(), so it can never author prose', () => {
    expect(rewrite).toMatch(/set description = replace\(description, rec\.from_s, rec\.to_s\)/);
    // A literal assignment would mean a rewrite wearing a substitution's clothes.
    expect(rewrite).not.toMatch(/set description\s*=\s*'/);
    expect(rewrite).not.toMatch(/long_description/);
  });

  it('guards each UPDATE on the token still being present, so a re-run is inert', () => {
    expect(rewrite).toMatch(/position\(rec\.from_s in description\) > 0/);
    expect(rewrite).toMatch(/and status = 'active'/);
  });

  it('declares an actor — load-bearing, since 55 of the 65 rows are human_reviewed', () => {
    expect(rewrite).toMatch(
      /set_config\('app\.actor', 'migration:tag_description_spelling_standard', true\)/,
    );
  });

  it('names the migration, not its version, so a renumber cannot desynchronise the stamp', () => {
    expect(sql).not.toMatch(/migration:\d{14}/);
    expect(prose).toMatch(/actor names the MIGRATION rather than its version/i);
  });

  it('counts the reached state positively, never rows in a bad state', () => {
    expect(verify).toMatch(/if v_ok <> 77 then/);
    expect(verify).toMatch(/if v_ok <> 65 then/);
    // A loosened comparison leaves every string-anchored assertion green while
    // the check has stopped checking.
    expect(verify).not.toMatch(/if v_(ok|bad) [<>]=? -?\d/);
    // `false-positive` appears in a RAISE message, so a bare /\bfalse\b/ fires on
    // correct code. Ban the forms that actually neuter a predicate instead.
    expect(verify).not.toMatch(/\b(and|or|where|if)\s+false\b/);
    expect(verify).not.toMatch(/=\s*false\b/);
  });

  it('calls tag_has_prose rather than restating its OR', () => {
    expect(verify).toMatch(/public\.tag_has_prose\(description, short_description\)/);
    expect(verify).not.toMatch(/coalesce\(nullif\(btrim\(description\)/);
  });

  it('asserts the ICD-11 clinical family survives', () => {
    expect(verify).toMatch(
      /'chancroid','gender-incongruence','granuloma-inguinale','orgasmic-dysfunction'[\s\S]{0,200}?characterised[\s\S]{0,200}?if v_ok <> 4 then/,
    );
    expect(prose).toMatch(/whether a PARAPHRASE inherits its source's orthography/i);
  });

  it('asserts the encyclopedic source-spelling controls survive', () => {
    for (const s of ['bali', 'toronto', 'madrid', 'freedom-of-speech', 'homophile-movement']) {
      expect(verify).toContain(`('${s}',`);
    }
    expect(verify).toMatch(/if v_ok <> 5 then/);
  });

  it("asserts the regex's own false positives survive", () => {
    for (const s of [
      'pin-ups',
      'dependence',
      'circumsexual',
      'defilement',
      'chancroid',
      'color-grey',
      'estradiol',
    ]) {
      expect(verify).toContain(`('${s}',`);
    }
    expect(verify).toMatch(/if v_ok <> 7 then/);
    expect(prose).toMatch(/BINOMIAL GENUS NAME/);
    expect(prose).toMatch(/`glamour` \(pin-ups\) is the PRIMARY American spelling/);
  });

  it('asserts the grey cohort and the event-safety deferral survive', () => {
    expect(verify).toMatch(
      /'aromantic-pride-flag','demisexual-pride-flag','silver-fox-chaser'[\s\S]{0,160}?if v_ok <> 3 then/,
    );
    expect(verify).toMatch(
      /slug = 'event-safety'[\s\S]{0,240}?event-safety deferral no longer holds/,
    );
  });

  it('drives gonorrhoea to zero corpus-wide, and claims that for no other pair', () => {
    expect(verify).toMatch(/\\mgonorrhoea\\M[\s\S]{0,200}?if v_bad <> 0 then/);
    // `characteris` leads corpus-wide and is NOT resolved; claiming it would be false.
    expect(verify).not.toMatch(/\\mcharacteris/);
  });

  it('never touches the four rows deferred by name', () => {
    const drivenSlugs = new Set(pairsIn(rewrite).map((p) => p.split(',')[0]));
    for (const s of ['dependence', 'pin-ups', 'event-safety', 'chancroid']) {
      expect(drivenSlugs.has(s)).toBe(false);
    }
  });

  it('records that the word list was widened until it stopped finding new families', () => {
    expect(prose).toMatch(/A hand-remembered list .{0,40}found 40 rows/i);
    expect(prose).toMatch(/found 106/);
    expect(prose).toMatch(/added 8 more \(114\)/);
  });

  it('does not overclaim the search effect', () => {
    expect(prose).toMatch(/coalesce\(t\.short_description, t\.description, ''\)/);
    expect(prose).toMatch(/24 of these 65/);
  });
});
