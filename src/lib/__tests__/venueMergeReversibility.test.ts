import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A venue merge must be reversible, pinned.
 *
 * 20330101100100 took the venue arms from 0 to 238 auto-eligible pairs while
 * `_venue_merge_core` still recorded reparenting as COUNTS. Measured on prod by
 * merging a real venue and unmerging it against the pre-fix functions:
 *
 *     before 514 events -> after merge 0 -> after unmerge 0
 *
 * i.e. every child stayed on the survivor and `unmerge_venues` reported success
 * anyway. With the fix the same round trip returns 514.
 *
 * Sibling of `eventMergeReversibility.test.ts`, with two venue-specific
 * differences that a copy of the event version would get wrong — see the
 * assertions for `venue_personal_visits` and `guide_picks`.
 *
 * Each assertion was mutation-tested against a scratch copy: flipping the thing
 * it guards makes the test fail. A guard that also passes on the broken input is
 * guarding nothing.
 *
 * Text check against the migrations directory — no credentials.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

/**
 * Every relation `_venue_merge_core` reparents. The SAME array drives the
 * record-side and the replay-side assertions, so the two cannot drift: a
 * relation added to the merge but forgotten in unmerge fails here.
 */
const CHILD_RELATIONS = [
  'events',
  'festivals',
  'marketplace_listings',
  'trip_places',
  'venue_checkins',
  'venue_reviews',
  'venue_personal_visits',
  'guide_picks',
  'venue_sources',
  'dup_children',
] as const;

describe('_venue_merge_core records what it moved', () => {
  const sql = latestDefinitionOf('_venue_merge_core');

  it('stamps the schema marker', () => {
    // The marker, not "moved is non-empty": probing the latter would conflate
    // "this merge predates the fix" (unrecoverable) with "this merge moved
    // nothing" (fully reversed by doing nothing).
    expect(sql).toMatch(/'schema',\s*1/);
  });

  it('records the moved ids for every relation it reparents', () => {
    for (const rel of CHILD_RELATIONS) {
      expect(sql, `${rel} must be recorded into moved`).toContain(
        `jsonb_build_object('${rel}', v_ids)`,
      );
    }
  });

  it('keeps the old count shape as well', () => {
    // `reparented` is what the admin UI and every existing audit row use. The
    // new column is additive; dropping the counts would be a silent API change.
    for (const rel of CHILD_RELATIONS) {
      expect(sql, `${rel} must still be counted in reparented`).toContain(
        `jsonb_build_object('${rel}', n)`,
      );
    }
  });

  // VENUE-SPECIFIC. venue_personal_visits has NO id column — its primary key is
  // (user_id, venue_id) — so the event pattern's `returning id` does not even
  // compile against it. The recorded values are user ids.
  it('records USER ids for venue_personal_visits, which has no id column', () => {
    expect(sql).toMatch(/returning v\.user_id/);
    expect(sql).toMatch(/jsonb_agg\(user_id\)/);
  });

  it('captures the slug redirect it is about to overwrite, before overwriting', () => {
    const capture = sql.indexOf('select venue_id into v_prior_redirect');
    const upsert = sql.indexOf('insert into public.venue_slug_redirects');
    expect(capture, 'the prior redirect must be read').toBeGreaterThan(-1);
    expect(upsert, 'the redirect upsert must exist').toBeGreaterThan(-1);
    expect(capture, 'the capture must precede the overwrite').toBeLessThan(upsert);
    expect(sql).toContain("'slug_redirect_existed'");
    expect(sql).toContain("'slug_redirect_prior_venue_id'");
  });

  it('writes details on the audit row', () => {
    expect(sql).toMatch(
      /insert into public\.venue_merge_audit \(keep_id, drop_id, actor, reparented, details\)/,
    );
  });
});

describe('unmerge_venues restores a venue merge', () => {
  const sql = latestDefinitionOf('unmerge_venues');

  it('drops the old 1-arg signature and takes p_force', () => {
    // PostgREST resolves overloads BY ARGUMENT NAME; leaving both would make a
    // call naming only p_audit_id ambiguous (42725) rather than picking the new
    // one. src/hooks/useVenueDuplicates.ts calls it with exactly that one arg.
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.unmerge_venues\(uuid\)/i);
    expect(sql).toMatch(/p_audit_id uuid, p_force boolean DEFAULT false/);
  });

  it('replays every relation the merge recorded', () => {
    for (const rel of CHILD_RELATIONS) {
      expect(sql, `${rel} must be replayed on unmerge`).toContain(
        `jsonb_array_elements_text(coalesce(v_moved->'${rel}'`,
      );
    }
  });

  // VENUE-SPECIFIC. The recorded values for this relation are user ids, so the
  // restore must key on (venue_id = keep AND user_id IN ...). Restoring by `id`
  // here would silently match nothing.
  it('restores venue_personal_visits by user_id on the keep row', () => {
    expect(sql).toMatch(/update public\.venue_personal_visits set venue_id = a\.drop_id/);
    expect(sql).toMatch(/where venue_id = a\.keep_id\s*\n\s*and user_id in/);
  });

  // VENUE-SPECIFIC. guide_picks is shared across entity types and moves
  // entity_id, not a venue_id column.
  it('restores guide_picks by entity_id, scoped to venue', () => {
    expect(sql).toMatch(/update public\.guide_picks set entity_id = a\.drop_id/);
    expect(sql).toMatch(/where entity_type = 'venue'/);
  });

  it('refuses a pre-schema audit instead of reporting a restore it cannot do', () => {
    expect(sql).toMatch(/coalesce\(\(a\.details->>'schema'\)::int, 0\) < 1/);
    expect(sql).toMatch(/predates moved-row recording/);
    expect(sql).toMatch(/if not p_force then/);
  });

  it('reports whether reparenting was actually restored', () => {
    // The caller must be able to tell a real unmerge from the forced legacy path.
    expect(sql).toContain("'reparenting_restored'");
  });

  it('restores the redirect from the RECORDED slug, not a live lookup', () => {
    // The old version did `select slug from venues where id = a.drop_id`, so a
    // slug edited after the merge made the delete miss entirely.
    expect(sql).toMatch(/a\.details->>'drop_slug'/);
    expect(sql).not.toMatch(/select slug into v_slug from public\.venues/);
    // ...and it restores the prior target rather than always deleting.
    expect(sql).toMatch(/update public\.venue_slug_redirects/);
  });

  it('re-grants after the DROP, and never to anon', () => {
    // A DROP takes the ACL with it; forgetting to re-grant makes the admin
    // console's Undo button fail with a permission error.
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.unmerge_venues\(uuid, boolean\) TO authenticated, service_role/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.unmerge_venues\(uuid, boolean\) FROM public, anon/,
    );
  });
});
