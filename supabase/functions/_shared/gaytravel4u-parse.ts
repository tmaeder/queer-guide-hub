// ============================================================
// gaytravel4u.com — listicle pages -> /event/<slug>/ schema.org Event.
//
// The six requested pages (pride / bear / fetish / ski / carnival / easter)
// are ordinary WordPress POSTS whose bodies are Avia content-slider grids
// querying an `event` custom post type. That CPT is NOT exposed over REST —
// /wp/v2/types lists no `event`, and /wp/v2/event 404s — so the listing HTML
// is the only enumerator and each /event/<slug>/ page is the record.
//
// MEASURED 2026-09-28 over all six pages: 693 cards, 621 distinct slugs, 46
// of them on more than one page. Only 318 cards carry a date in the listing;
// the rest are cross-promotional rails. Detail pages recover some of the
// remainder — a 78-slug sample found 26 with a schema.org Event node — so the
// two sources are unioned rather than either being trusted alone.
//
// TWO UPSTREAM DEFECTS, BOTH CONFIRMED ON LIVE PAGES, BOTH GUARDED BELOW.
// They are rare (0 of 26 in a random sample) and they are real, which is the
// worst combination: a spot-check passes and the corpus still gets poisoned.
//
//   1. PLACEHOLDER YEARS. `bilbao-in-black` publishes startDate 2031-06-12
//      and `furball-orlando` 2031-07-24 — five years out, on annual events.
//      These are "we don't know yet" rendered as a date. See FAR_FUTURE_YEARS.
//
//   2. THE LOCALITY CAN NAME A DIFFERENT CITY THAN THE EVENT DOES.
//      `furball-orlando` carries addressLocality "New York". Publishing that
//      links an Orlando event to New York, which is the namesake/wrong-city
//      class this codebase has repaired repeatedly. See cityConflicts().
//
// NO VENUE, NO GEO, NO TIMES. The Event node carries date-only startDate and
// a PostalAddress with locality + ISO country and nothing else — no venue
// name, no street, no lat/lng, no time-of-day. `venue_name` therefore stays
// null rather than being invented from the title.
// ============================================================

import { inferEventType } from './berlin-events-parse.ts'

export interface G4uCard {
  slug: string
  url: string
  title: string
  /** Raw listing date text, e.g. "Sep. 27.2026". Null when the card is undated. */
  listStart: string | null
  listEnd: string | null
  image: string | null
  excerpt: string | null
}

export interface G4uEvent {
  slug: string
  url: string
  title: string
  start: string
  end: string | null
  description: string | null
  image: string | null
  city: string | null
  country: string | null
  eventType: string
  /** True when the city survived the conflict check below. */
  cityCorroborated: boolean
}

const SITE = 'https://www.gaytravel4u.com'

/**
 * How far ahead a date may sit before it is read as a placeholder.
 *
 * Three years is deliberately generous: Cape Town Pride is legitimately
 * listed 17 months out, and a biennial circuit event can be further. Five
 * years is not an announcement, it is a form default — the two live examples
 * both land on 2031 while every date in a 26-row random sample is 2026 or
 * 2027. Bound the guess, do not tune it to the two rows you happen to know.
 */
const FAR_FUTURE_YEARS = 3

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

/** Strip accents/punctuation so "Curaçao" and "curacao" compare equal. */
export function normToken(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Parse the listing card's date text: "Sep. 27.2026" -> "2026-09-27".
 *
 * Returns null for "Awaiting dates", which is what the site prints when the
 * organiser has not announced. That string is an honest absence and must not
 * become a date.
 */
export function parseCardDate(text: string | null | undefined): string | null {
  if (!text) return null
  const m = /([A-Za-z]{3})[a-z]*\.?\s*(\d{1,2})\.?\s*,?\s*(\d{4})/.exec(text.trim())
  if (!m) return null
  const mon = MONTHS[m[1].toLowerCase()]
  if (!mon) return null
  const day = m[2].padStart(2, '0')
  const iso = `${m[3]}-${mon}-${day}`
  return Number.isFinite(Date.parse(iso)) ? iso : null
}

/** Extract the `slide-entry` cards from one listing page. */
export function parseListing(html: string): G4uCard[] {
  const out: G4uCard[] = []
  const seen = new Set<string>()
  const artRe = /<article class='slide-entry[^']*'[\s\S]*?<\/article>/g
  for (const m of [...html.matchAll(artRe)]) {
    const art = m[0]
    const href = /href='(https:\/\/www\.gaytravel4u\.com\/event\/[^']+)'/.exec(art)
    const titleM = /slide-entry-title entry-title'[^>]*><a[^>]*>([\s\S]*?)<\/a>/.exec(art)
    if (!href || !titleM) continue
    const slug = href[1].replace(/\/+$/, '').split('/').pop() ?? ''
    if (!slug || seen.has(slug)) continue
    seen.add(slug)

    const dateM = /From:\s*([^<]*?)\s*-\s*To:\s*([^<]*?)\s*<\/div>/.exec(art)
    const imgM = /data-lazy-src="([^"]+)"/.exec(art) ?? /<img[^>]+src="(https:[^"]+)"/.exec(art)
    const exM = /slide-entry-excerpt entry-content'[^>]*>([\s\S]*?)(?:<div class="read-more-link"|<\/div>)/.exec(art)

    out.push({
      slug,
      url: `${SITE}/event/${slug}/`,
      title: stripTags(titleM[1]),
      listStart: dateM ? parseCardDate(dateM[1]) : null,
      listEnd: dateM ? parseCardDate(dateM[2]) : null,
      image: imgM ? imgM[1] : null,
      excerpt: exM ? stripTags(exM[1]) || null : null,
    })
  }
  return out
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
}

export interface G4uDetail {
  start: string | null
  end: string | null
  description: string | null
  image: string | null
  city: string | null
  country: string | null
}

/** Pull the schema.org Event node out of a /event/<slug>/ page. */
export function parseDetail(html: string): G4uDetail {
  const empty: G4uDetail = { start: null, end: null, description: null, image: null, city: null, country: null }
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    let doc: unknown
    try { doc = JSON.parse(m[1]) } catch { continue }
    const found = findEvent(doc)
    if (!found) continue
    const addr = ((found.location as Record<string, unknown> | undefined)?.address ?? {}) as Record<string, unknown>
    const img = found.image
    return {
      start: typeof found.startDate === 'string' ? found.startDate.slice(0, 10) : null,
      end: typeof found.endDate === 'string' ? found.endDate.slice(0, 10) : null,
      description: typeof found.description === 'string' ? found.description.trim() || null : null,
      image: typeof img === 'string' ? img : Array.isArray(img) && typeof img[0] === 'string' ? img[0] : null,
      city: typeof addr.addressLocality === 'string' ? addr.addressLocality.trim() || null : null,
      country: typeof addr.addressCountry === 'string' ? addr.addressCountry.trim() || null : null,
    }
  }
  return empty
}

function findEvent(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const n of node) { const r = findEvent(n); if (r) return r }
    return null
  }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (o['@type'] === 'Event' && typeof o.startDate === 'string') return o
    for (const v of Object.values(o)) { const r = findEvent(v); if (r) return r }
  }
  return null
}

/**
 * The set of city names this source itself uses, as corroboration vocabulary.
 *
 * Built from the corpus rather than from an external gazetteer on purpose: the
 * only question being asked is "does this slug name a DIFFERENT city than the
 * one the page claims", and the other pages of this same site are the exact
 * authority for what counts as a city name here. No extra dependency, no
 * gazetteer to drift.
 */
export function localityVocabulary(details: Array<{ city: string | null }>): Set<string> {
  const v = new Set<string>()
  for (const d of details) {
    const t = d.city ? normToken(d.city) : ''
    if (t.length >= 4) v.add(t)
  }
  return v
}

/**
 * True when the slug names a city that is NOT the one the page claims.
 *
 * INVERTED BURDEN, and that is the whole design. The naive rule — "the slug
 * must contain the locality" — was measured against a 26-row sample and
 * flagged 3, every one of which was CORRECT (easter-bear-dance really is in
 * Berlin, mid-atlantic-leather-weekend really is in Washington); the slug
 * simply does not name the city. Applying it would have stripped a correct
 * city from ~12% of events to fix a defect affecting far fewer.
 *
 * So silence is not evidence. A conflict is only declared when the slug
 * positively names some OTHER city from the vocabulary — which is exactly the
 * `furball-orlando` / "New York" shape and nothing else.
 */
export function cityConflicts(slug: string, city: string | null, vocab: Set<string>): boolean {
  if (!city) return false
  const own = normToken(city)
  const s = `-${slug}-`
  if (own && s.includes(`-${own}-`)) return false // slug names its own city: corroborated
  for (const other of vocab) {
    if (other === own) continue
    if (s.includes(`-${other}-`)) return true // slug names a different city
  }
  return false
}

/** A start date further out than FAR_FUTURE_YEARS is a form default, not a date. */
export function isPlaceholderDate(iso: string, now: Date): boolean {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return true
  const limit = new Date(now)
  limit.setFullYear(limit.getFullYear() + FAR_FUTURE_YEARS)
  return t > limit.getTime()
}

export interface BuildResult {
  events: G4uEvent[]
  dropped: { noDate: number; placeholder: number; cityConflict: number }
}

/**
 * Union the listing card with its detail page into a stageable event.
 *
 * Detail JSON-LD wins where present (it is the record); the listing date is
 * the fallback so a page that lost its Event node does not lose its event.
 */
export function buildEvents(
  pairs: Array<{ card: G4uCard; detail: G4uDetail }>,
  now: Date,
  seedCities: Iterable<string> = [],
): BuildResult {
  // CUMULATIVE, not batch-scoped, and that distinction is the whole strength
  // of the guard. Derived from this batch alone it would be strongest on the
  // first run and weakest afterwards — once most slugs are staged a batch is
  // a handful of events, its vocabulary is a handful of cities, and
  // `furball-orlando`/"New York" stops being detectable exactly when the
  // corpus is otherwise healthy. Seeding from cities already staged makes it
  // grow monotonically instead.
  const vocab = localityVocabulary(pairs.map((p) => p.detail))
  for (const c of seedCities) {
    const t = normToken(c)
    if (t.length >= 4) vocab.add(t)
  }
  const events: G4uEvent[] = []
  const dropped = { noDate: 0, placeholder: 0, cityConflict: 0 }

  for (const { card, detail } of pairs) {
    const start = detail.start ?? card.listStart
    if (!start) { dropped.noDate++; continue }
    if (isPlaceholderDate(start, now)) { dropped.placeholder++; continue }

    let end = detail.end ?? card.listEnd
    if (end && Date.parse(end) < Date.parse(start)) end = null

    const conflict = cityConflicts(card.slug, detail.city, vocab)
    if (conflict) dropped.cityConflict++

    const description = detail.description ?? card.excerpt

    events.push({
      slug: card.slug,
      url: card.url,
      title: card.title || card.slug,
      start,
      end,
      description,
      image: detail.image ?? card.image,
      // Prefer NULL to a guess: a contradicted city is withheld, and the
      // COUNTRY goes with it — a locality naming the wrong city is not
      // evidence for its country either.
      city: conflict ? null : detail.city,
      country: conflict ? null : detail.country,
      eventType: inferEventType(card.title, description),
      cityCorroborated: !conflict && !!detail.city,
    })
  }
  return { events, dropped }
}
