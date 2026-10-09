import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The admin-unit rules live twice: in _shared/admin-unit-name.ts (the producer,
 * backfill-venue-cities) and in migration 99991791528780 (the one-shot repair of
 * what the producer already minted). If the two word lists drift, the repair
 * renames rows the producer would still mint under the old label, or misses
 * rows the producer now refuses. This test keeps the lists in step.
 */
const root = process.cwd();
const ts = readFileSync(join(root, 'supabase/functions/_shared/admin-unit-name.ts'), 'utf8');
const sql = readFileSync(
  join(root, 'supabase/migrations/99991791528780_venue_geocode_city_admin_unit_repair.sql'),
  'utf8',
);
const code = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

function words(src: string, re: RegExp): string[] {
  const m = re.exec(src);
  if (!m) throw new Error(`pattern not found: ${re}`);
  return m[1]
    .split('|')
    .map((w) =>
      w
        .replace(/\\s\+/g, ' ')
        .replace(/[()?:]/g, '')
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
    .sort();
}

describe('admin-unit word lists agree between producer and repair', () => {
  it('suffix wrappers', () => {
    const tsWords = words(ts, /const SUFFIX =\s*\/\\s\+\(\?:([^)]+)\)\$/);
    const sqlWords = words(code, /'\\s\+\(([^)]+)\)\$', '', 'i'\)\) as new_name/);
    expect(sqlWords).toEqual(tsWords);
  });

  it('prefix wrappers', () => {
    const tsWords = words(ts, /\(\?:the\\s\+\)\?\(\?:([^)]+)\)\\s\+of/);
    const sqlWords = words(code, /\^\(the\\s\+\)\?\(([^)]+)\)\\s\+of/);
    expect(sqlWords).toEqual(tsWords);
  });
});

describe('repair migration guards', () => {
  it('never renames a township or parish', () => {
    expect(code).toMatch(
      /if exists \(select 1 from _rename where old_name ~\* '\\m\(township\|parish\)\\M'\) then\s+raise exception/,
    );
  });

  it('merges are reversible merge_cities calls, never a DELETE', () => {
    expect(code).toContain('perform public.merge_cities(r.keep_id, r.drop_id, false)');
    expect(code).not.toMatch(/delete\s+from\s+public\.cities/i);
  });

  it('every rename keeps the old label as an alias', () => {
    expect(code).toMatch(
      /insert into public\.city_aliases \(city_id, alias, locale\)\s+values \(r\.id, r\.old_name, null\)/,
    );
  });
});
