import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 77000101100000 — the self-citation register, one wrong subject, and
 * a refusal.
 *
 * THE REFUSAL IS THE POINT OF THIS FILE, and it is the thing most likely to be
 * undone by someone acting in good faith. 157 active rows close with a
 * sentence in the register `TAG_STYLE_SYSTEM` bans. Roughly 150 of those
 * sentences are DISTINCT, and hand-reading them splits the class in two:
 * contentless exhortation, and real safety, epistemic or contested-usage
 * content wearing the same voice — on `rape-play`, `piss-drinker`,
 * `hiv-transmission`, `water-bondage`, `electrostimulation`, `morosexual`,
 * `latino`, `alloromantic`. No regex separates them. A sweep keyed on the
 * phrasing strips harm-reduction content from a sexual-health glossary.
 *
 * So this file repairs three rows and asserts that the eight named
 * content-bearing rows KEEP their sentences. The test exists to make that
 * refusal survive a later pass that reaches for the easy sweep.
 *
 * It also preserves:
 *  - `description` is never written.
 *  - THE SURVIVING SENTENCES ARE ASSERTED IN FULL. "the citation is gone"
 *    passes equally against a complete rewrite, which is the bulk-rewrite
 *    experiment this repo retired after the prose judge got 13 of 16
 *    retractions wrong. Only the exact remaining text tells the two apart.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/77000101100000_tag_prose_register_and_refusal.sql',
);
const sql = readFileSync(MIGRATION, 'utf8');

const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const statements = bare.slice(0, bare.indexOf('do $verify$'));
const verify = bare.slice(bare.indexOf('do $verify$'));

const prose = sql
  .split('\n')
  .filter((l) => l.trimStart().startsWith('--'))
  .map((l) => l.trimStart().replace(/^--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

const blocks = statements.split(/^update public\.unified_tags/m).slice(1);
const setClauses = blocks
  .map((c) => (c.includes('where slug') ? c.slice(0, c.indexOf('where slug')) : c))
  .join('\n');

/** The rows whose banned-register sentence is real content, not padding. */
const PROTECTED = [
  'rape-play',
  'piss-drinker',
  'hiv-transmission',
  'water-bondage',
  'electrostimulation',
  'morosexual',
  'latino',
  'alloromantic',
];

const PUBERTY_BODY =
  'Puberty blockers are medications that temporarily delay the onset of puberty. They are often used to give young people time to explore their gender identity without the physical changes of puberty. The effects of puberty blockers are generally reversible when the medication is stopped.';
const POLYANDROUS_BODY =
  'Polyandry is a form of polyamory where one woman is married to or in a relationship with multiple men. This type of relationship can be found in some cultures and societies around the world.';

describe('77000101100000 — the register seam and its refusal', () => {
  it('writes exactly the 3 rows it claims', () => {
    const slugs = [...statements.matchAll(/where slug = '([a-z-]+)'/g)].map((m) => m[1]);
    expect(statements.match(/^update public\.unified_tags/gm)).toHaveLength(3);
    expect(new Set(slugs)).toEqual(new Set(['trampling', 'puberty-blockers', 'polyandrous']));
  });

  it('never writes description', () => {
    expect(setClauses).not.toMatch(/(^|[^_\w])description\s*=\s*'/);
  });

  it('keeps the refusal enforceable — the eight protected rows must keep theirs', () => {
    // This is the assertion the whole file is built around. A later pass that
    // sweeps the 157-row class on phrasing alone takes these with it.
    for (const s of PROTECTED) expect(verify).toContain(s);
    expect(verify).toMatch(/if v_bad <> 8 then/);
    expect(verify).toContain('content-bearing rows to keep their sentence');
    // And none of them is written by this file.
    for (const s of PROTECTED) expect(statements).not.toContain(`where slug = '${s}'`);
  });

  it('records why the class is refused rather than swept', () => {
    expect(prose).toContain('REAL CONTENT WEARING THE BANNED REGISTER');
    expect(prose).toContain('No regex separates those two groups');
    // The specific harms, named, so a later reader cannot rediscover the sweep
    // as a good idea from the phrasing alone.
    expect(prose).toContain('rape play is not the same as actual non-consensual');
    expect(prose).toContain('harm-reduction');
  });

  it('records the corrected measurement, including its own false start', () => {
    // The first measurement said two distinct sentences, which would have made
    // this a clean mechanical deletion. It was a regex artifact.
    expect(prose).toContain('157 active rows');
    expect(prose).toContain('That was an artifact of the regex');
    expect(prose).toContain('Re-measure before believing a number that makes the work easy.');
  });

  it('asserts the surviving bodies in FULL, not merely that the citation went', () => {
    // A "the citation is gone" check passes against a complete rewrite.
    expect(verify).toContain(PUBERTY_BODY);
    expect(verify).toContain(POLYANDROUS_BODY);
    expect(verify).toContain('is not the original minus one sentence');
    expect(verify).toContain('is not the original minus two sentences');
    // The written value and the asserted value must be the same text.
    expect(statements).toContain(PUBERTY_BODY);
    expect(statements).toContain(POLYANDROUS_BODY);
  });

  it('repairs trampling as a wrong subject, not as a register defect', () => {
    expect(prose).toContain('Cause of death by being walked on');
    expect(prose).toContain('the original rule at its sharpest');
    expect(verify).toContain('the literal-referent body survives on trampling');
  });

  it('guards every UPDATE on the defect still being present', () => {
    const guards = [
      ...statements.matchAll(
        /where slug = '[a-z-]+'\s*\n?\s*and (short_description = |long_description like)/g,
      ),
    ];
    expect(guards).toHaveLength(3);
  });

  it('counts the reached state positively and calls the real thin-page function', () => {
    expect(verify).toMatch(/if v_bad <> 3 then/);
    expect(verify).toContain('public.tag_has_prose(description, short_description)');
  });

  it('keeps every postcondition CONDITION strict', () => {
    // Assert the condition, not the needle inside it: neutering a comparison
    // leaves every string an assertion anchors on intact.
    expect([...verify.matchAll(/if v_bad <> 0 then/g)]).toHaveLength(5);
    expect(verify).not.toMatch(/if v_bad [<>]=? -?\d/);
  });

  it('records that the actor declaration is load-bearing', () => {
    expect(statements).toContain("set_config('app.actor'");
    expect(prose).toContain('all three rows are `human_reviewed`');
  });
});
