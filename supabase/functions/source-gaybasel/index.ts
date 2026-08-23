import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { normalizeVenueCategory } from '../_shared/venue-category.ts'
import {
  parseEvent, parseLocation, urlsFromSitemap,
  type GbEvent, type GbVenue,
} from '../_shared/gaybasel-parse.ts'

// ============================================================
// Source: gaybasel.org — Basel's queer culture platform
//
// THIS IS PRIMARILY A VENUE SOURCE. `sitemap.xml` holds 1,113 URLs, of which
// 544 are `/locations/<id>/<slug>` and only SEVEN are `/events/<id>/<slug>`.
// The events are worth having (they are the live Basel agenda and carry clean
// schema.org with real offsets), but the 544 venue records — each with the
// site's own numeric id, an address and, on ~60%, coordinates — are why this
// source earns a cron.
//
// Venues are therefore fetched as a FIRST-CLASS batch from the sitemap, not
// derived from the events the way source-eventfrog and source-milchjugend do
// it: deriving would yield the 5 venues those 7 events happen to name and
// discard the other 539.
//
// EVERY UNKNOWN PATH RETURNS HTTP 200. The soft-404 shell is byte-identical
// across `/events/list`, `/api/events` and any dead id, and the sitemap does
// contain ids that no longer resolve — so `res.ok` is worthless and the parser
// gates on a detail-view marker instead. Without that, this function would
// report success while writing nothing.
//
// TRI-BORDER. GayBasel lists CH, DE and FR venues (measured: 3 of 46 sampled
// are in Freiburg im Breisgau). Coordinates are validated against the
// tri-border box, never against Switzerland alone.
//
// IDENTITY is the site's numeric id, taken from the URL. Events and venues
// share one `source_name` namespace, so they are prefixed apart.
//
// PAGINATION BUDGET. 544 location pages at ~12 KB is the whole cost, and they
// change rarely — hence weekly, and hence `batch_size` defaulting to the full
// set so a run is complete rather than perpetually re-reading the head.
// ============================================================

const SITEMAP = 'https://www.gaybasel.org/sitemap.xml'
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)'

/** See source-display-magazin for why `location` is widened separately. */
type StagedItem = Omit<NormalizedItem, 'location'> &
  Record<string, unknown> & {
    location?: NonNullable<NormalizedItem['location']> & Record<string, unknown>
  }

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xml' } })
  if (!res.ok) throw new Error(`gaybasel ${res.status} for ${url}`)
  return await res.text()
}

const eventAdapter: SourceAdapter = {
  name: 'gaybasel',
  entityType: 'event',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const { events } = urlsFromSitemap(await getText(SITEMAP))
    const items: RawItem[] = []
    for (const url of events.slice(0, config.batchSize)) {
      try {
        const parsed = parseEvent(await getText(url), url)
        // null means the soft-404 shell, or a row commit would RAISE on.
        if (parsed) items.push({ sourceId: `event-${parsed.id}`, data: parsed as unknown as Record<string, unknown> })
      } catch (e) {
        console.warn(`source-gaybasel event ${url}: ${(e as Error).message}`)
      }
    }
    return items
  },

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const e = raw.data as unknown as GbEvent
    const item: StagedItem = {
      entityType: 'event',
      sourceId: `event-${e.id}`,
      sourceName: 'gaybasel',
      name: e.title,
      title: e.title,
      description: e.description ?? undefined,
      // The site publishes no category taxonomy; 'other' is the honest value
      // rather than a guess inferred from the title.
      event_type: 'other',
      start_date: e.start,
      end_date: e.end,
      dates: { start: e.start, end: e.end ?? undefined },
      venue_name: e.venueName,
      website: e.url,
      ticket_url: e.url,
      location: {
        address: e.street ?? undefined,
        city: e.city ?? undefined,
        postal_code: e.postal ?? undefined,
        // Always sent beside `city`: commit resolves country first and scopes
        // the city lookup by it, so omitting it invites a same-name collision.
        country: e.country ?? undefined,
        timezone: 'Europe/Zurich',
      },
      images: e.image ? [e.image] : [],
      tags: ['lgbtq'],
      urls: [e.url],
      metadata: { source: 'gaybasel', url: e.url, gaybasel_event_id: e.id },
    }
    return item
  },
}

const venueAdapter: SourceAdapter = {
  name: 'gaybasel',
  entityType: 'venue',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const { locations } = urlsFromSitemap(await getText(SITEMAP))
    const items: RawItem[] = []
    for (const url of locations.slice(0, config.batchSize)) {
      try {
        const parsed = parseLocation(await getText(url), url)
        // null means the shell, or the "(tba)" placeholder, which is not a place.
        if (parsed) items.push({ sourceId: `venue-${parsed.id}`, data: parsed as unknown as Record<string, unknown> })
      } catch (e) {
        console.warn(`source-gaybasel location ${url}: ${(e as Error).message}`)
      }
    }
    return items
  },

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const v = raw.data as unknown as GbVenue
    const item: StagedItem = {
      entityType: 'venue',
      sourceId: `venue-${v.id}`,
      sourceName: 'gaybasel',
      name: v.name,
      // A directory of places that host queer culture does not say what KIND of
      // place each is (69H is a bar, Kaserne a theatre). The venue truth engine
      // votes it up once a second source corroborates.
      category: normalizeVenueCategory(null),
      location: {
        address: v.street ?? undefined,
        city: v.city ?? undefined,
        postal_code: v.postal ?? undefined,
        // Deliberately NO country: these sit on the CH/DE/FR corner and a
        // coordinate kilometres from a border cannot settle it. NULL is filled
        // from the linked city later; a wrong value drives safety-gating.
        lat: v.lat ?? undefined,
        lng: v.lng ?? undefined,
      },
      tags: ['lgbtq'],
      metadata: {
        source: 'gaybasel',
        url: v.url,
        gaybasel_location_id: v.id,
        address_line: [v.name, v.street, [v.postal, v.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      },
    }
    return item
  },
}

Deno.serve(withErrorReporting('source-gaybasel', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      // Defaults to the whole sitemap: 544 locations is the entire cost, and a
      // smaller cap would re-read the same head every week forever.
      batchSize: body.limit ?? body.batch_size ?? 600,
      dryRun: body.dry_run ?? body.dryRun ?? false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }

    const rawEvents = await eventAdapter.fetch(config)
    const rawVenues = await venueAdapter.fetch(config)

    if (config.dryRun) {
      return jsonResponse({
        success: true,
        items: rawEvents.length,
        venues: rawVenues.length,
        dry_run: true,
        sample: rawEvents.slice(0, 2).map((r) => eventAdapter.normalize(r)),
        venue_sample: rawVenues.slice(0, 2).map((r) => venueAdapter.normalize(r)),
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
