import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error -- untyped .mjs helper, imported for its runtime shape only.
import { buildAuditRows } from '../../../scripts/data-quality/lib/city-region-audit.mjs';

/**
 * `city-region-backfill` ran exactly once, on 2026-09-09, and died on
 *
 *   23502 null value in column "before_value" of relation
 *         "external_correction_audit" violates not-null constraint
 *
 * before writing a single row. `before_value` is `jsonb NOT NULL` and the jsonb
 * scalar 'null' is how the schema spells "the column was empty"; PostgREST maps
 * a JSON null in a request body to SQL NULL, so the representation the table
 * mandates was unwritable through a direct insert.
 *
 * The two encodings that DO insert are worse than the crash, which is why this
 * file asserts a payload property rather than merely "it inserts":
 *
 *   {"before_value": "null"}  -> jsonb *string*, `= 'null'::jsonb` is false
 *   text/csv bare  null       -> jsonb *string*, same
 *
 * Either would leave an audit row whose before-image is the four-character
 * string "null", which `rollback_external_correction_batch` would faithfully
 * restore INTO `cities.region_name`. A test that only checked "no JSON null
 * present" would pass on both. So the assertions below pin the value to
 * *exactly* JSON null, present as a key.
 */

describe('buildAuditRows', () => {
  const rows = buildAuditRows(
    [
      { id: '11111111-1111-4111-8111-111111111111', state: 'Bavaria' },
      { id: '22222222-2222-4222-8222-222222222222', state: 'Catalonia' },
    ],
    '33333333-3333-4333-8333-333333333333',
  );

  it('builds one audit row per city', () => {
    expect(rows).toHaveLength(2);
    expect(rows[0].entity_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(rows[0].after_value).toBe('Bavaria');
    expect(rows[0].batch_id).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('states the before-image explicitly rather than omitting it', () => {
    // Presence is half the property. The RPC raises on an absent key, because
    // "we did not capture the before-image" is a different claim from "the
    // column was empty" and is never assumed.
    for (const r of rows) {
      expect(Object.prototype.hasOwnProperty.call(r, 'before_value')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(r, 'after_value')).toBe(true);
    }
  });

  it('carries before_value as JSON null, not the string "null"', () => {
    for (const r of rows) {
      expect(r.before_value).toBeNull();
      // The string "null" round-trips through JSON looking almost identical and
      // is what a well-meaning "fix" for the 23502 reaches for first. It stores
      // a jsonb string, which is not what the rollback compares against.
      expect(r.before_value).not.toBe('null');
      expect(typeof r.before_value).not.toBe('string');
    }
  });

  it('serialises to a body the RPC turns into the jsonb scalar null', () => {
    // What actually goes on the wire. `->'before_value'` on this yields
    // jsonb 'null'; a record cast (which is what a direct table insert uses)
    // would yield SQL NULL, which is the bug.
    const wire = JSON.parse(JSON.stringify({ p_rows: rows }));
    expect(wire.p_rows[0].before_value).toBeNull();
    expect(JSON.stringify(wire.p_rows[0])).toContain('"before_value":null');
    expect(JSON.stringify(wire.p_rows[0])).not.toContain('"before_value":"null"');
  });
});

/**
 * The script must not go back to posting straight at the table: that path
 * structurally cannot store the value, whatever the payload says.
 */
describe('backfill-city-region write path', () => {
  const src = readFileSync(
    join(process.cwd(), 'scripts/data-quality/backfill-city-region.mjs'),
    'utf8',
  );

  it('writes audit rows through the RPC, not the table', () => {
    expect(src).toContain('rest/v1/rpc/record_external_corrections');
    expect(src).not.toContain('rest/v1/external_correction_audit');
  });

  it('sends the RPC argument under its exact name', () => {
    // PostgREST resolves by argument NAME and answers a mismatch with a silent
    // PGRST202 404 — a wrong name here fails as "no rows written", not as an
    // error, which is the failure mode this whole job already suffered.
    expect(src).toMatch(/p_rows:/);
  });
});

/**
 * And the RPC it depends on has to exist, with the `->` read that is the fix.
 */
describe('record_external_corrections migration', () => {
  const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
  const file = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()
    .find((f) =>
      readFileSync(join(MIGRATIONS, f), 'utf8').includes(
        'function public.record_external_corrections',
      ),
    );
  const sql = file ? readFileSync(join(MIGRATIONS, file), 'utf8') : '';

  it('exists', () => {
    expect(file).toBeDefined();
  });

  it('reads the payload with -> so an explicit null survives', () => {
    // Comment-stripped, so prose in the (long) header cannot satisfy this.
    const code = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    expect(code).toMatch(/e->'before_value'/);
    // A record cast would reintroduce the exact bug.
    expect(code).not.toMatch(/jsonb_to_recordset|json_to_recordset/);
  });

  it('raises on an omitted before-image rather than assuming empty', () => {
    expect(sql).toMatch(/omit before_value/);
  });

  it('is gated to service_role', () => {
    expect(sql).toMatch(
      /revoke all on function public\.record_external_corrections\(jsonb\) from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.record_external_corrections\(jsonb\) to service_role/i,
    );
  });
});
