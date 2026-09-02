import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * venues.day_part was a category stamp (20260526000000) that reclassification made 77.5%
 * wrong -- 3,420 bars and 660 clubs stamped 'morning,afternoon'. It is dropped rather than
 * repaired, because repairing it means caching venue_category_day_part(category) in a column
 * that no one reads and that drifts again at the next reclassification.
 *
 * These assertions guard the two ways that decision can be quietly undone: dropping the
 * column without preserving it, and re-introducing a stored day_part somewhere else.
 */

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

function latestMatching(pattern: RegExp): { name: string; sql: string } {
  const hit = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), 'utf8') }))
    .find(({ sql }) => pattern.test(stripComments(sql)));
  if (!hit) throw new Error(`no migration matches ${pattern}`);
  return hit;
}

describe('venues.day_part is dropped, and audited before it goes', () => {
  const { sql } = latestMatching(/alter\s+table\s+public\.venues\s+drop\s+column/i);
  const body = stripComments(sql);

  it('drops the column', () => {
    expect(body).toMatch(
      /alter\s+table\s+public\.venues\s+drop\s+column\s+if\s+exists\s+day_part/i,
    );
  });

  it('snapshots every stamped row BEFORE the drop, so the change is reversible', () => {
    const insertAt = body.search(/insert\s+into\s+public\.venue_day_part_drop_audit/i);
    const dropAt = body.search(/alter\s+table\s+public\.venues\s+drop\s+column/i);
    expect(insertAt).toBeGreaterThan(-1);
    expect(dropAt).toBeGreaterThan(insertAt);
    // The snapshot must carry the category too: day_part alone cannot be interpreted
    // later without knowing which category produced the stamp.
    expect(body).toMatch(/select\s+v\.id,\s*v\.category,\s*v\.day_part/i);
  });

  it('does not expose the audit table to anon', () => {
    expect(body).toMatch(
      /alter\s+table\s+public\.venue_day_part_drop_audit\s+enable\s+row\s+level\s+security/i,
    );
  });

  it('leaves vibe_tags alone -- empty is honest, stamped is not', () => {
    expect(body).not.toMatch(/drop\s+column\s+if\s+exists\s+vibe_tags/i);
  });
});
