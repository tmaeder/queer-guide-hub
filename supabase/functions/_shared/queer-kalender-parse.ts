// ============================================================
// queer-kalender.nl — Amsterdam queer calendar (Zotonic CMS).
//
// ONE REQUEST. The /en/ page is fully server-rendered and every event is an
// <article class="c-calendar-item"> carrying, between them, the whole record:
// a tz-aware <time datetime="...+02:00">, and a pair of "add to calendar"
// deeplinks whose query string holds the description, the venue, the street,
// the city, the end time and the canonical page URL.
//
// THE ZOTONIC API WAS MEASURED AND NOT USED. /api/model/search/get?q.cat=event
// reports 1,698 events and returns only ids, so a full walk is 1 + 1,698
// requests against a volunteer-run hobby site — and /api/model/rsc/get/{id}
// carries NO venue name and NO street (address_street_1 is null on the row
// sampled), which the page deeplinks do carry. More requests for less data.
// The /en/ page is also exactly what was asked for: the 154 upcoming events.
//
// TIMEZONE. The <time datetime> attribute is tz-qualified and is the start.
// The deeplink's `dates=20260929T1830/20260930T0100` second half is the end
// and is NAIVE local, so it is qualified with the START's own offset rather
// than a hardcoded +02:00 — Amsterdam is +01:00 half the year and an event
// that runs past a DST boundary would otherwise shift by an hour.
//
// "T.B.A." IS NOT A VENUE. Measured over all 154: 137 events give
// venue/street/city, 11 give street-or-placeholder/city, 6 give city alone.
// A first pass that took part[0] as the venue whenever there were two parts
// would have published "Willem Witsenstraat 6" and "T.B.A." as venue names,
// feeding a street and a placeholder to the event->venue linker.
// ============================================================

import { inferEventType } from './berlin-events-parse.ts'
import { stripTagsAndDecode } from './html-entities.ts'

export interface QkEvent {
  id: string
  title: string
  url: string
  start: string
  end: string | null
  description: string | null
  venueName: string | null
  street: string | null
  city: string | null
  eventType: string
}

/** Strings this source uses to mean "not announced". Never a venue. */
const PLACEHOLDER = /^(t\.?b\.?a\.?|t\.?b\.?d\.?|to be announced|onbekend|nader te bepalen|\?+)$/i

function text(s: string): string {
  return stripTagsAndDecode(s)
}

/** `+`-for-space form used by both calendar providers. */
function unquotePlus(s: string): string {
  try { return decodeURIComponent(s.replace(/\+/g, ' ')) } catch { return s.replace(/\+/g, ' ') }
}

export interface QkLocation {
  venueName: string | null
  street: string | null
  city: string | null
}

/**
 * Split "Lellebel,Utrechtsestraat 4h,Amsterdam" into its parts.
 *
 * The LAST part is always the city (measured: 308/308 are "Amsterdam"). With
 * three parts the first is the venue. With two, the first may be either a
 * street or a venue, so it is read as a street only when it carries a house
 * number — which is what distinguishes "Willem Witsenstraat 6" from a venue
 * called something without digits.
 */
export function parseLocation(raw: string | null | undefined): QkLocation {
  const empty: QkLocation = { venueName: null, street: null, city: null }
  if (!raw) return empty
  const parts = unquotePlus(raw).split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return empty

  const clean = (v: string | undefined): string | null =>
    v && !PLACEHOLDER.test(v.trim()) ? v.trim() : null

  if (parts.length === 1) return { venueName: null, street: null, city: clean(parts[0]) }
  const city = clean(parts[parts.length - 1])
  if (parts.length === 2) {
    const first = parts[0]
    if (PLACEHOLDER.test(first)) return { venueName: null, street: null, city }
    // A house number makes it an address line, not a venue name.
    return /\d/.test(first)
      ? { venueName: null, street: first, city }
      : { venueName: first, street: null, city }
  }
  return { venueName: clean(parts[0]), street: clean(parts[1]), city }
}

/**
 * Pull the description out of the deeplink body.
 *
 * Both providers append " - Added by Queer Calendar: <url>" to the real text.
 * That suffix is site chrome, not the event's own words, and it also carries
 * the canonical URL we extract separately.
 */
export function parseDetails(raw: string | null | undefined): { description: string | null; url: string | null } {
  if (!raw) return { description: null, url: null }
  const v = unquotePlus(raw)
  const m = /\s*-\s*Added by Queer Calendar:\s*(\S+)\s*$/.exec(v)
  const url = m ? m[1] : null
  const body = (m ? v.slice(0, m.index) : v).trim()
  return { description: body || null, url }
}

/**
 * Qualify a naive "YYYYMMDDTHHMM" end with the offset the START carries.
 *
 * Hardcoding +02:00 is wrong for half the year, and omitting the offset
 * entirely raises E_END_TIMEZONE_MISSING at write time.
 */
export function endFromDates(dates: string | null | undefined, startIso: string): string | null {
  if (!dates) return null
  const m = /^(\d{8}T\d{4})\/(\d{8}T\d{4})$/.exec(dates.trim())
  if (!m) return null
  const off = /([+-]\d{2}:\d{2}|Z)$/.exec(startIso)
  if (!off) return null
  const d = m[2]
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}:00${off[1]}`
  if (!Number.isFinite(Date.parse(iso))) return null
  // An end before its start means the event crosses midnight and the deeplink
  // only carries dates — trust it as-is if it parses forward, drop otherwise.
  return Date.parse(iso) >= Date.parse(startIso) ? iso : null
}

/** Parse the /en/ listing page. */
export function parseQueerKalender(html: string): QkEvent[] {
  const out: QkEvent[] = []
  const seen = new Set<string>()

  for (const m of [...html.matchAll(/<article class="c-calendar-item">([\s\S]*?)<\/article>/g)]) {
    const art = m[1]

    const idM = /id="share-cal-(\d+)"/.exec(art)
    const titleM = /<h3 class="c-calendar-item__title">([\s\S]*?)<\/h3>/.exec(art)
    const timeM = /<time datetime="([^"]+)"/.exec(art)
    if (!idM || !titleM || !timeM) continue

    const id = idM[1]
    if (seen.has(id)) continue

    const title = text(titleM[1])
    const start = timeM[1].trim()
    if (!title || !Number.isFinite(Date.parse(start))) continue

    const locM = /[?&]location=([^&"]*)/.exec(art)
    const detM = /[?&](?:details|body)=([^&"]*)/.exec(art)
    const datesM = /[?&]dates=([^&"]*)/.exec(art)

    const loc = parseLocation(locM?.[1])
    const det = parseDetails(detM?.[1])
    const url = det.url ?? `https://queer-kalender.nl/en/page/${id}`

    seen.add(id)
    out.push({
      id,
      title,
      url,
      start,
      end: endFromDates(datesM?.[1], start),
      description: det.description,
      venueName: loc.venueName,
      street: loc.street,
      city: loc.city,
      eventType: inferEventType(title, det.description),
    })
  }
  return out
}
