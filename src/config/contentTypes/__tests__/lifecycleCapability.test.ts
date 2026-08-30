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
 *  2. A type that CANNOT must NOT declare one. hotels, news_articles,
 *     countries and community_groups have no status/visibility/review_status
 *     column — only `seo_indexable`, which governs crawlers and the sitemap and
 *     does NOT remove a row from the site or from search. An Archive button
 *     there would deindex without hiding, which is exactly the defect the
 *     archived-rows work removed (a control that claims to hide and does not).
 *
 * The declared column/value must also match what `archive_entity` actually
 * writes, or the row archives and the list keeps showing it as live.
 */

const MIGRATION = (() => {
  const dir = join(process.cwd(), 'supabase/migrations');
  const hits = readdirSync(dir).filter((f) => f.endsWith('_entity_lifecycle_dispatchers.sql'));
  if (hits.length !== 1) {
    throw new Error(`expected one dispatcher migration, found ${hits.length}: ${hits.join(', ')}`);
  }
  return readFileSync(join(dir, hits[0]), 'utf8');
})();

/** Types whose table genuinely cannot express "archived" — verified against
 *  information_schema on prod. Adding an archive block for one of these is the
 *  mistake this list exists to catch. */
const NOT_ARCHIVABLE = new Set(['hotel', 'news', 'group', 'country']);

describe('lifecycle capability declarations', () => {
  const configs = getContentTypeIds()
    .map((id) => getContentType(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  it('every declared archive names a column and a value', () => {
    for (const c of configs) {
      if (!c.lifecycle?.archive) continue;
      expect(c.lifecycle.archive.column, `${c.id} archive.column`).toBeTruthy();
      expect(c.lifecycle.archive.value, `${c.id} archive.value`).toBeTruthy();
    }
  });

  it('types with no archivable column declare no archive block', () => {
    for (const c of configs) {
      const t = c.lifecycle?.type;
      if (!t || !NOT_ARCHIVABLE.has(t)) continue;
      expect(
        c.lifecycle?.archive,
        `${c.id} declares an archive state, but its table has no column that can express one — an Archive button there would deindex without hiding`,
      ).toBeUndefined();
    }
  });

  it('the dispatcher refuses exactly the types that declare no archive', () => {
    // The SQL and the registry have to agree. If the registry offers Archive
    // for a type the dispatcher rejects, the button throws; if the dispatcher
    // supports one the registry hides, the capability is silently unreachable.
    for (const t of NOT_ARCHIVABLE) {
      const branch = new RegExp(`when '${t}' then`, 'i');
      const archiveFn = MIGRATION.slice(
        MIGRATION.indexOf('function public.archive_entity'),
        MIGRATION.indexOf('function public.restore_entity'),
      );
      expect(
        branch.test(archiveFn),
        `archive_entity must NOT have a '${t}' branch — it has no archivable column`,
      ).toBe(false);
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

describe('delete_entity keeps its two carve-outs', () => {
  it('refuses tags and users', () => {
    // Both have a dedicated path that a generic snapshot-and-delete would skip:
    // admin_delete_tag checks usage before cascading citations and clinical
    // codes away, and admin_delete_user clears FK blockers in a fixed order and
    // deliberately stores NO snapshot (a copy of a deleted account's row would
    // preserve what the erasure removes).
    expect(MIGRATION).toMatch(/use admin_delete_tag\(\) for tags/);
    expect(MIGRATION).toMatch(/use admin_delete_user\(\) for accounts/);
  });

  it('writes the audit row before the delete, not after', () => {
    const deleteFn = MIGRATION.slice(
      MIGRATION.indexOf('function public.delete_entity'),
      MIGRATION.indexOf('function public.restore_deleted_entity'),
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
