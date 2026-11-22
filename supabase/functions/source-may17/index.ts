import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { normalizeMay17Page, type May17Event, type May17Raw } from '../_shared/may17-parse.ts'

// ============================================================
// Source: may17.org — IDAHOBIT's registry of actions (17 May), from its public
// The Events Calendar REST API. See _shared/may17-parse.ts for the measured payload.
//
// WINDOW. A nightly run reads the 400 days around today (60 back, 340 ahead), so
// late registrations for the last 17 May are still picked up and the next year's
// appear as soon as they are published. `start_date` / `end_date` in the body
// override it for a backfill (the API holds 2025 and 2026; 2024 and earlier: 0).
//
// PAGINATION: `page` + `per_page=50`; the response's `total_pages` bounds the walk.
// 230 events in 2026 = 5 requests.
// ============================================================

const API = 'https://may17.org/wp-json/tribe/events/v1/events'
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)'
const PER_PAGE = 50
const HARD_PAGE_CAP = 40

type StagedItem = Omit<NormalizedItem, 'location'> &
  Record<string, unknown> & {
    location?: NonNullable<NormalizedItem['location']> & Record<string, unknown>
  }

const day = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)

function makeAdapter(range: { start: string; end: string }): SourceAdapter {
  return {
    name: 'may17',
    entityType: 'event',

    async fetch(config: AdapterConfig): Promise<RawItem[]> {
      const items: RawItem[] = []
      const seen = new Set<string>()
      for (let page = 1; page <= HARD_PAGE_CAP; page++) {
        const qs = new URLSearchParams({
          start_date: `${range.start} 00:00:00`,
          end_date: `${range.end} 23:59:59`,
          per_page: String(PER_PAGE),
          page: String(page),
          status: 'publish',
        })
        const res = await fetch(`${API}?${qs}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
        // The Events Calendar answers a page past the end with 400 rest_invalid_page.
        if (res.status === 400 && page > 1) break
        if (!res.ok) throw new Error(`may17 ${res.status} for page ${page}`)
        const body = (await res.json()) as { events?: May17Raw[]; total_pages?: number }
        for (const e of normalizeMay17Page(body.events ?? [])) {
          if (seen.has(e.id)) continue
          seen.add(e.id)
          items.push({ sourceId: e.id, data: e as unknown as Record<string, unknown> })
          if (items.length >= config.batchSize) return items
        }
        if (!body.total_pages || page >= body.total_pages) break
      }
      return items
    },

    getSourceId: (raw) => String(raw.sourceId),

    normalize(raw: RawItem): NormalizedItem {
      const e = raw.data as unknown as May17Event
      const item: StagedItem = {
        entityType: 'event',
        sourceId: e.id,
        sourceName: 'may17',
        name: e.title,
        title: e.title,
        description: e.description ?? undefined,
        event_type: e.eventType,
        start_date: e.start,
        end_date: e.end ?? undefined,
        dates: { start: e.start, end: e.end ?? undefined },
        // Deliberately unset: the API's "venue" is a country, a city or "Online".
        venue_name: undefined,
        website: e.website ?? e.url,
        ticket_url: e.url,
        location: {
          address: e.address ?? undefined,
          city: e.city ?? undefined,
          state: e.state ?? undefined,
          postal_code: e.postal ?? undefined,
          country: e.country ?? undefined,
          lat: e.lat ?? undefined,
          lng: e.lng ?? undefined,
          timezone: e.timezone ?? undefined,
        },
        images: e.image ? [e.image] : [],
        tags: ['lgbtq', 'idahobit'],
        urls: [e.url],
        metadata: {
          source: 'may17',
          url: e.url,
          may17_id: e.id,
          attendance_mode: e.online ? 'online' : 'in-person',
          all_day: e.allDay,
        },
      }
      return item
    },
  }
}

Deno.serve(withErrorReporting('source-may17', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const isDay = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    const range = {
      start: isDay(body.start_date) ? body.start_date : day(-60),
      end: isDay(body.end_date) ? body.end_date : day(340),
    }
    const adapter = makeAdapter(range)
    const config: AdapterConfig = {
      batchSize: body.limit ?? body.batch_size ?? 600,
      dryRun: body.dry_run ?? body.dryRun ?? false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }

    const raw = await adapter.fetch(config)

    if (config.dryRun) {
      return jsonResponse({
        success: true,
        items: raw.length,
        range,
        dry_run: true,
        sample: raw.slice(0, 3).map((r) => adapter.normalize(r)),
      }, 200, req)
    }

    const events = await writeToStaging(supabase, adapter, raw, { ...config, targetTable: 'events' })
    return jsonResponse({
      success: true,
      items: events,
      items_total: raw.length,
      items_processed: events,
      items_succeeded: events,
      items_failed: 0,
      range,
      events,
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
