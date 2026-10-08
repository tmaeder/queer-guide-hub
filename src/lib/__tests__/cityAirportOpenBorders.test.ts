import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Migration 99991791495998 patches run_city_airport_link in place (via
 * pg_get_functiondef + exactly-once anchors) so that:
 *
 *   1. a foreign airport is a candidate only across an OPEN border
 *      (open_border_countries, Schengen + MC/SM/VA). Dropping the country
 *      filter outright was measured and rejected: it sent Brahmanbaria (BD) to
 *      Agartala (IN) and Ras al-Ayn (SY) into Turkey.
 *   2. airport size ranks before Wikipedia prominence, so Aachen books MST
 *      (large, 27 km) rather than LGG (medium). Size-then-DISTANCE was rejected
 *      on a prod dry run: it replaced JFK with LGA, GRU with CGH, PVG with SHA.
 *   3. rows linked under the old rule are re-offered to the nightly cron via a
 *      `rule` stamp, rather than by a bulk UPDATE inside db push.
 *
 * Text checks over comment-stripped SQL: the header quotes several of the
 * phrases asserted here.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const file = readdirSync(MIGRATIONS).find((f) => f.endsWith('_city_airport_link_open_borders.sql'));
const raw = readFileSync(join(MIGRATIONS, file!), 'utf8');
const sql = raw
  .split('\n')
  .filter((line) => !/^\s*--/.test(line))
  .join('\n');

function constant(name: string): string {
  const m = sql.match(new RegExp(`${name}\\s+constant\\s+text\\s*:=\\s*'([\\s\\S]*?)';\\n`));
  return m?.[1] ?? '';
}

describe('run_city_airport_link open-border patch', () => {
  it('exists', () => expect(file).toBeTruthy());

  it('admits a foreign airport only via countries_share_open_border', () => {
    const b = constant('b_country');
    expect(b).toMatch(/s\.country_code\s*=\s*r\.country_code/);
    expect(b).toMatch(
      /OR\s+public\.countries_share_open_border\(s\.country_code,\s*r\.country_code\)/,
    );
  });

  it('seeds Schengen, and not countries with hard borders', () => {
    const start = sql.indexOf('insert into public.open_border_countries');
    const seed = sql.slice(start, sql.indexOf('on conflict', start));
    expect(seed.length).toBeGreaterThan(100);
    for (const cc of ['DE', 'NL', 'BE', 'FR', 'CH', 'LU', 'LI', 'IT', 'AT']) {
      expect(seed).toContain(`('${cc}','schengen'`);
    }
    for (const cc of [
      'AD',
      'GB',
      'IE',
      'BD',
      'IN',
      'SY',
      'TR',
      'MA',
      'AL',
      'ME',
      'US',
      'CA',
      'MX',
    ]) {
      expect(seed).not.toContain(`('${cc}',`);
    }
  });

  it('ranks size before prominence, prominence before distance', () => {
    const w = constant('b_window');
    const iLocal = w.indexOf('is_local');
    const iSize = w.indexOf('large_airport');
    const iSite = w.indexOf('sitelinks');
    const iDist = w.indexOf('dist_km');
    expect(iLocal).toBeGreaterThanOrEqual(0);
    expect(iLocal).toBeLessThan(iSize);
    expect(iSize).toBeLessThan(iSite);
    expect(iSite).toBeLessThan(iDist);
  });

  it('stamps and selects on the rule version so the cron re-derives old links', () => {
    expect(constant('b_stamp')).toMatch(/''rule'',\s*''open_borders_v1''/);
    expect(constant('b_select')).toMatch(
      /''city_airport_link''->>''rule''[\s\S]*<>\s*''open_borders_v1''/,
    );
  });

  it('refuses to patch unless every anchor matches exactly once', () => {
    for (const a of ['a_country', 'a_window', 'a_select', 'a_stamp']) {
      expect(sql).toMatch(
        new RegExp(`replace\\(v_def,\\s*${a},\\s*''\\)\\)\\)\\s*/\\s*length\\(${a}\\)`),
      );
    }
    expect((sql.match(/if v_count <> 1 then\s*\n\s*raise exception/g) ?? []).length).toBe(4);
  });

  it('does no bulk UPDATE of cities inside the migration', () => {
    expect(sql).not.toMatch(/update\s+public\.cities/i);
  });

  it('asserts the hard borders in its postconditions', () => {
    expect(sql).toMatch(
      /if public\.countries_share_open_border\('BD', 'IN'\) then\s*\n\s*raise exception/,
    );
    expect(sql).toMatch(
      /if public\.countries_share_open_border\('AD', 'FR'\) then\s*\n\s*raise exception/,
    );
  });
});
