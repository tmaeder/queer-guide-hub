import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { normalizeVenueCategory } from '../_shared/venue-category.ts'
import {
  extractTiles, parseEventPage, timezoneForCountry, venueKey,
  type ParsedEvent, type ParsedVenue, type TileRef,
} from './parse.ts'

// ============================================================
// Source: eventfrog.ch — the LGBTIQ party listing
//
// https://eventfrog.ch/de/events/ch/lgbtiq-partys.html?c=ALL
//
// Every detail page carries a proper `application/ld+json` schema.org Event
// with name, start/end, a full PostalAddress, description, image, offers and
// organizer — so this parses JSON-LD, not CSS classes. 39/39 live pages parsed
// on the first pass.
//
// THE LISTING IS ONE PAGE. `?c=ALL` renders the WHOLE forward window server-
// side (measured 2026-08-22: 39 events, 2026-08-22 → 2027-01-08). The
// `load-more` in the markup is generic chrome — `&p=2`, `&page=2` and
// `&anchor=40` all return the identical 39 tiles, so there is no pagination to
// follow and no hidden tail to miss.
//
// COUNTRY NEEDS TWO SIGNALS. Despite the `/ch/` in the path, `c=ALL` mixes in
// DE and AT events. `addressCountry` is free multilingual text ("Switzerland",
// "Schweiz", "Deutschland") and one live row carries "Bayern" — a German STATE,
// not a country. So the listing tile's own "(DE)" suffix is read as a second,
// independent signal; they must agree or the country is left NULL (see
// resolveCountry). The postal-code heuristic used on gay.ch is NOT available
// here: CH and AT both use 4 digits, so it would mislabel every Vienna event.
//
// SCOPE is the forward window. There is no archive to walk — eventfrog drops
// past events from the listing entirely.
//
// IDENTITY: the numeric id at the end of the detail URL
// (…-7457503865702731783.html), which is stable across title edits. Venues have
// no id anywhere on the site, so they key on slug(name)|slug(city) — that
// namespace cannot collide with an event id, which is digits only.
//
// No geocoding here: the venue drain geocodes, same as source-gay-ch.
// ============================================================

const BASE = 'https://eventfrog.ch'
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)'
const DEFAULT_LISTINGS = ['/de/events/ch/lgbtiq-partys.html?c=ALL']

/** See source-display-magazin for why `location` is widened separately. */
type StagedItem = Omit<NormalizedItem, 'location'> &
  Record<string, unknown> & {
    location?: NonNullable<NormalizedItem['location']> & Record<string, unknown>
  }

async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } })
  if (!res.ok) throw new Error(`eventfrog ${res.status} for ${url}`)
  return await res.text()
}

const eventAdapter: SourceAdapter = {
  name: 'eventfrog',
  entityType: 'event',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const listings = (config.filters?.listings as string[] | undefined)?.length
      ? (config.filters!.listings as string[])
      : DEFAULT_LISTINGS

    const tiles = new Map<string, TileRef>()
    for (const listing of listings) {
      const url = listing.startsWith('http') ? listing : `${BASE}${listing}`
      for (const t of extractTiles(await getHtml(url))) {
        if (!tiles.has(t.path)) tiles.set(t.path, t)
      }
    }

    const items: RawItem[] = []
    for (const tile of [...tiles.values()].slice(0, config.batchSize)) {
      try {
        const parsed = parseEventPage(await getHtml(`${BASE}${tile.path}`), tile.path, tile)
        if (parsed) items.push({ sourceId: parsed.id, data: parsed as unknown as Record<string, unknown> })
      } catch (e) {
        // One bad page must not lose the rest of the listing.
        console.warn(`source-eventfrog ${tile.path}: ${(e as Error).message}`)
      }
    }
    return items
  },

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const e = raw.data as unknown as ParsedEvent
    const v = e.venue
    const item: StagedItem = {
      entityType: 'event',
      sourceId: e.id,
      sourceName: 'eventfrog',
      name: e.title,
      title: e.title,
      description: e.description ?? undefined,
      // From the site's own URL taxonomy (/de/p/partys/…), not inferred from
      // the title.
      event_type: e.eventType ?? undefined,
      start_date: e.start,
      end_date: e.end,
      dates: { start: e.start, end: e.end ?? undefined },
      venue_name: v?.name ?? null,
      ticket_url: e.url,
      location: {
        address: v?.street ?? undefined,
        city: v?.city ?? undefined,
        postal_code: v?.postal ?? undefined,
        country: v?.country ?? undefined,
        timezone: timezoneForCountry(v?.country ?? null) ?? undefined,
      },
      images: e.image ? [e.image] : [],
      tags: ['lgbtq', ...(e.eventType ? [e.eventType] : [])],
      urls: [e.url],
      metadata: {
        source: 'eventfrog',
        url: e.url,
        eventfrog_id: e.id,
        organizer: e.organizer,
        event_status: e.status,
        keywords: e.keywords,
        price_min: e.price.min,
        price_currency: e.price.currency,
        sold_out: e.price.soldOut,
        country_signals: e.countrySignals,
      },
    }
    return item
  },
}

const venueAdapter: SourceAdapter = {
  name: 'eventfrog',
  entityType: 'venue',

  // Venues come from the already-parsed events; see venuesFromEvents.
  fetch: () => Promise.resolve([]),

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const v = raw.data as unknown as ParsedVenue
    const item: StagedItem = {
      entityType: 'venue',
      sourceId: venueKey(v),
      sourceName: 'eventfrog',
      name: v.name,
      // The listing says these host queer parties; it does NOT say what kind of
      // place each one is (Südpol is a concert hall, Barfussbar a lido). 'other'
      // is the honest value — the venue truth engine can vote it up later.
      category: normalizeVenueCategory(null),
      location: {
        address: v.street ?? undefined,
        city: v.city ?? undefined,
        postal_code: v.postal ?? undefined,
        country: v.country ?? undefined,
      },
      tags: ['lgbtq'],
      metadata: {
        source: 'eventfrog',
        address_line: [v.name, v.street, [v.postal, v.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      },
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

Deno.serve(withErrorReporting('source-eventfrog', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.limit ?? body.batch_size ?? 120,
      dryRun: body.dry_run ?? body.dryRun ?? false,
      filters: { listings: body.listings },
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
