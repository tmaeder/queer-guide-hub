// Parsers for spartacus.gayguide.travel listing pages.
//
// HOST: it is `spartacus.gayguide.travel`, NOT `spartacus.world`. The latter
// answers every path with HTTP 200 and a 114-byte empty body — a soft-200 —
// which is why the original source-spartacus adapter pointed at it, matched
// zero listings, and produced no rows for its entire life without ever
// erroring. Do not "restore" that host.
//
// A country listing page (`/<vertical>/search/?s=true&countries_id=<id>`)
// returns EVERY venue for that country in one response — there is no
// pagination — and embeds a Leaflet marker array carrying coordinates,
// category icon, name and the detail URL for each one. That array is the
// cheapest complete view of the corpus: ~190 requests covers all ~5,800
// venues, versus one request per venue.

export interface SpartacusMarker {
  id: string
  url: string
  name: string
  countrySlug: string
  regionSlug: string | null
  citySlug: string
  lat: number
  lng: number
  marker: string
}

/**
 * The marker array double-encodes non-ASCII: Spartacus takes the UTF-8 bytes
 * of a name and JSON-escapes each BYTE as its own codepoint, so "Bravó"
 * ships as "BravÃ³" and JSON.parse faithfully yields "BravÃ³".
 * Reverse it by re-reading the codepoints as latin-1 bytes and decoding those
 * as UTF-8. Detail-page HTML is clean UTF-8 and must NOT be run through this.
 */
export function fixMojibake(s: string): string {
  if (typeof s !== 'string' || !/[ÃÂÐÑ][-¿]/.test(s)) return s
  try {
    const bytes = Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 0xff))
    const fixed = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    return fixed.includes('�') ? s : fixed
  } catch {
    return s
  }
}

/**
 * Detail URLs carry a VARIABLE number of geo segments — countries with a
 * province/state tier insert an extra one:
 *
 *   /goingout/malta/malta-valletta/2063_Tom+Bar           (country/city)
 *   /goingout/canada/quebec/montreal/65079_1000+Grammes   (country/region/city)
 *
 * Pinning this to exactly two geo segments silently drops every federal
 * country: Canada yielded 0 of its 93 venues under that assumption, and the
 * USA — the largest country in the corpus at 1,135 — would have gone the same
 * way, with no error to notice. 1,631 of 5,783 rows (28%) sit behind this.
 */
export function parseDetailUrl(
  url: string,
): { vertical: string; country: string; region: string | null; city: string; id: string } | null {
  const m = /\/(goingout|saunas)\/(.+?)\/(\d+)_[^/]*$/.exec(url)
  if (!m) return null
  const segs = m[2].split('/').filter(Boolean)
  if (!segs.length) return null
  return {
    vertical: m[1],
    country: segs[0],
    region: segs.length > 2 ? segs.slice(1, -1).join('/') : null,
    city: segs[segs.length - 1],
    id: m[3],
  }
}

/** Extract the Leaflet marker array from a country listing page. */
export function parseMarkers(html: string): SpartacusMarker[] {
  const m = /var\s+markers\s*=\s*(\[[\s\S]*?\]);/.exec(html)
  if (!m) return []
  let arr: unknown
  try {
    arr = JSON.parse(m[1])
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []

  const out: SpartacusMarker[] = []
  for (const row of arr) {
    if (!Array.isArray(row) || row.length < 5) continue
    const [lat, lng, icon, name, popup] = row as [number, number, string, string, string]
    const href = /href=\\?"([^"\\]+)\\?"/.exec(popup) ?? /href="([^"]+)"/.exec(popup)
    if (!href) continue
    const url = href[1].replace(/\\\//g, '/')
    const parsed = parseDetailUrl(url)
    if (!parsed) continue
    out.push({
      id: parsed.id,
      url,
      name: fixMojibake(decodeEntities(String(name))),
      countrySlug: parsed.country,
      regionSlug: parsed.region,
      citySlug: parsed.city,
      lat: Number(lat),
      lng: Number(lng),
      marker: String(icon ?? '').replace(/marker\.png$/, '').replace(/\.png$/, ''),
    })
  }
  return out
}

/** Country <option value="id">Name</option> pairs from a vertical's search form. */
export function parseCountries(html: string): Array<{ id: string; name: string }> {
  const sel = /<select[^>]*name="countries_id"[\s\S]*?<\/select>/i.exec(html)
  if (!sel) return []
  const out: Array<{ id: string; name: string }> = []
  for (const m of sel[0].matchAll(/<option value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)) {
    const id = m[1].trim()
    const name = decodeEntities(m[2].replace(/<[^>]+>/g, '')).trim()
    if (id && name) out.push({ id, name })
  }
  return out
}

export function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: '&', quot: '"', lt: '<', gt: '>', nbsp: ' ',
    uuml: 'ü', auml: 'ä', ouml: 'ö', szlig: 'ß', eacute: 'é', egrave: 'è',
    agrave: 'à', ccedil: 'ç', ntilde: 'ñ', aacute: 'á', iacute: 'í',
    oacute: 'ó', uacute: 'ú',
  }
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (full, n) => named[String(n).toLowerCase()] ?? full)
}

/**
 * Spartacus marker-icon stems and category labels -> the `venues_category_check`
 * vocabulary. This map MUST be total: `commit_venue_staging_item` defaults a
 * missing category to the string 'unknown', which the CHECK constraint does not
 * allow, so an unmapped row is rejected at commit rather than merely
 * mis-categorised. Unknowns therefore fall through to 'other', never 'unknown'.
 */
const CATEGORY_MAP: Record<string, string> = {
  bar: 'bar', bars: 'bar',
  club: 'club', clubs: 'club', danceclubs: 'club',
  cafe: 'cafe', cafes: 'cafe',
  restaurant: 'restaurant', restaurants: 'restaurant',
  hotel: 'hotel', hotels: 'hotel', apartments: 'hotel', guesthouses: 'hotel',
  sauna: 'sauna', saunas: 'sauna',
  cruising: 'cruising', cruisingareas: 'cruising', cruisingclubs: 'cruising', darkrooms: 'cruising',
  shop: 'shop', shops: 'shop', sexshops: 'shop', shopping: 'shop', fetish: 'shop', bookshops: 'shop',
  groups: 'community_center',
  organisations: 'organization', organizations: 'organization', health: 'organization',
  beach: 'outdoor', beaches: 'outdoor', parks: 'outdoor', outdoor: 'outdoor',
  theaters: 'theater', cinemas: 'theater',
  galleries: 'gallery',
  gym: 'gym', gyms: 'gym', fitness: 'gym', fitnessstudios: 'gym',
  escorts: 'other', services: 'other', travel: 'other',
  travelandtransport: 'other', generalinfo: 'other',
}

export function mapCategory(opts: { marker?: string | null; label?: string | null; vertical?: string | null }): string {
  for (const raw of [opts.marker, opts.label]) {
    if (!raw) continue
    const k = String(raw).toLowerCase().replace(/[^a-z]/g, '')
    if (CATEGORY_MAP[k]) return CATEGORY_MAP[k]
  }
  if (opts.vertical === 'saunas') return 'sauna'
  return 'other'
}
