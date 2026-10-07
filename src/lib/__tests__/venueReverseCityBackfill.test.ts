import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991791394382 + backfill-venue-cities' reverse loop: city_id filled
 * from a venue's own coordinates, visit-once, and never to a city the
 * coordinates contradict.
 *
 * Comment-stripped: the headers quote the old treadmill selector and the
 * unguarded link, which would satisfy a raw toContain.
 */

const strip = (s: string) =>
  s
    .split('\n')
    .map((l) => l.replace(/^\s*--.*$/, '').replace(/^\s*\/\/.*$/, ''))
    .join('\n');

const sql = strip(
  readFileSync(
    join(process.cwd(), 'supabase', 'migrations', '99991791394382_venue_reverse_city_backfill.sql'),
    'utf8',
  ),
);
const fn = strip(
  readFileSync(join(process.cwd(), 'supabase', 'functions', 'backfill-venue-cities', 'index.ts'), 'utf8'),
);

const selector = sql.slice(sql.indexOf('function public.venues_due_for_reverse_city'), sql.indexOf('revoke all'));
const apply = sql.slice(
  sql.indexOf('function public.venue_apply_reverse_city'),
  sql.indexOf('revoke all on function public.venue_apply_reverse_city'),
);
const verify = sql.slice(sql.indexOf('do $verify$'));
const loop = fn.slice(fn.indexOf('async function processReverse'), fn.indexOf('function isUsableAddress'));

describe('venue reverse-city backfill', () => {
  it('selector is visit-once and prioritises the step-2 detaches, cruising last', () => {
    expect(selector).toContain("not (coalesce(v.enrichment_status, '{}'::jsonb) ? 'reverse_city')");
    expect(selector).toMatch(/\? 'city_namesake_repair'\) desc,\s+\(v\.category = 'cruising'\) asc/);
    expect(selector).toContain('v.closed_at is null');
  });

  it('links only a live city within 100 km and in the venue country', () => {
    expect(apply).toMatch(/haversine_m\(v\.latitude, v\.longitude, c\.latitude, c\.longitude\) > 100000 then\s+v_status := 'rejected_too_far'/);
    expect(apply).toMatch(/c\.country_id <> v\.country_id then\s+v_status := 'rejected_country_conflict'/);
    expect(apply).toContain("v_status := 'rejected_city_not_live'");
    expect(apply).toMatch(/v_status := 'matched';\s+v_city := c\.id;/);
    expect(apply).toContain('set city_id    = coalesce(v_city, u.city_id)');
  });

  it('stamps the visit in the same UPDATE that links', () => {
    expect(apply).toContain("jsonb_build_object('reverse_city', jsonb_build_object(");
    expect(apply).toContain('and u.city_id is null;');
    expect((apply.match(/update public\.venues/g) ?? []).length).toBe(1);
  });

  it('is service_role only and the cron posts the new mode name', () => {
    expect(sql).toContain('grant execute on function public.venues_due_for_reverse_city(int) to service_role');
    expect(sql).toContain('grant execute on function public.venue_apply_reverse_city(uuid, text, uuid, text) to service_role');
    expect(sql).toContain("body := jsonb_build_object('mode', 'reverse_city', 'batch_size', 40)");
    expect((verify.match(/raise exception/g) ?? []).length).toBe(4);
  });

  it('edge loop uses the SQL selector + writer, stops on transport errors, honours the deadline', () => {
    expect(loop).toContain("supabase.rpc('venues_due_for_reverse_city'");
    expect(loop).toContain("supabase.rpc('venue_apply_reverse_city'");
    expect(loop).not.toMatch(/from\('venues'\)\s*\.update/);
    expect(loop).toMatch(/if \(transportError\) \{[\s\S]{0,120}break/);
    expect(loop).toContain('if (Date.now() - startedAt > MAX_RUN_MS) break');
    expect(fn).toMatch(/case 'reverse':\s+case 'reverse_city':/);
  });
});
