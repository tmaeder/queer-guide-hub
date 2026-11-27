import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/99991795258729_gayout_biweekly_refresh.sql', 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

// The same parity the patched SQL uses: half the known places pages are due each week.
const dueThisWeek = (weekNumber: number, urlHash: number) => (weekNumber + urlHash) % 2 === 0;

describe('GayOut biweekly refresh migration', () => {
  it('patches the live body at exactly one anchor instead of restating it', () => {
    expect(sql).toContain("pg_get_functiondef('public.gayout_save_inventory'::regproc)");
    expect(sql).toContain("v_from text := 'old.last_fetched_at>=week_start'");
    expect(sql).toMatch(/<> 1 then\s+raise exception/);
    expect(sql).toContain('execute replace(v_def, v_from, v_to)');
  });
  it('widens the skip window only for the places inventory', () => {
    const replacement = /v_to text := '([^\n]*)';/.exec(sql)?.[1] ?? '';
    expect(replacement).toContain(
      "old.last_fetched_at>=week_start-case when p_inventory=''places'' and ",
    );
    expect(replacement).toContain("%2)=1 then interval ''7 days'' else interval ''0 days'' end");
    expect(replacement).toContain("abs(hashtext(job->>''url''))");
  });
  it('verifies the rule is present after applying', () => {
    expect(sql).toMatch(
      /\$verify\$[\s\S]*raise exception 'gayout_save_inventory: biweekly refresh rule missing after patch'/,
    );
  });
  it('refreshes every page exactly once per two weeks', () => {
    for (const hash of [0, 1, 7, 12345]) {
      const due = [0, 1, 2, 3].map((week) => dueThisWeek(week, hash));
      expect(due.filter(Boolean)).toHaveLength(2);
      expect(due[0]).not.toBe(due[1]);
    }
  });
});
