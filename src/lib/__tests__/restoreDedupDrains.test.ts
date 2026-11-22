// Guards 99991795370640: the events + venues dedup drains come back run-tracked.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'supabase/migrations');
const file = readdirSync(dir).find((f) => f.endsWith('_restore_event_venue_dedup_drains.sql'))!;
const sql = readFileSync(join(dir, file), 'utf8')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

describe('restore event + venue dedup drains', () => {
  it('re-enables both and resets the failure counter', () => {
    expect(sql).toMatch(
      /set enabled = true, consecutive_failures = 0[\s\S]{0,120}where slug in \('ev_drain_dedup', 'vn_drain_dedup'\)/,
    );
  });

  it('recreates the cron from the registry through the run-tracking wrapper', () => {
    expect(sql).toMatch(
      /cron\.schedule\(a\.action->>'jobname', a\.schedule,\s+public\.admin_automation_effective_command\(a\.slug, a\.action->>'command'\)\)/,
    );
    expect(sql).not.toMatch(/net\.http_post/);
  });

  it('verifies the crons are active, tracked and on schedule', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toMatch(/j\.active and j\.schedule = a\.schedule/);
    expect(verify).toMatch(/j\.command ilike '%admin_automation_run_begin%'/);
    expect(verify).toMatch(/if v_bad <> 0 then\s+raise exception 'P2 failed/);
  });
});
