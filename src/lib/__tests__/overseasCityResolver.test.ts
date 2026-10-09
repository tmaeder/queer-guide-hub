import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards `99991791494561_overseas_city_resolver.sql`.
 *
 * Nominatim reports "fr" for places in France's overseas territories, so the
 * venue geocoder handed `city_resolve_or_create` country FR for Kourou, Le
 * Vauclin, Saint Martin, … and the resolver, whose name arms are all scoped to
 * that country, minted France duplicates of rows that had just been re-filed
 * under GF / MQ / MF. The migration teaches the resolver to switch to the
 * territory when the coordinates sit inside one.
 *
 * What this file holds:
 *   - the resolver is PATCHED from its live definition, never restated;
 *   - the switch fires only for FR, and only with coordinates;
 *   - the cleanup merges by name inside the territory with NO distance gate
 *     (French Guiana communes are huge: 38 km and 228 km pairs are one place);
 *   - the verify block exercises the resolver itself, with creation disabled.
 *
 * Assertions run on comment-stripped SQL, because the header names every
 * defect it fixes and prose must not satisfy a check whose statement is gone.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/99991791494561_overseas_city_resolver.sql',
);

const raw = readFileSync(MIGRATION, 'utf8');
const sql = raw
  .split('\n')
  .filter((line) => !/^\s*--/.test(line))
  .join('\n');

function block(name: string): string {
  const start = sql.indexOf(`do $${name}$`);
  const end = sql.indexOf(`$${name}$;`, start);
  expect(start, `block ${name} present`).toBeGreaterThan(-1);
  expect(end, `block ${name} closed`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe('overseas city resolver migration', () => {
  it('patches city_resolve_or_create from its live definition instead of restating it', () => {
    const patch = block('patch');
    expect(patch).toContain('pg_get_functiondef(');
    expect(patch).toContain('execute v_new');
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.city_resolve_or_create/i);
  });

  it('asserts each anchor occurs exactly once before replacing', () => {
    const patch = block('patch');
    expect(patch.match(/<> 1 then\s+raise exception/g)?.length).toBe(2);
  });

  it('switches country only when the caller said FR and coordinates fall in a territory', () => {
    const patch = block('patch');
    expect(patch).toContain("IF v_country_cc = 'FR' THEN");
    expect(patch).toContain('public.french_overseas_country_code(p_lat, p_lng)');
    expect(patch).toContain('IF v_overseas IS NOT NULL THEN');
  });

  it('classifies only with coordinates on both axes', () => {
    expect(sql).toMatch(/where p_lat is not null and p_lng is not null/);
  });

  it('merges territory twins by name without a distance gate', () => {
    const cleanup = block('cleanup');
    expect(cleanup).toContain('tw.canonical_key = oc.canonical_key');
    expect(cleanup).toContain('merge_cities(r.keep_id, r.drop_id, true)');
    expect(cleanup).not.toContain('haversine_m');
  });

  it('verifies with the resolver itself, creation disabled, and a metropolitan mirror', () => {
    const verify = block('verify');
    expect(verify).toContain('p_allow_create => false');
    expect(verify).toMatch(/if v_hit is distinct from v_kourou then\s+raise exception/);
    expect(verify).toMatch(/french_overseas_country_code\(48\.8566, 2\.3522\) is not null then\s+raise exception/);
    expect(verify).toMatch(/if v_bad <> 0 then\s+raise exception/);
  });
});
