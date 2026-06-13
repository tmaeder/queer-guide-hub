#!/usr/bin/env node
// Extract social-nudity places from the 6 Wikipedia "List of social nudity places in <Continent>" pages.
// Pass 1: MediaWiki action=parse (wikitext) -> country/region/place hierarchy + bullets + inline {{coord}}.
// Pass 2: action=query&prop=coordinates (batched 50) -> precise coords for linked articles.
// Output: places.json (array) + report.md. No DB writes.
//
// Run: node imports/nude-places-2026-06/extract.mjs

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = 'https://en.wikipedia.org/w/api.php';
const UA = 'QueerGuide/1.0 (contact@queer.guide) nude-places-import';

const PAGES = [
  ['Africa', 'List_of_social_nudity_places_in_Africa'],
  ['Asia', 'List_of_social_nudity_places_in_Asia'],
  ['North America', 'List_of_social_nudity_places_in_North_America'],
  ['Europe', 'List_of_social_nudity_places_in_Europe'],
  ['Oceania', 'List_of_social_nudity_places_in_Oceania'],
  ['South America', 'List_of_social_nudity_places_in_South_America'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params, tries = 4) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 429 || res.status >= 500) { await sleep(1500 * (i + 1)); continue; }
      if (!res.ok) throw new Error(`api ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

// ---- ISO2 country lookup (English names as used on these pages) ----
const ISO2 = {
  'Algeria': 'DZ', 'Angola': 'AO', 'Benin': 'BJ', 'Botswana': 'BW', 'Cameroon': 'CM',
  'Cape Verde': 'CV', 'Egypt': 'EG', 'Eswatini': 'SZ', 'Gambia': 'GM', 'Ghana': 'GH',
  'Kenya': 'KE', 'Madagascar': 'MG', 'Mauritius': 'MU', 'Morocco': 'MA', 'Mozambique': 'MZ',
  'Namibia': 'NA', 'Nigeria': 'NG', 'Reunion': 'RE', 'Réunion': 'RE', 'Senegal': 'SN',
  'Seychelles': 'SC', 'South Africa': 'ZA', 'Tanzania': 'TZ', 'Tunisia': 'TN', 'Zimbabwe': 'ZW',
  // Asia
  'Bahrain': 'BH', 'Bangladesh': 'BD', 'Cambodia': 'KH', 'China': 'CN', 'Hong Kong': 'HK',
  'India': 'IN', 'Indonesia': 'ID', 'Iran': 'IR', 'Israel': 'IL', 'Japan': 'JP',
  'Jordan': 'JO', 'Kazakhstan': 'KZ', 'Lebanon': 'LB', 'Malaysia': 'MY', 'Maldives': 'MV',
  'Myanmar': 'MM', 'Nepal': 'NP', 'Pakistan': 'PK', 'Philippines': 'PH', 'Qatar': 'QA',
  'Russia': 'RU', 'Saudi Arabia': 'SA', 'Singapore': 'SG', 'South Korea': 'KR',
  'Sri Lanka': 'LK', 'Taiwan': 'TW', 'Thailand': 'TH', 'Turkey': 'TR', 'Türkiye': 'TR',
  'United Arab Emirates': 'AE', 'Vietnam': 'VN', 'Vietnam ': 'VN',
  // Europe
  'Albania': 'AL', 'Andorra': 'AD', 'Austria': 'AT', 'Belarus': 'BY', 'Belgium': 'BE',
  'Bosnia and Herzegovina': 'BA', 'Bulgaria': 'BG', 'Croatia': 'HR', 'Cyprus': 'CY',
  'Czech Republic': 'CZ', 'Czechia': 'CZ', 'Denmark': 'DK', 'Estonia': 'EE', 'Finland': 'FI',
  'France': 'FR', 'Germany': 'DE', 'Greece': 'GR', 'Hungary': 'HU', 'Iceland': 'IS',
  'Ireland': 'IE', 'Italy': 'IT', 'Latvia': 'LV', 'Lithuania': 'LT', 'Luxembourg': 'LU',
  'Malta': 'MT', 'Moldova': 'MD', 'Monaco': 'MC', 'Montenegro': 'ME', 'Netherlands': 'NL',
  'The Netherlands': 'NL', 'North Macedonia': 'MK', 'Norway': 'NO', 'Poland': 'PL',
  'Portugal': 'PT', 'Romania': 'RO', 'Serbia': 'RS', 'Slovakia': 'SK', 'Slovenia': 'SI',
  'Spain': 'ES', 'Sweden': 'SE', 'Switzerland': 'CH', 'Ukraine': 'UA',
  'United Kingdom': 'GB', 'England': 'GB', 'Scotland': 'GB', 'Wales': 'GB',
  'Northern Ireland': 'GB',
  // North America
  'Canada': 'CA', 'Costa Rica': 'CR', 'Cuba': 'CU', 'Dominican Republic': 'DO',
  'El Salvador': 'SV', 'Guatemala': 'GT', 'Honduras': 'HN', 'Jamaica': 'JM', 'Mexico': 'MX',
  'Nicaragua': 'NI', 'Panama': 'PA', 'United States': 'US', 'United States of America': 'US',
  'Bahamas': 'BS', 'The Bahamas': 'BS', 'Barbados': 'BB', 'Belize': 'BZ',
  'Saint Martin': 'MF', 'Sint Maarten': 'SX', 'Saint Lucia': 'LC', 'Aruba': 'AW',
  'Curacao': 'CW', 'Curaçao': 'CW', 'Guadeloupe': 'GP', 'Martinique': 'MQ',
  'Puerto Rico': 'PR', 'Trinidad and Tobago': 'TT', 'Antigua and Barbuda': 'AG',
  'Grenada': 'GD', 'Dominica': 'DM', 'Haiti': 'HT', 'Bermuda': 'BM',
  // Oceania
  'Australia': 'AU', 'New Zealand': 'NZ', 'Fiji': 'FJ', 'Papua New Guinea': 'PG',
  'New Caledonia': 'NC', 'French Polynesia': 'PF', 'Samoa': 'WS', 'Vanuatu': 'VU',
  'Tonga': 'TO', 'Guam': 'GU', 'Cook Islands': 'CK', 'Palau': 'PW',
  // South America
  'Argentina': 'AR', 'Bolivia': 'BO', 'Brazil': 'BR', 'Chile': 'CL', 'Colombia': 'CO',
  'Ecuador': 'EC', 'Guyana': 'GY', 'Paraguay': 'PY', 'Peru': 'PE', 'Suriname': 'SR',
  'Uruguay': 'UY', 'Venezuela': 'VE',
  // small territories / name variants seen on the pages
  'Anguilla': 'AI', 'St. Barths': 'BL', "St. Barths'": 'BL', 'Saint Barthélemy': 'BL',
  'St. Lucia': 'LC', 'St Lucia': 'LC', 'British Virgin Islands': 'VG',
  'US Virgin Islands': 'VI', 'U.S. Virgin Islands': 'VI', 'Cayman Islands': 'KY',
};
// substring fallbacks for descriptive headings ("Réunion Island in the Indian Ocean")
const ISO2_CONTAINS = [
  [/réunion|reunion/i, 'RE'], [/guadeloupe/i, 'GP'], [/martinique/i, 'MQ'],
  [/saint martin|st\.? martin/i, 'MF'], [/st\.? barth/i, 'BL'],
];
function iso2(country) {
  if (!country) return null;
  const k = country.trim();
  if (ISO2[k]) return ISO2[k];
  if (ISO2[k.replace(/\s+/g, ' ')]) return ISO2[k.replace(/\s+/g, ' ')];
  for (const [re, code] of ISO2_CONTAINS) if (re.test(k)) return code;
  return null;
}

// ---- wikitext helpers ----
// Apply a removal regex until the string stops changing. A single pass can
// reintroduce the dangerous sequence (e.g. "<!--<!---->-->" or "<scr<script>ipt>"),
// so repeat to fixpoint — see CodeQL js/incomplete-multi-character-sanitization.
function stripUntilStable(str, re) {
  let prev;
  do {
    prev = str;
    str = str.replace(re, '');
  } while (str !== prev);
  return str;
}

function stripMarkup(s) {
  if (!s) return '';
  let t = s;
  t = t.replace(/<ref[^>]*\/>/gi, '');
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  t = stripUntilStable(t, /<!--[\s\S]*?-->/g);
  // drop File/Image embeds entirely (their captions carry thumb|NNpx| junk)
  t = t.replace(/\[\[(?:File|Image):[^\[\]]*(?:\[\[[^\]]*\]\][^\[\]]*)*\]\]/gi, '');
  // [[link|text]] -> text ; [[link]] -> link
  t = t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  t = t.replace(/\[\[([^\]]+)\]\]/g, '$1');
  // [http url text] -> text ; [http url] -> ''
  t = t.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1');
  t = t.replace(/\[https?:\/\/\S+\]/g, '');
  // remove templates (after we've already extracted coords separately)
  t = t.replace(/\{\{[^{}]*\}\}/g, '');
  t = t.replace(/\{\{[^{}]*\}\}/g, ''); // second pass for one level of nesting
  t = t.replace(/\{\{.*$/s, ''); // drop unclosed template tail (multi-line {{cite web|...)
  t = t.replace(/'''?/g, '');
  t = t.replace(/\b(thumb|thumbnail|left|right|center|centre|frameless|upright)\|/gi, '');
  t = t.replace(/\b\d+px\|/gi, '');
  t = stripUntilStable(t, /<[^>]+>/g);
  // Unescape &amp; LAST so a literal "&ndash;" produced by it isn't re-unescaped
  // (CodeQL js/double-escaping).
  t = t.replace(/&nbsp;/g, ' ').replace(/&ndash;/g, '–').replace(/&amp;/g, '&');
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/^[–—-]\s*/, '').trim();
  return t;
}

function firstLink(s) {
  // returns {label, title} from first [[...]] in the raw bullet
  const m = s.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  if (!m) return null;
  const title = m[1].trim();
  const label = (m[2] || m[1]).trim();
  if (/^(File|Image|Category):/i.test(title)) return null;
  return { label, title };
}

function dmsToDec(d, m, s, hemi) {
  let v = Number(d) + (Number(m) || 0) / 60 + (Number(s) || 0) / 3600;
  if (/[SW]/i.test(hemi)) v = -v;
  return v;
}

function parseCoord(raw) {
  // find {{coord|...}} and return {lat,lng} or null
  const m = raw.match(/\{\{coord\s*\|([^}]*)\}\}/i);
  if (!m) return null;
  const parts = m[1].split('|').map((p) => p.trim());
  // strip trailing display params (display=..., region:..., name=...)
  const nums = [];
  for (const p of parts) {
    if (/[:=]/.test(p) && !/^[NSEW]$/i.test(p)) break;
    nums.push(p);
  }
  // DMS first (presence of an N/S hemisphere token): lat d [m] [s] N lon d [m] [s] E
  const hemiIdx = nums.findIndex((p) => /^[NS]$/i.test(p));
  if (hemiIdx > 0) {
    const latParts = nums.slice(0, hemiIdx);
    const latHemi = nums[hemiIdx];
    const rest = nums.slice(hemiIdx + 1);
    const lonHemiIdx = rest.findIndex((p) => /^[EW]$/i.test(p));
    if (lonHemiIdx > 0) {
      const lonParts = rest.slice(0, lonHemiIdx);
      const lat = dmsToDec(latParts[0], latParts[1], latParts[2], latHemi);
      const lng = dmsToDec(lonParts[0], lonParts[1], lonParts[2], rest[lonHemiIdx]);
      return clampCoord(lat, lng);
    }
    return null;
  }
  // decimal: coord|45.1|13.3 (no hemisphere tokens)
  if (nums.length >= 2 && /^-?\d+(\.\d+)?$/.test(nums[0]) && /^-?\d+(\.\d+)?$/.test(nums[1])) {
    return clampCoord(Number(nums[0]), Number(nums[1]));
  }
  return null;
}

function clampCoord(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null; // null island
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// generic nouns wrongly captured as names from prose bullets
const JUNK_NAMES = new Set(['lifestyle', 'scuba diving', 'swimming', 'sunbathing', 'camping',
  'naturism', 'nudism', 'skinny dipping', 'topless', 'nude', 'beach', 'resort', 'the beach']);

// section/category headings that are not geographic regions
const GENERIC_HEADING = /^(nude beaches?|naturist beaches?|beaches?( and other natural areas)?|resorts?( and pools| and campgrounds)?|public beaches?|private resorts.*|clubs?|campgrounds?|camping|places|pools?|hot springs?|spas?|other( areas| counties)?|overseas departments?|mainland.*|caribbean|indian ocean|notes( and references)?|references|sources|external links|see also|further reading)$/i;

function classifySubtype(name, ctx) {
  const t = `${name} ${ctx}`.toLowerCase();
  if (/hot spring|onsen|therm(al|e)\b|bath(house|s)?\b/.test(t)) return 'Hot Spring';
  if (/\bbeach|plage|strand|playa|spiaggia|\bcove\b/.test(t)) return 'Nude Beach';
  if (/resort|\bclub\b|camp(ing|site|ground)?|fkk|natur(ist|isme|ism)|\bvillage\b|holiday|\bpool/.test(t)) return 'Naturist Resort';
  return 'Other';
}

// ---- Pass 1: parse one page's wikitext into entries using a heading stack ----
function parsePage(continent, wikitext, unresolved) {
  const lines = wikitext.split('\n');
  const stack = []; // [{level,title}]
  const entries = [];
  for (const line of lines) {
    const h = line.match(/^(={2,6})\s*(.*?)\s*\1\s*$/);
    if (h) {
      const level = h[1].length;
      const title = stripMarkup(h[2]).replace(/\[edit\]/i, '').trim();
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, title });
      continue;
    }
    const b = line.match(/^\*+\s*(.+)$/);
    if (!b) continue;
    const raw = b[1].trim();
    if (!raw || raw.length < 2) continue;

    // country = first stack heading that resolves to an ISO2 code (outermost match)
    let country = null, countryIdx = -1;
    for (let i = 0; i < stack.length; i++) {
      if (iso2(stack[i].title)) { country = stack[i].title; countryIdx = i; break; }
    }
    if (!country) {
      // track non-generic headings in scope that we failed to map (missing country?)
      for (const s of stack) {
        const tt = s.title;
        if (s.level <= 3 && tt.length >= 3 && tt.length <= 40 && !GENERIC_HEADING.test(tt)) unresolved.add(tt);
      }
      continue;
    }
    // region = deepest non-generic heading below the country
    let region = null;
    for (let i = stack.length - 1; i > countryIdx; i--) {
      if (!GENERIC_HEADING.test(stack[i].title)) { region = stack[i].title; break; }
    }
    // category context (all headings below country) for subtype hinting
    const ctx = stack.slice(countryIdx + 1).map((s) => s.title).join(' ');

    const link = firstLink(raw);
    const full = stripMarkup(raw);
    let name;
    if (link) {
      name = link.label;
    } else {
      // prose bullet: cut at first separator or sentence verb
      name = full.split(/[,:(]|\s[–—-]\s/)[0].trim();
      name = name.split(/\s+(?:is|are|was|were|in|near|on|at|located|offers?|has|have)\s+/i)[0].trim();
      if (name.split(/\s+/).length > 8) name = name.split(/\s+/).slice(0, 6).join(' ');
    }
    name = name.replace(/\{\{.*$/, '').replace(/\s+/g, ' ').trim();
    if (!name || name.length < 2 || name.length > 140) continue;
    if (/\{\{|\}\}|\[\[/.test(name)) continue; // skip residual-markup names
    if (JUNK_NAMES.has(name.toLowerCase())) continue; // prose-extraction junk
    // title-case a single lowercase-initial word (e.g. "morbihan" -> "Morbihan")
    if (/^[a-zà-ÿ]/.test(name) && !/['\s]/.test(name)) name = name[0].toUpperCase() + name.slice(1);
    if (/^(see also|references|external links|notes|further reading)$/i.test(name)) continue;

    const coord = parseCoord(raw);
    const wikiTitle = link ? link.title : null;

    entries.push({
      continent,
      country,
      region: region || null,
      name,
      wikiTitle,
      description: full,
      coord,
      venue_subtype: classifySubtype(name, `${full} ${ctx}`),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent((wikiTitle || name).replace(/ /g, '_'))}`,
    });
  }
  return entries;
}

// ---- Pass 2: batch coordinates for linked articles ----
async function fillCoords(entries) {
  const need = entries.filter((e) => !e.coord && e.wikiTitle);
  const titles = [...new Set(need.map((e) => e.wikiTitle))];
  const byTitle = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const j = await api({ action: 'query', prop: 'coordinates', coprimary: 'primary', titles: batch.join('|') });
    const pages = j?.query?.pages || [];
    for (const p of pages) {
      const c = p.coordinates && p.coordinates[0];
      if (c) byTitle.set(p.title, clampCoord(c.lat, c.lon));
      // normalized titles (redirects) — map both
    }
    // handle title normalization mapping
    for (const n of j?.query?.normalized || []) {
      if (byTitle.has(n.to)) byTitle.set(n.from, byTitle.get(n.to));
    }
    process.stdout.write(`\r  coords ${Math.min(i + 50, titles.length)}/${titles.length}`);
    await sleep(300);
  }
  process.stdout.write('\n');
  for (const e of need) {
    const c = byTitle.get(e.wikiTitle);
    if (c) e.coord = c;
  }
}

async function main() {
  let all = [];
  const unresolved = new Set();
  for (const [continent, page] of PAGES) {
    console.log(`fetching ${page} ...`);
    const j = await api({ action: 'parse', page, prop: 'wikitext' });
    const wt = j?.parse?.wikitext;
    if (!wt) { console.error(`  no wikitext for ${page}`); continue; }
    const entries = parsePage(continent, wt, unresolved);
    console.log(`  ${entries.length} entries`);
    all = all.concat(entries);
    await sleep(500);
  }
  if (unresolved.size) console.log(`\nUnresolved headings (not mapped to ISO2, check for missing countries):\n  ${[...unresolved].join(' | ')}`);

  console.log(`\nPass 2: linked-article coordinates...`);
  await fillCoords(all);

  // finalize: ISO2, address, drop entries with no resolvable country code
  const out = [];
  let noIso = 0;
  for (const e of all) {
    const code = iso2(e.country);
    if (!code) { noIso++; continue; }
    const lat = e.coord?.lat ?? null;
    const lng = e.coord?.lng ?? null;
    const addrParts = [e.name, e.region, e.country].filter(Boolean);
    out.push({
      continent: e.continent,
      country: e.country,
      country_code: code,
      region: e.region,
      name: e.name,
      wiki_title: e.wikiTitle,
      url: e.url,
      description: e.description,
      venue_subtype: e.venue_subtype,
      lat, lng,
      address: addrParts.join(', '),
      source_entity_id: 'wp:' + (e.wikiTitle || `${e.name}|${e.country}`).replace(/\s+/g, '_'),
    });
  }

  // de-dupe within our own dataset by source_entity_id (keep first, prefer one with coords)
  const seen = new Map();
  for (const e of out) {
    const prev = seen.get(e.source_entity_id);
    if (!prev || (!prev.lat && e.lat)) seen.set(e.source_entity_id, e);
  }
  const deduped = [...seen.values()];

  writeFileSync(join(HERE, 'places.json'), JSON.stringify(deduped, null, 2));

  // report
  const byContinent = {}, bySubtype = {};
  let withCoords = 0;
  for (const e of deduped) {
    byContinent[e.continent] = (byContinent[e.continent] || 0) + 1;
    bySubtype[e.venue_subtype] = (bySubtype[e.venue_subtype] || 0) + 1;
    if (e.lat != null && e.lng != null) withCoords++;
  }
  const lines = [
    `# Nude places extraction report`, '',
    `Total places: **${deduped.length}** (raw parsed: ${all.length}, dropped no-ISO2-country: ${noIso}, in-set dups removed: ${out.length - deduped.length})`,
    `With coordinates: **${withCoords}** (${Math.round((withCoords / deduped.length) * 100)}%) — rest geocoded post-commit via Photon`, '',
    `## By continent`, ...Object.entries(byContinent).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`), '',
    `## By subtype`, ...Object.entries(bySubtype).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`), '',
    `## Sample (first 20)`,
    ...deduped.slice(0, 20).map((e) => `- **${e.name}** (${e.venue_subtype}) — ${e.region ? e.region + ', ' : ''}${e.country} ${e.lat != null ? `[${e.lat.toFixed(3)},${e.lng.toFixed(3)}]` : '[no coords]'}`),
  ];
  writeFileSync(join(HERE, 'report.md'), lines.join('\n'));

  console.log(`\nDONE. ${deduped.length} places -> places.json`);
  console.log(`with coords: ${withCoords} (${Math.round((withCoords / deduped.length) * 100)}%), dropped no-ISO2: ${noIso}`);
  console.log(`continents: ${JSON.stringify(byContinent)}`);
  console.log(`subtypes: ${JSON.stringify(bySubtype)}`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
