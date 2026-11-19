import { describe, expect, it } from 'vitest';
import { parseLinkDate } from '../useEventFilters';
import { parseFilterState } from '@/utils/eventsQueryString';

describe('events link dates', () => {
  it('reads a bare day as the local start/end of that day', () => {
    const start = parseLinkDate('2026-12-12', 'start')!;
    const end = parseLinkDate('2026-12-14', 'end')!;
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([
      2026, 11, 12, 0,
    ]);
    expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([14, 23, 59]);
  });

  it('passes ISO timestamps through and ignores junk', () => {
    expect(parseLinkDate('2026-12-12T18:30:00Z', 'start')?.toISOString()).toBe(
      '2026-12-12T18:30:00.000Z',
    );
    expect(parseLinkDate('nope', 'start')).toBeUndefined();
    expect(parseLinkDate(undefined, 'end')).toBeUndefined();
  });

  it('accepts start/end/search as aliases of from/to/q', () => {
    const s = parseFilterState(
      new URLSearchParams('city=Berlin&start=2026-12-12&end=2026-12-14&search=drag'),
    );
    expect([s.from, s.to, s.q, s.cities]).toEqual(['2026-12-12', '2026-12-14', 'drag', ['Berlin']]);
  });
});
