import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `tag_hygiene_stats()` is called by `scripts/check-tag-hygiene.mjs`, a CRITICAL
 * CI gate, through PostgREST — where `authenticator` carries
 * `statement_timeout = 8s`.
 *
 * Measured on prod 2026-08-24, one counter was 95% of the function:
 *
 *     event_tag_strings_unresolved   6437 ms
 *     the other 13 counters (total)   214 ms
 *     events_with_tags_unlinked       124 ms
 *
 * The cause was `lower(u.name) = s OR lower(u.slug) = s`. The OR blocks a hash
 * join, so the planner fell back to a nested loop over a materialized 9,546-row
 * `unified_tags` — `Rows Removed by Join Filter: 4045647`, ~8M `lower()` calls,
 * entirely CPU (the plan reported `read=0`, so no amount of cache warming helped).
 * The function landed at 7.6-12.0 s against an 8 s ceiling and failed roughly
 * half of all PRs, on metrics none of which can even fail the gate.
 *
 * `NOT (A OR B)` is `NOT A AND NOT B`; split that way each arm uses its own
 * functional index and the counter is 147 ms. Both halves are load-bearing —
 * re-merging the OR, or dropping either index, silently restores the 4M-row
 * nested loop and the gate goes back to flaking on unrelated PRs. Nothing else
 * would catch that: the function still returns the correct number, just slowly.
 *
 * Text check against the migrations directory, so it runs in CI without
 * credentials — same pattern as `src/lib/__tests__/citySafetyBackfill.test.ts`.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort();

function latestDefinitionOf(fn: string): string {
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    // `create [or replace] function`, not merely `function`: a GRANT, REVOKE,
    // COMMENT ON, DROP or ALTER naming the function also contains
    // "function public.<fn>(" and would otherwise win the reverse scan.
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

const sql = latestDefinitionOf('tag_hygiene_stats');

/** The `event_tag_strings_unresolved` counter body, up to the next counter key. */
const counter = (() => {
  const start = sql.indexOf("'event_tag_strings_unresolved'");
  expect(
    start,
    'tag_hygiene_stats no longer has an event_tag_strings_unresolved counter',
  ).toBeGreaterThan(-1);
  const end = sql.indexOf("'events_with_tags_unlinked'", start);
  return sql.slice(start, end > -1 ? end : undefined);
})();

describe('tag_hygiene_stats() stays under the PostgREST statement timeout', () => {
  it('resolves tag strings with two separate NOT EXISTS arms, never one OR', () => {
    // The exact shape that cost 6.3 s: a single anti-join whose filter ORs the
    // two lower() comparisons together.
    expect(counter).not.toMatch(/or\s+lower\s*\(\s*u\.slug\s*\)/i);
    expect(counter).not.toMatch(/or\s+lower\s*\(\s*u\.name\s*\)/i);

    const arms = counter.match(/not\s+exists\s*\(/gi) ?? [];
    expect(arms.length, 'expected one NOT EXISTS per indexed column').toBe(2);
    expect(counter).toMatch(/lower\s*\(\s*u\.name\s*\)\s*=/i);
    expect(counter).toMatch(/lower\s*\(\s*u\.slug\s*\)\s*=/i);
  });

  it('keeps the functional indexes the split arms depend on', () => {
    for (const idx of ['idx_unified_tags_lower_name', 'idx_unified_tags_lower_slug']) {
      const created = files.some((f) =>
        new RegExp(`create\\s+index[^;]*${idx}`, 'i').test(
          readFileSync(join(MIGRATIONS, f), 'utf8'),
        ),
      );
      expect(created, `${idx} is never created`).toBe(true);

      const dropped = files.some((f) =>
        new RegExp(`drop\\s+index[^;]*${idx}`, 'i').test(readFileSync(join(MIGRATIONS, f), 'utf8')),
      );
      expect(dropped, `${idx} is dropped; the OR-free rewrite then seq-scans again`).toBe(false);
    }
  });
});
