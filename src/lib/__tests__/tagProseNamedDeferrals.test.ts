import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards `51500101152700`, which closes the rows three earlier passes left by
 * decision and NAMED so a later pass could tell "left by decision" from
 * "already fixed".
 *
 * The assertions that matter here are not "did it write my prose" — they are
 * the three places this file could do harm:
 *
 *   1. `young` must lose its body and KEEP its summary. It is `is_adult`,
 *      indexable and 62 uses, `description` is NULL, and `tag_has_prose` is
 *      `coalesce(nullif(btrim(description),''), short_description) is not null`
 *      — so nulling both fields would unpublish a live page as a side effect
 *      of a prose fix.
 *   2. `description` must never be written. It is the evidence that justified
 *      half these repairs; writing it would change what justified the change.
 *   3. `black`, `peaches` and `warlord` must stay untouched. They are the cost
 *      of the rule this file widens, and quietly repairing them later would
 *      erase the distinction the widening turns on.
 */

const FILE = join(
  process.cwd(),
  'supabase/migrations/51500101152700_tag_prose_named_deferrals.sql',
);

const sql = readFileSync(FILE, 'utf8');

/** Statements only — a claim made in a comment is not a guard. */
function statements(): string {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

describe('named deferrals migration', () => {
  const code = statements();

  it('declares an actor, which the audit trigger requires', () => {
    // Verified live: without this, updating `lion` returns
    // "human_reviewed tag … cannot be modified by system:trigger".
    expect(code).toMatch(/set_config\(\s*'app\.actor'\s*,\s*'migration:51500101152700'/);
  });

  it('never writes description', () => {
    // The evidence for steer and lion lives there. Any `set` touching it is a
    // bug, so assert over the UPDATE statements rather than the whole file.
    const updates = code.split(/update\s+unified_tags/i).slice(1);
    expect(updates.length).toBeGreaterThan(0);
    for (const u of updates) {
      const setClause = u.slice(0, u.search(/\bwhere\b/i));
      expect(setClause).not.toMatch(/\bdescription\s*=/);
      // `short_description`/`long_description` must not be caught by that.
      expect(setClause).toMatch(/(short_description|long_description)\s*=/);
    }
  });

  it('nulls young’s body and leaves its summary alone', () => {
    const start = code.indexOf("slug = 'young'");
    expect(start).toBeGreaterThan(-1);
    const stmtStart = code.lastIndexOf('update unified_tags', start);
    const stmt = code.slice(stmtStart, start);
    expect(stmt).toMatch(/long_description\s*=\s*null/);
    // The load-bearing half: it must NOT also clear the summary.
    expect(stmt).not.toMatch(/short_description\s*=/);
  });

  it('asserts young stays above the thin-page gate', () => {
    // Without this the previous test's invariant is only a convention.
    expect(code).toMatch(/tag_has_prose\(description,\s*short_description\)/);
    expect(code).toMatch(/young fell below the thin-page gate/);
  });

  it('hard-fails while young still publishes a body', () => {
    const guard = code.slice(
      code.indexOf("slug = 'young' and status = 'active' and long_description is not null"),
    );
    expect(guard.slice(0, 200)).toMatch(/raise exception/);
  });

  it('leaves black, peaches and warlord untouched', () => {
    const updates = code.split(/update\s+unified_tags/i).slice(1);
    for (const slug of ['black', 'peaches', 'warlord']) {
      for (const u of updates) {
        expect(u.slice(0, u.search(/;/))).not.toContain(`'${slug}'`);
      }
    }
  });

  it('still names the deliberately-left rows, so the list stays honest', () => {
    // A pass that silently stopped reporting them would make the next pass
    // unable to tell "deferred" from "fixed" — the thing the naming exists for.
    expect(code).toMatch(/black/);
    expect(code).toMatch(/peaches/);
    expect(code).toMatch(/warlord/);
    expect(code).toMatch(/raise notice/);
  });

  it('tests for the WRONG text, not for its own wording', () => {
    // A postcondition pinned to this file's prose aborts db push on main if a
    // human writes something better first, which blocks every queued migration.
    expect(code).toMatch(/short_description = 'Family name or navigation term'/);
    expect(code).toMatch(/short_description = 'Large cat species'/);
    expect(code).not.toMatch(/short_description = 'A castrated bull\.'\s*\)/);
  });

  it('guards every repair on the defect’s own text', () => {
    // So a human who fixes one first keeps their work and this file no-ops.
    for (const slug of ['steer', 'lion', 'gym', 'library', 'office']) {
      const i = code.indexOf(`slug = '${slug}'`);
      expect(i).toBeGreaterThan(-1);
      const where = code.slice(i, code.indexOf(';', i));
      expect(where).toMatch(/and\s+(short_description|long_description)\s*(=|like)/);
    }
  });
});
