import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/99991795161280_city_alias_sync_and_duplicate_signals.sql',
  'utf8',
)
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');
const health = readFileSync('scripts/check-pipeline-health.mjs', 'utf8');

describe('city alias sync', () => {
  it('runs after the geo spine trigger, which creates the profile the alias FK needs', () => {
    expect(sql).toMatch(
      /create trigger trg_zz_city_alias_sync\s+after insert or update of name, name_local on public\.cities/,
    );
    expect('trg_zz_city_alias_sync' > 'trg_sync_geo_spine').toBe(true);
  });

  it('keeps name, name_local and the previous name on rename', () => {
    expect(sql).toContain('(new.name, null::text)');
    expect(sql).toContain('(new.name_local, new.name_local_lang)');
    expect(sql).toMatch(/old\.name is distinct from new\.name then old\.name/);
  });

  it('never writes the generated alias_key column', () => {
    expect(sql).not.toMatch(/city_aliases \([^)]*alias_key/);
  });

  it('is wired into the health check before the terminal exit', () => {
    const i = health.indexOf('/rest/v1/rpc/city_name_twin_signals');
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(health.lastIndexOf('process.exit(1)'));
  });
});

describe('city alias collision guard', () => {
  it('skips (returns null) an alias that is another live city name in the same country', () => {
    const g = sql.slice(
      sql.indexOf('function public.city_alias_reject_collision'),
      sql.indexOf('function public.city_alias_sync'),
    );
    expect(g).toMatch(
      /b\.country_id = v_country and b\.id <> new\.city_id[\s\S]*b\.duplicate_of_id is null[\s\S]*return null;/,
    );
    expect(sql).toMatch(
      /create trigger trg_city_alias_reject_collision\s+before insert or update of alias, city_id on public\.city_aliases/,
    );
  });

  it('deletes existing collisions only after the merges', () => {
    expect(sql.indexOf('delete from public.city_aliases')).toBeGreaterThan(
      sql.indexOf('perform public.merge_cities'),
    );
  });

  it('hard-fails the health check on any colliding alias', () => {
    expect(health).toMatch(/sig\.colliding_aliases > 0\) \{[\s\S]{0,300}FAILED = true/);
  });
});

describe('city alias guard allows a city its own name', () => {
  const fix = readFileSync(
    'supabase/migrations/99991795168229_city_alias_guard_allows_own_name.sql',
    'utf8',
  )
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

  it('returns the row before the collision check when the alias is the city own key', () => {
    const own = fix.indexOf('if v_key is not distinct from v_own_key then');
    const collide = fix.indexOf('b.canonical_key = v_key');
    expect(own).toBeGreaterThan(0);
    expect(fix.slice(own, own + 80)).toContain('return new');
    expect(collide).toBeGreaterThan(own);
  });
});

describe('parish rows are not cities', () => {
  const parish = readFileSync(
    'supabase/migrations/99991795168793_city_parish_rows_cleanup.sql',
    'utf8',
  )
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

  it('moves venues off the parish rows before archiving them', () => {
    expect(parish.indexOf('update public.venues v set city_id = t.cid')).toBeLessThan(
      parish.indexOf('archive_city_as_nonplace'),
    );
  });

  it('teaches the non-place check that a Parroquia name is a subdivision', () => {
    expect(parish).toContain("when p_name ~* '^\\s*parroquia\\s' then 'admin_subdivision'");
    expect(parish).toContain(
      "when p_name ~* '^\\s*(rt|rw)\\s*\\.?\\s*\\d+' then 'neighbourhood_unit'",
    );
  });
});

describe('district rows are not cities', () => {
  const district = readFileSync(
    'supabase/migrations/99991795170139_city_district_rows_cleanup.sql',
    'utf8',
  )
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

  it('keeps the parish rule when restating the non-place check', () => {
    expect(district).toContain("when p_name ~* '^\\s*parroquia\\s' then 'admin_subdivision'");
    expect(district).toContain(
      "when p_name ~* '^\\s*(barrio|bairro)\\s' then 'neighbourhood_unit'",
    );
  });

  it('does not treat Colonia as a non-place (Colonia del Sacramento is a town)', () => {
    expect(district).not.toMatch(/when p_name ~\* '\^\\s\*\(?colonia/);
  });
});
