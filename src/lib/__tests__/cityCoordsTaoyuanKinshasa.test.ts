import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991791146347_city_coords_taoyuan_kinshasa.sql.
//
// Every write is guarded on the CURRENT wrong value (so a later human fix is
// never overwritten), records what it replaced, and the postconditions assert
// the END STATE against the Wikidata position — not that this file wrote it.

const MIGRATION = '99991791146347_city_coords_taoyuan_kinshasa.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const cityFix = statements.slice(statements.indexOf('update public.cities c\n   set latitude'), statements.indexOf('update public.cities c\n   set region_name'));
const regionFix = statements.slice(statements.indexOf('update public.cities c\n   set region_name'), statements.indexOf('update public.venues v'));
const venueFix = statements.slice(statements.indexOf('update public.venues v'), statements.indexOf('do $verify$'));
const verify = statements.slice(statements.indexOf('do $verify$'));

describe('spans', () => {
  it('found all four', () => {
    for (const s of [cityFix, regionFix, venueFix, verify]) expect(s.length).toBeGreaterThan(200);
  });
});

describe('city coordinates', () => {
  it('writes the Wikidata P625 values', () => {
    expect(cityFix).toContain("'Q115256', 24.991278::numeric, 121.314328::numeric");
    expect(cityFix).toContain("'Q3838', -4.321944::numeric, 15.311944::numeric");
  });

  it('is guarded on the QID and on the current wrong value', () => {
    expect(cityFix).toMatch(/and c\.wikidata_qid = v\.qid/);
    expect(cityFix).toMatch(/round\(c\.latitude::numeric, 4\) = round\(v\.bad_lat, 4\)/);
    expect(cityFix).toMatch(/round\(c\.longitude::numeric, 4\) = round\(v\.bad_lng, 4\)/);
  });

  it('records the replaced value', () => {
    expect(cityFix.match(/'corrected', jsonb_build_object\('from', c\.(latitude|longitude)/g)).toHaveLength(2);
  });
});

describe('region', () => {
  it('fills only an empty region_name with a value that resolves back, within 100 km', () => {
    expect(regionFix).toMatch(/nullif\(btrim\(c\.region_name\), ''\) is null/);
    expect(regionFix).toMatch(/resolve_region_code\(co\.code, s\.name\) = s\.code/);
    expect(regionFix).toMatch(/<= 100000(?!\d)/);
  });
});

describe('venue', () => {
  it('takes its coordinates from its own source and only from the wrong value', () => {
    expect(venueFix).toMatch(/round\(v\.latitude::numeric, 4\) = 22\.6344/);
    expect(venueFix).toMatch(/payload->'normalized'->'location'->>'lat'\)::numeric = 24\.994774/);
    expect(venueFix).toMatch(/'coords_corrected'/);
  });
});

describe('postconditions', () => {
  it('raise on distance, region and venue placement', () => {
    expect(verify).toMatch(/if v_km is null or v_km > 25 then\s+raise exception 'P1 failed/);
    expect(verify).toMatch(/c\.region_code = r\.code\) then\s+raise exception 'P2 failed/);
    expect(verify).toMatch(/v_km > 25 then\s+raise exception 'P3 failed/);
  });
});
