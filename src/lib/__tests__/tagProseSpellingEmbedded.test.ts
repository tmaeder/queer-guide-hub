import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991789819393_tag_description_spelling_embedded.sql.
 *
 * Batch 11 (99990101100000) matched Commonwealth spellings as WHOLE WORDS, so every
 * embedded form slipped through: colour+less, milli+litres. This migration takes the
 * two rows that miss reached -- both of them prose this series authored itself, so the
 * `spelling-and-units` source-material exception does not cover them.
 *
 * Assertions are scoped to the half of the statement they are about. Every defect
 * string appears TWICE in the file -- once in an UPDATE's content guard and once in a
 * postcondition -- so asserting over the whole file matches the guard and passes while
 * the postcondition is gutted.
 */

const MIGRATION = '99991789819393_tag_description_spelling_embedded.sql';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** Strip line-leading SQL comments. The header explains the defect at length, so an
 *  un-stripped assertion is satisfiable by the prose while the statement is gone. */
const stripComments = (s: string) =>
  s
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

const body = stripComments(sql);
const rewrite = body.slice(body.indexOf('do $rewrite$'), body.indexOf('do $verify$'));
const verify = body.slice(body.indexOf('do $verify$'));

/** Extract (slug, from, to) triples from a VALUES table, whitespace-tolerant. */
const triplesIn = (s: string): string[] =>
  Array.from(s.matchAll(/\(\s*'([a-z0-9-]+)'\s*,\s*'([A-Za-z]+)'\s*,\s*'([A-Za-z]+)'\s*\)/g)).map(
    (m) => `${m[1]}|${m[2]}|${m[3]}`,
  );

describe('tag_description_spelling_embedded', () => {
  it('rewrites exactly the three embedded-spelling pairs', () => {
    expect(triplesIn(rewrite).sort()).toEqual(
      [
        'ghb|millilitres|milliliters',
        'spiking|colourless|colorless',
        'spiking|millilitres|milliliters',
      ].sort(),
    );
  });

  it('verifies exactly the pairs it applies — the same SET, not the same count', () => {
    const applied = triplesIn(rewrite).sort();
    const checked = triplesIn(verify.slice(0, verify.indexOf('v_bad <> 3'))).sort();
    expect(checked).toEqual(applied);
  });

  it('uses replace(), which cannot author prose', () => {
    expect(rewrite).toMatch(/set description = replace\(description, rec\.from_s, rec\.to_s\)/);
    // No literal description assignment anywhere — that would be a rewrite.
    expect(rewrite).not.toMatch(/set description = '/);
  });

  it('guards every UPDATE on the token still being present, so a re-run is inert', () => {
    expect(rewrite).toMatch(/position\(rec\.from_s in description\) > 0/);
  });

  it('touches only active rows', () => {
    expect(rewrite).toMatch(/and status = 'active'/);
  });

  it('declares the actor — both rows are human_reviewed and the trigger RAISEs otherwise', () => {
    expect(rewrite).toMatch(
      /set_config\('app\.actor', 'migration:tag_description_spelling_embedded', true\)/,
    );
  });

  it('names the migration in the actor stamp, never its version', () => {
    // A version string in the body desynchronises from the filename on a renumber.
    const actorLine = rewrite.match(/set_config\('app\.actor',\s*'([^']+)'/)?.[1] ?? '';
    expect(actorLine).not.toMatch(/\d{14}/);
  });

  it('counts the REACHED state positively, not rows in a bad state', () => {
    // `v_bad <> 3` fails when a slug vanishes; a "count the broken ones = 0" form
    // returns zero for a missing row and passes vacuously.
    expect(verify).toMatch(/if v_bad <> 3 then/);
  });

  it('calls tag_has_prose rather than restating it', () => {
    // The predicate is an OR; a hand-rolled "both present" form is a stricter,
    // different check that would fail on a row with no description.
    expect(verify).toMatch(/not public\.tag_has_prose\(description, short_description\)/);
  });

  it('asserts the SURVIVING prose, not merely that the token is gone', () => {
    const survivors = [
      'Putting a drug into someone',
      'Harm-reduction guidance treats it as an assault in progress',
      'your own cup, marked; your own lube; your own bottle',
      'A liquid depressant used both in nightlife and in chemsex',
      'a volume of GBL matching an ordinary GHB dose can be fatal',
    ];
    for (const s of survivors) expect(verify).toContain(s);
  });

  it('asserts the encyclopedic cohort survives (source-material exception)', () => {
    for (const slug of [
      'croatia',
      'madrid',
      'wales',
      'stolperstein',
      'airport',
      'paignton',
      'toronto',
      'slavery',
      'tea',
      'color-rainbow',
    ]) {
      expect(verify).toContain(`'${slug}'`);
    }
    expect(verify).toMatch(/encyclopedic control\(s\) were swept/);
  });

  it('asserts community identity vocabulary survives', () => {
    // greysexual / greygender are spellings of an IDENTITY TERM, not a colour word.
    for (const needle of ['greysexual', 'greysexuality', 'greygender']) {
      expect(verify).toContain(`'${needle}'`);
    }
  });

  it("asserts the sweep's own false positives survive", () => {
    // 'programme' is a prefix of 'programmed', which is correct American English.
    expect(verify).toContain("'fembot'");
    expect(verify).toContain("'robot'");
    expect(verify).toContain("'programmed'");
  });

  it('asserts the deferred grey cohort survives', () => {
    expect(verify).toContain("'grizzly-bear'");
    expect(verify).toContain("'greying'");
  });

  it('drives millilitre to zero corpus-wide', () => {
    const tail = verify.slice(verify.indexOf('millilitre still present'));
    expect(verify).toMatch(/position\('millilitre' in description\) > 0/);
    expect(tail).toBeTruthy();
  });

  it('never neuters a postcondition predicate', () => {
    // `false-positive` appears in prose, so a bare /\bfalse\b/ fires on correct code.
    // Ban the forms that actually neuter a check instead.
    expect(verify).not.toMatch(/\b(and|or|where|if)\s+false\b/);
    expect(verify).not.toMatch(/=\s*false\b/);
    // And refuse a loosened comparison anywhere in the block.
    expect(verify).not.toMatch(/if v_bad <\s*0/);
    expect(verify).not.toMatch(/if v_bad >\s*\d/);
  });

  it('every postcondition actually reads unified_tags', () => {
    const raises = verify.match(/raise exception/g) ?? [];
    const reads = verify.match(/from unified_tags|join unified_tags/g) ?? [];
    expect(raises.length).toBe(6);
    expect(reads.length).toBeGreaterThanOrEqual(6);
  });
});
