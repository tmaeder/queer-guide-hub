/**
 * Guards 99991790449537_glossary_piss_play_pass.sql — the piss play / watersports
 * comparison against nine external guides.
 *
 * Every assertion runs over COMMENT-STRIPPED source. The migration's header
 * quotes the defects it removes verbatim ("Term associated with sexual
 * preferences.", "specifics can vary widely", "Information on this topic is
 * limited") and names every refused row, so an unstripped `toContain` is
 * satisfied by the prose while the statement it is about has been deleted —
 * the vacuous-assertion class this repo has recorded repeatedly.
 *
 * Assertions are SCOPED to the half of the file they are about. Each content
 * guard quotes its own defect text in its WHERE clause AND the verify block
 * greps for the same string, so a file-wide assertion matches two or three
 * times and passes with any one of them removed.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991790449537_glossary_piss_play_pass';
const DIR = join(process.cwd(), 'supabase/migrations');

function source(): string {
  const file = readdirSync(DIR).find((f) => f.startsWith(MIGRATION));
  if (!file) throw new Error(`migration ${MIGRATION} not found in ${DIR}`);
  return readFileSync(join(DIR, file), 'utf8');
}

/** Strip line-start SQL comments only — a mid-line `--` may sit inside a literal. */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');
}

const raw = source();
const sql = stripComments(raw);
/** Everything before the verify block: the statements that mutate data. */
const statements = sql.split('do $verify$')[0];
/** The verify block alone. */
const verify = sql.slice(sql.indexOf('do $verify$'));

/**
 * The header prose as ONE line. A `toContain` on `raw` cannot match a sentence
 * the file wraps across two `--` lines, and that reads as a missing claim rather
 * than as a wrapped one — the trap this repo has recorded repeatedly.
 */
const prose = raw
  .split('\n')
  .filter((l) => /^\s*--/.test(l))
  .map((l) => l.replace(/^\s*--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

/**
 * The top-level UPDATE statements only. Splitting on `;` is wrong here: the
 * replacement prose contains semicolons of its own (the venue-dedup `[^;]*`
 * trap), and a plain `[\s\S]{0,N}` window reaches forward past the end of one
 * statement into the next — which is how the first draft of this file reported
 * a defect in correct code, because the merge block legitimately names
 * `urophilia` a few hundred characters after an unrelated UPDATE.
 */
const updates = statements
  .split(/^update unified_tags set/m)
  .slice(1)
  .map((chunk) => chunk.split(/^(?:update unified_tags set|insert into|delete from|do \$)/m)[0]);

describe('piss play pass — statements', () => {
  it('fills the flagship body only when it is NULL, so it can never overwrite prose', () => {
    const stmt = statements.slice(statements.indexOf("slug = 'golden-shower'") - 1400);
    expect(stmt).toContain('long_description is null');
    // The body must carry the two facts the nine sources contest, resolved the
    // clinical way, plus the risk-hierarchy endpoint no counting of pages gives.
    expect(statements).toContain('low in bacteria rather than sterile');
    expect(statements).toContain('not a route for HIV');
    expect(statements).toMatch(/eyes are the one place worth agreeing on/);
  });

  it('never asserts urine as an STI transmission route — the contested claim', () => {
    // Two sources disagree on this; the defensible fact is the test specimen.
    expect(statements).toContain('diagnosed from a urine sample');
    expect(statements).not.toMatch(/urine\s+(can\s+)?transmits?\b/i);
    expect(statements).not.toMatch(/transmissible through urine/i);
  });

  it('guards each says-nothing repair on its own defect text', () => {
    const slut = statements.slice(
      statements.indexOf("slug = 'piss-slut'") - 1000,
      statements.indexOf("slug = 'toilet-slave'"),
    );
    expect(slut).toContain("short_description = 'Term associated with sexual preferences.'");

    const slave = statements.slice(
      statements.indexOf("slug = 'toilet-slave'") - 900,
      statements.indexOf("slug = 'human-toilet'"),
    );
    expect(slave).toContain("long_description like '%specifics can vary widely%'");
  });

  it('removes the model-uncertainty tail from human-toilet', () => {
    const ht = statements.slice(statements.indexOf("slug = 'human-toilet'") - 700);
    expect(ht).toContain("like '%Information on this topic is limited%'");
  });

  it('fills watersports only when the summary is NULL', () => {
    const ws = statements.slice(statements.indexOf("slug = 'watersports'") - 300);
    expect(ws).toContain('short_description is null');
  });

  it('replaces the run-on description only while it is still a run-on', () => {
    const pp = statements.slice(statements.indexOf("slug = 'piss-play'") - 400);
    expect(pp).toContain('length(description) > 400');
  });

  it('merges urine-play into urophilia, soft on preconditions', () => {
    expect(statements).toContain('merge_tag_concept');
    // Direction: urophilia is the keep side. Getting this backwards would
    // destroy the alias hub and the correct identifier.
    expect(statements).toMatch(/v_keep\s+from unified_tags where slug = 'urophilia'/);
    expect(statements).toMatch(/v_drop\s+from unified_tags where slug = 'urine-play'/);
    // A concurrent session that already merged or deprecated either side must
    // no-op rather than abort db push for the whole repo.
    expect(statements).toContain('if v_keep is not null and v_drop is not null then');
  });

  it('deletes only the two adipose-tissue aliases, and only from scat', () => {
    const del = statements.slice(statements.indexOf('delete from tag_aliases'));
    expect(del).toContain("t.slug = 'scat'");
    expect(del).toContain("a.alias_slug in ('grasa-subcutnea','tejido-adiposo-subcutneo')");
  });

  it('creates the one row unpublished and writes all three category representations', () => {
    expect(statements).toContain("'Shy Bladder', 'shy-bladder'");
    // seo_indexable defaults to TRUE, so it must be written explicitly.
    expect(statements).toMatch(/'active', 'article', false/);
    // Neither category trigger fires on INSERT, so category text, category_id
    // and the junction row are all written by hand.
    expect(statements).toContain('c.id, c.name');
    // Anchored: a bare toContain is satisfied by `..._SKIPPED`, because the
    // table name is a PREFIX of it — the trap 99991789812141 recorded. A
    // mutation renaming the target survived until this lookahead was added.
    expect(statements).toMatch(/insert into tag_category_assignments(?![\w])/);
    expect(statements).toMatch(/where t\.slug = 'shy-bladder'/);
  });

  it('adds six approved synonym aliases and nothing auto', () => {
    const al = statements.slice(statements.indexOf('insert into tag_aliases'));
    expect(al).toContain("'synonym', 'approved'");
    expect(al).not.toContain("'auto'");
    for (const s of [
      'wetting',
      'desperation-play',
      'bladder-desperation',
      'paruresis',
      'pee-shy',
      'pee-shyness',
    ])
      expect(al).toContain(`'${s}'`);
    // tag_reject_alias_shadow would refuse an alias whose text is a tag name;
    // the insert guards for it rather than relying on the trigger to raise.
    expect(al).toContain(
      'not exists (select 1 from unified_tags x where lower(x.name) = lower(v.nm))',
    );
    expect(al).toContain('not exists (select 1 from tag_aliases a where a.alias_slug = v.sl)');
  });

  it('writes no prose column it does not name — piss-drinker is never a target', () => {
    // Round thirteen (77000101100000) protects piss-drinker's safety sentence.
    expect(statements).not.toContain("slug = 'piss-drinker'");
    // Exactly six UPDATE statements, and none of them targets a deferred row.
    // Asserted per statement, not over a character window: `urophilia` DOES
    // appear in the merge block, which is correct, and a windowed regex
    // conflates the two.
    expect(updates).toHaveLength(6);
    for (const u of updates) {
      // urophilia's accurate etymology body is deliberately not rewritten;
      // toilet names two senses and is deferred; scat's NULL body is not
      // filled, only its aliases are touched.
      expect(u).not.toContain("slug = 'urophilia'");
      expect(u).not.toContain("slug = 'toilet'");
      expect(u).not.toContain("slug = 'scat'");
      expect(u).not.toContain("slug = 'piss-drinker'");
    }
    // Every UPDATE is content-guarded, so none can fire twice or overwrite a
    // concurrent session's better fix.
    for (const u of updates) expect(u).toMatch(/\bwhere slug = '[a-z-]+'/);
  });
});

describe('piss play pass — postconditions', () => {
  it('is soft on preconditions: a moved corpus reports a floor, not an abort', () => {
    expect(verify).toMatch(/if v_scope < 7 then/);
    expect(verify).toContain('refusing to report success');
  });

  it('asserts the REACHED publication state, not the requested one', () => {
    // The readiness gate demotes a new row to utility because three of its six
    // conditions default to pending/NULL. The first draft asserted 'article'
    // and failed on correct code.
    expect(verify).toContain("publication_role = 'utility'");
    expect(verify).toContain("seo_deindex_reason = 'publication_role:utility'");
    expect(verify).toContain('seo_indexable = false');
  });

  it('calls the real thin-page predicate rather than restating its OR', () => {
    expect(verify).toContain('not tag_has_prose(description, short_description)');
    // Restating it as an AND is a different, stricter check that would fail on
    // rows whose description is deliberately absent (round eleven).
    expect(verify).not.toMatch(/description is not null\s+and\s+short_description is not null/);
  });

  it('requires the merge target to be ACTIVE, not merely present', () => {
    expect(verify).toMatch(/k\.slug = 'urophilia'\s+and k\.status = 'active'/);
    expect(verify).toMatch(/d\.status = 'merged'/);
  });

  it('states the purpose positively — a missing row cannot satisfy a filled count', () => {
    expect(verify).toMatch(/if v_empty <> 2 then/);
    expect(verify).toMatch(/if v_new <> 1 then/);
    expect(verify).toMatch(/if v_cats <> 1 then/);
    expect(verify).toMatch(/if v_aliases <> 6 then/);
  });

  it('checks the replacement is readable rather than merely shorter', () => {
    expect(verify).toContain('length(description) < 300');
    expect(verify).toContain("description like '%Watersports%'");
    expect(verify).toContain("description like '%urophilia%'");
  });

  it('makes all four refusals enforceable', () => {
    expect(verify).toMatch(/if v_refusals <> 4 then/);
    for (const needle of [
      "slug = 'piss-drinker' and long_description like '%health risks if not practiced safely%'",
      "slug = 'urophilia'    and long_description like '%lagneia%'",
      "slug = 'toilet'       and long_description like '%sanitary hardware%'",
      "slug = 'scat-play'    and long_description like '%faecal-oral route%'",
    ])
      expect(verify).toContain(needle);
  });

  it('PROVES the scope with a snapshot rather than asserting it', () => {
    expect(sql).toContain('create temporary table _piss_before');
    expect(verify).toContain('from _piss_before b join unified_tags t on t.slug = b.slug');
    expect(verify).toMatch(/if v_collat <> 0 then/);
    // Each column's exemption list must name exactly the rows this file writes.
    expect(verify).toContain("b.slug not in ('piss-play')");
    expect(verify).toContain("b.slug not in ('piss-slut','watersports')");
    expect(verify).toContain(
      "b.slug not in ('golden-shower','piss-slut','toilet-slave','human-toilet')",
    );
  });

  it('cannot be neutered by a loosened comparison or a pre-seeded counter', () => {
    // Every postcondition compares with <> or <, never a sign test that a
    // zero-initialised counter satisfies (round twelve).
    expect(verify).not.toMatch(/if v_\w+ < 0 then/);
    expect(verify).not.toMatch(/where false/);
    // No DECLARE initialiser: `v_x int := 0` makes an unset counter pass.
    expect(verify).not.toMatch(/v_\w+\s+int\s*:=/);
    // Nine of the checks must actually read the table they are about.
    const reads = (verify.match(/from unified_tags/g) ?? []).length;
    expect(reads).toBeGreaterThanOrEqual(7);
  });
});

describe('piss play pass — sources', () => {
  it('records all nine sources and which needed a fallback', () => {
    for (const host of [
      'allure.com',
      'burnettfoundation.org.nz',
      'go3fun.co',
      'badkity.com',
      'gays.com',
      'pulse-clinic.com',
      'fetish.com',
      'kinkacademy.com',
      'zippermagazine.com',
    ])
      expect(raw).toContain(host);
    expect(raw).toContain('r.jina.ai');
  });

  it('records the two weighting caveats that changed the outcome', () => {
    // A service-provider page is not a guide, and two sources are derivative.
    // Asserted over joined prose: both claims wrap across comment lines.
    expect(prose).toContain('badkity.com is a femdom session-provider page');
    expect(prose).toContain('NOT independent voices');
    // Without the second caveat a piggy-play row would have looked corroborated.
    expect(prose).toContain('piggy play');
  });

  it('records both contested facts and refuses to publish them as settled', () => {
    expect(prose).toContain('TWO FACTS ARE CONTESTED');
    expect(prose).toContain('never asserts urine as a transmission route');
    expect(prose).toContain('LOW IN BACTERIA RATHER THAN STERILE');
  });

  it('names what it declined to create, so a later pass does not re-propose it', () => {
    expect(raw).toContain('piss-pig');
    expect(raw).toContain('urophagia');
  });
});
