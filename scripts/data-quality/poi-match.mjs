#!/usr/bin/env node
// P3 POI join — match venues against bulk map extracts, persist the identity,
// fill the blanks. Reduced scope, per docs/audits/2026-09-04-poi-match-rate-measurement.md.
//
// WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT
//
// Does: exact -> de-spaced -> core-token name equality inside 250 m, two
// same-named candidates BLOCK, the OSM/Overture element id is written into
// `venue_sources` so every later refresh is an id lookup instead of a fresh
// name guess, and `hours` / `phone` / `website` are filled ONLY where ours is
// empty, with a before-image in `external_correction_audit`.
//
// Does not: token-subset matching, any radius beyond 250 m, `category` (the
// Overture one-shot in overture-category-match.md already owns that), and it
// never writes `accessibility_attributes` — those go to `entity_review_queue`.
// Each omission is a measured decision; see the REJECTED block in
// lib/poi-match-core.mjs before adding any of them back.
//
// DRY RUN IS THE DEFAULT. The plan requires a committed diff artifact before a
// first bulk apply, so `--apply` is opt-in and everything else writes nothing.
//
// Usage:
//   node scripts/data-quality/poi-match.mjs --country DE \
//        --extract osm=osm-de.jsonl --extract overture=ov-de.jsonl [--apply]
//
// Extract format (JSON Lines, one POI per line):
//   {"ext_id":"node/123","name":"Möbel Olfe","variants":["mobel olfe"],
//    "lat":52.5,"lon":13.4,"hours":"Tu-Su 18:00+","phone":"+49...",
//    "website":"https://...","access":["wheelchair-accessible"]}

import { randomUUID } from 'node:crypto';
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

import { normalizeName, resolveVenue, venueKeys, DEFAULT_RADIUS_M } from './lib/poi-match-core.mjs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const READ_KEY = ANON_KEY || SERVICE_KEY;

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? true);
};
const flagAll = (name) =>
  args.reduce((acc, a, i) => (a === `--${name}` && args[i + 1] ? [...acc, args[i + 1]] : acc), []);

const APPLY = args.includes('--apply');
const COUNTRY = String(flag('country', 'DE')).toUpperCase();
const RADIUS_M = Number(flag('radius', DEFAULT_RADIUS_M));
const OUT = flag('out', `poi-match-${COUNTRY.toLowerCase()}.json`);
// 300 mirrors every other venue writer in this repo: a venue UPDATE fans out
// into search_reindex_queue per row. Do not raise it without measuring.
const WRITE_BATCH = 300;

if (!SUPABASE_URL || !READ_KEY) {
  console.error('Need SUPABASE_URL plus VITE_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (APPLY && !SERVICE_KEY) {
  console.error('--apply needs SUPABASE_SERVICE_ROLE_KEY (writes go through PostgREST as service_role).');
  process.exit(1);
}

const rest = async (path, init = {}) => {
  const key = init.write ? SERVICE_KEY : READ_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
};

/** Venues eligible to be matched at all. */
async function loadVenues() {
  const [country] = await rest(`countries?code=eq.${COUNTRY}&select=id`);
  if (!country) throw new Error(`no country row for ${COUNTRY}`);
  const cols =
    'id,name,city,latitude,longitude,hours,phone,website,accessibility_attributes,review_status,enrichment_status';
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await rest(
      `venues?country_id=eq.${country.id}&latitude=not.is.null&duplicate_of_id=is.null` +
        `&select=${cols}&order=id&offset=${offset}&limit=1000`,
    );
    out.push(...page);
    if (page.length < 1000) break;
  }
  // Trap 4 of overture-category-match.md: archived rows and confirmed
  // non-venues still carry coordinates and a name, so they arrive here looking
  // like ordinary candidates. Enriching them re-animates rows the corpus has
  // already decided are not places.
  return out
    .filter(
      (v) =>
        v.review_status !== 'archived' &&
        (v.enrichment_status?.nonvenue_candidate?.status ?? '') !== 'confirmed',
    )
    // PostgREST returns `latitude`/`longitude` as strings; the matcher works in
    // `lat`/`lon` numbers. Mapping at the boundary rather than in the matcher
    // keeps the pure module free of this API's shape.
    .map((v) => ({ ...v, lat: Number(v.latitude), lon: Number(v.longitude) }));
}

/**
 * `variants` arrive as the source publishes them (name, name:en, alt_name, …)
 * and are normalised HERE, once, rather than in the extract or per comparison.
 *
 * This is load-bearing, not tidying: tier 1 tests `variants.includes(venue.nn)`
 * where `nn` is normalizeName output, so a raw `"papa-pizza"` can never equal
 * `"papa pizza"` and every hyphenated or punctuated name in the corpus would
 * silently fall through to a weaker tier or to no match at all.
 */
async function loadExtract(path, wantedCells) {
  const rows = [];
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let seen = 0;
  let malformed = 0;
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    seen++;
    let p;
    try {
      p = JSON.parse(t);
    } catch {
      // A bulk third-party extract contains malformed rows: 12 of Germany's
      // 1,462,428 OSM lines carry a raw newline inside `name` and split in two.
      // Dying on those wastes a whole run; skipping them SILENTLY is worse,
      // because a systematically broken extract then reads as a low match rate
      // rather than as a broken extract. So: tolerate a trickle, count it, and
      // refuse anything above the threshold below.
      malformed++;
      continue;
    }
    // Drop POIs no venue could ever reach BEFORE building any object graph.
    // A country extract is millions of rows and the venue set is thousands, so
    // holding the whole extract in memory is the difference between ~200 MB and
    // an out-of-memory kill. Same shape as the local cell-key hash join in
    // overture-category-match.md, which took its scan from ~8 h to 15 min.
    if (!wantedCells.has(cellKey(p.lat, p.lon))) continue;
    const vs = new Set([normalizeName(p.name), ...(p.variants || []).map(normalizeName)]);
    vs.delete('');
    p.variants = [...vs];
    rows.push(p);
  }
  // 0.1% is far above the 0.0008% measured on the German OSM extract and far
  // below anything that could be called "the file is fine".
  const rate = seen ? malformed / seen : 0;
  if (rate > 0.001) {
    throw new Error(
      `${path}: ${malformed} of ${seen} lines are unparseable (${(rate * 100).toFixed(2)}%). ` +
        'That is an extract problem, not a data problem — fix the export rather than matching against a partial file.',
    );
  }
  return { rows, seen, malformed };
}

/** 0.01° cells (~1.1 km lat) so a 250 m radius is always inside the 3x3 block. */
const CELL = 0.01;
const cellKey = (lat, lon) => `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`;
function indexByCell(pois) {
  const ix = new Map();
  for (const p of pois) {
    const k = cellKey(p.lat, p.lon);
    const bucket = ix.get(k);
    if (bucket) bucket.push(p);
    else ix.set(k, [p]);
  }
  return ix;
}
function nearby(ix, lat, lon) {
  const out = [];
  const gy = Math.floor(lat / CELL);
  const gx = Math.floor(lon / CELL);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const b = ix.get(`${gy + dy}:${gx + dx}`);
      if (b) out.push(...b);
    }
  return out;
}

const isBlank = (x) => x === null || x === undefined || String(x).trim() === '';

/**
 * The fields this script can write into `external_correction_audit`, declared
 * in the literal shape that src/lib/__tests__/correctionFieldsRegistered.test.ts
 * scans for.
 *
 * That test is the bridge between what a script WRITES and what
 * `review_field_registry` maps, and it reads source text — a loop over a
 * variable is invisible to it. Written as a variable, an unregistered field
 * here would sail past the guard and `rollback_external_correction_batch` would
 * then refuse the WHOLE batch at the moment someone needed to revert it. The
 * fill loop is driven from this same list so the declaration cannot drift from
 * the behaviour.
 *
 * `accessibility_attributes` is deliberately NOT here: it is never written to
 * `venues` by this script, only proposed into `entity_review_queue`.
 */
const AUDITED_FIELDS = [
  { entity_type: 'venue', field: 'hours' },
  { entity_type: 'venue', field: 'phone' },
  { entity_type: 'venue', field: 'website' },
];

async function main() {
  const extracts = flagAll('extract').map((spec) => {
    const i = spec.indexOf('=');
    if (i === -1) throw new Error(`--extract wants slug=path, got "${spec}"`);
    return { slug: spec.slice(0, i), path: spec.slice(i + 1) };
  });
  if (extracts.length === 0) {
    console.error('Need at least one --extract <slug>=<path.jsonl>.');
    process.exit(1);
  }

  const venues = (await loadVenues()).map(venueKeys);
  console.error(`${COUNTRY}: ${venues.length} matchable venues`);

  // Every cell a venue can reach: its own plus the 3x3 ring, so the 250 m
  // radius is always fully inside the retained set.
  const wantedCells = new Set();
  for (const v of venues) {
    const gy = Math.floor(v.lat / CELL);
    const gx = Math.floor(v.lon / CELL);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) wantedCells.add(`${gy + dy}:${gx + dx}`);
  }

  const perSource = new Map();
  const extractStats = {};
  for (const e of extracts) {
    const { rows, seen, malformed } = await loadExtract(e.path, wantedCells);
    perSource.set(e.slug, indexByCell(rows));
    extractStats[e.slug] = { seen, kept: rows.length, malformed };
    console.error(
      `  ${e.slug}: ${rows.length} POIs near a venue (of ${seen} in the extract` +
        `${malformed ? `, ${malformed} unparseable lines skipped` : ''})`,
    );
  }

  const batchId = randomUUID();
  const identities = []; // venue_sources rows
  const corrections = []; // field fills + their before-images
  const reviews = []; // accessibility proposals
  // matched + blocked + skipped + no_match == venues, by construction.
  const tally = {
    matched: 0, blocked: 0, skipped: 0, no_match: 0,
    matched_by_both: 0, blocked_in_one_source: 0, conflicts: 0,
  };

  for (const v of venues) {
    // One verdict PER VENUE, not per source: a venue is skipped once, blocked
    // once, matched once. Counting per source double-counts every skip (there
    // are two sources) and lets `skipped` overlap `no_match`, so the buckets
    // stop summing to the population and every rate quoted off them is wrong.
    const hits = new Map();
    let anyBlocked = false;
    let anySkipped = false;
    for (const [slug, ix] of perSource) {
      const r = resolveVenue(v, nearby(ix, v.lat, v.lon), { radiusM: RADIUS_M });
      if (r.verdict === 'match') hits.set(slug, r);
      else if (r.verdict === 'blocked') anyBlocked = true;
      else if (r.verdict === 'skipped') anySkipped = true;
    }
    if (hits.size === 0) {
      if (anySkipped) tally.skipped++;
      else if (anyBlocked) tally.blocked++;
      else tally.no_match++;
      continue;
    }
    tally.matched++;
    if (anyBlocked) tally.blocked_in_one_source++;
    if (hits.size > 1) tally.matched_by_both++;

    for (const [slug, r] of hits) {
      identities.push({
        venue_id: v.id,
        source_slug: slug,
        source_entity_id: r.match.ext_id,
        confidence: r.tier === 1 ? 0.95 : r.tier === 2 ? 0.9 : 0.85,
      });
    }

    // Fill only what is blank on our side. "One source filling a blank is fine;
    // one source OVERRIDING another requires corroboration" — so we never
    // overwrite, and when the two sources disagree about a blank we take
    // neither and record the disagreement.
    for (const { field } of AUDITED_FIELDS) {
      if (!isBlank(v[field])) continue;
      const offered = [...hits.entries()]
        .map(([slug, r]) => ({ slug, value: r.match[field], ext_id: r.match.ext_id }))
        .filter((o) => !isBlank(o.value));
      if (offered.length === 0) continue;
      const distinct = new Set(offered.map((o) => String(o.value).trim()));
      if (distinct.size > 1) { tally.conflicts++; continue; }
      const pick = offered[0];
      corrections.push({
        batch_id: batchId,
        entity_type: 'venue',
        entity_id: v.id,
        field,
        before_value: null, // SQL NULL -> jsonb 'null', see the audit's contract
        after_value: String(pick.value).trim(),
        source: pick.slug,
        external_id: pick.ext_id,
        confidence: offered.length > 1 ? 0.95 : 0.8,
        actor: 'script:poi-match',
      });
    }

    // Accessibility NEVER auto-applies. A wrong access claim is real-world harm
    // and the errors are not symmetric, so every finding is a proposal.
    const access = [...new Set([...hits.values()].flatMap((r) => r.match.access || []))].sort();
    const have = new Set(v.accessibility_attributes || []);
    const fresh = access.filter((a) => !have.has(a));
    if (fresh.length) {
      reviews.push({
        entity_type: 'venue',
        entity_id: v.id,
        field: 'accessibility_attributes',
        proposed_value: { value: fresh },
        citations: [...hits.entries()].map(([slug, r]) => ({ source: slug, external_id: r.match.ext_id })),
      });
    }
  }

  const bucketed = tally.matched + tally.blocked + tally.skipped + tally.no_match;
  if (bucketed !== venues.length) {
    throw new Error(`verdict buckets sum to ${bucketed}, expected ${venues.length} — the tally is wrong, so every rate derived from it is too`);
  }

  const summary = {
    country: COUNTRY, batch_id: batchId, radius_m: RADIUS_M, extracts: extractStats,
    venues: venues.length, ...tally,
    match_rate: `${((tally.matched / venues.length) * 100).toFixed(1)}%`,
    identities: identities.length,
    corrections_by_field: corrections.reduce((a, c) => ({ ...a, [c.field]: (a[c.field] || 0) + 1 }), {}),
    accessibility_reviews: reviews.length,
  };
  console.error(JSON.stringify(summary, null, 2));

  writeFileSync(OUT, JSON.stringify({ summary, identities, corrections, reviews }, null, 2));
  console.error(`artifact -> ${OUT}`);

  if (!APPLY) {
    console.error('DRY RUN — nothing written. Re-run with --apply once the artifact is reviewed.');
    return;
  }

  // Audit BEFORE the write, so a crash mid-run leaves a revertible record of
  // what was attempted rather than an unexplained diff.
  for (let i = 0; i < corrections.length; i += WRITE_BATCH) {
    await rest('external_correction_audit', {
      method: 'POST', write: true,
      body: JSON.stringify(corrections.slice(i, i + WRITE_BATCH)),
    });
  }
  for (let i = 0; i < identities.length; i += WRITE_BATCH) {
    await rest('venue_sources?on_conflict=source_slug,source_entity_id', {
      method: 'POST', write: true,
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(identities.slice(i, i + WRITE_BATCH)),
    });
  }
  for (const c of corrections) {
    await rest(`venues?id=eq.${c.entity_id}&${c.field}=is.null`, {
      method: 'PATCH', write: true,
      body: JSON.stringify({ [c.field]: c.after_value }),
    });
  }
  for (let i = 0; i < reviews.length; i += WRITE_BATCH) {
    await rest('entity_review_queue', {
      method: 'POST', write: true,
      headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify(reviews.slice(i, i + WRITE_BATCH)),
    });
  }
  console.error(`applied. revert with: select rollback_external_correction_batch('${batchId}');`);
}

main().catch((e) => { console.error(e); process.exit(1); });
