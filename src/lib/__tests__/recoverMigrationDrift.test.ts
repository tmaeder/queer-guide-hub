import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

// @ts-expect-error — .mjs script lib, no types
import { STATEMENT_SEPARATOR, buildRecoveredSql } from '../../../scripts/lib/remote-migrations.mjs';

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
