import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * api_private.gated_count_for_location() must reach a location's rows through
 * city_id / country_id, never through a single catch-all predicate.
 *
 * The old body filtered all four tables with
 * `(p_country_id IS NULL OR country_id = p_country_id)`, which a SECURITY
 * DEFINER SQL function plans once for every argument, so no index applied:
 * 258 ms and 47,720 buffers for Berlin, and 182 statement timeouts in 24h
 * (2026-10-31). The guard reads the LATEST migration defining the function.
 */
const DIR = join(process.cwd(), 'supabase/migrations');

function latestBody(): string {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(DIR, files[i]), 'utf8');
    const m = sql.match(
      /create\s+(?:or\s+replace\s+)?function\s+api_private\.gated_count_for_location\([\s\S]*?\$function\$([\s\S]*?)\$function\$/i,
    );
    if (m) return m[1];
  }
  throw new Error('no migration defines api_private.gated_count_for_location');
}

describe('gated_count_for_location query paths', () => {
  const body = latestBody();
  const cityBranch = body.slice(
    body.search(/if\s+p_city_id\s+is\s+not\s+null/i),
    body.search(/elsif/i),
  );
  const countryBranch = body.slice(
    body.search(/elsif\s+p_country_id\s+is\s+not\s+null/i),
    body.search(/\belse\b/i),
  );

  it('branches on which arguments are set', () => {
    expect(body).toMatch(/if\s+p_city_id\s+is\s+not\s+null/i);
    expect(body).toMatch(/elsif\s+p_country_id\s+is\s+not\s+null/i);
  });

  it('filters every table by city_id directly in the city branch', () => {
    for (const t of ['venues', 'events', 'organizations', 'queer_villages']) {
      expect(cityBranch).toMatch(
        new RegExp(
          `from\\s+public\\.${t}\\s+\\w+\\s+where\\s+\\w+\\.city_id\\s*=\\s*p_city_id`,
          'i',
        ),
      );
    }
    expect(cityBranch).not.toMatch(/p_city_id\s+is\s+null/i);
  });

  it('filters every table by country_id directly in the country branch', () => {
    for (const t of ['venues', 'events', 'organizations', 'queer_villages']) {
      expect(countryBranch).toMatch(
        new RegExp(
          `from\\s+public\\.${t}\\s+\\w+\\s+where\\s+\\w+\\.country_id\\s*=\\s*p_country_id`,
          'i',
        ),
      );
    }
    expect(countryBranch).not.toMatch(/is\s+null\s+or/i);
  });

  it('still reports high_risk', () => {
    expect(body).toMatch(
      /'high_risk'\s*,\s*public\.location_is_high_risk\(p_country_id,\s*p_city_id\)/i,
    );
  });
});
