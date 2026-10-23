import { describe, expect, it } from 'vitest';
import { formatClock, summarizeCityTransit, type CityTransitRow } from '../cityTransit';

const base = {
  feed_key: 'f',
  attribution: 'Timetable: opentransportdata.swiss',
  source_url: 'u',
  feed_end_date: '2026-12-12',
  first_departure_s: 5 * 3600,
  trip_count: 10,
  on_time_share: null,
  reliability_period: null,
  is_night_line: false,
  runs_all_night: false,
} as const;
const row = (o: Partial<CityTransitRow>): CityTransitRow =>
  ({
    ...base,
    mode: 'tram',
    route_ref: '4',
    day_class: 'weekday',
    last_departure_s: 0,
    ...o,
  }) as CityTransitRow;
const H = 3600;

describe('summarizeCityTransit', () => {
  it('returns null for a city with no rows (renders nothing, never "no service")', () => {
    expect(summarizeCityTransit([])).toBeNull();
  });

  it('excludes all-night routes from "last regular departure" (Forchbahn must not make trams run to 04:14)', () => {
    const s = summarizeCityTransit([
      row({ route_ref: '4', day_class: 'friday', last_departure_s: 25 * H }),
      row({ route_ref: '18', day_class: 'friday', last_departure_s: 28 * H, runs_all_night: true }),
    ])!;
    expect(s.last.find((l) => l.mode === 'tram' && l.night === 'weekend')).toMatchObject({
      route: '4',
      lastS: 25 * H,
    });
    expect(s.allNight.weekend).toEqual({ count: 1, untilS: 28 * H });
  });

  it('weeknight takes the EARLIER of Sunday and Mon-Thu, so nobody overshoots', () => {
    const s = summarizeCityTransit([
      row({ day_class: 'weekday', last_departure_s: 25.5 * H }),
      row({ day_class: 'sunday', last_departure_s: 24.5 * H }),
    ])!;
    expect(formatClock(s.last[0].lastS)).toBe('00:30');
  });

  it('reports punctuality only with a period and at least 5 lines', () => {
    const rel = (ref: string, v: number) =>
      row({
        route_ref: ref,
        on_time_share: v,
        reliability_period: '2023 (Jan–Jul)',
        last_departure_s: 25 * H,
      });
    expect(summarizeCityTransit([rel('2', 0.9)])!.punctuality).toBeNull();
    const s = summarizeCityTransit(
      ['2', '3', '4', '5', '6'].map((r, i) => rel(r, 0.8 + i * 0.05)),
    )!;
    expect(s.punctuality).toEqual({ share: 0.9, period: '2023 (Jan–Jul)' });
  });
});
