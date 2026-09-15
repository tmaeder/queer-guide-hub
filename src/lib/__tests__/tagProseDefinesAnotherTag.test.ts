import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 83000101100000 — rows that publish the definition of a DIFFERENT live tag.
 *
 * WHAT THIS FILE EXISTS TO PRESERVE, each of which a later reader could undo
 * without noticing:
 *
 * 1. `description` IS NEVER WRITTEN. It is the evidence every repair rests on:
 *    the prose is wrong *because the row's own description establishes another
 *    sense*. A pass that "tidied" the description too would destroy the only
 *    thing making the change defensible, and every other assertion here would
 *    still pass. `short_description` contains the substring `description`, so
 *    the assertions are word-boundary anchored.
 *
 * 2. THE THREE GROUPS STAY SEPARATE. A derives a body from a full-paragraph
 *    description; B has a one-line description, states only what that supports
 *    and NULLS the body; C has no description at all and leans on the category
 *    plus the fact that the other reading has its own live row. Merging them is
 *    how a later pass takes A's licence and authors a body for a row with one
 *    line of evidence — the guess this whole class came from.
 *
 * 3. THE DUPLICATE-TAG COHORT IS NOT REPAIRED. The same query that found these
 *    nine also returned twelve morphological twins (dancing/dance,
 *    married/marriage, fetishist-style pairs of every kind). Their prose is
 *    CORRECT; they define the twin because they ARE the twin, which is a merge
 *    decision. Rewriting one side to make the two differ would paper over the
 *    duplicate, so this file must never grow an UPDATE for any of them.
 *
 * 4. FIVE IDENTIFIERS GO AND ONE STAYS. affection/asian/slave/
 *    bondage-and-discipline/fetishism each carry another live tag's Wikidata
 *    entity and are nulled, never repointed. `fetishist` keeps Q207791, which
 *    resolves to the RIGHT concept — there only the grain is wrong. Nulling it
 *    by reflex would also destroy its two medical codes, so both directions are
 *    asserted.
 *
 * 5. ONLY PROVABLE ALIASES ARE DELETED. The seventeen removed name the other
 *    entity outright (translations of *love*, eight that say "continent", a
 *    fetish-priest). The fifteen kept are ambiguous — German and French kink
 *    really do use "Sklave" and "esclave" for the role — and deleting those
 *    would take legitimate routing terms with them.
 *
 * 6. THE DEFERRALS ARE ENFORCEABLE, not merely written down. `humor` and
 *    `core-bdsm` are deliberately left standing and the migration asserts they
 *    still carry their defect text, so a later sweep reaching for them breaks
 *    this file's own check instead of quietly taking them.
 *
 * 7. THE POSTCONDITIONS TEST FOR THE WRONG TEXT, not for this file's wording,
 *    so a better fix written by someone else also satisfies them. That shape is
 *    what let earlier rounds be cut down when concurrent sessions repaired the
 *    same rows first, without any of them raising on main — where `db push`
 *    aborts on the first failing file and takes every migration behind it.
 *
 * 8. THE CONDITIONS THEMSELVES ARE COUNTED. Neutering `if v_bad <> 0` to
 *    `if v_bad < 0`, or short-circuiting a predicate with `where false`, leaves
 *    every string-anchored assertion green while the check has stopped
 *    checking. Both are refused here.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/83000101100000_tag_prose_defines_another_tag.sql',
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

/** Header prose, `--` stripped and whitespace collapsed, so an assertion on a
 *  sentence is not defeated by where the line happens to wrap. */
const prose = sql
  .split('\n')
  .filter((l) => l.trimStart().startsWith('--'))
  .map((l) => l.trim().replace(/^--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

/** The SET clause of each UPDATE — a "must not contain" anchored on the whole
 *  statement is satisfied by the content guard, which quotes the defect. */
const setClauses = statements
  .split(/\bupdate\s+public\./i)
  .slice(1)
  .map((s) => s.slice(0, s.search(/\bwhere\b/i)))
  .join('\n');

const GROUP_A = ['affection', 'bondage-and-discipline', 'gender-theory'];
const GROUP_B = ['slave', 'bully', 'sadomasochist', 'fetishist', 'fetishism'];
const GROUP_C = ['asian'];
const ALL_NINE = [...GROUP_A, ...GROUP_B, ...GROUP_C];

/** Returned by the same query and deliberately NOT repaired. */
const DUPLICATE_COHORT = [
  'dancing',
  'married',
  'divorced',
  'masturbating',
  'pansexual',
  'cross-dresser',
  'questioning-sexuality-and-gender',
  'small-penis-humiliation',
  'apparel',
  'hijra-south-asia',
  'sexual-orientation-and-gender-identity',
  'core-bdsm',
];

describe('83000101100000 — the row defines another live tag', () => {
  it('declares an attributed actor, load-bearing on eight human_reviewed rows', () => {
    expect(statements).toMatch(
      /set_config\(\s*'app\.actor'\s*,\s*'admin:tag-prose-defines-another-tag'\s*,\s*true\s*\)/,
    );
  });

  it('never writes `description` — the evidence the whole tranche rests on', () => {
    expect(setClauses).not.toMatch(/\bset\s+\bdescription\s*=/i);
    expect(setClauses).not.toMatch(/,\s*\bdescription\s*=/i);
  });

  it('repairs exactly the nine rows, and each write is content-guarded', () => {
    for (const slug of ALL_NINE) {
      expect(statements).toMatch(new RegExp(`slug = '${slug}' and status = 'active'`));
    }
    // Every prose UPDATE carries a `long_description like` guard on the defect it
    // removes, so a concurrent repair makes this a no-op rather than a conflict.
    const guards = statements.match(/and long_description like '/g) ?? [];
    expect(guards).toHaveLength(ALL_NINE.length);
  });

  describe('group A — a body is derived only where the description is a paragraph', () => {
    it('writes a non-null body for all three', () => {
      for (const slug of GROUP_A) {
        const stmt = statements
          .split(/\bupdate\s+public\./i)
          .find((s) => s.includes(`slug = '${slug}'`));
        expect(stmt).toBeDefined();
        expect(stmt).toMatch(/set short_description = '/);
        expect(stmt).toMatch(/long_description\s+= '/);
        expect(stmt).not.toMatch(/long_description\s+= null/);
      }
    });

    it('states the distinction the defect collapsed, in each of the three', () => {
      // Each replacement names the tag whose definition was being published, so
      // the page says what it is INSTEAD of the other one rather than merely
      // dropping the wrong text.
      expect(statements).toMatch(/not the same thing as love, which names the feeling/);
      expect(statements).toMatch(/separates B&D from bondage on its own/);
      expect(statements).toMatch(/not the same thing as gender studies/);
    });
  });

  describe('group B and C — state only what the evidence supports, null the body', () => {
    it('nulls the body on all six and authors none', () => {
      for (const slug of [...GROUP_B, ...GROUP_C]) {
        const stmt = statements
          .split(/\bupdate\s+public\./i)
          .find((s) => s.includes(`slug = '${slug}'`));
        expect(stmt).toBeDefined();
        expect(stmt).toMatch(/long_description\s+= null/);
      }
    });

    it('keeps the consent qualifier on `slave`, which is not decoration', () => {
      // A body about chattel slavery is being removed from a kink role page.
      expect(statements).toMatch(/consented to be owned within a power-exchange dynamic/);
    });

    it('chooses no sense on `asian`, whose description is NULL', () => {
      // It states only the root both live readings share and removes the one
      // reading that is false under all of them.
      expect(statements).toMatch(/Relating to Asia or to people of Asian heritage/);
    });
  });

  it('does NOT touch the duplicate-tag cohort the same query returned', () => {
    for (const slug of DUPLICATE_COHORT) {
      expect(statements).not.toMatch(new RegExp(`set[\\s\\S]*?where slug = '${slug}'`));
    }
  });

  describe('identifiers — five go, one stays', () => {
    it('nulls both identifier columns on exactly the five wrong-entity rows', () => {
      expect(statements).toMatch(/set wikidata_id = null, wikipedia_url = null/);
      for (const [slug, qid] of [
        ['affection', 'Q316'],
        ['asian', 'Q48'],
        ['slave', 'Q12773225'],
        ['bondage-and-discipline', 'Q273972'],
        ['fetishism', 'Q182116'],
      ] as const) {
        expect(statements).toMatch(new RegExp(`slug = '${slug}'\\s+and wikidata_id = '${qid}'`));
      }
    });

    it('never nulls fetishist — Q207791 is the right concept', () => {
      const idStmt = statements.slice(statements.indexOf('set wikidata_id = null'));
      expect(idStmt).not.toMatch(/'fetishist'/);
      expect(verify).toMatch(/t\.wikidata_id\s*=\s*'Q207791'/);
      expect(verify).toMatch(/tag_medical_codes/);
    });

    it('nulls rather than repoints — a wrong QID regenerates wrong data weekly', () => {
      expect(statements).not.toMatch(/set wikidata_id = 'Q/);
      expect(prose).toMatch(/NULLED, never repointed/);
    });

    it('writes nothing to tag_wikidata_repair_audit, the sentinel input', () => {
      expect(statements).not.toMatch(/insert into public\.tag_wikidata_repair_audit/i);
    });
  });

  describe('aliases — only the provable ones go', () => {
    it('deletes the seventeen that name the other entity', () => {
      for (const alias of ['amour', 'lieben', 'continent asiatique', 'continente de Asia']) {
        expect(statements).toMatch(new RegExp(`'${alias}'`));
      }
      expect(statements).toMatch(/religiöser Fetischismus/);
      expect(statements).toMatch(/féticheur/);
    });

    it('never deletes the ambiguous ones, which the kink vocabulary really uses', () => {
      const del = statements.slice(statements.indexOf('delete from public.tag_aliases'));
      for (const keep of [
        'Sklave',
        'esclave',
        'esclavo',
        'esclava',
        'Hängebondage',
        'fetichismo',
      ]) {
        expect(del).not.toMatch(new RegExp(`'${keep}'`));
      }
      // ...and the verify block asserts they are still there afterwards.
      expect(verify).toMatch(/expected the 15 ambiguous aliases to survive/);
    });

    it('only ever removes auto aliases, never an approved one', () => {
      const del = statements.slice(statements.indexOf('delete from public.tag_aliases'));
      expect(del).toMatch(/al\.review_status = 'auto'/);
    });
  });

  describe('provenance', () => {
    it('removes the wrong-entity sources on all six rows that carry them', () => {
      const del = statements.slice(
        statements.indexOf('delete from public.tag_sources'),
        statements.indexOf('delete from public.tag_aliases'),
      );
      for (const slug of [
        'affection',
        'asian',
        'slave',
        'bondage-and-discipline',
        'fetishism',
        'gender-theory',
      ]) {
        expect(del).toMatch(new RegExp(`t\\.slug = '${slug}'`));
      }
      // Keyed on the entity, never a blanket delete of the row's provenance.
      expect(del).not.toMatch(/t\.slug = 'fetishist'/);
    });
  });

  describe('postconditions', () => {
    it('tests for the WRONG text, so a concurrent better fix also satisfies it', () => {
      expect(verify).toMatch(/Love is an emotion involving strong attraction%/);
      expect(verify).toMatch(/Slavery refers to the ownership of a person as property%/);
      expect(verify).toMatch(/Asia is the largest continent%/);
    });

    it('counts the REACHED state positively, not rows in a bad state', () => {
      // A count of bad rows returns zero for a slug that has gone missing from
      // the corpus entirely, which is exactly what the soft guards let through.
      expect(verify).toMatch(/if v_bad <> 9 then/);
    });

    it('calls the real thin-page predicate instead of restating it', () => {
      expect(verify).toMatch(/public\.tag_has_prose\(description, short_description\)/);
      // A hand-rolled "both present" form fails on the description-IS-NULL row
      // and would read as a defect in the repair.
      expect(verify).not.toMatch(/description is not null and short_description is not null/);
    });

    it('asserts the counterpart rows keep their own prose', () => {
      expect(verify).toMatch(
        /'love','comedy','bullying','slavery','sadomasochism','gender-studies','bdsm'/,
      );
      expect(verify).toMatch(/if v_bad <> 7 then/);
    });

    it('makes the two deliberate deferrals enforceable', () => {
      expect(verify).toMatch(/slug = 'humor'\s+and long_description like 'Comedy is a genre/);
      expect(verify).toMatch(
        /slug = 'core-bdsm'\s+and long_description like 'BDSM refers to a range/,
      );
      expect(verify).toMatch(/if v_bad <> 2 then/);
    });

    it('asserts the search-scope premise against the live trigger definition', () => {
      expect(verify).toMatch(/pg_get_triggerdef/);
      expect(verify).toMatch(/v_trigdef is null/);
      expect(verify).toMatch(/position\('long_description' in v_trigdef\)/);
    });

    it('cannot be neutered by loosening a comparison or short-circuiting a predicate', () => {
      const comparisons = verify.match(/if v_bad [<>=]+ /g) ?? [];
      expect(comparisons).toHaveLength(14);
      for (const c of comparisons) expect(c).toBe('if v_bad <> ');
      expect(verify).not.toMatch(/\bwhere false\b/i);
      expect(verify).not.toMatch(/\band false\b/i);
      // every check must actually read a table
      const reads = verify.match(/select count\(\*\) into v_bad/g) ?? [];
      expect(reads).toHaveLength(14);
    });
  });
});
