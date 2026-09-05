import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

/**
 * Two scheduled jobs that feed address backfills which had shipped and then
 * never been given any work:
 *
 *  - `run_geo_address_enqueue_backlog` (hourly pg_cron) tops up
 *    `geo_address_queue`. The `geo_address_drain` that consumes it was healthy,
 *    running every five minutes with zero failures, and its queue was EMPTY
 *    while 2,872 venues with coordinates carried no postal_code and no attempt
 *    marker (635 US, 174 ES, 155 GB — all postal-code countries). The queue's
 *    own comment says it is fed "by triggers and by backfill scripts" — the
 *    triggers only cover new rows, the scripts are one-shot, and nothing
 *    recurring ever looked at the historical residue.
 *
 *  - `.github/workflows/city-region-backfill.yml` runs the city region script,
 *    which had existed since the address work and had never been run against
 *    these rows. Cities cannot use geo_address_queue: its CHECK is
 *    `entity_type in ('venue','event','hotel','organization')`.
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

describe('run_geo_address_enqueue_backlog', () => {
  const sql = migrationCarrying('function public.run_geo_address_enqueue_backlog');

  it('is self-limiting, so it can run hourly forever', () => {
    expect(sql).toMatch(/v_room := p_target_depth - v_depth/);
    expect(sql).toMatch(/if v_room <= 0 then/);
    expect(sql).toMatch(/'skipped', true/);
  });

  it('counts only rows the drain can still act on', () => {
    // Rows at the 4-attempt ceiling are permanently stuck. Counting them would
    // let a handful of unresolvable coordinates pin the queue at "full" and
    // starve every remaining entity forever.
    const depthCounts = sql.match(/from public\.geo_address_queue where attempts < 4/g) ?? [];
    expect(depthCounts.length).toBeGreaterThanOrEqual(2); // depth_before and depth_after
  });

  it('excludes already-queued rows in the predicate, not via ON CONFLICT', () => {
    // A failed row still matches `postal_code is null`. Leaning on ON CONFLICT
    // would let it consume a LIMIT slot every hour and block a row that could
    // have been done — the head-of-queue wedge.
    const notExists = sql.match(/not exists \(\s*select 1 from public\.geo_address_queue q/g) ?? [];
    expect(notExists.length).toBe(4); // venue, organization, hotel, event
  });

  it('restricts events to the last year', () => {
    // 37,485 of the 39,727 events missing a postal code are older than a year,
    // and this corpus deliberately holds ~36.5k past Wayback events. Enqueuing
    // them all would spend six days of drain capacity ahead of live venues.
    expect(sql).toMatch(/e\.start_date >= current_date - interval '1 year'/);
  });

  it('fills live entities before archival ones', () => {
    const order = ['venues v', 'organizations o', 'hotels h', 'events e'].map((t) =>
      sql.indexOf(`from public.${t.split(' ')[0]} ${t.split(' ')[1]}`),
    );
    expect(order.every((i) => i > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('registers the row before scheduling, and asserts both took', () => {
    const registryAt = sql.indexOf('insert into public.admin_automations');
    const cronAt = sql.indexOf("select cron.schedule(\n  'geo_address_enqueue_backlog'");
    expect(registryAt).toBeGreaterThan(-1);
    expect(cronAt).toBeGreaterThan(registryAt);
    // A cron.schedule inside a migration has silently not taken before.
    expect(sql).toMatch(/cron job not created/);
    expect(sql).toMatch(/schedule drifted to/);
  });

  it('is an rpc action and is service_role only', () => {
    expect(sql).toMatch(/'type', 'rpc', 'fn', 'run_geo_address_enqueue_backlog'/);
    expect(sql).toMatch(
      /revoke all on function public\.run_geo_address_enqueue_backlog\(integer\) from public, anon, authenticated/,
    );
    expect(sql).toMatch(/assert_admin_or_internal/);
  });
});

describe('city-region-backfill workflow', () => {
  const path = join(process.cwd(), '.github', 'workflows', 'city-region-backfill.yml');
  const raw = readFileSync(path, 'utf8');
  // `on:` parses to the boolean true in YAML 1.1 semantics; accept either.
  const doc = YAML.parse(raw) as Record<string, unknown>;
  const on = (doc.on ?? (doc as Record<string, unknown>)['true']) as Record<string, unknown>;
  const job = (doc.jobs as Record<string, { steps: Array<Record<string, string>> }>).backfill;

  it('is scheduled and hand-dispatchable', () => {
    expect(on.schedule).toBeTruthy();
    expect(on.workflow_dispatch).toBeTruthy();
  });

  it('never interpolates a dispatch input into a run block', () => {
    // `${{ inputs.x }}` inline in `run:` is substituted BEFORE the shell sees
    // it, so `1; curl … | sh` would execute. Inputs go through env and are
    // expanded quoted, which passes them as one argv element.
    const runSteps = job.steps.filter((s) => s.run);
    expect(runSteps.length).toBeGreaterThan(0);
    for (const s of runSteps) expect(s.run).not.toContain('${{');
    expect(raw).toMatch(/LIMIT: \$\{\{ inputs\.limit/);
    expect(raw).toMatch(/\*\[!0-9\]\*/); // numeric validation of LIMIT
  });

  it('says so when credentials are absent instead of passing quietly', () => {
    // Silently succeeding would look identical to "there was no work", which is
    // exactly how this backlog went unnoticed.
    const warn = job.steps.find((s) => s.name === 'Report missing credentials');
    expect(warn).toBeTruthy();
    expect(warn?.run).toMatch(/::warning::/);
    expect(warn?.if).toMatch(/== ''/);
  });

  it('cannot overlap itself against a shared rate-limited service', () => {
    expect((doc.concurrency as Record<string, unknown>).group).toBe('city-region-backfill');
    expect((doc.concurrency as Record<string, unknown>)['cancel-in-progress']).toBe(false);
  });
});

describe('backfill-city-region.mjs', () => {
  const src = readFileSync(
    join(process.cwd(), 'scripts', 'data-quality', 'backfill-city-region.mjs'),
    'utf8',
  );

  it('can read with the service key, since CI has no anon secret', () => {
    expect(src).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(src).toMatch(/const READ_KEY = ANON_KEY \|\| SERVICE_KEY/);
    expect(src).toMatch(/apikey: READ_KEY/);
  });

  it('audits before writing, under one batch id', () => {
    const auditAt = src.indexOf('external_correction_audit');
    const patchAt = src.indexOf("method: 'PATCH'");
    expect(auditAt).toBeGreaterThan(-1);
    expect(auditAt).toBeLessThan(patchAt);
    expect(src).toMatch(/rollback_external_correction_batch/);
  });

  it('still excludes the tmp- placeholder stubs', () => {
    // 1,373 of the 2,097 region-less cities are personality-birth-place stubs.
    expect(src).toMatch(/slug=not\.like\.tmp-\*/);
  });
});
