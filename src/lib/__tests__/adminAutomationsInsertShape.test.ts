import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every `insert into public.admin_automations (...)` must name the `trigger`
 * column.
 *
 * `trigger` is NOT NULL with NO default, so omitting it does not produce a row
 * with a sensible fallback — it aborts the statement. And because `db push` runs
 * each migration in ONE transaction, that abort rolls back the *entire* migration
 * including its DDL.
 *
 * That is not a theoretical tidiness rule. It took prod down on 2026-09-06:
 * 20320201100000 added `events.series_next` and then registered a cron without
 * `trigger`. The insert failed at statement 9, the whole migration rolled back so
 * the COLUMN never existed — while the Cloudflare Pages deploy of the same merge
 * succeeded and shipped a frontend that filters on it. Every /events browse query
 * returned `HTTP 400 column events.series_next does not exist` until the schema
 * was repaired by hand.
 *
 * The lesson generalises past this one column: a failed migration is not a
 * no-op, it is a full rollback, and the frontend half of the same merge ships
 * regardless. A migration that registers an automation is therefore load-bearing
 * for any DDL that shares its file.
 *
 * Measured when written: 116 inserts across the migration history, 109 spelling
 * the column bare and 7 as the quoted `"trigger"` (it is a reserved word), and
 * ZERO omitting it — so this guard starts green and can only catch a new mistake.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/** `insert into public.admin_automations ( ... )` — the explicit column list only. */
const INSERT_RE = /insert\s+into\s+public\.admin_automations\s*\(([^)]*)\)/gi;

function columnLists(sql: string): string[][] {
  const out: string[][] = [];
  for (const m of sql.matchAll(INSERT_RE)) {
    out.push(
      m[1]
        .split(',')
        // `trigger` is a reserved word, so both `trigger` and `"trigger"` appear
        // in the history. Strip quotes before comparing or the quoted form reads
        // as a violation — which is exactly how a first draft of this guard
        // reported 7 false positives.
        .map((c) => c.trim().toLowerCase().replace(/"/g, '')),
    );
  }
  return out;
}

describe('admin_automations inserts', () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));

  it('always name the NOT NULL `trigger` column', () => {
    const offenders: string[] = [];
    let inserts = 0;

    for (const f of files) {
      const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
      for (const cols of columnLists(sql)) {
        inserts++;
        if (!cols.includes('trigger')) offenders.push(`${f}  [${cols.join(', ')}]`);
      }
    }

    // Positive control: if the scan matched nothing the assertion below would
    // pass while proving nothing at all.
    expect(inserts, 'no admin_automations inserts found — the scan is broken').toBeGreaterThan(50);

    expect(
      offenders,
      `admin_automations.trigger is NOT NULL with no default. Omitting it aborts the ` +
        `INSERT, and because db push wraps each migration in one transaction that ` +
        `rolls back the whole file — including any DDL in it — while the frontend ` +
        `half of the same merge still deploys. Add: trigger => jsonb_build_object('type','schedule')`,
    ).toEqual([]);
  });
});
