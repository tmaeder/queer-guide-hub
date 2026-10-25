/**
 * Pure helpers for deriving "last departure tonight" per city from a GTFS feed.
 * No I/O here: build-city-service.mjs streams the files and feeds these.
 *
 * Three traps from docs/plans/2026-08-30-transit-mobility-phase-4-design.md §3.4,
 * each of which produces a confident WRONG answer if ignored:
 *  1. Extended route_type (100-1799) — base-spec 0..3 finds no S-Bahn/tram in Europe.
 *  2. GTFS times run past 24:00 — store seconds, never `time`.
 *  3. Aggregating by calendar day-class drops late trips — aggregate over real
 *     service DATES, and fold the next service day's early-morning departures
 *     (t < NIGHT_CUTOFF_S) into the previous night. Swiss feeds stamp a Saturday
 *     01:30 night bus as Saturday 01:30:00, not Friday 25:30:00.
 */

export const NIGHT_CUTOFF_S = 5 * 3600;
const DAY_S = 86400;

/** Quote-aware CSV line split. GTFS fields here never contain escaped quotes. */
export function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** 'HH:MM:SS' (HH may be >= 24) -> seconds since service-day start; null if malformed. */
export function gtfsTimeToSeconds(s) {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(s?.trim() ?? '');
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
}

/** Seconds -> 'HH:MM' with a (+1) marker past midnight. */
export function formatServiceSeconds(s) {
  const d = Math.floor(s / DAY_S);
  const r = s % DAY_S;
  const hh = String(Math.floor(r / 3600)).padStart(2, '0');
  const mm = String(Math.floor((r % 3600) / 60)).padStart(2, '0');
  return `${hh}:${mm}${d > 0 ? ` (+${d})` : ''}`;
}

/**
 * GTFS route -> schema mode, or null to drop (funiculars, cableways, unknown).
 * Night flag from Swiss route_desc (BN night bus, SN night S-Bahn) or type 705.
 */
export function mapMode(routeType, routeDesc = '') {
  const t = Number(routeType);
  const night = routeDesc === 'BN' || routeDesc === 'SN' || t === 705;
  let mode = null;
  if (t === 0 || (t >= 900 && t < 1000)) mode = 'tram';
  else if (t === 1 || (t >= 400 && t < 500)) mode = 'metro';
  else if (t === 2 || (t >= 100 && t < 200)) mode = 'rail';
  // 11 / 800-899 trolleybus (Lyon's C1-C3, C11, C13) ride the bus network.
  else if (t === 3 || t === 11 || (t >= 700 && t < 900) || (t >= 200 && t < 300)) mode = 'bus';
  else if (t === 4 || (t >= 1000 && t < 1100) || t === 1200) mode = 'ferry';
  return mode ? { mode, night } : null;
}

const DAY_CLASS_BY_WEEKDAY = { 2: 'weekday', 5: 'friday', 6: 'saturday', 0: 'sunday' };

/**
 * Pick the representative week: the first Monday on/after `today` whose 8 days
 * (Mon..next Mon) all lie inside the feed's validity window. Returns ISO yyyymmdd
 * strings, or null when the feed has no such week (expired feed must not publish).
 */
export function pickServiceWeek(today, feedStart, feedEnd) {
  const toDate = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  const fmt = (d) => d.toISOString().slice(0, 10).replaceAll('-', '');
  const start = toDate(today > feedStart ? today : feedStart);
  const end = toDate(feedEnd);
  const mon = new Date(start);
  mon.setUTCDate(mon.getUTCDate() + ((8 - mon.getUTCDay()) % 7));
  const last = new Date(mon);
  last.setUTCDate(last.getUTCDate() + 7);
  if (last > end) return null;
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date(mon);
    d.setUTCDate(d.getUTCDate() + i);
    return fmt(d);
  });
}

/** Weekday (0=Sun) of a yyyymmdd string. */
export function weekdayOf(yyyymmdd) {
  return new Date(
    Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8)),
  ).getUTCDay();
}

/**
 * Active service_ids per date from calendar rows + calendar_dates exceptions.
 * calendarRows: {service_id, monday..sunday, start_date, end_date}
 * exceptions:   {service_id, date, exception_type} (only rows for `dates` needed)
 */
export function activeServices(dates, calendarRows, exceptions) {
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const out = new Map(dates.map((d) => [d, new Set()]));
  for (const c of calendarRows) {
    for (const d of dates) {
      if (d >= c.start_date && d <= c.end_date && c[names[weekdayOf(d)]] === '1')
        out.get(d).add(c.service_id);
    }
  }
  for (const e of exceptions) {
    const set = out.get(e.date);
    if (!set) continue;
    if (e.exception_type === '1') set.add(e.service_id);
    else if (e.exception_type === '2') set.delete(e.service_id);
  }
  return out;
}

/**
 * Accumulator over departures. Call add() with the service DATE a departure
 * belongs to; it is attributed to that date's night, and — if before
 * NIGHT_CUTOFF_S — also to the previous date's night, shifted +24h.
 */
export function createNightAccumulator(week) {
  const nightOf = new Map(); // date -> day_class for the 4 representative nights
  for (const d of week.slice(0, 7)) {
    const cls = DAY_CLASS_BY_WEEKDAY[weekdayOf(d)];
    if (cls) nightOf.set(d, cls);
  }
  const prev = new Map(week.slice(1).map((d, i) => [d, week[i]]));
  const acc = new Map(); // key -> stats

  function bump(cls, routeKey, t, tripId, ownDay) {
    const key = `${routeKey}|${cls}`;
    let s = acc.get(key);
    if (!s)
      acc.set(
        key,
        (s = { first: Infinity, lastOwn: 0, deepNight: false, times: new Set(), trips: new Set() }),
      );
    if (ownDay) {
      if (t >= MORNING_S) s.first = Math.min(s.first, t);
      s.lastOwn = Math.max(s.lastOwn, t);
    }
    s.trips.add(tripId);
    if (t >= DAY_S && t < DAY_S + MORNING_S) s.deepNight = true;
    if (t >= EVENING_S) s.times.add(t);
  }

  return {
    add(date, routeKey, t, tripId) {
      // Past 06:00 next day is another day's service. The German feed stamps multi-day
      // coach trips up to ~40:00, which otherwise read as a "last bus at 15:50 (+1)".
      if (t >= DAY_S + 6 * 3600) return;
      if (nightOf.has(date)) bump(nightOf.get(date), routeKey, t, tripId, true);
      const p = prev.get(date);
      if (t < NIGHT_CUTOFF_S && p && nightOf.has(p))
        bump(nightOf.get(p), routeKey, t + DAY_S, tripId, false);
    },
    /** -> [{routeKey, day_class, first_departure_s, last_departure_s, runs_all_night, trip_count}] */
    result() {
      const out = [];
      for (const [key, s] of acc) {
        // Only folded 04:00-05:00 departures and nothing of its own: a morning restart, not night service.
        if (s.lastOwn === 0 && !Number.isFinite(s.first) && !s.deepNight) continue;
        const i = key.lastIndexOf('|');
        const end = s.times.size
          ? serviceEnd(
              [...s.times].sort((a, b) => a - b),
              key.slice(0, i).endsWith('|1'), // routeKey is mode|ref|night
            )
          : { last: s.lastOwn, allNight: false };
        const { last, allNight } = end; // no evening departures: last = latest of the day
        out.push({
          routeKey: key.slice(0, i),
          day_class: key.slice(i + 1),
          first_departure_s: Number.isFinite(s.first) ? s.first : last,
          last_departure_s: last,
          runs_all_night: allNight,
          trip_count: s.trips.size,
        });
      }
      return out;
    },
  };
}

const MORNING_S = 4 * 3600;
const EVENING_S = 18 * 3600;
const END_SEARCH_S = 20 * 3600;
export const SERVICE_GAP_S = 90 * 60;

/**
 * Where an evening's service ends. A fixed clock cutoff cannot tell a 04:10 night
 * bus from a 04:59 first morning tram (measured on the Zürich feed: every tram
 * read "last 04:59 (+1)"), so the end is the first departure after 20:00 followed
 * by a gap of SERVICE_GAP_S or more. No such gap before the night window closes
 * = runs all night. `times` are sorted seconds >= 18:00, next-morning folded +24h.
 */
export function serviceEnd(times, nightLine = false) {
  if (!times.length) return { last: 0, allNight: false };
  for (let i = 0; i < times.length; i++) {
    if (times[i] < END_SEARCH_S) continue;
    const next = times[i + 1];
    if (next === undefined || next - times[i] >= SERVICE_GAP_S) {
      // Data simply stops late: it ran through the night, not "ended". A night line
      // counts from 03:00 (Swiss night buses stop ~03:10); a regular line only from
      // 04:00, because Toulouse's metro closes at 03:21-03:25 on weekend nights and
      // read as "runs all night", while genuine all-night lines here run to 04:5x.
      const allNightFrom = DAY_S + (nightLine ? 3 : 4) * 3600;
      return { last: times[i], allNight: next === undefined && times[i] >= allNightFrom };
    }
  }
  return { last: times[times.length - 1], allNight: false }; // nothing after 20:00
}

/**
 * A night variant that shares its line number with a regular line (St. Gallen buses
 * 200/211/120/121 on Fri/Sat) would produce two rows for one
 * (city, mode, route_ref, day_class) key and abort the whole commit with
 * "ON CONFLICT DO UPDATE command cannot affect row a second time". Both rows are
 * real — the regular one is the last regular bus, the night one is all-night
 * service — so the night variant is relabelled "<ref> (night)", only on collision.
 */
export function separateNightVariants(rows) {
  const key = (r) => `${r.city_id}|${r.mode}|${r.route_ref}|${r.day_class}`;
  const regular = new Set(rows.filter((r) => !r.is_night_line).map(key));
  return rows.map((r) =>
    r.is_night_line && regular.has(key(r)) ? { ...r, route_ref: `${r.route_ref} (night)` } : r,
  );
}

/**
 * Long-distance trains are not a way home within a city: one ICE passing Düsseldorf at
 * 02:43 and an IC8 leaving Zürich HB at 02:10 each became that city's "last train".
 * Swiss feeds mark them by route_type (101 high-speed, 102 long-distance) and class
 * code; German feeds use plain type 2 for all rail, so only the train name says it.
 */
const LONG_DISTANCE_CLASS = new Set([
  'IC',
  'ICE',
  'EC',
  'EN',
  'NJ',
  'TGV',
  'RJ',
  'RJX',
  'ECE',
  'FLX',
  'EXT',
]);
export function isLongDistanceRail(routeType, routeDesc = '', ref = '') {
  const t = Number(routeType);
  if (t === 101 || t === 102) return true;
  if (LONG_DISTANCE_CLASS.has(routeDesc)) return true;
  const head = String(ref)
    .trim()
    .split(/[\s\d]/)[0]
    .toUpperCase();
  return LONG_DISTANCE_CLASS.has(head);
}
