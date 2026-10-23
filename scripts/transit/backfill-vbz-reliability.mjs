#!/usr/bin/env node
/**
 * One-shot: late-evening punctuality per VBZ line from the 2023 SOLL-IST files
 * (Stadt Zürich OGD, CC0) -> city_transit_service.on_time_share for Zürich.
 *
 *   node scripts/transit/backfill-vbz-reliability.mjs [--dry-run] [--weeks N]
 *
 * Streams each weekly CSV (~260 MB) over HTTP; nothing is written to disk.
 * Only updates rows that already exist (lines present in the CURRENT timetable),
 * so a line renumbered in VBZ's Dec-2025 network change gets no stale figure.
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY unless --dry-run.
 */
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { parseCsvLine } from './lib/gtfs-night.mjs';
import { createReliabilityAccumulator } from './lib/vbz-reliability.mjs';

const DATASET = 'vbz_fahrzeiten_ogd_2023';
const PERIOD = '2023 (Jan–Jul)';
const CITY_ID = '35d1d772-8ce7-4c05-92a5-95ea7053b4bf';
const FEED_KEY = 'ch-opentransportdata-gtfs';

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const maxWeeks = args.includes('--weeks') ? Number(args[args.indexOf('--weeks') + 1]) : Infinity;

async function main() {
  const meta = await (
    await fetch(`https://data.stadt-zuerich.ch/api/3/action/package_show?id=${DATASET}`)
  ).json();
  const files = meta.result.resources
    .filter((r) => /^Fahrzeiten_SOLL_IST_/i.test(r.name))
    .slice(0, maxWeeks);
  if (!files.length) throw new Error('no SOLL-IST files found in ' + DATASET);
  const acc = createReliabilityAccumulator();
  for (const f of files) {
    const res = await fetch(f.url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`${f.name}: HTTP ${res.status}`);
    const rl = createInterface({ input: Readable.fromWeb(res.body), crlfDelay: Infinity });
    let header = null;
    let n = 0;
    for await (const raw of rl) {
      const fields = parseCsvLine(raw.replace(/^﻿/, ''));
      if (!header) {
        header = fields;
        continue;
      }
      const o = {};
      for (let i = 0; i < header.length; i++) o[header[i]] = fields[i];
      acc.add(o);
      n++;
    }
    console.error(`${f.name}: ${n} rows`);
  }
  const results = acc.result();
  console.error(`${results.length} (line, day_class) figures`);
  if (dry) {
    console.log(JSON.stringify(results, null, 1));
    return;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error('needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or --dry-run)');
  let matched = 0;
  for (const r of results) {
    const q = new URLSearchParams({
      city_id: `eq.${CITY_ID}`,
      feed_key: `eq.${FEED_KEY}`,
      mode: 'in.(tram,bus)',
      route_ref: `eq.${r.route_ref}`,
      day_class: `eq.${r.day_class}`,
    });
    const res = await fetch(`${url}/rest/v1/city_transit_service?${q}`, {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ on_time_share: r.on_time_share, reliability_period: PERIOD }),
    });
    if (!res.ok)
      throw new Error(
        `PATCH ${r.route_ref}/${r.day_class}: HTTP ${res.status} ${await res.text()}`,
      );
    matched += (await res.json()).length;
  }
  console.error(`updated ${matched} rows (lines absent from the current timetable are skipped)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
