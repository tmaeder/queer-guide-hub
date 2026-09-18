import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99200101100000 / 99200101100100 / 99200101100200 — the glossary
 * structural standard, its sentinel, and the only repair that needs no
 * judgement.
 *
 * WHAT THIS FILE EXISTS TO PRESERVE, each of which a later reader could undo
 * while every other check still passed:
 *
 * 1. NO PROSE IS WRITTEN OR REWRITTEN. The brief that produced these migrations
 *    asked for all 3,615 descriptions to be rewritten for consistency; that is
 *    the experiment this repo ran and retired when the tag prose judge retracted
 *    16 of its first 18 rows with 13 of them WRONG. The hygiene migration may
 *    only trim whitespace and NULL a timestamp. A single UPDATE that sets
 *    `description` to a literal is the whole failure returning, so the test
 *    asserts the shape of every write.
 *
 * 2. THE TRUNCATION RULE SURVIVES. 23 descriptions sit on the 500-char cap
 *    ending mid-clause. The tempting "standardization" is to append a full stop
 *    so every entry ends the same way — which converts a visibly incomplete
 *    entry into a plausibly complete one and destroys the only evidence the text
 *    was lost. The rule forbidding it must stay in the published standard.
 *
 * 3. BOTH REGISTERS STAY LEGAL. The corpus is bimodal: a label register ("Cute
 *    animal role") and a sentence register. ~982 rows correctly carry no
 *    terminal mark. A rule that demanded one register would rewrite a thousand
 *    correct rows, and would destroy the terse phrasing that ~20 prior prose
 *    passes read as evidence.
 *
 * 4. REGISTER IS NEVER MECHANICALLY ENFORCED. Length cannot tell a noun phrase
 *    from a sentence — the <60 band holds both "Cute animal role" and "A man who
 *    was assigned female at birth." — so no counter in the sentinel may score it.
 *
 * 5. INTERNAL NEWLINES SURVIVE THE TRIM. paragraphsHtml() splits crawler prose
 *    on them, so a trim that collapsed them would re-merge multi-paragraph
 *    entries into one blob — the defect 6d5e8a21f fixed across 13 call sites.
 *    Only [ \t]{2,} may be collapsed, never \n.
 *
 * 6. THE DISAMBIGUATION REGEX STAYS ANCHORED. A bare "(may|could) refer to" also
 *    matches pansexuality's correct "Pansexual people may refer to themselves as
 *    gender-blind". Verified live: anchored matches bicon + flamer only.
 *
 * 7. THE SENTINEL REPORTS ITS PROBE SEPARATELY AND IS service_role ONLY. An
 *    empty scan, a revoked grant and a clean corpus otherwise all return the
 *    same reassuring zeros; and a DEFINER aggregate granted to `authenticated`
 *    is granted to every member.
 */

const MIG_DIR = join(process.cwd(), 'supabase/migrations');
const STANDARD = join(MIG_DIR, '99200101100000_tag_prose_structural_standard.sql');
const SIGNALS = join(MIG_DIR, '99200101100100_tag_prose_standard_signals.sql');
const HYGIENE = join(MIG_DIR, '99200101100200_tag_description_deterministic_hygiene.sql');

/** Comment-stripped: every header here quotes the defect it removes verbatim, so
 *  a raw-text assertion is satisfiable by the PROSE while the statement is gone. */
const strip = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');

const standardSql = readFileSync(STANDARD, 'utf8');
const signalsSql = readFileSync(SIGNALS, 'utf8');
const hygieneSql = readFileSync(HYGIENE, 'utf8');

const standardBare = strip(standardSql);
const signalsBare = strip(signalsSql);
const hygieneBare = strip(hygieneSql);

const splitAt = (bare: string, marker = 'do $verify$') => {
  const i = bare.indexOf(marker);
  return { statements: bare.slice(0, i), verify: bare.slice(i) };
};

const HEALTH = join(process.cwd(), 'scripts/check-pipeline-health.mjs');
const healthSrc = readFileSync(HEALTH, 'utf8');
/** Just this sentinel's section, so an assertion cannot match a sibling check. */
const healthSection = (() => {
  const start = healthSrc.indexOf('rpc/tag_prose_standard_signals');
  return healthSrc.slice(start, start + 4000);
})();

const standard = splitAt(standardBare);
const signals = splitAt(signalsBare);
const hygiene = splitAt(hygieneBare);

describe('glossary structural standard — the rulebook', () => {
  it('adds all five structural rules, tag-scoped and active', () => {
    for (const slug of [
      'tag-field-contract',
      'tag-two-registers',
      'tag-never-punctuate-a-truncation',
      'tag-description-is-evidence',
      'tag-lead-is-not-an-encyclopedia-lead',
    ]) {
      expect(standard.statements).toContain(`'${slug}'`);
    }
    expect(standard.statements).toMatch(/array\['tag'\]/);
  });

  it('PUBLISHES — rows without a publish leave the fleet on the old prompt', () => {
    // LINE-ANCHORED on purpose. `strip` only removes comments at line START, so
    // a mid-line `-- _styleguide_publish_core(...)` leaves the call text intact
    // and a bare toMatch passes against a publish that no longer runs. This
    // requires it to be an executed statement. (Found by mutation M1.)
    expect(standard.statements).toMatch(/^\s*select\s+_styleguide_publish_core\(\s*'minor'/m);
  });

  it('calls the CORE, not the admin-gated publish (a migration carries no JWT)', () => {
    expect(standard.statements).not.toMatch(/\bstyleguide_publish\s*\(/);
  });

  it('asserts the PUBLISHED TEXT, not merely the rows', () => {
    // Asserting styleguide_rules passes in exactly the un-published state.
    expect(standard.verify).toMatch(/compiled_prompt\s+into\s+v_txt/);
    expect(standard.verify).toMatch(/position\(needle in v_txt\)\s*=\s*0/);
  });

  it('keeps the truncation rule in the text that ships', () => {
    expect(standard.verify).toContain('Never close a truncated definition');
    expect(standard.statements).toMatch(/Do not append a full stop/);
  });

  it('keeps BOTH registers legal and forbids converting between them', () => {
    expect(standard.statements).toMatch(/bare noun phrase with no closing full stop/);
    expect(standard.statements).toMatch(/Never convert an entry from one register to the other/);
  });

  it('keeps description as the evidence column', () => {
    expect(standard.statements).toMatch(/never rewritten to agree with the other fields/);
  });

  it('keeps the three-field contract substantive, not just its title', () => {
    // The title alone survives a body rewritten into "keep fields roughly equal
    // in length", which is the opposite instruction. (Found by mutation M24.)
    expect(standard.statements).toMatch(/Do not restate one field in another/);
    expect(standard.statements).toMatch(
      /do not move content between them to even out their lengths/,
    );
    expect(standard.statements).toMatch(/evidence of record for what the entry is about/);
  });

  it('is idempotent, so a concurrent styleguide edit cannot abort db push on main', () => {
    expect(standard.statements).toMatch(/on conflict\s*\(slug\)\s*do nothing/);
  });

  it('asserts the pre-existing tag rules survive', () => {
    expect(standard.verify).toContain('sex-is-described-plainly');
    expect(standard.verify).toContain('no-second-person-in-reference');
  });
});

describe('glossary structural standard — the sentinel', () => {
  it('reports the probe separately from the counts', () => {
    expect(signals.statements).toMatch(/'probe_ok',\s*true/);
    expect(signals.statements).toMatch(/'probe_ok',\s*false/);
    expect(signals.statements).toMatch(/'rows_scanned',\s*count\(\*\)/);
  });

  it('fails loudly rather than returning zeros when it cannot run', () => {
    expect(signals.statements).toMatch(/exception when others then/);
    expect(signals.verify).toMatch(/probe failed/);
  });

  it('refuses a scan that is not measuring the corpus', () => {
    expect(signals.verify).toMatch(/rows_scanned'\)::int,\s*0\)\s*<\s*1000/);
  });

  it('carries a POSITIVE CONTROL on the truncation counter', () => {
    // Zero here is indistinguishable from a repaired corpus, and nothing repairs these.
    expect(signals.verify).toMatch(/truncated_description'\)::int,\s*0\)\s*=\s*0/);
  });

  it('keeps the disambiguation regex ANCHORED so correct prose is not counted', () => {
    expect(signals.statements).toMatch(/\^\[\^\.!\?\]\{0,60\}\(may\|could\) refer to/);
    expect(signals.statements).not.toMatch(/where d ~\* '\(may\|could\) refer to'\)/);
  });

  it('is service_role only', () => {
    expect(signals.statements).toMatch(
      /revoke all on function public\.tag_prose_standard_signals\(\) from authenticated/,
    );
    expect(signals.statements).toMatch(
      /grant execute on function public\.tag_prose_standard_signals\(\) to service_role/,
    );
    expect(signals.verify).toMatch(/has_function_privilege\('authenticated'/);
  });

  it('does NOT score register conformance — grammar is not a regex', () => {
    // The word "register" legitimately appears in the rule name quoted by the
    // function comment, so this asserts there is no COUNTER KEY for it: the
    // jsonb_build_object keys are the only thing that could score a register.
    const keys = [...signals.statements.matchAll(/'([a-z_]+)',\s*count\(\*\)/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(k, `sentinel scores a register-shaped key: ${k}`).not.toMatch(
        /register|punctuat|sentence|label/,
      );
    }
  });

  it('is standalone, not a new key on tag_hygiene_stats', () => {
    expect(signals.statements).not.toMatch(/tag_hygiene_stats/);
  });
});

describe('glossary hygiene — the repair that needs no judgement', () => {
  it('writes NO prose: every description write is a trim or a NULL', () => {
    const sets = [...hygiene.statements.matchAll(/set\s+description\s*=\s*([^\n]+)/g)].map((m) =>
      m[1].trim(),
    );
    expect(sets.length).toBeGreaterThan(0);
    for (const rhs of sets) {
      const isTrim = /regexp_replace\(btrim\(/.test(rhs);
      const isNull = /^null\b/.test(rhs);
      expect(
        isTrim || isNull,
        `description is assigned something that is neither a trim nor NULL: ${rhs}`,
      ).toBe(true);
    }
  });

  it('never assigns a string literal to description (that is the retired rewrite)', () => {
    expect(hygiene.statements).not.toMatch(/set\s+description\s*=\s*'/);
  });

  it('trims with an EXPLICIT character set — bare btrim misses newlines', () => {
    // A first pass using bare btrim() found 12 rows and missed 7.
    expect(hygiene.statements).toMatch(/btrim\(\s*u?\.?description,\s*E' \\t\\n\\r'\s*\)/);
    expect(hygiene.statements).not.toMatch(/btrim\(u\.description\)/);
  });

  it('collapses only spaces and tabs, NEVER newlines', () => {
    // the class being collapsed is [ \t], never \s (which includes \n)
    expect(hygiene.statements).toMatch(/'\[ \\t\]\{2,\}',\s*' ',\s*'g'/);
    expect(hygiene.statements).not.toMatch(/'\[\\s\]\{2,\}'/);
    expect(hygiene.statements).not.toMatch(/'\\s\+',\s*' '/);
  });

  it('declares an actor — 13 of 19 target rows are human_reviewed', () => {
    expect(hygiene.statements).toMatch(
      /set_config\('app\.actor',\s*'admin:tag-description-deterministic-hygiene',\s*true\)/,
    );
  });

  it('guards the NULL on the stamp itself, so a human fix is never clobbered', () => {
    const nullStmt = hygiene.statements.slice(hygiene.statements.indexOf('set description = null'));
    expect(nullStmt).toMatch(/description ~\* '\^\(updated \)\?\[a-z\]\+/);
    expect(nullStmt).toMatch(/description ~\* 'updated \.\*\(am\|pm\)'/);
  });

  it('asserts the nulled rows stay publishable by CALLING the real predicate', () => {
    // tag_has_prose is an OR; a hand-rolled "both present" form fails on correct code.
    expect(hygiene.verify).toMatch(/not tag_has_prose\(description, short_description\)/);
  });

  it('carries the MIRROR assertion that content was not swept', () => {
    // "the whitespace is gone" is equally satisfied by a pass that flattened
    // everything. ANCHORED ON THE CONDITION, NOT THE MESSAGE IT PRINTS: every
    // slug here also appears in its own RAISE text, so a bare toMatch on the
    // verify block stays green when the WHERE clause is pointed at a row that
    // does not exist. (Found by mutation M19; CLAUDE.md records this class.)
    expect(hygiene.verify).toMatch(/where slug = 'pride-parade' and status = 'active'/);
    expect(hygiene.verify).toMatch(/description !~ '\\n'/);
    expect(hygiene.verify).toMatch(/where slug in \('bicon','flamer'\) and status = 'active'/);
  });

  it('does not repair the truncation cohort', () => {
    expect(hygiene.statements).not.toMatch(/length\(description\)\s*(=|in)\s*\(?500/);
    expect(hygiene.statements).not.toMatch(/\|\|\s*'\.'/);
  });

  it('every postcondition reads unified_tags and none is short-circuited', () => {
    const conds = [...hygiene.verify.matchAll(/if v_bad <> 0 then/g)];
    expect(conds.length).toBe(5);
    expect(hygiene.verify).not.toMatch(/where false/);
    expect(hygiene.verify).not.toMatch(/v_bad\s*(int)?\s*:=\s*0\s*;/);
    const reads = [...hygiene.verify.matchAll(/from unified_tags/g)];
    expect(reads.length).toBe(5);
  });
});

describe('glossary structural standard — the health gate', () => {
  it('treats a 404 as "not deployed yet", not as a clean corpus', () => {
    // This job builds the BRANCH but calls the LIVE backend, so a hard fail on a
    // missing RPC could only go green after the merge it blocks — a deadlock,
    // not a guard.
    expect(healthSection).toMatch(/res\.status === 404/);
    expect(healthSection).toMatch(/NOT DEPLOYED \(migration 99200101100100\)/);
    expect(healthSection).toMatch(/absence of a check, not absence of defects/i);
  });

  it('HARD-FAILS every other non-ok status — a broken probe is not a clean corpus', () => {
    const idx404 = healthSection.indexOf('res.status === 404');
    const idxElse = healthSection.indexOf('} else if (!res.ok) {');
    expect(idxElse).toBeGreaterThan(idx404);
    const broken = healthSection.slice(idxElse, healthSection.indexOf('} else {', idxElse));
    expect(broken).toMatch(/FAILED = true/);
  });

  it('keeps whitespace and stamp as hard failures, truncation as growth-gated', () => {
    expect(healthSection).toMatch(/zero-invariant since 99200101100200/);
    expect(healthSection).toMatch(/TRUNCATED_DESCRIPTION_CEILING/);
    // and the ceiling sits ABOVE the measured baseline of 23
    const m = healthSrc.match(/const TRUNCATED_DESCRIPTION_CEILING = (\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(23);
  });

  it('refuses a scan that measured nothing', () => {
    expect(healthSection).toMatch(/rows_scanned \?\? 0\) < 1000/);
  });

  it('never tells a reader to close a truncation with a full stop', () => {
    expect(healthSection).toMatch(/Do NOT "fix" these by appending a full stop/);
  });
});
