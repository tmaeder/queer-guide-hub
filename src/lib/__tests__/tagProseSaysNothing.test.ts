import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 75000101100000 — the says-nothing seam, and the two abbreviations.
 *
 * WHAT THIS FILE EXISTS TO PRESERVE:
 *
 * 1. `description` IS NEVER WRITTEN. It is the evidence the repairs rest on.
 *    `short_description` ends in the same word, so the assertion is
 *    boundary-anchored.
 *
 * 2. THE THIN-PAGE POSTCONDITION CALLS THE REAL FUNCTION. `tag_has_prose` is
 *    an OR — `coalesce(nullif(btrim(description),''), short_description) is
 *    not null` — and two rows in this tranche (`pov`, `uncut`) carry NO
 *    description at all. A hand-written "both must be present" check, which is
 *    what the previous file in this series used, would fail on exactly the
 *    rows group A exists to repair and would read as a defect in the fix.
 *
 * 3. ONLY TWO BODIES ARE NULLED. This tranche keeps nineteen bodies it could
 *    have swept, including `mademoiselle`'s generic-sense one, which is left
 *    standing because under-reaching is the correct error. The control
 *    assertion names six rows whose bodies must survive.
 *
 * 4. THE THREE GROUPS STAY SEPARATE. Group A picks a sense from the CATEGORY,
 *    which is the widened rule and the strongest licence in this series;
 *    group B restates the row's own description and picks nothing; group C
 *    fills a NULL. Merging them lets a later pass take group A's licence for a
 *    row with no evidence.
 *
 * 5. THE REFUSALS ARE RECORDED WITH THEIR REASON. `solo` looks identical to
 *    `pov` and `uncut` and was refused because a second reading — solo travel
 *    — is live on this platform. Losing that invites the next pass to take it.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/75000101100000_tag_prose_says_nothing_and_abbreviation.sql',
);
const sql = readFileSync(MIGRATION, 'utf8');

/** Comment-stripped: the header quotes every defect it removes, so a raw-text
 *  assertion is satisfiable by the PROSE while the statement is gone. */
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const statements = bare.slice(0, bare.indexOf('do $verify$'));
const verify = bare.slice(bare.indexOf('do $verify$'));

/** Header prose, whitespace collapsed, so an assertion on a sentence is not
 *  defeated by where the line happens to wrap — the trap this repo has now
 *  recorded seven times. */
const prose = sql
  .split('\n')
  .filter((l) => l.trimStart().startsWith('--'))
  .map((l) => l.trimStart().replace(/^--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

const blocks = statements.split(/^update public\.unified_tags/m).slice(1);
const blockFor = (slug: string) => blocks.find((b) => b.includes(`where slug = '${slug}'`));
const setClauses = blocks
  .map((c) => (c.includes('where slug') ? c.slice(0, c.indexOf('where slug')) : c))
  .join('\n');

const GROUP_A = ['pov', 'uncut'];
const GROUP_B = [
  'anal-warts',
  'breeder',
  'tongue-sucking',
  'warrior-princess',
  'alpha-pet',
  'drag',
  'honorifics',
  'mademoiselle',
  'monsieur',
  'hard-limits',
  'freak',
  'heterotypical',
  'switch',
  'triad',
];
const GROUP_C = ['lgbtq', 'futanari', 'feminist-solidarity', 'slang-words', 'poppet'];
const ALL = [...GROUP_A, ...GROUP_B, ...GROUP_C];
const BODY_NULLED = ['pov', 'poppet'];
/** Bodies this pass had no licence to touch. */
const CONTROLS = ['triad', 'drag', 'lgbtq', 'monsieur', 'mademoiselle', 'hard-limits'];

const DISOWNED = [
  'Lack of financial resources for basic needs',
  'Uncut refers to unedited content',
  'Anal warts are a type of STI',
  'A form of intimate oral activity',
  'Term for strong female figures',
  'Term for a dominant pet',
  'Refers to drag culture or performance',
  'Titles and pronouns used as signs of respect',
  'French honorific for women',
  'French title of respect for a man',
  'Boundaries in BDSM practices',
  'Term for unusual physical condition or enthusiast',
  'Conforming to traditional gender roles',
  'A person who switches between roles or identities',
  'A group of three',
];

describe('75000101100000 — the says-nothing seam', () => {
  it('writes exactly the 21 rows it claims, and only those', () => {
    const slugs = [...statements.matchAll(/where slug = '([a-z-]+)'/g)].map((m) => m[1]);
    expect(statements.match(/^update public\.unified_tags/gm)).toHaveLength(21);
    expect(new Set(slugs)).toEqual(new Set(ALL));
  });

  it('never writes description — the evidence the repair rests on', () => {
    expect(setClauses).not.toMatch(/(^|[^_\w])description\s*=\s*'/);
    expect(setClauses).toMatch(/short_description\s*=/);
  });

  it('calls the REAL thin-page function instead of re-implementing it', () => {
    // tag_has_prose is an OR. `pov` and `uncut` have no description at all, so
    // a hand-rolled "both present" test fails on the rows group A repairs.
    expect(verify).toContain('public.tag_has_prose(description, short_description)');
    expect(verify).not.toMatch(/coalesce\(description, ''\) = ''\s+or/);
    expect(prose).toContain('THE THIN-PAGE GATE IS AN `OR`, NOT AN `AND`');
  });

  it('nulls exactly two bodies and keeps the nineteen it had no licence for', () => {
    expect([...statements.matchAll(/long_description\s*=\s*null/g)]).toHaveLength(2);
    for (const s of BODY_NULLED) expect(blockFor(s)).toContain('long_description');
    for (const s of CONTROLS) {
      const block = blockFor(s);
      expect(block).toBeDefined();
      expect(block).not.toContain('long_description');
      expect(verify).toContain(s);
    }
    expect(verify).toContain('lost a body this pass had no licence to touch');
  });

  it('guards every UPDATE on the defect still being present', () => {
    const summaryGuards = [
      ...statements.matchAll(/where slug = '[a-z-]+' and short_description = /g),
    ];
    const emptyGuards = [
      ...statements.matchAll(/where slug = '[a-z-]+' and coalesce\(short_description, ''\) = ''/g),
    ];
    expect(summaryGuards).toHaveLength(16);
    expect(emptyGuards).toHaveLength(5);
    // The one group-C row that also removes a body is additionally guarded on
    // the body it is about to take.
    expect(blockFor('poppet')).toContain('long_description like');
  });

  it('keeps the three groups separate, with group A alone taking a sense', () => {
    expect(sql).toContain('GROUP A');
    expect(sql).toContain('GROUP B');
    expect(sql).toContain('GROUP C');
    expect(prose).toContain('the sense may be established by a CATEGORY');
    // Group B restates and chooses nothing — the weaker licence.
    expect(prose).toContain("RESTATES THE ROW'S OWN DESCRIPTION");
  });

  it('records why `solo` was refused where `pov` and `uncut` were not', () => {
    // The refusal is the load-bearing half of the widened rule: it applies only
    // where the category admits exactly ONE reading.
    expect(prose).toContain('this is a TRAVEL platform');
    expect(prose).toContain('EXACTLY ONE reading');
    for (const s of ['solo', 'black', 'peaches', 'ebony']) expect(prose).toContain(s);
    // And none of them is written.
    for (const s of ['solo', 'black', 'peaches', 'ebony']) {
      expect(statements).not.toContain(`where slug = '${s}'`);
    }
  });

  it('records the hard-limits evidence, which is its own sibling', () => {
    // soft-limits publishes "flexible or negotiable"; hard-limits published
    // only "Boundaries in BDSM practices". The pair is the proof.
    expect(prose).toContain('soft-limits');
    expect(prose).toContain('NON-NEGOTIABLE');
  });

  it('records that the actor declaration is load-bearing for most of the tranche', () => {
    expect(statements).toContain("set_config('app.actor'");
    expect(sql).toContain('cannot be modified by system:trigger');
  });

  it('asserts the postcondition against the WRONG text, so a rival fix passes', () => {
    for (const d of DISOWNED) expect(verify).toContain(d);
  });

  it('counts the reached state positively, not the bad state', () => {
    expect(verify).toMatch(/if v_bad <> 21 then/);
  });

  it('names the deferrals, including the contaminated-evidence ones', () => {
    // `titica` and `zaddy` are unreachable for reasons that are not "we did not
    // get to them", and a later pass that loses the distinction will guess.
    expect(prose).toContain('the sweep overwrote the DESCRIPTION as well');
    expect(prose).toContain('Zaddy can be defined in two ways:');
    expect(prose).toContain('Under-reaching is the correct error');
  });

  it('records the duplicate-summary finding as a separate pass, not folded in', () => {
    expect(prose).toContain('A summary pasted onto several rows is worth its own pass');
    for (const s of ['priest', 'algolagnia', 'masochist']) expect(prose).toContain(s);
  });
});
