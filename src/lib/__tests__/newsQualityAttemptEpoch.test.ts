import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const EPOCH = '61000301100000_news_quality_attempt_epoch.sql';
const SIGNALS = '61000301100100_news_quality_signals.sql';
const HEALTH = join(process.cwd(), 'scripts', 'check-pipeline-health.mjs');

/**
 * Assertions run against COMMENT-STRIPPED sql. Both migrations carry long
 * headers quoting the exact identifiers the guards look for, so a `toContain`
 * over the raw file passes with the statement deleted — the vacuous-assertion
 * class this repo has now recorded five separate times.
 */
const statementsOf = (file: string): string =>
  readFileSync(join(MIGRATIONS, file), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

/** The apply half only: a `do $verify$` block echoes the strings it checks. */
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

describe('the attempt epoch forgives a broken era without creating a treadmill', () => {
  it('stores the epoch on the settings singleton', () => {
    expect(applyBlockOf(EPOCH)).toMatch(
      /alter table public\.news_quality_settings\s+add column if not exists attempt_epoch timestamptz/i,
    );
  });

  it('counts only failures at or after the epoch, and is NULL-safe', () => {
    const apply = applyBlockOf(EPOCH);
    const at = apply.indexOf("j.status = 'failed'");
    expect(at).toBeGreaterThan(0);
    const clause = apply.slice(at, at + 400);
    // The date filter is what makes a pre-epoch failure stop counting.
    expect(clause).toMatch(/j\.created_at >= coalesce\(/i);
    expect(clause).toMatch(/attempt_epoch from public\.news_quality_settings/i);
    // An unset epoch must mean "count everything", i.e. exactly today's
    // behaviour — measured on prod: with the new selector and the epoch unset,
    // eligible stayed 0 and the gate stayed 340. A NULL that widened the gate
    // would ship a silent behaviour change with no decision behind it.
    expect(clause).toContain("'-infinity'::timestamptz");
  });

  it('keeps the per-article ceiling rather than removing it', () => {
    expect(applyBlockOf(EPOCH)).toMatch(/< greatest\(coalesce\(p_max_failures, ?3\), ?1\)/i);
  });

  it('keeps the in-flight exclusion so a second job is never stacked', () => {
    expect(applyBlockOf(EPOCH)).toMatch(/status in \('pending', ?'running'\)/i);
  });

  it('sets the epoch to the measured provider-fix boundary', () => {
    const apply = applyBlockOf(EPOCH);
    expect(apply).toMatch(
      /update public\.news_quality_settings\s+set attempt_epoch = timestamptz '2026-09-04 00:00:00\+00'/i,
    );
  });

  it('clears a pipeline version that has no verdict behind it, by predicate not by id list', () => {
    const apply = applyBlockOf(EPOCH);
    const at = apply.toLowerCase().indexOf('set quality_pipeline_version = null');
    expect(at).toBeGreaterThan(0);
    const stmt = apply.slice(at, at + 300);
    expect(stmt).toMatch(/quality_decision is null/i);
    expect(stmt).toMatch(/quality_pipeline_version is not null/i);
    // A frozen id list cannot no-op if the corpus moves between authoring and
    // apply; the incoherence itself is the predicate.
    expect(stmt).not.toMatch(/in \('[0-9a-f]{8}-/i);
  });

  it('asserts the reached state, not the number of rows it changed', () => {
    const verify = verifyBlockOf(EPOCH);
    // Count-free on the cohort: inflow and the */10 cron both move these
    // numbers between authoring and apply.
    expect(verify).toMatch(/v_unjudged > 0 and v_eligible = 0/i);
    expect(verify).toMatch(/quality_pipeline_version is not null and quality_decision is null/i);
    expect(verify).toMatch(/attempt_epoch was not set/i);
  });
});

describe('the sentinel gates on reachability, not on depth', () => {
  it('gates on rows with no verdict that the selector will not offer', () => {
    const apply = applyBlockOf(SIGNALS);
    const at = apply.indexOf('INTO v_unreachable');
    expect(at).toBeGreaterThan(0);
    const stmt = apply.slice(at, at + 600);
    expect(stmt).toMatch(/quality_decision is null/i);
    expect(stmt).toMatch(/not exists[\s\S]{0,120}news_quality_enqueue_candidates/i);
    // In flight counts as reachable, or the signal flaps against the */10 cron.
    expect(stmt).toMatch(/status in \('pending', ?'running'\)/i);
  });

  it('does NOT re-introduce the attempted-since-epoch clause that made it vacuous', () => {
    // The first draft also required "no attempt since the epoch". With the epoch
    // unset every attempt ever counts, so against the real incident (346
    // unjudged, 0 eligible) the gate read ONE. Measured on prod, not reasoned.
    const apply = applyBlockOf(SIGNALS);
    const at = apply.indexOf('INTO v_unreachable');
    const stmt = apply.slice(at, at + 600);
    expect(stmt).not.toMatch(/created_at >=/i);
  });

  it('reports depth separately and never gates on it', () => {
    const apply = applyBlockOf(SIGNALS);
    expect(apply).toMatch(/'judged_in_review', v_judged/);
    const health = readFileSync(HEALTH, 'utf8');
    const start = health.indexOf('news_quality_signals');
    expect(start).toBeGreaterThan(0);
    const section = health.slice(start, start + 2600);
    expect(section).not.toMatch(/judged_in_review[\s\S]{0,80}FAILED = true/);
  });

  it('reports probe_ok separately from every count', () => {
    const apply = applyBlockOf(SIGNALS);
    expect(apply).toMatch(/'probe_ok', true/);
    expect(apply).toMatch(
      /exception when others then\s+return jsonb_build_object\('probe_ok', false/i,
    );
  });

  it('is service_role only — a definer aggregate granted to authenticated is granted to everyone', () => {
    const apply = applyBlockOf(SIGNALS);
    expect(apply).toMatch(
      /revoke all on function public\.news_quality_signals\(\) from public, anon, authenticated/i,
    );
    expect(apply).toMatch(
      /grant execute on function public\.news_quality_signals\(\) to service_role/i,
    );
  });

  it('hard-fails CI on an unreachable drain and on a missing RPC', () => {
    const health = readFileSync(HEALTH, 'utf8');
    const start = health.indexOf('rpc/news_quality_signals');
    expect(start).toBeGreaterThan(0);
    const section = health.slice(start, start + 2600);
    expect(section).toMatch(/if \(!res\.ok\)[\s\S]{0,300}FAILED = true/);
    expect(section).toMatch(/probe_ok !== true[\s\S]{0,200}FAILED = true/);
    // Condition, not message — see the note on review_rows_in_search below.
    expect(section).toMatch(/if \(unreachable > 0\) \{/);
  });

  it('keeps the invariant that a row awaiting review is not served', () => {
    const health = readFileSync(HEALTH, 'utf8');
    const start = health.indexOf('rpc/news_quality_signals');
    const section = health.slice(start, start + 2600);
    // Anchor on the CONDITION, not the message. A first draft matched
    // `review_rows_in_search … FAILED = true`, which the console.error line
    // satisfies on its own — so neutering the `if` to `if (false)` left the
    // test green. Mutation M14 is what found that; the same vacuous-assertion
    // class this repo has recorded repeatedly.
    expect(section).toMatch(/if \(Number\(q\.review_rows_in_search \?\? 0\) > 0\) \{/);
  });
});
