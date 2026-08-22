// ============================================================
// milchjugend.ch — pure parsing for The Events Calendar REST payloads.
//
// Lives in _shared (not source-milchjugend/parse.ts) so the one-shot archive
// importer can import the SAME code as the cron'd edge function — the
// berlin-events-parse / patroc-parse precedent. Node >= 22 strips the types, so
// a .mjs script can `import` this file directly.
//
// ── THE IDENTITY TRAP ────────────────────────────────────────
// `event.id` is NOT stable and must never be used as source_entity_id.
//
// milchjugend runs The Events Calendar PRO, whose recurring occurrences are
// served as PROVISIONAL ids offset from `Occurrence::$provisional_id_base`
// (10,000,000). They are regenerated out of `tec_occurrences` whenever a
// recurrence rule is edited, so a single upstream edit re-keys every occurrence
// in the series and the whole corpus re-inserts as new rows. That is the
// spartacus failure exactly — it keyed on `<name-slug>:<city>` and duplicated
// 47% of itself.
//
// Measured over 150 live events (2026-08-22):
//   • 146 ids >= 10,000,000 — ALL 146 carry a date in their permalink
//   •   4 ids <  10,000,000 — NONE carry a date
//   •  21 distinct titles across those 150 rows (Queerterthur x27,
//      Milchbar Baden x27, Heldenbar x26) — recurring series ARE the corpus
//
// So identity comes from the site's own permalink, which is what the site
// itself treats as the address of an occurrence:
//   /event/queerterthur-jugendtreff/2026-08-04/ -> queerterthur-jugendtreff:2026-08-04
//   /event/walk-in-transberatung-2/            -> walk-in-transberatung-2
// 150/150 distinct, zero collisions.
//
// ── COORDINATES ──────────────────────────────────────────────
// Unlike display-magazin, this API ships `venue.geo_lat` / `geo_lng`, present on
// 148/150 sampled rows. That clears W_NO_GEO for every row that has a venue, so
// even the past archive lands on 1 warning (W_EVENT_IN_PAST) — under
// pipeline-validate's threshold of 3. No Photon pass is needed for this source.
// ============================================================

export interface MjVenue {
  /** The venue's WordPress post id. Real, not provisional (measured < 10^7). */
  id: string | null
  name: string
  street: string | null
  postal: string | null
  city: string | null
  state: string | null
  country: string | null
  lat: number | null
  lng: number | null
  website: string | null
}

export interface MjEvent {
  /** Permalink-derived. See the identity note above. */
  key: string
  url: string
  title: string
  /** ISO-8601 UTC. */
  start: string
  end: string | null
  description: string | null
  image: string | null
  eventType: string
  timezone: string | null
  cost: string | null
  website: string | null
  categories: string[]
  tags: string[]
  venue: MjVenue | null
}

/**
 * HTML -> plain text.
 *
 * `&amp;` is decoded LAST, deliberately: decoding it first turns `&amp;lt;` into
 * `&lt;` and the next rule turns that into `<`, so text the source deliberately
 * escaped silently becomes markup (CodeQL flags the other order as
 * js/double-escaping). Numeric entities are safe ahead of it, because
 * `&amp;#60;` contains no `&#60;` substring.
 */
export const stripTags = (s: unknown): string =>
  String(s ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Identity. Derived from the permalink ONLY — `event.id` is deliberately not a
 * parameter of this function, so the provisional id cannot be reached for by
 * accident.
 *
 * A recurring occurrence's permalink carries its date and keys on
 * `<slug>:<date>`; a single event's does not and keys on `<slug>` alone, so
 * rescheduling it is an UPDATE rather than a second row.
 *
 * TWO occurrences can fall on the SAME DAY, and Tribe then appends a sequence
 * segment — `/event/pride-boat/2026-05-22/1/` and `.../2/` are the 08:00 and the
 * 19:30 sailing. The sequence is part of the identity: without it the pair
 * collides onto one key and half the series is lost. Measured over the full
 * 1,654-event corpus, 10 rows have this shape (5 series x 2), and an earlier
 * revision of this regex — which required the date to end the path — dropped
 * every one of them silently.
 */
export function occurrenceKey(url: unknown): string | null {
  const m = String(url ?? '')
    .match(/\/event\/([^/?#]+)(?:\/(\d{4}-\d{2}-\d{2}))?(?:\/(\d+))?\/?(?:[?#]|$)/)
  if (!m) return null
  const [, slug, day, seq] = m
  return slug + (day ? `:${day}` : '') + (seq ? `:${seq}` : '')
}

const COUNTRY_WORDS: Record<string, string> = {
  schweiz: 'CH', switzerland: 'CH', suisse: 'CH', svizzera: 'CH', svizra: 'CH', ch: 'CH',
  deutschland: 'DE', germany: 'DE', allemagne: 'DE', de: 'DE',
  'österreich': 'AT', oesterreich: 'AT', austria: 'AT', autriche: 'AT', at: 'AT',
  france: 'FR', frankreich: 'FR', fr: 'FR',
  italia: 'IT', italien: 'IT', italy: 'IT', it: 'IT',
  liechtenstein: 'LI', li: 'LI',
}

/**
 * Country from evidence, else NULL — never a guess.
 *
 * 57 of 150 sampled venues carry no country at all and the rest are split
 * "Schweiz" / "Switzerland", so this path is the common case. A NULL is filled
 * later by `derive_entity_geo_address` from the linked city; a WRONG country is
 * not recoverable the same way, because it drives safety-gating and city
 * linking (the AZ/Sedona -> Azerbaijan class).
 *
 * The postal shape is only consulted when the country field is empty. It is a
 * weak signal — CH and AT are both 4 digits — but this source is Swiss-only in
 * practice and a 4-digit code beside a Swiss street is far better evidence than
 * nothing. Anything ambiguous still resolves through the country word first.
 */
export function resolveCountry(country?: unknown, zip?: unknown, address?: unknown): string | null {
  const w = stripTags(country).toLowerCase()
  if (w && COUNTRY_WORDS[w]) return COUNTRY_WORDS[w]
  const z = String(zip ?? '').trim()
  if (/^[1-9]\d{3}$/.test(z)) return 'CH'
  if (/^\d{5}$/.test(z)) return 'DE'
  const blob = stripTags(address)
  if (/\b[1-9]\d{3}\s+[A-Za-zÀ-ÿ]/.test(blob)) return 'CH'
  if (/\b\d{5}\s+[A-Za-zÀ-ÿ]/.test(blob)) return 'DE'
  return null
}

/**
 * A city that is only digits is a postal code in the wrong field.
 * `events_city_nonjunk_check` / `venues_city_nonjunk_check` forbid a purely
 * numeric city, so passing it through does not make a bad row — it makes a
 * REJECTED staging item.
 */
export function cityOrPostal(raw: unknown): { city: string | null; postal: string | null } {
  const s = stripTags(raw)
  if (!s) return { city: null, postal: null }
  return /^\d{4,5}$/.test(s) ? { city: null, postal: s } : { city: s, postal: null }
}

/**
 * Tribe writes the town into `stateprovince` on plenty of records — WERKK Baden
 * carries stateprovince "Baden", which is its CITY, not a canton. A state equal
 * to the city is noise, and it would otherwise beat the value
 * `derive_entity_geo_address` fills from `cities.region_name`.
 */
export function cleanState(state: unknown, city: unknown): string | null {
  const s = stripTags(state)
  if (!s) return null
  return s.toLowerCase() === stripTags(city).toLowerCase() ? null : s
}

/** A coordinate that is absent, unparseable or the null island is not a coordinate. */
export function coord(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim())
  return Number.isFinite(n) && n !== 0 ? n : null
}

/**
 * Tribe returns local WALL TIME with no offset plus a separate IANA `timezone`,
 * so a fixed "+02:00" is right in July and an hour wrong in December. Round-trip
 * through Intl to recover the zone's real offset at that instant.
 *
 * Only the FALLBACK — see `toIso`.
 */
export function toIsoFromLocal(local: unknown, tz: unknown): string | null {
  const raw = String(local ?? '').trim()
  if (!raw) return null
  const asUtc = new Date(raw.replace(' ', 'T') + 'Z')
  if (!Number.isFinite(asUtc.getTime())) return null
  let parts: Record<string, string>
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: String(tz ?? '') || 'UTC', hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).formatToParts(asUtc).map((p) => [p.type, p.value]),
    )
  } catch {
    return asUtc.toISOString() // an unknown IANA zone must not lose the event
  }
  const back = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  )
  return new Date(asUtc.getTime() - (back - asUtc.getTime())).toISOString()
}

/**
 * Prefer Tribe's OWN `utc_start_date`. The plugin computes it server-side from
 * the event's zone, so re-deriving the offset locally is both unnecessary and a
 * chance to be an hour wrong across a DST boundary.
 */
export function toIso(utcField: unknown, localField: unknown, tz: unknown): string | null {
  const u = String(utcField ?? '').trim()
  if (u) {
    const d = new Date(u.replace(' ', 'T') + 'Z')
    if (Number.isFinite(d.getTime())) return d.toISOString()
  }
  return toIsoFromLocal(localField, tz)
}

/**
 * milchjugend's category slugs -> the `events_event_type_check` vocabulary,
 * which `trg_events_taxonomy` enforces by coercing anything unlisted to 'other'.
 *
 * Every slug here was observed live; the counts are from the 150-event sample.
 * Rank orders specificity, because an event commonly carries two categories
 * ("jugendtreff" + "bar") and the venue kind is the less informative of the two.
 */
const TYPE_RANK: [string, string][] = [
  ['pride', 'pride'],
  ['drag', 'drag'],
  ['festival', 'festival'],
  ['party', 'party'],
  ['tanz', 'party'],
  ['film', 'film'],
  ['theater', 'theater'],
  ['konzert', 'concert'],
  ['musik', 'concert'],
  ['kunst', 'art'],
  ['sport', 'sports'],
  ['workshop', 'workshop'],
  ['bildung', 'workshop'],
  ['literatur', 'workshop'],
  ['politik', 'protest'],
  ['beratung', 'community'],
  ['austausch', 'community'],
  ['jugendtreff', 'community'],
  ['essen', 'social'],
  ['outdoor', 'social'],
  ['bar', 'social'],
  ['feiertag', 'other'],
]

/** The most specific mapped category wins; an all-unknown set yields 'other'. */
export function pickEventType(slugs: unknown): string {
  const set = new Set((Array.isArray(slugs) ? slugs : []).map((s) => String(s ?? '').toLowerCase()))
  for (const [slug, type] of TYPE_RANK) if (set.has(slug)) return type
  return 'other'
}

const slugsOf = (list: unknown): string[] =>
  (Array.isArray(list) ? list : [])
    .map((t) => String((t as Record<string, unknown>)?.slug ?? '').trim())
    .filter(Boolean)

export function parseVenue(raw: unknown): MjVenue | null {
  const v = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null) as Record<string, unknown> | null
  const name = stripTags(v?.venue)
  if (!v || !name) return null
  const { city, postal } = cityOrPostal(v.city)
  const zip = stripTags(v.zip) || postal
  return {
    id: v.id != null ? String(v.id) : null,
    name,
    street: stripTags(v.address) || null,
    postal: zip || null,
    city,
    state: cleanState(v.stateprovince ?? v.province, city),
    country: resolveCountry(v.country, zip, v.address),
    lat: coord(v.geo_lat),
    lng: coord(v.geo_lng),
    website: stripTags(v.website) || null,
  }
}

/** Returns null when the row lacks the two fields commit hard-rejects without. */
export function parseEvent(raw: unknown): MjEvent | null {
  const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const url = String(e.url ?? '')
  const title = stripTags(e.title)
  const start = toIso(e.utc_start_date, e.start_date, e.timezone)
  const key = occurrenceKey(url)
  if (!key || !title || !start) return null

  const categories = slugsOf(e.categories)
  const image = e.image && typeof e.image === 'object'
    ? stripTags((e.image as Record<string, unknown>).url)
    : stripTags(e.image)

  return {
    key,
    url,
    title,
    start,
    end: toIso(e.utc_end_date, e.end_date, e.timezone),
    description: stripTags(e.description) || stripTags(e.excerpt) || null,
    image: image || null,
    eventType: pickEventType(categories),
    timezone: stripTags(e.timezone) || null,
    cost: stripTags(e.cost) || null,
    website: stripTags(e.website) || null,
    categories,
    tags: slugsOf(e.tags),
    venue: parseVenue(e.venue),
  }
}

/**
 * Venue identity is the venue's own WordPress post id — a real post id, not a
 * provisional one (measured: 1762, 8699, 14758, 15127, all < 10^7). Name+city is
 * the fallback for a venue served without one.
 */
export function venueKey(v: MjVenue): string {
  if (v.id) return `venue-${v.id}`
  const slug = (s: string | null) =>
    String(s ?? '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `venue-${slug(v.name)}|${slug(v.city)}`
}
