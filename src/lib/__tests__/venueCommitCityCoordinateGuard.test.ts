import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991791356737: commit_venue_staging_item may no longer resolve a
 * venue's city by name alone. The cross-country fallback ordered by population
 * put "Parc Jules Descampe, Waterloo" (Belgium) on Waterloo, USA; it now runs
 * only when no country resolved and only within 100 km of the row's own
 * coordinates, and any city more than 100 km away is refused.
 *
 * Comments are stripped before asserting: the header quotes the removed
 * fallback verbatim, so an unstripped search would match the prose.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const strip = (s: string) =>
  s
    .split('\n')
    .map((l) => l.replace(/^\s*--.*$/, ''))
    .join('\n');

const raw = read('supabase/migrations/99991791356737_venue_commit_city_coordinate_guard.sql');
const sql = strip(raw);
const oldBlock = sql.slice(sql.indexOf('$old$') + 5, sql.lastIndexOf('$old$'));
const newBlock = sql.slice(sql.indexOf('$new$') + 5, sql.lastIndexOf('$new$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('venue commit city coordinate guard', () => {
  it('replaces exactly the population-ordered cross-country fallback', () => {
    expect(oldBlock).toContain('ORDER BY c.population DESC NULLS LAST');
    expect(newBlock).not.toContain('population');
    expect(sql).toContain('v_new := replace(v_def, c_old_fallback, c_new_fallback);');
  });

  it('refuses to patch silently when the live body has moved', () => {
    expect(sql).toMatch(/if position\(c_old_fallback in v_code\) = 0 then\s+raise exception/);
  });

  it('never crosses a known country, and needs coordinates', () => {
    expect(newBlock).toContain(
      'IF v_city_id IS NULL AND v_country_id IS NULL AND v_lat IS NOT NULL AND v_lng IS NOT NULL THEN',
    );
  });

  it('picks the nearest candidate within 100 km, not the largest', () => {
    expect(newBlock).toContain(
      'public.haversine_m(v_lat, v_lng, c.latitude, c.longitude) <= 100000',
    );
    expect(newBlock).toContain(
      'ORDER BY public.haversine_m(v_lat, v_lng, c.latitude, c.longitude)',
    );
  });

  it('refuses any picked city more than 100 km from the venue', () => {
    const guard = newBlock.slice(
      newBlock.indexOf('IF v_city_id IS NOT NULL AND v_lat IS NOT NULL'),
    );
    expect(guard).toContain('haversine_m(v_lat, v_lng, c.latitude, c.longitude) > 100000');
    expect(guard).toMatch(/IF FOUND THEN\s+v_city_id := NULL;/);
  });

  it('asserts the patch landed, in order, and that the sentinel sees data', () => {
    expect((verify.match(/raise exception/g) ?? []).length).toBe(5);
    expect(verify).toContain("position('ORDER BY c.population DESC NULLS LAST' in v_def) > 0");
    expect(verify).toContain(
      "position('> 100000' in v_def) > position('INSERT INTO public.venues' in v_def)",
    );
    expect(verify).toContain("(v_sig->>'links_checkable')::int, 0) < 1000");
  });

  it('keeps the sentinel off anon', () => {
    expect(sql).toContain(
      'revoke all on function public.venue_city_coord_signals() from public, anon, authenticated;',
    );
    expect(sql).toContain(
      'grant execute on function public.venue_city_coord_signals() to service_role;',
    );
  });

  it('is wired into the health check BEFORE its final exit', () => {
    const health = read('scripts/check-pipeline-health.mjs');
    const call = health.indexOf('/rest/v1/rpc/venue_city_coord_signals');
    const exit = health.lastIndexOf('process.exit(1)');
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(exit);
    expect(health.slice(call, call + 1500)).toContain(
      "console.error('✗ venue_city_coord_signals returned no probe_ok",
    );
  });
});
