import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `check-migration-versions.mjs` must treat EVERY duplicate version as fatal.
 *
 * Until 2026-08-29 the "neither file applied yet" case was a warning, on the
 * reasoning — written into the script — that it is "loud" because `db push`
 * aborts on `schema_migrations_pkey` and therefore only the already-applied case
 * needed escalating.
 *
 * Loud is accurate. Harmless-because-loud is not, and it was measured wrong the
 * same day: the abort takes down the WHOLE push, not just the offending file.
 * 20261012100000 was shared by `sweep_skips_attribute_kind` and
 * `news_vocab_dump_residue`, neither applied; `supabase db push` aborted and
 * stranded five unrelated migrations from another PR while edge functions
 * deployed anyway, leaving prod running new code against the old schema until a
 * file was renamed by hand.
 *
 * This is a text-scanning guard, in the same shape as the other migration tests,
 * because the branch it protects can only be exercised end-to-end with a
 * `SUPABASE_ACCESS_TOKEN` — `remote` is null without one and the classification
 * falls through to `unverified` instead. CI has the token; a local run does not.
 * So assert on the source: the neither-applied arm must push an error, never a
 * warning.
 */

const SCRIPT = resolve(__dirname, '../../../scripts/check-migration-versions.mjs');
const MIGRATIONS = resolve(__dirname, '../../../supabase/migrations');

/** The `for (const [version, group] of byVersion)` classification block. */
function duplicateBlock(src: string): string {
  const start = src.indexOf('for (const [version, group] of byVersion)');
  expect(start, 'duplicate-classification loop not found').toBeGreaterThan(-1);
  const end = src.indexOf('\n// 3)', start);
  expect(end, 'end of the duplicate block not found').toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('duplicate migration versions are always fatal', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  const block = duplicateBlock(src);

  it('the duplicate-version block never downgrades a case to a warning', () => {
    // The whole point: there is no surviving path from "two files share a
    // version" to a non-blocking outcome. `unverified` is allowed — that is the
    // no-token case, which the workflow surfaces separately and which fails
    // closed rather than green.
    expect(block).not.toMatch(/warnings\.push/);
  });

  it('names the stranding consequence, not just the abort', () => {
    // If this reverts to "db push aborts loudly on it", the reasoning that
    // justified the warning is back and the escalation will follow it out.
    expect(block).toMatch(/whole push|WHOLE push/i);
    expect(block).toMatch(/strand/i);
  });

  it('still distinguishes the already-applied case, which fails silently instead', () => {
    // Two different failure modes with two different remedies: an applied
    // duplicate silently skips N-1 files, an unapplied one aborts everything.
    // Collapsing them into one message loses the "which file actually ran"
    // instruction that the applied case needs.
    expect(block).toMatch(/ALREADY IN REMOTE HISTORY/);
    expect(block).toMatch(/skipped permanently and\s+`? ?silently|skipped permanently/i);
  });

  it('the repo currently has no duplicate versions', () => {
    // The escalation is only safe to ship because this is zero. If a duplicate
    // lands, this fails here rather than in everyone's deploy.
    const versions = readdirSync(MIGRATIONS)
      .filter((f) => /^\d{14}_.*\.sql$/.test(f))
      .map((f) => f.slice(0, 14));
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const v of versions) {
      if (seen.has(v)) dupes.add(v);
      seen.add(v);
    }
    expect([...dupes]).toEqual([]);
  });
});
