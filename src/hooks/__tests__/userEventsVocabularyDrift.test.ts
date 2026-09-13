import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `user_events.event_type` and `.entity_type` are written by two TypeScript
 * unions and constrained by two Postgres CHECKs. When those drift, nothing
 * says so: `supabase.from().insert()` RESOLVES with `{ error }` instead of
 * throwing, and the writers swallow it — so a rejected row is indistinguishable
 * from a user who never did the thing.
 *
 * That is not hypothetical here. `docs/audits/2026-08-21-signup-consent-gap.md`
 * records the same shape on signup_funnel_events: `signup_validation_error`
 * was in the TS union and not in the CHECK, every insert was rejected, and the
 * resulting "zero validation errors" was read as a finding about users.
 *
 * So this test asserts SET EQUALITY in both directions:
 *  - a value the app can emit but the CHECK rejects  → silent data loss
 *  - a value the CHECK allows but nothing emits      → dead vocabulary, and
 *    (worse) the reader may be scoring a name no writer uses, which is exactly
 *    how get_trending_entities came to score 85% of the table at zero.
 *
 * It finds the LATEST migration that defines each constraint by scanning,
 * rather than pinning a filename — pinning is the `venueCategories.ts` trap,
 * where a later ALTER silently leaves the test guarding a superseded version.
 */

const MIGRATIONS = resolve(__dirname, '../../../supabase/migrations');

/** The most recent migration mentioning a constraint name, by version order. */
function latestMigrationDefining(constraint: string): string {
  const hits = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) =>
      readFileSync(resolve(MIGRATIONS, f), 'utf8').includes(`add constraint ${constraint}`),
    );
  expect(hits.length, `no migration adds constraint ${constraint}`).toBeGreaterThan(0);
  return readFileSync(resolve(MIGRATIONS, hits[hits.length - 1]), 'utf8');
}

/** Pull the quoted values out of `add constraint <name> check ( ... )`. */
function constraintValues(constraint: string): Set<string> {
  const sql = latestMigrationDefining(constraint);
  const start = sql.indexOf(`add constraint ${constraint}`);
  const body = sql.slice(start, sql.indexOf('not valid', start));
  return quotedLiterals(body);
}

/** String literals in either quote style — searchClient.ts uses double. */
function quotedLiterals(body: string): Set<string> {
  const quoted = body.match(/['"][a-z_]+['"]/g) ?? [];
  return new Set(quoted.map((q) => q.slice(1, -1)));
}

/** Pull a string-literal union out of a TS type alias. */
function tsUnion(file: string, typeName: string): Set<string> {
  const src = readFileSync(resolve(__dirname, '../..', file), 'utf8');
  const start = src.indexOf(`type ${typeName} =`);
  expect(start, `type ${typeName} not found in ${file}`).toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf(';', start));
  return quotedLiterals(body);
}

describe('user_events vocabulary — TS writers vs the DB CHECK', () => {
  it('every event_type the app can emit is accepted by the CHECK', () => {
    const allowed = constraintValues('user_events_event_type_known');
    const emitted = new Set([
      ...tsUnion('hooks/useTrackEvent.ts', 'EventType'),
      ...tsUnion('lib/searchClient.ts', 'TrackEvent'),
    ]);

    const rejected = [...emitted].filter((v) => !allowed.has(v));
    expect(
      rejected,
      `these values are emitted by a writer and would be REJECTED by user_events_event_type_known: ${rejected.join(', ')}`,
    ).toEqual([]);
  });

  it('the CHECK allows nothing no writer emits', () => {
    const allowed = constraintValues('user_events_event_type_known');
    const emitted = new Set([
      ...tsUnion('hooks/useTrackEvent.ts', 'EventType'),
      ...tsUnion('lib/searchClient.ts', 'TrackEvent'),
    ]);

    const orphaned = [...allowed].filter((v) => !emitted.has(v));
    expect(
      orphaned,
      `these values are allowed by the CHECK but no TS writer emits them — dead vocabulary, or a reader scoring a name nothing writes: ${orphaned.join(', ')}`,
    ).toEqual([]);
  });

  it('every entity_type the app can emit is accepted by the CHECK', () => {
    const allowed = constraintValues('user_events_entity_type_known');
    const emitted = tsUnion('hooks/useTrackEvent.ts', 'EntityType');

    const rejected = [...emitted].filter((v) => !allowed.has(v));
    expect(
      rejected,
      `emitted but rejected by user_events_entity_type_known: ${rejected.join(', ')}`,
    ).toEqual([]);
  });

  // Positive control: the helpers must actually be reading something. Without
  // this, every assertion above also passes when a regex silently matches
  // nothing and both sets come back empty.
  it('reads a non-empty vocabulary from both sides', () => {
    expect(constraintValues('user_events_event_type_known').size).toBeGreaterThan(10);
    expect(constraintValues('user_events_entity_type_known').size).toBeGreaterThan(10);
    expect(tsUnion('hooks/useTrackEvent.ts', 'EventType').size).toBeGreaterThan(5);
    expect(tsUnion('lib/searchClient.ts', 'TrackEvent').size).toBeGreaterThan(5);
  });
});
