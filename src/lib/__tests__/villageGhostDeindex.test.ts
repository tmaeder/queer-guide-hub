import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `run_village_trust_recompute` classifies a zero-content queer village as
 * 'ghost'. Until 20260928100100 it did that behind `seo_indexable AND is_empty`
 * and never wrote `seo_indexable` itself — so the flag gating the
 * classification could only ever be true, all 190 rows sat at
 * seo_indexable=true, and 60 thin district pages stayed crawlable through the
 * `CityDistricts` links on every city page.
 *
 * That is exactly the cities bug 20260821051221 fixed, one entity later. This
 * test fails if the villages half regresses to the same shape.
 *
 * Text check against the migrations directory rather than the database, so it
 * runs in CI without credentials — same pattern as
 * `src/lib/__tests__/citySafetyBackfill.test.ts`.
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

const sql = latestDefinitionOf('run_village_trust_recompute');

// Line comments are stripped before the negative assertion below: this
// migration's own header quotes the broken `seo_indexable AND is_empty` shape
// in order to explain it, and prose must not fail the test that guards code.
const code = sql.replace(/--[^\n]*/g, '');

describe('run_village_trust_recompute deindexes the ghost tier', () => {
  it('writes seo_indexable on queer_villages', () => {
    // The whole defect was a classifier that read the column and never wrote
    // it. If this disappears, the 60 rows silently become indexable again.
    expect(code).toMatch(/UPDATE\s+public\.queer_villages[\s\S]{0,400}seo_indexable\s*=/i);
  });

  it('does not gate the ghost tier on seo_indexable', () => {
    // `WHEN seo_indexable AND is_empty THEN 'ghost'` makes the condition mask
    // its own effect: setting the column false reclassifies the row to 'real',
    // which reads as a complete village in every admin view and selector.
    expect(code).not.toMatch(/seo_indexable\s+AND\s+is_empty/i);
    expect(code).toMatch(/WHEN\s+is_empty\s+THEN\s+'ghost'/i);
  });

  it('re-indexes a ghost that gained content', () => {
    // Most of these villages are real districts that are empty only because
    // nothing links venues to them. When `village_relink` fixes that, the row
    // has to come back into the index — otherwise the deindex is a one-way
    // door.
    expect(code).toMatch(/WHEN\s+shell_status\s*=\s*'ghost'\s+THEN\s+true/i);
  });

  it('keeps the no-op guard on the UPDATE', () => {
    // Every write here reaches search through trg_sync_geo_spine ->
    // search_reindex_queue; an unguarded nightly UPDATE would enqueue all 190
    // rows for nothing.
    expect(code).toMatch(/IS\s+DISTINCT\s+FROM\s+f\.new_seo_indexable/i);
  });
});
