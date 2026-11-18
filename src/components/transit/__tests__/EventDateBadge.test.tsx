import { describe, expect, it } from 'vitest';
import { eventDateParts } from '../EventDateBadge';

const now = new Date(2026, 10, 18, 9, 0).getTime();

describe('eventDateParts', () => {
  it('shows weekday, day and time for an event this week', () => {
    const p = eventDateParts(new Date(2026, 10, 20, 21, 30).toISOString(), 'en', undefined, now);
    expect(p).toMatchObject({ top: 'FRI', day: '20', time: '21:30' });
  });

  it('shows the month instead of the weekday beyond a week, so the day is unambiguous', () => {
    const p = eventDateParts(new Date(2026, 11, 5, 19, 0).toISOString(), 'en', undefined, now);
    expect(p).toMatchObject({ top: 'DEC', day: '5', time: '19:00' });
  });

  it('drops a midnight time (all-day rows) instead of claiming 00:00', () => {
    const p = eventDateParts(new Date(2026, 10, 19, 0, 0).toISOString(), 'en', undefined, now);
    expect(p.time).toBeNull();
  });
});
