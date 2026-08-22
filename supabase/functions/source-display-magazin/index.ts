import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// Source: display-magazin.ch — Swiss LGBTQ+ lifestyle magazine agenda
//
// WordPress + The Events Calendar. `/wp-json/tribe/events/v1/` serves events
// AND venues as clean JSON, so there is NO HTML parsing here and there must
// not be: the pre-existing `scrape_sources` row for this site
// (20260228130100, `is_enabled=false`) guesses CSS selectors against a page
// that is server-rendered from this very API, which is why it never produced
// a row. That row stays disabled; this function replaces it.
//
// WINDOW: the REST default is "now .. now+2y" and silently hides the archive.
// This function deliberately keeps a FORWARD window — the 2015→now archive is
// a one-shot job (scripts/data-quality/import-swiss-events.mjs), not something
// a daily cron should re-walk. `days_back` only exists to re-catch an event
// edited just after it happened.
//
// VENUES: staged as a second batch, but only the venues the fetched events
// actually reference. The site has 381 venue records; re-staging all of them
// nightly would be 381 no-op inserts a day for a corpus that changes by a
// handful. Venue rows are what let `commit_event_staging_item` resolve
// venue_name later, and they carry the street address the events omit.
//
// IDENTITY: the WordPress post id, for both kinds. `ux_ingestion_staging_source_idem`
// is UNIQUE on (source_name, sha1(source_name||':'||source_entity_id)), so events
// and venues share one namespace under source_name='display-magazin' — safe
// because WP post ids are unique ACROSS post types, not per type.
//
// NO GEOCODING HERE. Neither this source nor gay.ch publishes coordinates, and
// a per-run Photon pass inside a cron'd edge function is a slow third-party
// call on the critical path. A forward-dated event without coords collects
// W_NO_GEO (+ maybe W_DESCRIPTION_THIN) = 2 warnings, under pipeline-validate's
// warn_review_threshold of 3, so it still auto-approves. Only the PAST archive
// needs coords to stay under that bar, and the one-shot importer geocodes it.
// A committed venue with no coords is flagged needs_attention, which is the
// designed signal rather than a silent gap.
// ============================================================

const BASE = 'https://www.display-magazin.ch/wp-json/tribe/events/v1'
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)'

/** display-magazin category slug -> events_event_type_check vocabulary. */
const TYPE_MAP: Record<string, string> = {
  'party-nightlife': 'party',
  'pride-festivals': 'pride',
  'film-kino': 'film',
  'community-stammtisch': 'community',
  'theater-buehne': 'theater',
  'sport-outdoor': 'sports',
  'konzerte-musik': 'concert',
  'kunst-ausstellungen': 'art',
  'bildung-politik': 'workshop',
  'literatur-talks': 'workshop',
  'food-drinks': 'social',
  weitere: 'other',
}

/**
 * `commit_event_staging_item` / `commit_venue_staging_item` read several keys
 * NormalizedItem does not declare (event_type, venue_name, ticket_url, the
 * postal/state members of location). They are additive, not a different shape.
 *
 * Note that putting event_type inside `metadata` — as source-eventbrite does —
 * means commit never sees it and every row lands as 'other'; it belongs at the
 * root.
 *
 * `location` needs its own widening: an intersection with Record<string, unknown>
 * does not loosen a NESTED object literal, and NormalizedItem['location'] knows
 * nothing about state / postal_code / timezone even though both commit RPCs read
 * all three. Widened here rather than in _shared/source-adapter.ts to keep the
 * blast radius at these two Swiss sources.
 */
type StagedItem = Omit<NormalizedItem, 'location'> &
  Record<string, unknown> & {
    location?: NonNullable<NormalizedItem['location']> & Record<string, unknown>
  }

const stripTags = (s: unknown): string =>
  String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;|&#8217;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

const COUNTRY_WORDS: Record<string, string> = {
  schweiz: 'CH', switzerland: 'CH', suisse: 'CH', svizzera: 'CH', ch: 'CH',
  deutschland: 'DE', germany: 'DE', de: 'DE',
  'österreich': 'AT', austria: 'AT', at: 'AT',
  france: 'FR', frankreich: 'FR', italia: 'IT', italien: 'IT', liechtenstein: 'LI',
}

/**
 * Evidence-based, and returns null rather than guessing. Both country columns
 * accept NULL and `derive_entity_geo_address` fills them from the linked city
 * later; a WRONG country is not recoverable the same way because it drives
 * safety-gating and city linking (the AZ/Sedona -> Azerbaijan class of bug).
 * 183 of the 381 venue records carry no country at all, so this path is the
 * common one, not the exception.
 */
function resolveCountry(country?: unknown, address?: unknown, city?: unknown): string | null {
  const w = String(country ?? '').trim().toLowerCase()
  if (w && COUNTRY_WORDS[w]) return COUNTRY_WORDS[w]
  const blob = `${address ?? ''} ${city ?? ''}`
  if (/\b[1-9]\d{3}\s+[A-Za-zÀ-ÿ]/.test(blob)) return 'CH' // CH postal codes are 4 digits
  if (/\b\d{5}\s+[A-Za-zÀ-ÿ]/.test(blob)) return 'DE'
  return null
}

/**
 * Recover "<postal> <Town>" from the tail of a free-text address.
 *
 * Tribe's `city` field is optional and 59 of the 381 venue records leave it
 * empty while writing the town INTO the address ("Kasernenhof 8 4058 Basel").
 * Those rows are not location-less, just shaped differently — and `city` is
 * what run_event_city_link keys on, so a null there costs city_id and
 * everything derived from it.
 */
function cityFromAddress(address: unknown): { postal: string | null; city: string | null } {
  const m = String(address ?? '').trim().replace(/,\s*$/, '').match(/(\d{4,5})\s+([^,\d]{2,})$/)
  return m ? { postal: m[1], city: m[2].trim() } : { postal: null, city: null }
}

/**
 * Tribe returns local WALL TIME with no offset ("2025-12-27 16:00:00") plus a
 * separate IANA `timezone` field, so the offset must be resolved per instant —
 * a fixed "+02:00" is right for July and an hour wrong for December. Round-trip
 * through Intl to recover the zone's actual offset at that moment.
 */
function toIso(s: unknown, tz?: unknown): string | null {
  const raw = String(s ?? '').trim()
  if (!raw) return null
  const zone = String(tz ?? '') || 'Europe/Zurich'
  const asUtc = new Date(raw.replace(' ', 'T') + 'Z')
  if (!Number.isFinite(asUtc.getTime())) return null
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(asUtc).map((p) => [p.type, p.value]),
  )
  const back = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  )
  return new Date(asUtc.getTime() - (back - asUtc.getTime())).toISOString()
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`display-magazin ${res.status} for ${url}`)
  return await res.json()
}

/** Walk the Tribe pager. `total_pages` is authoritative; an empty page ends it. */
async function fetchAll(kind: 'events' | 'venues', query: string, cap: number): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let page = 1; out.length < cap; page++) {
    const d = await getJson(`${BASE}/${kind}?per_page=50&page=${page}${query}`)
    const items = (d[kind] as Record<string, unknown>[]) ?? []
    if (!items.length) break
    out.push(...items)
    if (page >= Number(d.total_pages ?? 1)) break
  }
  return out.slice(0, cap)
}

const eventAdapter: SourceAdapter = {
  name: 'display-magazin',
  entityType: 'event',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const daysBack = Number(config.filters?.daysBack ?? 7)
    const start = new Date(Date.now() - daysBack * 86_400_000)
    const end = new Date(Date.now() + 730 * 86_400_000)
    const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')
    const q =
      `&status=publish&start_date=${encodeURIComponent(fmt(start))}&end_date=${encodeURIComponent(fmt(end))}`
    const events = await fetchAll('events', q, config.batchSize)
    return events.map((e) => ({ sourceId: String(e.id), data: e }))
  },

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const e = raw.data
    const v = (e.venue && !Array.isArray(e.venue) ? e.venue : null) as Record<string, unknown> | null
    const fromAddr = cityFromAddress(v?.address)
    const city = v ? stripTags(v.city) || fromAddr.city : null
    const cats = (e.categories as { slug?: string }[]) ?? []
    const image = (e.image as { url?: string } | null)?.url ?? null

    const item: StagedItem = {
      entityType: 'event',
      sourceId: String(e.id),
      sourceName: 'display-magazin',
      name: stripTags(e.title),
      title: stripTags(e.title),
      description: stripTags(e.description) || stripTags(e.excerpt) || undefined,
      event_type: TYPE_MAP[cats[0]?.slug ?? ''] ?? 'other',
      start_date: toIso(e.start_date, e.timezone),
      end_date: toIso(e.end_date, e.timezone),
      dates: { start: toIso(e.start_date, e.timezone) ?? undefined, end: toIso(e.end_date, e.timezone) ?? undefined },
      venue_name: v ? stripTags(v.venue) : null,
      website: (e.website as string) || (e.url as string) || null,
      ticket_url: (e.website as string) || (e.url as string) || null,
      location: {
        address: v ? stripTags(v.address) || undefined : undefined,
        city: city ?? undefined,
        postal_code: fromAddr.postal ?? undefined,
        state: v ? stripTags(v.stateprovince ?? v.province) || undefined : undefined,
        country: (v ? resolveCountry(v.country, v.address, city) : null) ?? undefined,
        timezone: (e.timezone as string) || 'Europe/Zurich',
      },
      images: image ? [image] : [],
      tags: ['lgbtq', ...((e.tags as { slug?: string }[]) ?? []).map((t) => t.slug ?? '')].filter(Boolean).slice(0, 20),
      urls: [e.url as string].filter(Boolean),
      metadata: {
        url: e.url,
        source: 'display-magazin',
        wp_id: e.id,
        cost: e.cost || null,
        categories: cats.map((c) => c.slug),
      },
    }
    return item
  },
}

const venueAdapter: SourceAdapter = {
  name: 'display-magazin',
  entityType: 'venue',

  // Venues are collected from the already-fetched events (see the header note),
  // so this is never called by the handler.
  fetch: () => Promise.resolve([]),

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const v = raw.data
    const fromAddr = cityFromAddress(v.address)
    const city = stripTags(v.city) || fromAddr.city
    const item: StagedItem = {
      entityType: 'venue',
      sourceId: String(v.id),
      sourceName: 'display-magazin',
      name: stripTags(v.venue),
      // Neither source publishes a category and the venue NAME must not be used
      // to infer one (`Quelle schlägt Name`): commit defaults this to 'unknown'.
      category: 'unknown',
      location: {
        address: stripTags(v.address) || undefined,
        city: city ?? undefined,
        postal_code: fromAddr.postal ?? undefined,
        state: stripTags(v.stateprovince ?? v.province) || undefined,
        country: resolveCountry(v.country, v.address, city) ?? undefined,
      },
      contacts: { website: (v.website as string) || (v.url as string) || undefined },
      tags: ['lgbtq'],
      metadata: { url: v.url, source: 'display-magazin', wp_id: v.id },
    }
    return item
  },
}

/** The venue objects embedded in the fetched events, deduped by WP id. */
function venuesFromEvents(events: RawItem[]): RawItem[] {
  const seen = new Map<string, RawItem>()
  for (const e of events) {
    const v = e.data.venue
    if (!v || Array.isArray(v)) continue
    const rec = v as Record<string, unknown>
    if (!rec.id || !stripTags(rec.venue)) continue
    seen.set(String(rec.id), { sourceId: String(rec.id), data: rec })
  }
  return [...seen.values()]
}

Deno.serve(withErrorReporting('source-display-magazin', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.limit ?? body.batch_size ?? 300,
      filters: { daysBack: body.days_back },
      dryRun: body.dry_run ?? body.dryRun ?? false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }

    const rawEvents = await eventAdapter.fetch(config)
    const rawVenues = venuesFromEvents(rawEvents)

    if (config.dryRun) {
      return jsonResponse({ success: true, items: rawEvents.length, venues: rawVenues.length, dry_run: true }, 200, req)
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
