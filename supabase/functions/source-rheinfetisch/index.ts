import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { parseIcs, type IcsEvent } from '../_shared/ics-parse.ts'
import { fetchFeed, normalizeIcsEvent, type StagedItem } from '../_shared/rheinfetisch-normalize.ts'

// ============================================================
// Source: rheinfetisch.de — Rheinfetisch e.V., Cologne's fetish/leather club
//
// The calendar page at /kalender is a Duda widget over a PUBLIC GOOGLE
// CALENDAR, and this reads the calendar rather than the page. The widget's
// `data-public-calendar-id` is the base64 of the calendar address, so the feed
// is the site's own declared source, not a back door: scraping the rendered
// month would yield one month of titles with no descriptions, no addresses and
// no recurrence, and would need a click per event to get the rest.
//
// WHAT THIS FILLS. Measured before writing a line: the platform carried ZERO
// Rheinfetisch events. The club's own programme — the monthly Socials, the
// quarterly COLOURcode parties, the dinners, the bowling nights, Mr. Fetish
// NRW, the Cologne Pride Boat — was absent in its entirety, while the big
// umbrella weekends it also lists (Folsom Europe at 142 rows, Darklands,
// Maspalomas) were already covered several times over by patroc and gaycities.
// So most of the value here is the local programme nothing else carries, and
// the overlap on the umbrella events is left to `pipeline-deduplicate` rather
// than filtered out by hand — the Rheinfetisch entry frequently carries a
// better German description and an exact street address than the row we hold.
//
// RECURRENCE IS THE WHOLE DIFFICULTY and it lives in `_shared/ics-parse.ts`:
// a `FREQ=DAILY` rule in this feed is always a multi-day festival rather than a
// repeat, so it collapses to one spanning row instead of exploding into ~130
// single-day duplicates. See that module for the measurement.
//
// NO CREDENTIALS. The feed is public, so there is no `MissingCredentialsError`
// branch and no breaker row: a failure here is an HTTP failure the cron's own
// run tracking records.
// ============================================================

const adapter: SourceAdapter = {
  name: 'rheinfetisch',
  entityType: 'event',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const { events, unsupported } = parseIcs(await fetchFeed())
    for (const u of unsupported) {
      // Never silent: a rule this parser cannot expand is a real event whose
      // repeats are missing, and it must be visible in the logs as that.
      console.warn(`source-rheinfetisch unsupported RRULE on ${u.uid}: ${u.reason}`)
    }
    return events
      .slice(0, config.batchSize)
      .map((e) => ({ sourceId: e.instanceKey, data: e as unknown as Record<string, unknown> }))
  },

  getSourceId: (raw) => String(raw.sourceId),

  normalize: (raw: RawItem) => normalizeIcsEvent(raw.data as unknown as IcsEvent),
}

Deno.serve(withErrorReporting('source-rheinfetisch', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      // The whole calendar is ~130 resolved events and it is one HTTP request,
      // so the default reads all of it. A smaller cap would re-read the same
      // head forever and never reach the events furthest out.
      batchSize: body.limit ?? body.batch_size ?? 500,
      dryRun: body.dry_run ?? body.dryRun ?? false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }

    const raw = await adapter.fetch(config)

    if (config.dryRun) {
      const normalized = raw.map((r) => adapter.normalize(r))
      const byOrigin: Record<string, number> = {}
      for (const r of raw) {
        const o = String((r.data as unknown as IcsEvent).origin)
        byOrigin[o] = (byOrigin[o] ?? 0) + 1
      }
      const byType: Record<string, number> = {}
      for (const n of normalized) {
        const t = String((n as StagedItem).event_type)
        byType[t] = (byType[t] ?? 0) + 1
      }
      return jsonResponse({
        success: true,
        dry_run: true,
        items: raw.length,
        // Reported so a run can be judged without re-reading the feed: an
        // origin mix with no spans, or a sudden drop in items, means the
        // calendar or the parser changed.
        by_origin: byOrigin,
        by_event_type: byType,
        sample: normalized.slice(0, 3),
      }, 200, req)
    }

    const written = await writeToStaging(supabase, adapter, raw, { ...config, targetTable: 'events' })

    return jsonResponse({
      success: true,
      items: written,
      items_total: raw.length,
      items_processed: written,
      items_succeeded: written,
      items_failed: raw.length - written,
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
