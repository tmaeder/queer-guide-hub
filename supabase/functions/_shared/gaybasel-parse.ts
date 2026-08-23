// ============================================================
// gaybasel.org — pure parsing for the sitemap-driven Basel queer agenda.
//
// In _shared so a one-shot importer can reuse it (berlin-events-parse precedent).
//
// ── SHAPE ────────────────────────────────────────────────────
// `sitemap.xml` is the index for the whole site: 1,113 URLs, of which
// 544 are `/locations/<id>/<slug>` and only 7 are `/events/<id>/<slug>`.
// So this is primarily a VENUE source that also carries a small live agenda.
//
// Event detail pages carry a clean schema.org Event with a proper offset
// ("2026-08-25T18:00:00+02:00") — no German date parsing is needed. Location
// pages carry no JSON-LD but do carry an address block and, on ~60% of them,
// coordinates next to a Google Maps embed.
//
// ── THE SOFT-404 ─────────────────────────────────────────────
// Every unknown path answers **HTTP 200** with an identical 32,776-byte shell —
// `/events/list`, `/api/events` and a nonexistent location id all do. `res.ok`
// is therefore worthless here, and the sitemap does contain ids that no longer
// resolve. A page is real only if it carries the detail-view marker; without
// that check this source reports success while writing nothing, which is the
// exact `scrape_sources` failure this codebase already has on record.
//
// ── THE TRI-BORDER TRAP ──────────────────────────────────────
// Basel sits on the CH/DE/FR corner and GayBasel lists the whole region:
// measured, 3 of 46 sampled locations are in Freiburg im Breisgau, GERMANY
// (47.99, 7.85). A "must be in Switzerland" coordinate gate looks like a safety
// check and is actually a data-loss bug — it would drop real venues. Coordinates
// are therefore validated against the tri-border box, and `country` is left NULL
// rather than guessed from a coordinate that sits kilometres from a border.
// A NULL country is filled later from the linked city; a wrong one is not
// recoverable, and drives safety-gating.
// ============================================================

export interface GbVenue {
  /** Numeric id from /locations/<id>/<slug> — the site's own stable key. */
  id: string
  slug: string
  url: string
  name: string
  street: string | null
  postal: string | null
  city: string | null
  lat: number | null
  lng: number | null
}

export interface GbEvent {
  /** Numeric id from /events/<id>/<slug>. */
  id: string
  slug: string
  url: string
  title: string
  /** ISO-8601; the source already supplies a correct offset. */
  start: string
  end: string | null
  description: string | null
  image: string | null
  venueName: string | null
  street: string | null
  postal: string | null
  city: string | null
  country: string | null
}

/** Present on every real detail view and absent from the soft-404 shell. */
const DETAIL_MARKER = 'Zurück zur Übersicht'

/**
 * The only reliable liveness test on this host. Do NOT substitute a status-code
 * or byte-length check: the shell is served with 200, and its length changes
 * whenever the homepage teasers change.
 */
export const isRealDetailPage = (html: unknown): boolean =>
  String(html ?? '').includes(DETAIL_MARKER)

export const stripTags = (s: unknown): string =>
  String(s ?? '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The sitemap advertises `gaybasel.ch`, which 301s to `.org` on every request.
 * Rewriting once here saves a redirect per URL across 1,113 of them.
 */
export function urlsFromSitemap(xml: unknown): { events: string[]; locations: string[] } {
  const locs = [...String(xml ?? '').matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?\s*<\/loc>/g)]
    .map((m) => m[1].trim().replace('gaybasel.ch', 'gaybasel.org'))
  return {
    events: [...new Set(locs.filter((l) => /\/events\/\d+\//.test(l)))],
    locations: [...new Set(locs.filter((l) => /\/locations\/\d+\//.test(l)))],
  }
}

export const idFromUrl = (url: unknown, kind: 'events' | 'locations'): string | null =>
  String(url ?? '').match(new RegExp(`/${kind}/(\\d+)/`))?.[1] ?? null

export const slugFromUrl = (url: unknown): string | null =>
  String(url ?? '').match(/\/(?:events|locations)\/\d+\/([^/?#]+)/)?.[1] ?? null

/**
 * `addressLocality` is sometimes "Basel" and sometimes "4058 Basel" — the postal
 * code prefixed into the city. A numeric-leading city would fail
 * `events_city_nonjunk_check` on the way in, so split rather than pass through.
 */
export function splitLocality(raw: unknown): { postal: string | null; city: string | null } {
  const s = stripTags(raw)
  if (!s) return { postal: null, city: null }
  const m = s.match(/^(\d{4,5})\s+(.+)$/)
  if (m) return { postal: m[1], city: m[2].trim() }
  return /^\d+$/.test(s) ? { postal: s, city: null } : { postal: null, city: s }
}

/**
 * The tri-border box: Basel plus the slice of Baden-Württemberg and Alsace this
 * agenda actually covers. Deliberately NOT a Switzerland-only test — see header.
 */
export function plausibleCoord(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = Number(lat), ln = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln) || la === 0 || ln === 0) return null
  return la > 45.5 && la < 48.6 && ln > 5.5 && ln < 10.8 ? { lat: la, lng: ln } : null
}

/** The one `application/ld+json` Event on an event detail page. */
export function readEventJsonLd(html: unknown): Record<string, unknown> | null {
  for (const m of String(html ?? '').matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let blob: unknown
    try { blob = JSON.parse(m[1]) } catch { continue }
    for (const o of (Array.isArray(blob) ? blob : [blob])) {
      if (o && typeof o === 'object' && String((o as Record<string, unknown>)['@type'] ?? '').includes('Event')) {
        return o as Record<string, unknown>
      }
    }
  }
  return null
}

export function parseEvent(html: unknown, url: string): GbEvent | null {
  if (!isRealDetailPage(html)) return null
  const ev = readEventJsonLd(html)
  const id = idFromUrl(url, 'events')
  if (!ev || !id) return null

  const title = stripTags(ev.name)
  const start = String(ev.startDate ?? '').trim()
  // commit RAISEs on a missing title or start date; drop here instead.
  if (!title || !start) return null

  const place = (ev.location ?? {}) as Record<string, unknown>
  const addr = (place.address ?? {}) as Record<string, unknown>
  const { postal, city } = splitLocality(addr.addressLocality)
  const image = Array.isArray(ev.image) ? String(ev.image[0] ?? '') : String(ev.image ?? '')
  const cc = stripTags(addr.addressCountry).toUpperCase()

  return {
    id,
    slug: slugFromUrl(url) ?? id,
    url,
    title,
    start,
    end: String(ev.endDate ?? '').trim() || null,
    description: stripTags(ev.description) || null,
    image: image ? image.split('?')[0] : null,
    venueName: stripTags(place.name) || null,
    street: stripTags(addr.streetAddress) || null,
    postal,
    city,
    country: /^[A-Z]{2}$/.test(cc) ? cc : null,
  }
}

/**
 * Location pages have no JSON-LD. The address block follows an "Adresse"
 * heading; coordinates sit beside the Google Maps embed.
 */
export function parseLocation(html: unknown, url: string): GbVenue | null {
  const h = String(html ?? '')
  if (!isRealDetailPage(h)) return null
  const id = idFromUrl(url, 'locations')
  if (!id) return null

  const text = h
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
  const lines = text.split('\n').map((l) => stripTags(l)).filter(Boolean)

  const back = lines.indexOf(DETAIL_MARKER)
  const name = back >= 0 ? (lines[back + 1] ?? '') : (lines[0] ?? '')
  // "(tba)" is the site's placeholder for an unannounced venue, not a place.
  if (!name || /^\(tba\)$/i.test(name)) return null

  const ai = lines.findIndex((l) => /^Adresse$/i.test(l))
  const block = ai >= 0 ? lines.slice(ai + 1, ai + 6) : []
  // The block repeats the venue name, then street, then city — but it can also
  // carry UI labels, and those look exactly like a city to a "letters only"
  // test. Measured on the first live run: 20 venues were staged with
  // city="Website" because that link sits inside the address block. Any label
  // added here must also be excluded, hence a list rather than one special case.
  const LABELS = /^(Karte|Website|Webseite|Details|Telefon|Tel\.?|E-?Mail|Kontakt|Anfahrt|Öffnungszeiten|Facebook|Instagram)$/i
  const rest = block.filter((l) =>
    l !== name && !LABELS.test(l) && !/^\d{4}\s*-$/.test(l))
  const cityIdx = rest.findIndex((l) => /^(\d{4,5}\s+)?[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]+$/.test(l) && !/strasse|str\.|gasse|weg|platz|allee|\d+\s*[A-Za-z]?$/i.test(l))
  const cityRaw = cityIdx >= 0 ? rest[cityIdx] : null
  const street = rest.find((l) => l !== cityRaw) ?? null
  const { postal, city } = splitLocality(cityRaw)

  // The separator class excludes `-` so a NEGATIVE longitude is never read as
  // the gap between the pair. Trailing position makes it literal, no escape.
  const cm = h.match(/(4[0-9]\.\d{4,})[^0-9-]{1,30}([0-9]{1,2}\.\d{4,})/)
  const coord = cm ? plausibleCoord(cm[1], cm[2]) : null

  return {
    id, slug: slugFromUrl(url) ?? id, url, name,
    street: street || null, postal, city,
    lat: coord?.lat ?? null, lng: coord?.lng ?? null,
  }
}
