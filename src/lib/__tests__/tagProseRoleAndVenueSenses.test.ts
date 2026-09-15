import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards `62000101163000`, round seven of the disowned-prose backlog.
 *
 * The assertions are not "did it write my wording". They are the five places a
 * 13-row batch can do harm:
 *
 *   1. `description` must never be written — it is the evidence that justified
 *      every repair here, and six of these rows were only repairable BECAUSE
 *      their description spells out the kink sense.
 *   2. Every UPDATE must be content-guarded on the defect's own text, so a
 *      concurrent session that fixes a row first is not overwritten.
 *   3. Postconditions must test for the WRONG text, never for this file's own
 *      wording — the defect 61000101174500 nearly shipped, where asserting
 *      `long_description IS NULL` would have RAISEd on somebody else's better
 *      fix and aborted `db push` on main.
 *   4. The three single-field rows must keep the half that is already correct.
 *   5. The five deliberate deferrals must stay reported, so the next pass can
 *      tell "deferred" from "fixed".
 */

const FILE = join(
  process.cwd(),
  'supabase/migrations/62000101163000_tag_prose_role_and_venue_senses.sql',
);

const sql = readFileSync(FILE, 'utf8');

/** Statements only — a claim made in a comment is not a guard. */
function statements(): string {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

/** The UPDATE statements, split so an assertion can be scoped to one. */
function updates(): string[] {
  return statements()
    .split(/update\s+unified_tags/i)
    .slice(1)
    .map((u) => u.slice(0, u.indexOf(';')));
}

/**
 * The postcondition block ONLY.
 *
 * Load-bearing: every defect string appears TWICE in this file — once in an
 * UPDATE's content guard and once in the postcondition. An assertion over the
 * whole file therefore matches the guard and passes even when the
 * postcondition has been gutted, which mutation testing caught on two
 * assertions here. Scope to the half of the file the assertion is about.
 */
function verifyBlock(): string {
  const i = statements().indexOf('do $verify$');
  expect(i).toBeGreaterThan(-1);
  return statements().slice(i);
}

describe('role and venue senses migration', () => {
  const code = statements();

  it('declares an actor, which the audit trigger requires', () => {
    // 11 of 13 rows are human_reviewed, and log_unified_tag_change() RAISEs
    // when a `system:%` actor modifies one.
    expect(code).toMatch(/set_config\(\s*'app\.actor'\s*,\s*'migration:62000101163000'/);
  });

  it('never writes description', () => {
    const us = updates();
    expect(us.length).toBe(13);
    for (const u of us) {
      const setClause = u.slice(0, u.search(/\bwhere\b/i));
      // `short_description` / `long_description` must not satisfy this.
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

  it('keeps the correct half on the three single-field rows', () => {
    // down-low + alpha-pet: body only. Their summaries already agree with
    // their own descriptions, so touching them would be a rewrite, not a fix.
    for (const slug of ['down-low', 'alpha-pet']) {
      const u = updates().find((x) => x.includes(`slug = '${slug}'`));
      expect(u, slug).toBeDefined();
      expect(u, slug).toMatch(/long_description\s*=\s*null/);
      expect(u, slug).not.toMatch(/short_description\s*=/);
    }
    // older-women: summary only. Its body is ALREADY null, so a
    // `long_description = null` here would be a write that changes nothing
    // while looking like a repair.
    const ow = updates().find((x) => x.includes("slug = 'older-women'"));
    expect(ow).toBeDefined();
    expect(ow).toMatch(/short_description\s*=/);
    expect(ow).not.toMatch(/long_description\s*=/);
  });

  it('tests for the WRONG text, not for its own wording', () => {
    // Scoped to the postcondition: these strings also occur in the UPDATE
    // guards, so asserting over the whole file passes with the postcondition
    // re-pinned to this file's own output — which mutation testing proved.
    const verify = verifyBlock();
    expect(verify).toMatch(/'Person who owns a pet'/);
    expect(verify).toMatch(/'Women aged 50\+'/);
    expect(verify).toMatch(/'Hair that grows past the shoulder'/);
    // ...and never for the replacements it happens to write.
    expect(verify).not.toMatch(/A gift or sacrifice\./);
    expect(verify).not.toMatch(/Intense, physically forceful sex\./);
    expect(verify).not.toMatch(/The Dominant or caretaker role/);
  });

  it('asserts the wrong-subject BODIES are gone, keyed on the defect', () => {
    // Anchor on the guard's own first LIKE pattern, NOT on the raise message:
    // the phrase "disowned-entity body" appears inside that message, so
    // slicing from it skips the `raise exception` that precedes it and the
    // assertion reads as failing against correct code.
    // Scoped to the postcondition for the same reason as above: every one of
    // these patterns also appears in an UPDATE's content guard.
    const guard = verifyBlock();
    expect(guard).toMatch(/An odor or scent is a smell caused by%/);
    expect(guard).toMatch(/An adventure is a novel and exciting undertaking%/);
    expect(guard).toMatch(/Feedee refers to a fetishism of gaining weight%/);
    expect(guard).toMatch(/BDSM refers to a range of erotic practices%/);
    expect(guard).toMatch(/The term Down-Low has several meanings%/);
    expect(guard).toMatch(/A pet owner is an individual who has a pet%/);
    // ...and the block must actually ABORT, not merely compute a count.
    expect(guard).toMatch(/raise exception '% disowned-entity body\/bodies still live'/);
  });

  it('asserts every touched row stays above the thin-page gate', () => {
    // Without this, "nulling the body is safe" is only a convention.
    expect(code).toMatch(/not tag_has_prose\(description,\s*short_description\)/);
    expect(code).toMatch(/raise exception '% row\(s\) fell below the thin-page gate'/);
  });

  it('asserts the description it reasoned from is still present', () => {
    expect(code).toMatch(/and description is null/);
    expect(code).toMatch(/lost the description this file reasoned from/);
  });

  it('still names every deliberate deferral, each with its own reason', () => {
    // A pass that silently stopped reporting these would make the next pass
    // unable to tell "deferred" from "fixed".
    expect(code).toMatch(/'reynard','pet'/);
    expect(code).toMatch(/warlord disposition/);
    expect(code).toMatch(/slug = 'bicon'/);
    expect(code).toMatch(/disambiguation list/);
    expect(code).toMatch(/slug = 'accipiosexual'/);
    expect(code).toMatch(/the queen rule/);
    expect(code).toMatch(/generic-dictionary-sense/);
    // Assert the CONDITION, not the notice MESSAGE. A mutation that neuters
    // the WHERE clause leaves the message string intact, so matching on
    // "mythology-on-a-role" alone passes against a report that can never
    // fire — which mutation testing proved.
    const verify = verifyBlock();
    expect(verify).toMatch(
      /slug in \('dragon','fairy','familiar','genie','goblin','god','goddess','mermaid','succubus','unicorn','zombie','satyress'\)/,
    );
    expect(verify).toMatch(
      /slug in \('jarl','king','knight','lord','mister','mademoiselle','priestess','squire','tyrant','huntress'\)/,
    );
    expect(verify).toMatch(/mythology-on-a-role/);
    expect(verify).toMatch(/title-on-a-role/);
  });

  it('does not touch rows the previous tranches already repaired', () => {
    // Repairing one row twice is how db push ends up asserting a state neither
    // migration reached.
    for (const slug of ['masc', 'girl', 'boy', 'cunt', 'whore', 'scat', 'submission', 'mommy']) {
      for (const u of updates()) expect(u, slug).not.toContain(`'${slug}'`);
    }
  });

  it('repairs rough-sex, whose body defines a DIFFERENT live tag', () => {
    const u = updates().find((x) => x.includes("slug = 'rough-sex'"));
    expect(u).toBeDefined();
    // Its body was the definition of BDSM, which is its own row — so the
    // corpus stated BDSM twice and the rough-sex page said nothing.
    expect(u).toMatch(/short_description\s*=/);
    expect(u).toMatch(/long_description\s*=\s*null/);
    expect(u).toMatch(/Erotic practices involving domination and sadomasochism/);
  });
});
