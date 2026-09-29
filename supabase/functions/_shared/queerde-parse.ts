import { decodeEntities } from './html-entities.ts'
// ============================================================
// queer.de — the German-language CSD / Pride calendars
//
//   /csd-termine.php              470 vevents (22 live + 448 archive)
//   /gay-pride-international.php   28 vevents ( 3 live +  25 archive)
//
// Both pages publish hCalendar microformat — `div.vevent` carrying
// `span.dtstart` / `span.dtend` / `span.location` whose ISO values live in a
// `span.value-title` TITLE attribute, plus `span.summary` for the name. So this
// is a structured read, not a scrape of rendered text, and nothing here guesses.
//
// ── THE CHARSET IS THE WHOLE BALLGAME ────────────────────────
// Neither page declares a charset and both are ISO-8859-1: the bytes for
// München are `M\xfc nchen`. Decoding as UTF-8 silently mangles every umlaut,
// which on this corpus means München, Köln, Göttingen, Nürnberg, Österreich and
// Zürich — i.e. most of the largest prides. `parsePage` therefore takes RAW
// BYTES and owns the decoding, so a caller cannot forget it.
//
// ── CITY COMES FROM THE value-title, NOT THE TRAILING TEXT ───
// The text after the location span reads ", City, Bundesland" on most rows and
// ", Bundesland" alone on others, so reading the city from the tail yields the
// BUNDESLAND AS THE CITY. Measured: `CSD Schleswig` has location="Schleswig"
// and tail ", Schleswig-Holstein" — tail-derived city = "Schleswig-Holstein",
// which is a state, not a place an event happens in. The city is the last
// comma-segment of the value-title; the tail only supplies the region.
//
// ── REGION VOCABULARY IS PAGE-SCOPED, measured over all 498 rows ─
// The German page's 16 distinct regions are ALL Bundesländer (zero foreign) and
// the international page's 7 are ALL German country names (zero Bundesländer).
// So each page validates the trailing segment against its own closed list, and
// an unrecognised value is counted rather than defaulted — a new country
// appearing on the intl page shows up as a rising `unknownRegion` count instead
// of silently committing an event to the wrong country.
//
// ── WHAT IS DROPPED, AND WHY EACH IS NOT A SILENT OMISSION ───
// `- abgesagt -` (6 rows): a source CANNOT express cancellation through this
// pipeline. `NormalizedItem` has no liveness field, `commit_event_staging_item`
// hardcodes status='active' and never writes `liveness_status`, and the column's
// only writer is `event-liveness-checker` re-fetching a live page. Staging one
// would publish a cancelled event as live. All 6 are in the PAST (2024-09-21 …
// 2026-06-27) — CSDs that were called off and never happened — so dropping them
// withholds nothing a reader could act on.
//
// `Diverse Orte` (7 rows, e.g. IDAHOBIT, Trans Day of Remembrance): nationwide
// observances with no single city. `pipeline-validate` raises E_NO_LOCATION on a
// row with no city, no venue and no geo, so they cannot commit anyway.
//
// Both are returned as COUNTS so a run report states them.
//
// ── NO CITY OR COORDINATE RESOLUTION HAPPENS HERE ────────────
// Deliberate. `cities.region_name` is in ENGLISH ("Lower Saxony", "Bavaria")
// while this source gives German ("Niedersachsen", "Bayern"), so the region is
// useless as a corroborating signal without a mapping; and `Berlin` and
// `Potsdam` both have US namesakes, so resolving by name alone is the documented
// namesake defect. City / region / country are staged as TEXT and the existing
// guarded nightly runners do the linking — `run_event_city_link` (which blocks
// rather than guesses when its signals disagree), `run_event_geo_fill`,
// `run_event_timezone_fill`.
// ============================================================

export type QdKind = 'de' | 'intl'

export interface QdEvent {
  /** queer.de's own numeric id, from the `.ics` link. Present on every LIVE row, absent on every archive row. */
  eventId: string | null
  /** Staging identity. The numeric id when there is one, else a readable composite of the three fields that identify an archived CSD. */
  sourceId: string
  title: string
  /** Bare `YYYY-MM-DD`, or an ISO datetime carrying a real offset. Never a naive datetime — that trips E_START_TIMEZONE_MISSING. */
  start: string
  end: string | null
  city: string
  /** Bundesland on the German page; null on the international page and on rows whose trailing segment is a country. */
  region: string | null
  countryCode: string
  /** Null when queer.de named no venue, or named the placeholder "Diverse". */
  venueName: string | null
  websites: string[]
  /** True for rows after the `vergangen` anchor — queer.de's own archive divider. */
  past: boolean
  eventType: string
}

export interface QdSkips {
  cancelled: number
  noCity: number
  unknownRegion: number
  incomplete: number
}

export interface QdParseResult {
  events: QdEvent[]
  skipped: QdSkips
}

/** The 16 Bundesländer. Berlin / Hamburg / Bremen are city-states, so they are legitimately both a city and a region. */
const BUNDESLAENDER: ReadonlySet<string> = new Set([
  'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg',
  'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen',
  'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt',
  'Schleswig-Holstein', 'Thüringen',
])

/**
 * German country names → ISO2, covering every value the international page
 * currently uses. Anything outside this map is counted as `unknownRegion` and
 * the row is skipped: committing an event to a guessed country is worse than
 * not having it, and a rising count is how a new country announces itself.
 */
const COUNTRY_BY_GERMAN_NAME: Readonly<Record<string, string>> = {
  'Belgien': 'BE',
  'Dänemark': 'DK',
  'Frankreich': 'FR',
  'Großbritannien und Nordirland': 'GB',
  'Irland': 'IE',
  'Italien': 'IT',
  'Luxemburg': 'LU',
  'Niederlande': 'NL',
  'Polen': 'PL',
  'Portugal': 'PT',
  'Schweden': 'SE',
  'Schweiz': 'CH',
  'Spanien': 'ES',
  'Tschechien': 'CZ',
  'Österreich': 'AT',
}

/** "Various venues in this city" — a placeholder, not a venue. Staging it would feed junk into venue matching. */
const VENUE_PLACEHOLDERS: ReadonlySet<string> = new Set(['Diverse', 'Diverse Orte', 'diverse'])

/** queer.de's sentinel for a nationwide observance with no single city. */
const NO_CITY_SENTINELS: ReadonlySet<string> = new Set(['Diverse Orte', 'Diverse Städte', 'Bundesweit'])

const CANCELLED_RE = /-\s*(abgesagt|entfällt|verschoben)\s*-|\babgesagt\b/i

/**
 * The pages are ISO-8859-1 with NO declared charset. This is the single
 * highest-risk line in the file: decode as UTF-8 and every umlaut becomes a
 * replacement character, which reaches the database as a mangled city name.
 */
export const decodeLatin1 = (bytes: Uint8Array): string =>
  new TextDecoder('iso-8859-1').decode(bytes)

export const stripTags = (s: unknown): string =>
  String(s ?? '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[#0-9a-zA-Z]+;/g, (m) => decodeEntities(m))
    .replace(/\s+/g, ' ')
    .trim()

const slug = (s: string, max = 48): string =>
  s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '')

/**
 * The Europe/Berlin UTC offset on a given local wall-clock time, as "+02:00".
 *
 * Only 3 of 498 rows carry a time at all, but a naive `2026-06-29T19:00` trips
 * `E_START_TIMEZONE_MISSING` — the contract accepts a bare `YYYY-MM-DD` or an
 * explicit offset and nothing in between.
 *
 * Two passes, because the offset is needed to know the instant and the instant
 * is needed to know the offset: guess by reading the wall clock as UTC, then
 * re-read at the resulting instant and keep the second answer if it differs.
 * That only matters within the transition hour itself, which no current row is
 * anywhere near, but it costs three lines and removes the caveat.
 */
export function berlinOffset(localIso: string): string {
  const read = (at: Date): string => {
    const part = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Berlin',
      timeZoneName: 'longOffset',
    }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+01:00'
    const m = /GMT([+-]\d{2}:\d{2})/.exec(part)
    return m ? m[1] : '+01:00'
  }
  const first = read(new Date(`${localIso}:00Z`))
  const second = read(new Date(`${localIso}:00${first}`))
  return second
}

/**
 * Normalise a `value-title` date into something the event contract accepts.
 * A bare date is passed through untouched (495 of 498 rows); a naive datetime
 * gains the real Europe/Berlin offset.
 */
export function normalizeDate(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(v)
  if (m) return `${m[1]}T${m[2]}:${m[3]}:00${berlinOffset(v)}`
  // Already offset-bearing, or a shape we do not recognise — hand it on and let
  // the contract judge it rather than inventing a timezone for it.
  return v
}

const segments = (s: string): string[] =>
  (s ?? '').split(',').map((p) => p.trim()).filter(Boolean)

/**
 * The city, from the two places queer.de puts it.
 *
 * The trailing text is the authority WHEN IT HAS BOTH parts: ", City, Region"
 * names the city in the second-to-last position. Only when the tail is a single
 * segment — ", Bundesland" (`CSD Schleswig`) or ", Berlin" (a city-state) — does
 * the city have to come from the location value-title.
 *
 * Both halves were wrong at some point, which is why it reads from both:
 *   • Tail-only: `CSD Schleswig` has location="Schleswig" and tail
 *     ", Schleswig-Holstein", so a tail-derived city is a FEDERAL STATE.
 *   • value-title-only: `Heidelberg: Aids-Gala` has location="Theater Heidelberg"
 *     and `Karlsruhe: Pride Night` has location="Badisches Staatstheater
 *     Karlsruhe, Kleines Haus" — so a value-title-derived city is a THEATRE
 *     ("Theater Heidelberg", "Kleines Haus"). Found by checking the parsed
 *     cities against our own `cities` table, not by reading the page.
 */
export function pickCity(valueTitle: string, tail: string): string | null {
  const t = segments(tail)
  if (t.length >= 2) return t[t.length - 2]
  const v = segments(valueTitle)
  return v.length ? v[v.length - 1] : null
}

/**
 * The venue, which is whatever the value-title says once the city is removed
 * from the end of it.
 *
 * Dropping only a TRAILING segment that equals the city is what keeps
 * "Badisches Staatstheater Karlsruhe, Kleines Haus" intact (its last segment is
 * a stage, not the city) while still reducing "Kit Kat Club, Berlin" to the club
 * and "Bramsche" to nothing.
 *
 * A placeholder ("Diverse" = various venues) and a value that is merely the city
 * again both yield NULL: feeding either into venue matching is the documented
 * place collision, where 15 of 65 `name_exact` matches were cities or
 * queer-village names — a 23% error rate on a branch that auto-applies.
 */
export function pickVenue(valueTitle: string, city: string | null): string | null {
  const v = segments(valueTitle)
  if (!v.length) return null
  if (city && v[v.length - 1].toLowerCase() === city.toLowerCase()) v.pop()
  const venue = v.join(', ').trim()
  if (!venue) return null
  if (VENUE_PLACEHOLDERS.has(venue)) return null
  if (city && venue.toLowerCase() === city.toLowerCase()) return null
  return venue
}

/**
 * `event_type` against the 22-value vocabulary in `src/lib/eventTypes.ts`
 * (mirrored by `normalize_event_taxonomy`, which default-rejects an unknown
 * value to 'other' — so a miss here degrades safely rather than failing a row).
 *
 * ORDER IS LOAD-BEARING. Film runs before pride because Karlsruhe's queer film
 * festival is called "Pride Pictures" and Berlin's is "Porn Film Festival";
 * matching pride first would file both as parades. Pride runs before protest so
 * a CSD — which is historically a demonstration — files as `pride`, leaving
 * protest for the marches and vigils that are not a CSD.
 */
export function classifyEventType(title: string): string {
  const t = (title ?? '').toLowerCase()
  if (/\bfilm|streifen|pictures|kino|cinema|filmfest/.test(t)) return 'film'
  if (/gay games|queer cup|fußball|football|water polo|life-run|\bsport/.test(t)) return 'sports'
  if (/\bcsd\b|pride|christopher street/.test(t)) return 'pride'
  if (/\bdemo\b|kundgebung|mahnwache|\bmarch\b|protest|gedenk|soli-/.test(t)) return 'protest'
  if (/\bball\b|hustla|party|\brave\b|disco|clubnacht/.test(t)) return 'party'
  if (/festival|kulturtage|\bfest\b|literaturfest/.test(t)) return 'festival'
  if (/lesung|literatur|buch/.test(t)) return 'art'
  if (/konzert|concert|opernnacht|benefizkonzert/.test(t)) return 'concert'
  return 'other'
}

const VEVENT_RE = /<div class="vevent">([\s\S]*?)<\/div>/g
const VALUE_TITLE_RE = /<span class="(dtstart|dtend|location)"><span class="value-title" title="([^"]*)"\s*\/><\/span>/g
const SUMMARY_RE = /<span class="summary">([\s\S]*?)<\/span>/
const ICS_RE = /events_ics\.php\?event_id=(\d+)/
const WEBSITE_RE = /<a href="([^"]+)"[^>]*class="url eic"/g
/**
 * The text between the location span and the title, i.e. ", City, Bundesland".
 * `(?:[^<]|<br>)*?` is what anchors this to the LOCATION span rather than the
 * earlier dtstart one: the segment after dtstart contains a `<span`, which the
 * character class rejects, so the match can only start at the location span.
 */
const TAIL_RE = /<\/span>((?:[^<]|<br>)*?)<br><b>/

/**
 * Parse one queer.de calendar page from its RAW BYTES.
 *
 * `kind` selects the trailing-segment vocabulary: 'de' validates against the
 * Bundesländer and fixes the country to DE, 'intl' validates against the German
 * country names. Measured over all 498 live rows, neither page mixes the two.
 */
export function parsePage(bytes: Uint8Array, kind: QdKind, sourceUrl: string): QdParseResult {
  const html = decodeLatin1(bytes)
  const body = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')

  // queer.de's own archive divider. Everything after it has already happened.
  const anchor = /<a name="vergangen">/.exec(body)
  const cut = anchor ? anchor.index : body.length

  const events: QdEvent[] = []
  const skipped: QdSkips = { cancelled: 0, noCity: 0, unknownRegion: 0, incomplete: 0 }

  VEVENT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = VEVENT_RE.exec(body)) !== null) {
    const block = m[0]
    const past = m.index > cut

    const fields: Record<string, string> = {}
    VALUE_TITLE_RE.lastIndex = 0
    let f: RegExpExecArray | null
    while ((f = VALUE_TITLE_RE.exec(block)) !== null) fields[f[1]] = f[2]

    const summary = SUMMARY_RE.exec(block)
    const title = summary ? stripTags(summary[1]) : ''
    const start = normalizeDate(fields.dtstart)
    const end = normalizeDate(fields.dtend)

    if (!title || title.length < 3 || !start) { skipped.incomplete++; continue }

    // A cancelled event cannot be expressed through this pipeline — see header.
    if (CANCELLED_RE.test(title)) { skipped.cancelled++; continue }

    // The trailing text supplies the region always, and the city when it has
    // both parts — see pickCity for why neither source alone is sufficient.
    const tailMatch = TAIL_RE.exec(block)
    const tailText = tailMatch ? stripTags(tailMatch[1]) : ''
    const tailParts = tailText.split(',').map((p) => p.trim()).filter(Boolean)
    const last = tailParts.length ? tailParts[tailParts.length - 1] : ''

    const city = pickCity(fields.location ?? '', tailText)
    if (!city || NO_CITY_SENTINELS.has(city)) { skipped.noCity++; continue }
    const venueName = pickVenue(fields.location ?? '', city)

    let region: string | null = null
    let countryCode: string
    if (kind === 'de') {
      if (!BUNDESLAENDER.has(last)) { skipped.unknownRegion++; continue }
      region = last
      countryCode = 'DE'
    } else {
      const cc = COUNTRY_BY_GERMAN_NAME[last]
      if (!cc) { skipped.unknownRegion++; continue }
      countryCode = cc
    }

    const websites: string[] = []
    WEBSITE_RE.lastIndex = 0
    let w: RegExpExecArray | null
    while ((w = WEBSITE_RE.exec(block)) !== null) websites.push(stripTags(w[1]))

    const ics = ICS_RE.exec(block)
    const eventId = ics ? ics[1] : null
    // Archive rows carry no numeric id, so identity is the three fields that
    // identify an archived CSD. Readable on purpose — a hash would be opaque in
    // the staging table — and stable, so a re-run skips rather than duplicates.
    const sourceId = eventId ?? `past:${start.slice(0, 10)}:${slug(city, 24)}:${slug(title)}`

    events.push({
      eventId,
      sourceId,
      title,
      start,
      end,
      city,
      region,
      countryCode,
      venueName,
      // 497 of 498 rows link at least one site; the source page is the honest
      // fallback for the last one, and `urls` must be non-empty or the contract
      // raises E_SOURCE_URL_MISSING.
      websites: websites.length ? websites : [sourceUrl],
      past,
      eventType: classifyEventType(title),
    })
  }

  return { events, skipped }
}
