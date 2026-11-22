import { describe, expect, it } from 'vitest';
import { openingHoursSpecification, openingHoursText, parseClock } from './venueHours';

// Every fixture is a real shape read off venues.hours on 2026-11-22.
describe('parseClock', () => {
  it.each([
    ['5pm', '17:00'],
    ['10:30pm', '22:30'],
    ['2:30 PM', '14:30'],
    ['12:00 AM', '00:00'],
    ['12 PM', '12:00'],
    ['10 AM', '10:00'],
    ['17:00', '17:00'],
    ['1700', '17:00'],
    ['+0000', '00:00'],
    ['24:00', '00:00'],
  ])('%s → %s', (raw, want) => expect(parseClock(raw)).toBe(want));

  it.each(['5', '13pm', '25:00', '10:75', 'noon', ''])('%s → null', (raw) =>
    expect(parseClock(raw)).toBeNull(),
  );
});

describe('openingHoursSpecification', () => {
  it('maps day keys, skips Closed, groups equal intervals', () => {
    const spec = openingHoursSpecification({
      fri: '5pm–2am',
      mon: 'Closed',
      sat: '3pm–2am',
      sun: '3pm–2am',
      thu: '5pm–2am',
      tue: '10:30pm–2am',
      wed: '5pm–2am',
    });
    expect(spec).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Tuesday'],
        opens: '22:30',
        closes: '02:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Wednesday', 'Thursday', 'Friday'],
        opens: '17:00',
        closes: '02:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Saturday', 'Sunday'],
        opens: '15:00',
        closes: '02:00',
      },
    ]);
  });

  it('reads the JSON-string variant and "Open 24 hours"', () => {
    const raw = JSON.stringify({
      mon: 'Open 24 hours',
      tue: 'Open 24 hours',
      wed: 'Open 24 hours',
      thu: 'Open 24 hours',
      fri: 'Open 24 hours',
      sat: 'Open 24 hours',
      sun: 'Open 24 hours',
      note: '24/7 access for qualifying members',
    });
    const spec = openingHoursSpecification(raw);
    expect(spec).toHaveLength(1);
    expect(spec?.[0]).toMatchObject({
      dayOfWeek: expect.arrayContaining(['Monday', 'Sunday']),
      opens: '00:00',
      closes: '23:59',
    });
    expect(spec?.[0].dayOfWeek).toHaveLength(7);
  });

  it('accepts spaced hyphen ranges with meridiem', () => {
    expect(openingHoursSpecification({ sat: '1:00 PM - 1:00 AM' })).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Saturday'],
        opens: '13:00',
        closes: '01:00',
      },
    ]);
  });

  it('maps weekly_intervals and prefers it over day keys', () => {
    const spec = openingHoursSpecification({
      format: 'weekly_intervals',
      weekly: [
        { day: 'FR', start: '18:00', end: '01:00' },
        { day: 'SA', start: '18:00', end: '01:00' },
        { day: 'SU', start: '11:30', end: '20:00' },
      ],
      fri: 'garbage',
    });
    expect(spec).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Friday', 'Saturday'],
        opens: '18:00',
        closes: '01:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Sunday'],
        opens: '11:30',
        closes: '20:00',
      },
    ]);
  });

  it('maps Foursquare regular with day 1 = Monday and +0000 = midnight', () => {
    const spec = openingHoursSpecification({
      display: 'Mon-Sun …',
      regular: [
        { day: 1, open: '1600', close: '2200' },
        { day: 7, open: '1200', close: '+0000' },
      ],
    });
    expect(spec).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday'],
        opens: '16:00',
        closes: '22:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Sunday'],
        opens: '12:00',
        closes: '00:00',
      },
    ]);
  });

  it('returns undefined for display-only free text and junk — never guesses', () => {
    expect(openingHoursSpecification({ source: 'spartacus', display: '24-8h' })).toBeUndefined();
    expect(openingHoursSpecification({ mon: 'Ask at the door' })).toBeUndefined();
    expect(openingHoursSpecification(null)).toBeUndefined();
    expect(openingHoursSpecification('not json')).toBeUndefined();
    expect(openingHoursSpecification([])).toBeUndefined();
  });

  it('renders the same structure as text', () => {
    expect(openingHoursText(openingHoursSpecification({ fri: '5pm–2am', sat: '5pm–2am' }))).toBe(
      'Fri, Sat 17:00–02:00.',
    );
    expect(openingHoursText(undefined)).toBeNull();
  });
});
