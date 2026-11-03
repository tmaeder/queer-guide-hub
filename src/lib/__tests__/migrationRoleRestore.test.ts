import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A migration that switches role (to simulate anon or an admin in a
 * postcondition) must switch back to the role it started as, never `reset role`.
 *
 * `supabase db push` logs in as a temporary CLI role and then switches to
 * postgres. `reset role` returns to that login role, which has no USAGE on
 * schema public, so the next statement fails with 42501. That is how
 * 99991793675514 failed its first deploy on 2026-11-03 — and, being the first
 * unapplied migration, it blocked every migration queued behind it. A dry run
 * through a connection that logs in as postgres cannot see this, because there
 * `reset role` happens to land on postgres.
 */
const FILE = join(
  process.cwd(),
  'supabase/migrations/99991793675514_marketplace_brand_directory_adult_only_active.sql',
);

function code(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');
}

describe('99991793675514 role handling', () => {
  const sql = code(readFileSync(FILE, 'utf8'));

  it('never uses reset role', () => {
    expect(sql).not.toMatch(/\breset\s+role\b/i);
  });

  it('captures the starting role and restores it after each switch', () => {
    expect(sql).toMatch(/v_role\s+text\s*:=\s*current_user/i);
    const switches = sql.match(/set\s+local\s+role\s+(anon|authenticated)\b/gi) ?? [];
    const restores =
      sql.match(/execute\s+format\(\s*'set local role %I'\s*,\s*v_role\s*\)/gi) ?? [];
    expect(switches.length).toBe(2);
    expect(restores.length).toBe(switches.length);
  });
});
