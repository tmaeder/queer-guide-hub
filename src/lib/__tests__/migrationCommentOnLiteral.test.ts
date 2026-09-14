import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `COMMENT ON ... IS` takes a string LITERAL, never an expression.
 *
 *   comment on function f() is 'part one ' || 'part two';   -- syntax error at or near "||"
 *
 * This is a PARSE error, so the statement cannot be reached at runtime and no
 * amount of correct surrounding logic saves it. `50500101100300` shipped with a
 * four-part concatenated comment, which aborted `db push` on main and — because
 * push stops at the first failing file — stranded every migration queued behind
 * it. Verified against prod: the concatenated form raises
 * `syntax error at or near "||"`.
 *
 * It survived review because the file's other statements were dry-run
 * individually while the file was never run end to end; a concatenated comment
 * reads perfectly naturally, and a linter that does not parse SQL cannot see it.
 * Hence a test rather than a note.
 *
 * Scoped to STATIC statements. A `comment on` built inside `execute` is dynamic
 * SQL where `||` is not only legal but the normal way to interpolate an
 * identifier, so those are deliberately not matched.
 */

const DIR = join(process.cwd(), 'supabase/migrations');

/** Static `COMMENT ON <kind> ... IS <payload>;` statements, payload captured. */
function staticCommentPayloads(sql: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)[ \t]*comment\s+on\s+[a-z]+\s+[^;]*?\bis\b([^;]*);/gis;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) out.push(m[1]);
  return out;
}

describe('migrations: COMMENT ON takes a literal', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql'));

  it('finds migrations to scan at all', () => {
    // Guards the guard: a glob that matches nothing passes every assertion
    // below while checking precisely nothing.
    expect(files.length).toBeGreaterThan(1000);
  });

  it('no migration concatenates a COMMENT ON payload', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const sql = readFileSync(join(DIR, f), 'utf8');
      for (const payload of staticCommentPayloads(sql)) {
        if (payload.includes('||')) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the matcher actually catches the shape that broke the deploy', () => {
    // Without this, the sweep above could be silently matching nothing.
    const bad = `comment on function public.f() is\n  'one '\n  || 'two';`;
    expect(staticCommentPayloads(bad).some((p) => p.includes('||'))).toBe(true);

    const good = `comment on function public.f() is\n  'one two';`;
    expect(staticCommentPayloads(good).some((p) => p.includes('||'))).toBe(false);
  });

  it('does not flag dynamic SQL, where concatenation is correct', () => {
    // `execute` builds a statement as a string; `||` there is interpolation,
    // not a malformed literal, and flagging it would make the rule unusable.
    const dynamic = `execute 'comment on table ' || quote_ident(t) || ' is ''x''';`;
    expect(staticCommentPayloads(dynamic).some((p) => p.includes('||'))).toBe(false);
  });
});
