import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { parseEvent, type LnEvent } from '../_shared/lgbtnetwork-parse.ts'

// ============================================================
// Source: lgbtnetwork.org — the NY LGBT Network calendar (EventON)
//
// The only US source among the ten and the largest by count (2,380 events),
// but by far the lowest yield. Three measured facts shape this function.
//
// 1. THE LIST HAS NO DATES, so every event needs its own detail fetch. 2,380
//    of them. The list IS cheap (48 JSON pages), so the crawl is made
//    incremental: ids already present in event_sources or ingestion_staging are
//    skipped before any detail page is requested. After the first pass a run
//    costs the list plus the handful of genuinely new events.
//
// 2. THE HOST RATE-LIMITS. Measured: eight rapid sequential requests return
//    403, 403, 403… ; at 700 ms spacing it recovers to 202 and serves real
//    content. An unthrottled sweep lost 46 of 86 pages to 403 — and because
//    those look like ordinary fetch failures, the loss reads as "the source has
//    no data" rather than "we asked too fast". Hence DELAY_MS and a single
//    retry, and hence a batch cap: 250 pages x 700 ms is ~3 min, inside the
//    function's budget, and the backlog drains over several runs.
//
// 3. ONLY ~15% OF EVENTS HAVE A USABLE CITY. The parser drops the rest rather
//    than staging rows that pipeline-validate would reject with E_NO_LOCATION —
//    see _shared/lgbtnetwork-parse.ts for why their locations cannot be
//    recovered safely (upstream's own coordinates put the Queens centre in
//    Phoenix, Arizona). Expect roughly 350 events from the full corpus, all of
//    them with a real address, rather than 2,380 of which 85% are rejected.
//
// EVENTS ONLY. `at_biz_dir` (103 rows) is a general business directory — it
// contains a marketing agency — so it is not a queer venue list and is not
// staged here.
// ============================================================

const BASE = 'https://lgbtnetwork.org'
// A plain browser UA. The 403s are rate-based, not UA-based: the WP REST list
// answers this UA fine, and detail pages recover once the pace drops.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const DELAY_MS = 700

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** See source-display-magazin for why `location` is widened separately. */
type StagedItem = Omit<NormalizedItem, 'location'> &
  Record<string, unknown> & {
    location?: NonNullable<NormalizedItem['location']> & Record<string, unknown>
  }

async function getText(url: string, retry = true): Promise<string | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } })
  if (res.ok) return await res.text()
  // A 403 here means we asked too fast, not that the page is gone.
  if (res.status === 403 && retry) {
    await sleep(DELAY_MS * 3)
    return getText(url, false)
  }
  return null
}

/** The WP REST list: ids, slugs and links for the whole corpus, no dates. */
async function fetchList(cap: number): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let page = 1; page <= 60; page++) {
    const res = await fetch(
      `${BASE}/wp-json/wp/v2/ajde_events?per_page=50&page=${page}&orderby=date&order=desc`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } },
    )
    if (!res.ok) break
    const rows = await res.json() as Record<string, unknown>[]
    if (!rows.length) break
    out.push(...rows)
    const total = Number(res.headers.get('x-wp-totalpages') ?? 1)
    if (page >= total || out.length >= cap * 40) break
  }
  return out
}

/**
 * Ids already seen, so a run does not re-fetch the corpus. Mirrors
 * `knownSourceIds` in scraper/scripts/gaycities-sync.ts: the union of committed
 * provenance and anything still sitting in staging.
 */
async function knownIds(supabase: ReturnType<typeof getServiceClient>): Promise<Set<string>> {
  const seen = new Set<string>()
  for (const q of [
    supabase.from('event_sources').select('source_entity_id').eq('source_slug', 'lgbtnetwork').limit(5000),
    supabase.from('ingestion_staging').select('source_entity_id').eq('source_name', 'lgbtnetwork').limit(5000),
  ]) {
    const { data } = await q
    for (const r of (data ?? []) as { source_entity_id: string | null }[]) {
      if (r.source_entity_id) seen.add(r.source_entity_id)
    }
  }
  return seen
}

function makeAdapter(skip: Set<string>): SourceAdapter {
  return {
    name: 'lgbtnetwork',
    entityType: 'event',

    async fetch(config: AdapterConfig): Promise<RawItem[]> {
      const list = (await fetchList(config.batchSize)).filter((r) => !skip.has(String(r.id)))
      const items: RawItem[] = []
      for (const row of list) {
        if (items.length >= config.batchSize) break
        const html = await getText(String(row.link))
        await sleep(DELAY_MS)
        if (!html) continue
        // null = no date, or no usable city (see the parse module).
        const parsed = parseEvent(html, { id: row.id, slug: row.slug, link: row.link })
        if (parsed) items.push({ sourceId: parsed.id, data: parsed as unknown as Record<string, unknown> })
      }
      return items
    },

    getSourceId: (raw) => String(raw.sourceId),

    normalize(raw: RawItem): NormalizedItem {
      const e = raw.data as unknown as LnEvent
      const item: StagedItem = {
        entityType: 'event',
        sourceId: e.id,
        sourceName: 'lgbtnetwork',
        name: e.title,
        title: e.title,
        description: e.description ?? undefined,
        // Flat 'other': title inference mislabels 26 youth events as `drag` on
        // this corpus. See the parse module's header.
        event_type: e.eventType,
        start_date: e.start,
        end_date: e.end,
        dates: { start: e.start, end: e.end ?? undefined },
        venue_name: e.venueName,
        website: e.url,
        ticket_url: e.url,
        location: {
          address: e.street ?? undefined,
          city: e.city ?? undefined,
          state: e.state ?? undefined,
          postal_code: e.postal ?? undefined,
          // Always beside `city`: commit resolves country first and scopes the
          // city lookup by it. Long Island town names are exactly the kind that
          // collide with same-named places elsewhere.
          country: e.country ?? undefined,
          timezone: 'America/New_York',
        },
        images: e.image ? [e.image] : [],
        tags: ['lgbtq'],
        urls: [e.url],
        metadata: { source: 'lgbtnetwork', url: e.url, wp_id: e.id },
      }
      return item
    },
  }
}

Deno.serve(withErrorReporting('source-lgbtnetwork', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      // 250 pages x 700 ms is ~3 min, inside the function budget. The backlog
      // drains over several runs; after that a run only sees new events.
      batchSize: body.limit ?? body.batch_size ?? 250,
      dryRun: body.dry_run ?? body.dryRun ?? false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }

    const skip = body.refetch_all ? new Set<string>() : await knownIds(supabase)
    const adapter = makeAdapter(skip)
    const rawEvents = await adapter.fetch(config)

    if (config.dryRun) {
      return jsonResponse({
        success: true,
        items: rawEvents.length,
        known_skipped: skip.size,
        dry_run: true,
        sample: rawEvents.slice(0, 3).map((r) => adapter.normalize(r)),
      }, 200, req)
    }

    const events = await writeToStaging(supabase, adapter, rawEvents, { ...config, targetTable: 'events' })

    return jsonResponse({
      success: true,
      items: events,
      items_total: rawEvents.length,
      items_processed: events,
      items_succeeded: events,
      items_failed: 0,
      known_skipped: skip.size,
      events,
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
