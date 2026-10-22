#!/usr/bin/env node
/**
 * Derive city_transit_service rows ("last departure tonight") from a GTFS zip.
 *
 *   node scripts/transit/build-city-service.mjs <gtfs.zip> [--out rows.json] [--today yyyymmdd] [--commit]
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
  mapMode,
  parseCsvLine,
  pickServiceWeek,
} from './lib/gtfs-night.mjs';

export const FEED_KEY = 'ch-opentransportdata-gtfs';
export const CITIES = [
  {
    slug: 'zuerich',
    city_id: '35d1d772-8ce7-4c05-92a5-95ea7053b4bf',
    namePrefix: /^Zürich(,| |$)/,
    excludeName: /^Zürich Flughafen/,
    bbox: [47.32, 8.448, 47.435, 8.625],
  },
];

const args = process.argv.slice(2);
const zip = args[0];
const outPath = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const todayArg = args.includes('--today') ? args[args.indexOf('--today') + 1] : null;
const commit = args.includes('--commit');

export const FEED_META = {
  feed_key: FEED_KEY,
  provider: 'SBB / opentransportdata.swiss',
  country_code: 'CH',
  source_url: 'https://data.opentransportdata.swiss/en/dataset/?q=gtfs2020',
  licence: 'opentransportdata.swiss terms of use (open data, attribution required)',
  attribution: 'Timetable: opentransportdata.swiss',
};

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
  let feedInfo;
  for await (const r of rows('feed_info.txt')) feedInfo = r;
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
      const [a, b, cc, d] = c.bbox;
      if (
        c.namePrefix.test(s.stop_name) &&
        !c.excludeName?.test(s.stop_name) &&
        lat >= a &&
        lat <= cc &&
        lon >= b &&
        lon <= d
      )
        stopCity.set(s.stop_id, i);
    });
  }

  const routes = new Map(); // route_id -> {mode, night, ref}
  for await (const r of rows('routes.txt')) {
    const m = mapMode(r.route_type, r.route_desc);
    if (m) routes.set(r.route_id, { ...m, ref: r.route_short_name || r.route_long_name });
  }

  const calendar = [];
  for await (const c of rows('calendar.txt')) calendar.push(c);
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

  const out = [];
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
