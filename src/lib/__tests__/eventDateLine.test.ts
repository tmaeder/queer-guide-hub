import { describe, expect, it } from 'vitest';
import { eventDateLine } from '@/lib/eventDateLine';

const t = (_k: string, f: string) => f;
const NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

describe('eventDateLine', () => {
  it('gives a short date for an upcoming occurrence', () => {
    const line = eventDateLine(
      { id: 'a', start_date: '2031-12-06T20:00:00Z', timezone: 'Europe/Berlin' },
      'en-GB',
      t,
    );
    expect(line).toBe('Sat 6 Dec');
  });
  it('marks ended and cancelled occurrences', () => {
    expect(
      eventDateLine(
        { id: 'b', start_date: iso(NOW - 10 * 864e5), end_date: iso(NOW - 9 * 864e5) },
        'en-GB',
        t,
      ),
    ).toMatch(/· Ended$/);
    expect(
      eventDateLine({ id: 'c', start_date: iso(NOW + 864e5), status: 'cancelled' }, 'en-GB', t),
    ).toMatch(/· Cancelled$/);
  });
  it('returns null without a usable start date', () => {
    expect(eventDateLine(undefined, 'en', t)).toBeNull();
    expect(eventDateLine({ id: 'd', start_date: 'nope' }, 'en', t)).toBeNull();
  });
});
