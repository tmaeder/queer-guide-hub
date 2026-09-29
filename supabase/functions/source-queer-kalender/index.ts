import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { parseQueerKalender, type QkEvent } from '../_shared/queer-kalender-parse.ts'

// ============================================================
// Source: queer-kalender.nl — Amsterdam queer calendar.
//
// ONE REQUEST PER RUN. The whole upcoming calendar (154 events, Sep-Dec 2026
// measured 2026-09-28) is server-rendered on /en/. See
// _shared/queer-kalender-parse.ts for why the Zotonic API is NOT used.
//
// COURTESY MATTERS HERE MORE THAN ROBOTS DOES. robots.txt allows everything
// outside /admin, and there is no terms page — but /en/about says this is a
// non-commercial, volunteer-run, one-developer project whose events are
// "manually added" by hand. One request a day is the entire footprint of this
// importer, and it should stay that way.
//
// EVENTS ONLY. Venue records are not staged: the page gives a venue NAME and
// a street for most events and nothing else — no country, no coordinates, no
// opening hours — which is not enough to mint a venue. The existing
// event->venue linker attaches them where a real venue already exists.
// ============================================================

const PAGE = 'https://queer-kalender.nl/en/'
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)'

/** See source-eventfrog for why `location` is widened separately. */
type StagedItem = Omit<NormalizedItem, 'location'> &
  Record<string, unknown> & {
    location?: NonNullable<NormalizedItem['location']> & Record<string, unknown>
  }

async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } })
  if (!res.ok) throw new Error(`queer-kalender ${res.status} for ${url}`)
  return await res.text()
}

const eventAdapter: SourceAdapter = {
  name: 'queer-kalender',
  entityType: 'event',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const events = parseQueerKalender(await getHtml(PAGE))
    return events
      .slice(0, config.batchSize)
      .map((e) => ({ sourceId: e.id, data: e as unknown as Record<string, unknown> }))
  },

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const e = raw.data as unknown as QkEvent
    const item: StagedItem = {
      entityType: 'event',
      sourceId: e.id,
      sourceName: 'queer-kalender',
      name: e.title,
      title: e.title,
      description: e.description ?? undefined,
      event_type: e.eventType,
      start_date: e.start,
      end_date: e.end ?? undefined,
      dates: { start: e.start, end: e.end ?? undefined },
      // Null where the source gave a street or a "T.B.A." placeholder rather
      // than a real venue name — see parseLocation.
      venue_name: e.venueName ?? undefined,
      website: e.url,
      ticket_url: e.url,
      location: {
        address: e.street ?? undefined,
        city: e.city ?? undefined,
        // The calendar is Amsterdam-only and the page carries no country
        // field; NL is the city's own country, sent beside it because commit
        // resolves country first and scopes the city lookup by it.
        country: e.city ? 'NL' : undefined,
        timezone: 'Europe/Amsterdam',
      },
      images: [],
      tags: ['lgbtq'],
      urls: [e.url],
      metadata: { source: 'queer-kalender', url: e.url, zotonic_id: e.id },
    }
    return item
  },
}

Deno.serve(withErrorReporting('source-queer-kalender', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      // The page carries the whole upcoming window; 400 is headroom, not a cap
      // anyone is expected to hit.
      batchSize: body.limit ?? body.batch_size ?? 400,
      dryRun: body.dry_run ?? body.dryRun ?? false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }

    const rawEvents = await eventAdapter.fetch(config)

    if (config.dryRun) {
      return jsonResponse({
        success: true,
        items: rawEvents.length,
        dry_run: true,
        sample: rawEvents.slice(0, 3).map((r) => eventAdapter.normalize(r)),
      }, 200, req)
    }

    const events = await writeToStaging(supabase, eventAdapter, rawEvents, { ...config, targetTable: 'events' })

    return jsonResponse({
      success: true,
      items: events,
      items_total: rawEvents.length,
      items_processed: events,
      items_succeeded: events,
      items_failed: 0,
      events,
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
