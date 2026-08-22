// Parsers for www.patroc.com city-guide pages (European gay travel guide).
//
// Site shape (verified live 2026-08-22): ~38 fixed city guides under
// /gay/<city>/. Each city has an index page whose "Upcoming Events" section is
// hCalendar microformat (`div.vevent id="news<ID>"`), plus per-category
// listing pages (bars.html, clubs.html, saunas.html, …) whose entries are
// `div.item id="<ID>"` blocks with classed fields.
//
// THREE record kinds share one numeric id space, discriminated by markup:
//   - `class="item" id="123"`            -> a venue
//   - `class="vevent item" id="123"`     -> a RECURRING party (venue-shaped
//                                           block + "Next party" dtstart)
//   - `class="vevent item" id="event123"` / `div.vevent id="news123"`
//                                        -> a dated one-off event
//
// The aggregate gayguide.html page must NOT be used as a venue source: it
// strips the `vevent` class from recurring parties, so Gayhane (a party night
// at SO36) is indistinguishable from Berghain (a venue) there. That ambiguity
// is exactly how the 2026-04 import filed "Ibiza Gay Pride 2026" as a bar.
// Category pages keep the discriminator, so they are the only safe source.
//
// Coordinates + Google Place id ride on every block via
//   map_external('<lat>','<lng>',zoom,'<id>','<ChIJ…>')

import { decodeEntities, stripTags } from './spartacus-parse.ts'

export interface PatrocVenue {
  id: string
  slug: string | null
  name: string
  page: string // category page basename, e.g. "bars"
  section: string | null // nearest preceding <h2> text
  hoursText: string | null
  description: string | null
  websites: string[]
  street: string | null
  cityLine: string | null // raw "City 10245" line from the adr block
  transport: string | null
  phone: string | null
  lat: number | null
  lng: number | null
  googlePlaceId: string | null
}

export interface PatrocEvent {
  id: string
  slug: string | null
  title: string
  startDate: string | null // YYYY-MM-DD (abbr.dtstart title)
  endDate: string | null // YYYY-MM-DD (abbr.dtend title)
  startTime: string | null // HH:MM parsed from the block's own time text
  endTime: string | null
  recurring: boolean // numeric-id vevent = recurring party with a "next" date
  hoursText: string | null // e.g. "Usually last Saturday of the month, …"
  description: string | null
  websites: string[]
  venueName: string | null
  street: string | null
  cityLine: string | null
  lat: number | null
  lng: number | null
  googlePlaceId: string | null
}

const CITY_RE = /https:\/\/www\.patroc\.com\/gay\/([a-z-]+)\//

/** The fixed city catalogue: slug -> country ISO2 + IANA timezone.
 * Gran Canaria is the one non-obvious pair: Canary Islands are Atlantic/Canary,
 * an hour off Europe/Madrid. */
export const PATROC_CITIES: Record<string, { country: string; timezone: string }> = {
  alicante: { country: 'ES', timezone: 'Europe/Madrid' },
  amsterdam: { country: 'NL', timezone: 'Europe/Amsterdam' },
  antwerp: { country: 'BE', timezone: 'Europe/Brussels' },
  barcelona: { country: 'ES', timezone: 'Europe/Madrid' },
  bilbao: { country: 'ES', timezone: 'Europe/Madrid' },
  bologna: { country: 'IT', timezone: 'Europe/Rome' },
  brussels: { country: 'BE', timezone: 'Europe/Brussels' },
  budapest: { country: 'HU', timezone: 'Europe/Budapest' },
  cologne: { country: 'DE', timezone: 'Europe/Berlin' },
  copenhagen: { country: 'DK', timezone: 'Europe/Copenhagen' },
  florence: { country: 'IT', timezone: 'Europe/Rome' },
  frankfurt: { country: 'DE', timezone: 'Europe/Berlin' },
  grancanaria: { country: 'ES', timezone: 'Atlantic/Canary' },
  hamburg: { country: 'DE', timezone: 'Europe/Berlin' },
  ibiza: { country: 'ES', timezone: 'Europe/Madrid' },
  lisbon: { country: 'PT', timezone: 'Europe/Lisbon' },
  london: { country: 'GB', timezone: 'Europe/London' },
  madrid: { country: 'ES', timezone: 'Europe/Madrid' },
  marseille: { country: 'FR', timezone: 'Europe/Paris' },
  milan: { country: 'IT', timezone: 'Europe/Rome' },
  montpellier: { country: 'FR', timezone: 'Europe/Paris' },
  munich: { country: 'DE', timezone: 'Europe/Berlin' },
  mykonos: { country: 'GR', timezone: 'Europe/Athens' },
  naples: { country: 'IT', timezone: 'Europe/Rome' },
  nice: { country: 'FR', timezone: 'Europe/Paris' },
  nuremberg: { country: 'DE', timezone: 'Europe/Berlin' },
  paris: { country: 'FR', timezone: 'Europe/Paris' },
  prague: { country: 'CZ', timezone: 'Europe/Prague' },
  rome: { country: 'IT', timezone: 'Europe/Rome' },
  seville: { country: 'ES', timezone: 'Europe/Madrid' },
  sitges: { country: 'ES', timezone: 'Europe/Madrid' },
  stockholm: { country: 'SE', timezone: 'Europe/Stockholm' },
  stuttgart: { country: 'DE', timezone: 'Europe/Berlin' },
  torremolinos: { country: 'ES', timezone: 'Europe/Madrid' },
  valencia: { country: 'ES', timezone: 'Europe/Madrid' },
  vienna: { country: 'AT', timezone: 'Europe/Vienna' },
  zurich: { country: 'CH', timezone: 'Europe/Zurich' },
}

/** Category page basename -> venues_category_check vocabulary. Must be total
 * over whatever the city menus link (unknowns fall through to 'other', never
 * 'unknown' — commit rejects 'unknown' outright). `cinemas` are cruising
 * cinemas on this site, not arthouse theaters. */
const PAGE_CATEGORY: Record<string, string> = {
  bars: 'bar',
  cafes: 'cafe',
  restaurants: 'restaurant',
  clubs: 'club',
  cruising: 'cruising',
  cinemas: 'cruising',
  saunas: 'sauna',
  shops: 'shop',
  services: 'other',
  hotels: 'hotel',
  beaches: 'outdoor',
}

export function mapPageCategory(page: string): string {
  return PAGE_CATEGORY[page.toLowerCase().replace(/\.html$/, '')] ?? 'other'
}

/** Extract the category-page basenames a city menu links to, both as plain
 * hrefs and as bpu('bars.html', …) javascript links. */
export function parseCategoryPages(html: string): string[] {
  const menu = /<div id="categories">([\s\S]*?)<div id="show_cities"/.exec(html)
  const scope = menu ? menu[1] : html
  const out = new Set<string>()
  for (const m of scope.matchAll(/bpu\('([a-z-]+\.html)'/g)) out.add(m[1].replace(/\.html$/, ''))
  for (const m of scope.matchAll(/href="https:\/\/www\.patroc\.com\/gay\/[a-z-]+\/([a-z-]+)\.html"/g)) {
    if (m[1] !== 'gayguide' && m[1] !== 'index') out.add(m[1])
  }
  return [...out]
}

const text = (h: string) => decodeEntities(stripTags(h)).replace(/\s+/g, ' ').trim()

function firstMatch(re: RegExp, s: string): string | null {
  const m = re.exec(s)
  return m ? m[1] : null
}

/** map_external('<lat>','<lng>',zoom,'<id>','<placeId>') */
function parseMapCall(block: string): { lat: number | null; lng: number | null; googlePlaceId: string | null } {
  const m = /map_external\('(-?[\d.]+)','(-?[\d.]+)',\d+,'[^']*','([^']*)'\)/.exec(block)
  if (!m) return { lat: null, lng: null, googlePlaceId: null }
  const lat = Number(m[1])
  const lng = Number(m[2])
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    googlePlaceId: m[3] || null,
  }
}

/** All external links in a block's `communication` / `news-website` divs.
 * Booking.com affiliate links are patroc's monetisation, not the venue's own
 * site — keep them out of the website field. */
function parseWebsites(block: string): string[] {
  const out: string[] = []
  for (const m of block.matchAll(
    /<div class="(?:communication|news-website)"[^>]*>[\s\S]*?href="(https?:\/\/[^"]+)"/g,
  )) {
    const u = m[1]
    if (/booking\.com\//i.test(u)) continue
    if (!out.includes(u)) out.push(u)
  }
  return out
}

/**
 * The adr block:
 *   <div class="adr" …><span …>@ [VenueName]</span> Street <br /> City 10245 </div>
 * For venue items the span is a bare "@ " marker; for event blocks it carries
 * the venue name. Lines after the span are street, then "City Postal".
 */
function parseAdr(block: string): { atName: string | null; street: string | null; cityLine: string | null } {
  const adr = /<div class="adr"[^>]*>([\s\S]*?)<\/div>/.exec(block)
  if (!adr) return { atName: null, street: null, cityLine: null }
  let inner = adr[1]
  let atName: string | null = null
  const span = /<span[^>]*>@\s*([\s\S]*?)<\/span>/.exec(inner)
  if (span) {
    atName = text(span[1]) || null
    inner = inner.replace(span[0], '')
  }
  const lines = inner
    .split(/<br\s*\/?>/i)
    .map((l) => text(l))
    .filter(Boolean)
  return {
    atName,
    street: lines.length > 1 ? lines[0] : null,
    // Single-line adr blocks carry just the city line.
    cityLine: lines.length > 1 ? lines[lines.length - 1] : (lines[0] ?? null),
  }
}

/** "Berlin 10245" -> {city, postal}; "London SE1 3UJ" -> {city, postal};
 * a line with no digits is all city ("Playa del Inglés"). */
export function splitCityLine(line: string | null): { city: string | null; postal: string | null } {
  if (!line) return { city: null, postal: null }
  const t = line.trim()
  const m = /^(.*?)\s+((?:\d[\d-]{2,9})|(?:[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}))$/.exec(t)
  if (m && m[1]) return { city: m[1].trim(), postal: m[2].replace(/\s+/g, ' ').trim() }
  return { city: t || null, postal: null }
}

/** Split a page into `div.item` / `div.vevent` blocks, keeping the nearest
 * preceding <h2> as the section label. Blocks end at the next block, the next
 * h2, or the footer — the markup nests no item inside another. */
function* blocks(html: string): Generator<{ classes: string; id: string; section: string | null; body: string }> {
  const re = /<div class="((?:vevent )?item|vevent)[^"]*" id="([^"]+)"[^>]*>|<h2[^>]*>([\s\S]*?)<\/h2>|<div id="Footer">/g
  let section: string | null = null
  let open: { classes: string; id: string; section: string | null; start: number } | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (open) {
      yield { ...open, body: html.slice(open.start, m.index) }
      open = null
    }
    if (m[3] !== undefined) {
      section = text(m[3]) || section
    } else if (m[1] !== undefined) {
      open = { classes: m[1], id: m[2], section, start: m.index }
    }
    // Footer both closes any open block (handled above) and ends the scan.
    if (m[0] === '<div id="Footer">') break
  }
  if (open) yield { ...open, body: html.slice(open.start) }
}

function parseName(body: string): { name: string | null; slug: string | null } {
  const loc = /<div id="([^"]*)"[^>]*class="locationname"[^>]*>([\s\S]*?)<\/div>/.exec(body)
  if (!loc) return { name: null, slug: null }
  const anchor = /<a class="url" href="d\/([^"]+)\.html"[^>]*>([\s\S]*?)<\/a>/.exec(loc[2])
  if (anchor) return { name: text(anchor[2]) || null, slug: anchor[1] }
  const strong = /<strong[^>]*>([\s\S]*?)<\/strong>/.exec(loc[2])
  return { name: strong ? text(strong[1]) || null : null, slug: loc[1] || null }
}

function parseTimes(s: string): { startTime: string | null; endTime: string | null } {
  const range = /(\d{1,2}[:.]\d{2})\s*(?:–|-|&ndash;|till|to)\s*(\d{1,2}[:.]\d{2})/.exec(s)
  if (range) return { startTime: norm(range[1]), endTime: norm(range[2]) }
  const from = /(?:from|ab)\s+(\d{1,2}[:.]\d{2})/i.exec(s)
  if (from) return { startTime: norm(from[1]), endTime: null }
  return { startTime: null, endTime: null }
  function norm(t: string) {
    const [h, mnt] = t.split(/[:.]/)
    return `${h.padStart(2, '0')}:${mnt}`
  }
}

/**
 * Parse one category listing page into venues + events.
 *
 * Hotel pages carry a trailing "Other Hotels" section of generic mainstream
 * accommodation tips (Motel One et al.) — travel-planning filler, not queer
 * locations; anything after an "Other Hotels" h2 is dropped.
 */
export function parseListingPage(
  html: string,
  page: string,
): { venues: PatrocVenue[]; events: PatrocEvent[] } {
  const venues: PatrocVenue[] = []
  const events: PatrocEvent[] = []

  for (const b of blocks(html)) {
    if (b.section && /other hotels/i.test(b.section)) continue

    const { name, slug } = parseName(b.body)
    if (!name) continue
    const map = parseMapCall(b.body)
    const adr = parseAdr(b.body)
    const open = firstMatch(/<div class="open"[^>]*>([\s\S]*?)<\/div>/, b.body)
    const desc =
      firstMatch(/<div class="(?:description[^"]*|notes)"[^>]*>([\s\S]*?)<\/div>/, b.body)
    const websites = parseWebsites(b.body)

    const isEvent = /vevent/.test(b.classes) || /^event/.test(b.id)
    if (isEvent) {
      const openText = open ? decodeEntities(stripTags(open)) : ''
      events.push({
        id: b.id.replace(/^event/, ''),
        slug,
        title: name,
        startDate: firstMatch(/<abbr class="dtstart" title="(\d{4}-\d{2}-\d{2})"/, b.body),
        endDate: firstMatch(/<abbr class="dtend" title="(\d{4}-\d{2}-\d{2})"/, b.body),
        ...parseTimes(openText),
        recurring: !/^event/.test(b.id),
        hoursText: openText.trim() || null,
        description: desc ? text(desc) || null : null,
        websites,
        venueName:
          adr.atName ||
          firstMatch(/<abbr class="fn org" title="([^"]+)"/, b.body) ||
          (firstMatch(/<span class="fn org"[^>]*>([\s\S]*?)<\/span>/, b.body) ?? null),
        street: adr.street,
        cityLine: adr.cityLine,
        lat: map.lat,
        lng: map.lng,
        googlePlaceId: map.googlePlaceId,
      })
    } else {
      venues.push({
        id: b.id,
        slug,
        name,
        page,
        section: b.section,
        hoursText: open ? text(open) || null : null,
        description: desc ? text(desc) || null : null,
        websites,
        street: adr.street,
        cityLine: adr.cityLine,
        transport: firstMatch(/<div class="transport"[^>]*>([\s\S]*?)<\/div>/, b.body)
          ? text(firstMatch(/<div class="transport"[^>]*>([\s\S]*?)<\/div>/, b.body)!)
          : null,
        phone: firstMatch(/href="tel:([^"]+)"/, b.body),
        lat: map.lat,
        lng: map.lng,
        googlePlaceId: map.googlePlaceId,
      })
    }
  }
  return { venues, events }
}

/**
 * "Upcoming Events" on a city index page: hCalendar `div.vevent id="news<ID>"`.
 * Same numeric id space as the `event<ID>` blocks on category pages — the
 * caller dedupes on the numeric id across both.
 */
export function parseCityIndexEvents(html: string): PatrocEvent[] {
  const out: PatrocEvent[] = []
  const re = /<div class="vevent" id="news(\d+)">([\s\S]*?)(?=<div class="vevent" id="news\d+">|<h2|<div id="Footer">)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const body = m[2]
    const a = /<strong class="summary"><a class="url" href="d\/([^"]+)\.html"[^>]*>([\s\S]*?)<\/a><\/strong>/.exec(body)
    const title = a ? text(a[2]) : null
    if (!title) continue

    const descHtml = firstMatch(/<span class="description">([\s\S]*?)<\/span>/, body)
    // The time range lives in the loose text of news-content, OUTSIDE the
    // description span — the description's own times ("from 18:00 till 02:00
    // museums open…") must not be mistaken for the event's hours.
    const loose = body
      .replace(/<span class="description">[\s\S]*?<\/span>/, '')
      .replace(/<span class="location vcard">[\s\S]*?<\/span>/, '')
      .replace(/<div class="news-website">[\s\S]*?<\/div>/g, '')
    const times = parseTimes(decodeEntities(stripTags(loose)))

    const venueName =
      firstMatch(/<span class="fn org"[^>]*>([\s\S]*?)<\/span>/, body) ??
      firstMatch(/<abbr class="fn org" title="([^"]+)"/, body)
    const map = parseMapCall(body)

    out.push({
      id: m[1],
      slug: a ? a[1] : null,
      title,
      startDate: firstMatch(/<abbr class="dtstart" title="(\d{4}-\d{2}-\d{2})"/, body),
      endDate: firstMatch(/<abbr class="dtend" title="(\d{4}-\d{2}-\d{2})"/, body),
      startTime: times.startTime,
      endTime: times.endTime,
      recurring: false,
      hoursText: null,
      description: descHtml ? text(descHtml) || null : null,
      websites: parseWebsites(body),
      venueName: venueName ? text(venueName) || null : null,
      street: firstMatch(/<span class="street-address">([\s\S]*?)<\/span>/, body)
        ? text(firstMatch(/<span class="street-address">([\s\S]*?)<\/span>/, body)!) || null
        : null,
      cityLine: null,
      lat: map.lat,
      lng: map.lng,
      googlePlaceId: map.googlePlaceId,
    })
  }
  return out
}

/** events_event_type_check vocabulary, keyword-laddered from title+description.
 * First hit wins; the ladder is ordered so the more specific reading beats the
 * generic one (a "pride party" is pride, a "drag show party" is drag). */
const EVENT_TYPE_LADDER: Array<[RegExp, string]> = [
  [/\bpride\b|\bcsd\b/i, 'pride'],
  [/fetish|folsom|leather|rubber|kink|puppy/i, 'fetish'],
  [/\bdrag\b/i, 'drag'],
  [/film fest|film season|cinema|movie/i, 'film'],
  [/\bfestival\b|carnival|fiesta mayor|oktoberfest/i, 'festival'],
  [/concert|choir|orchestra|opera\b|live music/i, 'concert'],
  [/exhibition|museum|gallery/i, 'exhibition'],
  [/theatre|theater play|stage play/i, 'theater'],
  [/tournament|marathon|water polo|sports|\brun\b|regatta|championship/i, 'sports'],
  [/conference|congress|summit/i, 'conference'],
  [/party|rave|club night|dj/i, 'party'],
  [/market|fair\b/i, 'fair'],
  [/brunch|meetup|stammtisch|social/i, 'social'],
]

export function inferEventType(title: string, description: string | null): string {
  const hay = `${title} ${description ?? ''}`
  for (const [re, t] of EVENT_TYPE_LADDER) if (re.test(hay)) return t
  return 'other'
}
