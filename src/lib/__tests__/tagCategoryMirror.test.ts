import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `unified_tags.category` is a mirror of `tag_category_assignments` with NO
 * trigger writeback — both category sync triggers fire only on a `category_id`
 * change on `unified_tags`, never from the junction side, and neither fires when
 * a category is RENAMED. So a tag filed by inserting an assignment row publishes
 * no category, and a tag whose category is relabelled keeps publishing the old
 * name. `run_tag_category_resync` fixes both and existed for two months in no
 * cron and no `admin_automations` row.
 *
 * These are the four properties of the repair that would regress silently.
 * Text checks against the repo, so this runs in CI without credentials — same
 * pattern as `src/lib/__tests__/citySafetyBackfill.test.ts`.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const sqlFiles = () =>
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();

/** One read pass for the whole file, shared by every case. The directory holds
 *  ~1,350 migrations and re-reading it per assertion pushed this suite past the
 *  15s default timeout on a loaded machine. */
const cache = new Map<string, string>();
const read = (f: string): string => {
  let s = cache.get(f);
  if (s === undefined) {
    s = readFileSync(join(MIGRATIONS, f), 'utf8');
    cache.set(f, s);
  }
  return s;
};

/** Newest migration that DEFINES the function — not one that merely mentions it
 *  in a GRANT, REVOKE, COMMENT or DROP, which is what broke the geo-spine scan. */
function latestDefinition(fn: string): string {
  const re = new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i');
  const hit = sqlFiles()
    .filter((f) => re.test(read(f)))
    .pop();
  expect(hit, `no migration defines public.${fn}`).toBeTruthy();
  const sql = read(hit!);
  return sql.slice(sql.search(re));
}

/** The migration carrying this repair, found by the helper it introduces. */
function reconcileMigration(): string {
  const file = sqlFiles()
    .filter((f) => read(f).includes('create or replace function public.tag_category_mirror_want'))
    .pop();
  expect(file, 'no migration defines tag_category_mirror_want').toBeTruthy();
  return read(file!);
}

describe('tag category mirror', () => {
  it('breaks a tie on the original filing, never on the category name', () => {
    // The live ordering ended in `tc.name`, so where is_primary and level tie,
    // alphabetical order of a DISPLAY STRING decided the published category —
    // and a rename could silently repoint a tag. `created_at asc` means a later
    // bulk addition cannot steal the primary; the uuid final key is stable under
    // a rename, which is the exact producer this migration exists to drain.
    const body = latestDefinition('tag_category_mirror_want');
    const order = body.slice(body.indexOf('order by'), body.indexOf('limit 1'));

    expect(order).toContain('a.created_at asc');
    expect(order).toContain('a.category_id');
    expect(order, 'a display name must not decide a tag category').not.toContain('tc.name');
  });

  it('the job derives its winner from the shared helper', () => {
    // A reader that computes the winner independently can report clean while the
    // job writes something else — the `embedding_candidates` lesson. One
    // ordering, one function.
    expect(
      latestDefinition('run_tag_category_resync'),
      'run_tag_category_resync must call tag_category_mirror_want',
    ).toContain('tag_category_mirror_want');
  });

  it('the resync is fill-only', () => {
    // The live predicate was a bare `is distinct from`, which ERASED the mirror
    // on the 11 rows whose assignments had been removed. Writing a value is a
    // repair; erasing one is a loss, and a nightly job must not do the second.
    expect(latestDefinition('run_tag_category_resync')).toMatch(/want\s+is\s+not\s+null/i);
  });

  it('the corrected function has a schedule calling it', () => {
    // The function is only worth correcting if something runs it. The cron is
    // NOT created here — `20261006180000_tag_category_text_mirror_reconciler`
    // registered and scheduled `tag_category_text_resync` first, and a second
    // job on the same function is duplication, not safety. So: some migration
    // must schedule it, and this one must assert that rather than compete.
    const scheduler = sqlFiles().find((f) =>
      /cron\.schedule\(\s*'tag_category_text_resync'/i.test(read(f)),
    );
    expect(scheduler, 'nothing schedules run_tag_category_resync').toBeTruthy();
    expect(read(scheduler!)).toContain('run_tag_category_resync');

    const sql = reconcileMigration();
    expect(sql, 'the reconcile migration must not create a competing cron').not.toMatch(
      /cron\.schedule\(/i,
    );
    expect(sql, 'it must assert the schedule exists').toContain('tag_category_text_resync');
  });

  it('does not restate tag_hygiene_stats', () => {
    // 20261006110000 asks that the counter for this class ship with the
    // `category_id` repair's counters rather than compete with them, and that
    // repair adds two keys by restating tag_hygiene_stats() in full. Because the
    // panel drift test reads the LAST migration defining that function, a second
    // restatement here would silently drop whichever pair merged first.
    // Observability comes from the admin_automations row instead.
    expect(
      reconcileMigration(),
      'this migration must not redefine tag_hygiene_stats — it would drop a concurrently-added counter',
    ).not.toMatch(/function\s+public\.tag_hygiene_stats/i);
  });
});
