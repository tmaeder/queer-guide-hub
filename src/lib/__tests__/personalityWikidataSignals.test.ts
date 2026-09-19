import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The personality wrong-entity repairs (99970101100100, 99991789833562,
 * 99991789840157) landed with nothing watching them. `personality_wikidata_signals()`
 * is the regression sentinel; this guards its load-bearing properties.
 *
 * Asserted against COMMENT-STRIPPED SQL — the migration header quotes nearly every
 * string these tests look for, so an unstripped check passes on the prose with the
 * function body deleted.
 */

const MIGRATION = '99991789852488_personality_wikidata_signals';

const stripSql = (s: string) =>
  s
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');

const raw = readFileSync(join(process.cwd(), 'supabase', 'migrations', `${MIGRATION}.sql`), 'utf8');
const sql = stripSql(raw);
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const body = norm(sql.slice(0, sql.indexOf('do $verify$')));
const verify = norm(sql.slice(sql.indexOf('do $verify$')));

const health = readFileSync(join(process.cwd(), 'scripts', 'check-pipeline-health.mjs'), 'utf8');

describe('personality_wikidata_signals: exposure', () => {
  it('is service_role only — a DEFINER aggregate on authenticated is on every member', () => {
    expect(body).toMatch(
      /revoke all on function public\.personality_wikidata_signals\(\) from public, anon, authenticated/,
    );
    expect(body).toMatch(
      /grant execute on function public\.personality_wikidata_signals\(\) to service_role/,
    );
    expect(body).not.toMatch(/grant execute[^;]*to (anon|authenticated)/);
  });
});

describe('personality_wikidata_signals: the three zero-invariants', () => {
  // Every assertion below is scoped to the ARM it is about. The same predicates
  // appear again in the `examples` subquery, so asserting over the whole body
  // passes with the counting arm mutated — measured, not theorised: two
  // mutations survived a first round for exactly this reason.
  const arm = (from: string, to: string) => body.slice(body.indexOf(from), body.indexOf(to));

  it('watches a refuted identifier coming back, guarded against a null qid', () => {
    const regressed = arm('into v_regressed', 'into v_sentinel_lost');
    expect(regressed).toMatch(
      /wikidata_qid = enrichment_status -> 'wrong_entity_candidate' ->> 'qid'/,
    );
    expect(regressed).toMatch(/'wrong_entity_candidate' ->> 'qid' is not null/);
  });

  it('watches a disposed row losing its SKIP_ sentinel, treating NULL as a failure', () => {
    // A NULL is not neutral: personality-refresh re-resolves by name when the
    // column IS NULL, so the row re-enters resolution instead of recording a
    // decision. An `!~ '^SKIP_'` check alone would miss NULL entirely.
    const lost = arm('into v_sentinel_lost', 'into v_text_back');
    expect(lost).toMatch(/wikidata_qid is null/);
    expect(lost).toMatch(/wikidata_qid !~ '\^SKIP_'/);
  });

  it('watches the retracted biography returning, separately from the identifier', () => {
    // The identifier coming back and the TEXT coming back are different
    // failures; the tag work needed two sentinels for exactly this reason.
    expect(body).toMatch(
      /description = enrichment_status -> 'wrong_entity_description_retracted' ->> 'from'/,
    );
  });

  it('scopes BOTH identifier checks to state=confirmed', () => {
    // `wrong_entity_candidate` is a shared key with three producers on prod: 125
    // rows with state=confirmed + SKIP_, 157 with no state, and 43 that are
    // CANDIDATES still carrying their Q-id on purpose. Without this scope the
    // third group trips a zero-invariant and reds every PR in the repo for
    // behaving correctly. It reads 0 either way today, so the scope must be
    // deliberate rather than discovered later.
    expect(arm('into v_regressed', 'into v_sentinel_lost')).toMatch(
      /'wrong_entity_candidate' ->> 'state' = 'confirmed'/,
    );
    expect(arm('into v_sentinel_lost', 'into v_text_back')).toMatch(
      /'wrong_entity_candidate' ->> 'state' = 'confirmed'/,
    );
  });
});

describe('personality_wikidata_signals: a zero must mean something', () => {
  it('reports probe_ok and the corpus size separately from the counts', () => {
    // An empty table, a revoked grant and a clean corpus otherwise all return
    // the same reassuring zeroes.
    expect(body).toMatch(/'probe_ok',\s*true/);
    expect(body).toMatch(/'rows_with_qid',\s*v_rows/);
    // Reported-not-gated is not licence to report a literal: a work-list size
    // hardcoded to 0 reads as "nothing left to sweep" forever.
    expect(body).toMatch(/'unverified_reachable',\s*v_unverified/);
    expect(body).toMatch(/'dispositioned',\s*v_disp/);
  });

  it('carries positive controls in its own verify block', () => {
    expect(verify).toMatch(/rows_with_qid'\)::int < 1000/);
    expect(verify).toMatch(/dispositioned'\)::int < 100/);
  });

  it('does NOT gate on the work-list size', () => {
    // unverified_reachable was 3,579 at this migration. Gating on it ships red
    // on arrival, which is the cry-wolf shape this repo has removed before.
    expect(verify).not.toMatch(/unverified_reachable'\)::int\s*[<>]/);
  });

  it('every invariant in the verify block reads the function, not a literal', () => {
    expect(verify).toMatch(/v := public\.personality_wikidata_signals\(\)/);
    expect(verify).not.toMatch(/where false/i);
  });
});

describe('check-pipeline-health wiring', () => {
  it('calls the RPC and fails when it is missing rather than skipping', () => {
    expect(health).toContain('rpc/personality_wikidata_signals');
    const section = health.slice(
      health.indexOf('rpc/personality_wikidata_signals') - 400,
      health.indexOf('5b. Automation run-tracking gaps'),
    );
    expect(section).toMatch(/RPC missing\? not applied\?/);
    // An absent sentinel must not read as a clean corpus.
    expect(section).toMatch(/if \(!res\.ok\)[\s\S]{0,200}FAILED = true/);
  });

  it('asserts the probe is reading the corpus before trusting its zeroes', () => {
    // Without this the script believes three zeroes from a function that could
    // be reading an empty table. Mutating the threshold to < 0 survived a first
    // mutation round, which is how this assertion came to exist.
    const section = health.slice(
      health.indexOf('rpc/personality_wikidata_signals'),
      health.indexOf('5b. Automation run-tracking gaps'),
    );
    expect(section).toMatch(/\(s\.rows_with_qid \?\? 0\) < 1000/);
    const guard = section.slice(section.indexOf('(s.rows_with_qid ?? 0) < 1000'));
    expect(guard).toMatch(/FAILED = true/);
  });

  it('treats a missing probe_ok as broken, not clean', () => {
    const section = health.slice(
      health.indexOf('rpc/personality_wikidata_signals'),
      health.indexOf('5b. Automation run-tracking gaps'),
    );
    expect(section).toMatch(/probe_ok !== true[\s\S]{0,200}FAILED = true/);
  });

  it('hard-fails each of the three invariants', () => {
    const section = health.slice(
      health.indexOf('rpc/personality_wikidata_signals'),
      health.indexOf('5b. Automation run-tracking gaps'),
    );
    for (const k of ['qid_regressed', 'sentinel_lost', 'retracted_text_back']) {
      expect(section).toContain(k);
    }
    // The loop must actually gate. Asserted as two facts rather than as a span
    // between them: the distance is incidental and a length-bounded regex turns
    // an unrelated edit into a false failure.
    expect(section).toMatch(/if \(\(s\[key\] \?\? 0\) > 0\)/);
    const loop = section.slice(section.indexOf('if ((s[key] ?? 0) > 0)'));
    expect(loop).toMatch(/FAILED = true/);
  });

  it('prints the work-list size without gating on it', () => {
    const section = health.slice(
      health.indexOf('rpc/personality_wikidata_signals'),
      health.indexOf('5b. Automation run-tracking gaps'),
    );
    expect(section).toMatch(/unverified_reachable/);
    expect(section).not.toMatch(/unverified_reachable[^\n]*FAILED = true/);
  });
});
