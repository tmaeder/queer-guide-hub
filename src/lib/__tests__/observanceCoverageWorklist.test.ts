// Guards 99991795366005: an observance within 30 days with < 5 linked upcoming events is an
// inbox item ("Find sources for X"), and the queue cannot invent, fetch or approve anything.
// Assertions run over COMMENT-STRIPPED SQL — the header quotes the rules it implements.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN_QUEUES } from '@/config/adminQueues';

const raw = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991795366005_observance_coverage_worklist.sql'),
  'utf8',
);
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const fn = sql.slice(
  sql.indexOf('function public.observance_coverage_gaps('),
  sql.indexOf('$fn$;'),
);
const view = sql.slice(
  sql.indexOf('view public.triage_src_observance_coverage'),
  sql.indexOf('revoke all on public.triage_src_observance_coverage'),
);
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('observance coverage work list', () => {
  it('lists only published occurrences inside the horizon and under the minimum', () => {
    expect(fn).toMatch(/o\.status = 'published'/);
    expect(fn).toMatch(/d\.starts between current_date and current_date \+ p_horizon_days/);
    expect(fn).toMatch(/where c\.linked_upcoming < p_min/);
  });

  it('counts linked, live, upcoming events inside the occurrence window and country', () => {
    expect(fn).toMatch(/eo\.status = 'linked'/);
    expect(fn).toMatch(/e\.duplicate_of_id is null/);
    expect(fn).toMatch(/e\.start_date::date >= current_date/);
    expect(fn).toMatch(/between n\.starts - n\.wb and n\.ends \+ n\.wa/);
    expect(fn).toMatch(/n\.country_id is null or e\.country_id = n\.country_id/);
  });

  it('builds search phrases only from non-regex match terms', () => {
    expect(fn).toMatch(/where t !~ '\[\]\[\(\)\?\|\*\+\\\\\.\{\}\^\$\]'/);
  });

  it('reads and writes nothing it could invent: no insert, update or http', () => {
    expect(fn).not.toMatch(/\b(insert|update|delete)\b/i);
    expect(fn).not.toMatch(/http_post|net\./i);
    expect(view).not.toMatch(/\b(insert|update|delete)\b/i);
  });

  it('the inbox view uses the 30-day / 5-event rule', () => {
    expect(view).toMatch(/from public\.observance_coverage_gaps\(30, 5\) g/);
    expect(view).toMatch(/'Find sources for '/);
  });

  it('is decided outside the inbox, so no approve/reject is offered or wired', () => {
    expect(sql).toMatch(/'external_console', '\/days'/);
    expect(sql).toMatch(/'can_reopen', false/);
    expect(sql).not.toMatch(/triage_action/);
  });

  it('is not reachable by anon', () => {
    expect(sql).toMatch(
      /revoke all on public\.triage_src_observance_coverage from anon, authenticated/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.observance_coverage_gaps\(int, int\) from public, anon, authenticated/,
    );
  });

  it('postconditions raise: union shape, union executes, anon blocked, list not empty by construction', () => {
    expect(verify).toMatch(/if v_cols is distinct from[\s\S]*?raise exception 'P1 failed/);
    expect(verify).toMatch(/if not coalesce[\s\S]*?raise exception 'P2 failed/);
    expect(verify).toMatch(/has_table_privilege\('anon'[\s\S]*?raise exception 'P3 failed/);
    expect(verify).toMatch(
      /observance_coverage_gaps\(366, 1000000\)[\s\S]*?raise exception 'P4 failed/,
    );
    expect(verify).not.toMatch(/where false|if \(?false\)?/);
  });

  it('the admin queue registry has the matching count key', () => {
    const q = ADMIN_QUEUES.find((x) => x.queueKey === 'observance-coverage');
    expect(q?.countKey).toBe('review_observance_coverage');
    expect(q?.slaKey).toBe('observance_coverage');
  });
});
