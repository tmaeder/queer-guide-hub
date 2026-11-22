// Guards 99991795377933_venue_source_position_restore.sql: 67 venues restored to
// their source's coordinates and city after a namesake geocode moved them.
//
// What this stops: a held row slipping into the frozen list, the update losing
// its "still broken" guard (it would then overwrite a concurrent fix), a
// postcondition being neutered, and safety_gated being written by hand.
// Assertions run on COMMENT-STRIPPED sql, because the header names the held rows.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991795377933_venue_source_position_restore.sql';
const raw = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

const valuesBlock = sql.slice(sql.indexOf('insert into _vspr'), sql.indexOf('do $pre$'));
const rows = [...valuesBlock.matchAll(/\('([0-9a-f-]{36})'::uuid, '([^']+)'/g)];

const HELD = [
  'human-rights-campaign-action-center-and-store-1',
  'h-ibiza',
  'the-vault-2',
  'bar-69',
  'canibal-lounge-pub',
  'starbucks-3',
  'bumblebee-creamery',
  'apeler-lake-in-surheide',
];

describe(MIGRATION, () => {
  it('freezes exactly 67 distinct venues', () => {
    expect(rows).toHaveLength(67);
    expect(new Set(rows.map((r) => r[1])).size).toBe(67);
    expect(sql).toMatch(/if \(select count\(\*\) from _vspr\) <> 67 then\s+raise exception/);
  });

  it('touches none of the held rows', () => {
    const slugs = new Set(rows.map((r) => r[2]));
    for (const h of HELD) expect(slugs.has(h), h).toBe(false);
    expect(slugs.has('woodys')).toBe(false);
  });

  it('updates a venue only while it is still off its source point', () => {
    const upd = sql.slice(sql.indexOf('update public.venues v set'), sql.indexOf('do $verify$'));
    expect(upd).toMatch(/public\.haversine_m\(v\.latitude, v\.longitude, f\.lat, f\.lng\) > 50000/);
    expect(upd).toMatch(/v\.city_id is distinct from f\.city_id/);
    expect(upd).not.toMatch(/safety_gated/);
  });

  it('moves the venue-identity org first, and only one that is this venue alone', () => {
    const org = sql.indexOf('update public.organizations o set');
    const venue = sql.indexOf('update public.venues v set');
    expect(org).toBeGreaterThan(0);
    expect(org).toBeLessThan(venue);
    const block = sql.slice(org, venue);
    expect(block).toMatch(/o\.primary_venue_id = v\.id/);
    expect(block).toMatch(/v2\.id <> v\.id/);
  });

  it('keeps every postcondition live', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    for (const p of ['P1', 'P2', 'P3', 'P4', 'P5']) {
      expect(verify, p).toMatch(new RegExp(`raise exception 'venue_source_position_restore ${p}:`));
    }
    expect(verify.match(/if v_bad <> 0 then/g)).toHaveLength(4);
    expect(verify).toMatch(/if v_done < 50 then/);
    expect(verify).not.toMatch(/where false|if \(?false\)? then/);
  });
});

// Follow-up: the one row the exact-name selection missed ("Osaka, Osaka Kita").
describe('99991795378654_venue_source_position_restore_osaka.sql', () => {
  const osaka = readFileSync(
    join(process.cwd(), 'supabase', 'migrations', '99991795378654_venue_source_position_restore_osaka.sql'),
    'utf8',
  )
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');

  it('freezes exactly Hokuoukan, onto Osaka', () => {
    const vals = [...osaka.matchAll(/\('([0-9a-f-]{36})'::uuid, '([^']+)'/g)];
    expect(vals.map((r) => r[2])).toEqual(['hokuoukan']);
    expect(osaka).toMatch(/if \(select count\(\*\) from _vspr\) <> 1 then\s+raise exception/);
  });

  it('keeps the same guards and postconditions as the main restore', () => {
    expect(osaka.indexOf('update public.organizations o set')).toBeLessThan(osaka.indexOf('update public.venues v set'));
    expect(osaka).toMatch(/public\.haversine_m\(v\.latitude, v\.longitude, f\.lat, f\.lng\) > 50000/);
    const verify = osaka.slice(osaka.indexOf('do $verify$'));
    expect(verify.match(/if v_bad <> 0 then/g)).toHaveLength(4);
    expect(verify).toMatch(/if v_done < 1 then/);
  });
});
