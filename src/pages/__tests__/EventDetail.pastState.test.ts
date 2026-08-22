import { describe, it, expect } from 'vitest';
import { hasWhoIsGoingContent, isEventPast, eventStatusLabel } from '../EventDetail.parts';

type E = Parameters<typeof isEventPast>[0];
const ev = (o: Record<string, unknown>) => o as unknown as E;

const PAST = '2020-01-01T00:00:00Z';
const FUTURE = '2999-01-01T00:00:00Z';

describe('isEventPast', () => {
  it('prefers end_date over start_date — a festival is not over on day one', () => {
    expect(isEventPast(ev({ start_date: PAST, end_date: FUTURE }))).toBe(false);
    expect(isEventPast(ev({ start_date: FUTURE, end_date: PAST }))).toBe(true);
  });

  it('falls back to start_date when there is no end', () => {
    expect(isEventPast(ev({ start_date: PAST }))).toBe(true);
    expect(isEventPast(ev({ start_date: FUTURE }))).toBe(false);
  });

  it('treats an unparseable or missing date as not past, never as ended', () => {
    // Labelling an event "Ended" on a date we could not read is a claim; the
    // absence of a claim is the safer default.
    expect(isEventPast(ev({ start_date: null }))).toBe(false);
    expect(isEventPast(ev({ start_date: 'not-a-date' }))).toBe(false);
  });
});

describe('eventStatusLabel — the Ended chip', () => {
  it('labels a past event Ended', () => {
    expect(eventStatusLabel(ev({ start_date: PAST }))).toBe('Ended');
  });

  it('leaves an upcoming event unlabelled', () => {
    expect(eventStatusLabel(ev({ start_date: FUTURE }))).toBeUndefined();
  });

  it('keeps the stronger label when a past event was also cancelled', () => {
    // "Cancelled" says something the date does not; "Ended" would erase it.
    expect(eventStatusLabel(ev({ start_date: PAST, status: 'cancelled' }))).toBe('Cancelled');
    expect(eventStatusLabel(ev({ start_date: PAST, liveness_status: 'postponed' }))).toBe(
      'Postponed',
    );
  });
});

describe('hasWhoIsGoingContent — the guard that stops a bare heading', () => {
  const user = { id: 'u1' };

  it('is false for a signed-out reader on a past event — the 99.2% case', () => {
    // No count, the "be the first" prompt is suppressed once the event is
    // over, and PeopleHereRail needs a signed-in viewer. Nothing renders, so
    // the section must not either.
    expect(hasWhoIsGoingContent(ev({ start_date: PAST }), null, true)).toBe(false);
  });

  it('is true when anyone has RSVPd, even in the past', () => {
    expect(
      hasWhoIsGoingContent(ev({ attendee_counts: { going: 3, interested: 0 } }), null, true),
    ).toBe(true);
    expect(
      hasWhoIsGoingContent(ev({ attendee_counts: { going: 0, interested: 2 } }), null, true),
    ).toBe(true);
  });

  it('is true for an upcoming event — the "be the first" prompt renders', () => {
    expect(hasWhoIsGoingContent(ev({}), null, false)).toBe(true);
  });

  it('is true for a signed-in reader on a past event — the people rail can render', () => {
    expect(hasWhoIsGoingContent(ev({}), user, true)).toBe(true);
  });
});
