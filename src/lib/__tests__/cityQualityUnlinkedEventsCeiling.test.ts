import { describe, expect, it } from 'vitest';

import baseline from '../../../scripts/city-quality-baseline.json';

// 2026-11-23. `unlinked_events` crossed its ceiling (2612 > 2590) and reddened every open PR,
// because data-quality-gates.yml runs on pull_request and merge_group, not only on a schedule.
//
// The 2026-09-29 and 2026-10-29 revisions BOTH ended by naming the same replacement in writing:
// swap the two unlinked_* depth ceilings for a drain-liveness signal like the scorecard's own
// `image_automation_no_progress`. That was attempted and refused on measurement, which is what
// this file exists to keep from being re-derived:
//
//   `image_automation_no_progress` reads the last three finished runs' `items_changed`, and
//   `event_city_link` has 31 finished runs with items_changed populated on all 31 and nonzero on
//   NONE -- so the gauge would have shipped reading "no progress" forever. The drain is not dead,
//   the column is: every run row carries summary.source = 'cron.job_run_details', the projected
//   dispatch truth a pure-SQL cron gets, never the function's own return value. The row stamps
//   prove it alive (144 events visited on 11-23, 10 now carrying a city_id; 129 on 11-18 with
//   100 linked), so the working evidence source is the per-row stamp, not the run column.
const REVISED_AT = '2026-11-23T00:00:00Z';

// Measured live against prod while deriving the ceiling, and the live count rose by 2 during the
// measurement itself -- the inflow is continuous, not a step change.
const MEASURED_LIVE_UNLINKED_EVENTS = 2625;

describe('the 2026-11-23 unlinked_events ceiling revision', () => {
  const revision = baseline.revisions.find((r) => r.revised_at === REVISED_AT);

  it('is recorded, and raises that one metric and nothing else', () => {
    expect(revision).toBeDefined();
    expect(Object.keys(revision!.raised)).toEqual(['operations.unlinked_events']);
  });

  it('holds the ceiling at or above the value measured live when it was derived', () => {
    // Derived, not chosen: 2,625 live + 30 days x 26.47/day measured accrual = 3,419.
    expect(baseline.operations.unlinked_events).toBeGreaterThanOrEqual(
      MEASURED_LIVE_UNLINKED_EVENTS,
    );
    expect(baseline.operations.unlinked_events).toBe(3419);
  });

  it('leaves unlinked_venues alone, and NOT because it is green', () => {
    // 10,163 against 2,886 measured is 3.5x loose, and only ONE venue carried a geo_linked_at
    // stamp in the trailing 8 days while 2,886 sat unlinked -- possibly a dead drain. A loose
    // ceiling is not moved in either direction on one measurement against one candidate column.
    expect(baseline.operations.unlinked_venues).toBe(10163);
    expect(Object.keys(revision!.raised)).not.toContain('operations.unlinked_venues');
  });

  it('keeps the reason that the no-progress follow-up cannot be built on items_changed', () => {
    // Without this the next session re-attempts the gauge, ships it red on arrival, and has to
    // re-derive why. The reason must name both the wrong source and the right one.
    const reason = revision!.reason;
    expect(reason).toMatch(/items_changed/);
    expect(reason).toMatch(/cron\.job_run_details/);
    expect(reason).toMatch(/enrichment_status->'event_city_link'->>'at'/);
    expect(reason.length).toBeGreaterThan(1500);
  });

  it('records that the counter conflates waiting rows with permanent refusals', () => {
    // 668 of 2,625 are stamped `blocked` by the namesake guard and never drain by design, so a
    // ceiling on the sum can only ever be crossed again however well the drain works.
    expect(revision!.reason).toMatch(/668/);
    expect(revision!.reason).toMatch(/namesake/i);
  });
});
