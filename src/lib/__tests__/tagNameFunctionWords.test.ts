import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const FILE = '83000101143000_tag_name_function_words.sql';

/**
 * Comment-stripped. The header quotes every string the guards look for — the
 * wrong forms ("Convention On The Rights Of Persons With Disabilities"), the
 * protected rows ("Hepatitis A", "Strap On", "Dine-In") and the rung order
 * itself — so a `toContain` over raw source passes with the statement deleted.
 */
const statementsOf = (file: string): string =>
  readFileSync(join(MIGRATIONS, file), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

const applyBlockOf = (file: string): string => {
  const sql = statementsOf(file);
  const end = sql.toLowerCase().indexOf('do $verify$');
  expect(end).toBeGreaterThan(0);
  return sql.slice(0, end);
};

const verifyBlockOf = (file: string): string => {
  const sql = statementsOf(file);
  const start = sql.toLowerCase().indexOf('do $verify$');
  expect(start).toBeGreaterThan(0);
  return sql.slice(start);
};

const apply = applyBlockOf(FILE);
const verify = verifyBlockOf(FILE);

describe('83000101143000 — the ladder', () => {
  it('declares an actor (66 affected rows are human_reviewed)', () => {
    expect(apply).toContain(
      "set_config('app.actor', 'migration:83000101143000_tag_name_function_words', true)",
    );
  });

  it('keeps the all-uppercase rung ABOVE the function-word rung', () => {
    // Order is the whole protection for a deliberate all-caps OR (Oregon) or
    // IN (Indiana). Asserting both exist proves nothing; assert the sequence.
    const allCaps = apply.indexOf('p_run = upper_run then return p_run');
    const fnWord = apply.indexOf('lower(p_run) = any(function_words)');
    expect(allCaps).toBeGreaterThan(0);
    expect(fnWord).toBeGreaterThan(0);
    expect(allCaps).toBeLessThan(fnWord);
  });

  it('keeps the acronym rung above both', () => {
    const acro = apply.indexOf('if upper(acro) = upper_run then return acro');
    const allCaps = apply.indexOf('p_run = upper_run then return p_run');
    expect(acro).toBeGreaterThan(0);
    expect(acro).toBeLessThan(allCaps);
  });

  it('lowercases a function word ONLY when it is interior', () => {
    // Scoped to the condition, not to the word list: a list containing "and"
    // is not the guard, the ordinal test is.
    expect(apply).toMatch(
      /if\s+p_ordinal\s*>\s*1\s+and\s+p_ordinal\s*<\s*p_total\s+and\s+lower\(p_run\)\s*=\s*any\(function_words\)/i,
    );
  });

  it('carries the short function-word list and not a longer one', () => {
    expect(apply).toMatch(/function_words\s+text\[\]\s*:=\s*ARRAY\[/i);
    for (const w of ["'and'", "'of'", "'with'", "'the'", "'for'"]) {
      expect(apply).toContain(w);
    }
    // Longer prepositions stay capitalised — the conservative side of a style
    // question, and the reason the list is not "every preposition".
    for (const w of ["'between'", "'through'", "'against'", "'during'"]) {
      expect(apply).not.toContain(w);
    }
  });
});

describe('83000101143000 — last-run protection', () => {
  it('counts runs in a pre-pass before emitting any', () => {
    // Without the count, p_total is unknown and the last run cannot be
    // protected — Hepatitis A would become Hepatitis a.
    const count = apply.indexOf('total_runs := total_runs + 1');
    const firstEmit = apply.indexOf('result := result || public.tag_name_cap_run');
    expect(count).toBeGreaterThan(0);
    expect(firstEmit).toBeGreaterThan(0);
    expect(count).toBeLessThan(firstEmit);
  });

  it('uses the same boundary rule in both passes', () => {
    // The pre-pass must not approximate the emit loop with a regex, or the
    // run count can disagree with the runs actually emitted.
    const apos = apply.match(/is_apos_in_word\s*:=\s*ch IN/g) ?? [];
    expect(apos.length).toBe(2);
  });

  it('routes BOTH emit sites through the one ladder', () => {
    // The old body carried the ladder twice and the trailing flush is where
    // the last run usually lands, so a rule added to one copy and not the
    // other fails on exactly the run the protection exists for.
    const calls = apply.match(/public\.tag_name_cap_run\(run, run_ordinal, total_runs\)/g) ?? [];
    expect(calls.length).toBe(2);
  });
});

describe('83000101143000 — the repair', () => {
  it('re-normalises through the function rather than a frozen list', () => {
    expect(apply).toMatch(/set name = public\.normalize_tag_name\(u\.name\)/i);
  });

  it('skips merged rows, whose slugs are redirect trails', () => {
    const update = apply.slice(apply.indexOf('update public.unified_tags'));
    expect(update).toMatch(/where\s+u\.status\s*<>\s*'merged'/i);
  });

  it('refuses per row to move a slug', () => {
    const update = apply.slice(apply.indexOf('update public.unified_tags'));
    expect(update).toMatch(
      /public\.normalize_tag_slug\(public\.normalize_tag_name\(u\.name\)\)\s*=\s*u\.slug/i,
    );
  });
});

describe('83000101143000 — postconditions', () => {
  it('counts the REACHED state positively', () => {
    // Counting rows in a bad state returns zero for a slug that has gone
    // missing from the corpus entirely.
    expect(verify).toMatch(/if v_remaining <> 0 then/i);
    expect(verify).toMatch(/status <> 'merged'[\s\S]{0,120}?is distinct from name/i);
  });

  it('asserts no page moved', () => {
    expect(verify).toMatch(/if v_bad_slug <> 0 then/i);
  });

  it('asserts the case this file exists for', () => {
    expect(verify).toMatch(
      /if public\.normalize_tag_name\('HIV and AIDS'\) <> 'HIV and AIDS' then/,
    );
  });

  it('asserts the protected rows by CONDITION', () => {
    for (const probe of ['Hepatitis A', 'Strap On', 'Dine-In']) {
      const re = new RegExp(`if public\\.normalize_tag_name\\('${probe}'\\) <> '${probe}' then`);
      expect(verify).toMatch(re);
    }
  });

  it('asserts the two rungs it did not change still hold', () => {
    expect(verify).toMatch(/normalize_tag_name\('prep'\) <> 'PrEP'/);
    expect(verify).toMatch(/normalize_tag_name\('ssris'\) <> 'SSRIs'/);
    expect(verify).toMatch(/normalize_tag_name\('Trans IN Sport'\) <> 'Trans IN Sport'/);
  });
});
