import { describe, expect, it } from 'vitest';
import {
  activeServices,
  createNightAccumulator,
  formatServiceSeconds,
  gtfsTimeToSeconds,
  mapMode,
  parseCsvLine,
  pickServiceWeek,
  separateNightVariants,
  serviceEnd,
} from '../../../scripts/transit/lib/gtfs-night.mjs';

// A Mon..Mon week: 2026-11-02 is a Monday.
const WEEK = [
  '20261102',
  '20261103',
  '20261104',
  '20261105',
  '20261106',
  '20261107',
  '20261108',
  '20261109',
];

describe('gtfs-night', () => {
  it('stores times past 24:00 as seconds and renders the next-day marker', () => {
    expect(gtfsTimeToSeconds('27:57:00')).toBe(100620);
    expect(formatServiceSeconds(100620)).toBe('03:57 (+1)');
    expect(gtfsTimeToSeconds('garbage')).toBeNull();
  });

  it('maps extended route types; base-spec-only would find no S-Bahn or tram', () => {
    expect(mapMode('109', 'S')).toEqual({ mode: 'rail', night: false });
    expect(mapMode('900', 'T')).toEqual({ mode: 'tram', night: false });
    expect(mapMode('400')).toEqual({ mode: 'metro', night: false });
    expect(mapMode('705', 'BN')).toEqual({ mode: 'bus', night: true });
    expect(mapMode('109', 'SN')).toEqual({ mode: 'rail', night: true });
    expect(mapMode('1300', 'GB')).toBeNull(); // cableway dropped
  });

  it('parses quoted fields containing commas', () => {
    expect(parseCsvLine('"1","Zürich, Bellevue","47.3"')).toEqual([
      '1',
      'Zürich, Bellevue',
      '47.3',
    ]);
  });

  it('picks the first full Mon..Mon week inside the feed window, null when expired', () => {
    expect(pickServiceWeek('20261029', '20251214', '20261212')).toEqual(WEEK);
    expect(pickServiceWeek('20261208', '20251214', '20261212')).toBeNull();
  });

  it('applies calendar_dates removals and additions', () => {
    const cal = [
      {
        service_id: 'A',
        monday: '1',
        tuesday: '1',
        wednesday: '1',
        thursday: '1',
        friday: '1',
        saturday: '0',
        sunday: '0',
        start_date: '20260101',
        end_date: '20261231',
      },
    ];
    const act = activeServices(WEEK, cal, [
      { service_id: 'A', date: '20261103', exception_type: '2' },
      { service_id: 'B', date: '20261107', exception_type: '1' },
    ]);
    expect(act.get('20261103')!.has('A')).toBe(false);
    expect(act.get('20261104')!.has('A')).toBe(true);
    expect(act.get('20261107')!.has('B')).toBe(true);
  });

  it("folds next morning's departures into the previous night — the Swiss night-bus case", () => {
    const acc = createNightAccumulator(WEEK);
    // Friday tram day service, last at 00:45 (stamped 24:45 on Friday's service).
    acc.add('20261106', 'tram|4|0', 6 * 3600, 't1');
    acc.add('20261106', 'tram|4|0', 24 * 3600 + 45 * 60, 't2');
    // Night bus N1 stamped on SATURDAY's service at 01:10, 02:10, 03:10.
    for (const [h, id] of [
      [1, 'n1'],
      [2, 'n2'],
      [3, 'n3'],
    ] as const)
      acc.add('20261107', 'bus|N1|1', h * 3600 + 600, id);
    const rows = acc.result();
    const tram = rows.find((r) => r.routeKey === 'tram|4|0' && r.day_class === 'friday')!;
    const n1 = rows.find((r) => r.routeKey === 'bus|N1|1' && r.day_class === 'friday')!;
    expect(formatServiceSeconds(tram.last_departure_s)).toBe('00:45 (+1)');
    expect(tram.first_departure_s).toBe(6 * 3600);
    expect(tram.runs_all_night).toBe(false);
    // Without the fold this would be absent from Friday entirely.
    expect(formatServiceSeconds(n1.last_departure_s)).toBe('03:10 (+1)');
    expect(n1.runs_all_night).toBe(true);
    expect(n1.trip_count).toBe(3);
  });

  it("does not mistake the next morning's first tram for the last one (measured: 04:59 on every Zürich tram)", () => {
    const acc = createNightAccumulator(WEEK);
    acc.add('20261106', 'tram|4|0', 23 * 3600, 'a');
    acc.add('20261106', 'tram|4|0', 23 * 3600 + 45 * 60, 'a2');
    acc.add('20261106', 'tram|4|0', 24 * 3600 + 45 * 60, 'b');
    acc.add('20261107', 'tram|4|0', 4 * 3600 + 59 * 60, 'c'); // Saturday morning restart
    const fri = acc.result().find((r) => r.day_class === 'friday')!;
    expect(formatServiceSeconds(fri.last_departure_s)).toBe('00:45 (+1)');
    expect(fri.runs_all_night).toBe(false);
  });

  it('keeps the real last departure of a route that ends before the evening', () => {
    const acc = createNightAccumulator(WEEK);
    acc.add('20261103', 'ferry|BAT|0', 9 * 3600, 'a');
    acc.add('20261103', 'ferry|BAT|0', 17 * 3600, 'b');
    expect(acc.result()[0].last_departure_s).toBe(17 * 3600);
  });

  it('serviceEnd: an hourly night line runs all night; a 90-min gap ends service', () => {
    const h = (x: number) => x * 3600;
    expect(serviceEnd([h(24.8), h(25.8), h(26.8), h(27.8), h(28.8)]).allNight).toBe(true);
    expect(serviceEnd([h(21), h(22), h(23.4), h(28.99)])).toEqual({
      last: h(23.4),
      allNight: false,
    });
  });

  it('does not attribute a non-representative night (Wednesday) to any class', () => {
    const acc = createNightAccumulator(WEEK);
    acc.add('20261104', 'tram|4|0', 23 * 3600, 'x'); // Wednesday service
    expect(acc.result().filter((r) => r.last_departure_s === 23 * 3600)).toHaveLength(0);
  });

  it('drops a route whose only Friday-night trace is Saturday 04:xx morning service', () => {
    const acc = createNightAccumulator(WEEK);
    acc.add('20261107', 'tram|9|0', 4 * 3600 + 40 * 60, 'm');
    expect(acc.result().filter((r) => r.day_class === 'friday')).toHaveLength(0);
  });

  it('relabels a night variant that shares a regular line number (St. Gallen bus 200)', () => {
    const base = { city_id: 'c', mode: 'bus', route_ref: '200', day_class: 'friday' };
    const out = separateNightVariants([
      { ...base, is_night_line: false },
      { ...base, is_night_line: true },
      { ...base, route_ref: 'N4', is_night_line: true }, // no collision: unchanged
    ]);
    expect(out.map((r) => r.route_ref)).toEqual(['200', '200 (night)', 'N4']);
  });
});
