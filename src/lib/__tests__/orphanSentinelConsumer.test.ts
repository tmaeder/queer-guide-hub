import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `unconsumed_targets` measured progress ON THE ORPHAN SET, and a row the drain
 * advances stops being an orphan — so the rows left in the set are exactly the
 * ones not reached yet, and they never have events. The key therefore read
 * "nothing is consuming this" for the entire life of any backlog.
 *
 * Measured on prod 2026-09-19, one hour after the city drain went live and a
 * full cycle had visibly completed: progress on the orphans = 0, events for
 * target_table 'cities' in 24h = 400. Hard fail, while the drain was working.
 *
 * This test resolves the LATEST migration that defines the function rather than
 * pinning a filename — a test bound to a superseded file keeps passing while the
 * live definition drifts away from it.
 */

function stripSql(src: string): string {
  return src
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const DEFINES = /create\s+or\s+replace\s+function\s+public\.staging_orphan_signals\s*\(/i;

const latest = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .reverse()
  .find((f) => DEFINES.test(readFileSync(join(MIGRATIONS, f), 'utf8')));

const sql = stripSql(readFileSync(join(MIGRATIONS, latest!), 'utf8'));
const fnBody = sql.match(/AS \$fn\$([\s\S]*?)\$fn\$;/)?.[1] ?? '';

describe('orphan sentinel measures the consumer, not the residue', () => {
  it('resolves a latest definition and extracts its body', () => {
    expect(latest).toBeDefined();
    expect(fnBody).not.toBe('');
  });

  it('derives the consumer test from ingestion_events over the whole target_table', () => {
    // The CTE must join events to staging WITHOUT restricting to the orphan
    // set — that restriction is the defect.
    const consumers = fnBody.match(/consumers AS \([\s\S]*?\)\s*,/i)?.[0] ?? '';
    expect(consumers).not.toBe('');
    expect(consumers).toMatch(/FROM\s+public\.ingestion_events/i);
    expect(consumers).toMatch(/JOIN\s+public\.ingestion_staging/i);
    expect(consumers).toMatch(/GROUP BY\s+s\.target_table/i);
    // If this CTE ever selects FROM orphans again, the false alarm is back.
    expect(consumers).not.toMatch(/\borphans\b/i);
  });

  it('joins the consumer test to the orphan targets rather than folding it in', () => {
    const key = fnBody.match(/'unconsumed_targets'[\s\S]*?\)\s*\)/i)?.[0] ?? '';
    expect(key).toMatch(/LEFT JOIN consumers/i);
    expect(key).toMatch(/last_advance IS NULL/i);
  });

  it('still reports the backlog itself, so a stuck drain stays visible', () => {
    // The count must survive: the fix silences the PAGE, not the measurement.
    expect(fnBody).toMatch(/'orphan_rows_by_target'/);
    expect(fnBody).toMatch(/'oldest_orphan_days'/);
    expect(fnBody).toMatch(/'orphan_reasons_by_target'/);
  });

  it('keeps the orphan predicate that 99950101100000 established', () => {
    expect(fnBody).toMatch(
      /r\.status\s+IN\s*\(\s*'failed'\s*,\s*'cancelled'\s*,\s*'completed'\s*\)/i,
    );
    expect(fnBody).toMatch(/pipeline_run_id\s+IS\s+NULL/i);
    expect(fnBody).not.toMatch(/normalized_data/i);
  });

  it('reports probe_ok and stays service_role-only', () => {
    expect(fnBody).toMatch(/'probe_ok'\s*,\s*true/i);
    expect(sql).toMatch(/SECURITY\s+INVOKER/i);
    expect(sql).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.staging_orphan_signals\(\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i,
    );
  });

  it('asserts the fixed property at deploy time instead of trusting it', () => {
    const verify = sql.match(/DO \$verify\$[\s\S]*?\$verify\$;/)?.[0] ?? '';
    expect(verify).toMatch(/unconsumed_targets/);
    expect(verify).toMatch(/actively advancing/i);
  });
});
