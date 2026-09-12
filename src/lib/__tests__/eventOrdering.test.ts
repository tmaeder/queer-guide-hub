import { describe, it, expect } from 'vitest';
import { isInProgress, orderUpcoming, type OrderableEvent } from '@/lib/eventOrdering';
import { endsAtOrAfter } from '@/hooks/useEvents';

// 2026-09-12T09:00Z — the instant the defect below was measured on prod.
const NOW = new Date('2026-09-12T09:00:00Z').getTime();

const ev = (
  title: string,
  start: string,
  end: string | null,
  is_featured = false,
): OrderableEvent & { title: string } => ({ title, start_date: start, end_date: end, is_featured });

describe('isInProgress', () => {
  it('is true for a festival on its second day', () => {
    expect(isInProgress(ev('lila', '2026-09-10T04:00:00Z', '2026-09-13T03:59:59Z'), NOW)).toBe(
      true,
    );
  });

  it('is false for an event that has not started', () => {
    expect(isInProgress(ev('later', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'), NOW)).toBe(
      false,
    );
  });

  it('is false for an event that has ended', () => {
    expect(isInProgress(ev('over', '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'), NOW)).toBe(
      false,
    );
  });

  // 22,840 live events have no end_date. Treating a past one as "still running"
  // would hoist the entire archive above everything upcoming.
  it('is false for a past event with no end_date', () => {
    expect(isInProgress(ev('point', '2026-09-01T00:00:00Z', null), NOW)).toBe(false);
  });

  it('is false rather than throwing on an unparseable date', () => {
    expect(isInProgress(ev('junk', 'not-a-date', null), NOW)).toBe(false);
  });
});

describe('orderUpcoming', () => {
  // The measured prod defect: ordering by start_date ASC put a 126-day
  // installation 119 days in above two Prides happening that same day.
  it('ranks a long run behind same-day Prides (the BLOWN AWAY regression)', () => {
    const rows = [
      ev('BLOWN AWAY', '2026-05-16T00:00:00Z', '2026-09-19T00:00:00Z'),
      ev('Bears Sitges Week', '2026-09-03T00:00:00Z', '2026-09-13T00:00:00Z'),
      ev('lila Queer Festival', '2026-09-10T04:00:00Z', '2026-09-13T03:59:59Z'),
      ev('Fringe!', '2026-09-11T00:00:00Z', '2026-09-20T00:00:00Z'),
      ev('Sarajevo Pride 2026', '2026-09-12T00:00:00Z', '2026-09-12T23:59:00Z'),
      ev('Belgrade Pride 2026', '2026-09-12T00:00:00Z', '2026-09-12T23:59:00Z'),
    ];

    const titles = orderUpcoming(rows, NOW).map((r) => (r as { title: string }).title);

    expect(titles[0]).toBe('Sarajevo Pride 2026');
    expect(titles[1]).toBe('Belgrade Pride 2026');
    expect(titles.indexOf('BLOWN AWAY')).toBeGreaterThan(titles.indexOf('lila Queer Festival'));
    // It is still on, so it must not be dropped — only demoted.
    expect(titles).toContain('BLOWN AWAY');
  });

  it('puts anything in progress ahead of anything future', () => {
    const rows = [
      ev('tomorrow', '2026-09-13T00:00:00Z', '2026-09-13T12:00:00Z'),
      ev('running', '2026-09-10T00:00:00Z', '2026-09-14T00:00:00Z'),
    ];
    expect(orderUpcoming(rows, NOW).map((r) => (r as { title: string }).title)).toEqual([
      'running',
      'tomorrow',
    ]);
  });

  it('orders future events by soonest start', () => {
    const rows = [
      ev('december', '2026-12-01T00:00:00Z', null),
      ev('october', '2026-10-01T00:00:00Z', null),
      ev('november', '2026-11-01T00:00:00Z', null),
    ];
    expect(orderUpcoming(rows, NOW).map((r) => (r as { title: string }).title)).toEqual([
      'october',
      'november',
      'december',
    ]);
  });

  it('preserves the featured-first contract', () => {
    const rows = [
      ev('running', '2026-09-10T00:00:00Z', '2026-09-14T00:00:00Z'),
      ev('featured future', '2026-11-01T00:00:00Z', null, true),
    ];
    expect(orderUpcoming(rows, NOW).map((r) => (r as { title: string }).title)).toEqual([
      'featured future',
      'running',
    ]);
  });

  it('is stable for rows that compare equal', () => {
    const rows = [
      ev('a', '2026-10-01T00:00:00Z', null),
      ev('b', '2026-10-01T00:00:00Z', null),
      ev('c', '2026-10-01T00:00:00Z', null),
    ];
    expect(orderUpcoming(rows, NOW).map((r) => (r as { title: string }).title)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('keeps an unparseable row at its server position instead of flinging it to an end', () => {
    const rows = [
      ev('good early', '2026-10-01T00:00:00Z', null),
      ev('junk', 'not-a-date', null),
      ev('good late', '2026-12-01T00:00:00Z', null),
    ];
    const titles = orderUpcoming(rows, NOW).map((r) => (r as { title: string }).title);
    expect(titles).toHaveLength(3);
    expect(titles).toContain('junk');
  });

  it('does not mutate its input', () => {
    const rows = [
      ev('later', '2026-11-01T00:00:00Z', null),
      ev('sooner', '2026-10-01T00:00:00Z', null),
    ];
    const before = rows.map((r) => r.title);
    orderUpcoming(rows, NOW);
    expect(rows.map((r) => r.title)).toEqual(before);
  });
});

describe('endsAtOrAfter', () => {
  // Both arms are required. Testing end_date alone silently drops the 22,840
  // events that have none — the larger half of the table.
  it('covers the null-end_date case as well as the end_date case', () => {
    const clause = endsAtOrAfter('2026-07-03T00:00:00Z');
    expect(clause).toContain('end_date.gte.2026-07-03T00:00:00Z');
    expect(clause).toContain('and(end_date.is.null,start_date.gte.2026-07-03T00:00:00Z)');
  });

  it('is a single PostgREST or() group with exactly two arms', () => {
    // Split on the top-level comma only: the second arm contains its own.
    const clause = endsAtOrAfter('X');
    expect(clause.startsWith('end_date.gte.X,and(')).toBe(true);
    expect(clause.endsWith(')')).toBe(true);
  });
});
