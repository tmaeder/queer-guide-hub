import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Positive control for check-pipeline-health §16 (the review-queue sentinel).
 *
 * The section's key-presence check proves the probe returns the right KEYS. It
 * proves nothing about whether the gate reports a real defect, which is exactly
 * the mislabel called out in cityScalarBounds.test.ts — so this runs the ACTUAL
 * script against stubbed fetch responses and asserts the behaviour in each
 * state. Without it §16 could be gutted and nothing in CI would notice.
 *
 * The states that matter are the ones this sentinel exists for: a queue with a
 * depth but no human decisions (WARN — a quiet fortnight is legitimate), and a
 * broken MECHANISM (FAIL — an unreadable queue must never read as an empty one).
 */

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const HEALTH_SCRIPT = join(ROOT, 'scripts', 'check-pipeline-health.mjs');

/** Only §16's own lines. Every other section fails against empty stubs. */
const MARKERS =
  /review_queue_signals|review_queue_close_unactionable|Review queue:|review row|largest cohorts/;

/** A healthy corpus: rows open, a human working them, the closer registered. */
const healthy = {
  probe_ok: true,
  open_total: 120,
  open_by_cohort: {
    'venue.accessibility_attributes': 80,
    'city.editorial_hook': 30,
    'marketplace.subcategory': 20,
    'venue.phone': 10,
  },
  human_decisions_30d: 41,
  machine_decisions_30d: 300,
  last_human_decision_at: '2026-09-13T10:00:00Z',
  open_age_days_median: 4,
  risk_blocked_open: 0,
  unactionable_open: 0,
  unregistered_field_open: 0,
  closer: {
    registered: true,
    enabled: true,
    last_run_status: 'success',
    consecutive_failures: 0,
    last_run_at: '2026-09-14T06:35:00Z',
    falsely_paused: false,
  },
};

function runWith(fixture: unknown, status = 200): string {
  const dir = mkdtempSync(join(tmpdir(), 'rqs-'));
  const stub = join(dir, 'stub.mjs');
  writeFileSync(
    stub,
    `const ok=(b)=>new Response(JSON.stringify(b),{status:200,headers:{'content-type':'application/json'}});
globalThis.fetch=async(u)=>{const s=String(u);
if(s.includes('review_queue_signals')){return ${status} === 200 ? ok(${JSON.stringify(fixture)}) : new Response('{"code":"PGRST202"}',{status:${status}});}
if(s.includes('/rpc/'))return ok({});return ok([]);};`,
  );
  try {
    return execFileSync(process.execPath, ['--import', stub, HEALTH_SCRIPT], {
      encoding: 'utf8',
      env: { ...process.env, SUPABASE_URL: 'https://stub', SUPABASE_SERVICE_ROLE_KEY: 'stub' },
    });
  } catch (e: unknown) {
    // The script exits 1 when any section fails; other sections fail against
    // empty stubs, so the exit code is not the signal — the §16 lines are.
    return String((e as { stdout?: string }).stdout ?? '');
  }
}

const sectionLines = (out: string) => out.split('\n').filter((l) => MARKERS.test(l));
const failures = (out: string) => sectionLines(out).filter((l) => l.includes('✗'));
const warnings = (out: string) => sectionLines(out).filter((l) => l.includes('⚠'));

describe('check-pipeline-health §16 behaviour', () => {
  it('reports no failure on a worked queue, and names the largest cohorts', () => {
    const out = runWith(healthy);
    expect(failures(out)).toHaveLength(0);
    expect(warnings(out)).toHaveLength(0);
    expect(sectionLines(out).some((l) => l.includes('✓ Review queue: 120 open'))).toBe(true);
    // Three, not all four — the shape of the backlog without the whole table.
    const cohorts = sectionLines(out).find((l) => l.includes('largest cohorts'))!;
    expect(cohorts).toContain('venue.accessibility_attributes 80');
    expect(cohorts).not.toContain('venue.phone');
  });

  it('FAILS when the RPC is missing (PGRST202) rather than reading it as an empty queue', () => {
    // Deliberately NOT the 404 carve-out §11b grants: the probe catches its own
    // exceptions, so a non-2xx means unapplied or ungranted, never "quiet".
    const out = runWith(healthy, 404);
    expect(failures(out).some((l) => l.includes('HTTP 404'))).toBe(true);
  });

  it('FAILS on a broken probe (5xx) instead of failing open', () => {
    expect(failures(runWith(healthy, 500)).length).toBeGreaterThan(0);
  });

  it('FAILS when probe_ok is false — the function caught its own error', () => {
    const out = runWith({ probe_ok: false, error: 'relation does not exist' });
    expect(failures(out).some((l) => l.includes('probe_ok'))).toBe(true);
    expect(failures(out).some((l) => l.includes('relation does not exist'))).toBe(true);
  });

  it('FAILS on a renamed key rather than coercing it to a clean zero', () => {
    const { risk_blocked_open: _drop, ...renamed } = healthy;
    const out = runWith(renamed);
    expect(failures(out).some((l) => l.includes('missing risk_blocked_open'))).toBe(true);
  });

  it('distinguishes an absent key from a zero value', () => {
    // The whole accessibility_contradictions lesson in one pair of assertions:
    // 0 is a measurement, undefined is nobody having looked.
    expect(failures(runWith({ ...healthy, risk_blocked_open: 0 }))).toHaveLength(0);
    const { open_by_cohort: _drop, ...missing } = healthy;
    expect(failures(runWith(missing)).length).toBeGreaterThan(0);
  });

  it('FAILS when the closer is unregistered', () => {
    const out = runWith({ ...healthy, closer: { registered: false } });
    expect(failures(out).some((l) => l.includes('no admin_automations row'))).toBe(true);
  });

  it('FAILS on auto-paused-then-recovered — the one-way door', () => {
    const out = runWith({
      ...healthy,
      closer: { ...healthy.closer, enabled: false, falsely_paused: true },
    });
    expect(failures(out).some((l) => l.includes('RECOVERED'))).toBe(true);
  });

  it('FAILS on a single unregistered-field row — no baseline, no floor', () => {
    const out = runWith({ ...healthy, unregistered_field_open: 1 });
    expect(failures(out).some((l) => l.includes('no active review_field_registry'))).toBe(true);
  });

  it('fails on unactionable rows only ABOVE the closer’s nightly cap', () => {
    // 500/night is the cap, so a batch in flight is not a defect. 601 is.
    expect(failures(runWith({ ...healthy, unactionable_open: 600 }))).toHaveLength(0);
    expect(failures(runWith({ ...healthy, unactionable_open: 601 })).length).toBeGreaterThan(0);
  });

  it('WARNS, and does not fail, on zero human decisions against a deep queue', () => {
    const out = runWith({ ...healthy, open_total: 3997, human_decisions_30d: 0 });
    expect(failures(out)).toHaveLength(0);
    expect(warnings(out).some((l) => l.includes('ZERO human decisions'))).toBe(true);
  });

  it('stays quiet on zero human decisions against a shallow queue', () => {
    // A quiet fortnight over 40 rows is legitimate; a check that fires every
    // run is one people learn to scroll past.
    const out = runWith({ ...healthy, open_total: 40, human_decisions_30d: 0 });
    expect(warnings(out)).toHaveLength(0);
  });

  it('WARNS on a rotting median age and on risk-gated rows, never failing', () => {
    const out = runWith({ ...healthy, open_age_days_median: 88, risk_blocked_open: 12 });
    expect(failures(out)).toHaveLength(0);
    expect(warnings(out).some((l) => l.includes('88d old'))).toBe(true);
    expect(warnings(out).some((l) => l.includes('risk-gated'))).toBe(true);
  });

  it('says an empty queue is absence, not a worked queue', () => {
    const out = runWith({ ...healthy, open_total: 0, open_by_cohort: {}, human_decisions_30d: 0 });
    expect(out).toContain('the zeroes above are absence, not a worked queue');
  });
});

describe('§16 reads every key the migration promises', () => {
  it('the REQUIRED list matches the keys review_queue_signals returns', () => {
    // A key the probe returns and the script never reads is a measurement
    // nobody sees; a key the script reads and the probe never returns is a
    // broken gate. Both are drift, so they are asserted against each other.
    const migration = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('_review_queue_signals.sql'))
      .sort()
      .pop();
    expect(migration, 'review_queue_signals migration not found').toBeDefined();
    const sql = readFileSync(join(MIGRATIONS, migration!), 'utf8');
    const script = readFileSync(HEALTH_SCRIPT, 'utf8');

    for (const key of [
      'open_total',
      'open_by_cohort',
      'human_decisions_30d',
      'machine_decisions_30d',
      'last_human_decision_at',
      'open_age_days_median',
      'risk_blocked_open',
      'unactionable_open',
      'unregistered_field_open',
      'closer',
    ]) {
      expect(sql, `${key} is not built by the migration`).toContain(`'${key}',`);
      expect(script, `${key} is not read by check-pipeline-health`).toContain(`'${key}'`);
    }
  });
});
