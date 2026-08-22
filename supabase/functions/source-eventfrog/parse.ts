// ============================================================
// eventfrog.ch — pure parsing. Kept out of index.ts so it is testable
// without a network or a Supabase client (precedent: source-rss-news).
// ============================================================

export interface TileRef {
  /** Absolute path, e.g. /de/p/partys/lgbtiq/explicit-sept-5th-745….html */
  path: string
  /** ISO-2 the LISTING itself prints after the venue, e.g. "Zürich (CH)". */
  countryCode: string | null
}

export interface ParsedVenue {
  name: string
  street: string | null
  postal: string | null
  city: string | null
  /** ISO-2, or null when the two independent signals disagree / neither resolves. */
  country: string | null
}

export interface ParsedEvent {
  id: string
  url: string
  title: string
  start: string
  end: string | null
  description: string | null
  image: string | null
  eventType: string | null
  status: string | null
  organizer: string | null
  keywords: string[]
  price: { min: number | null; currency: string | null; soldOut: boolean }
  venue: ParsedVenue | null
  /** Both country signals, kept for audit even when they resolved cleanly. */
  countrySignals: { jsonLd: string | null; listing: string | null }
}

/**
 * The accent families, as combining marks — one rule instead of the ~60 rows of
 * `&auml; &ouml; &uuml; &eacute; …` that HTML4 spells out individually. NFC
 * recomposes "a"+U+0308 into "ä" so the output is a normal precomposed string.
 *
 * This is not cosmetic. eventfrog encodes SOME fields and not others (the same
 * event returned `Südpol` in location.name and `S&uuml;dpol` in organizer), and
 * a half-decoded string reaches the venue key, the search index and the page.
 */
const COMBINING: Record<string, string> = {
  uml: '̈', acute: '́', grave: '̀',
  circ: '̂', tilde: '̃', cedil: '̧', ring: '̊',
}

const NAMED: Record<string, string> = {
  nbsp: ' ', ndash: '–', mdash: '—', quot: '"', apos: "'",
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  laquo: '«', raquo: '»', hellip: '…', bull: '•', middot: '·',
  szlig: 'ß', aelig: 'æ', AElig: 'Æ', oelig: 'œ', OElig: 'Œ',
  oslash: 'ø', Oslash: 'Ø', aring: 'å', Aring: 'Å',
  eth: 'ð', ETH: 'Ð', thorn: 'þ', THORN: 'Þ',
  copy: '©', reg: '®', trade: '™', deg: '°', euro: '€', pound: '£',
  times: '×', amp: '&', lt: '<', gt: '>',
}

export const decodeEntities = (s: unknown): string =>
  String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_m, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    // &uuml; &eacute; &ntilde; … — letter + accent family
    .replace(/&([a-zA-Z])(uml|acute|grave|circ|tilde|cedil|ring);/g,
      (m, ch, kind) => COMBINING[kind] ? (ch + COMBINING[kind]).normalize('NFC') : m)
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED[name] ?? NAMED[name.toLowerCase()] ?? m)
    // &amp;uuml; and friends: decode the escaped ampersand LAST, then once more.
    .replace(/&([a-zA-Z])(uml|acute|grave|circ|tilde|cedil|ring);/g,
      (m, ch, kind) => COMBINING[kind] ? (ch + COMBINING[kind]).normalize('NFC') : m)
    .replace(/[ \t]+/g, ' ')
    .trim()

export const slugify = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * addressCountry is free text and multilingual on this site — "Switzerland",
 * "Schweiz", "Deutschland", "Austria" all appear. It is also NOT always a
 * country: one live row carries "Bayern", a German STATE. Anything not in this
 * map resolves to null rather than a guess; the listing's own ISO-2 code is the
 * second signal that then decides.
 */
const COUNTRY_WORDS: Record<string, string> = {
  ch: 'CH', switzerland: 'CH', schweiz: 'CH', suisse: 'CH', svizzera: 'CH', svizra: 'CH',
  de: 'DE', germany: 'DE', deutschland: 'DE', allemagne: 'DE', germania: 'DE',
  at: 'AT', austria: 'AT', 'österreich': 'AT', oesterreich: 'AT', autriche: 'AT',
  li: 'LI', liechtenstein: 'LI',
  fr: 'FR', france: 'FR', frankreich: 'FR', francia: 'FR',
  it: 'IT', italy: 'IT', italien: 'IT', italia: 'IT', italie: 'IT',
}

export function countryWordToIso2(raw: unknown): string | null {
  const w = decodeEntities(raw).toLowerCase()
  return w ? (COUNTRY_WORDS[w] ?? null) : null
}

/**
 * Two independent signals: the detail page's schema.org addressCountry and the
 * listing tile's "(CH)" suffix. Agreement or a lone signal wins; a genuine
 * DISAGREEMENT yields null — a missing country is recoverable downstream, a
 * wrong one silently mislocates the event (and, via the safety layer, can
 * mis-gate it).
 */
export function resolveCountry(jsonLdWord: unknown, listingCode: string | null): string | null {
  const a = countryWordToIso2(jsonLdWord)
  const b = listingCode && /^[A-Z]{2}$/.test(listingCode) ? listingCode : null
  if (a && b) return a === b ? a : null
  return a ?? b
}

const TZ_BY_COUNTRY: Record<string, string> = {
  CH: 'Europe/Zurich', DE: 'Europe/Berlin', AT: 'Europe/Vienna',
  LI: 'Europe/Vaduz', FR: 'Europe/Paris', IT: 'Europe/Rome',
}
export const timezoneForCountry = (iso2: string | null): string | null =>
  (iso2 && TZ_BY_COUNTRY[iso2]) || null

/**
 * The stable identity is the numeric id eventfrog puts at the end of every
 * detail URL. The slug in front of it is derived from the (editable) title.
 */
export function eventIdFromPath(path: string): string | null {
  return path.match(/-(\d{8,})\.html(?:$|[?#])/)?.[1] ?? null
}

/**
 * The site's own taxonomy, read off the URL: /de/p/<category>/<subcategory>/…
 * Only categories that map cleanly onto `events_event_type_check` are returned.
 */
const TYPE_BY_CATEGORY: Record<string, string> = {
  partys: 'party', parties: 'party', soirees: 'party',
  konzerte: 'concert', concerts: 'concert',
  theater: 'theater', buehne: 'theater',
  ausstellungen: 'exhibition', exhibitions: 'exhibition',
  festivals: 'festival',
  sport: 'sports', sports: 'sports',
}
export function eventTypeFromPath(path: string): string | null {
  const cat = path.match(/^\/[a-z]{2}\/p\/([^/]+)\//)?.[1]
  return cat ? (TYPE_BY_CATEGORY[cat] ?? null) : null
}

/** Listing tiles are server-rendered `<a class="event-list__events__tile">`. */
export function extractTiles(listingHtml: string): TileRef[] {
  const out = new Map<string, TileRef>()
  const re = /<a\s+href="(\/[a-z]{2}\/p\/[^"]+\.html)"[^>]*class="[^"]*event-list__events__tile[^"]*"[^>]*>([\s\S]*?)<\/a>/g
  for (const m of listingHtml.matchAll(re)) {
    const path = m[1]
    if (out.has(path)) continue
    const loc = m[2].match(/infos__location">([\s\S]*?)<\/span>/)?.[1] ?? ''
    out.set(path, { path, countryCode: decodeEntities(loc).match(/\(([A-Z]{2})\)\s*$/)?.[1] ?? null })
  }
  return [...out.values()]
}

/** The one `application/ld+json` block holds an array: Event + ImageObject + … */
export function readEventJsonLd(html: string): Record<string, unknown> | null {
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    let blob: unknown
    try { blob = JSON.parse(m[1]) } catch { continue }
    const arr = Array.isArray(blob) ? blob : [blob]
    const ev = arr.find((x) => x && typeof x === 'object' && (x as Record<string, unknown>)['@type'] === 'Event')
    if (ev) return ev as Record<string, unknown>
  }
  return null
}

/** "2026-09-05T22:00:00+0200" — a basic-format offset Postgres/JS both dislike. */
export function normalizeOffset(iso: unknown): string | null {
  const s = String(iso ?? '').trim()
  if (!s) return null
  return s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
}

function readOffers(ev: Record<string, unknown>): ParsedEvent['price'] {
  const raw = ev.offers
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Record<string, unknown>[]
  let min: number | null = null
  let currency: string | null = null
  let anyInStock = false
  for (const o of list) {
    const p = Number(o.price)
    if (Number.isFinite(p) && (min === null || p < min)) { min = p; currency = String(o.priceCurrency ?? '') || currency }
    if (!String(o.availability ?? '').includes('SoldOut')) anyInStock = true
  }
  return { min, currency, soldOut: list.length > 0 && !anyInStock }
}

export function parseEventPage(html: string, path: string, tile: TileRef | null): ParsedEvent | null {
  const ev = readEventJsonLd(html)
  if (!ev) return null

  const id = eventIdFromPath(path)
  const title = decodeEntities(ev.name)
  const start = normalizeOffset(ev.startDate)
  if (!id || !title || !start) return null

  const place = (ev.location ?? {}) as Record<string, unknown>
  const addr = (place.address ?? {}) as Record<string, unknown>
  const ldCountry = decodeEntities(addr.addressCountry) || null
  const country = resolveCountry(ldCountry, tile?.countryCode ?? null)

  const venueName = decodeEntities(place.name)
  const image = Array.isArray(ev.image) ? String(ev.image[0] ?? '') : String(ev.image ?? '')

  return {
    id,
    url: `https://eventfrog.ch${path}`,
    title,
    start,
    end: normalizeOffset(ev.endDate),
    description: decodeEntities(ev.description) || null,
    image: image.split('?')[0] || null,
    eventType: eventTypeFromPath(path),
    status: String(ev.eventStatus ?? '').split('/').pop() || null,
    organizer: decodeEntities((ev.organizer as Record<string, unknown>)?.name) || null,
    keywords: decodeEntities(ev.keywords).split(',').map((k) => k.trim()).filter(Boolean),
    price: readOffers(ev),
    venue: venueName
      ? {
          name: venueName,
          street: decodeEntities(addr.streetAddress) || null,
          postal: decodeEntities(addr.postalCode) || null,
          city: decodeEntities(addr.addressLocality) || null,
          country,
        }
      : null,
    countrySignals: { jsonLd: ldCountry, listing: tile?.countryCode ?? null },
  }
}

/** Venues have no id of their own here; name+city is the key, as on gay.ch. */
export const venueKey = (v: ParsedVenue): string => `${slugify(v.name)}|${slugify(v.city)}`
