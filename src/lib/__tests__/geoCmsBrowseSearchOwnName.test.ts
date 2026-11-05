import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards 99991793867420_geography_search_own_name_only: the admin geography
// search must match a place by its OWN name only, so a city's districts are
// reached by expanding the city instead of being listed beside it.

const DIR = join(process.cwd(), 'supabase/migrations');

function latestDefinition(): string {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(DIR, files[i]), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    const start = sql.search(/create or replace function api_private\.geo_cms_browse\(/i);
    if (start >= 0) return sql.slice(start, sql.indexOf('end $function$', start));
  }
  throw new Error('no definition of api_private.geo_cms_browse found');
}

describe('geo_cms_browse search arm', () => {
  const body = latestDefinition();
  const searchArm = body.slice(
    body.indexOf('when v_q is not null'),
    body.indexOf('when p_type is not null or p_status'),
  );

  it('finds the search arm', () => {
    expect(searchArm.length).toBeGreaterThan(50);
  });

  it('matches the place by its own name', () => {
    expect(searchArm).toMatch(/g\.name ilike '%'\|\|v_q\|\|'%'/);
  });

  it('never matches a place by its country or city name', () => {
    expect(searchArm).not.toMatch(/\bor co\.name ilike/);
    expect(searchArm).not.toMatch(/\bor exists\(select 1 from cities/);
  });

  it('drops a match whose ancestor also matches, unless a type/status filter can hide that ancestor', () => {
    expect(searchArm).toMatch(/p_type is not null or p_status is not null or not \(/);
    expect(searchArm).toMatch(/co\.name ilike '%'\|\|v_q/);
    expect(searchArm).toMatch(/ci\.name ilike '%'\|\|v_q/);
  });
});
