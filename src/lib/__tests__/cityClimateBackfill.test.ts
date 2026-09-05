import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `backfill-city-climate.mjs` fills `cities.climate_type` (empty on 4,985 of
 * 5,489) from the Beck et al. (2023) Köppen-Geiger raster.
 *
 * Three properties are load-bearing:
 *
 * 1. THE PRESENT-DAY PERIOD. The same archive ships 2041-2070 and 2071-2099
 *    under seven SSP scenarios, in identically-named files. Picking the wrong
 *    directory is invisible in the output — every city still gets a plausible
 *    class — so the period is pinned and the download is deliberately manual.
 *
 * 2. THE COLUMN STORES PROSE, NOT CODES. The 95 pre-existing values read
 *    "oceanic climate", "hot-summer Mediterranean climate" — Wikidata P2564
 *    labels. Emitting "Cfb" would fork the column into two formats.
 *
 * 3. COMPARISON IS AT THE KÖPPEN FAMILY LEVEL. The stored vocabulary mixes
 *    granularity ("Mediterranean climate" beside "hot-summer Mediterranean
 *    climate"), so exact-label comparison counted correct-but-coarser values as
 *    disagreements and reported 57%; family-level comparison reports 80%. The
 *    remaining conflicts were dominated by same-name city collisions in our own
 *    data, which is why this job never auto-corrects.
 */

const SCRIPT = join(process.cwd(), 'scripts', 'data-quality', 'backfill-city-climate.mjs');
const src = readFileSync(SCRIPT, 'utf8');

describe('city climate backfill', () => {
  it('uses the present-day period, not a projection', () => {
    expect(src).toMatch(/1991_2020/);
    // No SSP scenario path should be reachable.
    expect(src).not.toMatch(/ssp\d{3}\//);
  });

  it('emits the prose vocabulary the column already uses, not Köppen codes', () => {
    expect(src).toMatch(/'oceanic climate'/);
    expect(src).toMatch(/'hot-summer Mediterranean climate'/);
    expect(src).toMatch(/climate_type: c\.computed\.label/);
    // The code is kept for provenance, in the audit row's external_id.
    expect(src).toMatch(/external_id: c\.computed\.code/);
  });

  it('maps all 30 Köppen classes', () => {
    const entries = src.match(/^\s{2}\d+:\s+\['[A-Z][A-Za-z]{0,2}',/gm) ?? [];
    expect(entries.length).toBe(30);
  });

  it('treats the no-data value as unknown rather than a class', () => {
    // 0 is ocean in this archive; a coastal centroid lands on it legitimately.
    expect(src).toMatch(/KOPPEN\[v\] \? \{/);
    expect(src).toMatch(/ocean\b/i);
  });

  it('handles the negative Y resolution GeoTIFF reports for north-up images', () => {
    // Using it unsigned flips the hemisphere and every lookup is silently wrong.
    expect(src).toMatch(/Math\.abs\(ryRaw\)/);
    expect(src).toMatch(/maxY - lat/);
  });

  it('probes both hemispheres and aborts the run if the probe misses', () => {
    expect(src).toMatch(/\['Sydney', -33\./); // southern hemisphere
    expect(src).toMatch(/refusing to read .* cities out of a misaligned grid/);
  });

  it('compares at the Köppen family level, not by label equality', () => {
    expect(src).toMatch(/STORED_TO_PREFIX/);
    expect(src).toMatch(/got\.code\.startsWith\(pfx\)/);
    // "stored is coarser" must be reported as compatible, not as a conflict.
    expect(src).toMatch(/stored is coarser/);
  });

  it('never auto-corrects an existing value', () => {
    // The only UPDATE path is guarded on the column still being null.
    expect(src).toMatch(/climate_type=is\.null/);
    expect(src).not.toMatch(/const changes = v\.conflict/);
    expect(src).toMatch(/are NOT corrected by this job/);
  });

  it('writes the audit row before the update, under one batch id', () => {
    const auditAt = src.indexOf('external_correction_audit');
    const patchAt = src.indexOf("method: 'PATCH'");
    expect(auditAt).toBeGreaterThan(-1);
    expect(auditAt).toBeLessThan(patchAt);
    expect(src).toMatch(/rollback_external_correction_batch/);
  });

  it('excludes the tmp- placeholder cohort and Null Island', () => {
    expect(src).toMatch(/slug=not\.like\.tmp-\*/);
    expect(src).toMatch(/lat === 0 && lon === 0/);
  });

  it('cites the source, which CC BY 4.0 requires', () => {
    expect(src).toMatch(/Beck et al\. \(2023\)/);
    expect(src).toMatch(/CC BY 4\.0/);
  });
});

describe('stored-label to Köppen prefix mapping', () => {
  // Re-derive the table from the script so the test cannot drift from it.
  const block = src.slice(
    src.indexOf('const STORED_TO_PREFIX'),
    src.indexOf('function storedPrefix'),
  );
  const pairs = [...block.matchAll(/\['([^']+)',\s*'([A-Z][A-Za-z]{0,2})'\]/g)].map(
    ([, pat, code]) => [pat, code] as const,
  );

  it('is non-empty and covers the coarse labels that caused the false 57%', () => {
    const map = new Map(pairs);
    expect(map.get('mediterranean')).toBe('Cs');
    expect(map.get('tropical')).toBe('A');
    expect(map.get('continental')).toBe('D');
    expect(map.get('marine west coast')).toBe('Cfb'); // exact synonym for oceanic
    expect(map.get('oceanic')).toBe('Cfb');
  });

  it('puts more specific patterns where longest-match resolves them correctly', () => {
    // "hot desert" must beat "desert"; the resolver picks the longest match, so
    // both must be present and the specific one must be strictly longer.
    const map = new Map(pairs);
    expect(map.get('desert')).toBe('BW');
    expect(map.get('hot desert')).toBe('BWh');
    expect('hot desert'.length).toBeGreaterThan('desert'.length);
    expect(map.get('semi arid')).toBe('BS');
    expect(map.get('cold semi arid')).toBe('BSk');
  });

  it('never maps a coarse label to a more specific code than it asserts', () => {
    // "Mediterranean climate" asserts Cs, not Csa — mapping it to Csa would
    // make a genuine Csb city look like a conflict.
    for (const [pat, code] of pairs) {
      if (pat === 'mediterranean') expect(code.length).toBeLessThanOrEqual(2);
      if (pat === 'tropical') expect(code.length).toBe(1);
      if (pat === 'continental') expect(code.length).toBe(1);
    }
  });
});
