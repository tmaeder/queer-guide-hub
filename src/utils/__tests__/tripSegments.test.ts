import { describe, it, expect } from 'vitest';
import {
  computeTripSegments,
  findActiveSegment,
  type SegmentInputDay,
  type SegmentInputPlace,
  type SegmentInputReservation,
} from '@/utils/tripSegments';

const day = (id: string, date: string): SegmentInputDay => ({ id, date });

const place = (overrides: Partial<SegmentInputPlace>): SegmentInputPlace => ({
  day_id: null,
  country_id: null,
  start_time: null,
  sort_order: 0,
  ...overrides,
});

const res = (overrides: Partial<SegmentInputReservation>): SegmentInputReservation => ({
  trip_id: null,
  country_id: null,
  type: 'flight',
  start_at: null,
  end_at: null,
  ...overrides,
});

describe('computeTripSegments', () => {
  it('returns nothing when there is no usable input', () => {
    expect(computeTripSegments([], [], [])).toEqual([]);
    // A place with no country contributes nothing.
    expect(computeTripSegments([place({ country_id: null })], [], [])).toEqual([]);
  });

  it('collapses adjacent same-country places into one segment', () => {
    const days = [day('d1', '2026-05-01'), day('d2', '2026-05-02')];
    const segs = computeTripSegments(
      [
        place({ day_id: 'd1', country_id: 'DE', sort_order: 1 }),
        place({ day_id: 'd1', country_id: 'DE', sort_order: 2 }),
        place({ day_id: 'd2', country_id: 'DE', sort_order: 1 }),
      ],
      days,
      [],
    );
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({
      country_id: 'DE',
      start_date: '2026-05-01',
      end_date: '2026-05-02',
      stop_count: 3,
    });
  });

  it('emits a new segment on country change', () => {
    const days = [day('d1', '2026-05-01'), day('d2', '2026-05-02'), day('d3', '2026-05-03')];
    const segs = computeTripSegments(
      [
        place({ day_id: 'd1', country_id: 'DE', sort_order: 1 }),
        place({ day_id: 'd2', country_id: 'TR', sort_order: 1 }),
        place({ day_id: 'd3', country_id: 'DE', sort_order: 1 }),
      ],
      days,
      [],
    );
    expect(segs.map((s) => s.country_id)).toEqual(['DE', 'TR', 'DE']);
  });

  it('mixes reservations into the timeline by start_at', () => {
    const days = [day('d1', '2026-05-01'), day('d2', '2026-05-03')];
    const segs = computeTripSegments(
      [
        place({ day_id: 'd1', country_id: 'DE', sort_order: 1 }),
        place({ day_id: 'd2', country_id: 'DE', sort_order: 1 }),
      ],
      days,
      [
        // A flight to TR happens between the two places, splitting the run.
        res({ country_id: 'TR', type: 'flight', start_at: '2026-05-02T10:00:00Z' }),
      ],
    );
    expect(segs.map((s) => s.country_id)).toEqual(['DE', 'TR', 'DE']);
  });

  it('ignores reservations with no start_at and no end_at', () => {
    const days = [day('d1', '2026-05-01')];
    const segs = computeTripSegments(
      [place({ day_id: 'd1', country_id: 'DE' })],
      days,
      [res({ country_id: 'TR' })],
    );
    expect(segs.map((s) => s.country_id)).toEqual(['DE']);
  });

  it('uses end_at when start_at is missing', () => {
    const days: SegmentInputDay[] = [];
    const segs = computeTripSegments(
      [],
      days,
      [
        res({ country_id: 'TR', end_at: '2026-05-04T08:00:00Z' }),
        res({ country_id: 'DE', end_at: '2026-05-02T08:00:00Z' }),
      ],
    );
    expect(segs.map((s) => s.country_id)).toEqual(['DE', 'TR']);
  });

  it('orders within-day stops by sort_order', () => {
    const days = [day('d1', '2026-05-01')];
    const segs = computeTripSegments(
      [
        place({ day_id: 'd1', country_id: 'TR', sort_order: 30 }),
        place({ day_id: 'd1', country_id: 'DE', sort_order: 10 }),
        place({ day_id: 'd1', country_id: 'DE', sort_order: 20 }),
      ],
      days,
      [],
    );
    expect(segs.map((s) => s.country_id)).toEqual(['DE', 'TR']);
  });
});

describe('findActiveSegment', () => {
  const segments = [
    { country_id: 'DE', start_date: '2026-04-01', end_date: '2026-04-05', stop_count: 1 },
    { country_id: 'TR', start_date: '2026-04-06', end_date: '2026-04-10', stop_count: 1 },
  ];

  it('returns the segment whose [start, end] window contains today', () => {
    expect(findActiveSegment(segments, new Date('2026-04-03T12:00:00Z'))?.country_id).toBe('DE');
    expect(findActiveSegment(segments, new Date('2026-04-08T12:00:00Z'))?.country_id).toBe('TR');
  });

  it('returns null outside any window', () => {
    expect(findActiveSegment(segments, new Date('2026-03-15T12:00:00Z'))).toBeNull();
    expect(findActiveSegment(segments, new Date('2026-05-01T12:00:00Z'))).toBeNull();
  });

  it('matches inclusive boundaries', () => {
    expect(findActiveSegment(segments, new Date('2026-04-01T00:00:00Z'))?.country_id).toBe('DE');
    expect(findActiveSegment(segments, new Date('2026-04-10T23:59:59Z'))?.country_id).toBe('TR');
  });
});
