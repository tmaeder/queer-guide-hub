import { describe, it, expect } from 'vitest';
import { scheduleSentence } from '@/lib/eventScheduleSentence';

describe('scheduleSentence', () => {
  it('describes a weekly recurrence', () => {
    expect(
      scheduleSentence({
        kind: 'recurrence',
        weekly: [{ day: 'TU', start: '19:00' }],
        confidence: 'inferred',
      }),
    ).toEqual({ text: 'Every Tuesday, 19:00', inferred: true });
  });

  it('lists several weekdays in calendar order, not input order', () => {
    const s = scheduleSentence({
      kind: 'recurrence',
      weekly: [
        { day: 'SA', start: '22:00' },
        { day: 'FR', start: '22:00' },
      ],
    });
    expect(s?.text).toBe('Every Friday and Saturday, 22:00');
  });

  it('states no time when the days disagree about it', () => {
    // A library open 11:00 Saturday and 14:00 Tuesday is not "Tue and Sat, 11:00".
    // Collapsing them would publish a wrong opening time for one of the two.
    const s = scheduleSentence({
      kind: 'opening_hours',
      weekly: [
        { day: 'TU', start: '14:00' },
        { day: 'SA', start: '11:00' },
      ],
    });
    expect(s?.text).toBe('Open Tuesday and Saturday');
    expect(s?.text).not.toContain('11:00');
    expect(s?.text).not.toContain('14:00');
  });

  it('says Open, not Every, for opening hours', () => {
    const s = scheduleSentence({
      kind: 'opening_hours',
      weekly: [{ day: 'WE', start: '11:00', end: '18:00' }],
    });
    expect(s?.text).toBe('Open Wednesday, 11:00–18:00');
  });

  it('describes a fortnightly cadence', () => {
    const s = scheduleSentence({
      kind: 'recurrence',
      interval_weeks: 2,
      weekly: [{ day: 'TU', start: '19:00' }],
    });
    expect(s?.text).toBe('Every other Tuesday, 19:00');
  });

  it('describes an nth-weekday monthly cadence', () => {
    const s = scheduleSentence({
      kind: 'recurrence',
      monthly: { nth: 2, day: 'TH', start: '19:00' },
    });
    expect(s?.text).toBe('Every 2nd Thursday, 19:00');
  });

  it('says "last", not "-1th"', () => {
    const s = scheduleSentence({
      kind: 'recurrence',
      monthly: { nth: -1, day: 'FR', start: '20:00' },
    });
    expect(s?.text).toBe('Every last Friday, 20:00');
  });

  it('appends an end date with a mid-dot, not a comma', () => {
    const s = scheduleSentence({
      kind: 'recurrence',
      weekly: [{ day: 'MO', start: '18:00' }],
      until: '2032-06-30',
    });
    expect(s?.text).toBe('Every Monday, 18:00 · until 30 June 2032');
  });

  it('describes a finite run', () => {
    expect(scheduleSentence({ kind: 'run', until: '2032-05-13' })?.text).toBe(
      'Runs until 13 May 2032',
    );
  });

  it('marks an authored rule as not inferred', () => {
    const s = scheduleSentence({
      kind: 'recurrence',
      weekly: [{ day: 'TU', start: '19:00' }],
      confidence: 'authored',
    });
    expect(s?.inferred).toBe(false);
  });

  it('returns null rather than an empty sentence', () => {
    // A caller renders whatever comes back; "" would render an empty row that
    // looks like missing data instead of no rule.
    expect(scheduleSentence(null)).toBeNull();
    expect(scheduleSentence(undefined)).toBeNull();
    expect(scheduleSentence({})).toBeNull();
    expect(scheduleSentence({ kind: 'recurrence', weekly: [] })).toBeNull();
    expect(scheduleSentence({ kind: 'run' })).toBeNull();
  });

  it('ignores an unknown weekday code rather than printing it raw', () => {
    expect(scheduleSentence({ kind: 'recurrence', weekly: [{ day: 'XX' }] })).toBeNull();
    expect(scheduleSentence({ kind: 'recurrence', monthly: { nth: 1, day: 'XX' } })).toBeNull();
  });

  it('drops an unparseable end date instead of printing Invalid Date', () => {
    const s = scheduleSentence({
      kind: 'recurrence',
      weekly: [{ day: 'MO', start: '18:00' }],
      until: 'not-a-date',
    });
    expect(s?.text).toBe('Every Monday, 18:00');
    expect(s?.text).not.toMatch(/Invalid/);
  });
});
