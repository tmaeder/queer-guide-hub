import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The weekly city-ingestion DAG died mid-run on 2026-09-13 and left 1,000
 * staging rows stamped with the id of a DEAD run. Every DAG-scoped stage
 * filters `.eq('pipeline_run_id', <current run>)`, so those rows are as
 * unreachable as rows with no id — and 189 of them carried human review
 * decisions that could never reach a record.
 *
 * `staging_orphan_signals()` was blind to it TWICE over: it predicated on
 * `pipeline_run_id IS NULL`, and it required `normalized_data IS NOT NULL`
 * while 500 of the cohort are stranded before normalize. Either blind spot
 * alone would have hidden this.
 *
 * Assertions are scoped to the FUNCTION BODY, not the file: `COMMENT ON … IS
 * '…'` is a SQL string literal that comment-stripping cannot remove, and its
 * text restates these very predicates.
 */

function stripSql(src: string): string {
  return src
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const SUFFIX = '_city_drain_chain_and_orphan_sentinel_dead_runs.sql';
const migrationFile = readdirSync(MIGRATIONS).find((f) => f.endsWith(SUFFIX));
const sql = stripSql(readFileSync(join(MIGRATIONS, migrationFile!), 'utf8'));
const fnBody = sql.match(/AS \$fn\$([\s\S]*?)\$fn\$;/)?.[1] ?? '';

describe('orphan sentinel: dead runs', () => {
  it('exists and the function body was extracted', () => {
    expect(migrationFile).toBeDefined();
    expect(fnBody).not.toBe('');
  });

  it('treats a terminal run as unreachable, not just a missing run id', () => {
    // This is the whole fix. Stages filter on the CURRENT run id, so a dead run
    // owning a row hides it from every per-run view while it is fully stranded.
    expect(fnBody).toMatch(
      /r\.status\s+IN\s*\(\s*'failed'\s*,\s*'cancelled'\s*,\s*'completed'\s*\)/i,
    );
    expect(fnBody).toMatch(/pipeline_run_id\s+IS\s+NULL/i);
    expect(fnBody).toMatch(/r\.id\s+IS\s+NULL/i);
  });

  it('includes completed runs, not only failed ones', () => {
    // A run that finished without processing everything leaves the remainder
    // just as unreachable; the 48h floor keeps genuine in-flight work out.
    const arm = fnBody.match(/r\.status\s+IN\s*\([^)]*\)/i)?.[0] ?? '';
    expect(arm).toMatch(/'completed'/);
  });

  it('does NOT require normalized_data — that hid 500 of the cohort', () => {
    expect(fnBody).not.toMatch(/normalized_data/i);
  });

  it('reports why each cohort is unreachable', () => {
    expect(fnBody).toMatch(/'no_run_id'/);
    expect(fnBody).toMatch(/'run_missing'/);
    expect(fnBody).toMatch(/'orphan_reasons_by_target'/);
  });

  it('still judges progress by ingestion_events and reports probe_ok', () => {
    expect(fnBody).toMatch(/JOIN\s+public\.ingestion_events/i);
    expect(fnBody).toMatch(/last_advance\s+IS\s+NULL/i);
    expect(fnBody).toMatch(/'probe_ok'\s*,\s*true/i);
  });

  it('stays service_role-only and SECURITY INVOKER', () => {
    expect(sql).toMatch(/SECURITY\s+INVOKER/i);
    expect(sql).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.staging_orphan_signals\(\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i,
    );
    expect(sql).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.staging_orphan_signals\(\)\s+TO\s+service_role/i,
    );
  });
});

describe('city drain chain', () => {
  it('has five stages — normalize included', () => {
    // Unlike personalities, half this cohort has normalized_data IS NULL, so
    // the chain must start at normalize or those 500 never move.
    for (const slug of [
      'city_drain_normalize',
      'city_drain_validate',
      'city_drain_dedup',
      'city_drain_review',
      'city_drain_commit',
    ]) {
      expect(sql).toContain(`'${slug}'`);
    }
  });

  it('gives each stage the scoping key that stage actually reads', () => {
    // pipeline-normalize and pipeline-review-gate take entityType ONLY;
    // pipeline-validate and pipeline-deduplicate take targetTable. Passing the
    // wrong one silently scopes nothing and the drain walks other domains.
    const norm =
      sql.match(/'city_drain_normalize'[\s\S]*?FROM public\.admin_automations v/)?.[0] ?? '';
    const rev = sql.match(/'city_drain_review'[\s\S]*?FROM public\.admin_automations v/)?.[0] ?? '';
    const val =
      sql.match(/'city_drain_validate'[\s\S]*?FROM public\.admin_automations v/)?.[0] ?? '';
    const ded = sql.match(/'city_drain_dedup'[\s\S]*?FROM public\.admin_automations v/)?.[0] ?? '';
    expect(norm).toMatch(/"entityType":"city"/);
    expect(rev).toMatch(/"entityType":"city"/);
    expect(val).toMatch(/"targetTable":"cities"/);
    expect(ded).toMatch(/"targetTable":"cities"/);
  });

  it('commits through the RPC that had zero callers', () => {
    const commit =
      sql.match(/'city_drain_commit'[\s\S]*?FROM public\.admin_automations v/)?.[0] ?? '';
    // Scoped to the replace() that BUILDS the command. The surrounding
    // description names the RPC too, so a slice-wide toMatch stayed green with
    // the replacement pointed at commit_hotel_staging_batch — caught by
    // mutation testing, same vacuous-assertion class as the COMMENT ON trap.
    const built = commit.match(/replace\(v\.action->>'command',[\s\S]*?\)\)/)?.[0] ?? '';
    expect(built).not.toBe('');
    expect(built).toMatch(/'commit_city_staging_batch'/);
    expect(built).toMatch(/'commit_venue_staging_batch'/);
  });

  it('schedules with the WRAPPED command and never calls the global reconciler', () => {
    const sched = sql.match(/DO \$sched\$[\s\S]*?\$sched\$;/)?.[0] ?? '';
    expect(sched).toMatch(/admin_automation_effective_command/);
    expect(sched).toMatch(/cron\.schedule/);
    expect(sql).not.toMatch(/sync_automations_to_cron\s*\(\s*true\s*\)/i);
  });

  it('is soft on preconditions and hard on postconditions', () => {
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.admin_automations/i);
    const verify = sql.match(/DO \$verify\$[\s\S]*?\$verify\$;/)?.[0] ?? '';
    expect(verify).toMatch(/expected 5 enabled/i);
    expect(verify).toMatch(/expected 5 active/i);
    expect(verify).toMatch(/scheduled unwrapped/i);
  });

  it('exempts the pure-SQL commit stage from the wrapped-command assertion', () => {
    const verify = sql.match(/DO \$verify\$[\s\S]*?\$verify\$;/)?.[0] ?? '';
    const scoped = verify.match(/SELECT count\(\*\) INTO v_unwrapped[\s\S]*?;/)?.[0] ?? '';
    expect(scoped).not.toBe('');
    expect(scoped).toMatch(/city-drain-validate/);
    // Family C: no http post, so requiring automation_http_post would fail a
    // correct deploy.
    expect(scoped).not.toMatch(/city-drain-commit/);
  });
});
