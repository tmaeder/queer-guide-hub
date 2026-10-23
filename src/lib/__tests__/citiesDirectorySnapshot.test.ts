import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991792753131 — cities_directory() served from a cron-refreshed snapshot.
 * Over COMMENT-STRIPPED SQL: the header quotes the phrases asserted here.
 */
const MIGRATION = '99991792753131_cities_directory_snapshot.sql';
const sql = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8')
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');
const health = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');

const rpc = sql.slice(
  sql.indexOf('create or replace function api_private.cities_directory()'),
  sql.indexOf('select api_private.cities_directory_refresh();'),
);
const refresh = sql.slice(
  sql.indexOf('create or replace function api_private.cities_directory_refresh()'),
  sql.indexOf('create or replace function api_private.cities_directory()'),
);

describe('cities_directory snapshot', () => {
  it('serves the snapshot and falls back to a live compute only when there is none', () => {
    expect(rpc).toMatch(/from api_private\.cities_directory_snapshot s where s\.id\)/);
    expect(rpc).toMatch(/api_private\.cities_directory_compute\(\)\s*\);/);
    expect(rpc).toContain("jsonb_build_object('refreshed_at', s.refreshed_at)");
  });

  it('rewrites the payload only when content changed, always stamps refreshed_at', () => {
    expect(refresh).toContain(
      "when (s.payload - 'generated_at') is distinct from (excluded.payload - 'generated_at')",
    );
    expect(refresh).toContain('else s.payload');
    expect(refresh).toContain('refreshed_at = excluded.refreshed_at');
  });

  it('keeps the payload shape: compute carries cols/rows/countries', () => {
    for (const k of ["'countries',", "'cols', jsonb_build_array(", "'rows', coalesce(("]) {
      expect(sql).toContain(k);
    }
  });

  it('never exposes the internals to anon/authenticated', () => {
    expect(sql).toContain(
      'revoke all on table api_private.cities_directory_snapshot from public, anon, authenticated;',
    );
    expect(sql).toContain(
      'revoke all on function api_private.cities_directory_compute() from public, anon, authenticated;',
    );
    expect(sql).toContain(
      'revoke all on function api_private.cities_directory_refresh() from public, anon, authenticated;',
    );
  });

  it('registers the refresher in admin_automations and pg_cron', () => {
    expect(sql).toMatch(/insert into public\.admin_automations[\s\S]*'cities_directory_refresh'/);
    expect(sql).toMatch(/select cron\.schedule\(\s*'cities_directory_refresh'/);
  });

  it('health check hard-fails a stale or missing snapshot', () => {
    expect(health).toContain('refreshedAt = parsed?.refreshed_at');
    expect(health).toMatch(/ageMin > 120\) \{[\s\S]{0,400}FAILED = true/);
    expect(health).toMatch(/Number\.isNaN\(ageMin\)\) \{[\s\S]{0,400}FAILED = true/);
  });
});
