import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 51500101144000 — round three of the disowned-prose backlog that
 * `tag_disowned_prose_signals()` counts (352 surviving summaries when this was
 * authored, with round two merged but not yet applied).
 *
 * 64 candidates were hand-read by usage; 11 qualified under the same rule both
 * previous rounds used — repair ONLY where the row's own `description`
 * establishes a sense the short/long description contradict. The disowned
 * entities turn out to cluster: four are PLACES (`ally` → a commune in Cantal,
 * `baby` → a commune in Seine-et-Marne, `coven` → Coventry University,
 * `reading` → a market town in Berkshire), `nudist` is a nude BEACH sitting
 * under a summary that says "a person, not a place", and the rest are a band,
 * a TV show and a mammal family.
 *
 * The load-bearing assertions:
 *
 *  1. `description` is NEVER written — it is the evidence that justified every
 *     repair, so writing it would change what licensed the change.
 *  2. `queen` is NULLED, not rewritten. Three signals disagree about its sense
 *     (`description` says monarch, `category` says Slang & Language, the queer
 *     glossary sense is drag), so the false claim is removed and no vocabulary
 *     is minted. A test that merely checks queen is "handled" would pass
 *     against a version that picked one.
 *  3. The actor is DECLARED. Nine of the eleven rows are `human_reviewed`, and
 *     `log_unified_tag_change()` RAISEs for a `system:%` actor — verified live,
 *     not assumed: the undeclared UPDATE returns "human_reviewed tag ... cannot
 *     be modified by system:trigger".
 *  4. Every UPDATE is content-guarded on the defect's own text, so a human who
 *     fixes one first keeps their work.
 *  5. The newline check uses position(), not LIKE. In a LIKE pattern the
 *     backslash is the ESCAPE character, so `like '%\n%'` means "contains the
 *     letter n" — the defect 50900101100000 shipped and caught on its own dry
 *     run.
 *
 * Assertions run against COMMENT-STRIPPED SQL: the header quotes the wrong
 * prose being removed verbatim, so a bare toContain over the raw file would
 * pass with the real statement deleted.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const FILE = '51500101144000_tag_prose_wrong_subject_round_three.sql';

const raw = readFileSync(join(MIGRATIONS, FILE), 'utf8');

/** Line comments only; this file uses no block comments. */
const sql = raw
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

/** The statements only — cuts before the verify block, whose own predicates
 *  echo every guard and would otherwise satisfy assertions about them. */
const statements = sql.slice(0, sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

const stmtFor = (slug: string): string => {
  const i = statements.indexOf(`where slug = '${slug}'`);
  expect(i, `no statement for ${slug}`).toBeGreaterThan(-1);
  const start = statements.lastIndexOf('update public.unified_tags', i);
  expect(start).toBeGreaterThan(-1);
  return statements.slice(start, statements.indexOf(';', i));
};

/** slug -> the defect text its UPDATE must be guarded on. */
const GUARDED: Array<[string, string]> = [
  ['nudist', "long_description like 'A nude beach is a beach%'"],
  ['ally', "long_description like 'The commune of Ally%'"],
  ['bear', "long_description like 'Bears are carnivoran mammals%'"],
  ['big-brother', "long_description like 'Big Brother is an American television%'"],
  ['shame', "long_description like 'Shame is a British musical group%'"],
  ['reading', "long_description like 'Reading is a historic market town%'"],
  ['baby', "long_description like 'Baby is a commune%'"],
  ['coven', "long_description like 'Coventry University is a public research university%'"],
  ['femme', "long_description like 'Femme refers to a lesbian woman%'"],
  [
    'butch',
    "long_description like 'Butch can refer to a person, often with masculine traits, and is also a male given name%'",
  ],
  ['queen', "long_description like 'The term Queen can refer to a British rock band%'"],
];

describe('51500101144000 — glossary prose round three', () => {
  it('repairs exactly the eleven hand-read rows', () => {
    for (const [slug] of GUARDED) expect(stmtFor(slug)).toBeTruthy();
    const updates = statements.match(/update public\.unified_tags/g) ?? [];
    expect(updates).toHaveLength(GUARDED.length);
  });

  it('guards every UPDATE on the defect its own row carries', () => {
    for (const [slug, guard] of GUARDED) {
      expect(stmtFor(slug), `${slug} is not content-guarded`).toContain(guard);
    }
  });

  it('scopes every UPDATE to one slug and to active rows', () => {
    for (const [slug] of GUARDED) {
      const stmt = stmtFor(slug);
      expect(stmt).toContain(`where slug = '${slug}'`);
      expect(stmt, `${slug} may repair a non-active row`).toContain("status = 'active'");
    }
  });

  it('never writes description — it is the evidence for every repair', () => {
    expect(statements).not.toMatch(/set\s+description\s*=/);
    expect(statements).not.toMatch(/,\s*description\s*=/);
  });

  it('nulls queen rather than choosing a sense for it', () => {
    const stmt = stmtFor('queen');
    expect(stmt).toMatch(/set long_description = null/);
    expect(stmt).not.toMatch(/short_description\s*=/);
    // and the postcondition insists on it, so a later edit that fills the body
    // fails rather than silently publishing a guess
    expect(verify).toContain("slug = 'queen'");
    expect(verify).toMatch(/queen\.long_description is not null/);
  });

  it('fills ally and bear summaries but leaves the other bodies summary-only', () => {
    // ally's short_description was NULL; filling a null is not the LLM rewrite
    // both auto-apply paths were retired for.
    for (const slug of ['ally', 'bear', 'femme', 'butch']) {
      expect(stmtFor(slug), `${slug} should set a summary`).toMatch(/short_description\s*=/);
    }
    for (const slug of ['nudist', 'big-brother', 'shame', 'reading', 'baby', 'coven']) {
      expect(stmtFor(slug), `${slug} should touch the body only`).not.toMatch(
        /short_description\s*=/,
      );
    }
  });

  it('declares a non-system actor — nine of the eleven rows are human_reviewed', () => {
    expect(statements).toMatch(/set_config\(\s*'app\.actor'\s*,\s*'admin:[^']+'/);
    expect(statements).not.toMatch(/'system:/);
  });

  it('asserts the defect is gone rather than that this file wrote the prose', () => {
    // Every guarded defect string reappears in the postcondition...
    for (const [, guard] of GUARDED) {
      const text = guard.slice(guard.indexOf("'"));
      expect(verify, `postcondition does not cover ${text}`).toContain(text);
    }
    // ...and the failure is an exception, not a notice.
    expect(verify).toMatch(/raise exception '[^']*still publish the disowned entity/);
  });

  it('tests for a literal backslash-n with position(), never LIKE', () => {
    expect(verify).toMatch(/position\('\\n' in/);
    expect(verify).not.toMatch(/like '%\\n%'/);
    expect(verify).toMatch(/raise exception '[^']*literal backslash-n/);
  });

  it('reports what it does not own instead of aborting the push', () => {
    // lion and gym were named as untouched by the previous rounds; a human
    // legitimately fixing one must not break db push for the whole repo.
    const lionBlock = verify.slice(verify.indexOf("'lion'"));
    expect(lionBlock).toMatch(/raise notice/);
    expect(verify.slice(verify.indexOf("'lion'"), verify.indexOf("'lion'") + 400)).not.toMatch(
      /raise exception/,
    );
  });

  it('records that ally and queen keep a generic description as a separate decision', () => {
    expect(verify).toMatch(/raise notice '[^']*separate decision/);
  });
});
