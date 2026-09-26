import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260926164213_canonical_automation_runs_and_backpressure.sql',
  ),
  'utf8',
);

const functionFiles = [
  'amenity-truth-backfill/index.ts',
  'venue-accessibility-osm/index.ts',
  'personality-link-adult-profiles/index.ts',
  'backfill-cities-images/index.ts',
].map((path) => readFileSync(join(process.cwd(), 'supabase/functions', path), 'utf8'));

describe('canonical automation run contract', () => {
  it('propagates and idempotently finalizes the scheduler-owned run', () => {
    expect(migration).toContain("jsonb_build_object('X-Automation-Run-Id', v_run_id)");
    expect(migration).toContain('for update;');
    expect(migration).toContain("'already_finalized', true");
    expect(migration).toContain("elsif new.status = 'partial'");
  });

  it('keeps direct Edge Functions off the run and registry tables', () => {
    for (const source of functionFiles) {
      expect(source).toContain('finalizeAutomationRun');
      expect(source).not.toMatch(/\.from\(['"]admin_automation_runs['"]\)\s*\.(insert|update)/s);
      expect(source).not.toMatch(/\.from\(['"]admin_automations['"]\)\s*\.update/s);
    }
  });

  it('claims search work one logical entity at a time with time headroom', () => {
    expect(migration).toContain("pg_try_advisory_xact_lock(hashtext('search_reindex_drain'))");
    expect(migration).toContain('v_elapsed_ms >= 75000');
    expect(migration).toMatch(/order by id\s+limit 1\s+for update skip locked/s);
    expect(migration).toContain('stopped_for_budget');
  });
});
