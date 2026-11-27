import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isBotUserAgent } from '../../../functions/_lib/botUa';
import { E2E_UA_MARKER, MARKED_DEFAULT_UA, markedDevice } from '../../../e2e/support/e2eUserAgent';

/**
 * Automated traffic is tagged in search_queries and kept out of the search
 * analytics (99991795800773). Measured on prod 2026-11-27: the 30-day top
 * queries were "harris todd" 99, "abba" 92, "mdma" 86 (loops of fresh browser
 * contexts), and all 102 "gay bars in lisbon" rows in 90 days came from
 * e2e/assistant-chat.spec.ts. After the backfill, 368 of the 470 rows logged
 * in the last 30 days are tagged.
 *
 * Three layers, each guarded here: the Playwright suite marks its user agent,
 * the worker turns the marker into p_synthetic_reason (behaviour tested in
 * workers/search-proxy/tests/searchRequestIntegrity.test.ts), and the analytics
 * read search_queries_reader instead of the table.
 */

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

/** The header quotes table and function names; assert on statements only. */
const stripSqlComments = (sql: string) =>
  sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');

const MIGRATION = '99991795800773_search_queries_synthetic_traffic.sql';
const sql = stripSqlComments(read('supabase', 'migrations', MIGRATION));

/** The body of one `create or replace function public.<name>(` statement. */
function functionBody(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} is defined in ${MIGRATION}`).toBeGreaterThan(-1);
  const open = sql.indexOf('$$', start);
  const close = sql.indexOf('$$', open + 2);
  return sql.slice(open + 2, close);
}

describe('search analytics exclude synthetic traffic', () => {
  it.each([
    'search_analytics_summary',
    'search_analytics_top_queries',
    'search_analytics_zero_results',
  ])('%s aggregates over search_queries_reader, never the raw table', (name) => {
    const body = functionBody(name);
    expect(body).toMatch(/from\s+search_queries_reader\b/);
    // Every FROM of the raw table must be a raw_total/synthetic counter, never
    // the aggregate's source. Only the summary has those, and they say so.
    const rawFroms = body.match(/from\s+search_queries\b(?!_reader)/g) ?? [];
    if (name === 'search_analytics_summary') {
      expect(rawFroms).toHaveLength(2);
      expect(body).toMatch(/'raw_total',\s*\(select count\(\*\) from search_queries\b/);
      expect(body).toMatch(
        /'synthetic',\s*\(select count\(\*\) from search_queries\b[^)]*synthetic_reason is not null/,
      );
    } else {
      expect(rawFroms).toHaveLength(0);
    }
  });

  it.each(['v_top_queries', 'v_zero_hit_queries'])('%s reads the reader view', (view) => {
    const start = sql.indexOf(`create or replace view public.${view}`);
    expect(start).toBeGreaterThan(-1);
    const stmt = sql.slice(start, sql.indexOf(';', start));
    expect(stmt).toMatch(/from public\.search_queries_reader\b/);
  });

  it('the reader view drops tagged rows and same-session repeats, and is service-only', () => {
    const start = sql.indexOf('create or replace view public.search_queries_reader');
    const stmt = sql.slice(start, sql.indexOf(';', start));
    expect(stmt).toMatch(/where sq\.synthetic_reason is null/);
    expect(stmt).toMatch(/partition by sq\.session_id, sq\.query_normalized, sq\.filters/);
    expect(stmt).toMatch(/s\.created_at - s\.prev_at > interval '60 seconds'/);
    expect(stmt).toMatch(/security_invoker = true/);
    expect(sql).toMatch(
      /revoke all on public\.search_queries_reader from public, anon, authenticated;/,
    );
  });

  it('log_search takes the tag with a default, so the deployed worker keeps resolving', () => {
    expect(sql).toMatch(
      /drop function if exists public\.log_search\(text, text, text, jsonb, integer, integer, boolean\);/,
    );
    expect(sql).toMatch(/p_synthetic_reason text default null/);
    expect(functionBody('log_search')).toMatch(
      /synthetic_reason\)\s*values[\s\S]*p_synthetic_reason/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.log_search\(text, text, text, jsonb, integer, integer, boolean, text\) from public, anon, authenticated;/,
    );
  });

  it('every backfill rule writes a named, reversible "backfill:" reason and never deletes', () => {
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\.search_queries\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    const update = sql.slice(sql.indexOf('with burst as ('), sql.indexOf('do $verify$'));
    const reasons = [...update.matchAll(/then '([^']+)'/g)].map((m) => m[1]);
    expect(reasons).toEqual([
      'backfill:named_test_session',
      'backfill:e2e_assistant_chat',
      'backfill:e2e_search_vector_coverage',
      'backfill:app_recommended_for_you',
      'backfill:burst',
      'backfill:e2e_spec_query_before_gate',
    ]);
    // Re-running the file must not re-tag or overwrite anything.
    expect(update).toMatch(/where sq\.synthetic_reason is null/);
    // P5 lists exactly the reasons the UPDATE can write.
    const p5 = sql.slice(sql.indexOf("synthetic_reason like 'backfill:%'"));
    for (const r of reasons) expect(p5).toContain(`'${r}'`);
  });

  it('the postconditions raise, and P4 refuses an empty result', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    for (const p of ['P1', 'P2', 'P3', 'P3b', 'P4', 'P5']) {
      expect(verify).toMatch(new RegExp(`raise exception '${p} failed`));
    }
    expect(verify).toMatch(/if v_n = 0 then\s+raise exception 'P4 failed/);
    // P4 must not demand rows on the empty schema CI replays migrations into.
    expect(verify).toMatch(
      /if exists \(select 1 from public\.search_queries\s+where created_at > now\(\) - interval '90 days'\) then/,
    );
    expect(verify).not.toMatch(/where false|if \(?false\)?/);
  });
});

describe('the Playwright suite marks its user agent', () => {
  it.each([
    'playwright.config.ts',
    'playwright.taxonomy.config.ts',
    'playwright.trip-planner.config.ts',
  ])('%s marks every project and the default context', (file) => {
    const src = read(file);
    expect(src).toMatch(/userAgent: MARKED_DEFAULT_UA/);
    // A bare device descriptor would carry Chrome's agent without the marker.
    expect(src).not.toMatch(/\.\.\.devices\[/);
    expect(src).toMatch(/markedDevice\(/);
  });

  it('the marker is on every agent and does not make the edge serve crawler HTML', () => {
    expect(MARKED_DEFAULT_UA).toContain(E2E_UA_MARKER);
    expect(markedDevice('Pixel 5').userAgent).toContain(E2E_UA_MARKER);
    expect(isBotUserAgent(MARKED_DEFAULT_UA)).toBe(false);
    expect(isBotUserAgent(markedDevice('Pixel 5').userAgent)).toBe(false);
  });

  it('the worker recognises the exact marker the suite sends', () => {
    const worker = read('workers', 'search-proxy', 'src', 'syntheticTraffic.ts');
    const name = E2E_UA_MARKER.split('/')[0];
    expect(worker).toContain(`/${name}/.test(ua)`);
    expect(read('workers', 'search-proxy', 'src', 'index.ts')).toMatch(
      /logSearch\([\s\S]*syntheticTrafficReason\(request\)/,
    );
  });
});
