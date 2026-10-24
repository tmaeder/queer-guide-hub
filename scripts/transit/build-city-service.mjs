#!/usr/bin/env node
/**
 * Derive city_transit_service rows ("last departure tonight") from a GTFS zip.
 *
 *   node scripts/transit/build-city-service.mjs <gtfs.zip> [--feed ch|de] [--out rows.json] [--today yyyymmdd] [--commit]
 *
 * --commit sends the rows to commit_city_transit_service() (needs SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY). A failed derivation commits parse_status, never rows,
 * so the last good timetable keeps serving until the feed itself expires.
 *
 * Streams the zip via `unzip -p` (the Swiss feed is 4.5 GB unpacked, stop_times
 * alone 3.7 GB) and keeps only what the answer needs. Cities are declared in
 * CITIES below; a stop belongs to a city when its name carries the municipality
 * prefix Swiss naming uses ("Zürich, Bellevue", "Zürich HB") AND it lies in the
 * bbox — the prefix alone matches "Zürich Flughafen" (Kloten), the bbox alone
 * matches Kilchberg/Wallisellen.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import {
  activeServices,
  createNightAccumulator,
  formatServiceSeconds,
  gtfsTimeToSeconds,
  isLongDistanceRail,
  mapMode,
  parseCsvLine,
  pickServiceWeek,
  separateNightVariants,
} from './lib/gtfs-night.mjs';

// Swiss stops carry the municipality as a name prefix ("Zürich, Bellevue"), so a city is
// that prefix AND a ~7 x 7 km box. German stop names follow no such rule (Cologne puts
// the city last, Munich mostly omits it), so a German city is a 5 km radius around its
// centre — the area a visitor goes out in, without suburbs inflating the answer.
const box = (lat, lng) => [lat - 0.06, lng - 0.09, lat + 0.06, lng + 0.09];
export const FEEDS = {
  ch: {
    meta: {
      feed_key: 'ch-opentransportdata-gtfs',
      provider: 'SBB / opentransportdata.swiss',
      country_code: 'CH',
      source_url: 'https://data.opentransportdata.swiss/en/dataset/?q=gtfs2020',
      licence: 'opentransportdata.swiss terms of use (open data, attribution required)',
      attribution: 'Timetable: opentransportdata.swiss',
    },
    cities: [
      {
        slug: 'zuerich',
        city_id: '35d1d772-8ce7-4c05-92a5-95ea7053b4bf',
        namePrefix: /^Zürich(,| |$)/,
        excludeName: /^Zürich Flughafen/,
        bbox: box(47.3769, 8.5417),
      },
      {
        slug: 'geneva',
        city_id: '4a0387c6-8b78-495a-9b75-723b2718935c',
        namePrefix: /^Genève(,| |$)/,
        bbox: box(46.2044, 6.1432),
      },
      {
        slug: 'bern',
        city_id: 'cbd7c40b-2cc5-418e-bb71-9efe0e1a697c',
        namePrefix: /^Bern(,| |$)/,
        bbox: box(46.9481, 7.4474),
      },
      {
        slug: 'basel',
        city_id: 'a0c1349b-da8a-43c4-9a64-39b6f0193fbf',
        namePrefix: /^Basel(,| |$)/,
        bbox: box(47.5596, 7.5886),
      },
      {
        slug: 'lausanne',
        city_id: 'c8b840da-855d-4a58-baf1-a949d0c7460f',
        namePrefix: /^Lausanne(,| |$)/,
        bbox: box(46.516, 6.63282),
      },
      {
        slug: 'winterthur',
        city_id: '05599810-ae82-4f75-95e5-8f31f1ecc6fe',
        namePrefix: /^Winterthur(,| |$)/,
        bbox: box(47.5001, 8.724),
      },
      {
        slug: 'luzern',
        city_id: 'f2c45fec-5a35-43c2-920d-9d6580527e8c',
        namePrefix: /^Luzern(,| |$)/,
        bbox: box(47.056923, 8.311095),
      },
      {
        slug: 'st-gallen',
        city_id: '0ddd4de6-4c53-4f44-9e65-7676e7d70b9d',
        namePrefix: /^St\. Gallen(,| |$)/,
        bbox: box(47.4245, 9.3767),
      },
      {
        slug: 'lugano',
        city_id: '8e69a79e-aa4f-4747-93a3-765b556f3a2d',
        namePrefix: /^Lugano(,| |$)/,
        bbox: box(46.0103, 8.9625),
      },
    ],
  },
  de: {
    meta: {
      feed_key: 'de-gtfs-de',
      provider: 'gtfs.de (DELFI e.V.)',
      country_code: 'DE',
      source_url: 'https://gtfs.de/en/feeds/de_full/',
      licence: 'CC BY 4.0',
      attribution: 'Timetable: gtfs.de / DELFI e.V. (CC BY 4.0)',
    },
    // No line-class code in this feed, so night lines are recognised by name (N1, N40).
    // NOT applied to Switzerland: its rail lines "N1"/"N7" are not night lines, and its
    // feed marks real night service explicitly (route_desc BN/SN).
    nightByName: true,
    cities: [
      {
        slug: 'berlin',
        city_id: '5761c6c4-3ed6-4429-832b-025e508db544',
        centre: [52.52, 13.405],
        radiusKm: 5,
      },
      {
        slug: 'cologne',
        city_id: 'c7198e4f-01d5-4b07-adb0-df41041c2f41',
        centre: [50.9375, 6.9603],
        radiusKm: 5,
      },
      {
        slug: 'munich',
        city_id: 'fb46a103-3465-4112-ae6f-e999722f70fb',
        centre: [48.1351, 11.582],
        radiusKm: 5,
      },
      {
        slug: 'hamburg',
        city_id: 'a22dc107-45cc-491e-af45-d91ebc1eda3c',
        centre: [53.5511, 9.9937],
        radiusKm: 5,
      },
      {
        slug: 'frankfurt',
        city_id: 'e2238b71-ce45-43c8-b271-6bb7994faf42',
        centre: [50.1106444, 8.6820917],
        radiusKm: 5,
      },
      {
        slug: 'stuttgart',
        city_id: '30055121-d676-44c0-81b0-857ee274b5ae',
        centre: [48.7784485, 9.1800132],
        radiusKm: 5,
      },
      {
        slug: 'nuernberg',
        city_id: '193a96f6-37e2-45f2-a9fd-0467b9155189',
        centre: [49.45421, 11.07752],
        radiusKm: 5,
      },
      {
        slug: 'hannover',
        city_id: '2a4dff6d-466d-49b8-aee3-b03c8992d5e5',
        centre: [52.37052, 9.73322],
        radiusKm: 5,
      },
      {
        slug: 'duesseldorf',
        city_id: 'af082d6a-800b-4cfc-96df-ca1e55c93115',
        centre: [51.22319, 6.77927],
        radiusKm: 5,
      },
      {
        slug: 'dresden',
        city_id: 'fd373c03-e44f-4d09-8462-0b0f4ae2467f',
        centre: [51.05089, 13.73832],
        radiusKm: 5,
      },
    ],
  },
  at: {
    meta: {
      feed_key: 'at-wiener-linien',
      provider: 'Wiener Linien',
      country_code: 'AT',
      source_url: 'https://www.wienerlinien.at/open-data',
      licence: 'CC BY 4.0',
      attribution: 'Timetable: Wiener Linien (CC BY 4.0)',
    },
    // Wiener Linien only, the one key-free Austrian feed: the national
    // Mobilitätsverbünde feeds (Graz, Linz, Salzburg, Innsbruck, rail) need an account.
    // Night lines are named N6, N25, like Germany's.
    nightByName: true,
    cities: [
      {
        slug: 'vienna',
        city_id: '18463095-3eef-4e81-b367-1ce244a39c19',
        centre: [48.2082, 16.3738],
        radiusKm: 15,
      },
    ],
  },
};

const args = process.argv.slice(2);
const zip = args[0];
const outPath = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const todayArg = args.includes('--today') ? args[args.indexOf('--today') + 1] : null;
const commit = args.includes('--commit');
const feedArg = args.includes('--feed') ? args[args.indexOf('--feed') + 1] : 'ch';
if (!FEEDS[feedArg]) {
  console.error(`unknown --feed ${feedArg}; known: ${Object.keys(FEEDS).join(', ')}`);
  process.exit(2);
}
const FEED_META = FEEDS[feedArg].meta;
const FEED_KEY = FEED_META.feed_key;
const CITIES = FEEDS[feedArg].cities;
const NIGHT_BY_NAME = !!FEEDS[feedArg].nightByName;
// Measured German night-line names: N1, NE1, 'NE 1', NL1, n61 (Frankfurt), N1A, NG1, NA1.
const NIGHT_LINE_NAME = /^N[EGLA]?\s?\d+[A-Z]?$/i;

const isoDate = (d) => (d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null);

async function commitToSupabase(feed, rows) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('--commit needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${url}/rest/v1/rpc/commit_city_transit_service`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_feed: feed, p_rows: rows }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`commit failed HTTP ${res.status}: ${body.slice(0, 400)}`);
  console.error('commit:', body);
}
if (!zip) {
  console.error('usage: build-city-service.mjs <gtfs.zip> [--out rows.json] [--today yyyymmdd]');
  process.exit(2);
}

/** Swiss: municipality prefix + box. German: radius around the centre. */
export function stopInCity(c, name, lat, lon) {
  if (c.radiusKm) {
    const dLat = ((lat - c.centre[0]) * Math.PI) / 180;
    const dLon = ((lon - c.centre[1]) * Math.PI * Math.cos((c.centre[0] * Math.PI) / 180)) / 180;
    return 6371 * Math.sqrt(dLat * dLat + dLon * dLon) <= c.radiusKm;
  }
  const [a, b, cc, d] = c.bbox;
  return (
    c.namePrefix.test(name) &&
    !c.excludeName?.test(name) &&
    lat >= a &&
    lat <= cc &&
    lon >= b &&
    lon <= d
  );
}

/** Yield objects for each row of a file inside the zip. */
async function* rows(file) {
  const proc = spawn('unzip', ['-p', zip, file]);
  const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
  let header = null;
  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, '');
    if (!line) continue;
    const f = parseCsvLine(line);
    if (!header) {
      header = f;
      continue;
    }
    const o = {};
    for (let i = 0; i < header.length; i++) o[header[i]] = f[i];
    yield o;
  }
  const code = await new Promise((r) => proc.on('close', r));
  if (code !== 0) throw new Error(`unzip -p ${file} exited ${code}`);
}

async function main() {
  const t0 = Date.now();
  let feedInfo = {};
  // feed_info.txt is optional in GTFS and Wiener Linien omits it (unzip exits 11 =
  // "no such file"); any other failure still aborts.
  try {
    for await (const r of rows('feed_info.txt')) feedInfo = r;
  } catch (e) {
    if (!/exited 11$/.test(e.message)) throw e;
  }
  const calendar = [];
  for await (const c of rows('calendar.txt')) calendar.push(c);
  // gtfs.de and Wiener Linien publish no feed dates; its validity is the calendar's own span.
  if (!feedInfo.feed_start_date || !feedInfo.feed_end_date) {
    feedInfo.feed_start_date = calendar.reduce(
      (m, c) => (c.start_date < m ? c.start_date : m),
      '99999999',
    );
    feedInfo.feed_end_date = calendar.reduce(
      (m, c) => (c.end_date > m ? c.end_date : m),
      '00000000',
    );
  }
  const today = todayArg ?? new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const week = pickServiceWeek(today, feedInfo.feed_start_date, feedInfo.feed_end_date);
  if (!week)
    throw new Error(
      `feed ${feedInfo.feed_start_date}..${feedInfo.feed_end_date} has no full week after ${today}`,
    );

  // stop_id -> city index
  const stopCity = new Map();
  for await (const s of rows('stops.txt')) {
    const lat = +s.stop_lat;
    const lon = +s.stop_lon;
    CITIES.forEach((c, i) => {
      if (stopInCity(c, s.stop_name, lat, lon)) stopCity.set(s.stop_id, i);
    });
  }

  const routes = new Map(); // route_id -> {mode, night, ref}
  for await (const r of rows('routes.txt')) {
    const m = mapMode(r.route_type, r.route_desc);
    if (!m) continue;
    const ref = r.route_short_name || r.route_long_name;
    if (m.mode === 'rail' && isLongDistanceRail(r.route_type, r.route_desc, ref)) continue;
    // German rail-replacement buses carry the train's name ("S8" bus in Düsseldorf at 03:10):
    // a works diversion, not the city's last bus.
    if (NIGHT_BY_NAME && m.mode === 'bus' && /^(SEV|S|RE|RB|U)\s?\d|^SEV\b/i.test(ref)) continue;
    routes.set(r.route_id, {
      ...m,
      night: m.night || (NIGHT_BY_NAME && NIGHT_LINE_NAME.test(ref)),
      ref,
    });
  }

  const wanted = new Set(week);
  const exceptions = [];
  for await (const e of rows('calendar_dates.txt')) if (wanted.has(e.date)) exceptions.push(e);
  const active = activeServices(week, calendar, exceptions);
  const serviceDates = new Map(); // service_id -> dates[]
  for (const [d, set] of active)
    for (const sid of set) (serviceDates.get(sid) ?? serviceDates.set(sid, []).get(sid)).push(d);

  const trips = new Map(); // trip_id -> {route, dates}
  for await (const t of rows('trips.txt')) {
    const route = routes.get(t.route_id);
    const dates = serviceDates.get(t.service_id);
    if (route && dates) trips.set(t.trip_id, { route, dates });
  }

  const accs = CITIES.map(() => createNightAccumulator(week));
  let n = 0;
  for await (const st of rows('stop_times.txt')) {
    if (++n % 10_000_000 === 0) console.error(`  stop_times ${n / 1e6}M`);
    const ci = stopCity.get(st.stop_id);
    if (ci === undefined) continue;
    const trip = trips.get(st.trip_id);
    if (!trip) continue;
    const t = gtfsTimeToSeconds(st.departure_time);
    if (t === null || st.pickup_type === '1') continue;
    const key = `${trip.route.mode}|${trip.route.ref}|${trip.route.night ? 1 : 0}`;
    for (const d of trip.dates) accs[ci].add(d, key, t, st.trip_id);
  }

  let out = [];
  CITIES.forEach((c, i) => {
    for (const r of accs[i].result()) {
      const [mode, route_ref, night] = r.routeKey.split('|');
      out.push({
        city_id: c.city_id,
        feed_key: FEED_KEY,
        mode,
        route_ref,
        is_night_line: night === '1',
        day_class: r.day_class,
        first_departure_s: r.first_departure_s,
        last_departure_s: r.last_departure_s,
        runs_all_night: r.runs_all_night,
        trip_count: r.trip_count,
        service_scope: 'local',
      });
    }
  });

  out = separateNightVariants(out);
  // The table key is (city, feed, mode, route_ref, day_class). A duplicate here makes the
  // database reject the WHOLE batch, so name it and stop before sending anything.
  const seen = new Set();
  for (const r of out) {
    const k = `${r.city_id}|${r.mode}|${r.route_ref}|${r.day_class}`;
    if (seen.has(k)) throw new Error(`duplicate city_transit_service key: ${k}`);
    seen.add(k);
  }

  const summary = {
    feed_key: FEED_KEY,
    feed_start_date: feedInfo.feed_start_date,
    feed_end_date: feedInfo.feed_end_date,
    feed_version: feedInfo.feed_version,
    week,
    stops_matched: stopCity.size,
    rows: out.length,
    seconds: Math.round((Date.now() - t0) / 1000),
  };
  console.error(JSON.stringify(summary));
  for (const cls of ['weekday', 'friday', 'saturday', 'sunday']) {
    const byMode = {};
    for (const r of out.filter((x) => x.day_class === cls)) {
      const k = r.is_night_line ? `${r.mode}(night)` : r.mode;
      if (!byMode[k] || r.last_departure_s > byMode[k]) byMode[k] = r.last_departure_s;
    }
    console.error(
      cls,
      Object.fromEntries(Object.entries(byMode).map(([k, v]) => [k, formatServiceSeconds(v)])),
    );
  }
  // Zero rows for a declared city is a broken derivation (renamed stops, bad bbox), not "no service".
  const empty = CITIES.filter((c) => !out.some((r) => r.city_id === c.city_id)).map((c) => c.slug);
  const feed = {
    ...FEED_META,
    feed_version: feedInfo.feed_version,
    feed_start_date: isoDate(feedInfo.feed_start_date),
    feed_end_date: isoDate(feedInfo.feed_end_date),
    stop_count: stopCity.size,
    parse_status: empty.length ? 'no_stops' : 'ok',
    parse_note: empty.length ? `no rows for: ${empty.join(', ')}` : `week ${week[0]}..${week[7]}`,
  };
  const json = JSON.stringify({ summary, feed, rows: out });
  if (outPath) writeFileSync(outPath, json);
  else if (!commit) process.stdout.write(json);
  if (commit) await commitToSupabase(feed, empty.length ? [] : out);
  if (empty.length) throw new Error(`no rows derived for ${empty.join(', ')}`);
}

main().catch(async (e) => {
  console.error(e);
  if (commit && process.env.SUPABASE_URL) {
    // Record the failure so the sentinel sees it; rows are untouched by a non-ok status.
    await commitToSupabase(
      { ...FEED_META, parse_status: 'unparseable', parse_note: String(e).slice(0, 300) },
      [],
    ).catch(() => {});
  }
  process.exit(1);
});
