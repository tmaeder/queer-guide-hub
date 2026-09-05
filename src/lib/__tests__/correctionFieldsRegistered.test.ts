import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every (entity_type, field) a backfill writes to `external_correction_audit`
 * must be registered in `review_field_registry`.
 *
 * WHY. `rollback_external_correction_batch` resolves the target column through
 * that registry and refuses the WHOLE batch when any field is unmapped — a
 * half-revert being a worse state than none. So an unregistered field means the
 * audit records the change faithfully and the revert can never run.
 *
 * That shipped. Measured on prod 2026-09-05, all three fields the city
 * backfills write — timezone, climate_type, region_name — were absent from the
 * registry, and every rollback of them would have raised. Nothing was damaged
 * only because no backfill had been run with --apply yet. Fixed by
 * 20270310100000.
 *
 * The rollback's own tests could not catch this: they assert the GUARD (an
 * unmapped field refuses and is named), which is a property of the code.
 * Whether a *particular* field is registered is data in a table. This test is
 * the bridge — it reads what the scripts write and what the migrations
 * register, and fails when they diverge.
 */

const ROOT = process.cwd();
const SCRIPTS = join(ROOT, 'scripts', 'data-quality');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

/** (entity_type, field) pairs written into external_correction_audit by scripts. */
function fieldsWrittenByScripts(): Array<{ file: string; entity: string; field: string }> {
  const out: Array<{ file: string; entity: string; field: string }> = [];
  for (const f of readdirSync(SCRIPTS).filter((n) => n.endsWith('.mjs'))) {
    const src = readFileSync(join(SCRIPTS, f), 'utf8');
    if (!src.includes('external_correction_audit')) continue;
    // The audit payload is an object literal carrying both keys close together.
    for (const m of src.matchAll(
      /entity_type:\s*'([a-z_]+)'[\s\S]{0,200}?\bfield:\s*'([a-z_.]+)'/g,
    )) {
      out.push({ file: f, entity: m[1], field: m[2] });
    }
  }
  return out;
}

/** (entity_type, field) pairs registered by any migration. */
function fieldsRegistered(): Set<string> {
  const reg = new Set<string>();
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql'))) {
    const src = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (!src.includes('review_field_registry')) continue;
    // Rows are written as ('entity', 'field', 'Label', 'table', 'column', …).
    for (const m of src.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_.]+)'\s*,\s*'[^']*'\s*,/g)) {
      reg.add(`${m[1]}.${m[2]}`);
    }
  }
  return reg;
}

describe('correction fields are registered for rollback', () => {
  const written = fieldsWrittenByScripts();
  const registered = fieldsRegistered();

  it('finds the audit-writing scripts at all', () => {
    // A positive control. If the regex stops matching, this test would pass
    // vacuously by finding nothing to check — which is how the original defect
    // would have survived a guard written carelessly.
    expect(written.length).toBeGreaterThanOrEqual(3);
    const entities = new Set(written.map((w) => w.entity));
    expect(entities.has('city')).toBe(true);
  });

  it('finds registry rows at all', () => {
    expect(registered.size).toBeGreaterThanOrEqual(3);
  });

  it('registers every field any backfill writes', () => {
    const missing = written
      .filter((w) => !registered.has(`${w.entity}.${w.field}`))
      .map((w) => `${w.entity}.${w.field} (written by ${w.file})`);
    // A field here means rollback_external_correction_batch would refuse any
    // batch containing it — the audit would record the change and the revert
    // could never run.
    expect(missing).toEqual([]);
  });

  it('covers the three city fields the P2 backfills write', () => {
    for (const f of ['city.timezone', 'city.climate_type', 'city.region_name']) {
      expect(registered.has(f)).toBe(true);
    }
  });
});
