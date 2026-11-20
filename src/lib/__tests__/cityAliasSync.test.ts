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
