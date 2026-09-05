import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * An event merge must be reversible, because the sweep auto-merges without a human.
 *
 * `_event_merge_core` reparents six child relations onto the surviving event and used
 * to record only COUNTS (`jsonb_build_object('event_sources', n)`). A count cannot be
 * reversed, so `unmerge_entities` flipped `duplicate_of_id` and left every reparented
 * row on the keep side — an "unmerge" that produced a live event stripped of its own
 * sources, attendees, occurrences and trip places. That asymmetry is the stated reason
 * the city geo arm is never auto-eligible; the event arms ARE, which is why
 * 20270822093311/100100 had to land before the arms were widened.
 *
 * Verified end to end against production in a rolled-back transaction: a 86-source
 * event merged and unmerged returned all 86 rows, and the pre-fix behaviour (skip the
 * sources restore) was mutation-tested to 86 → 0. This file pins the shape so the
 * recording cannot quietly go away.
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

const CHILD_RELATIONS = [
  'event_attendees',
  'guide_picks',
  'event_occurrences',
  'event_sources',
  'trip_places',
  'programme_children',
  'dup_children',
] as const;

describe('_event_merge_core records what it moved', () => {
  const sql = latestDefinitionOf('_event_merge_core');

  it('stamps a details schema marker', () => {
    // The marker, not "moved is non-empty", is what unmerge tests. Probing for a
    // non-empty moved would conflate "this merge predates the fix" (unrecoverable)
    // with "this merge moved nothing" (fully reversed by doing nothing).
    expect(sql).toMatch(/'schema',\s*1/);
  });

  it('records moved row ids for every child relation', () => {
    for (const rel of CHILD_RELATIONS) {
      expect(sql, `moved ids for ${rel}`).toMatch(
        new RegExp(`v_moved\\s*:=\\s*v_moved\\s*\\|\\|\\s*jsonb_build_object\\('${rel}'`),
      );
    }
  });

  it('keeps the reparented counts alongside', () => {
    for (const rel of CHILD_RELATIONS) {
      expect(sql, `count for ${rel}`).toMatch(
        new RegExp(`v_counts\\s*:=\\s*v_counts\\s*\\|\\|\\s*jsonb_build_object\\('${rel}'`),
      );
    }
  });

  it('captures the slug redirect it is about to overwrite', () => {
    // `ON CONFLICT (old_slug) DO UPDATE` silently repoints a redirect an earlier merge
    // created; an unmerge that only DELETEs would destroy it.
    expect(sql).toMatch(/select event_id into v_prior_redirect from public\.event_slug_redirects/);
    expect(sql).toContain("'slug_redirect_prior_event_id'");
    expect(sql).toContain("'slug_redirect_existed'");
  });

  it('writes details on the audit row', () => {
    expect(sql).toMatch(
      /insert into public\.entity_merge_audit \(entity_type, keep_id, drop_id, actor, reparented, details\)/,
    );
  });

  it('still refuses to merge an umbrella with its own programme child', () => {
    expect(sql).toMatch(/umbrella and its programme child, not duplicates/);
  });
});

describe('unmerge_entities restores an event merge', () => {
  const sql = latestDefinitionOf('unmerge_entities');

  it('drops the single-argument form so no PostgREST overload survives', () => {
    // PostgREST resolves overloads BY ARGUMENT NAME and answers a mismatch with a
    // silent PGRST202 404. Two definitions is the trap; one is the contract.
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.unmerge_entities\(uuid\)/i);
    expect(sql).toMatch(/unmerge_entities\(p_audit_id uuid, p_force boolean DEFAULT false\)/);
  });

  it('replays every child relation back onto the dropped event', () => {
    for (const rel of CHILD_RELATIONS) {
      expect(sql, `restore for ${rel}`).toMatch(
        new RegExp(`jsonb_array_elements_text\\(coalesce\\(v_moved->'${rel}'`),
      );
    }
  });

  it('refuses a pre-fix audit instead of reporting a success that did not happen', () => {
    expect(sql).toMatch(/coalesce\(\(r\.details->>'schema'\)::int, 0\) < 1/);
    expect(sql).toMatch(/predates moved-row recording/);
    // The escape hatch exists but must be explicit.
    expect(sql).toMatch(/if not p_force then/);
  });

  it('reports whether the reparenting was actually restored', () => {
    // A caller must be able to tell a real unmerge from the forced legacy path.
    expect(sql).toContain("'reparenting_restored'");
  });

  it('restores the prior slug redirect rather than always deleting', () => {
    expect(sql).toMatch(/slug_redirect_existed/);
    expect(sql).toMatch(/set event_id = \(r\.details->>'slug_redirect_prior_event_id'\)::uuid/);
  });

  it('keeps every other entity type working', () => {
    for (const t of [
      'marketplace',
      'personality',
      'organization',
      'milestone',
      'hotel',
      'news',
      'queer_village',
      'country',
      'group',
    ]) {
      expect(sql, `${t} branch`).toContain(`r.entity_type = '${t}'`);
    }
  });

  it('re-grants execute to the roles the dropped function had', () => {
    // DROP takes the ACL with it. authenticated + service_role, never anon.
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.unmerge_entities\(uuid, boolean\) TO authenticated, service_role/,
    );
    expect(sql).not.toMatch(/TO anon/);
  });
});
