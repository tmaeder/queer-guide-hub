import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// zzz_venue_gate_to_org must fire on EVERY venue UPDATE. venues.safety_gated is
// derived by a BEFORE trigger, so a statement that changes only category or
// country changes the gate without naming the column, and a column-scoped
// `after update of safety_gated` never fires. Measured 2026-11-27: a
// cruising -> sauna restore left 99 organizations gated over ungated venues,
// and the reverse direction leaves an organization public over a gated venue.
// See 99991795802813_venue_gate_to_org_unscoped.sql.

const MIG_DIR = join(process.cwd(), 'supabase/migrations');

const stripped = (f: string) =>
  readFileSync(join(MIG_DIR, f), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');

const definitions = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => ({ f, sql: stripped(f) }))
  .filter(({ sql }) => /create trigger zzz_venue_gate_to_org\b/.test(sql));

const latest = definitions[definitions.length - 1];
const statement = (() => {
  const i = latest.sql.lastIndexOf('create trigger zzz_venue_gate_to_org');
  return latest.sql.slice(i, latest.sql.indexOf(';', i));
})();

describe('zzz_venue_gate_to_org', () => {
  it('is defined by the unscoped migration or a later one', () => {
    expect(definitions.length).toBeGreaterThanOrEqual(2);
    expect(latest.f >= '99991795802813_venue_gate_to_org_unscoped.sql').toBe(true);
  });

  it('fires on every venue UPDATE, with no column list', () => {
    expect(statement).toMatch(/after update on public\.venues/);
    expect(statement).not.toMatch(/after update of /);
  });

  it('still runs only when the gate or the merge target changed', () => {
    expect(statement).toMatch(/old\.safety_gated is distinct from new\.safety_gated/);
    expect(statement).toMatch(/old\.duplicate_of_id is distinct from new\.duplicate_of_id/);
    expect(statement).toMatch(/execute function public\.propagate_venue_gate_to_organization\(\)/);
  });

  it('proves the fix behaviourally and raises on failure', () => {
    expect(latest.sql).toMatch(
      /update public\.venues set category = 'cruising' where id = v_venue/,
    );
    for (const label of ['P1', 'P2', 'P3', 'P4']) {
      expect(latest.sql).toMatch(new RegExp(`raise exception '${label} failed`));
    }
  });
});
