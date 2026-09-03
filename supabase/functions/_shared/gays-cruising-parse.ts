// ============================================================
// gays-cruising.com — pure parsing for the cruising-zone directory.
//
// NOT WIRED TO A FETCHER. This module parses bytes it is handed; nothing here
// contacts the origin. `source-gays-cruising` stays disabled until Keyup Studio
// S.L. supply the express written consent their Condiciones de Uso §5 require
// (§17 Spanish law, §18 the entity, §19 the contact). Parsing offline against
// fixtures is the half of the work that does not need their permission.
//
// ── LICENCE BOUNDARY, ENFORCED BY THE TYPE ───────────────────
// `CruisingSpot` has NO description / prose field, deliberately. The spot write-
// ups are their USERS' authored text; the identifiers, coordinates and a link
// back are facts. Adding a prose field here is the thing to argue about in
// review, not something to slip in — `gaysCruisingLicence.test.ts` fails if one
// appears. Same rule as the drgay.ch precedent already in this repo.
//
// ── SHAPE (measured 2026-08-30 via the operator's own public sitemaps) ──
// `sitemap_zonas_cruising_aprobadas_GC.xml` is an INDEX of 24 child sitemaps:
// 3 files x 8 language paths (es/en/de/it/fr/pt/nl/pl). The Spanish set alone
// is 25,000 + 25,000 + 8,618 = 58,618 URLs.
//
// ── TRAP 1: THE SAME SPOT APPEARS IN EVERY LANGUAGE ──────────
// 24 sitemaps do NOT mean 24 x 58,618 spots — they are translations of one set,
// and the numeric id is identical across them. Import without deduping by that
// id and you create up to EIGHT rows per spot. `dedupeBySourceId` exists for
// exactly this; it is not an optimisation.
//
// ── TRAP 2: THE SLUG CANNOT BE SPLIT INTO FIELDS ─────────────
// `signy_centre_wc_etage_coop_nyon_suisse_83162` is
// <name...>_<city>_<country>_<id> with `_` separating BOTH words and fields, so
// there is no positional split that recovers the name. Only the trailing id and
// the country token are safely recoverable from a URL. Name and city come from
// the page's schema.org `Place`, never from the slug.
//
// ── TRAP 3: THE COUNTRY TOKEN IS NOT IN THE PAGE'S LANGUAGE ──
// Inside the /es/ sitemap the tokens observed include `suisse` (French),
// `osterreich` (German), `brasil` and `estados_unidos`. So it is not "Spanish
// because the path is /es/". The map below is therefore partial ON PURPOSE and
// an unknown token yields `undefined`, never a guess and never `''` —
// `venues_country_iso2_check` allows NULL but rejects the empty string, and a
// wrong country drives safety-gating, which is not a recoverable error.
//
// ── TRAP 4: `lastmod` IS USELESS AS A FRESHNESS SIGNAL ───────
// Every one of the 24 sitemaps carries `2025-03-01`. It is a build stamp, not a
// per-spot modification date, so it cannot drive an incremental sync.
// ============================================================

/**
 * A cruising spot, restricted to facts.
 *
 * There is intentionally no `description`. See the licence boundary above.
 */
export interface CruisingSpot {
  /** Trailing numeric id from the slug — the site's own stable key. */
  sourceId: string;
  /** Display name from schema.org `Place`, city suffix stripped. */
  name: string;
  city?: string;
  /** ISO-2, or undefined. NEVER `''` — that violates venues_country_iso2_check. */
  countryCode?: string;
  lat?: number;
  lng?: number;
  /** Canonical URL, published as attribution. */
  url: string;
}

/**
 * Country tokens seen in slugs → ISO-2. Deliberately partial: an unmapped token
 * returns undefined so the existing pipeline resolves the country from the
 * linked city (`derive_entity_geo_address` / `resolve_country_from_text`, which
 * demands city corroboration for ambiguous codes) rather than this file
 * guessing from a string.
 */
export const COUNTRY_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  espana: 'ES',
  spain: 'ES',
  spanien: 'ES',
  suisse: 'CH',
  schweiz: 'CH',
  switzerland: 'CH',
  svizzera: 'CH',
  osterreich: 'AT',
  austria: 'AT',
  deutschland: 'DE',
  germany: 'DE',
  alemania: 'DE',
  france: 'FR',
  francia: 'FR',
  frankreich: 'FR',
  italia: 'IT',
  italy: 'IT',
  italien: 'IT',
  portugal: 'PT',
  brasil: 'BR',
  brazil: 'BR',
  nederland: 'NL',
  netherlands: 'NL',
  paises_bajos: 'NL',
  polska: 'PL',
  poland: 'PL',
  polonia: 'PL',
  estados_unidos: 'US',
  united_states: 'US',
  reino_unido: 'GB',
  united_kingdom: 'GB',
  mexico: 'MX',
  argentina: 'AR',
  colombia: 'CO',
  chile: 'CL',
  belgica: 'BE',
  belgium: 'BE',
});

/** Longest tokens first, so `estados_unidos` wins over a bare `unidos`. */
const TOKENS_BY_LENGTH = Object.keys(COUNTRY_TOKENS).sort((a, b) => b.length - a.length);

/** `<loc>` values from a sitemap or sitemap index, in document order. */
export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

export interface SpotUrlParts {
  sourceId: string;
  /** Two-letter language path segment, e.g. `es`. */
  lang: string;
  /** Raw country token from the slug, un-normalised. */
  countryToken?: string;
}

/**
 * Recover only what a URL can safely yield: the id, the language path and the
 * country token. Name and city are NOT derivable here — see trap 2.
 */
export function parseSpotUrl(url: string): SpotUrlParts | null {
  const m = /\/([a-z]{2})\/cruising\/([^/?#]+)$/.exec(url);
  if (!m) return null;
  const [, lang, slug] = m;

  const idMatch = /_(\d+)$/.exec(slug);
  if (!idMatch) return null;
  const sourceId = idMatch[1];

  // Country token sits immediately before the id. Match longest-first against
  // the known set rather than taking "the token before the id", which would
  // pick up `unidos` from `estados_unidos`.
  const beforeId = slug.slice(0, slug.length - idMatch[0].length);
  const countryToken = TOKENS_BY_LENGTH.find((t) => beforeId.endsWith(`_${t}`));

  return { sourceId, lang, countryToken };
}

/** First schema.org object of the given @type, or null. */
function jsonLdOfType(html: string, type: string): Record<string, unknown> | null {
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1].trim());
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
        if (node && typeof node === 'object' && node['@type'] === type) {
          return node as Record<string, unknown>;
        }
      }
    } catch {
      // A malformed block is not fatal — a page may carry several.
      continue;
    }
  }
  return null;
}

function finiteNumber(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/**
 * schema.org `name` is "<venue name>, <city>". Split on the LAST comma so a
 * venue whose own name contains one ("Bar Le Nord, Sud") keeps it.
 * A name with no comma yields no city rather than a wrong one.
 */
export function splitNameAndCity(raw: string): { name: string; city?: string } {
  const s = raw.trim();
  const i = s.lastIndexOf(',');
  if (i <= 0 || i === s.length - 1) return { name: s };
  return { name: s.slice(0, i).trim(), city: s.slice(i + 1).trim() || undefined };
}

/**
 * Parse a spot detail page. Returns null when the page carries no usable
 * `Place` — absence of evidence, so the caller can tally it rather than
 * recording a defective row.
 *
 * Deliberately ignores `description`: on this source it is a generated template
 * ("Información de la zona cruising X…"), and prose is outside the licence
 * boundary regardless.
 */
export function parseSpotPage(html: string, url: string): CruisingSpot | null {
  const parts = parseSpotUrl(url);
  if (!parts) return null;

  const place = jsonLdOfType(html, 'Place');
  if (!place) return null;

  const rawName = typeof place.name === 'string' ? place.name.trim() : '';
  if (!rawName) return null;

  const { name, city } = splitNameAndCity(rawName);

  const geo = (place.geo ?? null) as Record<string, unknown> | null;
  const lat = geo ? finiteNumber(geo.latitude) : undefined;
  const lng = geo ? finiteNumber(geo.longitude) : undefined;

  return {
    sourceId: parts.sourceId,
    name,
    city,
    countryCode: parts.countryToken ? COUNTRY_TOKENS[parts.countryToken] : undefined,
    // Only publish a pair. A lone latitude is not a location, and 0/0 is Null
    // Island — the venues trigger coerces it, but emitting it is still wrong.
    ...(lat !== undefined && lng !== undefined && !(lat === 0 && lng === 0) ? { lat, lng } : {}),
    url: typeof place.url === 'string' && place.url ? place.url : url,
  };
}

/**
 * Collapse the per-language duplicates. Keeps first occurrence, so callers
 * should feed the canonical language first. See trap 1 — without this a spot
 * lands up to eight times.
 */
export function dedupeBySourceId(spots: CruisingSpot[]): CruisingSpot[] {
  const seen = new Set<string>();
  const out: CruisingSpot[] = [];
  for (const s of spots) {
    if (seen.has(s.sourceId)) continue;
    seen.add(s.sourceId);
    out.push(s);
  }
  return out;
}
