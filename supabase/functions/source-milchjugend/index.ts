import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { normalizeVenueCategory } from '../_shared/venue-category.ts'
import {
  parseEvent, venueKey,
  type MjEvent, type MjVenue,
} from '../_shared/milchjugend-parse.ts'

// ============================================================
// Source: milchjugend.ch — the Swiss queer youth organisation's agenda
//
// WordPress + The Events Calendar PRO. `/wp-json/tribe/events/v1/events` serves
// events AND their venues as clean JSON, so there is no HTML parsing here.
// Structurally the same source as display-magazin; the parsing lives in
// _shared/milchjugend-parse.ts so the one-shot archive importer shares it.
//
// IDENTITY IS NOT `event.id`. Ids >= 10,000,000 are PROVISIONAL occurrence ids
// that TEC Pro regenerates on any recurrence-rule edit, and 21 distinct titles
// cover 150 live events here — so keying on one would re-insert the whole
// corpus on a single upstream edit. Identity is the permalink. The full
// reasoning and the measurements are in the parse module's header.
//
// WINDOW is forward-only. The API default is now..now+2y; the full corpus is
// 1,654 events back to 2024-08, and walking that nightly is the archive
// importer's job, not a cron's. `days_back` exists only to re-catch an event
// edited just after it happened.
//
// NO GEOCODING, and unusually this source needs none even for the archive:
// `venue.geo_lat`/`geo_lng` are populated on 96.3% of the whole corpus. Measured
// end to end, 0 of 499 forward events and 1 of 1,654 total reach
// pipeline-validate's 3-warning threshold, so this import does not land in the
// human queue.
//
// VENUES are real records here (115 distinct across the corpus, with their own
// WordPress post ids and coordinates), so they are staged — unlike the sources
// where only a venue_name string exists.
// ============================================================

const BASE = 'https://milchjugend.ch/wp-json/tribe/events/v1'
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)'

/**
 * `commit_event_staging_item` reads several keys `NormalizedItem` does not
 * declare (event_type, venue_name, ticket_url, and location's postal_code /
 * state / timezone / lat / lng). They are additive, not a different shape.
 *
 * `event_type` belongs at the ROOT: putting it in `metadata` — as
 * source-eventbrite does — means commit never sees it and every row lands as
 * 'other'.
 *
 * `location` needs widening of its own, because an intersection with
 * Record<string, unknown> does not loosen a NESTED object literal.
 */
type StagedItem = Omit<NormalizedItem, 'location'> &
  Record<string, unknown> & {
    location?: NonNullable<NormalizedItem['location']> & Record<string, unknown>
  }

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`milchjugend ${res.status} for ${url}`)
  return await res.json()
}

/** Walk the Tribe pager. `total_pages` is authoritative; an empty page ends it. */
async function fetchAll(query: string, cap: number): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let page = 1; out.length < cap; page++) {
    const d = await getJson(`${BASE}/events?per_page=50&page=${page}${query}`)
    const items = (d.events as Record<string, unknown>[]) ?? []
    if (!items.length) break
    out.push(...items)
    if (page >= Number(d.total_pages ?? 1)) break
  }
  return out.slice(0, cap)
}

/** `location` is shared by the event and its venue, so it is built once. */
function locationOf(v: MjVenue | null): Record<string, unknown> | undefined {
  if (!v) return undefined
  return {
    address: v.street ?? undefined,
    city: v.city ?? undefined,
    postal_code: v.postal ?? undefined,
    state: v.state ?? undefined,
    // Always sent beside `city`: commit resolves country FIRST and then scopes
    // the city lookup by it. Without it the lookup falls back to population
    // DESC, which is how 116 events landed in the wrong Portland.
    country: v.country ?? undefined,
    lat: v.lat ?? undefined,
    lng: v.lng ?? undefined,
  }
}

const eventAdapter: SourceAdapter = {
  name: 'milchjugend',
  entityType: 'event',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const daysBack = Number(config.filters?.daysBack ?? 7)
    const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')
    const q =
      `&status=publish` +
      `&start_date=${encodeURIComponent(fmt(new Date(Date.now() - daysBack * 86_400_000)))}` +
      `&end_date=${encodeURIComponent(fmt(new Date(Date.now() + 730 * 86_400_000)))}`

    const items: RawItem[] = []
    for (const row of await fetchAll(q, config.batchSize)) {
      // Rows without a title or a start date are dropped here rather than
      // staged: commit RAISEs event_missing_title / event_missing_start_date on
      // them, which costs a rejected row to learn what is already knowable.
      const parsed = parseEvent(row)
      if (parsed) items.push({ sourceId: parsed.key, data: parsed as unknown as Record<string, unknown> })
    }
    return items
  },

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const e = raw.data as unknown as MjEvent
    const v = e.venue
    const item: StagedItem = {
      entityType: 'event',
      sourceId: e.key,
      sourceName: 'milchjugend',
      name: e.title,
      title: e.title,
      description: e.description ?? undefined,
      // From the site's own category taxonomy, mapped to the vocabulary
      // trg_events_taxonomy enforces — anything unlisted is coerced to 'other'.
      event_type: e.eventType,
      start_date: e.start,
      end_date: e.end,
      dates: { start: e.start, end: e.end ?? undefined },
      venue_name: v?.name ?? null,
      website: e.website ?? e.url,
      ticket_url: e.website ?? e.url,
      location: { ...locationOf(v), timezone: e.timezone ?? 'Europe/Zurich' },
      images: e.image ? [e.image] : [],
      // Commit does not read `tags`; they are carried so the post-commit
      // backfill can read them back out of event_sources.payload.
      tags: ['lgbtq', ...e.categories, ...e.tags].filter(Boolean).slice(0, 20),
      urls: [e.url],
      metadata: {
        source: 'milchjugend',
        url: e.url,
        milchjugend_key: e.key,
        cost: e.cost,
        categories: e.categories,
        venue_source_id: v ? venueKey(v) : null,
      },
    }
    return item
  },
}

const venueAdapter: SourceAdapter = {
  name: 'milchjugend',
  entityType: 'venue',

  // Venues come from the already-parsed events; see venuesFromEvents.
  fetch: () => Promise.resolve([]),

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const v = raw.data as unknown as MjVenue
    const item: StagedItem = {
      entityType: 'venue',
      sourceId: venueKey(v),
      sourceName: 'milchjugend',
      name: v.name,
      // The agenda says these host queer youth events; it does NOT say what kind
      // of place each one is (WERKK is a cultural venue, Opferhilfe a counselling
      // service). 'other' is the honest value — the venue truth engine votes it
      // up once a second source corroborates.
      category: normalizeVenueCategory(null),
      location: locationOf(v),
      website: v.website ?? undefined,
      tags: ['lgbtq'],
      metadata: {
        source: 'milchjugend',
        milchjugend_venue_id: v.id,
        address_line: [v.name, v.street, [v.postal, v.city].filter(Boolean).join(' ')]
          .filter(Boolean).join(', '),
      },
    }
    return item
  },
}

/** One row per distinct venue across the batch, keyed by its WP post id. */
function venuesFromEvents(events: RawItem[]): RawItem[] {
  const seen = new Map<string, RawItem>()
  for (const e of events) {
    const v = (e.data as unknown as MjEvent).venue
    if (!v?.name) continue
    const key = venueKey(v)
    if (!seen.has(key)) seen.set(key, { sourceId: key, data: v as unknown as Record<string, unknown> })
  }
  return [...seen.values()]
}

Deno.serve(withErrorReporting('source-milchjugend', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      // Must exceed the whole forward window (499 live), because fetchAll always
      // restarts at the soonest event: a cap below the window size would re-read
      // the same head every night and never reach the tail. The window costs one
      // JSON request per 50 rows — no per-event page fetch — so covering all of
      // it is ~12 requests, not 500.
      batchSize: body.limit ?? body.batch_size ?? 600,
      dryRun: body.dry_run ?? body.dryRun ?? false,
      filters: { daysBack: body.days_back ?? body.daysBack },
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
