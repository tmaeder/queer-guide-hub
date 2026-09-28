import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { normalizeQcalPage, type QcalEvent, type QcalRaw } from '../_shared/qcal-parse.ts'

// ============================================================
// Source: qcal.app — community queer event calendar (global, US-heavy).
//
// EVENTS ONLY. qcal publishes no venue records: a listing carries a postal
// address and an organiser ("host"), and neither is a venue. Staging a host
// name as a venue is how the event->venue linker acquires place collisions,
// so nothing is written to `venues` and `venue_name` stays null.
//
// It looked like a browser job and is not. The listing at /events is a
// client-rendered Next.js page with no payload in the HTML, but the same data
// is served by a public, key-less JSON endpoint the page itself calls:
// GET /api/events/search -> { items, total, page, pageSize }.
//
// PAGINATION IS `page` AND NOTHING ELSE. Measured 2026-09-28: pageSize caps
// server-side at 50, `?limit=` and `?perPage=` are ignored and silently fall
// back to 30. A run that paginated on the wrong param would re-read page 1
// forever while reporting a healthy item count.
//
// Corpus 261 rows = 51 DISTINCT EVENTS (2026-09-28), so one nightly pass at
// 50/page is 6 requests. DAILY rather than weekly: these are community
// listings with short lead times, unlike the annual circuit this platform's
// other event sources carry.
//
// RECURRING EVENTS STAGE ONCE, AND THAT IS WHY THE YIELD IS 51 AND NOT 261.
// The API returns one row per INSTANCE — a weekly bingo night is 54 rows
// sharing one slug — so a run that staged every row would publish 54
// near-identical events. The feed is ascending by `nextStart`, verified
// across all 16 multi-instance slugs with 0 exceptions, so keeping the first
// occurrence keeps the next UPCOMING instance. A future reader comparing
// `items` against the API's `total` should expect them to differ by design.
// ============================================================

const API = 'https://qcal.app/api/events/search'
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)'
const PAGE_SIZE = 50
const HARD_PAGE_CAP = 40

/** See source-eventfrog for why `location` is widened separately. */
type StagedItem = Omit<NormalizedItem, 'location'> &
  Record<string, unknown> & {
    location?: NonNullable<NormalizedItem['location']> & Record<string, unknown>
  }

async function getJson(url: string): Promise<{ items?: QcalRaw[]; total?: number }> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`qcal ${res.status} for ${url}`)
  return await res.json()
}

const eventAdapter: SourceAdapter = {
  name: 'qcal',
  entityType: 'event',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const items: RawItem[] = []
    const seen = new Set<string>()

    for (let page = 1; page <= HARD_PAGE_CAP; page++) {
      const body = await getJson(`${API}?page=${page}&pageSize=${PAGE_SIZE}`)
      const batch = body.items ?? []
      if (batch.length === 0) break

      for (const e of normalizeQcalPage(batch)) {
        if (seen.has(e.slug)) continue
        seen.add(e.slug)
        items.push({ sourceId: e.slug, data: e as unknown as Record<string, unknown> })
        if (items.length >= config.batchSize) return items
      }

      // A short page is the last page. Checked on the RAW batch, not on the
      // normalized output: normalize drops undated and unpublished rows, so a
      // page that legitimately yields few events is not the end of the list.
      if (batch.length < PAGE_SIZE) break
    }
    return items
  },

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const e = raw.data as unknown as QcalEvent
    const item: StagedItem = {
      entityType: 'event',
      sourceId: e.slug,
      sourceName: 'qcal',
      name: e.title,
      title: e.title,
      description: e.description ?? undefined,
      event_type: e.eventType,
      start_date: e.start,
      end_date: e.end ?? undefined,
      dates: { start: e.start, end: e.end ?? undefined },
      // Deliberately null — see the header. qcal names an organiser, never a venue.
      venue_name: undefined,
      website: e.url,
      ticket_url: e.url,
      location: {
        address: e.address ?? undefined,
        city: e.city ?? undefined,
        state: e.state ?? undefined,
        postal_code: e.postal ?? undefined,
        // Always sent beside `city`: commit resolves country first and scopes
        // the city lookup by it.
        country: e.country ?? undefined,
        lat: e.lat ?? undefined,
        lng: e.lng ?? undefined,
        timezone: e.timezone ?? undefined,
      },
      images: e.image ? [e.image] : [],
      tags: ['lgbtq'],
      urls: [e.url],
      metadata: {
        source: 'qcal',
        url: e.url,
        qcal_slug: e.slug,
        attendance_mode: e.online ? 'online' : 'in-person',
        host: e.host,
      },
    }
    return item
  },
}

Deno.serve(withErrorReporting('source-qcal', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      // 261 events today; 400 leaves headroom without unbounding the walk.
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
