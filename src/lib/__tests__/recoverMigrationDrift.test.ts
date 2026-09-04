import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

// Kept on ONE line on purpose: `@ts-expect-error` suppresses the next LINE, and
// TS7016 for an untyped .mjs is reported at the module specifier, not at
// `import {`. Wrapping this import made the directive cover a line that no
// longer errored (TS2578 unused) while the real error moved out from under it —
// two CI failures from a purely cosmetic reformat.
// @ts-expect-error — .mjs script lib, no type declarations
import { STATEMENT_SEPARATOR, buildRecoveredSql, planRecovery } from '../../../scripts/lib/remote-migrations.mjs';

const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex');

/** A body as fetchMigrationBodies returns it, with a correct server digest. */
function body(statements: string[], name = 'some_migration') {
  const joined = statements.join(STATEMENT_SEPARATOR);
  return { name, statements, joined, digest: md5(joined) };
}

/**
 * Guards the reconstruction half of scripts/recover-migration-drift.mjs.
 *
 * The script itself cannot run without a Management API token, so without these
 * the first execution of this logic would be in CI, on real drift, at the moment
 * someone is already blocked by a red check. Everything asserted here is a
 * property measured against prod rather than a guess about the storage format.
 */
describe('buildRecoveredSql', () => {
  /**
   * THE BUG THIS EXISTS TO PREVENT.
   *
   * `schema_migrations.statements` is a text[] of PARSED statements. Reading
   * `statements[1]` — which is what five hand-recoveries on 2026-08-29 did —
   * silently truncates a multi-statement migration to its first statement. Those
   * five survived only because every one happened to be single-statement;
   * 20261007163200 in the same corpus has four.
   */
  it('joins every statement, not just the first', () => {
    const sql = buildRecoveredSql('20261007163200', [
      "set local statement_timeout = '120s'",
      "select set_config('app.actor', 'migration:x', true)",
      'do $mig$ begin end $mig$',
      'do $verify$ begin end $verify$',
    ]);

    expect(sql).toContain('statement_timeout');
    expect(sql).toContain('set_config');
    expect(sql).toContain('$mig$');
    // The tail is the one a truncating implementation loses.
    expect(sql).toContain('$verify$');
  });

  /**
   * Postgres strips the trailing semicolon from each stored statement —
   * measured: statement 1 of 20261007163200 ends `…= '120s'` and the last ends
   * `end $verify$`. Joining on whitespace alone yields invalid SQL, which only
   * surfaces on a rebuild from zero: the one occasion an applied migration is
   * ever executed again.
   */
  it('restores the semicolons the storage strips', () => {
    const sql = buildRecoveredSql('20260101000000', ['select 1', 'select 2'], { header: false });
    expect(sql).toBe('select 1;\n\nselect 2;\n');
    // Every statement terminated, including the last.
    expect(sql.trimEnd().endsWith(';')).toBe(true);
  });

  /**
   * The digest the script verifies is computed server-side over
   * array_to_string(statements, ';\n\n'). The local join has to agree with that
   * separator exactly or every recovery would look corrupted and be skipped.
   */
  it('uses the separator the server digest is computed over', () => {
    const statements = ['select 1', 'select 2', 'select 3'];
    const joined = statements.join(STATEMENT_SEPARATOR);

    expect(STATEMENT_SEPARATOR).toBe(';\n\n');
    // Mirrors md5(array_to_string(statements, ';' || chr(10) || chr(10))).
    expect(createHash('md5').update(joined, 'utf8').digest('hex')).toHaveLength(32);
    expect(buildRecoveredSql('20260101000000', statements, { header: false })).toBe(`${joined};\n`);
  });

  /**
   * An empty array is not proof the migration did nothing — it is what a row
   * recorded by an out-of-band path looks like. Emitting an empty file would
   * assert "this was a no-op" on no evidence and turn a loud failure into a
   * silent lie, so the caller must skip and report instead.
   */
  it('returns null rather than an empty migration', () => {
    expect(buildRecoveredSql('20260101000000', [])).toBeNull();
    expect(buildRecoveredSql('20260101000000', null)).toBeNull();
    expect(buildRecoveredSql('20260101000000', ['', '   '])).toBeNull();
  });

  /** The header has to say where the file came from and that prose was lost. */
  it('records provenance in the header', () => {
    const sql = buildRecoveredSql('20260829120625', ['select 1']);
    expect(sql).toContain('20260829120625');
    expect(sql).toContain('recover-migration-drift');
    expect(sql).toMatch(/never re-run/i);
  });
});

/**
 * planRecovery decides whether a file is written at all, which makes it the half
 * where "never invent content" is actually enforced. It is pure so these rules
 * can be exercised without a Management API token — otherwise the first time
 * they ran would be in CI, on real drift, with someone already blocked.
 */
describe('planRecovery', () => {
  it('writes the file at the APPLIED version, not a new one', () => {
    const bodies = new Map([['20260829120625', body(['select 1'], 'u_equals_u_single_primary_category')]]);
    const { recovered, skipped } = planRecovery(['20260829120625'], bodies, { md5 });

    expect(skipped).toEqual([]);
    // db push matches on version: a file at any other version leaves the orphan
    // orphaned and adds a second problem.
    expect(recovered[0].file).toBe(
      'supabase/migrations/20260829120625_u_equals_u_single_primary_category.sql',
    );
  });

  /**
   * The rule that matters most. A corrupted file passes every downstream check
   * forever and misrepresents what ran; a missing one keeps failing until fixed.
   */
  it('refuses to write when the digest disagrees', () => {
    const corrupted = { ...body(['select 1']), digest: 'deadbeefdeadbeefdeadbeefdeadbeef' };
    const { recovered, skipped } = planRecovery(['20260101000000'], new Map([['20260101000000', corrupted]]), { md5 });

    expect(recovered).toEqual([]);
    expect(skipped[0].why).toMatch(/digest mismatch/i);
  });

  /** Empty statements is not proof of a no-op — it is an unknown, so escalate. */
  it('skips an empty statements array instead of writing an empty migration', () => {
    const empty = { name: 'x', statements: [], joined: '', digest: md5('') };
    const { recovered, skipped } = planRecovery(['20260101000000'], new Map([['20260101000000', empty]]), { md5 });

    expect(recovered).toEqual([]);
    expect(skipped[0].why).toMatch(/empty/i);
  });

  /** A version the fetch did not return must not silently vanish from the report. */
  it('skips — and reports — a version with no body', () => {
    const { recovered, skipped } = planRecovery(['20260101000000'], new Map(), { md5 });
    expect(recovered).toEqual([]);
    expect(skipped).toHaveLength(1);
  });

  /**
   * `statements` does not record comment headers, so a reconstruction loses the
   * reasoning. When the author's file exists on a branch it wins — and is taken
   * WITHOUT a digest check, because the real file legitimately differs from the
   * parsed statements (measured once at 6,300 bytes on disk vs 5,670 recorded).
   */
  it('prefers the authoring commit over a reconstruction', () => {
    const bodies = new Map([['20260101000000', body(['select 1'])]]);
    const { recovered } = planRecovery(['20260101000000'], bodies, {
      md5,
      findOnBranch: () => ({
        path: 'supabase/migrations/20260101000000_real_name.sql',
        sha: 'abc1234567',
        content: '-- the original file, with its reasoning\nselect 1;\n',
      }),
    });

    expect(recovered[0].content).toContain('with its reasoning');
    expect(recovered[0].source).toMatch(/^commit abc123456/);
    expect(recovered[0].file).toBe('supabase/migrations/20260101000000_real_name.sql');
  });

  /** Every orphan is planned in one pass — the whole point over hand-recovery. */
  it('plans all orphans at once, mixing outcomes', () => {
    const bodies = new Map([
      ['20260101000000', body(['select 1'])],
      ['20260101000001', { ...body(['select 2']), digest: 'nope' }],
      ['20260101000002', body(['select 3'])],
    ]);
    const { recovered, skipped } = planRecovery(
      ['20260101000000', '20260101000001', '20260101000002'],
      bodies,
      { md5 },
    );

    expect(recovered.map((r: { version: string }) => r.version)).toEqual([
      '20260101000000',
      '20260101000002',
    ]);
    expect(skipped.map((s: { version: string }) => s.version)).toEqual(['20260101000001']);
  });
});
