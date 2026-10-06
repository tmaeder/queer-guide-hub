import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 99991791233856 creates 17 same-name twins and moves the events and venues
 * that belong to them. Properties a later edit could quietly undo:
 *  - twins are created through city_resolve_or_create (the only writer),
 *    each with a live-resolved QID and the expected region;
 *  - an event moves only on two signals (gaycities metro, or state text AND
 *    coordinates within 25 km); a venue only on state text AND coordinates;
 *  - Hammond IN and Orange CA, which have one signal, are NOT created;
 *  - College Park MD gets its region first, guarded by distance.
 * Asserts run over comment-stripped SQL.
 */
const raw = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '99991791233856_city_region_twins_relink.sql'),
  'utf8',
);
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');
const slice = (from: string, to: string) => {
  const a = sql.indexOf(from);
  const b = sql.indexOf(to, a + from.length);
  return a >= 0 && b > a ? sql.slice(a, b) : '';
};

const twins = slice('insert into _twin values', ';');
const ev = slice('create temp table _ev', 'delete from _ev');
const vn = slice('create temp table _vn', 'delete from _vn');
const verify = slice('do $verify$', '$verify$;');

describe('city region twins relink', () => {
  it('slices every section', () => {
    for (const [k, s] of Object.entries({ twins, ev, vn, verify })) {
      expect(s.length, `${k} empty`).toBeGreaterThan(100);
    }
  });

  it('declares exactly 17 twins, each with a QID and a region code', () => {
    const rows = twins.match(/\('[^']+',\s*'[^']+',\s*'US-[A-Z]{2}',\s*'Q\d+'/g) ?? [];
    expect(rows).toHaveLength(17);
    expect(new Set(rows.map((r) => r.match(/'Q\d+'/)![0])).size).toBe(17);
  });

  it('does not create the one-signal cities', () => {
    expect(twins).not.toMatch(/'Hammond'/);
    expect(twins).not.toMatch(/'Orange'/);
    expect(verify).toMatch(/e\.city in \('Hammond', 'Orange'\)/);
  });

  it('creates twins only through the resolver, as admin', () => {
    expect(sql).not.toMatch(/insert\s+into\s+public\.cities/i);
    expect(sql).toMatch(/public\.city_resolve_or_create\(\s*t\.name,/);
    expect(sql).toMatch(/p_actor\s*=>\s*'admin'/);
    expect(sql).toMatch(/raise exception 'twin creation failed: %'/);
  });

  it('links an event only on metro, or on state AND coordinates', () => {
    expect(ev).toMatch(
      /m\.metro is not null\s+or \( public\.resolve_region_code\('US', e\.state\) = t\.code\s+and e\.latitude is not null\s+and public\.haversine_m\(e\.latitude, e\.longitude, t\.lat, t\.lng\) < 25000 \)/,
    );
    expect(ev).toMatch(/e\.city_id is null/);
    expect(ev).toMatch(/event_city_link' \? 'blocked'/);
  });

  it('moves a venue only on state AND coordinates, and never off its own region', () => {
    expect(vn).toMatch(/public\.resolve_region_code\('US', v\.state\) = t\.code/);
    expect(vn).toMatch(/public\.haversine_m\(v\.latitude, v\.longitude, t\.lat, t\.lng\) < 25000/);
    expect(vn).toMatch(/cur\.region_code is distinct from t\.code/);
  });

  it('keeps the blocked stamp instead of erasing it', () => {
    expect(sql).toMatch(/'previous_block', e\.enrichment_status->'event_city_link'/);
  });

  it('gives College Park, Maryland its region first, guarded by distance', () => {
    const cp = sql.indexOf("set region_name = 'Maryland'");
    expect(cp).toBeGreaterThan(-1);
    expect(cp).toBeLessThan(sql.indexOf('city_resolve_or_create('));
    expect(sql).toMatch(/haversine_m\(c\.latitude, c\.longitude, 38\.9967, -76\.9275\) < 5000/);
  });

  it('asserts the end state', () => {
    for (const p of ['P1', 'P2', 'P3', 'P3b', 'P4', 'P5', 'P6', 'P7', 'P8']) {
      expect(verify).toContain(`'${p} failed`);
    }
    expect(verify).toMatch(/if v_n <> 17 then\s+raise exception 'P1 failed/);
  });

  it('keeps the sentinel away from anon', () => {
    expect(sql).toMatch(/revoke all on function public\.venue_city_text_signals\(\) from public, anon, authenticated;/);
  });
});
