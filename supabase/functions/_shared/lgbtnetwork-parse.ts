// ============================================================
// lgbtnetwork.org — the NY LGBT Network's calendar (WordPress + EventON)
//
// The only US source among the ten, and the largest by count: 2,380 events.
//
// ── THE LIST HAS NO DATES ────────────────────────────────────
// `/wp-json/wp/v2/ajde_events` returns id, slug, link and content for all 2,380
// rows and NO date: `acf` is `[]`, `meta` holds four unrelated keys, and the
// `event_type` / `event_type_2` taxonomies are empty on every row sampled.
// EventON keeps occurrence times in its own table, so the core REST API cannot
// see them. Committing straight from the list would reject EVERY row on
// `event_missing_start_date`. Dates come from the detail page.
//
// ── USE THE EPOCH, NOT THE JSON-LD DATE ──────────────────────
// The detail page carries both. The JSON-LD emits `"2026-9-30T18:00-4:00"` —
// unpadded month and day, and a non-standard one-digit offset. Measured:
// `new Date()` returns **NaN** on that, and still NaN if only the offset is
// padded; both have to be repaired. `data-time="<start>-<end>"` is an
// unambiguous unix pair and agrees with the JSON-LD once repaired, so it is the
// primary and the JSON-LD is only a fallback.
//
// ── LOCATION: STRICT, BY DECISION ────────────────────────────
// This source's location data is the worst of the ten and cannot be geocoded
// safely, so a venue is accepted ONLY when its address states city AND state.
//
// Two measurements drive that. (1) `pipeline-validate` treats a row with no
// venue_id, no city and no coordinates as `E_NO_LOCATION`, which is an ERROR —
// the row is rejected, not reviewed. (2) EventON's own `data-latlng` is WRONG:
// it places the LGBT Network Queens LGBT Center — 18 of 66 sampled events — at
// 33.4894,-112.1343, which is downtown **Phoenix, Arizona**, because the
// address "35-11 35th Ave" has no city and the site's map API matched Phoenix's
// 35th Avenue. The Hamptons centre likewise lands on Staten Island. So the
// upstream coordinate is never adopted, and a locality guessed from the venue's
// name is not a substitute — an independently geocoded candidate for
// "44 Union Street" + "Hamptons" came back as Union Square, Manhattan, and a
// state-level check cannot tell that from a correct answer.
//
// The cost is coverage: roughly half the corpus has no usable address and its
// events will be rejected downstream. That is the deliberate trade — a missing
// location is recoverable, a wrong one on a queer venue is not.
// ============================================================

// ── WHY THERE IS NO EVENT-TYPE INFERENCE HERE ────────────────
// The obvious move is to reuse `inferEventType` from berlin-events-parse rather
// than add a fourth copy of that logic. It was tried and MEASURED over 330 real
// titles, and it must not be used on this source:
//
//   other 68.2% | drag 11.2% | social 4.8% | pride 4.8% | community 3.9% | ...
//
// Of the 37 titles it typed `drag`, only 3 contain the word "drag". The other
// **34 matched on "Queens" — the New York BOROUGH** — because the ladder's rung
// is `/\bdrag\b|travestie|tunte|queen[s]?\b/i`. Worse, **26 of those 34 are
// youth events** ("Queens Queer Youth Group (13-18)"). Labelling a 13-18 LGBT
// youth service as a drag event is not a cosmetic mis-tag on this platform.
//
// So `event_type` is a flat 'other' here: 68% would have been 'other' anyway,
// and the part that was typed is overwhelmingly wrong in the one direction that
// causes harm. An honest 'other' beats a confident mislabel.
//
// The ladder rung is a latent bug for any source with NYC titles — 19 rows in
// `events` already carry `event_type='drag'` with "Queens" and no "drag" — but
// fixing it changes classifications for the German corpus it was written for,
// so it is filed separately rather than changed here.

export interface LnEvent {
  /** WordPress post id. Real and stable — measured 200/200 distinct, all < 10^7. */
  id: string
  slug: string
  url: string
  title: string
  /** ISO-8601 UTC, from the unix pair. */
  start: string
  end: string | null
  description: string | null
  image: string | null
  eventType: string
  venueName: string | null
  street: string | null
  city: string | null
  state: string | null
  postal: string | null
  /** 'US' only when the address actually resolved; never assumed. */
  country: string | null
}

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

/** `data-time="1790805600-1790812800"` — the authoritative start/end pair. */
export function epochPair(html: unknown): { start: number; end: number | null } | null {
  const m = String(html ?? '').match(/data-time="(\d{9,11})-(\d{9,11})"/)
  if (!m) return null
  const start = Number(m[1])
  const end = Number(m[2])
  if (!Number.isFinite(start) || start <= 0) return null
  return { start, end: Number.isFinite(end) && end > start ? end : null }
}

/**
 * Repair the JSON-LD's malformed date. BOTH defects must be fixed — padding
 * only the offset still yields NaN, which is how a first pass silently reported
 * "0% agreement" between the two date sources when the truth was that the
 * comparison itself was broken.
 */
export function repairJsonLdDate(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const fixed = s
    .replace(/^(\d{4})-(\d{1,2})-(\d{1,2})T/, (_m, y, mo, d) =>
      `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T`)
    .replace(/([+-])(\d):(\d{2})$/, '$10$2:$3')
  const t = new Date(fixed).getTime()
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

export function readEventJsonLd(html: unknown): Record<string, unknown> | null {
  for (const m of String(html ?? '').matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let blob: unknown
    try { blob = JSON.parse(m[1]) } catch { continue }
    for (const o of (Array.isArray(blob) ? blob : [blob])) {
      if (!o || typeof o !== 'object') continue
      const graph = (o as Record<string, unknown>)['@graph'] ?? [o]
      for (const n of (Array.isArray(graph) ? graph : [graph])) {
        if (n && String((n as Record<string, unknown>)['@type'] ?? '').includes('Event')) {
          return n as Record<string, unknown>
        }
      }
    }
  }
  return null
}

const STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
])

/**
 * A US address is accepted ONLY when it states a city AND a state — the whole
 * point of this parser's strictness. Anything less resolves to nulls, so the
 * event is rejected downstream rather than given an invented or mis-geocoded
 * location.
 *
 * Handles both shapes the source uses:
 *   "34-10 30th Ave., Astoria, NY 11103"   (comma before the city)
 *   "25 Ponquogue Ave. Hampton Bays, NY 11946"  (no comma; city runs on)
 */
export function parseUsAddress(raw: unknown): {
  street: string | null; city: string | null; state: string | null; postal: string | null
} {
  const none = { street: null, city: null, state: null, postal: null }
  const s = stripTags(raw)
  if (!s) return none

  // The state is the anchor: ", XX" optionally followed by a ZIP.
  const m = s.match(/^(.*?),\s*([A-Z]{2})\b\.?\s*(\d{5}(?:-\d{4})?)?\s*$/)
  if (!m || !STATES.has(m[2])) return none
  const head = m[1].trim().replace(/,\s*$/, '')
  const state = m[2]
  const postal = m[3] ?? null
  if (!head) return none

  // Split the head into street + city. A trailing comma segment is the city.
  const parts = head.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return { street: parts.slice(0, -1).join(', '), city: parts[parts.length - 1], postal, state }
  }
  // No comma: the city runs on after the street type ("... Ave. Hampton Bays").
  const runOn = head.match(
    /^(.*?\b(?:Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane|Way|Pl|Place|Ct|Court|Hwy|Highway|Pkwy|Parkway|Tpke|Turnpike)\b\.?)\s+(.+)$/i,
  )
  if (runOn && runOn[2].trim()) {
    return { street: runOn[1].trim(), city: runOn[2].trim(), postal, state }
  }
  // A state and ZIP but no separable city is NOT enough — see the header.
  return none
}

export function parseEvent(html: unknown, listRow: { id: unknown; slug: unknown; link: unknown }): LnEvent | null {
  const id = String(listRow.id ?? '').trim()
  const url = String(listRow.link ?? '').trim()
  if (!id || !url) return null

  const ld = readEventJsonLd(html)
  const pair = epochPair(html)

  const title = stripTags(ld?.name) || stripTags((listRow as Record<string, unknown>).title)
  const start = pair ? new Date(pair.start * 1000).toISOString() : repairJsonLdDate(ld?.startDate)
  // commit RAISEs on either of these; drop rather than bank a rejected row.
  if (!title || !start) return null

  const loc = (Array.isArray(ld?.location) ? ld?.location[0] : ld?.location) as Record<string, unknown> | undefined
  const addr = parseUsAddress((loc?.address as Record<string, unknown>)?.streetAddress ?? loc?.address)
  const venueName = stripTags(loc?.name) || null

  // No usable city means pipeline-validate raises E_NO_LOCATION and REJECTS the
  // row. Measured over 40 pages spread across the corpus, only ~15% carry a
  // city — so staging the rest would bank roughly 2,000 rejected rows to learn
  // what is already knowable here. Drop them instead and keep the staging table
  // honest. This is the "skip the rest" half of the strict-location decision.
  if (!addr.city) return null
  const description = stripTags(ld?.description) || null
  const image = Array.isArray(ld?.image) ? String(ld.image[0] ?? '') : String(ld?.image ?? '')

  return {
    id,
    slug: String(listRow.slug ?? '') || id,
    url,
    title,
    start,
    end: pair?.end ? new Date(pair.end * 1000).toISOString() : repairJsonLdDate(ld?.endDate),
    description,
    image: image ? image.split('?')[0] : null,
    // Flat 'other' on purpose — see the header. Title inference mislabels 26
    // youth events as `drag` on this corpus.
    eventType: 'other',
    venueName,
    street: addr.street,
    city: addr.city,
    state: addr.state,
    postal: addr.postal,
    // Only claimed when the address actually resolved.
    country: addr.city && addr.state ? 'US' : null,
  }
}
