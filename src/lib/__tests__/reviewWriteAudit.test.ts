import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `_review_write_audit` could only write a VENUE audit row for one action.
 *
 * `venue_consensus_audit.agreeing_sources` is NOT NULL *and* has its own
 * DEFAULT '{}'::text[]. The helper passed an explicit
 * `CASE WHEN p_action='auto_commit' THEN ARRAY['llm','human'] ELSE NULL END`,
 * and an explicit NULL OVERRIDES a column default — so every other action
 * raised 23502 and rolled back the caller's whole transaction.
 *
 * It hid because `approve_entity_review()` is the only caller and hardcodes
 * `auto_commit`. The fault therefore surfaces only when someone ADDS a caller,
 * which is the worst moment to learn the audit layer cannot record you.
 *
 * The bug arrived via a function restatement, so it can return the same way.
 * Text check against the migrations directory — runs in CI without credentials.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/** The migration that most recently defines `fn`. */
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

const sql = latestDefinitionOf('_review_write_audit');

/** The venue INSERT, which is the only branch with the NOT NULL column. */
const venueBranch = (() => {
  const i = sql.indexOf('INSERT INTO public.venue_consensus_audit');
  expect(i, 'venue branch not found').toBeGreaterThan(-1);
  return sql.slice(i, i + 700);
})();

describe('_review_write_audit — agreeing_sources', () => {
  it('never passes NULL for the NOT NULL agreeing_sources column', () => {
    // An explicit NULL beats the column default and throws 23502.
    expect(venueBranch).not.toMatch(/ELSE\s+NULL\s+END/i);
  });

  it('supplies an empty array for non-consensus actions', () => {
    expect(venueBranch).toMatch(/ELSE\s+ARRAY\[\]::text\[\]\s+END/i);
  });

  it('still records real agreement only for auto_commit', () => {
    // The distinction is the point: a manual or service-role apply must not be
    // recorded as though a model and a human concurred.
    expect(venueBranch).toMatch(
      /WHEN\s+p_action\s*=\s*'auto_commit'\s+THEN\s+ARRAY\['llm','human'\]/i,
    );
  });

  it('leaves the city branch alone', () => {
    // city_consensus_audit.agreeing_sources is NULLABLE and the city INSERT
    // omits the column entirely — it was never affected.
    const cityBranch = sql.slice(
      sql.indexOf('INSERT INTO public.city_consensus_audit'),
      sql.indexOf('ELSIF'),
    );
    expect(cityBranch).not.toMatch(/agreeing_sources/i);
  });
});
