import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/**
 * `COMMENT ON ... IS` takes a string LITERAL, not an expression.
 *
 * Postgres accepts no concatenation there, so
 *
 *   comment on function f() is 'a ' || 'b';
 *
 * is a syntax error (42601) — and a migration is not parsed until `db push`
 * reaches it, which means the whole queue behind it dies with it. That is
 * exactly what happened on 2026-09-14: `50500101100300` carried a four-fragment
 * `||` comment, `db push` aborted on main at that file, and the six migrations
 * sorting after it (including a whole PR's worth of queue-drain work that had
 * already merged green) never applied. Reproduced on prod in a rolled-back
 * transaction: the concatenated form raises `42601 syntax error at or near "||"`,
 * the single-literal form parses and stores byte-identical text.
 *
 * Nothing else could have caught it. It is valid-looking SQL, it is not a
 * postcondition, no unit test executes migration SQL, and CI's migration checks
 * only look at VERSIONS. The cost of the miss is repo-wide rather than local,
 * which is what earns a corpus-wide invariant rather than a fix to one file.
 */

type Hit = { file: string; line: number; text: string };

/**
 * Scan for `||` inside a COMMENT ON statement.
 *
 * Deliberately line-based and started only by a line that OPENS a `comment on`
 * statement, ending at the first line whose trailing character is the statement
 * terminator. A whole-file search for `||` would match every ordinary
 * concatenation in the corpus (thousands), and a regex spanning the statement
 * body was tried first and silently matched NOTHING — indistinguishable from a
 * clean corpus, which is the failure mode this repo keeps recording. The
 * line-based form was verified to find the real defect before being trusted.
 */
function concatInsideCommentOn(sql: string, file: string): Hit[] {
  const hits: Hit[] = [];
  let inside = false;

  sql.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    // A `--` comment line is prose, never a statement: it can neither open a
    // COMMENT ON nor terminate one, and its text may legitimately contain `||`.
    if (line.startsWith('--')) return;

    if (!inside && /^comment\s+on\s+/i.test(line)) inside = true;
    if (inside && line.includes('||')) {
      hits.push({ file, line: i + 1, text: line });
    }
    if (inside && /;\s*$/.test(line)) inside = false;
  });

  return hits;
}

describe('COMMENT ON takes a literal, never an expression', () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));

  it('reads a corpus large enough for the sweep to mean something', () => {
    // A sweep over an empty or mis-pathed directory reports zero defects and
    // reads exactly like a clean corpus — the absence-vs-clean confusion this
    // codebase keeps re-learning. Assert it actually looked at something.
    expect(files.length).toBeGreaterThan(1000);
  });

  it('finds no concatenation inside any COMMENT ON statement', () => {
    const hits = files.flatMap((f) =>
      concatInsideCommentOn(readFileSync(join(MIGRATIONS, f), 'utf8'), f),
    );

    expect(
      hits.map((h) => `${h.file}:${h.line}: ${h.text}`),
      'COMMENT ON ... IS takes a string literal; `||` there is a 42601 that aborts db push and every migration queued behind it. Join the fragments into one literal.',
    ).toEqual([]);
  });

  it('detects the real defect — positive control', () => {
    // The exact shape that took main down, so a scanner that stops matching
    // fails here rather than reporting a clean corpus forever.
    const broken = [
      'comment on function public.f() is',
      "  'first fragment. '",
      "  || 'second fragment.';",
    ].join('\n');

    expect(concatInsideCommentOn(broken, 'fixture.sql')).toHaveLength(1);
  });

  it('does not fire on ordinary concatenation outside a COMMENT ON', () => {
    // The corpus is full of legitimate `||`. A scanner that flags those is one
    // nobody can keep green, which is how a guard gets deleted.
    const fine = [
      "select 'a' || 'b';",
      'comment on function public.f() is',
      "  'one literal, no concatenation.';",
      "update t set x = 'a' || 'b';",
    ].join('\n');

    expect(concatInsideCommentOn(fine, 'fixture.sql')).toEqual([]);
  });

  it('does not fire on a `--` line INSIDE an open COMMENT ON statement', () => {
    // The `--` skip only ever matters here: a prose line sitting between the
    // `comment on` opener and its terminator, mentioning the operator it exists
    // to warn about. A first draft of this test put the `--` line ABOVE the
    // statement, where `inside` is still false and the skip is never consulted
    // — it passed with the skip deleted, i.e. it asserted nothing. Keep the
    // comment line where the scanner can actually reach it.
    const documented = [
      'comment on function public.f() is',
      '  -- never `||` here: COMMENT ON takes a literal',
      "  'one literal.';",
    ].join('\n');

    expect(concatInsideCommentOn(documented, 'fixture.sql')).toEqual([]);
  });
});
