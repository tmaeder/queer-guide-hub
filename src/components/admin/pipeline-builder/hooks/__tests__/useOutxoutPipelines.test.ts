import { beforeEach, describe, expect, it, vi } from 'vitest';
const { from, select, filters, state } = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  filters: [] as unknown[][],
  state: { fail: '', disabled: false, changedSchedule: false },
}));
vi.mock('@/integrations/supabase/untyped', () => ({ untypedFrom: from }));
import { isOutxoutRun, loadOutxoutPipelines, type OutxoutRun } from '../useOutxoutPipelines';
const names = ['outxout-catalogue-sync', 'outxout-official-date-review'];
const baseRun = {
  id: 'native',
  status: 'completed',
  created_at: '2026-11-18T18:52:00Z',
  started_at: null,
  completed_at: '2026-11-18T19:52:00Z',
  items_processed: 21,
  items_succeeded: 21,
  items_failed: 0,
  items_total: 21,
  duration_ms: null,
  error_message: null,
  context: { policy: 'outxout-official-dates-v1', review_ledger_id: 976448, approved: 0 },
} satisfies OutxoutRun;

beforeEach(() => {
  from.mockReset();
  select.mockClear();
  filters.length = 0;
  Object.assign(state, { fail: '', disabled: false, changedSchedule: false });
  from.mockImplementation((table: string) => {
    let name = '';
    const response = () => {
      if (state.fail === table) return { data: null, error: new Error('permission denied') };
      if (table === 'pipeline_definitions')
        return {
          data: names.map((name, id) => ({ id: String(id), name, is_enabled: true })),
          error: null,
        };
      if (table === 'admin_automations')
        return {
          data: ['outxout_weekly_sync', 'outxout_official_dates_weekly'].map((slug, i) => ({
            slug,
            enabled: !state.disabled,
            schedule: state.changedSchedule ? '0 12 * * 2' : i ? '0 7,8 * * 3' : '0 6,7 * * 3',
            trigger: { timezone: 'Europe/Zurich' },
          })),
          error: null,
        };
      if (table === 'admin_automation_runs')
        return {
          data: {
            brighton: [{ url: 'https://prideonthepark.co.uk/tickets/', error: 'source_http_404' }],
            belfast: [],
            glasgow: [],
            liverpool: [],
            newcastle: [],
            edinburgh: [],
          },
          error: null,
        };
      return {
        data:
          name === names[0]
            ? [
                { ...baseRun, id: 'canary', context: { scope: 'canary' } },
                {
                  ...baseRun,
                  id: 'catalogue',
                  items_processed: 9404,
                  context: { scope: 'catalogue', changed: 333, held: 298 },
                },
              ]
            : [
                { ...baseRun, id: 'probe', context: { ...baseRun.context, dry_run: true } },
                baseRun,
              ],
        error: null,
      };
    };
    const q = {
      select: (fields: string) => {
        select(table, fields);
        return q;
      },
      in: () => Promise.resolve(response()),
      eq: (field: string, value: unknown) => {
        filters.push([table, field, value]);
        if (field === 'pipeline_name') name = String(value);
        return q;
      },
      like: (field: string, value: unknown) => {
        filters.push([table, field, value]);
        return q;
      },
      or: () => q,
      order: () => q,
      limit: () => Promise.resolve(response()),
      maybeSingle: () => Promise.resolve(response()),
    };
    return q;
  });
});

describe('Out x Out admin projection', () => {
  it('shows actual managed schedules and latest native results, excluding probes and canaries', async () => {
    const rows = await loadOutxoutPipelines();
    expect(rows.map((r) => r.scheduleLabel)).toEqual([
      'Wednesdays at 08:00 · Europe/Zurich',
      'Wednesdays at 09:00 · Europe/Zurich',
    ]);
    expect(rows.map((r) => r.run?.id)).toEqual(['catalogue', 'native']);
    expect(rows[1].warnings).toHaveLength(1);
    expect(rows[1].error).toBeNull();
    expect(filters).toContainEqual(['pipeline_runs', 'context->>scope', 'catalogue']);
    expect(filters).toContainEqual([
      'pipeline_runs',
      'context->>policy',
      'outxout-official-dates-%',
    ]);
    const fields = select.mock.calls.find((c) => c[0] === 'admin_automation_runs')?.[1];
    expect(fields).toContain('->errors');
    expect(fields).not.toMatch(/(?:^|,)summary(?:,|$)/);
  });
  it('does not substitute a healthy or empty state for missing permissions', async () => {
    state.fail = 'admin_automation_runs';
    await expect(loadOutxoutPipelines()).rejects.toThrow('permission denied');
  });
  it('reflects disabled and changed schedules instead of a hardcoded weekly claim', async () => {
    state.disabled = true;
    state.changedSchedule = true;
    const rows = await loadOutxoutPipelines();
    expect(rows.every((r) => !r.enabled)).toBe(true);
    expect(rows[0].scheduleLabel).toBe('0 12 * * 2 · Europe/Zurich');
  });
  it('rejects dry-run records even when they carry the native policy marker', () => {
    expect(
      isOutxoutRun(names[1], { ...baseRun, context: { ...baseRun.context, dry_run: true } }),
    ).toBe(false);
  });
});
