import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getContentTypeIds, getContentType } from '../index';

/**
 * The archive/delete capability declared per content type.
 *
 * Two invariants matter here, and they pull in opposite directions:
 *
 *  1. A type that CAN express an archived state must declare the column and
 *     value, or the list cannot render the state or filter on it.
 *  2. A type that CANNOT must NOT declare one. An Archive button on a type with
 *     no column that can express the state would deindex without hiding, which
 *     is exactly the defect the archived-rows work removed (a control that
 *     claims to hide and does not).
 *
 * hotels, news_articles and community_groups were in group 2 until
 * 20261029100000 gave them an `archived_at`. Countries stay there permanently
 * and for a different reason — not "no column available" but "not a leaf": 246
 * of 250 have dependent cities/venues/events, every child page embeds the
 * parent, and location_is_high_risk() resolves the safety gate through the same
 * row. See the block comment in country.ts.
 *
 * The declared column/value must also match what `archive_entity` actually
 * writes, or the row archives and the list keeps showing it as live.
 */

/**
 * The LATEST migration defining the dispatchers wins — 20261029100200 replaces
 * the branches 20261019100000 shipped. Resolved by name suffix and sorted,
 * never by a hardcoded filename, because this repo renumbers migrations
 * routinely to clear version collisions.
 */
const MIGRATION = (() => {
  const dir = join(process.cwd(), 'supabase/migrations');
  const hits = readdirSync(dir)
    .filter((f) => /_(entity_lifecycle_dispatchers|lifecycle_leaf_types_and_retention)\.sql$/.test(f))
    .sort();
  if (hits.length === 0) throw new Error('no lifecycle dispatcher migration found');
  return readFileSync(join(dir, hits[hits.length - 1]), 'utf8');
})();

/** Types that must NOT be archivable. Adding an archive block for one of these
 *  is the mistake this list exists to catch. */
const NOT_ARCHIVABLE = new Set(['country']);

describe('lifecycle capability declarations', () => {
  const configs = getContentTypeIds()
    .map((id) => getContentType(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  it('every declared archive names a column, and a value unless it is null-checked', () => {
    for (const c of configs) {
      const a = c.lifecycle?.archive;
      if (!a) continue;
      expect(a.column, `${c.id} archive.column`).toBeTruthy();
      if (a.predicate === 'present') {
        // A `value` alongside 'present' is a contradiction: the column is a
        // timestamp and nothing compares it to a sentinel. Rejecting it here
        // stops a copy-paste from silently declaring an unreachable state.
        expect(a.value, `${c.id} sets both predicate:'present' and a value`).toBeUndefined();
      } else {
        expect(a.value, `${c.id} archive.value`).toBeTruthy();
      }
    }
  });

  it('types that must not be archivable declare no archive block', () => {
    for (const c of configs) {
      const t = c.lifecycle?.type;
      if (!t || !NOT_ARCHIVABLE.has(t)) continue;
      expect(
        c.lifecycle?.archive,
        `${c.id} declares an archive state but must not have one — see the block comment in country.ts`,
      ).toBeUndefined();
    }
  });

  it('the dispatcher refuses the types the registry hides, and says why', () => {
    // The SQL and the registry have to agree. If the registry offers Archive
    // for a type the dispatcher rejects, the button throws; if the dispatcher
    // supports one the registry hides, the capability is silently unreachable.
    //
    // A refusal branch is allowed — preferred, in fact, over falling through to
    // the generic `unsupported_type`, because a country is refused for a reason
    // an admin can act on. What is NOT allowed is a branch that writes.
    const archiveFn = MIGRATION.slice(
      MIGRATION.indexOf('function public.archive_entity'),
      MIGRATION.indexOf('function public.restore_entity'),
    );
    for (const t of NOT_ARCHIVABLE) {
      const idx = archiveFn.indexOf(`when '${t}' then`);
      if (idx === -1) continue; // falls through to the generic else — also fine
      const branch = archiveFn.slice(idx, archiveFn.indexOf("when '", idx + 10) + 1 || undefined);
      expect(
        /raise exception/i.test(branch),
        `archive_entity's '${t}' branch must raise, not archive`,
      ).toBe(true);
      expect(
        /\bupdate\s+public\./i.test(branch),
        `archive_entity's '${t}' branch writes to a table; it must only raise`,
      ).toBe(false);
    }
  });

  it('a present-predicate archive names a column the dispatcher actually writes', () => {
    // `predicate: 'present'` means the list reads "archived" off a non-null
    // column. If the SQL writes a different column the row archives and the
    // list keeps rendering it as live — the drift this pair of declarations
    // exists to prevent.
    const archiveFn = MIGRATION.slice(
      MIGRATION.indexOf('function public.archive_entity'),
      MIGRATION.indexOf('function public.restore_entity'),
    );
    for (const c of configs) {
      const a = c.lifecycle?.archive;
      if (!a || a.predicate !== 'present') continue;
      const idx = archiveFn.indexOf(`when '${c.lifecycle!.type}' then`);
      expect(idx, `archive_entity lacks '${c.lifecycle!.type}'`).toBeGreaterThan(-1);
      const branch = archiveFn.slice(idx, archiveFn.indexOf("when '", idx + 10) + 1 || undefined);
      expect(
        new RegExp(`${a.column}\\s*=\\s*now\\(\\)`).test(branch),
        `archive_entity's '${c.lifecycle!.type}' branch does not set ${a.column}`,
      ).toBe(true);
    }
  });

  it('every archivable type has both an archive and a restore branch', () => {
    const archiveFn = MIGRATION.slice(
      MIGRATION.indexOf('function public.archive_entity'),
      MIGRATION.indexOf('function public.restore_entity'),
    );
    const restoreFn = MIGRATION.slice(
      MIGRATION.indexOf('function public.restore_entity'),
      MIGRATION.indexOf('function public.delete_entity'),
    );
    for (const c of configs) {
      const t = c.lifecycle?.type;
      if (!t || !c.lifecycle?.archive) continue;
      expect(archiveFn.includes(`when '${t}' then`), `archive_entity lacks '${t}'`).toBe(true);
      // An archive with no inverse is a one-way door, which is the thing this
      // whole feature exists to avoid.
      expect(restoreFn.includes(`when '${t}' then`), `restore_entity lacks '${t}'`).toBe(true);
    }
  });
});

describe('delete_entity keeps its carve-outs', () => {
  it('refuses tags, users and countries', () => {
    // Each has a dedicated path, or no safe path, that a generic
    // snapshot-and-delete would skip: admin_delete_tag checks usage before
    // cascading citations and clinical codes away; admin_delete_user clears FK
    // blockers in a fixed order and deliberately stores NO snapshot (a copy of
    // a deleted account's row would preserve what the erasure removes); and a
    // country is referenced by cities/venues/events through ids with no FK
    // left to stop the delete, so it would dangle silently rather than fail.
    expect(MIGRATION).toMatch(/use admin_delete_tag\(\) for tags/);
    expect(MIGRATION).toMatch(/use admin_delete_user\(\) for accounts/);
    expect(MIGRATION).toMatch(/countries cannot be deleted here/);
  });

  it('writes the audit row before the delete, not after', () => {
    // `restore_deleted_entity` is NOT redefined by the leaf-types migration, so
    // indexOf returns -1 there and a naive slice(start, -1) would quietly drop
    // the last character instead of reading to the end.
    const endMarker = MIGRATION.indexOf('function public.restore_deleted_entity');
    const deleteFn = MIGRATION.slice(
      MIGRATION.indexOf('function public.delete_entity'),
      endMarker === -1 ? undefined : endMarker,
    );
    const auditIdx = deleteFn.indexOf('insert into public.admin_lifecycle_audit');
    const deleteIdx = deleteFn.indexOf("execute format('delete from public.%I");
    expect(auditIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(-1);
    // Ordering is load-bearing: audit-first means a delete that fails on a
    // foreign key rolls the audit row back with it, so the log can never claim
    // a deletion that did not happen — and a delete that succeeds is
    // guaranteed to have its snapshot.
    expect(auditIdx).toBeLessThan(deleteIdx);
  });
});
