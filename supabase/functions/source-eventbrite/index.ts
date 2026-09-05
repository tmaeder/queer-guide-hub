import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging, MissingCredentialsError, skippedResponse } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { prefilterEvents, eventbritePrefilterFields } from '../_shared/event-prefilter.ts'

// ============================================================
// Source: Eventbrite Events API
// Replaces: import-eventbrite-events
// ============================================================

const EB_BASE = 'https://www.eventbriteapi.com/v3/events/search/'
const LGBTQ_QUERIES = ['lgbtq', 'gay pride', 'queer', 'drag show', 'pride festival']

// ── RETIRED 2026-08-30 ───────────────────────────────────────────────────────
// EB_BASE does not exist. Probed with no credential and with a bogus bearer —
// both return, byte-identically:
//   HTTP 404 {"status_code":404,"error":"NOT_FOUND",
//             "error_description":"The path you requested does not exist."}
// The 404 precedes auth, so no key can fix it: Eventbrite removed public event
// search from the v3 API and the remaining surface only serves events the token
// owns. There is no successor endpoint. `api_circuit_breakers.eventbrite` has
// success_count = 0 / last_success_at NULL since 2026-03-30 — never once green.
//
// This flag makes the function a cheap no-op skip for BOTH callers: the cron
// (retired in 20261107100000) and the `events-ingestion-bulletproof` DAG node,
// which is left in place rather than surgically cut out of a live pipeline's
// topology. `pipeline-executor` records a skip as *skipped*, not *failed*.
//
// To revive: set RETIRED=false and repoint EB_BASE at a real endpoint. Do not
// flip it without changing the URL — you will only restart the 404 loop.
const RETIRED = true
const RETIRED_REASON = 'endpoint_retired_404_no_successor'

const eventbriteAdapter: SourceAdapter = {
  name: 'eventbrite',
  entityType: 'event',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    // Retired: return before the breaker is ever consulted, so a scheduled or
    // DAG invocation costs one no-op instead of another recorded failure.
    if (RETIRED) return []

    const token = config.apiKey || Deno.env.get('EVENTBRITE_OAUTH_TOKEN')
    if (!token) throw new MissingCredentialsError('EVENTBRITE_OAUTH_TOKEN')

    const supabase = getServiceClient()
    const cities = (config.filters?.cities as string[]) || ['New York', 'San Francisco', 'Los Angeles', 'London', 'Berlin']
    const keywords = (config.filters?.keywords as string[]) || LGBTQ_QUERIES
    const limit = config.batchSize || 50
    const allItems: RawItem[] = []

    for (const city of cities) {
      for (const query of keywords) {
        try {
          const items = await withCircuitBreaker(supabase, 'eventbrite', async () => {
            const params = new URLSearchParams({
              q: query,
              'location.address': city,
              'expand': 'venue',
            })
            const res = await fetch(`${EB_BASE}?${params}`, {
              headers: { 'Authorization': `Bearer ${token}` },
            })
            if (!res.ok) throw new Error(`Eventbrite API ${res.status}`)
            const json = await res.json()
            return json.events || []
          })

          for (const event of items.slice(0, limit)) {
            allItems.push({
              sourceId: event.id || `eb-${Date.now()}`,
              data: { ...event, _search_city: city },
            })
          }
          await new Promise(r => setTimeout(r, 300))
        } catch (e) {
          console.error(`Eventbrite error for "${query}" in ${city}:`, (e as Error).message)
        }
      }
    }

    const seen = new Set<string>()
    return allItems.filter(item => { if (seen.has(item.sourceId)) return false; seen.add(item.sourceId); return true })
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data
    const venue = (d.venue as Record<string, unknown>) || {}
    const addr = (venue.address as Record<string, unknown>) || {}
    return {
      entityType: 'event',
      sourceId: raw.sourceId,
      sourceName: 'eventbrite',
      name: (d.name as Record<string, string>)?.text || String(d.name || ''),
      description: (d.description as Record<string, string>)?.text || String(d.description || ''),
      location: {
        lat: Number(addr.latitude) || undefined,
        lng: Number(addr.longitude) || undefined,
        address: String(addr.localized_address_display || ''),
        city: String(addr.city || d._search_city || ''),
        country: String(addr.country || ''),
      },
      dates: {
        start: (d.start as Record<string, string>)?.utc || null,
        end: (d.end as Record<string, string>)?.utc || null,
      },
      urls: d.url ? [String(d.url)] : [],
      images: (d.logo as Record<string, Record<string, string>>)?.original?.url ? [String((d.logo as Record<string, Record<string, string>>).original.url)] : [],
      tags: ['lgbtq', 'event'],
      // Top level is where commit_event_staging_item reads it; the metadata copy is
      // kept for existing readers. See NormalizedItem.venue_name.
      venue_name: venue.name ? String(venue.name) : undefined,
      metadata: { eventbrite_id: raw.sourceId, venue_name: venue.name, event_type: mapEventType(d.category_id as string) },
    }
  },

  getSourceId(raw: RawItem): string { return raw.sourceId },
}

function mapEventType(categoryId: string | undefined): string {
  // Values must be legal events.event_type (events_event_type_check); 'event' was not.
  const map: Record<string, string> = { '103': 'concert', '110': 'party', '105': 'art', '101': 'conference', '104': 'theater' }
  return map[categoryId || ''] || 'other'
}

Deno.serve(withErrorReporting('source-eventbrite', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    if (RETIRED) {
      return jsonResponse(skippedResponse(RETIRED_REASON, ['EVENTBRITE_OAUTH_TOKEN']), 200, req)
    }
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.limit || body.batch_size || 50,
      filters: { cities: body.cities, keywords: body.keywords },
      apiKey: Deno.env.get('EVENTBRITE_OAUTH_TOKEN'),
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }
    const rawItems = await eventbriteAdapter.fetch(config)
    // LGBTQ+ prefilter — default OFF here (unlike source-ticketmaster): the
    // Eventbrite queries are already LGBTQ_QUERIES-targeted and its result set
    // is small. Opt in via body.prefilter: true when a broad query needs it.
    const prefilterOn = body.prefilter === true
    const keywordOverride = Array.isArray(body.prefilter_keywords) ? (body.prefilter_keywords as string[]) : undefined
    const { kept, fetched, dropped } = prefilterOn
      ? prefilterEvents(rawItems, { keywords: keywordOverride, fields: eventbritePrefilterFields })
      : { kept: rawItems, fetched: rawItems.length, dropped: 0 }
    const prefilter = { enabled: prefilterOn, fetched, kept: kept.length, dropped }
    if (prefilterOn) console.log(`source-eventbrite prefilter: fetched=${fetched} kept=${kept.length} dropped=${dropped}`)
    if (config.dryRun) return jsonResponse({ success: true, items: kept.length, prefilter, dry_run: true }, 200, req)
    const written = await writeToStaging(supabase, eventbriteAdapter, kept, { ...config, targetTable: 'events' })
    return jsonResponse({ success: true, items: written, items_total: fetched, items_processed: written, items_succeeded: written, items_failed: 0, prefilter }, 200, req)
  } catch (error) {
    if (error instanceof MissingCredentialsError) {
      return jsonResponse(skippedResponse('missing_credentials', error.missing), 200, req)
    }
    return errorResponse((error as Error).message, 500, req)
  }
}))
