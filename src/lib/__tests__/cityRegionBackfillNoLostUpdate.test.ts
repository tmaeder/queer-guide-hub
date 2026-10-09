import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * backfill-city-region once PATCHed the whole enrichment_status object from a
 * snapshot taken ~35 minutes earlier, deleting every key another writer added
 * meanwhile (2026-10-09: two review flags, two merge_flags, one agentic_skip;
 * the lost flags aborted a migration and blocked db push). The stamp must be
 * merged server-side by city_stamp_region_reverse.
 */
const root = process.cwd();
const script = readFileSync(join(root, 'scripts/data-quality/backfill-city-region.mjs'), 'utf8');
const code = script
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('//'))
  .join('\n');
const sql = readFileSync(
  join(root, 'supabase/migrations/99991791569736_city_region_stamp_rpc_and_lost_update_repair.sql'),
  'utf8',
);

describe('backfill-city-region writes no whole enrichment_status object', () => {
  it('never sends enrichment_status in a request body', () => {
    expect(code).not.toMatch(/enrichment_status\s*:/);
  });

  it('never PATCHes cities directly', () => {
    expect(code).not.toMatch(/rest\/v1\/cities\?[^`]*`,\s*\{\s*method:\s*'PATCH'/);
  });

  it('writes through the merging RPC', () => {
    expect(code).toContain('/rest/v1/rpc/city_stamp_region_reverse');
    expect(code).toMatch(/p_id: id, p_region_name: regionName, p_stamp: stamp\(value\)/);
  });
});

describe('city_stamp_region_reverse merges one key', () => {
  it('uses || with a single region_reverse key in both branches', () => {
    const merges = sql.match(/\|\| jsonb_build_object\('region_reverse', p_stamp\)/g) ?? [];
    expect(merges).toHaveLength(2);
    expect(sql).not.toMatch(/set\s+enrichment_status\s*=\s*p_stamp/i);
  });

  it('is service_role only', () => {
    expect(sql).toContain(
      'revoke all on function public.city_stamp_region_reverse(uuid, text, jsonb) from public, anon, authenticated;',
    );
    expect(sql).toMatch(/raise exception 'P2 failed/);
  });
});
