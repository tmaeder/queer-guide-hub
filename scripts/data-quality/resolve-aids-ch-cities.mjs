/**
 * Resolve the aids-ch registry's city strings to Swiss municipalities.
 *
 * WHY THIS EXISTS. The aids.ch import (#3228) landed 201 health-service
 * organizations and only 107 got a `city_id`. `commit_health_service_org`
 * matched `lower(geo_places.name) = lower(payload.city)` inside the resolved
 * country and BLOCKED rather than guessed -- correctly, that guard is why
 * 20260802090844 exists -- but the registry publishes French and Italian names
 * while `cities` holds English or hyphenated bilingual ones, and only 104 Swiss
 * cities existed in the table at all. 94 centres were therefore invisible to
 * every city-scoped query: list_testing_sites(p_city_id), the city page, facets.
 *
 * THREE SIGNALS, AND THE RULE IS THAT ONE IS NEVER ENOUGH.
 *   1  the registry string matches a label or alias of a municipality, in any of
 *      de/fr/it/rm/en, across ALL current Swiss municipalities
 *   2  the clinic's own coordinates sit near that municipality's point
 *   3  the Swiss postal directory assigns the clinic's postal code to that same
 *      municipality
 *
 * Signal 1 alone is what put 116 events on the wrong Portland. Here it puts
 * "Corcelles" (postal 2035, Neuchatel) on Corcelles BE, 55 km away, because the
 * bare name belongs to a village of 205 people. Signal 2 alone silently swallows
 * any clinic sitting in the next municipality over -- and on its own it resolves
 * that same Corcelles to Milvignes, whose centroid is nearer than Neuchatel's
 * but which is a different municipality. Signal 3 decided both, and corrected
 * two rows this table originally had wrong.
 *
 * WHAT THE POSTAL DIRECTORY IS AND IS NOT. It is NOT a 1:1 map to municipalities,
 * which is the assumption this script was first written on. 221 of 3,362 codes
 * span several (1211 covers Geneve, Lancy, Meyrin, Le Grand-Saconnex and
 * Pregny-Chambesy). Worse, 28 are filed under the SORTING CENTRE rather than the
 * addressed town: 8010/8011/8012 "Zurich" are attributed to Schlieren, whose
 * Mulligen facility handles them, and storing that would resolve every
 * "8010 Zurich" address to Schlieren. So a code is only ever attached to a
 * municipality when the directory attributes it to that one ALONE and its place
 * name is not addressed to a different municipality.
 *
 * OUTPUT is a reviewed artifact, not an applied change: every decision, its
 * three signals, and a written reason for each row the signals did not agree on.
 * The migrations carry the frozen list; this script is how it was derived and
 * how it can be re-derived.
 *
 * USAGE
 *   node scripts/data-quality/resolve-aids-ch-cities.mjs            # re-derive
 *   node scripts/data-quality/resolve-aids-ch-cities.mjs --sql      # + payload
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const OUT = join(process.cwd(), 'scripts/data-quality/out');
const CACHE = join(process.cwd(), 'out-aids-ch');
const UA = 'queer.guide-city-backfill/1.0 (+https://queer.guide)';
const EMIT_SQL = process.argv.includes('--sql');

mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------- db ---

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT;
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim();
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8');
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`mgmt API ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

// ------------------------------------------------------------------ sources ---

/** Cache every third-party pull: the pass is re-run while reviewing rows. */
async function cached(name, fn) {
  const p = join(CACHE, name);
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  const v = await fn();
  writeFileSync(p, JSON.stringify(v));
  return v;
}

async function sparql(query) {
  for (let a = 1; a <= 4; a += 1) {
    const res = await fetch('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query }),
      signal: AbortSignal.timeout(180_000),
    });
    if (res.ok) return (await res.json()).results.bindings;
    console.warn(`[wdqs] ${res.status}, attempt ${a}/4`);
    await sleep(5000 * a);
  }
  throw new Error('wdqs failed after 4 attempts');
}

// Q70208 = municipality of Switzerland. A DISSOLVED municipality carries P576 and
// must never be minted as a live city row -- the same filter that keeps Cologne
// from publishing as capital of the Electorate of Cologne.
//
// Population is deliberately NOT taken from here. P1082 on a Swiss municipality
// carries one statement per census year and this query returns them in no
// meaningful order, so keeping the first binding is the rank-blind read that
// published Cape Town at 433,688: it gave Burgdorf 3,636 instead of 17,292 and
// Yverdon-les-Bains 20,730 instead of 30,292. `population()` below re-reads it
// latest-by-P585 at preferred rank.
const MUNICIPALITIES = `
SELECT ?m ?mLabel ?lat ?lon WHERE {
  ?m wdt:P31 wd:Q70208 .
  FILTER NOT EXISTS { ?m wdt:P576 ?dissolved }
  OPTIONAL { ?m p:P625/psv:P625 ?c . ?c wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,fr,it,en" }
}`;

// Every NAME, not just the preferred label. With a de-first label service the
// preferred label for Fribourg is "Freiburg im Uechtland", for Delemont
// "Delsberg", for Porrentruy "Pruntrut" and for Sierre "Siders" -- so five of the
// largest missing cities read as "no such municipality". A name lookup that sees
// one name per place cannot answer a question about a multilingual country.
const NAMES = `
SELECT ?m ?name WHERE {
  ?m wdt:P31 wd:Q70208 .
  FILTER NOT EXISTS { ?m wdt:P576 ?dissolved }
  { ?m rdfs:label ?name } UNION { ?m skos:altLabel ?name }
  FILTER(lang(?name) IN ("de","fr","it","rm","en"))
}`;

async function loadPostalDirectory() {
  // GeoNames' Swiss postal export: code, place, canton, MUNICIPALITY, BFS number.
  const p = join(CACHE, 'CH.txt');
  if (!existsSync(p)) {
    const res = await fetch('https://download.geonames.org/export/zip/CH.zip', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`geonames ${res.status}`);
    writeFileSync(join(CACHE, 'CH.zip'), Buffer.from(await res.arrayBuffer()));
    execFileSync('unzip', ['-o', '-q', join(CACHE, 'CH.zip'), 'CH.txt', '-d', CACHE]);
  }
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'))
    .map((c) => ({ plz: c[1], place: c[2], canton: c[4], muni: c[7], bfs: c[8] }));
}

// -------------------------------------------------------------------- keys ---

const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const exact = (s) => strip(s).toLowerCase().trim();
const key = (s) =>
  strip(s).toLowerCase().replace(/^(st|saint|sankt)[.\s-]+/, 'st ').replace(/[^a-z0-9]+/g, ' ').trim();

// Swiss usage disambiguates two municipalities of the same name by appending the
// canton, and the two sources spell that differently: the postal directory
// writes "Zell (LU)" and "Carouge (GE)", we write "Zell LU". Folding both forms
// away is only safe when comparing a municipality to a municipality -- doing it
// to a PLACE name would collapse "Corcelles NE" onto the municipality
// "Corcelles (BE)" and drop the one code the Corcelles clinic depends on.
const CANTON_SUFFIX = /\s*(?:\(([A-Z]{2})\)|\s([A-Z]{2}))$/;
const foldMuni = (s) => key(String(s ?? '').replace(CANTON_SUFFIX, ''));

const R = 6371000;
const haversine = (a, b, c, d) => {
  const t = Math.PI / 180;
  const s =
    Math.sin(((c - a) * t) / 2) ** 2 +
    Math.cos(a * t) * Math.cos(c * t) * Math.sin(((d - b) * t) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

// ---------------------------------------------------------------- decisions ---

/**
 * The hand-reviewed table. `mode` says whether the municipality already has a
 * `cities` row; `link` says how the registry string reaches it.
 *
 *   name            the string IS the city name -- nothing further needed
 *   alias-existing  a `city_aliases` row already covers it
 *   alias           a new `city_aliases` row is added
 *   postal          the string cannot safely become an alias, so it resolves by
 *                   postal code only. Every one of these carries a `why`.
 */
export const DECISIONS = {
  'Genève': { qid: 'Q71', city: 'Geneva', mode: 'exists', link: 'alias-existing' },
  Goldau: { qid: 'Q69742', city: 'Arth', mode: 'exists', link: 'alias-existing' },
  'St.Gallen': { qid: 'Q25607', city: 'St. Gallen', mode: 'exists', link: 'alias-existing' },
  Brig: { qid: 'Q15583', city: 'Brig-Glis', mode: 'exists', link: 'alias-existing' },
  'Stadt Zürich': { qid: 'Q72', city: 'Zürich', mode: 'exists', link: 'alias-existing' },

  Fribourg: { qid: 'Q36378', city: 'Fribourg - Freiburg', mode: 'exists', link: 'alias' },
  'La Tour-de-Trême': { qid: null, city: 'Bulle', mode: 'exists', link: 'alias',
    why: 'former municipality, merged into Bulle in 2006; one place, no Swiss namesake' },
  Peseux: { qid: 'Q69345', city: 'Neuchâtel', mode: 'exists', link: 'alias',
    why: 'former municipality, merged into Neuchatel in 2021; one place, no Swiss namesake' },
  Zollikerberg: { qid: null, city: 'Zollikon', mode: 'exists', link: 'alias',
    why: 'locality of Zollikon; the name belongs to no other Swiss place' },

  'Luzern 16': { qid: 'Q4191', city: 'Luzern', mode: 'exists', link: 'postal', postal: '6000',
    why: 'a PO-box district, not a place name; an alias would enshrine one of roughly thirty such strings' },

  ...Object.fromEntries(
    [
      ['Aigle', 'Q43195'], ['Arlesheim', 'Q581647'], ['Bellinzona', 'Q64044'], ['Binningen', 'Q69621'],
      ['Breitenbach', 'Q66672'], ['Burgdorf', 'Q68311'], ['Carouge', 'Q69364'], ['Chêne-Bougeries', 'Q69530'],
      ['Cottens', 'Q67714'], ['Delémont', 'Q63896'], ['Düdingen', 'Q70108'], ['Gland', 'Q69300'],
      ['Grenchen', 'Q68248'], ['Hindelbank', 'Q67564'], ['Hochdorf', 'Q7102'], ['Horgen', 'Q68286'],
      ['La Chaux-de-Fonds', 'Q68124'], ['Langenthal', 'Q69726'], ['Le Locle', 'Q64093'], ['Liestal', 'Q68972'],
      ['Lugano', 'Q7024'], ['Männedorf', 'Q64627'], ['Mendrisio', 'Q69041'], ['Monthey', 'Q64051'],
      ['Morges', 'Q69401'], ['Münsterlingen', 'Q69233'], ['Muri bei Bern', 'Q69765'], ['Nyon', 'Q64027'],
      ['Onex', 'Q68240'], ['Payerne', 'Q69525'], ['Porrentruy', 'Q68256'], ['Renens', 'Q69745'],
      ['Rennaz', 'Q70214'], ['Riehen', 'Q5262'], ['Sargans', 'Q64571'], ['Schlieren', 'Q69148'],
      ['Sierre', 'Q68297'], ['Tavannes', 'Q67203'], ['Vevey', 'Q68160'], ['Wetzikon', 'Q68305'],
      ['Yverdon-les-Bains', 'Q63946'],
    ].map(([n, q]) => [n, { qid: q, city: n, mode: 'create', link: 'name' }]),
  ),

  'Grand-Lancy': { qid: 'Q64065', city: 'Lancy', mode: 'create', link: 'alias',
    why: 'locality of Lancy; unique in Switzerland' },
  Jona: { qid: 'Q69729', city: 'Rapperswil-Jona', mode: 'create', link: 'alias',
    why: 'former municipality, merged into Rapperswil-Jona in 2007' },
  'St-Imier': { qid: 'Q66390', city: 'Saint-Imier', mode: 'create', link: 'alias',
    why: 'abbreviated form of the official Saint-Imier' },
  Yverdon: { qid: 'Q63946', city: 'Yverdon-les-Bains', mode: 'create', link: 'alias',
    why: 'the everyday short form of the same municipality' },

  Bruderholz: { qid: 'Q69621', city: 'Binningen', mode: 'create', link: 'postal', postal: '4101',
    why: 'the Bruderholz plateau spans Basel, Binningen and Bottmingen, so the NAME cannot pick a municipality. The postal directory assigns 4101 Bruderholz to Binningen (BFS 2765) and places that code at 47.528/7.5812, about 30 m from the clinic. Bottmingen is a different municipality (BFS 2767, postal 4103)' },
  Corcelles: { qid: 'Q69345', city: 'Neuchâtel', mode: 'exists', link: 'postal', postal: '2035',
    why: 'four Swiss municipalities carry the bare name Corcelles, and the nearest name match is Corcelles BE, 55 km away. Postal 2035 is Corcelles-Cormondreche, merged into Neuchatel in 2021 (BFS 6458). Proximity alone picks Milvignes, whose centroid is nearer but which is a different municipality' },
  Zell: { qid: 'Q14628', city: 'Zell LU', mode: 'create', link: 'postal', postal: '6144',
    why: 'Zell LU and Zell ZH both exist and `cities` cannot hold both under the bare name, so the row takes the canton-qualified form Swiss usage already uses and the bare string resolves by postal 6144' },
};

// Canton names are written in English here (existing rows read Zurich, Lucerne,
// St. Gallen, Geneva) while Wikidata's de-first label service returns the German
// exonyms. Mapping from the ISO 3166-2 code keeps the choice deterministic.
const CANTON_EN = {
  AG: 'Aargau', AI: 'Appenzell Innerrhoden', AR: 'Appenzell Ausserrhoden', BE: 'Bern',
  BL: 'Basel-Landschaft', BS: 'Basel-Stadt', FR: 'Fribourg', GE: 'Geneva', GL: 'Glarus',
  GR: 'Grisons', JU: 'Jura', LU: 'Lucerne', NE: 'Neuchâtel', NW: 'Nidwalden', OW: 'Obwalden',
  SG: 'St. Gallen', SH: 'Schaffhausen', SO: 'Solothurn', SZ: 'Schwyz', TG: 'Thurgau',
  TI: 'Ticino', UR: 'Uri', VD: 'Vaud', VS: 'Valais', ZG: 'Zug', ZH: 'Zurich',
};

// Our public name vs the postal directory's, where the two legitimately differ.
// An explicit list, because a near-match rule here would be guessing.
const DIRECTORY_NAME = { Geneva: 'Genève', 'Fribourg - Freiburg': 'Fribourg' };

// ------------------------------------------------------------------- main ----

const blocked = await sql(`
  select o.id::text, o.name, o.postal_code, o.latitude, o.longitude,
         regexp_replace(o.enrichment_status->'aids-ch'->>'city_link_note',
                        '^no city named ''(.*)'' in this country$', '\\1') as cname
    from public.organizations o
   where 'aids-ch' = any(o.tags)
     and o.enrichment_status->'aids-ch'->>'city_link_note' like 'no city named%'
   order by cname, o.name;`);

const muniRows = await cached('wd-municipalities.json', () => sparql(MUNICIPALITIES));
const nameRows = await cached('wd-names.json', () => sparql(NAMES));
const dir = await loadPostalDirectory();

const qid = (b) => b.m.value.replace('http://www.wikidata.org/entity/', '');
const facts = new Map();
for (const r of muniRows) {
  if (facts.has(qid(r))) continue;
  facts.set(qid(r), {
    qid: qid(r),
    label: r.mLabel?.value ?? null,
    lat: r.lat ? Number(r.lat.value) : null,
    lon: r.lon ? Number(r.lon.value) : null,
    pop: null,
  });
}

/**
 * Population and canton for the municipalities actually being written.
 *
 * Population is the P1082 statement with the LATEST P585 among those at the
 * highest surviving rank -- never `claims.P1082[0]`, which is array position and
 * on this corpus lands on a 19th-century census as often as on the current one.
 *
 * Canton comes from a transitive P131 rather than one hop: Swiss municipalities
 * sit under Bezirke, Amtsbezirke, Wahlkreise and Verwaltungskreise, and a
 * single-hop walk resolved only 22 of 55.
 */
async function entities(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 40) {
    const url =
      'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|claims&languages=de|fr|it|en&ids=' +
      ids.slice(i, i + 40).join('|');
    let ok = false;
    for (let a = 1; a <= 4 && !ok; a += 1) {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
      if (res.ok) { Object.assign(out, (await res.json()).entities); ok = true; }
      else await sleep(3000 * a);
    }
    if (!ok) throw new Error('wbgetentities failed');
  }
  return out;
}

function population(claims) {
  const all = (claims?.P1082 ?? []).filter((s) => s.rank !== 'deprecated');
  const best = all.some((s) => s.rank === 'preferred') ? all.filter((s) => s.rank === 'preferred') : all;
  let pop = null;
  let year = -Infinity;
  for (const s of best) {
    const amount = s.mainsnak?.datavalue?.value?.amount;
    if (amount == null) continue;
    const t = s.qualifiers?.P585?.[0]?.datavalue?.value?.time ?? null;
    const y = t ? Number(t.slice(1, 5)) : 0;
    if (y >= year) { year = y; pop = Math.round(Number(amount)); }
  }
  return pop;
}

const targetQids = [...new Set(Object.values(DECISIONS).map((d) => d.qid).filter(Boolean))];
const ents = await cached('wd-entities.json', () => entities(targetQids));
for (const [q, e] of Object.entries(ents)) {
  if (facts.has(q)) facts.get(q).pop = population(e.claims);
}
const namesByQid = {};
for (const r of nameRows) (namesByQid[qid(r)] ??= []).push(r.name.value);

// --- signal 1: the name index ------------------------------------------------
const nameIndex = new Map();
for (const [q, list] of Object.entries(namesByQid)) {
  for (const n of list) {
    const k = key(n);
    if (!k) continue;
    if (!nameIndex.has(k)) nameIndex.set(k, new Map());
    if (!nameIndex.get(k).has(q)) nameIndex.get(k).set(q, n);
  }
}

// --- signal 3: the postal directory ------------------------------------------
const ownersByPlz = new Map();
const bfsByMuni = new Map();
for (const r of dir) {
  if (!ownersByPlz.has(r.plz)) ownersByPlz.set(r.plz, new Set());
  ownersByPlz.get(r.plz).add(r.muni);
  bfsByMuni.set(r.muni, r.bfs);
}
const MUNI_NAMES = new Set([...bfsByMuni.keys()].map(exact));

/** The municipality a place name is addressed to, when it is not `own`. */
function foreignAddressee(place, own) {
  const words = exact(place).split(/\s+/);
  for (let n = words.length; n >= 1; n -= 1) {
    const prefix = words.slice(0, n).join(' ');
    if (MUNI_NAMES.has(prefix) && prefix !== exact(own)) return prefix;
  }
  return null;
}

const plzByMuni = new Map();
let shared = 0;
let foreign = 0;
for (const r of dir) {
  if ((ownersByPlz.get(r.plz)?.size ?? 0) !== 1) { shared += 1; continue; }
  if (foreignAddressee(r.place, r.muni)) { foreign += 1; continue; }
  if (!plzByMuni.has(r.muni)) plzByMuni.set(r.muni, new Set());
  plzByMuni.get(r.muni).add(r.plz);
}
console.log(
  `[plz] ${ownersByPlz.size} codes: ${shared} rows span more than one municipality, ` +
    `${foreign} are addressed elsewhere than they are sorted; neither is stored`,
);

const orgsByCity = new Map();
for (const o of blocked) {
  if (!orgsByCity.has(o.cname)) orgsByCity.set(o.cname, []);
  orgsByCity.get(o.cname).push(o);
}

/**
 * The ONE directory municipality a decision lands on.
 *
 * A postal code can span two municipalities -- 1227 is both Carouge and Les
 * Acacias in Geneve -- so the codes must come from the municipality whose name
 * agrees with the city chosen, never unioned across every owner of the code.
 * Unioning gave Carouge all thirteen of Geneva's postal codes.
 */
function directoryMuni(registry, cityName) {
  const codes = [...new Set((orgsByCity.get(registry) ?? []).map((o) => o.postal_code))];
  const owners = new Set();
  for (const c of codes) for (const n of ownersByPlz.get(c) ?? []) owners.add(n);
  const want = foldMuni(DIRECTORY_NAME[cityName] ?? cityName);
  const hit = [...owners].filter((n) => foldMuni(n) === want);
  if (hit.length !== 1) {
    throw new Error(
      `directoryMuni: "${registry}" -> "${cityName}" matched ${hit.length} municipalities ` +
        `(owners of ${codes.join('/')}: ${[...owners].join(', ') || 'none'})`,
    );
  }
  return hit[0];
}

// --- checks that must hold before anything is written ------------------------
const CANTON_RE = /\s*[( ](AG|AI|AR|BE|BL|BS|FR|GE|GL|GR|JU|LU|NE|NW|OW|SG|SH|SO|SZ|TG|TI|UR|VD|VS|ZG|ZH)\)?$/;
const bareLabel = new Map();
for (const f of facts.values()) {
  if (!f.label) continue;
  const k = key(f.label.replace(CANTON_RE, ''));
  if (!bareLabel.has(k)) bareLabel.set(k, new Set());
  bareLabel.get(k).add(f.qid);
}

let failures = 0;
for (const [registry, d] of Object.entries(DECISIONS)) {
  if (d.mode !== 'create') continue;
  // CHECK 1: `cities` holds at most one row per (name, country), so a name two
  // municipalities share cannot be represented, and minting it under the bare
  // name guarantees a future wrong link -- the Charleston SC / Charleston IL
  // shape. Such a row must take the canton-qualified form, or be postal-gated.
  const others = [...(bareLabel.get(foldMuni(d.city)) ?? [])].filter((q) => q !== d.qid);
  if (others.length && d.link !== 'postal') {
    console.error(`CHECK 1 FAIL ${registry} -> "${d.city}" shares its name with ${others.join(', ')}`);
    failures += 1;
  }
}
for (const [registry, d] of Object.entries(DECISIONS)) {
  // CHECK 2: a row reachable ONLY by postal code must key on a code the
  // directory attributes to exactly one municipality. Anything else is not
  // resolvable and has to stay blocked instead.
  if (d.link !== 'postal') continue;
  const owners = ownersByPlz.get(d.postal) ?? new Set();
  if (owners.size !== 1) {
    console.error(`CHECK 2 FAIL ${registry} plz=${d.postal} is shared by ${[...owners].join(', ')}`);
    failures += 1;
  }
}
if (failures) {
  console.error(`\n${failures} check failure(s) -- not writing the artifact.`);
  process.exit(1);
}
console.log('[checks] every created name is unique or postal-gated; every postal-only row keys on an unambiguous code');

// --- the artifact ------------------------------------------------------------
const rows = [];
const perCity = new Map();
for (const [registry, d] of Object.entries(DECISIONS)) {
  const orgs = orgsByCity.get(registry) ?? [];
  const f = d.qid ? facts.get(d.qid) : null;
  const dm = directoryMuni(registry, d.city);
  const codes = [...(plzByMuni.get(dm) ?? [])].sort();

  let nameHit = null;
  let distance = null;
  const cands = [...(nameIndex.get(key(registry)) ?? new Map()).keys()];
  if (cands.length && f) {
    nameHit = cands.includes(d.qid) ? `${f.label} (${d.qid})` : `${cands.join(', ')} -- not the chosen municipality`;
  }
  if (f?.lat != null && orgs.length) {
    distance = Math.round(haversine(Number(orgs[0].latitude), Number(orgs[0].longitude), f.lat, f.lon));
  }

  rows.push({
    registry_string: registry,
    orgs: orgs.length,
    postal_codes_seen: [...new Set(orgs.map((o) => o.postal_code))].sort(),
    decision: d.mode === 'create' ? 'create_city' : 'link_existing_city',
    city_name: d.city,
    wikidata_qid: d.qid,
    link_mechanism: d.link,
    signal_1_name_match: nameHit,
    signal_2_distance_m: distance,
    signal_3_postal_directory: `${dm} (BFS ${bfsByMuni.get(dm)})`,
    why: d.why ?? null,
  });

  if (!perCity.has(d.city)) perCity.set(d.city, { d, codes: new Set(codes) });
  else for (const c of codes) perCity.get(d.city).codes.add(c);
}
rows.sort((a, b) => b.orgs - a.orgs || a.registry_string.localeCompare(b.registry_string));

writeFileSync(
  join(OUT, 'aids-ch-city-resolution.json'),
  JSON.stringify(
    {
      generated_by: 'scripts/data-quality/resolve-aids-ch-cities.mjs',
      method:
        'Three independent signals per registry string: (1) the string matches a label or alias of a current Swiss municipality in de/fr/it/rm/en; (2) the clinic own coordinates sit near that municipality point; (3) the Swiss postal directory assigns the clinic postal code to that same municipality. Rows where signals 1 and 2 disagree, or where 1 is absent, are decided by 3 and marked link_mechanism=postal with a written reason.',
      totals: {
        registry_strings: rows.length,
        organizations: rows.reduce((a, r) => a + r.orgs, 0),
        create_city: new Set(rows.filter((r) => r.decision === 'create_city').map((r) => r.wikidata_qid)).size,
        link_existing: rows.filter((r) => r.decision === 'link_existing_city').length,
        by_mechanism: rows.reduce((a, r) => ((a[r.link_mechanism] = (a[r.link_mechanism] ?? 0) + 1), a), {}),
      },
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(`[artifact] ${rows.length} registry strings -> scripts/data-quality/out/aids-ch-city-resolution.json`);

if (EMIT_SQL) {
  const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
  const arr = (a) => {
    const v = a ? [...a].sort() : [];
    return v.length ? `array[${v.map(q).join(',')}]` : 'null';
  };
  const cantons = JSON.parse(readFileSync(join(CACHE, 'cantons.json'), 'utf8'));
  const creates = [];
  const topups = [];
  for (const [, { d, codes }] of perCity) {
    if (d.mode === 'create') {
      const f = facts.get(d.qid);
      creates.push(`  (${q(d.city)}, ${q(d.qid)}, ${q(CANTON_EN[cantons[d.qid]?.code])}, ${f.lat}, ${f.lon}, ${f.pop}, ${arr(codes)})`);
    } else {
      topups.push(`  (${q(d.city)}, ${arr(codes)})`);
    }
  }
  const aliases = Object.entries(DECISIONS)
    .filter(([, d]) => d.link === 'alias')
    .map(([registry, d]) => `  (${q(d.city)}, ${q(registry)})`);
  writeFileSync(
    join(CACHE, 'payload.sql.txt'),
    `-- CREATES ${creates.length}\n${creates.join(',\n')}\n\n-- ALIASES ${aliases.length}\n${aliases.join(',\n')}\n\n-- POSTAL TOP-UP ${topups.length}\n${topups.join(',\n')}\n`,
  );
  console.log(`[sql] ${creates.length} creates, ${aliases.length} aliases, ${topups.length} top-ups -> out-aids-ch/payload.sql.txt`);
}
