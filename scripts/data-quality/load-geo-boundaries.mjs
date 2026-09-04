#!/usr/bin/env node
// Load Natural Earth boundary polygons into public.geo_boundaries.
//
// This is the first authoritative geographic reference in the schema. Until it
// runs, every geo check in the corpus compares a coordinate to the CENTROID of
// the place it claims to be in, which cannot distinguish Honolulu (correctly
// filed, 2,989 km from the nearest foreign centroid) from "Concord" filed under
// Czech Republic (a real error). PostGIS has been installed the whole time with
// all three existing geometry columns 100% NULL.
//
// SOURCE: nvkelso/natural-earth-vector, pinned to a tag, digest-verified below.
// Public domain. No API, no key, no rate limit — the whole point of choosing it
// over a per-row geocoder is that 27k venues can be swept offline in one pass.
//
// NOT SIMPLIFIED. Measured: admin-0 is 11.8 MB of geometry against a 14 GB
// database. Simplifying to save 0.08% would risk erasing Monaco (0.3 KB),
// Vatican City (0.2 KB), Nauru (0.2 KB) and Tuvalu (1.6 KB) entirely, after
// which every venue in them reads as "offshore" and the validator manufactures
// a defect class. The assertion at the end fails the load if any country our
// corpus uses ends up unresolvable.
//
// Usage:
//   node scripts/data-quality/load-geo-boundaries.mjs --dry-run
//   node scripts/data-quality/load-geo-boundaries.mjs                # countries
//   node scripts/data-quality/load-geo-boundaries.mjs --kind admin1
//   node scripts/data-quality/load-geo-boundaries.mjs --kind both

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const UA = 'QueerGuideBackfill/1.0 (https://queer.guide; data-quality)'

// Pinned release. Bumping this tag REQUIRES re-measuring the digests below;
// the loader refuses to run against unverified bytes.
const NE_TAG = 'v5.1.2'
const BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_TAG}/geojson`

// sha256 of the exact file at NE_TAG. Measured 2026-09-04.
// A mismatch means the pin moved or the transfer was corrupted; either way the
// bytes are not the ones this loader's field mapping was written against, and
// silently importing them would put unverified geometry under every future
// containment verdict.
const DIGESTS = {
  country: '239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255',
  admin1:  '22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5',
}

const FILES = {
  country: 'ne_10m_admin_0_countries',
  admin1: 'ne_10m_admin_1_states_provinces',
}

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const val = (n) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : undefined)
const DRY_RUN = flag('--dry-run')
const ALLOW_NEW_DIGEST = flag('--allow-new-digest')
const KIND = val('--kind') || 'country'
const KINDS = KIND === 'both' ? ['country', 'admin1'] : [KIND]

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }).trim()
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8')
}
const TOKEN = token()

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`mgmt API ${res.status}: ${(await res.text()).slice(0, 500)}`)
  return res.json()
}

const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`)

/**
 * Natural Earth writes -99 where a code is unknown, and ISO_A2_EH is its
 * "de facto" variant that fills some of those gaps.
 *
 * CN-TW -> TW is the load-bearing normalisation: Natural Earth encodes Taiwan
 * under China's prefix, our corpus uses the ISO 3166-1 code TW, and 121 venues
 * plus 30 events hang off it. Without this line every one of them reads as a
 * country mismatch on the first validation sweep.
 */
export function isoOf(p) {
  const raw = (p.ISO_A2 && p.ISO_A2 !== '-99') ? p.ISO_A2
            : (p.ISO_A2_EH && p.ISO_A2_EH !== '-99') ? p.ISO_A2_EH
            : null
  if (!raw) return null
  if (raw === 'CN-TW') return 'TW'
  return raw.length === 2 ? raw.toUpperCase() : null
}

async function fetchVerified(kind) {
  const url = `${BASE}/${FILES[kind]}.geojson`
  process.stdout.write(`fetching ${url}\n`)
  const buf = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer())
  const sha = createHash('sha256').update(buf).digest('hex')
  const expected = DIGESTS[kind]
  if (expected && sha !== expected) {
    throw new Error(`digest mismatch for ${kind}\n  expected ${expected}\n  got      ${sha}\nThe pinned bytes changed. Re-verify the source before importing.`)
  }
  if (!expected) {
    if (!ALLOW_NEW_DIGEST) {
      throw new Error(`no pinned digest for ${kind}. Measured ${sha}\nRe-run with --allow-new-digest to accept, then commit it into DIGESTS.`)
    }
    console.log(`  ! no pinned digest; measured ${sha} (record this in DIGESTS)`)
  }
  console.log(`  ${(buf.length / 1048576).toFixed(1)} MB, sha256 ok`)
  return { gj: JSON.parse(buf.toString('utf8')), sha }
}

/** SOV_A3 names the sovereign by 3-letter code; resolve it to an ISO-2 via the
 *  feature whose own ADM0_A3 matches. Yields GU->US, HK->CN, PR->US, MP->US. */
function sovereignMap(features) {
  const byAdm0 = new Map()
  for (const f of features) {
    const i = isoOf(f.properties)
    if (i && f.properties.ADM0_A3) byAdm0.set(f.properties.ADM0_A3, i)
  }
  return byAdm0
}

async function loadKind(kind) {
  const { gj, sha } = await fetchVerified(kind)
  const feats = gj.features
  console.log(`  ${feats.length} features`)

  const byAdm0 = kind === 'country' ? sovereignMap(feats) : new Map()
  const rows = []
  for (const f of feats) {
    const p = f.properties
    const iso = kind === 'country' ? isoOf(p) : (p.iso_a2 && p.iso_a2 !== '-99' ? p.iso_a2.toUpperCase() : null)
    const sov = kind === 'country' ? (byAdm0.get(p.SOV_A3) ?? null) : null
    rows.push({
      iso_a2: iso,
      iso_3166_2: kind === 'admin1' ? (p.iso_3166_2 || null) : null,
      sovereign_iso_a2: sov && sov !== iso ? sov : null,
      name: (kind === 'country' ? p.NAME : p.name) || p.NAME_EN || 'unnamed',
      ne_type: (kind === 'country' ? p.TYPE : p.type_en) || null,
      geojson: JSON.stringify(f.geometry),
    })
  }

  const noIso = rows.filter((r) => !r.iso_a2)
  console.log(`  ${rows.length - noIso.length} with a usable ISO-2, ${noIso.length} without (disputed/indeterminate — loaded, but the validator declines to adjudicate on them)`)

  if (DRY_RUN) {
    console.log(`  DRY RUN — would insert ${rows.length} ${kind} rows`)
    return { rows, sha }
  }

  await sql(`delete from public.geo_boundaries where boundary_kind = ${q(kind)};`)

  // Batch by PAYLOAD SIZE, not row count. Canada's geometry alone is 1.5 MB;
  // a fixed row count would produce a statement large enough to be rejected
  // while also wasting round-trips on the 0.2 KB microstates.
  const MAX_BYTES = 3_000_000
  let batch = []
  let bytes = 0
  let done = 0
  const flush = async () => {
    if (!batch.length) return
    const values = batch.map((r) =>
      `(${q(kind)}, ${q(r.iso_a2)}, ${q(r.iso_3166_2)}, ${q(r.sovereign_iso_a2)}, ${q(r.name)}, ${q(r.ne_type)},` +
      ` ST_Multi(ST_MakeValid(ST_GeomFromGeoJSON(${q(r.geojson)}))), 'natural_earth', ${q(NE_TAG)}, ${q(sha)})`
    ).join(',\n')
    await sql(`insert into public.geo_boundaries
      (boundary_kind, iso_a2, iso_3166_2, sovereign_iso_a2, name, ne_type, geom, source, source_version, source_sha256)
      values\n${values};`)
    done += batch.length
    process.stdout.write(`\r  inserted ${done}/${rows.length}`)
    batch = []
    bytes = 0
  }
  for (const r of rows) {
    if (bytes + r.geojson.length > MAX_BYTES && batch.length) await flush()
    batch.push(r)
    bytes += r.geojson.length
  }
  await flush()
  console.log('')
  return { rows, sha }
}

/**
 * Derive territory -> sovereign equivalence. Two signals, neither hand-written:
 *  - the territory has its own polygon  -> Natural Earth SOV_A3
 *  - the territory has no polygon       -> whichever polygon contains its centroid
 * The second is what resolves Réunion, Martinique, Guadeloupe, French Guiana,
 * Mayotte and Caribbean Netherlands, which Natural Earth folds into FR and NL.
 */
async function deriveParents() {
  if (DRY_RUN) { console.log('parents: DRY RUN, skipped'); return }
  console.log('deriving geo_country_parent...')
  await sql('delete from public.geo_country_parent;')
  await sql(`
    insert into public.geo_country_parent (child_code, parent_code, derivation)
    select distinct b.iso_a2, b.sovereign_iso_a2, 'sovereign'
      from public.geo_boundaries b
     where b.boundary_kind = 'country'
       and b.iso_a2 is not null
       and b.sovereign_iso_a2 is not null
       and b.iso_a2 <> b.sovereign_iso_a2
    on conflict (child_code) do nothing;`)
  // Countries we hold that Natural Earth has no feature for: ask which polygon
  // their stored centroid lands in. Uses geo_country_at so the coastal
  // tolerance applies here too.
  await sql(`
    insert into public.geo_country_parent (child_code, parent_code, derivation)
    select c.code, g.iso_a2, 'centroid_containment'
      from public.countries c
      cross join lateral public.geo_country_at(c.latitude, c.longitude) g
     where c.latitude is not null
       and not exists (
         select 1 from public.geo_boundaries b
          where b.boundary_kind='country' and b.iso_a2 = c.code)
       and g.iso_a2 is distinct from c.code
    on conflict (child_code) do nothing;`)
  const r = await sql('select derivation, count(*)::int as n from public.geo_country_parent group by 1 order by 1;')
  console.log('  ', JSON.stringify(r))
}

/**
 * The positive control. A containment validator over a boundary set that is
 * missing countries reports those countries' venues as defects — it invents
 * findings rather than finding them. Fail the load rather than leave that live.
 */
async function assertCoverage() {
  if (DRY_RUN) { console.log('coverage assertion: DRY RUN, skipped'); return }
  const rows = await sql(`
    with unresolved as (
      select c.code, c.name,
             (select count(*) from public.venues v where v.country_id = c.id) as venues,
             (select count(*) from public.events e where e.country_id = c.id) as events
        from public.countries c
       where not exists (select 1 from public.geo_boundaries b
                          where b.boundary_kind='country' and b.iso_a2 = c.code)
         and not exists (select 1 from public.geo_country_parent p where p.child_code = c.code)
    )
    select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'venues',venues,'events',events) order by venues desc), '[]'::jsonb) as unresolved,
           (select count(*) from public.geo_boundaries where boundary_kind='country' and iso_a2 is not null)::int as with_iso,
           (select count(*) from unresolved u where u.venues > 0 or u.events > 0)::int as unresolved_with_content
      from unresolved;`)
  const r = Array.isArray(rows) ? rows[0] : rows
  console.log(`coverage: ${r.with_iso} countries with geometry; ${r.unresolved_with_content} unresolved codes carrying content`)
  if (r.unresolved_with_content > 0) {
    console.error('UNRESOLVED COUNTRIES CARRYING CONTENT:', JSON.stringify(r.unresolved, null, 2))
    throw new Error('a country holding venues or events has neither its own polygon nor a derived parent — every row under it would read as a false mismatch')
  }
  // Named small-state control. These are the rows a simplification pass would
  // silently delete; asserting them by name means a future "optimisation"
  // cannot quietly reintroduce that failure.
  const small = await sql(`
    select code from (values ('MC'),('VA'),('NR'),('SM'),('TV'),('LI'),('MT'),('SG')) t(code)
     where not exists (select 1 from public.geo_boundaries b where b.boundary_kind='country' and b.iso_a2 = t.code);`)
  if (Array.isArray(small) && small.length) {
    throw new Error(`microstates missing from geo_boundaries: ${small.map((x) => x.code).join(', ')}`)
  }
  console.log('  microstate control passed (MC VA NR SM TV LI MT SG all present)')
}

// Guarded so the pure helpers above (isoOf in particular) can be imported by
// tests without the import running a load against production.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  for (const k of KINDS) await loadKind(k)
  if (KINDS.includes('country')) { await deriveParents(); await assertCoverage() }
  console.log('done')
}
