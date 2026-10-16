import { describe, it, expect } from 'vitest';
import { withIndexedOccurrence } from '../../../supabase/functions/_shared/event-occurrence-timing';
import { getEventLiveState } from '../event-countdown';
import { formatEventTime } from '../event-time';
import { scheduleSentence } from '../eventScheduleSentence';

const span = {
  start_date: '2026-06-03T14:00:00Z',
  end_date: '2027-07-01T00:00:00Z',
  title: 'Afterwork',
};
const occurrence = { open_at: '2026-10-17T14:00:00Z', close_at: '2026-10-17T17:00:00Z' };

describe('indexed recurrence timing', () => {
  it('shows the next indexed session instead of a year-long happening-now span', () => {
    const next = withIndexedOccurrence(span, occurrence);
    expect(
      getEventLiveState(next.start_date, next.end_date, Date.parse('2026-10-16T18:00:00Z')).kind,
    ).toBe('upcoming');
    expect(formatEventTime(next.start_date, next.end_date, 'Europe/Paris')).not.toBe('All Day');
    expect(next.source_span.start_date).toBe(span.start_date);
    expect(span.start_date).toBe('2026-06-03T14:00:00Z');
  });
  it('marks missing or invalid index data explicitly rather than inventing a session', () => {
    expect(withIndexedOccurrence(span, null).indexed_occurrence).toBeNull();
    expect(
      withIndexedOccurrence(span, { ...occurrence, close_at: 'invalid' }).indexed_occurrence,
    ).toBeNull();
  });
  it('describes explicit multi-date source schedules without claiming a weekly cadence', () => {
    const sentence = scheduleSentence({
      kind: 'recurrence',
      confidence: 'feed',
      extra: [{ date: '2026-10-17' }, { date: '2026-10-24' }],
    });
    expect(sentence?.text).toBe('Multiple scheduled dates');
    expect(sentence?.inferred).toBe(false);
  });
});
