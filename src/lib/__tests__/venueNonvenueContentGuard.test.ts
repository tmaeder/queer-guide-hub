import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { assertNonvenueDecisionApplied } from '../../hooks/useVenueReviewQueue';

/**
 * Archiving a venue must not silently orphan the events held there.
 *
 * Measured on prod 2026-09-05: 34 events across 4 venues already point at a
 * venue archived as "not a venue". `archive_city_as_nonplace` has had this
 * guard since it shipped; `decide_venue_nonvenue` never did.
 *
 * Two halves, and NEITHER works alone. The SQL guard refuses by RETURNING
 * `{ok:false}` rather than raising, so the client half is what makes the
 * refusal visible — without it the mutation resolves and the admin is told the
 * venue was archived while it is still live.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/** The newest migration defining decide_venue_nonvenue — the one that is live. */
function liveDefinition(): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) =>
      /function\s+public\.decide_venue_nonvenue/i.test(readFileSync(join(MIGRATIONS, f), 'utf8')),
    );
  expect(files.length, 'no migration defines decide_venue_nonvenue').toBeGreaterThan(0);
  return readFileSync(join(MIGRATIONS, files[files.length - 1]), 'utf8');
}

describe('decide_venue_nonvenue content guard (SQL half)', () => {
  const sql = liveDefinition();

  it('counts live events before confirming an archive', () => {
    expect(sql).toMatch(/from\s+public\.events\s+e/i);
    expect(sql).toMatch(/e\.venue_id\s*=\s*p_venue_id/i);
    // Duplicates and archived events are already invisible, so blocking on them
    // would fire the guard for rows it has no reason to protect.
    expect(sql).toMatch(/e\.duplicate_of_id\s+is\s+null/i);
  });

  it('refuses rather than archiving when events remain', () => {
    expect(sql).toMatch(/'has_events'/);
    expect(sql).toMatch(/v_events\s*>\s*0\s+and\s+not\s+p_force/i);
  });

  it('drops the 3-arg signature instead of overloading it', () => {
    // Two signatures make PostgREST resolve by argument name and answer a
    // mismatch with a silent PGRST202 404.
    expect(sql).toMatch(/drop\s+function\s+if\s+exists\s+public\.decide_venue_nonvenue\(uuid,\s*boolean,\s*text\)/i);
  });

  it('records the event count even when it is zero', () => {
    // "we checked and there were none" must not read the same as "nobody looked".
    expect(sql).toMatch(/'events_at_archive'/);
  });

  it('never overwrites an existing undo snapshot in the repair', () => {
    expect(sql).toMatch(/coalesce\(\s*v\.enrichment_status->'nonvenue_candidate'->'archived'/i);
  });
});

describe('decide_venue_nonvenue refusal (client half)', () => {
  it('throws on a has_events refusal, naming the count', () => {
    expect(() =>
      assertNonvenueDecisionApplied({ ok: false, error: 'has_events', events: 34, hint: 'Re-point them first.' }),
    ).toThrow(/34 event\(s\)/);
  });

  it('throws on any other refusal', () => {
    expect(() => assertNonvenueDecisionApplied({ ok: false, error: 'something_else' })).toThrow();
  });

  it('passes a real success through untouched', () => {
    expect(() => assertNonvenueDecisionApplied({ ok: true, status: 'confirmed' })).not.toThrow();
    expect(() => assertNonvenueDecisionApplied({ ok: true, status: 'rejected' })).not.toThrow();
  });

  it('passes the pre-guard response shape through', () => {
    // The old 3-arg function returned `{id, status}` with no `ok`. A deploy
    // where the migration has not yet applied must not start throwing.
    expect(() => assertNonvenueDecisionApplied({ id: 'abc', status: 'confirmed' })).not.toThrow();
    expect(() => assertNonvenueDecisionApplied(null)).not.toThrow();
  });
});
