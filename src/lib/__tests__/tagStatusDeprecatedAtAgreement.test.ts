import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `unified_tags.status` and `unified_tags.deprecated_at` must agree, because the
 * two reader-visible surfaces each believe a different one:
 *
 *   fetchTagWithCategories       -> status = 'active'      (renders /tags/:slug)
 *   search_documents_index_tags  -> deprecated_at is null  (indexes into search)
 *
 * While they could contradict each other, 297 tags were a live page AND absent
 * from search_documents entirely — `lgbtiq` (3,234 assignments), `berlin`
 * (1,706), `sauna` (1,370), `kink` (1,361) among them — plus 2 in the mirror
 * state (page 404s, row still searchable). The producer was
 * `source-tags-extract`, whose upsert carried an explicit `status: 'active'` and
 * so rewrote it on conflict every Sunday while never touching `deprecated_at`.
 *
 * Two guards, because either alone leaves the hole open: the CHECK makes the
 * state unrepresentable, and the insert-only upsert stops the weekly DAG from
 * walking into it. A text check against the repo, not the database, so it runs
 * in CI without credentials — same pattern as `stagingHumanApproval.test.ts`.
 */

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * The migration that most recently ADDs or DROPs the constraint. A later
 * migration dropping it must therefore fail this test rather than slip past a
 * search that stopped at the first file mentioning the name.
 */
function latestConstraintMigration(name: string): { file: string; sql: string } {
  for (const f of [...migrationFiles()].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (new RegExp(`(add|drop)\\s+constraint\\s+${name}\\b`, 'i').test(sql)) {
      return { file: f, sql };
    }
  }
  throw new Error(`no migration adds or drops ${name}`);
}

describe('unified_tags status/deprecated_at agreement', () => {
  it('is enforced by a live CHECK constraint, not merely repaired once', () => {
    const { sql } = latestConstraintMigration('unified_tags_status_matches_deprecated_at');

    // The most recent statement touching it must be the ADD, not a DROP.
    expect(sql).toMatch(/add\s+constraint\s+unified_tags_status_matches_deprecated_at/i);
    expect(sql).not.toMatch(/drop\s+constraint\s+unified_tags_status_matches_deprecated_at/i);

    // The equivalence, not a one-sided test: `status <> 'active' OR
    // deprecated_at IS NULL` would still permit the mirror state that had
    // craig-johnston and sonja-eggerickx 404ing while indexed.
    const check = sql
      .slice(sql.search(/add\s+constraint\s+unified_tags_status_matches_deprecated_at/i))
      .replace(/\s+/g, ' ');
    expect(check).toMatch(
      /\(\s*status\s*=\s*'active'\s*\)\s*=\s*\(\s*deprecated_at\s+is\s+null\s*\)/i,
    );
  });

  it('repairs both directions of the divergence before adding the constraint', () => {
    const { sql } = latestConstraintMigration('unified_tags_status_matches_deprecated_at');
    const constraintAt = sql.search(
      /add\s+constraint\s+unified_tags_status_matches_deprecated_at/i,
    );
    const repairs = sql.slice(0, constraintAt);

    // active + stamped -> the row is either revived (timestamp cleared) or
    // delisted (status flipped). Both must be present, or the ADD cannot pass.
    expect(repairs).toMatch(/deprecated_at\s*=\s*null/i);
    expect(repairs).toMatch(/set\s+status\s*=\s*'deprecated'/i);
    // deprecated + unstamped -> the mirror case.
    expect(repairs).toMatch(/status\s*=\s*'deprecated'\s+and\s+deprecated_at\s+is\s+null/i);
  });

  it('does not delist tags that carry links or their own content', () => {
    const { sql } = latestConstraintMigration('unified_tags_status_matches_deprecated_at');
    const constraintAt = sql.search(
      /add\s+constraint\s+unified_tags_status_matches_deprecated_at/i,
    );
    const repairs = sql.slice(0, constraintAt);

    // The 2026-06-05 audit's own criterion, re-run: 190 of the 297 have links
    // and 43 more are glossary entries with prose / a QID / diagnostic codes.
    // Losing any arm of this silently delists live vocabulary.
    for (const table of [
      'unified_tag_assignments',
      'tag_relations',
      'search_synonyms',
      'tag_aliases',
      'tag_medical_codes',
    ]) {
      expect(repairs).toContain(table);
    }
    expect(repairs).toMatch(/long_description/i);
    expect(repairs).toMatch(/wikidata_id/i);
  });
});

describe('source-tags-extract', () => {
  const fn = readFileSync(
    join(ROOT, 'supabase', 'functions', 'source-tags-extract', 'index.ts'),
    'utf8',
  );

  /**
   * The payload object only — from `const rows =` to the end of the upsert call.
   * Scoped rather than whole-file because the prose above it necessarily names
   * the defect it exists to prevent, and a comment must not fail the test.
   */
  const payload = fn.slice(fn.indexOf('const rows ='), fn.indexOf("count: 'exact'"));

  it('never writes status, so it cannot resurrect a deprecated tag', () => {
    // The exact line that caused this: an explicit status in the upsert payload
    // becomes ON CONFLICT DO UPDATE SET status = active, on every existing row.
    expect(payload).not.toMatch(/\bstatus\b\s*:/);
    // The slice must be real, or the assertion above passes vacuously.
    expect(payload).toMatch(/slug:\s*t\.slug/);
  });

  it('is insert-only, so it cannot overwrite any curated column', () => {
    // ignoreDuplicates -> ON CONFLICT DO NOTHING. Without it the node would
    // still overwrite `name` from a scraped free-text array.
    expect(payload).toMatch(/ignoreDuplicates:\s*true/);
  });
});
