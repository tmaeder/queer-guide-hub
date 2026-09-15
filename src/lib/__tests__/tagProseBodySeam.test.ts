import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 80000101100000 — the body seam.
 *
 * WHAT THIS FILE EXISTS TO PRESERVE, each of which a later reader could undo
 * without noticing:
 *
 * 1. `description` IS NEVER WRITTEN. It is the evidence every repair rests on:
 *    the body is wrong *because the row's own description establishes another
 *    sense*. A pass that "tidied" the description too would destroy the only
 *    thing making the change defensible, and every other assertion here would
 *    still pass. `short_description` contains the substring `description`, so
 *    the assertion is word-boundary anchored.
 *
 * 2. THE TWO GROUPS STAY SEPARATE. Group A derives a body from a description
 *    that is a full paragraph; group B has a one-line description, states only
 *    what that supports, and NULLS the body. Merging them is how a later pass
 *    takes group A's licence and authors a body for a row with one line of
 *    evidence — the guess this whole class came from.
 *
 * 3. NULLED AND KEPT ARE BOTH ASSERTED. Nulling a derivable body is the exact
 *    mirror of leaving a wrong one, so the file checks three bodies are gone
 *    AND two survive.
 *
 * 4. `bedroom-submissive` IS A CONTROL, NOT AN OMISSION. It matched the same
 *    generated body template as electro-top and stone-top and is correct for
 *    its own description. A shared template is a place to look, never on its
 *    own a defect — and a file that repaired all three would have been wrong
 *    about one.
 *
 * 5. THE POSTCONDITION TESTS FOR THE WRONG TEXT, not for this file's wording,
 *    so a better fix written by someone else also satisfies it. That shape is
 *    what let earlier rounds be cut down when concurrent sessions repaired the
 *    same rows first, without any of them raising on main — where `db push`
 *    aborts on the first failing file and takes every migration behind it.
 *
 * 6. THE SEARCH-SCOPE PREMISE IS ASSERTED IN SQL, not just claimed in prose.
 *    "Body-only repairs cause zero search churn" is true only while
 *    `long_description` stays out of `trg_search_documents_tag`; the verify
 *    block reads pg_get_triggerdef and fails if that stops holding, so the
 *    header cannot quietly outlive its truth.
 */

const MIGRATION = join(process.cwd(), 'supabase/migrations/80000101100000_tag_prose_body_seam.sql');
const sql = readFileSync(MIGRATION, 'utf8');

/** Comment-stripped: the header quotes every defect it removes, so a raw-text
 *  assertion is satisfiable by the PROSE while the statement is gone. */
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const statements = bare.slice(0, bare.indexOf('do $verify$'));
const verify = bare.slice(bare.indexOf('do $verify$'));

/** Header prose, `--` stripped and whitespace collapsed, so an assertion on a
 *  sentence is not defeated by where the line happens to wrap. */
const prose = sql
  .split('\n')
  .filter((l) => l.trimStart().startsWith('--'))
  .map((l) => l.trim().replace(/^--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

describe('80000101100000 — the body seam', () => {
  it('declares an attributed actor, which is load-bearing on human_reviewed rows', () => {
    expect(statements).toMatch(
      /set_config\(\s*'app\.actor'\s*,\s*'admin:tag-prose-body-seam'\s*,\s*true\s*\)/,
    );
  });

  it('never writes `description` — the evidence the whole tranche rests on', () => {
    // \b so `short_description = ...` does not satisfy it.
    expect(statements).not.toMatch(/\bset\s+description\s*=/i);
    expect(statements).not.toMatch(/,\s*description\s*=/i);
  });

  describe('group A — a body is derived only where the description is a paragraph', () => {
    it('replaces the honorifics body and keeps the kink sense its description states', () => {
      expect(statements).toMatch(
        /set long_description = 'In kink, BDSM and power-exchange relationships an honorific[\s\S]*?where slug = 'honorifics'/,
      );
      // The examples come from the row's own description, not from the model.
      expect(statements).toMatch(/Daddy, Sir, Ma''am, Master and Mistress/);
    });

    it('guards the honorifics write on the generic-linguistic body it removes', () => {
      expect(statements).toMatch(
        /where slug = 'honorifics'[\s\S]*?long_description like 'Honorifics are titles, pronouns, or phrases used to show respect%'/,
      );
    });

    it('replaces the mademoiselle body with the D/s use its description sets out', () => {
      expect(statements).toMatch(
        /set long_description = 'Mademoiselle is the French honorific for Miss or young lady[\s\S]*?where slug = 'mademoiselle'/,
      );
      expect(statements).toMatch(/functions much as Mistress, Lady or Domina do/);
    });

    it('guards the mademoiselle write on the dictionary body it removes', () => {
      expect(statements).toMatch(
        /where slug = 'mademoiselle'[\s\S]*?long_description like 'Mademoiselle is a French honorific title used to address a young or unmarried woman%'/,
      );
    });
  });

  describe('group B — one-line descriptions mint nothing', () => {
    it.each([
      ['sensory-play', "long_description like '%Hi-5%'"],
      ['stone-top', "long_description like '%insertive partner during anal sex%'"],
    ])('nulls the %s body under its own content guard', (slug, guard) => {
      const stmt = statements.split(';').find((s) => s.includes(`slug = '${slug}'`));
      expect(stmt).toBeDefined();
      expect(stmt).toMatch(/set long_description = null/);
      expect(stmt).toContain(guard);
      // Group B authors no prose.
      expect(stmt).not.toMatch(/set long_description = '/);
    });

    it('rewrites the electro-top SUMMARY — the only wrong one of the five', () => {
      const stmt = statements.split(';').find((s) => s.includes("slug = 'electro-top'"));
      expect(stmt).toBeDefined();
      expect(stmt).toMatch(
        /set short_description = 'Someone who takes the active role in electrical play\.'/,
      );
      expect(stmt).toMatch(/long_description\s*=\s*null/);
      expect(stmt).toContain("long_description like '%insertive partner during anal sex%'");
    });

    it('leaves the other four summaries alone — they were already correct', () => {
      for (const slug of ['honorifics', 'mademoiselle', 'sensory-play', 'stone-top']) {
        const stmt = statements.split(';').find((s) => s.includes(`slug = '${slug}'`));
        expect(stmt).toBeDefined();
        expect(stmt).not.toMatch(/short_description\s*=/);
      }
    });
  });

  describe('postconditions', () => {
    it('asserts the WRONG text is gone, not this file’s own wording', () => {
      expect(verify).toMatch(/still publish the disowned body/);
      expect(verify).toContain(
        "long_description like 'Honorifics are titles, pronouns, or phrases used to show respect%'",
      );
      expect(verify).toContain("long_description like '%insertive partner during anal sex%'");
      // Never keyed on the replacement prose — that would RAISE on a better fix.
      expect(verify).not.toContain('In kink, BDSM and power-exchange relationships');
    });

    it('drives the children’s-TV cohort to zero CORPUS-WIDE, not just on these slugs', () => {
      // Anchored on the QUERY, not on the RAISE text: the comment-stripped
      // verify block's first mention of "children" is the message, and slicing
      // from there passes while the select is scoped to five slugs.
      const stmt = verify.split(';').find((s) => s.includes("ilike '%Hi-5%'"));
      expect(stmt).toBeDefined();
      expect(stmt).toMatch(/from public\.unified_tags/);
      expect(stmt).toMatch(/status = 'active'/);
      // The whole point is that it is NOT limited to this file's rows.
      expect(stmt).not.toMatch(/v_seam/);
      expect(stmt).not.toMatch(/slug in \(/);
      expect(verify).toMatch(/if v_bad <> 0 then[\s\S]*?children television show/);
    });

    it('counts the reached state POSITIVELY — a vacuous check passes on a vanished slug', () => {
      expect(verify).toMatch(/if v_bad <> 5 then[\s\S]*?carry a usable summary/);
    });

    it('asserts both directions on bodies: three nulled, two kept', () => {
      expect(verify).toMatch(/if v_bad <> 0 then[\s\S]*?group-B row\(s\) had a body minted/);
      expect(verify).toMatch(/if v_bad <> 2 then[\s\S]*?group-A rows carry usable prose/);
    });

    it('keeps the bedroom-submissive control', () => {
      expect(verify).toMatch(
        /slug = 'bedroom-submissive'[\s\S]*?if v_bad <> 1 then[\s\S]*?control lost its body/,
      );
    });

    it('asserts nothing fell below the thin-page gate', () => {
      expect(verify).toMatch(/not tag_has_prose\(description, short_description\)/);
      expect(verify).toMatch(/fell below the thin-page gate/);
    });

    it('asserts the no-search-churn premise against the live trigger', () => {
      expect(verify).toMatch(/pg_get_triggerdef\(oid\)/);
      expect(verify).toMatch(/tgname = 'trg_search_documents_tag'/);
      expect(verify).toMatch(
        /if position\('long_description' in v_trigdef\) > 0 then[\s\S]*?no-churn premise is void/,
      );
      // An absent trigger must not read as a clean scope.
      expect(verify).toMatch(/if v_trigdef is null then[\s\S]*?cannot verify search scope/);
    });
  });

  describe('the header records what a later pass would otherwise re-derive', () => {
    it('states that the metric is narrower than the defect', () => {
      expect(prose).toMatch(/Only 4 of the 5 rows sit inside/);
      expect(prose).toMatch(/151 -> 147/);
    });

    it('records the vacuous-probe trap that made the actor check read backwards', () => {
      expect(prose).toMatch(/produces an IDENTICAL value/);
      expect(prose).toMatch(/Verify a probe actually CHANGED something/);
    });

    it('names each deferral with the reason it cannot be reached', () => {
      for (const slug of ['slang-words', 'algolagnia', 'bastinado', 'peaches']) {
        expect(prose).toContain(slug);
      }
      expect(prose).toMatch(/under-reaching is the correct error/);
    });
  });
});
