/** One row of `get_city_transit_service` (migration 99991792690290). */
export interface CityTransitRow {
  feed_key: string;
  attribution: string;
  source_url: string;
  feed_end_date: string;
  mode: 'metro' | 'tram' | 'rail' | 'ferry' | 'bus';
  route_ref: string;
  is_night_line: boolean;
  day_class: 'weekday' | 'friday' | 'saturday' | 'sunday';
  first_departure_s: number;
  last_departure_s: number;
  runs_all_night: boolean;
  trip_count: number;
  on_time_share: number | null;
  reliability_period: string | null;
}

export type NightKey = 'weeknight' | 'weekend';
const NIGHTS: Record<NightKey, CityTransitRow['day_class'][]> = {
  weeknight: ['weekday', 'sunday'],
  weekend: ['friday', 'saturday'],
};
// Ferries are omitted: a 17:25 last boat says nothing about getting home at night.
const MODE_ORDER: CityTransitRow['mode'][] = ['tram', 'metro', 'rail', 'bus'];

export interface LastDeparture {
  mode: CityTransitRow['mode'];
  night: NightKey;
  /** Seconds since service-day start; >= 86400 means after midnight. */
  lastS: number;
  route: string;
}

export interface CityTransitSummary {
  /** Latest regular (not all-night) departure per mode and night. */
  last: LastDeparture[];
  /** Lines that run through the night, per night. */
  allNight: Record<NightKey, { count: number; untilS: number | null }>;
  /** Median late-evening punctuality of tram+bus lines, with the period it was measured. */
  punctuality: { share: number; period: string } | null;
  attribution: string;
  sourceUrl: string;
  validUntil: string;
}

/** 'HH:MM', with the clock wrapped past midnight. */
export function formatClock(s: number): string {
  const r = s % 86400;
  return `${String(Math.floor(r / 3600)).padStart(2, '0')}:${String(Math.floor((r % 3600) / 60)).padStart(2, '0')}`;
}

export function summarizeCityTransit(rows: CityTransitRow[]): CityTransitSummary | null {
  if (!rows.length) return null;
  const last: LastDeparture[] = [];
  for (const night of ['weeknight', 'weekend'] as NightKey[]) {
    for (const mode of MODE_ORDER) {
      const regular = rows.filter(
        (r) =>
          r.mode === mode &&
          NIGHTS[night].includes(r.day_class) &&
          !r.runs_all_night &&
          !r.is_night_line,
      );
      if (!regular.length) continue;
      // Weeknight = the EARLIER of Sun/Mon-Thu (the one a traveller must not overshoot);
      // weekend = the earlier of Fri/Sat for the same reason.
      const perClass = NIGHTS[night]
        .map((c) => regular.filter((r) => r.day_class === c))
        .filter((g) => g.length)
        .map((g) => g.reduce((a, b) => (b.last_departure_s > a.last_departure_s ? b : a)));
      const pick = perClass.reduce((a, b) => (b.last_departure_s < a.last_departure_s ? b : a));
      last.push({ mode, night, lastS: pick.last_departure_s, route: pick.route_ref });
    }
  }
  const allNight = {} as CityTransitSummary['allNight'];
  for (const night of ['weeknight', 'weekend'] as NightKey[]) {
    const lines = rows.filter((r) => NIGHTS[night].includes(r.day_class) && r.runs_all_night);
    const refs = new Set(lines.map((r) => `${r.mode}|${r.route_ref}`));
    allNight[night] = {
      count: refs.size,
      untilS: lines.length
        ? Math.min(
            ...NIGHTS[night]
              .map((c) =>
                Math.max(
                  0,
                  ...lines.filter((r) => r.day_class === c).map((r) => r.last_departure_s),
                ),
              )
              .filter(Boolean),
          )
        : null,
    };
  }
  const shares = rows
    .filter(
      (r) =>
        r.on_time_share != null &&
        r.day_class === 'weekday' &&
        (r.mode === 'tram' || r.mode === 'bus'),
    )
    .map((r) => Number(r.on_time_share))
    .sort((a, b) => a - b);
  const period = rows.find((r) => r.reliability_period)?.reliability_period ?? null;
  return {
    last,
    allNight,
    punctuality:
      shares.length >= 5 && period
        ? { share: shares[Math.floor(shares.length / 2)], period }
        : null,
    attribution: rows[0].attribution,
    sourceUrl: rows[0].source_url,
    validUntil: rows[0].feed_end_date,
  };
}
