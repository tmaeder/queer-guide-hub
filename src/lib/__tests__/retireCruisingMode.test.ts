import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991795531748_retire_intimate_cruising_mode.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const areas = sql.slice(
  sql.indexOf('create or replace function api_private.cruising_presence_areas'),
  sql.indexOf('drop function if exists public.cruising_presence_set'),
);
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('retire intimate_cruising_mode', () => {
  it('patches every reader before dropping the table', () => {
    for (const fn of [
      'api_private.merge_cities(uuid,uuid,boolean)',
      'public.unmerge_cities(uuid,boolean)',
      'api_private.run_review_automatic_resolution(integer,boolean)',
      'api_private.review_inactive_city_unlinked(uuid)',
      'api_private.admin_review_city_context(uuid)',
    ]) {
      expect(sql).toContain(`'${fn}'`);
    }
    expect(sql.indexOf('do $patch$')).toBeLessThan(
      sql.indexOf('drop table if exists public.intimate_cruising_mode'),
    );
  });

  it('keeps the dating map aggregate-only and on the new store', () => {
    expect(areas).toContain('count(distinct upl.user_id)::bigint');
    expect(areas).toContain('upl.dating_visible');
    expect(areas).not.toContain('intimate_cruising_mode');
    expect(areas).toContain('not api_private.test_account_hidden(upl.user_id)');
  });

  it('asserts nothing references the old table afterwards, and every check raises', () => {
    expect(verify).toMatch(
      /position\('intimate_cruising_mode' in\s+regexp_replace\(pg_get_functiondef\(p\.oid\)/,
    );
    expect(verify.match(/raise exception/g)?.length).toBe(5);
  });
});
