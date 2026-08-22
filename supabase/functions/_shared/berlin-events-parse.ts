// Parsers for three Berlin queer-event sources (verified live 2026-08-22).
//
//   bka-theater   www.bka-theater.de/spielplan/   — the WHOLE programme is one
//                 page (Aug '26 → Nov '27, 234 dates / 87 productions); the
//                 month tabs are `#month202610` smooth-scroll anchors, NOT
//                 separate URLs, so one fetch is the entire crawl. The page
//                 also carries a JSON-LD Event array, but it holds only the
//                 next ~30 dates — parsing the rows is the only complete read.
//
//   siegessaeule  www.siegessaeule.de/termine/    — Sapper/Svelte SSR, one page
//                 per DAY (`?date=YYYY-MM-DD`). Identity, date and time all
//                 live in the teaser href:
//                   /termine/<category>/<slug>/<YYYY-MM-DD>/<HH:MM>/
//                 so `<category>/<slug>` is the recurring series and the date
//                 and time make the occurrence. Detail pages add description,
//                 hashtags, the venue's full address and its website.
//
//   ticketcorner  www.ticketcorner.ch/artist/…    — JSON-LD `EventSeries` with
//                 a `subEvent[]` array, paginated `?pnum=1..4`. THIS HOST SITS
//                 BEHIND AKAMAI BOT MANAGER: curl and fetch() from Node get a
//                 TLS-level reset (curl exit 92), so it cannot be crawled by a
//                 script or a cron'd edge function at all. Its 82 dates are
//                 captured once into a committed snapshot and parsed from
//                 there — see scripts/data-quality/fixtures/.
//
// All three are Berlin, so geo is a CONSTANT, never a lookup: `cities` holds
// two rows named "Berlin" (Germany 3.7M, and Berlin, New Hampshire) and
// resolving by name is exactly the collision that mislinked 116 events in the
// 2026-08 city-link backfill. The importer pins the German uuid explicitly.

import { decodeEntities, stripTags } from './spartacus-parse.ts'

/** Berlin, Germany. `cityId` is pinned by the importer, not resolved by name. */
export const BERLIN = {
  city: 'Berlin',
  /** ISO-2. `events.country` is CHECK-constrained to two letters. */
  country: 'DE',
  timezone: 'Europe/Berlin',
} as const

const text = (s: string | null | undefined) =>
  decodeEntities(stripTags(String(s ?? ''))).replace(/\s+/g, ' ').trim()

const firstMatch = (re: RegExp, s: string): string | null => {
  const m = re.exec(s)
  return m ? m[1] : null
}

// ------------------------------------------------------------------ time

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Offset of `Europe/Berlin` at a given UTC instant, in minutes.
 *
 * Derived from Intl rather than a CET/CEST table because the DST switch is the
 * whole point: this corpus spans two spring-forward boundaries and the sources
 * publish naked wall-clock times.
 */
function berlinOffsetMinutes(utcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: BERLIN.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const p: Record<string, string> = {}
  for (const { type, value } of dtf.formatToParts(new Date(utcMs))) p[type] = value
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  )
  return Math.round((asUtc - utcMs) / 60000)
}

/**
 * Berlin wall-clock date + time -> ISO-8601 with the correct offset.
 *
 * `hour` may be >= 24: BKA and the German listings write an after-midnight
 * start as `24:30`, which Postgres and JS both REJECT (`24:00` is accepted as
 * end-of-day, `24:30` is not). Rolling the excess into the next day is what
 * made four patroc parties commit instead of bouncing on E_INVALID_START_DATE.
 *
 * Returns null rather than a guess when the inputs are malformed — a null
 * start makes commit reject the row loudly, a wrong one is silent.
 */
export function berlinIso(date: string, time: string | null): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!d) return null
  const [y, mo, dy] = [Number(d[1]), Number(d[2]), Number(d[3])]
  // Shape-matching is not validation: Date.UTC happily rolls 2026-13-99 over
  // into 2027-04-09 rather than rejecting it, which is the silent-wrong-date
  // outcome this function exists to avoid. Round-trip the calendar fields.
  if (mo < 1 || mo > 12 || dy < 1 || dy > 31) return null
  const probe = new Date(Date.UTC(y, mo - 1, dy))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== dy) {
    return null
  }
  let hh = 0
  let mm = 0
  if (time) {
    const t = /^(\d{1,2})[:.](\d{2})$/.exec(time.trim())
    if (!t) return null
    hh = Number(t[1])
    mm = Number(t[2])
    if (mm > 59 || hh > 47) return null
  }
  const dayShift = Math.floor(hh / 24)
  hh = hh % 24

  // Guess with a first-pass offset, then re-derive at the resulting instant so
  // a time that lands inside the DST jump resolves against the right rule.
  const naive = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]) + dayShift, hh, mm)
  let off = berlinOffsetMinutes(naive)
  off = berlinOffsetMinutes(naive - off * 60000)

  const local = new Date(naive)
  const sign = off >= 0 ? '+' : '-'
  const a = Math.abs(off)
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:00` +
    `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`
  )
}

// ------------------------------------------------------------ event type

/**
 * `events_event_type_check` vocabulary, keyword-laddered over title +
 * description + any source-supplied badge/tag words. First hit wins, so the
 * ladder runs specific -> generic (a "Drag-Show-Party" is drag, not party).
 *
 * German first: every one of these sources publishes in German, and an
 * English-only ladder returned 'other' for the whole corpus in a dry run.
 * `trg_events_taxonomy` silently coerces anything off-vocabulary to 'other',
 * so a miss here is invisible downstream — it must be right at write time.
 */
const EVENT_TYPE_LADDER: Array<[RegExp, string]> = [
  [/\bpride\b|\bcsd\b|christopher street/i, 'pride'],
  [/fetisch|fetish|leder\b|leather|rubber|kink|bdsm|cruis|darkroom|sexparty|naked|nackt/i, 'fetish'],
  [/\bdrag\b|travestie|tunte|queen[s]?\b/i, 'drag'],
  [/kabarett|cabaret/i, 'comedy'],
  [/\bfilm\b|kino|cinema|movie|dokumentation/i, 'film'],
  [/festival|karneval|carnival/i, 'festival'],
  [/konzert|concert|chor\b|choir|orchester|oper\b|opera\b|live-?musik|liedermacher|songwriter/i, 'concert'],
  [/ausstellung|exhibition|galerie|gallery|vernissage/i, 'exhibition'],
  // German stage formats that are theatre without saying "Theater": a Revue,
  // a Puppenshow and the BKA's house "Neuköllnical" are all staged pieces.
  [/theater|theatre|schauspiel|musical|impro\b|improvisation|revue|nical\b|puppen|varieté|variety/i, 'theater'],
  [/comedy|stand-?up|lesung|slam\b/i, 'comedy'],
  [/turnier|tournament|sport|lauf\b|marathon|schwimm|volleyball|yoga|fitness/i, 'sports'],
  [/konferenz|conference|kongress|congress|symposium|tagung/i, 'conference'],
  [/workshop|kurs\b|seminar|training/i, 'workshop'],
  [/demo\b|demonstration|protest|kundgebung|mahnwache/i, 'protest'],
  [/beratung|selbsthilfe|gruppe\b|community|treffpunkt|verein\b/i, 'community'],
  [/party|rave|club ?night|\bdj\b|tanz|dance|disco/i, 'party'],
  [/markt|market|flohmarkt|messe\b|\bfair\b/i, 'fair'],
  [/brunch|stammtisch|meetup|frühstück|kaffee|social|spieleabend|quiz/i, 'social'],
  [/spenden|fundrais|benefiz|charity/i, 'fundraiser'],
]

export function inferEventType(...parts: Array<string | null | undefined>): string {
  const hay = parts.filter(Boolean).join(' ')
  for (const [re, t] of EVENT_TYPE_LADDER) if (re.test(hay)) return t
  return 'other'
}

// ------------------------------------------------------------ BKA Theater

export interface BkaEvent {
  /** `data-pid` — the PRODUCTION id, shared by every date of a run. */
  productionId: string
  /** `data-tid` — "YYYY-MM-DD HH:MM:SS" Berlin wall time, unique per date. */
  tid: string
  date: string
  time: string
  startIso: string | null
  title: string
  subtitle: string | null
  description: string | null
  badges: string[]
  image: string | null
  ticketUrl: string | null
  detailUrl: string | null
}

const BKA_BASE = 'https://www.bka-theater.de'
const abs = (base: string, u: string | null) =>
  !u ? null : /^https?:/i.test(u) ? u : base + (u.startsWith('/') ? '' : '/') + u

/**
 * Rows that occupy a date but are not events: the theatre publishes its dark
 * nights as ordinary spielplan rows ("Keine Abendvorstellung" — 25.08 and both
 * Christmas days). They carry `bka-spielfrei` on the row and lack the
 * `<a class="event-title">` wrapper, so title extraction would drop them by
 * ACCIDENT; both signals are checked so a markup change on either one cannot
 * silently import "no performance" as a show.
 */
const BKA_SPIELFREI = /\bbka-spielfrei\b/
const BKA_NON_EVENT = /^(keine?\s|geschlossen|betriebsferien|spielfrei)/i

/**
 * The house flag image is the placeholder BKA renders when a production has no
 * photo. Importing it would put the same generic graphic on dozens of events,
 * which reads as data rather than as the absence of it.
 */
const BKA_PLACEHOLDER_IMAGE = /Fahne_RGB|\/images\//i

/**
 * Split the spielplan into `.bka-spielplan-row` blocks and read each one.
 *
 * Rows are keyed `data-pid` (production) + `data-tid` (this date). Neither
 * alone is an identity: a production runs many nights, and two productions can
 * share a slot on different stages — the pair is what `source_entity_id` uses.
 */
export function parseBkaSpielplan(html: string): BkaEvent[] {
  const out: BkaEvent[] = []
  const re =
    /<div class="([^"]*bka-spielplan-row[^"]*)"\s+data-month="[^"]*"\s+data-pid="(\d+)"\s+data-tid="([^"]+)">([\s\S]*?)(?=<div class="[^"]*bka-spielplan-row|<section class="bka-spielplan-section|<footer)/g

  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const [, rowClass, pid, tid, body] = m
    if (BKA_SPIELFREI.test(rowClass)) continue

    const t = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/.exec(tid)
    if (!t) continue

    // The title block is `<a class="…event-title…"><h2>Name:</h2><h3>Sub</h3></a>`.
    // The h2 carries a trailing colon as typography, not punctuation. Dark
    // nights render the same h2 with no anchor around it, so fall back to the
    // bare heading and reject it by NAME rather than by markup accident.
    const titleBlock =
      firstMatch(/<a class="[^"]*event-title[^"]*"[^>]*>([\s\S]*?)<\/a>/, body) ?? body
    const h2 = text(firstMatch(/<h2[^>]*>([\s\S]*?)<\/h2>/, titleBlock)).replace(/\s*:\s*$/, '')
    const h3 = text(firstMatch(/<h3[^>]*>([\s\S]*?)<\/h3>/, titleBlock)) || null
    if (!h2 || BKA_NON_EVENT.test(h2)) continue

    const badges: string[] = []
    const bre = /<span class="[^"]*bka-badge[^"]*"[^>]*data-badge="([^"]*)"[^>]*>/g
    let b: RegExpExecArray | null
    while ((b = bre.exec(body))) {
      const v = text(b[1])
      if (v && v.toLowerCase() !== 'alle') badges.push(v)
    }

    // Lazyloaded rows carry the real image in `data-src` and a placeholder in
    // `src`; the first screenful is NOT lazyloaded and carries the real image
    // in `src` with no `data-src` at all. Reading only `data-src` silently
    // dropped the seven above-the-fold productions.
    const imgTag = firstMatch(/(<img[^>]*\sclass="[^"]*bka-spielplan-img[^"]*"[^>]*>)/, body) ?? ''
    const img = firstMatch(/\sdata-src="([^"]+)"/, imgTag) ?? firstMatch(/\ssrc="([^"]+)"/, imgTag)

    out.push({
      productionId: pid,
      tid,
      date: t[1],
      time: t[2],
      startIso: berlinIso(t[1], t[2]),
      title: h2,
      subtitle: h3,
      description: text(firstMatch(/<span class="description"[^>]*>([\s\S]*?)<\/span>/, body)) || null,
      badges,
      image: img && !BKA_PLACEHOLDER_IMAGE.test(img) ? abs(BKA_BASE, img) : null,
      ticketUrl: firstMatch(/href="(https:\/\/bka-theater-webshop\.comfortticket\.de\/[^"]+)"/, body),
      // /cal.php is Disallow: in robots.txt — the content page is the detail link.
      detailUrl: abs(BKA_BASE, firstMatch(/href="(\/content_start\.php\?[^"]+)"/, body)),
    })
  }
  return out
}

// ------------------------------------------------------------ Siegessäule

/** The five listing rails. `sex` is imported but always tagged adult. */
export const SIEGESSAEULE_CATEGORIES = ['mix', 'kultur', 'bars', 'clubs', 'sex'] as const
export type SiegessaeuleCategory = (typeof SIEGESSAEULE_CATEGORIES)[number]

export interface SiegessaeuleRef {
  category: SiegessaeuleCategory
  slug: string
  date: string
  time: string
  url: string
  title: string | null
  venueName: string | null
}

const SIEG_BASE = 'https://www.siegessaeule.de'

/**
 * Read one `/termine/?date=YYYY-MM-DD` page into occurrence refs.
 *
 * Everything identity-bearing is in the href, so the teaser body is only used
 * for the title and venue label. Hrefs are percent-encoded (`floßfahrt` ->
 * `flo%C3%9Ffahrt`); the slug is kept ENCODED because that is the form that
 * addresses the detail page, and decoding it would break the fetch.
 */
export function parseSiegessaeuleDay(html: string): SiegessaeuleRef[] {
  const seen = new Set<string>()
  const out: SiegessaeuleRef[] = []
  const re = new RegExp(
    `href="/termine/(${SIEGESSAEULE_CATEGORIES.join('|')})/([^"/]+)/(\\d{4}-\\d{2}-\\d{2})/(\\d{1,2}:\\d{2})/"([\\s\\S]{0,1200}?)</a>`,
    'g',
  )
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const [, category, slug, date, time, body] = m
    const key = `${category}/${slug}/${date}/${time}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      category: category as SiegessaeuleCategory,
      slug,
      date,
      time,
      url: `${SIEG_BASE}/termine/${category}/${slug}/${date}/${time}/`,
      title: text(firstMatch(/<h4[^>]*>([\s\S]*?)<\/h4>/, body)) || null,
      venueName:
        text(
          firstMatch(/<div class="venue-title[^"]*">([\s\S]*?)<\/div>/, body)?.replace(
            /<svg[\s\S]*?<\/svg>/g,
            ' ',
          ) ?? null,
        ) || null,
    })
  }
  return out
}

export interface SiegessaeuleDetail {
  title: string | null
  subtitle: string | null
  description: string | null
  /** `#Kreuzberg #Queer #Yoga` — kept as plain words, no leading hash. */
  hashtags: string[]
  venueName: string | null
  venueAddress: string | null
  venueUrl: string | null
  /** "Mehr Infos: eversports.de" — the organiser's own link. */
  infoUrl: string | null
  image: string | null
}

/**
 * Read a `/termine/<cat>/<slug>/<date>/<time>/` detail page.
 *
 * This is a Svelte/Sapper render with NO h1, NO h2 and no tag markup, so
 * almost nothing is where a conventional page would put it:
 *
 *  - the title is only in `og:title`;
 *  - the hashtags are plain TEXT ("#Cabaret #Musical #queer"), not links;
 *  - the venue name is an `<h3>` that appears AFTER the "Veranstaltungsort"
 *    heading, in a separate `<header>`, and the address is a `<li>` of the
 *    following `info-list`;
 *  - the editorial body is wrapped in German guillemets (»…«), which are
 *    typography and are stripped.
 *
 * IMAGE — do NOT use `og:image`. It is a **signed Google Cloud Storage URL**
 * carrying `X-Goog-Expires=86400`, so an imported event would show a working
 * picture today and a broken one tomorrow. The rendered `<img>` points at the
 * same asset through the unsigned `cdn.siegessaeule.de/images/…` path, which
 * is stable; that is what gets stored.
 */
export function parseSiegessaeuleDetail(html: string): SiegessaeuleDetail {
  // Drop chrome and scripts: the footer repeats nav labels and the inline JS
  // is full of `#fff`-style tokens that a naive hashtag scan would collect.
  const body = html
    .replace(/<footer[\s\S]*$/i, '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')

  const plain = text(body)

  // Hashtags are bare words in the prose. A tag may START WITH A DIGIT
  // (`#1920er` is a real and common one here), so the first character cannot
  // be required to be a letter — instead the token must contain at least one
  // letter, which drops bare numbers, and a hex colour is excluded explicitly
  // (`#fff`, `#1a2b3c`) because it satisfies every other rule.
  const hashtags: string[] = []
  const seenTag = new Set<string>()
  const hre = /#([\p{L}\p{N}][\p{L}\p{N}_-]{1,39})/gu
  let h: RegExpExecArray | null
  while ((h = hre.exec(plain))) {
    const t = h[1]
    if (!/\p{L}/u.test(t)) continue
    if (/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) continue
    const k = t.toLowerCase()
    if (seenTag.has(k)) continue
    seenTag.add(k)
    hashtags.push(t)
  }

  // Everything from the "Veranstaltungsort" heading onwards.
  const venueCut = body.indexOf('Veranstaltungsort')
  const venueZone = body.slice(Math.max(0, venueCut))

  // The editorial body is a `.richtext` div — but there are TWO on the page
  // and the second is the VENUE's own blurb ("Zwischen Kanzleramt, Reichstag
  // und Brandenburger Tor ist das Tipi Heimat von Chanson…"), which would
  // otherwise be filed as this event's description on every event at that
  // venue. Only the first, and only from above the venue section, counts.
  // Some pages carry no richtext and quote the promoter in guillemets instead.
  const above = venueCut > 0 ? body.slice(0, venueCut) : body
  const descRaw =
    firstMatch(/<div[^>]*class="[^"]*\brichtext\b[^"]*"[^>]*>([\s\S]*?)<\/div>/, above) ??
    firstMatch(/»([\s\S]*?)«/, above)
  const venueName = text(firstMatch(/<h3[^>]*>([\s\S]*?)<\/h3>/, venueZone.slice(20)))
  // The map-pin list item holds "<name>, <street>, <postcode> Berlin-<district>".
  const address = text(
    firstMatch(/feather-map-pin[\s\S]{0,400}?<\/span>([\s\S]{0,300}?)<\/li>/, venueZone),
  )

  return {
    title: text(decodeEntities(firstMatch(/<meta property="og:title" content="([^"]+)"/, body) ?? '')) || null,
    subtitle:
      text(firstMatch(/<div class="event-description[^"]*"[^>]*>([\s\S]*?)<\/div>/, body)) || null,
    // The hashtag run is appended to the prose ("Regie: Vincent Paterson
    // #1920er#Cabaret#Musical"); it is captured separately and stripped here
    // so the description reads as a sentence.
    description:
      text(descRaw)
        // "Mehr Infos [& Tickets]: <domain>" sits inside the same richtext
        // block and is a link label, not prose. It appears BOTH leading (yoga
        // classes) and trailing (theatre listings), so it is stripped
        // wherever it occurs rather than anchored to either end.
        // The connector varies ("Mehr Infos:", "… & Tickets:", "… und
        // Anmeldung:"), so anything short up to the colon is allowed.
        .replace(/\s*Mehr Infos[^:]{0,30}:\s*\S*/gu, ' ')
        .replace(/\s*(?:#[\p{L}][\p{L}\p{N}_-]{1,39})+\s*$/gu, '')
        .replace(/^[»"']+|[«"']+$/g, '')
        .trim() || null,
    hashtags,
    venueName: venueName || null,
    venueAddress: address && /\d{5}/.test(address) ? address : null,
    venueUrl: firstMatch(/href="(https?:\/\/(?!(?:www\.)?siegessaeule\.de|cdn\.siegessaeule\.de)[^"]+)"/, venueZone),
    infoUrl: firstMatch(/Mehr Infos:[\s\S]{0,300}?href="(https?:\/\/[^"]+)"/, body),
    // Unsigned CDN path only — never the expiring og:image.
    image: firstMatch(/<img[^>]+src="(https:\/\/cdn\.siegessaeule\.de\/images\/[^"]+)"/, body),
  }
}

// ----------------------------------------------------------- Lab.oratory

export interface LabEvent {
  /** Block uuid where present; the site omits it on the "TONIGHT" block. */
  blockId: string | null
  /** Naked wall-clock, no offset — the site publishes Berlin local time. */
  startLocal: string
  startIso: string | null
  title: string
  description: string | null
  /** "doors 22:00 to 24:00" — admission window, not the party's end. */
  doors: string | null
  slug: string | null
  venueName: string | null
  venueAddress: string | null
}

/**
 * Read lab-oratory.de, which marks every party up as schema.org MICRODATA
 * (`itemscope itemtype="http://schema.org/Event"`) rather than JSON-LD.
 *
 * The whole programme is one page — the month labels are in-page anchors — so
 * a single fetch is the entire crawl.
 *
 * `startDate` is a bare `2026-08-22T22:00:00` with NO offset. It is Berlin
 * wall time, so it is re-resolved through berlinIso() rather than passed
 * through: taken literally it would be read as UTC and every party would land
 * one or two hours early, which for a doors-22:00-to-24:00 club is the
 * difference between open and closed.
 */
export function parseLabOratory(html: string): LabEvent[] {
  const out: LabEvent[] = []
  const seen = new Set<string>()

  // Split on the microdata blocks; each ends at the next one or at the venue
  // meta pair that closes it.
  const re =
    /<div\s+(?:id='([0-9a-f-]{36})'\s+)?itemscope=""\s+itemtype="http:\/\/schema\.org\/Event"([\s\S]*?)(?=<div[^>]*itemtype="http:\/\/schema\.org\/Event"|<div class='footer'|$)/g

  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const [, blockId, body] = m
    const startLocal = firstMatch(/itemprop="startDate"\s+content="([^"]+)"/, body)
    if (!startLocal) continue

    const d = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(startLocal)
    if (!d) continue
    if (seen.has(startLocal)) continue
    seen.add(startLocal)

    const nameBlock = firstMatch(/itemprop="name"[^>]*>([\s\S]*?)<\/div>/, body) ?? ''
    const title = text(nameBlock)
    if (!title) continue

    out.push({
      blockId: blockId ?? null,
      startLocal,
      startIso: berlinIso(d[1], d[2]),
      title,
      description: text(firstMatch(/itemprop="description"[^>]*>([\s\S]*?)<\/span>/, body)) || null,
      doors: text(firstMatch(/>(doors[^<]*)</i, body)) || null,
      slug: firstMatch(/href="https:\/\/www\.lab-oratory\.de\/([a-z0-9-]+)"/, nameBlock),
      venueName: firstMatch(/itemprop="name"\s+content="([^"]+)"/, body),
      venueAddress: firstMatch(/itemprop="address"\s+content="([^"]+)"/, body),
    })
  }
  return out
}

// ----------------------------------------------------------- Böse Buben

export interface BoeseBubenEvent {
  /** `/readmore/<slug>.html?day=<YYYYMMDD>` — slug + day is the identity. */
  slug: string
  day: string
  startIso: string | null
  endIso: string | null
  title: string
  /** The full link label, e.g. "RED-Session - 4.Samstag im Monat". Kept whole
   *  rather than split: the recurrence is written inconsistently ("4.Samstag
   *  im Monat", "jeden Mittwoch", "4.Do – engl") and any split rule that works
   *  on one shape eats part of the name on another. */
  scheduleLabel: string | null
  teaser: string | null
  detailUrl: string
}

/** Unix seconds -> Berlin-local ISO with the correct offset. */
function isoFromUnix(seconds: number): string | null {
  if (!Number.isFinite(seconds)) return null
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const p: Record<string, string> = {}
  for (const { type, value } of dtf.formatToParts(new Date(seconds * 1000))) p[type] = value
  return berlinIso(`${p.year}-${p.month}-${p.day}`, `${Number(p.hour) % 24}:${p.minute}`)
}

const BB_BASE = 'https://www.boese-buben-berlin.de'

/**
 * Read a boese-buben-berlin.de event list (the base page or any of the 19
 * `/events-eng/category/<kink>.html` pages).
 *
 * IMPORTANT — the list is a rolling "next few" widget, NOT a browsable
 * archive: `?day=`, `?month=` and `?year=` are all accepted and all IGNORED
 * (measured — `?day=20260901` and `?day=20261115` return byte-identical event
 * sets). The category pages surface a different slice, so the union across
 * them is the widest concrete window the site publishes. Do NOT synthesise
 * further dates from the recurrence text ("4.Samstag im Monat"): the club
 * states its calendar is only binding to a fixed horizon and reserves the
 * right to change later dates, so an expanded rule would be invention.
 *
 * The `<a title>` carries the exact ISO range, which is the only place the
 * END is published; `<time datetime>` is a unix timestamp for the start.
 */
export function parseBoeseBubenList(html: string): BoeseBubenEvent[] {
  const out: BoeseBubenEvent[] = []
  const seen = new Set<string>()
  const re = /<article class="event[^"]*"[^>]*>([\s\S]*?)<\/article>/g

  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const body = m[1]
    const link = /href="\/readmore\/([a-z0-9-]+)\.html\?day=(\d{8})"/.exec(body)
    if (!link) continue
    const [, slug, day] = link
    const key = `${slug}:${day}`
    if (seen.has(key)) continue
    seen.add(key)

    const title = text(firstMatch(/<h2>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/, body))
    if (!title) continue

    // START comes from the unix timestamp, which is exact and always present.
    // It is NOT derived from the link title: that text comes in two shapes —
    //   "… (2026-08-22 20:00–2026-08-23 04:00)"   (crosses midnight)
    //   "… (Sunday, 2026-08-23, 15:00–21:00)"     (same day)
    // and a parser written against the first silently fell back to midnight
    // for the second, publishing a 15:00 club afternoon as a 00:00 start.
    const unix = Number(firstMatch(/<time datetime="(\d+)"/, body));
    const startIso = isoFromUnix(unix)
    if (!startIso) continue

    // END is only published in that title text, so both shapes are read here.
    const attr = decodeEntities(firstMatch(/title="([^"]*\([^"]*\)[^"]*)"/, body) ?? '')
    const spanning =
      /\((\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})\s*[–—-]\s*(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})\)/.exec(attr)
    const sameDay = /\(\s*\w+,\s*(\d{4}-\d{2}-\d{2}),\s*(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})\)/.exec(attr)

    out.push({
      slug,
      day,
      startIso,
      endIso: spanning
        ? berlinIso(spanning[3], spanning[4])
        : sameDay
          ? berlinIso(sameDay[1], sameDay[3])
          : null,
      title,
      scheduleLabel: text(attr.replace(/\s*\([^)]*\)\s*$/, '')) || null,
      teaser: text(firstMatch(/<p class="teaser">([\s\S]*?)<\/p>/, body)) || null,
      detailUrl: `${BB_BASE}/readmore/${slug}.html?day=${day}`,
    })
  }
  return out
}

export interface BoeseBubenDetail {
  description: string | null
  /** "Admission: 26,00 €" — kept as source text, never parsed to a number. */
  admission: string | null
  image: string | null
}

export function parseBoeseBubenDetail(html: string): BoeseBubenDetail {
  const body = html.replace(/<footer[\s\S]*$/i, '')
  const main = firstMatch(/<div class="ce_text[^"]*"[^>]*>([\s\S]*?)<\/div>/, body) ?? ''
  return {
    description: text(main).replace(/\s*---\s*/g, ' — ').trim() || null,
    admission: text(firstMatch(/(Admission:[^<]{0,60})/i, body)) || null,
    image: (() => {
      const src = firstMatch(/<img[^>]+src="(\/files\/[^"]+)"/, body)
      return src ? BB_BASE + src.replace(/ /g, '%20') : null
    })(),
  }
}

// ----------------------------------------------------------- Ticketcorner

export interface TicketcornerEvent {
  /** Trailing id of the offer URL — unique per DATE (82 dates, 82 ids). */
  eventId: string
  startIso: string
  title: string
  venueName: string | null
  street: string | null
  postalCode: string | null
  country: string | null
  price: number | null
  currency: string | null
  availability: string | null
  url: string | null
  image: string | null
}

/**
 * Read the `subEvent[]` of the JSON-LD `EventSeries`.
 *
 * `addressLocality` is "BERLIN / NEUKÖLLN" — a shouted district label, not a
 * city name; it is deliberately NOT used. The city is the BERLIN constant.
 */
export function parseTicketcornerSubEvents(sub: unknown[]): TicketcornerEvent[] {
  const out: TicketcornerEvent[] = []
  for (const raw of sub) {
    const e = raw as Record<string, any>
    const start = typeof e?.startDate === 'string' ? e.startDate : null
    const title = typeof e?.name === 'string' ? e.name.trim() : ''
    if (!start || !title) continue

    const offers: Record<string, any>[] = Array.isArray(e.offers)
      ? e.offers
      : e.offers
        ? [e.offers]
        : []
    // Several price categories per date; the listing advertises "ab CHF x".
    const prices = offers
      .map((o) => Number(o?.price))
      .filter((n) => Number.isFinite(n) && n > 0)
    const offer = offers[0] ?? {}
    const url = typeof offer.url === 'string' ? offer.url : null
    const id = url ? firstMatch(/-(\d+)\/?$/, url) : null
    if (!id) continue

    const loc = (e.location ?? {}) as Record<string, any>
    const adr = (loc.address ?? {}) as Record<string, any>

    out.push({
      eventId: id,
      startIso: start,
      title,
      venueName: typeof loc.name === 'string' ? loc.name.trim() : null,
      street: typeof adr.streetAddress === 'string' ? adr.streetAddress.trim() : null,
      postalCode: typeof adr.postalCode === 'string' ? adr.postalCode.trim() : null,
      country: typeof adr.addressCountry === 'string' ? adr.addressCountry.trim() : null,
      price: prices.length ? Math.min(...prices) : null,
      currency: typeof offer.priceCurrency === 'string' ? offer.priceCurrency : null,
      availability: typeof offer.availability === 'string' ? offer.availability : null,
      url,
      image: typeof e.image === 'string' ? e.image : null,
    })
  }
  return out
}
