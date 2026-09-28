import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { parseListing, parseDetail, buildEvents, type G4uCard, type G4uDetail, type G4uEvent } from '../_shared/gaytravel4u-parse.ts'

// ============================================================
// Source: gaytravel4u.com — the six curated event listicles.
//
// SCOPE IS THE SIX PAGES, NOT THE SITE. The site's `event` post type has
// 1,713 URLs in its sitemaps; these six pages curate ~621 of them into pride,
// bear, fetish, ski, carnival and easter collections. Importing the sitemap
// instead would be a different and much larger decision — the six pages are
// what was asked for and they are the editorially curated subset.
//
// TWO REQUESTS PER EVENT IS WHY THIS IS RESUMABLE. The listing enumerates
// slugs; the record lives on /event/<slug>/. 621 detail fetches do not fit a
// 546s edge invocation with any margin, so each run SKIPS slugs already in
// ingestion_staging and works the remainder. That is not an optimisation: a
// run that always re-reads the same head is the selector-starvation shape
// this codebase has been bitten by in city enrichment, embeddings and the
// news drain. Once the corpus is staged a run costs 6 requests and stages 0.
//
// EVENTS ONLY. The Event node carries no venue name, no street, no lat/lng
// and no time of day — just a date-only startDate and locality + ISO country.
// Nothing is written to `venues`, and venue_name stays null rather than being
// guessed from a title like "Mates Leather Weekend Provincetown".
//
// See _shared/gaytravel4u-parse.ts for the two upstream defects this guards
// (2031 placeholder dates; a locality naming a different city than the event).
// ============================================================

const SITE = 'https://www.gaytravel4u.com'
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)'

/** The six pages named in the import request. */
const LISTINGS = [
  'gay-pride-calendar',
  'bear-events-not-to-miss',
  'gay-fetish-events',
  'the-top-gay-ski-weeks',
  'gay-carnival-events',
  'gay-easter-events',
]

/** See source-eventfrog for why `location` is widened separately. */
type StagedItem = Omit<NormalizedItem, 'location'> &
  Record<string, unknown> & {
    location?: NonNullable<NormalizedItem['location']> & Record<string, unknown>
  }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Spacing between detail fetches.
 *
 * MEASURED, NOT GUESSED. An unpaced run stopped at exactly 24 detail pages
 * twice — once at batch_size 25 and once at 60 — while the six listing pages
 * fetched fine and the same 78 pages fetched fine from a laptop. Two runs
 * landing on the same number is a throttle on the caller, not a flaky page.
 * source-lgbtnetwork hit the same wall on a different WordPress host and
 * settled on 700ms; the extra retry below covers the tail.
 */
const DETAIL_SPACING_MS = 700

async function getHtml(url: string, attempt = 1): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } })
  if (res.ok) return await res.text()
  // 429/403/5xx from a throttle are "ask again later", not "this page is
  // broken" — one backoff retry before giving up on the slug.
  if (attempt === 1 && (res.status === 429 || res.status === 403 || res.status >= 500)) {
    await sleep(4000)
    return await getHtml(url, 2)
  }
  throw new Error(`gaytravel4u ${res.status} for ${url}`)
}

/**
 * Slugs this source has already staged, so a run works the tail.
 *
 * Reads `ingestion_staging` rather than `events`: a slug that staged and was
 * then rejected by validate must NOT be re-fetched every night forever, and a
 * slug that staged and committed is equally done. Staging is the record of
 * "we have looked at this".
 */
async function alreadyStaged(
  supabase: ReturnType<typeof getServiceClient>,
): Promise<{ slugs: Set<string>; cities: Set<string> }> {
  const slugs = new Set<string>()
  const cities = new Set<string>()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('ingestion_staging')
      .select('source_entity_id, normalized_data')
      .eq('source_name', 'gaytravel4u')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`staging lookup failed: ${error.message}`)
    for (const r of data ?? []) {
      if (r.source_entity_id) slugs.add(String(r.source_entity_id))
      // Doubles as the cumulative corroboration vocabulary — see buildEvents.
      const c = (r.normalized_data as { location?: { city?: unknown } } | null)?.location?.city
      if (typeof c === 'string' && c.trim()) cities.add(c.trim())
    }
    if (!data || data.length < PAGE) break
  }
  return { slugs, cities }
}

let pendingEvents: G4uEvent[] = []
let lastDropped = { noDate: 0, placeholder: 0, cityConflict: 0 }
/**
 * Fetch failures are REPORTED, never swallowed.
 *
 * The first cut logged them with console.warn and returned only the success
 * count, so a run that lost 36 of 60 detail pages to a throttle reported
 * `items: 24, dropped: {0,0,0}` — indistinguishable from a listing that only
 * had 24 events. A silent partial is the shape that makes a broken importer
 * read as a healthy one.
 */
let lastFetch: {
  listingsOk: number; listingsFailed: number
  detailsOk: number; detailsFailed: number
  cardsFound?: number; todo?: number
  firstError: string | null
} = { listingsOk: 0, listingsFailed: 0, detailsOk: 0, detailsFailed: 0, firstError: null }

const eventAdapter: SourceAdapter = {
  name: 'gaytravel4u',
  entityType: 'event',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const skip = (config.filters?.skip as Set<string>) ?? new Set<string>()
    const listings = (config.filters?.listings as string[]) ?? LISTINGS

    lastFetch = { listingsOk: 0, listingsFailed: 0, detailsOk: 0, detailsFailed: 0, firstError: null }

    // 1. Enumerate. A card seen on two pages is one event.
    const cards = new Map<string, G4uCard>()
    for (const page of listings) {
      try {
        for (const c of parseListing(await getHtml(`${SITE}/${page}/`))) {
          if (!cards.has(c.slug)) cards.set(c.slug, c)
        }
        lastFetch.listingsOk++
      } catch (e) {
        // One bad listing must not lose the other five.
        lastFetch.listingsFailed++
        lastFetch.firstError ??= `listing ${page}: ${(e as Error).message}`
      }
    }

    // 2. Fetch the record for each slug we have not looked at yet, paced.
    const todo = [...cards.values()].filter((c) => !skip.has(c.slug)).slice(0, config.batchSize)
    const pairs: Array<{ card: G4uCard; detail: G4uDetail }> = []
    for (let i = 0; i < todo.length; i++) {
      const card = todo[i]
      if (i > 0) await sleep(DETAIL_SPACING_MS)
      try {
        pairs.push({ card, detail: parseDetail(await getHtml(card.url)) })
        lastFetch.detailsOk++
      } catch (e) {
        lastFetch.detailsFailed++
        lastFetch.firstError ??= `detail ${card.slug}: ${(e as Error).message}`
      }
    }
    lastFetch.cardsFound = cards.size
    lastFetch.todo = todo.length

    const seedCities = (config.filters?.seedCities as Iterable<string>) ?? []
    const { events, dropped } = buildEvents(pairs, new Date(), seedCities)
    pendingEvents = events
    lastDropped = dropped
    return events.map((e) => ({ sourceId: e.slug, data: e as unknown as Record<string, unknown> }))
  },

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const e = raw.data as unknown as G4uEvent
    const item: StagedItem = {
      entityType: 'event',
      sourceId: e.slug,
      sourceName: 'gaytravel4u',
      name: e.title,
      title: e.title,
      description: e.description ?? undefined,
      event_type: e.eventType,
      start_date: e.start,
      end_date: e.end ?? undefined,
      dates: { start: e.start, end: e.end ?? undefined },
      // No venue anywhere in the source; never inferred from the title.
      venue_name: undefined,
      website: e.url,
      ticket_url: e.url,
      location: {
        city: e.city ?? undefined,
        // Always sent beside `city`: commit resolves country first and scopes
        // the city lookup by it.
        country: e.country ?? undefined,
      },
      images: e.image ? [e.image] : [],
      tags: ['lgbtq'],
      urls: [e.url],
      metadata: {
        source: 'gaytravel4u',
        url: e.url,
        gaytravel4u_slug: e.slug,
        // Stamped so a reader can tell "no city" from "city withheld because
        // the page contradicted the event's own name".
        city_corroborated: e.cityCorroborated,
      },
    }
    return item
  },
}

Deno.serve(withErrorReporting('source-gaytravel4u', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body.dry_run ?? body.dryRun ?? false
    // 150 detail fetches is ~2-4 min, comfortably inside the 546s wall, and
    // clears the 621-slug backlog in five nights.
    const batchSize = body.limit ?? body.batch_size ?? 150

    // A dry run must see unstaged work, or it reports 0 once the corpus is in
    // and looks broken. `refetch: true` forces a full pass.
    const staged = await alreadyStaged(supabase)
    // `refetch` re-reads every slug, but the city vocabulary is KEPT: it is
    // evidence gathered over time, not part of the work list.
    const skip = body.refetch === true ? new Set<string>() : staged.slugs

    const config: AdapterConfig = {
      batchSize,
      dryRun,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
      filters: { skip, listings: body.listings, seedCities: staged.cities },
    }

    const rawEvents = await eventAdapter.fetch(config)

    if (dryRun) {
      return jsonResponse({
        success: true,
        items: rawEvents.length,
        dry_run: true,
        already_staged: skip.size,
        fetch: lastFetch,
        dropped: lastDropped,
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
      already_staged: skip.size,
      // Reported, never silent: a rising placeholder or city-conflict count is
      // the upstream getting worse, and a silent drop reads as clean data.
      // `fetch` is here for the same reason one layer down — a throttled run
      // that loses most of its detail pages must not look like a small one.
      fetch: lastFetch,
      dropped: lastDropped,
      events,
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))

export { pendingEvents }
