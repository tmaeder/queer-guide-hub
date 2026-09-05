import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `external_correction_audit` is the before-image that makes auto-correction
 * from public datasets survivable. Four of its properties are load-bearing and
 * each is easy to "simplify" away by someone who does not know what it cost:
 *
 *  1. `before_value NOT NULL` — a row without a before-image looks like
 *     coverage and cannot be rolled back. SQL NULL is recorded as the jsonb
 *     scalar 'null' so "the column was empty" stays distinct from "we failed to
 *     capture it".
 *  2. The rollback must NOT use `review_field_registry.apply_mode`. That column
 *     describes how a review APPROVAL writes a value and one of its modes is
 *     `text_array_union` — merging. A rollback that merged would union the bad
 *     value back in rather than restore anything.
 *  3. The rollback must skip rows whose live value no longer equals what we
 *     wrote. Otherwise an emergency revert clobbers whatever human or later job
 *     touched the row in the meantime — a second unwanted write, not a repair.
 *     Same rule as the tag wikidata repair, which re-checks the live identifier.
 *  4. An unmapped (entity_type, field) or an unsupported column type must RAISE.
 *     A partial revert is a worse state than none, and a silently wrong cast
 *     writes damage while reporting success.
 *
 * Text check against the migrations directory, so it runs in CI without
 * credentials — same pattern as citySafetyBackfill.test.ts.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function migrationCarrying(needle: string): string {
  const file = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()
    .find((f) => readFileSync(join(MIGRATIONS, f), 'utf8').includes(needle));
  if (!file) throw new Error(`no migration defines ${needle}`);
  return readFileSync(join(MIGRATIONS, file), 'utf8');
}

describe('external_correction_audit', () => {
  const sql = migrationCarrying('create table if not exists public.external_correction_audit');

  it('records a before-image that cannot be absent', () => {
    // The column, and the migration's own assertion that it stayed NOT NULL.
    expect(sql).toMatch(/before_value\s+jsonb\s+not null/i);
    expect(sql).toMatch(/before_value must be NOT NULL/i);
  });

  it('groups a run so it can be reverted as a unit', () => {
    expect(sql).toMatch(/batch_id\s+uuid\s+not null/i);
    expect(sql).toMatch(/idx_eca_batch/);
  });

  it('is not readable or writable by anon', () => {
    expect(sql).toMatch(
      /revoke all on public\.external_correction_audit from anon, authenticated/i,
    );
    expect(sql).toMatch(/enable row level security/i);
  });
});

describe('rollback_external_correction_batch', () => {
  const sql = migrationCarrying('function public.rollback_external_correction_batch');
  // Just the function body, so assertions cannot be satisfied by a comment
  // elsewhere in the file.
  const body = sql.slice(
    sql.indexOf('create or replace function public.rollback_external_correction_batch'),
  );

  it('restores verbatim and never through apply_mode', () => {
    // apply_mode may be *named* in prose — the `comment on` documents why it is
    // avoided — but must never be read as a column. Strip line comments AND
    // single-quoted literals so this asserts about executable SQL only.
    const code = body
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
      .replace(/'(?:[^']|'')*'/g, "''");
    expect(code).not.toMatch(/apply_mode/);
    // And the resolution it DOES use is present.
    expect(code).toMatch(/g\.target_table/);
    expect(code).toMatch(/g\.target_column/);
  });

  it('skips rows whose live value moved on', () => {
    // The UPDATE is guarded on the current value still equalling after_value.
    expect(body).toMatch(/coalesce\(to_jsonb\(%I\), ''null''::jsonb\) = \$3/);
    expect(body).toMatch(/skipped_moved/);
  });

  it('refuses the whole batch when a field is unmapped, and names it', () => {
    expect(body).toMatch(/cannot revert batch %: no review_field_registry mapping/i);
    // Named, not merely counted — the remedy is to register that exact row.
    expect(body).toMatch(/array_to_string\(v_missing/);
  });

  it('raises on an unsupported column type rather than coercing', () => {
    expect(body).toMatch(/rollback does not support column type/i);
    expect(body).toMatch(/else null\s*\n\s*end;/);
  });

  it('is gated to service_role', () => {
    expect(sql).toMatch(
      /revoke all on function public\.rollback_external_correction_batch\(uuid, integer\) from public, anon, authenticated/i,
    );
    expect(sql).toMatch(/assert_admin_or_internal/);
  });

  it('takes skipped rows out of the work list so the drain cannot wedge', () => {
    // `order by id limit n` over a predicate that a row can never satisfy means
    // unrevertable rows sit at the head and are rescanned every call; once they
    // outnumber the limit the drain stops advancing. So a skip is STAMPED, and
    // both the selector and the remaining-count honour the stamp.
    expect(body).toMatch(/and a\.skipped_at is null/);
    expect(body).toMatch(/set skipped_at = now\(\)/);
    expect(body).toMatch(/reverted_at is null and skipped_at is null/);
  });

  it('reports skips rather than silently absorbing them', () => {
    expect(body).toMatch(/skip_reason/);
    expect(body).toMatch(/'skipped_moved',\s*v_moved/);
  });
});
