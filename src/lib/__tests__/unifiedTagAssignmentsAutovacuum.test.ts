import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '99991793467979_unified_tag_assignments_autovacuum_thresholds';
const sql = readFileSync(
  resolve(__dirname, `../../../supabase/migrations/${MIGRATION}.sql`),
  'utf8',
);
const code = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const setting = (name: string) => {
  const m = code.match(new RegExp(`\\b${name}\\s*=\\s*([0-9.]+)`));
  return m ? Number(m[1]) : undefined;
};

describe('unified_tag_assignments autovacuum thresholds', () => {
  it('targets unified_tag_assignments only', () => {
    expect(code).toMatch(/alter table public\.unified_tag_assignments set \(/);
    expect(code.match(/alter table/gi)).toHaveLength(1);
  });

  it('makes the dead-tuple, insert and analyze triggers absolute (scale factor 0)', () => {
    expect(setting('autovacuum_vacuum_scale_factor')).toBe(0);
    expect(setting('autovacuum_vacuum_insert_scale_factor')).toBe(0);
    expect(setting('autovacuum_analyze_scale_factor')).toBe(0);
  });

  it('keeps every threshold small enough to fire within days at ~1k changes/day', () => {
    for (const k of [
      'autovacuum_vacuum_threshold',
      'autovacuum_vacuum_insert_threshold',
      'autovacuum_analyze_threshold',
    ]) {
      const v = setting(k);
      expect(v, k).toBeGreaterThan(0);
      expect(v, k).toBeLessThanOrEqual(5000);
    }
  });

  it('bounds the lock wait and does not try to VACUUM inside the transaction', () => {
    expect(code.indexOf("set local lock_timeout = '10s'")).toBeGreaterThanOrEqual(0);
    expect(code.indexOf('lock_timeout')).toBeLessThan(code.indexOf('alter table'));
    expect(code).not.toMatch(/^\s*vacuum\b/im);
  });
});
