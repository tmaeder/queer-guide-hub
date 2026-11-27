import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIG_DIR = join(process.cwd(), 'supabase/migrations');
const MIGRATION = '99991795373578_dedup_sweep_unblock.sql';

// The header quotes the old predicate, so assert over comment-stripped SQL only.
const stripped = (f: string) =>
  readFileSync(join(MIG_DIR, f), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');

const sql = stripped(MIGRATION);
const between = (from: string, to: string) => {
  const i = sql.indexOf(from);
  const j = sql.indexOf(to, i + from.length);
  expect(i, `missing ${from}`).toBeGreaterThan(-1);
  expect(j, `missing ${to}`).toBeGreaterThan(i);
  return sql.slice(i, j);
};

describe('venue merge -> organization gate propagation', () => {
  const body = between('function public.propagate_venue_gate_to_organization()', 'end $prop$');

  it('matches organizations through the primary_venue_id index, not an OR over a subquery', () => {
    // The OR form seq-scanned ~110k organizations (~43k blocks) per venue merge.
    expect(body).toMatch(/where o\.primary_venue_id = any \(array\(/);
    expect(body).not.toMatch(/\bor o\.primary_venue_id in\b/i);
  });

  it('still re-decides orgs whose primary IS the venue and whose primary merged into it', () => {
    expect(body).toMatch(
      /select new\.id\s+union all\s+select d\.id from public\.venues d where d\.duplicate_of_id = new\.id/,
    );
    expect(body).toContain('set primary_venue_id = o.primary_venue_id');
  });

  it('is the latest definition of the function', () => {
    const later = readdirSync(MIG_DIR)
      .filter((f) => f > MIGRATION && f.endsWith('.sql'))
      // A DEFINITION, not a reference: `execute function public.<name>()` in a
      // CREATE TRIGGER calls the function and must not count as restating it.
      .filter((f) =>
        /create\s+(or\s+replace\s+)?function\s+public\.propagate_venue_gate_to_organization/i.test(
          stripped(f),
        ),
      );
    expect(later).toEqual([]);
  });
});

describe('dedup sweep runs as committed groups', () => {
  const cron = between("cron.schedule('dedup_truth_sweep'", '$cmd$);');
  const statements = cron
    .split('\n')
    .filter((l) => l.startsWith('select public.run_dedup_truth_sweep_all('));

  it('covers every type exactly once across four statements', () => {
    expect(statements).toHaveLength(4);
    const types = statements.flatMap((s) => [...s.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
    expect([...types].sort()).toEqual(
      [
        'city',
        'country',
        'event',
        'group',
        'hotel',
        'marketplace',
        'milestone',
        'news',
        'organization',
        'personality',
        'queer_village',
        'venue',
      ].sort(),
    );
  });

  it('commits between groups and runs venue last, so a venue timeout cannot cost the rest', () => {
    expect(cron.match(/^commit;$/gm)).toHaveLength(3);
    expect(statements[statements.length - 1]).toContain("array['venue']");
  });

  it('keeps the personality clamp inside the per-type loop', () => {
    const fn = between('create function api_private.run_dedup_truth_sweep_all', 'end $function$');
    expect(fn).toMatch(
      /if v_type = 'personality' and v_type_mode = 'full' then\s+v_type_mode := 'queue_only';/,
    );
    expect(fn).toMatch(/continue when p_types is not null and not \(v_type = any \(p_types\)\);/);
    expect(fn).toMatch(/raise exception[^;]*unknown type/);
  });

  it('does not raise the statement timeout', () => {
    expect(sql).not.toMatch(/statement_timeout/i);
  });

  it('re-enables the three automations and schedules the two cron ones run-tracked', () => {
    expect(sql).toMatch(
      /set enabled = true, consecutive_failures = 0[^;]*slug in \('dedup_truth_sweep', 'review_jev', 'wf_marketplace_sync_merchants'\)/,
    );
    expect(sql).toMatch(/admin_automation_effective_command\(a\.slug, a\.action->>'command'\)/);
  });
});
