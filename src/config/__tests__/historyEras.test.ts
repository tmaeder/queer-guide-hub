import { describe, expect, it } from 'vitest';
import { HISTORY_ERAS, eraForYear, eraRangeLabel } from '@/config/historyEras';

describe('HISTORY_ERAS', () => {
  it('has unique slugs', () => {
    const slugs = HISTORY_ERAS.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('is contiguous and non-overlapping in chronological order', () => {
    expect(HISTORY_ERAS[0].from).toBeNull();
    expect(HISTORY_ERAS[HISTORY_ERAS.length - 1].to).toBeNull();
    for (let i = 1; i < HISTORY_ERAS.length; i++) {
      const prev = HISTORY_ERAS[i - 1];
      const cur = HISTORY_ERAS[i];
      expect(cur.from).toBe((prev.to as number) + 1);
    }
  });

  it('maps every year to exactly one era', () => {
    for (let y = 1000; y <= 2100; y++) {
      const matches = HISTORY_ERAS.filter(
        (e) => (e.from === null || y >= e.from) && (e.to === null || y <= e.to),
      );
      expect(matches).toHaveLength(1);
      expect(eraForYear(y).slug).toBe(matches[0].slug);
    }
  });

  it('places known milestone years in the expected era', () => {
    expect(eraForYear(1533).slug).toBe('hidden-lives');
    expect(eraForYear(1869).slug).toBe('birth-of-movement');
    expect(eraForYear(1942).slug).toBe('destruction');
    expect(eraForYear(1969).slug).toBe('liberation');
    expect(eraForYear(1987).slug).toBe('aids-crisis');
    expect(eraForYear(2015).slug).toBe('equality-wave');
    expect(eraForYear(2026).slug).toBe('backlash-now');
  });

  it('formats range labels', () => {
    expect(eraRangeLabel(HISTORY_ERAS[0])).toBe('–1799');
    expect(eraRangeLabel(HISTORY_ERAS[5])).toBe('1969–1981');
    expect(eraRangeLabel(HISTORY_ERAS[HISTORY_ERAS.length - 1])).toBe('2020–');
  });
});
