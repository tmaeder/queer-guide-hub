import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// zzz_venue_gate_to_org propagates a venue's safety gate onto the organization
// that mirrors it. It was `after update of safety_gated, duplicate_of_id`, and a
// column list fires on the columns NAMED IN THE STATEMENT: a statement setting
// only `category` flips the venue's gate through its BEFORE trigger and never
// reaches this one. On 2026-11-27 that left 161 organizations on the wrong side
// of the gate (see 99991795807085). In the other direction it publishes an
// organization whose venue was just reclassified as cruising.
//
// The guard reads the LATEST migration that creates the trigger, not a fixed
// file, so a later restatement that brings the column list back fails here.

const MIG_DIR = join(process.cwd(), 'supabase/migrations');
const FIX = '99991795807085_venue_gate_propagation_value_scoped.sql';

const stripped = (f: string) =>
  readFileSync(join(MIG_DIR, f), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');

const creators = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => /create trigger zzz_venue_gate_to_org/i.test(stripped(f)));

const latest = creators[creators.length - 1];

// The CREATE TRIGGER statement itself, up to its terminating semicolon.
const createStmt = (f: string) => {
  const sql = stripped(f);
  const i = sql.search(/create trigger zzz_venue_gate_to_org/i);
  const j = sql.indexOf(';', i);
  return sql.slice(i, j);
};

describe('venue gate propagation fires on the value, not the statement', () => {
  it('positive control: finds the earlier column-scoped definition and this fix', () => {
    expect(creators).toContain('99991792753155_org_safety_gate_follows_venue_merge.sql');
    expect(creators).toContain(FIX);
    // The control the guard stands on: the old definition IS column-scoped,
    // so a regex that matched nothing would fail here rather than pass below.
    expect(createStmt('99991792753155_org_safety_gate_follows_venue_merge.sql')).toMatch(
      /after update of safety_gated/i,
    );
  });

  it('the latest definition has no column list', () => {
    const stmt = createStmt(latest);
    expect(stmt).toMatch(/after update on public\.venues/i);
    expect(stmt).not.toMatch(/update of/i);
  });

  it('the latest definition still fires only on a real change', () => {
    const stmt = createStmt(latest);
    expect(stmt).toMatch(/old\.safety_gated is distinct from new\.safety_gated/i);
    expect(stmt).toMatch(/old\.duplicate_of_id is distinct from new\.duplicate_of_id/i);
    expect(stmt).toMatch(/execute function public\.propagate_venue_gate_to_organization\(\)/i);
  });

  it('swaps the trigger under a bounded, retried lock in one subtransaction', () => {
    const sql = stripped(FIX);
    expect(sql).toMatch(/set_config\('lock_timeout', '2s', true\)/);
    expect(sql).toMatch(/exception when lock_not_available/);
    // The last attempt must re-raise: swallowing it exits the loop with no trigger.
    expect(sql).toMatch(/if i = 20 then raise; end if;/);
    const drop = sql.indexOf('drop trigger if exists zzz_venue_gate_to_org');
    const create = sql.search(/create trigger zzz_venue_gate_to_org/i);
    const handler = sql.indexOf('exception when lock_not_available');
    // Drop and create inside the same retried block: never a window without it.
    expect(drop).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(drop);
    expect(handler).toBeGreaterThan(create);
  });

  it('checks the exposure direction and needs no data to pass it', () => {
    const sql = stripped(FIX);
    expect(sql).toMatch(/if v_bad <> 0 then\s+raise exception 'P4 failed/);
    expect(sql).toMatch(/coalesce\(o\.safety_gated, false\) is false/);
  });

  it('proves the trigger fires with a rolled-back category-only probe', () => {
    const sql = stripped(FIX);
    const probe = sql.slice(sql.indexOf('if v_org is null then'), sql.indexOf('end $verify$'));
    // The probe names only category, the statement shape that hid the defect.
    expect(probe).toMatch(/update public\.venues set category = 'cruising' where id = v_venue;/);
    expect(probe).not.toMatch(/safety_gated\s*=/);
    // It always raises inside its own block, so the change rolls back.
    expect(probe).toMatch(/raise exception using errcode = 'QG001'/);
    expect(probe).toMatch(/exception when sqlstate 'QG001' then/);
    expect(probe).toMatch(/if sqlerrm <> 'true' then\s+raise exception 'P5 failed/);
  });

  it('skips the probe on an empty database instead of failing the rebuild', () => {
    const sql = stripped(FIX);
    // CI replays every migration into an empty schema; a probe that demands a
    // row there aborts db push for the whole repo.
    expect(sql).toMatch(/if v_org is null then\s+raise notice 'P5 skipped/);
    expect(sql).not.toMatch(/raise exception '[^']*no ungated organization/);
  });

  it('raises when the deployed trigger is missing, column-scoped or unguarded', () => {
    const sql = stripped(FIX);
    expect(sql).toMatch(/if v_def is null then\s+raise exception 'P1 failed/);
    expect(sql).toMatch(/if v_def ~\* 'update of' then\s+raise exception 'P2 failed/);
    expect(sql).toMatch(
      /if v_def !~\* 'old\\\.safety_gated is distinct from new\\\.safety_gated' then\s+raise exception 'P3 failed/,
    );
  });
});
