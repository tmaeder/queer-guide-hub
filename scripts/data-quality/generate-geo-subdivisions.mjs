#!/usr/bin/env node
/**
 * Generate the INSERT body for public.geo_subdivisions from the
 * dr5hn/countries-states-cities-database `states.json`.
 *
 * Why generated: the table is a projection of ISO 3166-2 as dr5hn publishes it
 * (5,300 subdivisions with code, FIPS/GeoNames admin1 code, native name,
 * translations, Wikidata id and hierarchy). Hand-writing it is how
 * `cities.region_name` became free text with three spellings per state and
 * GeoNames numeric codes ("27" for São Paulo) nobody can read. Regenerate,
 * never hand-edit.
 *
 * What is kept:
 *   - code          ISO 3166-2 ("US-CA", "DE-BY", "BE-VLG")
 *   - parent_code   the subdivision this one sits in (BE provinces → regions,
 *                   FR departments → regions). NULL for a first-level unit.
 *   - fips_code     dr5hn's `fips_code`, which for most countries equals the
 *                   GeoNames admin1 code — the numeric values already sitting
 *                   in cities.region_name ("AU 02" = New South Wales).
 *   - aliases       native name + translations in de/es/fr/it/pt/nl, so the
 *                   resolver can read "Katalonien" or "Bayern".
 *
 * Duplicate codes (dr5hn lists e.g. FR-973 as both an overseas region and a
 * department): the first-level row wins, else the first seen. Rows with no
 * ISO code are dropped.
 *
 * Usage:
 *   curl -sL https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/states.json > states.json
 *   node scripts/data-quality/generate-geo-subdivisions.mjs --file states.json > seed.sql
 */
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const fileIdx = args.indexOf('--file')
if (fileIdx < 0 || !args[fileIdx + 1]) {
  console.error('usage: generate-geo-subdivisions.mjs --file <states.json>')
  process.exit(2)
}
const states = JSON.parse(readFileSync(args[fileIdx + 1], 'utf8'))

const ALIAS_LANGS = ['de', 'es', 'fr', 'it', 'pt', 'nl']

// English exonyms dr5hn does not carry but cities.region_name does — each one
// read off the live region_name values (2026-10-03) and checked against the
// dr5hn row for that code. Only add a name that can mean exactly ONE unit:
// "Aegean" (North or South?) and "Cyprus" (a country) are deliberately absent.
const EXTRA_ALIASES = {
  'CH-BL': ['Basel-Landschaft'], 'CH-BS': ['Basel-City'],
  'CL-AP': ['Arica and Parinacota Region'], 'CL-MA': ['Magallanes and Antartica Chilena Region'],
  'CL-RM': ['Santiago Metropolitan Region'], 'CO-DC': ['Bogota, Capital District'],
  'CZ-20': ['Central Bohemian Region'], 'CZ-31': ['South Bohemian Region'],
  'CZ-63': ['Vysočina Region'], 'CZ-64': ['South Moravian Region'], 'CZ-80': ['Moravian-Silesian Region'],
  'DE-HB': ['Free Hanseatic City of Bremen'], 'ES-AS': ['Principality of Asturias'],
  'ES-CM': ['Castile-La Mancha'], 'FI-14': ['North Ostrobothnia'], 'FI-16': ['Päijät-Häme'],
  'FI-19': ['Southwest Finland'], 'FR-BRE': ['Brittany'], 'FR-NOR': ['Normandy'],
  'ID-JB': ['West Java'], 'ID-JI': ['East Java'], 'ID-JT': ['Central Java'],
  'ID-KI': ['East Kalimantan'], 'ID-KR': ['Riau Islands'], 'ID-SN': ['South Sulawesi'],
  'ID-SU': ['North Sumatra'], 'ID-YO': ['Special Region of Yogyakarta'],
  'IL-M': ['Center District'], 'IT-32': ['Trentino – Alto Adige/Südtirol'],
  'MX-COA': ['Coahuila'], 'MX-MIC': ['Michoacán'], 'MX-VER': ['Veracruz'],
  'NG-FC': ['Federal Capital Territory'], 'PH-00': ['Metro Manila'],
  'PK-IS': ['Islamabad Capital Territory'],
  'PL-02': ['Lower Silesian Voivodeship'], 'PL-04': ['Kuyavian-Pomeranian Voivodeship'],
  'PL-14': ['Masovian Voivodeship'], 'PL-20': ['Podlachian Voivodeship'],
  'PL-22': ['Pomeranian Voivodeship'], 'PL-24': ['Silesian Voivodeship'],
  'UA-46': ['Lviv Oblast'], 'UA-48': ['Mykolaiv Oblast'], 'UA-51': ['Odesa Oblast'],
}
const q = (s) => (s == null || s === '' ? 'null' : `'${String(s).trim().replace(/'/g, "''")}'`)
const num = (s) => (s == null || s === '' || Number.isNaN(Number(s)) ? 'null' : String(Number(s)))
const arr = (xs) => (xs.length ? `array[${xs.map(q).join(',')}]::text[]` : `'{}'::text[]`)

// dr5hn types `id` as a number and `parent_id` as a string ('1373'), so key by
// String() on both sides or every parent lookup silently misses.
const codeById = new Map(states.map((s) => [String(s.id), s.iso3166_2]))

const byCode = new Map()
for (const s of states) {
  if (!s.iso3166_2) continue
  const prev = byCode.get(s.iso3166_2)
  if (!prev || (prev.parent_id != null && s.parent_id == null)) byCode.set(s.iso3166_2, s)
}

for (const code of Object.keys(EXTRA_ALIASES))
  if (!byCode.has(code)) throw new Error(`EXTRA_ALIASES names ${code}, which dr5hn does not list`)

const rows = [...byCode.values()]
  .sort((a, b) => a.iso3166_2.localeCompare(b.iso3166_2))
  .map((s) => {
    const name = s.name.trim()
    const aliasSet = new Set()
    for (const v of [s.native, ...ALIAS_LANGS.map((l) => s.translations?.[l]), ...(EXTRA_ALIASES[s.iso3166_2] ?? [])]) {
      const t = (v ?? '').trim()
      if (t && t.toLowerCase() !== name.toLowerCase()) aliasSet.add(t)
    }
    const parent = s.parent_id != null ? codeById.get(String(s.parent_id)) ?? null : null
    return `(${[
      q(s.iso3166_2),
      q(s.country_code),
      q(name),
      q(s.type),
      q(parent),
      q(s.fips_code),
      q(s.wikiDataId),
      num(s.latitude),
      num(s.longitude),
      arr([...aliasSet]),
    ].join(', ')})`
  })

process.stdout.write(
  `-- generated by scripts/data-quality/generate-geo-subdivisions.mjs from dr5hn states.json (${rows.length} rows)\n` +
    'insert into public.geo_subdivisions\n' +
    '  (code, country_code, name, subdivision_type, parent_code, fips_code, wikidata_qid, latitude, longitude, aliases)\nvalues\n' +
    rows.join(',\n') +
    '\non conflict (code) do nothing;\n',
)
