#!/usr/bin/env node
// Build signed offline city packs.
//
//   PACK_SIGNING_KEY=<hex> node scripts/packs/build.mjs --cities berlin,zuerich [--out dist/packs]
//
// Writes <out>/<slug>.json per city and a signed <out>/index.json. Upload the
// directory as-is to the host behind EXPO_PUBLIC_PACK_BASE_URL — packs FIRST,
// index.json LAST, so the index never names a file that is not there yet.
// Pack files are named by city, not by digest, so a rebuild overwrites them:
// every file needs a short cache lifetime, or a cached old pack would fail the
// sha256 in a fresh index. scripts/packs/verify-remote.mjs checks the result.
//
// Reads with the PUBLISHABLE key, exactly as an anonymous visitor would.
// That is the safety property: RLS keeps safety-gated venues (criminalising
// countries) out of anonymous reads, so they can never end up in a file a
// stranger can download. A service-role key is refused outright.
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const FORMAT = 1;
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
const KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';

// Same columns the app reads (src/api/venues.ts VENUE_DETAIL_COLUMNS) minus images.
const VENUE_COLUMNS =
  'id,slug,name,category,latitude,longitude,city,country,address,description,website,phone,instagram,tags,accessibility_attributes';

export function keyRole(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).role ?? null;
  } catch {
    return null;
  }
}

async function rest(path, params) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

async function resolveCity(slug) {
  let [city] = await rest('cities', { slug: `eq.${slug}`, select: 'id,slug,name,country_id,duplicate_of_id' });
  if (!city) throw new Error(`No city with slug ${slug}`);
  // Merged-away rows (e.g. the Kansas "zurich") point at their survivor.
  for (let hops = 0; city.duplicate_of_id && hops < 5; hops++) {
    const next = city.duplicate_of_id;
    [city] = await rest('cities', { id: `eq.${next}`, select: 'id,slug,name,country_id,duplicate_of_id' });
    console.warn(`  ${slug} is merged into ${city.slug}; building that instead`);
  }
  const [country] = await rest('countries', { id: `eq.${city.country_id}`, select: 'code' });
  if (!country?.code) throw new Error(`City ${city.slug} has no country code`);
  return { ...city, country: country.code.toUpperCase() };
}

async function venuesFor(cityId) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/venues`);
    // The public predicate, identical to the app's publicVenues().
    for (const [k, v] of Object.entries({
      select: VENUE_COLUMNS,
      city_id: `eq.${cityId}`,
      data_source: 'neq.refuge-restrooms',
      review_status: 'neq.archived',
      duplicate_of_id: 'is.null',
      closed_at: 'is.null',
      order: 'id',
    }))
      url.searchParams.set(k, v);
    const res = await fetch(url, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`venues: HTTP ${res.status}`);
    const page = await res.json();
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

async function hotlines() {
  const [page] = await rest('cms_pages', { slug: 'eq.help', workflow_state: 'eq.published', select: 'body_json' });
  const list = page?.body_json?.hotlines;
  if (!Array.isArray(list) || list.length === 0) {
    // A pack without crisis lines is worse than no pack: refuse to build.
    throw new Error('The help page has no hotlines; refusing to build packs without them');
  }
  return list;
}

export function signIndex(index, secretHex) {
  const payload = JSON.stringify(index);
  const sig = bytesToHex(ed25519.sign(utf8ToBytes(payload), hexToBytes(secretHex)));
  return JSON.stringify({ payload, sig });
}

async function main() {
  const { values } = parseArgs({
    options: {
      cities: { type: 'string' },
      'cities-file': { type: 'string' },
      out: { type: 'string', default: 'dist/packs' },
    },
  });
  const fromFile = values['cities-file']
    ? (await readFile(values['cities-file'], 'utf8')).split('\n').map((l) => l.replace(/#.*/, ''))
    : [];
  const slugs = [...(values.cities ?? '').split(','), ...fromFile].map((s) => s.trim()).filter(Boolean);
  if (!slugs.length) throw new Error('Pass --cities slug1,slug2 or --cities-file path');
  if (new Set(slugs).size !== slugs.length) throw new Error('A city is listed twice');
  if (keyRole(KEY) !== 'anon') throw new Error('Packs must be built with the publishable (anon) key');
  const secret = process.env.PACK_SIGNING_KEY;
  if (!secret || !/^[0-9a-f]{64}$/i.test(secret)) throw new Error('PACK_SIGNING_KEY (64 hex chars) is required');

  const allHotlines = await hotlines();
  const generated_at = new Date().toISOString();
  await mkdir(values.out, { recursive: true });
  const entries = [];

  const built = new Set();
  for (const slug of slugs) {
    const city = await resolveCity(slug);
    // Two listed slugs can resolve to one survivor after a merge.
    if (built.has(city.slug)) throw new Error(`${slug} resolves to ${city.slug}, which is already listed`);
    built.add(city.slug);
    const venues = await venuesFor(city.id);
    const pack = {
      format: FORMAT,
      id: city.slug,
      name: city.name,
      country: city.country,
      generated_at,
      venues,
      hotlines: allHotlines.filter((h) => h.country?.toUpperCase() === city.country || h.country === 'INT'),
    };
    const text = JSON.stringify(pack);
    const bytes = utf8ToBytes(text);
    await writeFile(join(values.out, `${city.slug}.json`), text);
    entries.push({
      id: city.slug,
      name: city.name,
      country: city.country,
      generated_at,
      bytes: bytes.length,
      sha256: bytesToHex(sha256(bytes)),
      venues: venues.length,
    });
    console.log(`  ${city.slug}: ${venues.length} venues, ${pack.hotlines.length} hotlines, ${bytes.length} bytes`);
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(join(values.out, 'index.json'), signIndex({ format: FORMAT, generated_at, packs: entries }, secret));
  console.log(`Wrote ${entries.length} packs + index.json to ${values.out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
