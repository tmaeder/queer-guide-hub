#!/usr/bin/env node
/**
 * Fill cities.climate_type from the Köppen-Geiger raster.
 *
 * `climate_type` is empty on 4,985 of 5,489 live cities (98%) — the single
 * largest gap on the entity. Nothing has ever written it at scale: the 95 rows
 * that do carry a value came from Wikidata P2564 via city-factual-backfill, and
 * that path only fires for cities that already have a resolved QID.
 *
 * SOURCE: Beck et al. (2023), "High-resolution (1 km) Köppen-Geiger maps for
 * 1901–2099 based on constrained CMIP6 projections", Scientific Data 10, 724.
 * CC BY 4.0 — commercial use permitted with citation. We use the PRESENT-DAY
 * period (1991-2020), never a projection: a city page states what the climate
 * IS, and the same archive ships 2041-2070 and 2071-2099 scenarios that would
 * silently look identical in the output.
 *
 * A raster lookup by coordinate has no identity resolution in it at all, which
 * is what puts this in the zero-risk tier alongside the timezone job.
 *
 * THE COLUMN STORES PROSE, NOT KÖPPEN CODES
 * The 95 existing values read "oceanic climate", "hot-summer Mediterranean
 * climate", "humid subtropical climate" — the Wikidata English labels. So the
 * raster's numeric class is mapped to that same vocabulary rather than emitting
 * "Cfb", which would be correct and useless on a city page and would fork the
 * column into two formats. The Köppen code is kept in the audit row so the
 * derivation stays checkable.
 *
 * USAGE
 *   node scripts/data-quality/backfill-city-climate.mjs --probe
 *   node scripts/data-quality/backfill-city-climate.mjs            # validate
 *   node scripts/data-quality/backfill-city-climate.mjs --fill --dry-run
 *   node scripts/data-quality/backfill-city-climate.mjs --fill --apply
 *
 * The raster is ~12 MB and is NOT committed. Point at it with --tif or
 * KOPPEN_TIF, or let the script fetch it into scripts/.cache/.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromFile } from 'geotiff';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? true);
};
const PROBE = args.includes('--probe');
const MODE_FILL = args.includes('--fill');
const APPLY = args.includes('--apply');
const LIMIT = Number(flag('limit', 100000));
const OUT = flag('out', null);
const CACHE = join(process.cwd(), 'scripts', '.cache');
const TIF = flag('tif', process.env.KOPPEN_TIF || join(CACHE, 'koppen_1991_2020_1km.tif'));

const WRITE_BATCH = 300;
const PAGE = 1000;

/**
 * Raster value -> Köppen code + the English label this column already uses.
 * Legend from the archive's own legend.txt; labels follow the Wikidata P2564
 * English names, which is what the 95 pre-existing rows are spelled as.
 */
const KOPPEN = {
  1:  ['Af',  'tropical rainforest climate'],
  2:  ['Am',  'tropical monsoon climate'],
  3:  ['Aw',  'tropical savanna climate'],
  4:  ['BWh', 'hot desert climate'],
  5:  ['BWk', 'cold desert climate'],
  6:  ['BSh', 'hot semi-arid climate'],
  7:  ['BSk', 'cold semi-arid climate'],
  8:  ['Csa', 'hot-summer Mediterranean climate'],
  9:  ['Csb', 'warm-summer Mediterranean climate'],
  10: ['Csc', 'cold-summer Mediterranean climate'],
  11: ['Cwa', 'monsoon-influenced humid subtropical climate'],
  12: ['Cwb', 'subtropical highland climate'],
  13: ['Cwc', 'cold subtropical highland climate'],
  14: ['Cfa', 'humid subtropical climate'],
  15: ['Cfb', 'oceanic climate'],
  16: ['Cfc', 'subpolar oceanic climate'],
  17: ['Dsa', 'hot-summer Mediterranean continental climate'],
  18: ['Dsb', 'warm-summer Mediterranean continental climate'],
  19: ['Dsc', 'Mediterranean-influenced subarctic climate'],
  20: ['Dsd', 'Mediterranean-influenced extremely cold subarctic climate'],
  21: ['Dwa', 'monsoon-influenced hot-summer humid continental climate'],
  22: ['Dwb', 'monsoon-influenced warm-summer humid continental climate'],
  23: ['Dwc', 'monsoon-influenced subarctic climate'],
  24: ['Dwd', 'monsoon-influenced extremely cold subarctic climate'],
  25: ['Dfa', 'hot-summer humid continental climate'],
  26: ['Dfb', 'warm-summer humid continental climate'],
  27: ['Dfc', 'subarctic climate'],
  28: ['Dfd', 'extremely cold subarctic climate'],
  29: ['ET',  'tundra climate'],
  30: ['EF',  'ice cap climate'],
};

// Figshare article 21789074, file koppen_geiger_tif.zip. Resolved at runtime so
// a changed file id does not silently 404 into an empty raster.
const FIGSHARE_ARTICLE = '21789074';

async function ensureRaster() {
  if (existsSync(TIF)) return TIF;
  console.log(`raster not found at ${TIF} — fetching from figshare…`);
  mkdirSync(CACHE, { recursive: true });
  const meta = await fetch(`https://api.figshare.com/v2/articles/${FIGSHARE_ARTICLE}/files`);
  if (!meta.ok) throw new Error(`figshare metadata ${meta.status}`);
  const files = await meta.json();
  const zip = files.find((f) => f.name === 'koppen_geiger_tif.zip');
  if (!zip) throw new Error('koppen_geiger_tif.zip not present in the figshare article');
  throw new Error(
    `Download ${zip.download_url} (${(zip.size / 1048576).toFixed(0)} MB), then:\n` +
      `  unzip -j <zip> "1991_2020/koppen_geiger_0p00833333.tif" -d ${CACHE}\n` +
      `  mv ${CACHE}/koppen_geiger_0p00833333.tif ${TIF}\n` +
      `Kept manual: the archive is 125 MB and holds six periods plus seven SSP ` +
      `scenarios, and picking the wrong one is invisible in the output.`,
  );
}

async function openRaster() {
  const path = await ensureRaster();
  const tiff = await fromFile(path);
  const img = await tiff.getImage();
  const [minX, , , maxY] = img.getBoundingBox();
  const [rx, ryRaw] = img.getResolution();
  // GeoTIFF reports a negative Y resolution for a north-up image. Using it
  // unsigned flips the hemisphere and every lookup silently returns the wrong
  // latitude's climate.
  const ry = Math.abs(ryRaw);
  const w = img.getWidth();
  const h = img.getHeight();

  return {
    async classify(lat, lon) {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      if (lat === 0 && lon === 0) return null; // Null Island — a failed geocode
      const px = Math.floor((lon - minX) / rx);
      const py = Math.floor((maxY - lat) / ry);
      if (px < 0 || py < 0 || px >= w || py >= h) return null;
      const r = await img.readRasters({ window: [px, py, px + 1, py + 1] });
      const v = r[0][0];
      // 0 is the archive's ocean / no-data value. A coastal city centroid can
      // land on it; that is "unknown", never a class.
      return KOPPEN[v] ? { value: v, code: KOPPEN[v][0], label: KOPPEN[v][1] } : null;
    },
    meta: { w, h, minX, maxY, rx, ry },
  };
}

// ---------------------------------------------------------------------------
const anonHeaders = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };
const svcHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};
const BASE_FILTERS =
  'duplicate_of_id=is.null&latitude=not.is.null&longitude=not.is.null&slug=not.like.tmp-*';

async function loadAll(select, filters) {
  const rows = [];
  for (let offset = 0; offset < LIMIT; offset += PAGE) {
    const take = Math.min(PAGE, LIMIT - offset);
    const url =
      `${SUPABASE_URL}/rest/v1/cities?select=${select}&${filters}` +
      `&order=id.asc&limit=${take}&offset=${offset}`;
    const res = await fetch(url, { headers: anonHeaders });
    if (!res.ok) throw new Error(`load cities ${res.status}: ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < take) break;
  }
  return rows;
}

/** Loose comparison — the stored vocabulary is uncontrolled free text. */
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\bclimate\b/g, '')
    .replace(/[^a-z]+/g, ' ')
    .trim();

/**
 * The stored vocabulary is uncontrolled AND mixes granularities: "Mediterranean
 * climate" (Cs) sits beside "hot-summer Mediterranean climate" (Csa), and
 * "tropical climate" (A) beside "tropical savanna climate" (Aw). Comparing
 * labels for equality therefore counts a CORRECT-but-coarser stored value as a
 * disagreement — measured, that alone dropped apparent agreement to 57%.
 *
 * So a stored label is resolved to the Köppen PREFIX it actually asserts, and
 * the computed code only has to be consistent with it. That separates "less
 * specific" from "wrong", and only the latter is worth a human's attention.
 * Longest patterns first — "hot desert" must win over "desert".
 */
const STORED_TO_PREFIX = [
  ['tropical rainforest', 'Af'], ['tropical monsoon', 'Am'], ['tropical savanna', 'Aw'],
  ['hot desert', 'BWh'], ['cold desert', 'BWk'], ['desert', 'BW'],
  ['hot semi arid', 'BSh'], ['cold semi arid', 'BSk'], ['semi arid', 'BS'], ['steppe', 'BS'],
  ['hot summer mediterranean continental', 'Dsa'],
  ['warm summer mediterranean continental', 'Dsb'],
  ['hot summer mediterranean', 'Csa'], ['warm summer mediterranean', 'Csb'],
  ['cold summer mediterranean', 'Csc'], ['mediterranean', 'Cs'],
  ['monsoon influenced humid subtropical', 'Cwa'],
  ['humid subtropical', 'Cfa'],
  ['subpolar oceanic', 'Cfc'], ['marine west coast', 'Cfb'], ['oceanic', 'Cfb'],
  ['cold subtropical highland', 'Cwc'], ['subtropical highland', 'Cwb'],
  ['monsoon influenced hot summer humid continental', 'Dwa'],
  ['monsoon influenced warm summer humid continental', 'Dwb'],
  ['hot summer humid continental', 'Dfa'], ['warm summer humid continental', 'Dfb'],
  ['dry winter continental', 'Dw'],
  ['continental subarctic', 'Dfc'], ['subarctic', 'Dfc'],
  ['humid continental', 'D'], ['wet continental', 'D'],
  ['temperate continental', 'D'], ['continental', 'D'],
  ['tundra', 'ET'], ['ice cap', 'EF'], ['polar', 'E'],
  ['tropical', 'A'],
];

function storedPrefix(stored) {
  const n = norm(stored);
  let best = null;
  for (const [pat, code] of STORED_TO_PREFIX) {
    if (n.includes(pat) && (!best || pat.length > best[0].length)) best = [pat, code];
  }
  return best?.[1] ?? null;
}

async function probe(raster) {
  console.log('raster', raster.meta);
  const cases = [
    ['Berlin', 52.52, 13.405, 'Cfb'],
    ['Rome', 41.9028, 12.4964, 'Csa'],
    ['Singapore', 1.3521, 103.8198, 'Af'],
    ['Cairo', 30.0444, 31.2357, 'BWh'],
    ['Reykjavik', 64.1466, -21.9426, 'Cfc'],
    ['Moscow', 55.7558, 37.6173, 'Dfb'],
    ['Sydney', -33.8688, 151.2093, 'Cfa'],
    ['Nuuk', 64.1836, -51.7214, 'ET'],
  ];
  let ok = 0;
  for (const [name, lat, lon, want] of cases) {
    const got = await raster.classify(lat, lon);
    const hit = got?.code === want;
    if (hit) ok++;
    console.log(
      `  ${hit ? 'ok  ' : 'MISS'} ${name.padEnd(11)} got ${String(got?.code ?? '-').padEnd(4)} want ${want}`,
    );
  }
  console.log(`\nprobe ${ok}/${cases.length}`);
  // A southern-hemisphere case is in the list on purpose: an unsigned Y
  // resolution flips the hemisphere and Sydney is the cheapest way to see it.
  return ok === cases.length;
}

async function validate(raster) {
  const rows = await loadAll(
    'id,name,latitude,longitude,climate_type',
    `${BASE_FILTERS}&climate_type=not.is.null`,
  );
  let exact = 0;
  let coarser = 0;
  let unmapped = 0;
  const conflict = [];
  let unresolved = 0;
  for (const c of rows) {
    const got = await raster.classify(Number(c.latitude), Number(c.longitude));
    if (!got) {
      unresolved++;
      continue;
    }
    if (norm(got.label) === norm(c.climate_type)) {
      exact++;
      continue;
    }
    const pfx = storedPrefix(c.climate_type);
    if (!pfx) {
      unmapped++;
      conflict.push({ ...c, computed: got, why: 'unmapped stored label' });
    } else if (got.code.startsWith(pfx)) {
      coarser++;
    } else {
      conflict.push({ ...c, computed: got, why: `${pfx} vs ${got.code}` });
    }
  }
  const compared = rows.length - unresolved;
  const compatible = exact + coarser;
  const pct = compared ? ((compatible / compared) * 100).toFixed(1) : '0.0';
  console.log(`\n=== validation against ${compared} cities that already have a climate_type ===`);
  console.log(`compatible            ${compatible}/${compared}  (${pct}%)`);
  console.log(`  exact label         ${exact}`);
  console.log(`  stored is coarser   ${coarser}  (correct, just less specific — never rewritten)`);
  console.log(`conflicting           ${conflict.length}`);
  if (unmapped) console.log(`  of which unmapped   ${unmapped}  (stored label not in the vocabulary)`);
  if (unresolved) console.log(`unresolved (ocean/no-data) ${unresolved}`);
  if (conflict.length) {
    console.log('\nconflicts (stored -> computed):');
    for (const c of conflict.slice(0, 60)) {
      console.log(
        `  ${c.name.padEnd(20)} ${String(c.climate_type).padEnd(38)} -> ${c.computed.label} (${c.why})`,
      );
    }
    if (conflict.length > 60) console.log(`  … and ${conflict.length - 60} more`);
  }
  return { agreementPct: Number(pct), compared, conflict };
}

async function applyChanges(changes, batchId, reason) {
  let written = 0;
  for (let i = 0; i < changes.length; i += WRITE_BATCH) {
    const chunk = changes.slice(i, i + WRITE_BATCH);
    const audit = chunk.map((c) => ({
      batch_id: batchId,
      entity_type: 'city',
      entity_id: c.id,
      field: 'climate_type',
      before_value: c.climate_type ?? null,
      after_value: c.computed.label,
      source: 'koppen-geiger-beck-2023',
      external_id: c.computed.code,
      confidence: 1.0,
      actor: 'script:backfill-city-climate',
      reason,
    }));
    const aRes = await fetch(`${SUPABASE_URL}/rest/v1/external_correction_audit`, {
      method: 'POST',
      headers: { ...svcHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify(audit),
    });
    if (!aRes.ok) throw new Error(`audit insert ${aRes.status}: ${await aRes.text()}`);

    for (const c of chunk) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/cities?id=eq.${c.id}&climate_type=is.null`,
        {
          method: 'PATCH',
          headers: { ...svcHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ climate_type: c.computed.label }),
        },
      );
      if (!res.ok) throw new Error(`update ${c.id} ${res.status}: ${await res.text()}`);
      written++;
    }
    console.log(`  wrote ${Math.min(i + WRITE_BATCH, changes.length)}/${changes.length}`);
  }
  return written;
}

(async () => {
  const raster = await openRaster();
  if (PROBE) {
    const ok = await probe(raster);
    process.exit(ok ? 0 : 1);
  }
  if (!(await probe(raster))) {
    console.error('\n✗ raster probe failed — refusing to read 5,000 cities out of a misaligned grid.');
    process.exit(1);
  }
  if (!SUPABASE_URL || !ANON_KEY) {
    console.error('Need VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    process.exit(1);
  }

  const v = await validate(raster);
  if (!MODE_FILL) {
    console.log('\n(validate-only. Re-run with --fill to propose writes.)');
    return;
  }

  // NOTE the asymmetry with backfill-city-timezone.mjs, which refuses to write
  // below a 99% agreement bar. There is deliberately no such bar here, because
  // the compatibility figure would be measuring the wrong thing: the stored
  // climate vocabulary is uncontrolled free text at mixed granularity, and the
  // 18 conflicts in the first live run were dominated by OUR OWN coordinate
  // problems (`San Luis` resolving to Argentina, `Pittsburg` carrying
  // Pittsburgh PA's climate, `Frisco` carrying San Francisco's) plus genuinely
  // borderline Köppen cases (Athens, Ankara, Toronto). None of that says
  // anything about whether the raster answers a correct coordinate correctly.
  //
  // What DOES gate the write is the probe above: eight known cities across both
  // hemispheres, and the run aborts if any miss. That tests the thing the fill
  // depends on. The conflict list is published as a duplicate/namesake signal
  // for humans, not as a threshold.
  if (v.conflict.length) {
    console.log(
      `\n(${v.conflict.length} conflicts reported above are NOT corrected by this job — ` +
        `several are same-name city collisions worth investigating on their own.)`,
    );
  }
  if (APPLY && !SERVICE_KEY) {
    console.error('--apply needs SUPABASE_SERVICE_KEY.');
    process.exit(1);
  }

  const missing = await loadAll(
    'id,name,latitude,longitude,climate_type',
    `${BASE_FILTERS}&climate_type=is.null`,
  );
  const changes = [];
  let ocean = 0;
  for (const c of missing) {
    const got = await raster.classify(Number(c.latitude), Number(c.longitude));
    if (got) changes.push({ ...c, computed: got });
    else ocean++;
  }
  console.log(`\nfill: ${changes.length} of ${missing.length} resolved (${ocean} on ocean/no-data)`);
  const byClass = {};
  for (const c of changes) byClass[c.computed.code] = (byClass[c.computed.code] ?? 0) + 1;
  console.log(
    'distribution: ' +
      Object.entries(byClass)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([k, n]) => `${k}=${n}`)
        .join(' '),
  );

  if (APPLY) {
    const batchId = randomUUID();
    const n = await applyChanges(changes, batchId, 'fill empty climate_type from Köppen-Geiger 1991-2020');
    console.log(`\napplied ${n} under batch ${batchId}`);
    console.log(`revert:  select rollback_external_correction_batch('${batchId}');`);
  } else {
    console.log('\n(dry run — nothing written. Add --apply to write.)');
    if (OUT) {
      writeFileSync(
        OUT,
        changes
          .map(
            (c) =>
              `-- ${c.name}: ${c.computed.code}\n` +
              `update public.cities set climate_type = '${c.computed.label.replace(/'/g, "''")}' where id = '${c.id}';`,
          )
          .join('\n'),
      );
      console.log(`SQL written to ${OUT}`);
    }
  }
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
