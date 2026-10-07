import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991791317657: six Zürich party series archived as non-venues through
 * decide_venue_nonvenue (reversible). Text check, comments stripped first.
 */

const raw = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '99991791317657_zuerich_party_series_nonvenues.sql',
  ),
  'utf8',
);
const sql = raw
  .split('\n')
  .map((l) => l.replace(/^\s*--.*$/, ''))
  .join('\n');

const IDS = [
  '75a2ae0e-77ee-43d2-b302-51b37e52091e',
  '93f62f60-5b01-45d7-846f-da714d14d745',
  '865e5e57-b16a-4497-8fc1-a1aa9d22cd72',
  '4366abd0-05ac-424b-8229-854e7b36c0e0',
  '59fcf6f3-90db-4e0d-b16c-4a3c213aa932',
  '125243c6-bd77-43a0-9229-11b0b5325c71',
];

describe('zuerich party series non-venues', () => {
  it('archives exactly the six reviewed rows', () => {
    const ids = [...sql.matchAll(/"id":"([0-9a-f-]{36})"/g)].map((m) => m[1]);
    expect(ids).toEqual(IDS);
  });

  it('never touches Heaven Club or the already-archived NIGHT PRIDE', () => {
    expect(sql).not.toContain('6bada896-6e57-4ca6-9c5b-5d819c8f540f');
    expect(sql).not.toContain('798cb20b-5c6f-4202-ab65-7c36787f2fb3');
  });

  it('archives through decide_venue_nonvenue, never a DELETE on venues', () => {
    expect(sql).toMatch(/public\.decide_venue_nonvenue\(\s*r\.id,\s*true,/);
    expect(sql).not.toMatch(/delete\s+from\s+public\.venues/i);
  });

  it('skips already-archived rows so the restore snapshot is not overwritten', () => {
    const skip = sql.indexOf("v.review_status = 'archived') then");
    const decide = sql.indexOf('public.decide_venue_nonvenue(');
    expect(skip).toBeGreaterThan(-1);
    expect(decide).toBeGreaterThan(skip);
  });

  it('asserts archived, deindexed, evicted from search and restorable', () => {
    expect(sql).toContain('if v_indexable <> 0 then');
    expect(sql).toContain('if v_in_search <> 0 then');
    expect(sql).toContain('if v_restorable <> v_archived_n then');
    expect(sql).toContain('if v_unfinished <> 0 then');
  });
});
