import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { extractJsonLdEvents, type JsonLdEvent } from '../_shared/jsonld-event.ts'
import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'

// ============================================================
// Source: observance event seeds — organiser pages for an annual observance.
//
// Measured 2026-11-22, nine days before World AIDS Day: 1,329 live events in
// its window and FIVE that named the day, all Swiss. Every past World AIDS Day
// event in the corpus came from the 2010-16 Wayback gaycities import. The
// linker was not the gap; no source listed these events. They are not on any
// one feed either — they sit on organiser pages (Eventbrite, Meetup,
// Humanitix, Squarespace sites, city calendars), one page per event.
//
// So the work list is `observance_event_seeds`: hand-curated URLs, each a real
// organiser page. This function reads each page's own schema.org Event JSON-LD
// (jsonld-event.ts) and stages what it says. A page without one is recorded
// (`last_status`) and stages nothing — nothing is inferred from prose.
//
// Only seeds whose observance occurs within the horizon are fetched
// (observance_event_seed_worklist), so the list can keep last year's URLs
// without re-reading them all year. Staged rows go through the standard
// normalize -> validate -> dedup -> commit engine; linking to the observance
// is the nightly observance_link job's decision, not this function's.
// ============================================================

const SOURCE = 'observance-seed'
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)'
const PER_PAGE_CAP = 10
const CONCURRENCY = 4

interface Seed { url: string; observance_slug: string }
interface Fetched { seed: Seed; status: string; events: JsonLdEvent[] }

type StagedItem = Omit<NormalizedItem, 'location'> &
  Record<string, unknown> & { location?: NonNullable<NormalizedItem['location']> & Record<string, unknown> }

const adapter: SourceAdapter = {
  name: SOURCE,
  entityType: 'event',
  fetch: () => Promise.resolve([]),
  getSourceId: (raw) => String(raw.sourceId),
  normalize(raw: RawItem): NormalizedItem {
    const { event: e, seed } = raw.data as unknown as { event: JsonLdEvent; seed: Seed }
    const item: StagedItem = {
      entityType: 'event',
      sourceId: String(raw.sourceId),
      sourceName: SOURCE,
      name: e.title,
      title: e.title,
      description: e.description ?? undefined,
      event_type: 'other',
      start_date: e.start,
      end_date: e.end,
      dates: { start: e.start, end: e.end ?? undefined },
      venue_name: e.venueName ?? undefined,
      website: e.url,
      ticket_url: e.url,
      location: {
        address: e.street ?? undefined,
        city: e.city ?? undefined,
        state: e.region ?? undefined,
        postal_code: e.postal ?? undefined,
        country: e.country ?? undefined,
        lat: e.lat ?? undefined,
        lng: e.lng ?? undefined,
      },
      images: e.image ? [e.image] : [],
      tags: ['lgbtq'],
      urls: [e.url],
      metadata: { source: SOURCE, url: e.url, seed_url: seed.url, observance: seed.observance_slug, online: e.online },
    }
    return item
  },
}

async function fetchSeed(seed: Seed, notBefore: Date): Promise<Fetched> {
  try {
    assertPublicHttpUrl(seed.url)
    const res = await fetch(seed.url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return { seed, status: `http_${res.status}`, events: [] }
    const events = extractJsonLdEvents(await res.text(), seed.url, notBefore).slice(0, PER_PAGE_CAP)
    return { seed, status: events.length ? 'ok' : 'no_jsonld_event', events }
  } catch (e) {
    return { seed, status: `error: ${(e as Error).message.slice(0, 120)}`, events: [] }
  }
}

Deno.serve(withErrorReporting('source-observance-events', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  const _auth = await requireInternalOrAdmin(req, supabase); if (_auth instanceof Response) return _auth
  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body.dry_run === true
    // `urls` probes arbitrary pages without staging them — for vetting a seed before adding it.
    let seeds: Seed[]
    if (dryRun && Array.isArray(body.urls)) {
      seeds = (body.urls as unknown[]).filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u))
        .map((url) => ({ url, observance_slug: 'probe' }))
    } else {
      const { data, error } = await supabase.rpc('observance_event_seed_worklist', { p_horizon_days: body.horizon_days ?? 60 })
      if (error) throw new Error(`worklist: ${error.message}`)
      seeds = (data ?? []) as Seed[]
    }

    const notBefore = new Date(Date.now() - 86_400_000)
    const results: Fetched[] = []
    for (let i = 0; i < seeds.length; i += CONCURRENCY) {
      results.push(...await Promise.all(seeds.slice(i, i + CONCURRENCY).map((s) => fetchSeed(s, notBefore))))
    }

    const raw: RawItem[] = results.flatMap((r) =>
      r.events.map((event) => ({ sourceId: `${event.url}|${event.start}`, data: { event, seed: r.seed } as unknown as Record<string, unknown> })))
    const byStatus: Record<string, number> = {}
    for (const r of results) { const k = r.status.split(':')[0]; byStatus[k] = (byStatus[k] ?? 0) + 1 }

    if (dryRun) {
      return jsonResponse({
        success: true, dry_run: true, seeds: seeds.length, events: raw.length, by_status: byStatus,
        pages: results.map((r) => ({ url: r.seed.url, status: r.status, events: r.events.map((e) => [e.title, e.start, e.city, e.country]) })),
      }, 200, req)
    }

    const now = new Date().toISOString()
    for (const r of results) {
      await supabase.from('observance_event_seeds')
        .update({ last_fetched_at: now, last_status: r.status, last_events: r.events.length })
        .eq('url', r.seed.url)
    }
    const written = await writeToStaging(supabase, adapter, raw, { batchSize: raw.length, dryRun: false, targetTable: 'events' })
    return jsonResponse({
      success: true, seeds: seeds.length, by_status: byStatus,
      items: written, items_total: raw.length, items_processed: written, items_succeeded: written, items_failed: 0,
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
