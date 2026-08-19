import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `run_city_safety_backfill` has two exits, and only one of them used to be
 * self-healing.
 *
 * 20260816112824 made a stale derived note — one that no longer names the
 * city's own country — ELIGIBLE work after the "86 safety notes described the
 * wrong country" P0. But eligibility only gets the row selected. The
 * auto-publish branch overwrites `safety_notes` and so repairs itself; the
 * ELSE branch (composer says a human must approve) only INSERTed into
 * `entity_review_queue`, leaving the wrong note published while it waited.
 *
 * Auto-publish requires equality_score >= 75 and a non-criminalizing country,
 * so the gap was the entire sub-75 half of the corpus — precisely where naming
 * the wrong jurisdiction is most dangerous.
 *
 * This is a text check against the migrations directory, not a database one,
 * so it runs in CI without credentials — same pattern as
 * `src/lib/rights/__tests__/geoSpineDualWrite.test.ts`.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    // `create [or replace] function`, not merely `function`: a GRANT, REVOKE,
    // COMMENT ON, DROP or ALTER naming the function also contains
    // "function public.<fn>(" and would otherwise win the reverse scan.
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

const sql = latestDefinitionOf('run_city_safety_backfill');

/** The branch taken when compose_safety_note says a human must approve. */
const elseBranch = (() => {
  const start = sql.search(/IF\s*\(v_out->>'auto_publishable'\)::boolean\s+THEN/i);
  if (start < 0) return null;
  const rest = sql.slice(start);
  const elseAt = rest.search(/\n\s*ELSE\b/);
  const endAt = rest.search(/\n\s*END IF;/);
  if (elseAt < 0 || endAt < 0 || endAt < elseAt) return null;
  return rest.slice(elseAt, endAt);
})();

describe('run_city_safety_backfill retracts a stale note it cannot republish', () => {
  it('parses the review-queue branch', () => {
    expect(
      elseBranch,
      'could not find the ELSE branch of the auto_publishable test',
    ).not.toBeNull();
  });

  it('clears cities.safety_notes when the queued note is stale', () => {
    // Without this the wrong-country note stays published for however long the
    // human review takes. Observed live 2026-08-19: Novosibirsk (RU) kept a
    // note about Germany, Sendai (JP) one about the United States.
    expect(elseBranch ?? '').toMatch(/safety_notes\s*=[\s\S]{0,80}\bNULL\b/i);
  });

  it('preserves the retracted text under field_provenance rather than destroying it', () => {
    expect(elseBranch ?? '').toMatch(/'retracted'/);
  });

  it('still raises needs_attention', () => {
    expect(elseBranch ?? '').toMatch(/needs_attention\s*=\s*true/i);
  });

  it('writes cities once per queued row', () => {
    // cities UPDATEs fire trg_search_documents_city; the 300-row batch cap on
    // this job exists because of that trigger. Retraction and needs_attention
    // must stay one statement.
    const writes = (elseBranch ?? '').match(/UPDATE\s+public\.cities\b/gi) ?? [];
    expect(writes.length).toBe(1);
  });
});

describe('the retraction can only ever touch a derived note', () => {
  it('gates staleness on provenance source = derived', () => {
    // A note approved by a human through approve_city_review is stamped
    // 'llm+human' and must never be unpublished by the composer.
    expect(sql).toMatch(/->>'source'\s*=\s*'derived'/);
  });

  it('keeps llm+human rows out of the selector entirely', () => {
    expect(sql).toMatch(/->>'source'[\s\S]{0,40}<>\s*'llm\+human'/);
  });

  it("detects staleness by comparing the note against the city's own country", () => {
    expect(sql).toMatch(/safety_notes\s+NOT\s+ILIKE\s+'%'\s*\|\|\s*co\.name/i);
  });
});
