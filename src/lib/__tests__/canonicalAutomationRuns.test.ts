import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/99991794376221_canonical_automation_runs_and_backpressure.sql',
  ),
  'utf8',
);
const crossStatementMigration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/99991794376243_automation_run_context_cross_statement.sql',
  ),
  'utf8',
);
const airportRepairMigration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/99991794376258_restore_airport_refresh_canonical_wrapper.sql',
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
    expect(crossStatementMigration).toContain('private.admin_automation_run_contexts');
    expect(crossStatementMigration).toContain(
      "jsonb_build_object('X-Automation-Run-Id', v_context.run_id::text)",
    );
    expect(crossStatementMigration).toContain('remaining_requests = remaining_requests - 1');
    expect(crossStatementMigration).toContain("'zz_probe'', 2");
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

  it('keeps the repaired airport refresh inside the canonical run wrapper', () => {
    expect(airportRepairMigration).toContain('select net.http_post(');
    expect(airportRepairMigration).toContain("'X-Internal-Secret'");
    expect(airportRepairMigration).toContain(
      "v_command NOT LIKE 'SELECT public.admin_automation_run_begin(%'",
    );
  });
});
