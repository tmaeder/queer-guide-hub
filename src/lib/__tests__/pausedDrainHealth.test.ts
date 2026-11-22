// Guards check-pipeline-health.mjs §6c: an auto-paused staging drain hard-fails.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');
const start = src.indexOf('// 6c. Auto-paused STAGING DRAINS');
const end = src.indexOf('\n}\n', src.indexOf('const drains = rows.filter', start)) + 3;
const sec = src.slice(start, end);

// The section's own filter and predicate, lifted verbatim so the rows below exercise them.
const drainsLine = /const drains = rows\.filter\([^\n]+\)\n/.exec(sec)![0];
const pausedPred = /drains\.filter\(\s*(\(a\) =>[\s\S]*?\)),\s*\)\s*if/.exec(sec)![1];
const predicate = new Function(
  'rows',
  `${drainsLine}; return drains.filter(${pausedPred}).map((a) => a.slug)`,
) as (rows: Record<string, unknown>[]) => string[];

describe('§6c auto-paused staging drains', () => {
  it('is wired before the terminal exit', () => {
    expect(start).toBeGreaterThan(-1);
    expect(src.lastIndexOf('process.exit(1)')).toBeGreaterThan(end);
  });

  it('hard-fails, with no time window', () => {
    expect(sec).toMatch(/if \(paused\.length\) \{[\s\S]*?FAILED = true/);
    const query = /get\(\s*'([^']+)'/.exec(sec)![1];
    expect(query).toMatch(/^admin_automations\?enabled=is\.false/);
    expect(query).not.toMatch(/started_at|last_run_at=gte|gte\./);
    const pred = /drains\.filter\(\s*(\(a\) =>[\s\S]*?\)),\s*\)\s*if/.exec(sec)![1];
    expect(pred).not.toMatch(/Date|since|last_run_at/);
  });

  it('flags the three real 2026-11 victims and spares marked or non-drain rows', () => {
    const rows = [
      // the three drains found off on 2026-11-22
      {
        slug: 'ev_drain_dedup',
        consecutive_failures: 3,
        auto_pause_threshold: 3,
        last_run_status: 'auto_paused',
        description: 'Auto-registered from pg_cron',
      },
      {
        slug: 'vn_drain_dedup',
        consecutive_failures: 3,
        auto_pause_threshold: 3,
        last_run_status: 'auto_paused',
        description: 'Venue staging drain stage',
      },
      {
        slug: 'mp_drain_relevance_backlog',
        consecutive_failures: 3,
        auto_pause_threshold: 3,
        last_run_status: 'auto_paused',
        description: 'Auto-registered',
      },
      // a drain retired on purpose
      {
        slug: 'xx_drain_old',
        consecutive_failures: 3,
        auto_pause_threshold: 3,
        last_run_status: 'auto_paused',
        description: '[RETIRED 2026-10-01: replaced]',
      },
      // a drain switched off by hand, never auto-paused
      {
        slug: 'yy_drain_manual',
        consecutive_failures: 0,
        auto_pause_threshold: 3,
        last_run_status: 'success',
        description: '',
      },
      // each arm on its own: status auto_paused with a reset counter, and a counter at the
      // threshold whose last status is a plain error
      {
        slug: 'zz_drain_status',
        consecutive_failures: 0,
        auto_pause_threshold: 3,
        last_run_status: 'auto_paused',
        description: '',
      },
      {
        slug: 'zz_drain_counter',
        consecutive_failures: 3,
        auto_pause_threshold: 3,
        last_run_status: 'error',
        description: '',
      },
      // not a drain
      {
        slug: 'marketplace_variant_backfill',
        consecutive_failures: 288,
        auto_pause_threshold: 3,
        last_run_status: 'auto_paused',
        description: '',
      },
    ];
    expect(predicate(rows)).toEqual([
      'ev_drain_dedup',
      'vn_drain_dedup',
      'mp_drain_relevance_backlog',
      'zz_drain_status',
      'zz_drain_counter',
    ]);
  });
});
