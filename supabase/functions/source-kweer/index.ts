import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { pagesFromSitemap, parseEvent, type KwEvent } from '../_shared/kweer-parse.ts'

// ============================================================
// Source: kweer.io — Zurich queer party promoter (Wix Events)
//
// EVENTS ONLY. kweer publishes no venue records — just a venue name and a
// one-line address on each event — so nothing is staged to `venues`. The
// existing event→venue linker attaches them where a real venue already exists.
//
// It looked like a browser job and is not. The listing is client-rendered with
// no payload in the HTML, but `event-pages-sitemap.xml` enumerates every event
// and each detail page is server-rendered with a clean schema.org Event
// carrying a correct offset. 1 sitemap + 25 pages per run.
//
// THE VENUE NAME IS OFTEN THE CITY. Measured across all 25 live pages: 8 give
// `location.name` as "Zürich" rather than the venue. That string must never
// reach venue matching — feeding a city into it is the documented place
// collision (15 of 65 `name_exact` matches were places, 23% error on an
// auto-applying branch). The parser nulls it; see _shared/kweer-parse.ts for
// why the real name is not recoverable from the address either.
//
// FOUR EVENTS ARE ONLINE-ONLY (2020-21 streams on Vimeo/Zoom/Twitch) with no
// address at all. They are dropped in the parser rather than staged, because
// pipeline-validate raises E_NO_LOCATION on them — banking a rejected row to
// learn what is already knowable is waste.
//
// Measured end to end 2026-08-22: 21 of 25 staged, 21 distinct slugs, and
// city / postal / country / street all 100%. Only 2 are more than a year old,
// so the worst case is W_EVENT_IN_PAST + W_NO_GEO = 2 warnings, under
// pipeline-validate's threshold of 3.
//
// WEEKLY. A 25-event corpus that gains a few rows a month does not justify a
// nightly walk of 26 requests.
// ============================================================

const SITEMAP = 'https://www.kweer.io/event-pages-sitemap.xml'
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)'

/** See source-display-magazin for why `location` is widened separately. */
type StagedItem = Omit<NormalizedItem, 'location'> &
  Record<string, unknown> & {
    location?: NonNullable<NormalizedItem['location']> & Record<string, unknown>
  }

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xml' } })
  if (!res.ok) throw new Error(`kweer ${res.status} for ${url}`)
  return await res.text()
}

const eventAdapter: SourceAdapter = {
  name: 'kweer',
  entityType: 'event',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const pages = pagesFromSitemap(await getText(SITEMAP))
    const items: RawItem[] = []
    for (const url of pages.slice(0, config.batchSize)) {
      try {
        const parsed = parseEvent(await getText(url), url)
        if (parsed) items.push({ sourceId: parsed.slug, data: parsed as unknown as Record<string, unknown> })
      } catch (e) {
        // One bad page must not lose the rest of the sitemap.
        console.warn(`source-kweer ${url}: ${(e as Error).message}`)
      }
    }
    return items
  },

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const e = raw.data as unknown as KwEvent
    const item: StagedItem = {
      entityType: 'event',
      sourceId: e.slug,
      sourceName: 'kweer',
      name: e.title,
      title: e.title,
      description: e.description ?? undefined,
      // Every one of these is a club night; the site publishes no taxonomy, and
      // 'party' is what the promoter's own listing page calls them.
      event_type: 'party',
      start_date: e.start,
      end_date: e.end,
      dates: { start: e.start, end: e.end ?? undefined },
      // NULL where the source named the city — never the string "Zürich".
      venue_name: e.venueName,
      website: e.url,
      ticket_url: e.url,
      location: {
        address: e.street ?? undefined,
        city: e.city ?? undefined,
        postal_code: e.postal ?? undefined,
        // Always sent beside `city`: commit resolves country first and scopes
        // the city lookup by it.
        country: e.country ?? undefined,
        timezone: 'Europe/Zurich',
      },
      images: e.image ? [e.image] : [],
      tags: ['lgbtq', 'party'],
      urls: [e.url],
      metadata: { source: 'kweer', url: e.url, kweer_slug: e.slug },
    }
    return item
  },
}

Deno.serve(withErrorReporting('source-kweer', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      // The whole sitemap is 25 pages; a smaller cap would re-read the same head.
      batchSize: body.limit ?? body.batch_size ?? 60,
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
