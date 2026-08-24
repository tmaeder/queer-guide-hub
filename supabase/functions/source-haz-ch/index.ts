import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { normalizeVenueCategory } from '../_shared/venue-category.ts'

// ============================================================
// Source: haz.ch/events — HAZ (Homosexuelle Arbeitsgruppen Zürich / Queer
// Zürich)'s own agenda of support groups, discussion circles and open-house
// hours at their Regenbogenhaus community center.
//
// WordPress + The Events Calendar (free tier, not PRO). Same platform as
// milchjugend.ch, but structurally simpler: `/wp-json/tribe/events/v1/events`
// serves clean JSON, per-page cap 50, default window now..+2y (301 events
// measured 2026-08-24, 7 pages). Every occurrence of a recurring meetup
// ("Bi-Gruppe", "Trans-Treff", ...) is its OWN WordPress post with a real,
// stable numeric id and a unique slug (WP's own "-2"/"-3"/... auto-suffix on
// collision) — unlike milchjugend's TEC-PRO recurrence engine, there is no
// provisional-id trap here, so identity is simply the post slug.
//
// VENUE NAME IS A ROOM LABEL, NOT AN ADDRESS. HAZ hosts nearly everything in
// its own building, but the `venue.venue` string varies by which internal
// room is booked — 13 distinct strings observed across all 301 live events,
// all of them "Regenbogenhaus[, Zollstrasse 117, 8005 Zürich, Schweiz][,
// House of Books|Color|Fluid|Love|Zollküche]" or "Gleis // House of X". The
// venue REST endpoint (`/venues/{id}`) carries no structured address at all
// (measured: every field empty). The DB already holds nine near-duplicate
// "Regenbogenhaus..." venue rows from unrelated prior imports (event-import,
// email_ingest, google, unknown — none of them haz.ch) — collapsing every
// Regenbogenhaus room variant onto ONE identity here is what stops this
// source adding a tenth. `parseVenue` below hardcodes the two buildings HAZ
// is evidenced (by its own feed) to use; anything unrecognised falls through
// to a generic "Name, Street, NNNN City, Country" comma-split so a future
// third venue is not silently merged into one of the two known ones.
// ============================================================

const BASE = 'https://haz.ch/wp-json/tribe/events/v1'
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)'

/**
 * `commit_event_staging_item` reads several keys `NormalizedItem` does not
 * declare (event_type, venue_name, ticket_url, and location's postal_code /
 * country / timezone). They are additive, not a different shape — see
 * source-gay-ch / source-milchjugend for the same widening.
 */
type StagedItem = Omit<NormalizedItem, 'location'> &
  Record<string, unknown> & {
    location?: NonNullable<NormalizedItem['location']> & Record<string, unknown>
  }

/** `&amp;` decoded LAST — decoding it first turns `&amp;lt;` into a live `<`. */
const stripTags = (s: unknown): string =>
  String(s ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const slugify = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const COUNTRY_WORDS: Record<string, string> = {
  schweiz: 'CH', switzerland: 'CH', suisse: 'CH', svizzera: 'CH', ch: 'CH',
  deutschland: 'DE', germany: 'DE', 'österreich': 'AT', austria: 'AT',
}

function resolveCountry(blob: string): string | null {
  for (const [word, code] of Object.entries(COUNTRY_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(blob)) return code
  }
  return null
}

interface VenueFacts {
  name: string
  street: string | null
  postal: string | null
  city: string | null
  country: string | null
}

/**
 * See the file header for why the two buildings are hardcoded. Order matters:
 * "Gleis" is checked FIRST because both buildings reuse the same "House of
 * Books/Color/Fluid/Love" room names (Bi-Gruppe's own description places
 * "Kulturbar «Gleis»" at Zollhaus Haus A and Regenbogenhaus at Zollhaus Haus
 * B — two floors of one complex, sharing a room-naming scheme) — a bare
 * "House of Colors bis House of Books" (36 of 301 events, no building
 * prefix) is Regenbogenhaus's own historical short form (confirmed by the
 * "Regenbogenhaus, House of Books und Fluid" siblings elsewhere in the same
 * feed), whereas every Gleis event is consistently prefixed "Gleis //" in
 * this feed. Checking Regenbogenhaus's room names before ruling out Gleis
 * would misfile "Gleis // House of Color" into the wrong building.
 */
function matchKnownVenue(name: string): VenueFacts | null {
  if (/\bgleis\b/i.test(name)) {
    return { name: 'Gleis', street: null, postal: null, city: 'Zürich', country: 'CH' }
  }
  if (/regenbogenhaus|zollk[üu]che|(?:house|haus) of (books?|colou?rs?|fluid|love)/i.test(name)) {
    return { name: 'Regenbogenhaus', street: 'Zollstrasse 117', postal: '8005', city: 'Zürich', country: 'CH' }
  }
  return null
}

function parseVenue(raw: unknown): VenueFacts | null {
  const name = stripTags(raw)
  if (!name) return null

  const known = matchKnownVenue(name)
  if (known) return known

  // Generic fallback: "Name, Street, NNNN City[, Country]" — the shape gay.ch
  // and milchjugend also parse for a listing with no structured venue index.
  const segs = name.split(',').map((s) => s.trim()).filter(Boolean)
  let cityIdx = -1
  for (let i = segs.length - 1; i >= 1; i--) {
    if (/^\d{4,5}\s+\S/.test(segs[i])) { cityIdx = i; break }
  }
  if (cityIdx < 0) {
    return { name: segs[0] ?? name, street: null, postal: null, city: null, country: resolveCountry(name) }
  }
  const m = segs[cityIdx].match(/^(\d{4,5})\s+(.+)$/)!
  return {
    name: segs[0],
    street: segs.slice(1, cityIdx).join(', ') || null,
    postal: m[1],
    city: m[2].trim(),
    country: resolveCountry(name),
  }
}

/** Post `id` is stable at this org (measured 700-3048, no TEC-PRO recurrence engine). */
function venueKey(v: VenueFacts): string {
  return `${slugify(v.name)}|${slugify(v.city)}`
}

/**
 * HAZ's feed carries no categories/tags at all (measured: empty on every one
 * of 301 live events) — every event title is one of 17 distinct German/
 * English group names, so the mapping is title-keyword, not taxonomy-slug.
 * `trg_events_taxonomy` coerces anything unmapped to 'other'; 'community' is
 * used as the deliberate default here instead, since an unrecognised HAZ
 * event is still, by the org's own remit, a community support offering.
 */
const TYPE_RULES: [RegExp, string][] = [
  [/bibliothek|library open/i, 'community'],
  [/spiele|game/i, 'social'],
  [/znacht|zollküche/i, 'social'],
  [/gruppe|treff|stammtisch|talks|discussion|gespräch|buckclub|book club/i, 'meetup'],
]

function pickEventType(title: string): string {
  for (const [re, type] of TYPE_RULES) if (re.test(title)) return type
  return 'community'
}

interface ParsedEvent {
  slug: string
  url: string
  title: string
  start: string
  end: string | null
  description: string | null
  image: string | null
  cost: string | null
  venue: VenueFacts | null
}

function parseEvent(raw: unknown): ParsedEvent | null {
  const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const slug = String(e.slug ?? '').trim()
  const title = stripTags(e.title)
  const utcStart = String(e.utc_start_date ?? '').trim()
  const start = utcStart ? new Date(utcStart.replace(' ', 'T') + 'Z').toISOString() : null
  if (!slug || !title || !start || Number.isNaN(Date.parse(start))) return null

  const utcEnd = String(e.utc_end_date ?? '').trim()
  const end = utcEnd ? new Date(utcEnd.replace(' ', 'T') + 'Z').toISOString() : null

  const img = e.image
  const image = img && typeof img === 'object'
    ? stripTags((img as Record<string, unknown>).url)
    : (typeof img === 'string' ? stripTags(img) : null)

  const venueField = e.venue as Record<string, unknown> | undefined
  // 2 of 301 live events (both "Regenbogenznacht (Zollküche) – mit
  // Anmeldung") carry no venue field at all — but the title itself names the
  // room ("Zollküche"), which matchKnownVenue already recognises as a
  // Regenbogenhaus room. Only the two-buildings keyword match is tried
  // against the title (never the generic comma-split fallback) — a title
  // like "Bi-Gruppe" must NOT become a fabricated venue named "Bi-Gruppe".
  const venue = venueField?.venue ? parseVenue(venueField.venue) : matchKnownVenue(title)

  return {
    slug,
    url: String(e.url ?? `https://haz.ch/event/${slug}/`),
    title,
    start,
    end,
    description: stripTags(e.description) || null,
    image: image || null,
    cost: stripTags(e.cost) || null,
    venue,
  }
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`haz-ch ${res.status} for ${url}`)
  return await res.json()
}

/** `total_pages` is authoritative; an empty page ends the walk defensively. */
async function fetchAllEvents(cap: number): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let page = 1; out.length < cap; page++) {
    const d = await getJson(`${BASE}/events?per_page=50&page=${page}&status=publish`)
    const items = (d.events as Record<string, unknown>[]) ?? []
    if (!items.length) break
    out.push(...items)
    if (page >= Number(d.total_pages ?? 1)) break
  }
  return out.slice(0, cap)
}

const eventAdapter: SourceAdapter = {
  name: 'haz-ch',
  entityType: 'event',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const items: RawItem[] = []
    for (const row of await fetchAllEvents(config.batchSize)) {
      const parsed = parseEvent(row)
      // A row missing title/start is dropped here rather than staged: commit
      // RAISEs event_missing_title / event_missing_start_date on it anyway,
      // which only costs a rejected row to learn what is already knowable.
      if (parsed) items.push({ sourceId: parsed.slug, data: parsed as unknown as Record<string, unknown> })
    }
    return items
  },

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const e = raw.data as unknown as ParsedEvent
    const v = e.venue
    const item: StagedItem = {
      entityType: 'event',
      sourceId: e.slug,
      sourceName: 'haz-ch',
      name: e.title,
      title: e.title,
      description: e.description ?? undefined,
      event_type: pickEventType(e.title),
      start_date: e.start,
      end_date: e.end,
      dates: { start: e.start, end: e.end ?? undefined },
      venue_name: v?.name ?? null,
      website: e.url,
      ticket_url: e.url,
      location: {
        address: v?.street ?? undefined,
        city: v?.city ?? undefined,
        postal_code: v?.postal ?? undefined,
        country: v?.country ?? undefined,
        timezone: 'Europe/Zurich',
      },
      images: e.image ? [e.image] : [],
      tags: ['lgbtq'],
      urls: [e.url],
      metadata: { source: 'haz-ch', url: e.url, cost: e.cost, venue_source_id: v ? venueKey(v) : null },
    }
    return item
  },
}

const venueAdapter: SourceAdapter = {
  name: 'haz-ch',
  entityType: 'venue',

  // Venues come from the already-parsed events; see venuesFromEvents.
  fetch: () => Promise.resolve([]),

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const v = raw.data as unknown as VenueFacts
    // Only the Regenbogenhaus building is evidenced (by HAZ's own site, its
    // own community center) as a community_center; anything else parsed
    // generically has no such evidence and stays 'other', same conservatism
    // as source-milchjugend.
    const category = normalizeVenueCategory(v.name === 'Regenbogenhaus' ? 'community_center' : null)
    const item: StagedItem = {
      entityType: 'venue',
      sourceId: venueKey(v),
      sourceName: 'haz-ch',
      name: v.name,
      category,
      location: {
        address: v.street ?? undefined,
        city: v.city ?? undefined,
        postal_code: v.postal ?? undefined,
        country: v.country ?? undefined,
      },
      tags: ['lgbtq'],
      metadata: { source: 'haz-ch' },
    }
    return item
  },
}

function venuesFromEvents(events: RawItem[]): RawItem[] {
  const seen = new Map<string, RawItem>()
  for (const e of events) {
    const v = (e.data as unknown as ParsedEvent).venue
    if (!v?.name) continue
    const key = venueKey(v)
    if (!seen.has(key)) seen.set(key, { sourceId: key, data: v as unknown as Record<string, unknown> })
  }
  return [...seen.values()]
}

Deno.serve(withErrorReporting('source-haz-ch', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      // Must exceed the whole forward window (301 live, measured 2026-08-24) —
      // fetchAllEvents always restarts at page 1, so a cap below the window
      // size would re-read the same head every run and never reach the tail.
      batchSize: body.limit ?? body.batch_size ?? 500,
      dryRun: body.dry_run ?? body.dryRun ?? false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }

    const rawEvents = await eventAdapter.fetch(config)
    const rawVenues = venuesFromEvents(rawEvents)

    if (config.dryRun) {
      return jsonResponse({
        success: true,
        items: rawEvents.length,
        venues: rawVenues.length,
        dry_run: true,
        sample: rawEvents.slice(0, 3).map((r) => eventAdapter.normalize(r)),
      }, 200, req)
    }

    const events = await writeToStaging(supabase, eventAdapter, rawEvents, { ...config, targetTable: 'events' })
    const venues = await writeToStaging(supabase, venueAdapter, rawVenues, {
      ...config,
      targetTable: 'venues',
      entityType: 'venue',
    })

    return jsonResponse({
      success: true,
      items: events + venues,
      items_total: rawEvents.length + rawVenues.length,
      items_processed: events + venues,
      items_succeeded: events + venues,
      items_failed: 0,
      events,
      venues,
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
