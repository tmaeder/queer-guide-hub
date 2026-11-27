import { describe, expect, it } from 'vitest';
import { calculateEqualityScore } from '../../../../supabase/functions/_shared/equality-score';
import {
  EQUALITY_SCORE_METHOD,
  EQUALITY_SCORE_RAW_MAX,
  EQUALITY_SCORE_RAW_MIN,
  EQUALITY_SCORE_START,
} from '../equalityScoreMethod';

// The published method page must say what the nightly formula does. Every row
// is measured against the real function rather than restated by hand.
const rows = EQUALITY_SCORE_METHOD.flatMap((g) => g.rows);

describe('equality score method table', () => {
  it('starts where the formula starts', () => {
    expect(calculateEqualityScore({})).toBe(EQUALITY_SCORE_START);
  });

  it.each(rows.map((r) => [r.id, r] as const))(
    '%s moves the score by its published points',
    (_id, row) => {
      const base = row.base ?? {};
      const before = calculateEqualityScore(base);
      const after = calculateEqualityScore({ ...base, ...row.probe });
      expect(after - before).toBe(row.points);
    },
  );

  it('has unique row ids', () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('reports the reachable range before the clamp', () => {
    expect(EQUALITY_SCORE_RAW_MIN).toBe(0);
    expect(EQUALITY_SCORE_RAW_MAX).toBe(117);
  });

  it('the best possible record reaches the stated maximum, clamped to 100', () => {
    const best = Object.assign(
      {},
      ...rows
        .filter((r) => r.points > 0)
        .filter((r) => !['civil-union', 'second-parent', 'marker'].includes(r.id))
        .map((r) => r.probe),
    );
    // Protection rows share a column per area; merge so/gi instead of overwriting.
    for (const r of rows.filter((r) => r.id.endsWith('-so') || r.id.endsWith('-gi'))) {
      const [col, v] = Object.entries(r.probe)[0];
      best[col] = { ...(best[col] ?? {}), ...(v as object) };
    }
    expect(calculateEqualityScore(best)).toBe(100);
  });
});
