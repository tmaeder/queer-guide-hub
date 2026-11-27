import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const P2 = readFileSync('supabase/migrations/99991795359711_spots_p2_fold.sql', 'utf8')
  .replace(/--[^\n]*/g, '')
  .toLowerCase();
const fn = (sql: string, name: string) => {
  const i = sql.indexOf(`function public.${name}(`);
  expect(i, `${name} is defined`).toBeGreaterThan(-1);
  return sql.slice(i, sql.indexOf('$$;', sql.indexOf('as $$', i)));
};

describe('spots P2 fold', () => {
  const batch = fn(P2, 'spots_fold_batch');

  it('does nothing until the drift gate opens', () => {
    expect(batch).toMatch(/if not public\.spots_fold_gate_open\(\) then\s+return/);
    const gate = fn(P2, 'spots_fold_gate_open');
    expect(gate).toMatch(/count\(distinct \(run_at at time zone 'utc'\)::date\) >= 7/);
    expect(gate).toMatch(/coalesce\(bool_and\(drift_count = 0\), false\)/);
  });

  it('folds only pure, unclaimed, single-venue shadows', () => {
    for (const clause of [
      "o.roles = array['venue']",
      'o.claimed_by is null',
      'o.legal_name is null',
      'o.founded_at is null',
      'v.duplicate_of_id is null',
      'where v2.organization_id = o.id) = 1',
      'where d.duplicate_of_id = o.id',
      'from public.hotels x where x.organization_id = o.id',
      'from public.affiliate_partners x where x.organization_id = o.id',
    ]) {
      expect(batch).toContain(clause);
    }
    expect(batch).toMatch(/least\(coalesce\(p_limit, 300\), 300\)/);
  });

  it('writes the audit row and the slug redirect before deleting the org', () => {
    const audit = batch.indexOf('insert into public.spot_fold_audit');
    const redirect = batch.indexOf('insert into public.venue_slug_redirects');
    const del = batch.indexOf('delete from public.organizations where id = r.org_id');
    expect(audit).toBeGreaterThan(-1);
    expect(redirect).toBeGreaterThan(audit);
    expect(del).toBeGreaterThan(redirect);
  });

  it('can be undone', () => {
    const unfold = fn(P2, 'unfold_spot');
    expect(unfold).toMatch(/insert into public\.organizations select \* from jsonb_populate_record/);
    expect(unfold).toMatch(/update public\.venues set organization_id = a\.organization_id/);
  });

  it('stops minting shadows with DISABLE, never DROP (DROP blocks venue reads)', () => {
    expect(P2).toMatch(/alter table public\.venues disable trigger cms_location_identity_insert/);
    expect(P2).not.toMatch(/drop trigger[^;]*cms_location_identity_insert/);
  });

  it('retires org_spine_backfill registry-first', () => {
    const disable = P2.indexOf("update public.admin_automations set enabled = false where slug = 'org_spine_backfill'");
    const unschedule = P2.indexOf("cron.unschedule('org_spine_backfill')");
    expect(disable).toBeGreaterThan(-1);
    expect(unschedule).toBeGreaterThan(disable);
    expect(P2).not.toMatch(/delete from public\.admin_automations/);
  });

  it('locks the new functions down', () => {
    for (const f of ['spots_fold_gate_open()', 'spots_fold_batch(integer)', 'unfold_spot(bigint)']) {
      expect(P2).toContain(`revoke execute on function public.${f} from public, anon, authenticated`);
    }
  });
});
