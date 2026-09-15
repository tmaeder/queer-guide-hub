import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards `61000101174500`, round six of the disowned-prose backlog.
 *
 * Three groups, and the assertions differ because the justifications differ:
 *
 *   A. `masc`, `girl`, `boy` carry the gamete-essentialism prose that
 *      51500101143000 already removed from `woman`, while `femme` — masc's
 *      exact counterpart — was fixed. styleguide_terms rates that register
 *      `never`. So the test asserts the bodies are nulled AND that the
 *      migration keeps reporting on the sibling rows it mirrored, because if
 *      `woman` or `femme` regressed the precedent this file leans on is gone.
 *   B. `whore` published "Prostitution involves…" — a `never`-severity avoid
 *      term — on a row whose own description says "Promiscuous person".
 *   C. 22 namesake artifacts, the 51700101143000 class.
 *
 * As in every pass: `description` is the evidence and must never be written,
 * and nulling a body must not drop a row below the thin-page gate.
 */

const FILE = join(
  process.cwd(),
  'supabase/migrations/61000101174500_tag_prose_essentialism_and_namesakes.sql',
);

const sql = readFileSync(FILE, 'utf8');

/** Statements only — a claim made in a comment is not a guard. */
function statements(): string {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

function updates(): string[] {
  return statements()
    .split(/update\s+unified_tags/i)
    .slice(1)
    .map((u) => u.slice(0, u.indexOf(';')));
}

describe('essentialism and namesakes migration', () => {
  const code = statements();

  it('declares an actor, which the audit trigger requires', () => {
    expect(code).toMatch(/set_config\(\s*'app\.actor'\s*,\s*'migration:61000101174500'/);
  });

  it('never writes description', () => {
    const us = updates();
    expect(us.length).toBeGreaterThanOrEqual(30);
    for (const u of us) {
      const setClause = u.slice(0, u.search(/\bwhere\b/i));
      expect(setClause).not.toMatch(/(^|[\s,])description\s*=/);
      expect(setClause).toMatch(/(short_description|long_description)\s*=/);
    }
  });

  it('guards every repair on the defect’s own text', () => {
    for (const u of updates()) {
      const where = u.slice(u.search(/\bwhere\b/i));
      expect(where).toMatch(/and\s+(short_description|long_description)\s*(=|like)/);
    }
  });

  it('strips the essentialist body from all three identity rows', () => {
    for (const slug of ['masc', 'girl', 'boy']) {
      const u = updates().find((x) => x.includes(`slug = '${slug}'`));
      expect(u, slug).toBeDefined();
      expect(u, slug).toMatch(/long_description\s*=\s*null/);
    }
    // ...and hard-fails while any of them survives.
    expect(code).toMatch(/slug in \('masc','girl','boy'\)/);
    expect(code).toMatch(
      /raise exception '% identity row\(s\) still publish the essentialist body'/,
    );
  });

  it('asserts the essentialist DEFECT is gone, not that this file nulled the body', () => {
    // 60000301100100 (#3716) repairs `masc` too, and better: it writes a real
    // body where this file nulls one. It sorts below this file, so it applies
    // first and this file's UPDATE no-ops. A bare `long_description is not
    // null` check would then RAISE on somebody else's better fix and abort
    // db push on main — which is why the check is keyed on the defect text.
    const guard = code.slice(code.indexOf("slug in ('masc','girl','boy')"));
    expect(guard.slice(0, 400)).toMatch(/In biological terms/);
    expect(guard.slice(0, 400)).toMatch(/A boy is a male human being in the early stages of life/);
  });

  it('keeps reporting on the sibling rows its wording was mirrored from', () => {
    // If `woman` or `femme` regressed, part A's precedent is gone and somebody
    // should be told — but it is not this migration's to enforce, so notice.
    expect(code).toMatch(/slug = 'woman'/);
    expect(code).toMatch(/slug = 'femme'/);
    expect(code).toMatch(/woman no longer carries the repaired summary/);
    expect(code).toMatch(/femme no longer carries the repaired summary/);
  });

  it('repairs the two rows that described sex work', () => {
    for (const slug of ['whore', 'floozy']) {
      const u = updates().find((x) => x.includes(`slug = '${slug}'`));
      expect(u, slug).toBeDefined();
      // Derived from each row's own description, which says "Promiscuous person".
      expect(u, slug).toMatch(/A promiscuous person\./);
    }
    // The body carrying the `never`-severity avoid term must be gone.
    expect(code).toMatch(/Prostitution involves engaging in sexual activity%/);
  });

  it('asserts every touched row stays above the thin-page gate', () => {
    expect(code).toMatch(/not tag_has_prose\(description,\s*short_description\)/);
    expect(code).toMatch(/raise exception '% row\(s\) fell below the thin-page gate'/);
  });

  it('asserts the description it reasoned from is still present', () => {
    expect(code).toMatch(/and description is null/);
    expect(code).toMatch(/lost the description this file reasoned from/);
  });

  it('touches only the body on submission, whose summary is already correct', () => {
    const u = updates().find((x) => x.includes("slug = 'submission'"));
    expect(u).toBeDefined();
    expect(u).toMatch(/long_description\s*=\s*null/);
    expect(u).not.toMatch(/short_description\s*=/);
  });

  it('tests for the WRONG text, not for its own wording', () => {
    expect(code).toMatch(/'Subcutaneous fat tissue'/);
    expect(code).toMatch(/'Rents or leases property to tenants'/);
    expect(code).toMatch(/'Term for a partner in a polyamorous relationship'/);
    expect(code).not.toMatch(/short_description\s*=\s*'A guardian role\.'\s*\)/);
  });

  it('still names the classes it deliberately left', () => {
    expect(code).toMatch(/'goat','frog','bunny'/);
    expect(code).toMatch(/zoology-on-a-role/);
    expect(code).toMatch(/'butler','poppet','doll','catboy','hedonist','freak'/);
    expect(code).toMatch(/generic-dictionary-sense/);
  });

  it('does not touch rows the previous two rounds already repaired', () => {
    // 51700101143000 took 50 rows and 51500101160000 took three. Repairing one
    // row twice is how db push ends up asserting a state neither reached.
    for (const slug of ['domme', 'schoolgirl', 'stone-top', 'collar', 'rooftop', 'casual']) {
      for (const u of updates()) expect(u, slug).not.toContain(`'${slug}'`);
    }
  });
});
