import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards `78000101100000_place_merge_name_corroboration.sql`, which turns "dedup of
// countries, cities and villages must rest on real geographical sources and names, and
// must never suggest merging two different places" into a checked invariant.
//
// Dry-run on prod in a rolled-back transaction before merge:
//   9/9 arm assertions passed | merges=332 merged_unc=12 queue_scanned=0 sugg_unc=0
//
// The literal reading of the rule is wrong and the corpus proves it: 146 of the 160
// string-differing city merges are the exonym / official-name class and are one real
// place. So corroboration is four arms, and arm 3 (a shared wikidata_qid) is what makes
// Tokyo/東京 defensible while Hamburg/Hamburg-Altona stays uncorroborated.

const MIGRATION = '78000101100000_place_merge_name_corroboration.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

// Every assertion runs against comment-stripped SQL. This file's header names the arms,
// the rejected pairs and the district cohort in prose, so a whole-file `toContain` would
// be satisfiable by the comments with the guard itself deleted.
const sql = raw
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

// Statements only. The verify block echoes every arm name and every example pair, so a
// whole-file match passes with the real predicate gone.
const statements = sql.split('do $verify$')[0];
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('the place-pair corroboration predicate', () => {
  it('accepts a pair only on one of the four corroborating arms', () => {
    for (const arm of ['name_identical', 'comma_qualifier', 'wikidata', 'geo']) {
      expect(statements).toContain(`'${arm}'`);
    }
    // The default must be a refusal. If this became anything else, every uncorroborated
    // pair would read as corroborated and both counters would go quietly to zero.
    expect(statements).toMatch(/else 'none'\s*\n\s*end/);
  });

  it('treats a shared wikidata_qid as decisive, and requires BOTH sides to carry one', () => {
    // This is the arm that makes the exonym merges defensible rather than flagged.
    // Dropping either null test would let two rows with no identifier at all count as
    // agreeing, which is how a null becomes evidence.
    expect(statements).toMatch(
      /p_a_qid\s+is\s+not\s+null\s+and\s+p_b_qid\s+is\s+not\s+null\s+and\s+p_a_qid\s*=\s*p_b_qid/,
    );
  });

  it('requires both a country scope and a distance bound on the geo arm', () => {
    // Distance alone would merge same-named towns across borders; country alone would
    // merge a district into its parent city.
    expect(statements).toMatch(/p_a_country_id\s*=\s*p_b_country_id/);
    // Anchored so a WIDENED bound cannot pass: `< 10000` is a prefix of `< 10000000`,
    // and a 10,000 km radius corroborates any two points in one country — which is
    // exactly the Hannover/Hanover pair this sentinel exists to keep flagged.
    expect(statements).toMatch(/haversine_m\([^)]*\)\s*<\s*10000(?!\d)/);
  });

  it('refuses a comma qualifier whose two tails disagree', () => {
    // The whole reason arm 2 is a CASE and not an OR. A plain OR let side A's own tail
    // vouch for the pair, collapsing "Springfield, Illinois" into "Springfield, Oregon" —
    // caught by the prod dry run, not by reading.
    const arm2 = statements.slice(
      statements.indexOf("= public.dedup_despace(regexp_replace(p_b_name, '\\s*,\\s*[^,]+$', ''))"),
      statements.indexOf("then 'comma_qualifier'"),
    );
    expect(arm2).toContain("when p_a_name like '%,%' and p_b_name like '%,%'");
    // Both-qualified resolves by comparing the two tails to each other.
    expect(arm2).toMatch(
      /regexp_replace\(p_a_name, '\^\.\*,\\s\*', ''\)\)\s*\n\s*=\s*public\.dedup_despace\(regexp_replace\(p_b_name, '\^\.\*,\\s\*', ''\)\)/,
    );
    // And a pair with no comma on either side may never reach 'comma_qualifier'.
    expect(arm2).toMatch(/else false/);
  });

  it('casts every coordinate, because the three place tables disagree on type', () => {
    // queer_villages stores double precision while cities and countries use numeric, and
    // haversine_m takes numeric — the village branch alone failed to resolve the call.
    // FOUR call sites, each casting BOTH sides. Asserting one cast per site would be
    // satisfied by the surviving copy while the other side loses its cast — the same
    // divergence a previous guard in this repo missed by counting once.
    const casts = statements.match(/latitude::numeric/g) ?? [];
    expect(casts.length).toBe(8);
    expect((statements.match(/longitude::numeric/g) ?? []).length).toBe(8);
  });
});

describe('the sentinel', () => {
  it('reports what it scanned separately from what it found', () => {
    // An empty queue, a revoked grant and a clean corpus otherwise all return the same
    // reassuring zero.
    for (const key of ['probe_ok', 'types_checked', 'queue_rows_scanned', 'merges_total']) {
      expect(statements).toContain(`'${key}'`);
    }
  });

  it('scans all three place types, not cities alone', () => {
    expect(statements).toMatch(/entity_type\s*=\s*'city'\s+and\s+d\.status\s*=\s*'open'/);
    expect(statements).toMatch(/entity_type\s*=\s*'country'\s+and\s+d\.status\s*=\s*'open'/);
    expect(statements).toMatch(/entity_type\s*=\s*'queer_village'\s+and\s+d\.status\s*=\s*'open'/);
  });

  it('counts only pairs the predicate refused', () => {
    // Two counters, one per surface. If either stopped filtering on 'none' it would count
    // every pair and the baseline check would fire on correct data forever.
    const refusals = statements.match(/filter \(where corr = 'none'\)/g) ?? [];
    expect(refusals.length).toBe(4);
  });

  it('is service_role only', () => {
    // A SECURITY DEFINER aggregate granted to `authenticated` is granted to every member.
    expect(statements).toMatch(
      /revoke all on function public\.place_merge_name_signals\(\) from public, anon, authenticated/,
    );
    expect(statements).toMatch(
      /grant execute on function public\.place_merge_name_signals\(\) to service_role/,
    );
  });
});

describe('the migration postconditions', () => {
  it('asserts each arm by its verdict, including the two that must REFUSE', () => {
    expect(verify).toContain("'Aguascalientes', 'Aguas Calientes'");
    expect(verify).toContain("'Tokyo', '東京'");
    // The refusals are the half that a permissive predicate would silently break.
    expect(verify).toContain("'Springfield, Illinois', 'Springfield, Oregon'");
    expect(verify).toContain("'Hamburg', 'Hamburg-Altona'");
    expect(verify).toContain("'Hannover', 'Hanover'");
  });

  it('asserts the sentinel is measuring something rather than returning zero', () => {
    expect(verify).toMatch(/merges_total.*::int\s*=\s*0/s);
    expect(verify).toMatch(/raise exception 'place_merge_name_signals reports zero merges/);
  });

  it('asserts no live COUNT, so a concurrent sweep cannot abort db push on main', () => {
    // Soft on preconditions, hard on postconditions. A migration that RAISEd because
    // another session legitimately queued a pair would take every queued migration with it.
    expect(verify).not.toMatch(
      /suggested_uncorroborated'\)::int\s*(<>|>|!=)\s*0\s*then\s*\n?\s*raise/,
    );
    expect(verify).not.toMatch(
      /merged_uncorroborated'\)::int\s*(<>|>|!=)\s*\d+\s*then\s*\n?\s*raise/,
    );
  });
});
