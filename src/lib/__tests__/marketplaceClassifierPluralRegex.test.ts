import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the two marketplace taxonomy migrations.
 *
 * 99500101100000 — `dresses?` in the classifier's apparel arm matches "dresse"
 * and "dresses" and NEVER the singular "dress", so "Print Slip Dress" fell past
 * apparel onto the later art arm (matching `prints?`) and 289 slip dresses were
 * published under Books & Art. Same shape in `documentaries?` (0 rows, latent).
 *
 * 99500101100100 — deactivates the 2025-07-23 scrape residue in
 * `marketplace_categories` (prices, brand names and explicit product copy stored
 * as category NAMES) without deleting anything.
 *
 * COMMENT-STRIPPED, and that is mandatory rather than tidy: both migration
 * headers quote the broken tokens and the junk text verbatim to explain the
 * defect, so every "the defect is gone" assertion below is satisfiable by the
 * prose while the real statement is missing.
 */

function stripSqlComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
const classifier = stripSqlComments(
  readFileSync(
    join(migrationsDir, '99500101100000_marketplace_classifier_plural_regex.sql'),
    'utf8',
  ),
);
const residue = stripSqlComments(
  readFileSync(
    join(migrationsDir, '99500101100100_marketplace_categories_deactivate_scrape_residue.sql'),
    'utf8',
  ),
);

/**
 * Everything before the migration's own verify block. Those blocks deliberately
 * assert against the WRONG text (so a better fix by a concurrent session also
 * satisfies them), which means a bare `toContain` over the whole file passes
 * with the real statement deleted — the vacuous-assertion class this repo has
 * recorded repeatedly.
 */
function statementsOf(sql: string): string {
  const i = sql.indexOf('do $verify$');
  return i === -1 ? sql : sql.slice(0, i);
}

describe('marketplace classifier: the plural-regex fix', () => {
  it('spells both tokens so they match their own singular', () => {
    expect(statementsOf(classifier)).toContain('dress(es)?');
    expect(statementsOf(classifier)).toContain('documentar(y|ies)');
  });

  it('no longer contains the broken forms in any statement', () => {
    // `dresses?` / `documentaries?` survive ONLY in the header prose, which the
    // stripper removes. A hit here means the fix was reverted.
    expect(statementsOf(classifier)).not.toMatch(/dresses\?/);
    expect(statementsOf(classifier)).not.toMatch(/documentaries\?/);
  });

  it('keeps the apparel arm ABOVE the art arm', () => {
    // This is the whole mechanism: `dress` now matches apparel, but only because
    // apparel is reached first. Reordering re-opens the bug with the token fixed.
    const s = statementsOf(classifier);
    const apparel = s.indexOf("THEN 'apparel'");
    const art = s.indexOf("THEN 'art'");
    expect(apparel).toBeGreaterThan(-1);
    expect(art).toBeGreaterThan(-1);
    expect(apparel).toBeLessThan(art);
  });

  /**
   * DELIBERATELY NOT a generic "no `Xes?` whose stem cannot match its singular"
   * sweep, which is the obvious guard and is WRONG for this file. `/([a-z]+)es\?/`
   * captures the stem before `es?`, not before `s?` — so `badges?` yields `badg`
   * and `accessoires?` yields `accessoir`, and a "stem must end in e" rule flags
   * nearly every correct token in the ladder. Telling `dresses?` (broken: strip
   * `s?` and "dresse" is not a word) from `badges?` (fine: "badge" is) needs a
   * dictionary, not a regex. A guard that fails on correct code is worse than no
   * guard, so the two known offenders are asserted by name above.
   */
  it('does not regress the plural form it also has to keep matching', () => {
    // `dress(es)?` is a strict superset of `dresses?` in practice, which is what
    // makes the change add-only. The migration asserts this at apply time too.
    expect(classifier).toContain("marketplace_subcategory_group('Dresses')");
  });
});

describe('marketplace classifier: the re-derive', () => {
  it('nulls the stamp, and does NOT use the backfill RPC idiom', () => {
    const s = statementsOf(classifier);
    // The trigger recomputes only when the stamp is NULL or subcategory/title
    // moved. `set subcategory = m.subcategory` satisfies none of those now that
    // the stamp is non-null corpus-wide — measured live: it left the row on
    // 'art'. It is the single most likely "simplification" back into a no-op.
    expect(s).toMatch(/set\s+taxonomy_v3_at\s*=\s*null/i);
    expect(s).not.toMatch(/set\s+subcategory\s*=\s*m\.subcategory/i);
  });

  it('keeps the MATERIALIZED optimisation barrier', () => {
    // Without it the planner may evaluate the classifier (COST 100) across all
    // ~62k rows before the cheap regex filter.
    expect(statementsOf(classifier)).toMatch(/with\s+candidate\s+as\s+materialized/i);
  });

  it('bounds the batch loop', () => {
    // An unbounded loop under a 600s timeout is how `db push` breaks for the
    // whole repo rather than for one PR.
    expect(statementsOf(classifier)).toMatch(/v_total\s*>=\s*\d+/);
  });

  it('raises the timeout with a SESSION-scoped SET, never SET LOCAL', () => {
    // `db push` does not wrap a migration in an explicit transaction, so
    // `SET LOCAL` raises WARNING 25P01 and is silently discarded — a warning,
    // so the migration continues with the cluster's 2min default in force.
    const s = statementsOf(classifier);
    expect(s).toMatch(/^\s*set\s+statement_timeout\s*=/im);
    expect(s).not.toMatch(/set\s+local\s+statement_timeout/i);
  });
});

describe('marketplace_categories: the scrape residue is deactivated, not deleted', () => {
  it('destroys nothing', () => {
    const s = statementsOf(residue);
    expect(s).not.toMatch(/delete\s+from/i);
    expect(s).not.toMatch(/truncate/i);
    expect(s).not.toMatch(/drop\s+table/i);
  });

  it('flips is_active only', () => {
    expect(statementsOf(residue)).toMatch(/set\s+is_active\s*=\s*false/i);
  });

  it('keeps the discriminator that spares the seeded tree', () => {
    // The 10 legitimate categories are exactly the rows carrying a description.
    // Dropping this predicate takes them with the junk.
    expect(statementsOf(residue)).toMatch(/description\s+is\s+null/i);
  });

  it('bounds the sweep to the frozen import burst', () => {
    // Keeps a legitimate admin-created row (which may also have a NULL
    // description) added between authoring and merge out of scope.
    expect(statementsOf(residue)).toMatch(/created_at\s*<\s*timestamptz\s*'2025-07-24'/i);
  });
});
