import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import {
  writeToStaging,
  MissingCredentialsError,
  InvalidCredentialsError,
  skippedResponse,
} from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import {
  type GayoutEvent,
  type ParseFailure,
  TYPE_PRECEDENCE,
  countryFromPath,
  parseEventLd,
  parseWorkList,
  pathOf,
  resolveEventType,
} from './parse.ts'
import { type PageAttempts, orderByAttempt } from './ordering.ts'

// ============================================================
// Source: gayout.com — worldwide LGBTQ+ MEGA EVENTS
//
// 725 curated flagship events (prides, circuit festivals, leather/fetish
// weeks, bear weeks, queer film festivals) across 5 continents, 2026-2028.
// Measured 2026-09-28 against the live corpus: 517 of 710 distinct events are
// ABSENT from `events` entirely, 112 exist only as PAST editions (this source
// carries the upcoming one), 81 already exist upcoming. Against ~887 upcoming
// events in total, this roughly doubles the forward-looking corpus.
//
// WHY FIRECRAWL AND NOT A PLAIN fetch(): gayout.com sits behind Cloudflare bot
// protection that answers 403 to every direct client. Measured, all four: curl
// with a browser UA, Playwright bundled chromium, Playwright with the `chrome`
// channel (real Chrome), and the UAs gayout's own robots.txt explicitly allows
// (`anthropic-ai`, `Claude-Web`). Do NOT "simplify" this adapter to Deno
// `fetch` — it will 403 and the run will read as an upstream outage rather than
// a design error. `source-gaycities`'s header records the same fault for
// gaycities.com, which is why THAT import lives scraper-side behind Playwright;
// here Playwright is blocked too, so a proxy is the only door. Firecrawl's
// plain `basic` proxy passes (verified: proxyUsed=basic).
//
// robots.txt: `Allow: /` for these paths. `?all=` and `?type=` are NOT among
// the disallowed facet params (`?month=`, `?tab=`, `?filter=`, `?sort=`, …), so
// both query shapes used here are crawlable, and no Crawl-delay applies to the
// generic agent.
//
// WHAT IS PARSED, AND WHY NOTHING IS INFERRED FROM A NAME:
//   * work list  — `ItemList` JSON-LD on `/mega-events?all=1`, 725 ListItems
//                  (721 unique urls). Deterministic; no HTML card scraping, so
//                  a markup change cannot silently truncate the work list.
//   * per event  — `Event` / `Festival` schema.org JSON-LD on the detail page:
//                  name, startDate, endDate, description, location (venue name
//                  + city + country), image, organizer, offers.url.
//   * event_type — the SOURCE's own `?type=` filter buckets, not the slug.
//                  Inferring a type from a name is the mechanism that filed 167
//                  public toilets as cafés and bars (CLAUDE.md, venue
//                  categories); the source already knows, so ask it.
//
// Parsing lives in ./parse.ts so it is covered by `npm run test:functions`
// without booting this handler.
// ============================================================

const BASE = 'https://www.gayout.com'
const LIST_URL = `${BASE}/mega-events?route=mega-events&all=1`

/** Firecrawl serves a recently-indexed copy inside this window, so the six
 *  listing calls a run makes are near-free after the first run of the day. */
const LIST_MAX_AGE_MS = 6 * 60 * 60 * 1000

// ─── Firecrawl transport ────────────────────────────────────────────────────

interface FirecrawlResult {
  rawHtml?: string
  metadata?: Record<string, unknown>
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Global request pacer.
 *
 * FIRECRAWL'S PLAN LIMIT IS PER-MINUTE AND THIS SOURCE WILL ALWAYS HIT IT.
 * Measured on the first prod dry run: 50 pages at concurrency 5 produced
 * 46 × HTTP 429 and only 4 parsed events — the run reported success while
 * doing almost nothing, which is the shape a throughput number hides. The
 * limit counts REQUESTS, so a 429 still spends budget; pacing ahead of the
 * limit is strictly cheaper than discovering it.
 *
 * Spacing is global rather than per-worker so `concurrency` stays a latency
 * knob and cannot multiply the request rate.
 */
class Pacer {
  private next = 0
  constructor(private intervalMs: number) {}
  async slot(): Promise<void> {
    const now = Date.now()
    const at = Math.max(now, this.next)
    this.next = at + this.intervalMs
    if (at > now) await sleep(at - now)
  }
  /** The server knows its own reset better than we do — obey it. */
  backoff(ms: number) {
    this.next = Math.max(this.next, Date.now() + ms)
  }
}

const RETRY_AFTER_RE = /retry after (\d+)s/i

/**
 * Scrape one url through Firecrawl.
 *
 * Tries v2 then v1: `FIRECRAWL_API_KEY` predates v2 and a key provisioned on
 * the older plan 404s the v2 route. A 401/403 is a REJECTED key — a
 * configuration problem for an operator, not an upstream outage — so it is
 * raised as InvalidCredentialsError, distinct from the transient errors the
 * caller counts and carries on from (see source-adapter.ts, and the
 * source-foursquare incident that accumulated 350 breaker failures while every
 * run still reported HTTP 200).
 *
 * A 429 is NOT a failure. It means "too fast", so it is retried against the
 * server's own stated reset rather than counted against this source — the same
 * rule the NVIDIA router applies, and the reason a burst cannot trip a breaker.
 */
async function firecrawlScrape(
  apiKey: string,
  url: string,
  maxAgeMs: number,
  pacer: Pacer,
  maxRetries = 4,
): Promise<FirecrawlResult> {
  const body = {
    url,
    formats: ['rawHtml'],
    onlyMainContent: false,
    maxAge: maxAgeMs,
    timeout: 45000,
  }

  for (let attempt = 0; ; attempt++) {
    let lastStatus = 0
    let lastText = ''

    for (const version of ['v2', 'v1']) {
      await pacer.slot()
      const res = await fetch(`https://api.firecrawl.dev/${version}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      })

      if (res.status === 401 || res.status === 403) {
        throw new InvalidCredentialsError('FIRECRAWL_API_KEY', res.status)
      }
      if (res.status === 404 && version === 'v2') continue // older plan: fall through to v1

      lastStatus = res.status
      if (res.status === 429) {
        lastText = (await res.text()).slice(0, 300)
        const hinted = RETRY_AFTER_RE.exec(lastText)
        // Exponential only as a floor; the server's hint wins when present.
        const waitMs = hinted ? (Number(hinted[1]) + 1) * 1000 : Math.min(60000, 5000 * 2 ** attempt)
        pacer.backoff(waitMs)
        break // leave the version loop, retry the whole request
      }

      if (!res.ok) {
        lastText = (await res.text()).slice(0, 300)
        throw new Error(`firecrawl ${version} ${res.status}: ${lastText}`)
      }

      const json = await res.json()
      const data = json?.data ?? json
      return { rawHtml: data?.rawHtml ?? data?.html, metadata: data?.metadata }
    }

    if (lastStatus !== 429) {
      throw new Error(`firecrawl unavailable (last status ${lastStatus}): ${lastText}`)
    }
    if (attempt >= maxRetries) {
      throw new Error(`firecrawl rate limited after ${maxRetries + 1} attempts: ${lastText}`)
    }
  }
}

// ─── Adapter ────────────────────────────────────────────────────────────────

const gayoutAdapter: SourceAdapter = {
  name: 'gayout',
  entityType: 'event',

  // The handler owns the work-list diff and the slice, and hands the
  // already-fetched records through `config.filters.items`.
  fetch(config: AdapterConfig): Promise<RawItem[]> {
    const items = (config.filters?.items as GayoutEvent[]) ?? []
    return Promise.resolve(
      items.map(e => ({ sourceId: e.path, data: e as unknown as Record<string, unknown> })),
    )
  },

  getSourceId(raw: RawItem): string {
    return String((raw.data as unknown as GayoutEvent).path)
  },

  normalize(raw: RawItem): NormalizedItem {
    const e = raw.data as unknown as GayoutEvent

    // urls[0] is the official/organizer site where one exists, because
    // `commit_event_staging_item` falls back to `urls[0]` for `ticket_url` when
    // no explicit one is set — so the first entry must be somewhere a reader
    // can actually attend from, not our own listing page. The gayout page is
    // always present too, and `metadata.url` is what becomes
    // `event_sources.source_url`.
    const official = e.ticketUrl ?? e.organizerUrl
    const urls = official && official !== e.url ? [official, e.url] : [e.url]

    const item: NormalizedItem = {
      entityType: 'event',
      sourceId: e.path,
      sourceName: 'gayout',
      name: e.name,
      description: e.description,
      location: {
        city: e.city,
        country: e.country ?? countryFromPath(e.path),
      },
      dates: { start: e.start, end: e.end },
      // Deliberately just the one term. `events.tags` feeds a controlled queer
      // vocabulary, and the source's own classification already lands on
      // `event_type`; deriving further tags from the title is exactly the name
      // inference this adapter exists to avoid.
      tags: ['lgbtq'],
      urls,
      images: e.images,
      venue_name: e.venueName,
      contacts: { website: e.organizerUrl },
      metadata: {
        source: 'gayout',
        url: e.url,
        mega_event: true,
        gayout_types: e.sourceTypes,
        organizer_name: e.organizerName,
        event_status: e.status,
      },
    }

    // `commit_event_staging_item` reads `event_type`, `website` and
    // `ticket_url` from the TOP level of normalized_data. They are not on the
    // NormalizedItem interface, so they are attached here rather than stashed
    // in metadata and silently dropped — the same top-level-vs-metadata gap
    // that left 417 Ticketmaster events with no venue_name.
    const extra = item as unknown as Record<string, unknown>
    extra.event_type = e.eventType
    if (e.organizerUrl) extra.website = e.organizerUrl
    if (e.ticketUrl) extra.ticket_url = e.ticketUrl

    return item
  },
}

// ─── Work list + slice ──────────────────────────────────────────────────────

/** Every gayout MEGA-EVENT path this source has already staged or committed.
 *
 *  SCOPED TO `target_table='events'` ON PURPOSE. `source_name='gayout'` is
 *  shared: a concurrent import stages gayout BARS, HOTELS and ORGANISATIONS
 *  under the same source name (18,435 rows, measured 2026-09-28). Without the
 *  scope this set loads all of them on every run — a pointless 18k-row read
 *  today, and a wrong answer the day a venue path collides with an event path.
 *  One source, several entity types, is the normal shape here (source-gay-ch
 *  stages events and venues too); the adapter just has to say which it means.
 *
 *  Paged explicitly: PostgREST caps a response at 1000 rows, so a single
 *  unpaged select would silently stop reporting rows as seen once this source
 *  passes that mark, and the drain would re-fetch them forever. */
async function loadSeen(supabase: ReturnType<typeof getServiceClient>): Promise<Set<string>> {
  const seen = new Set<string>()
  const PAGE = 1000

  const drain = async (
    table: string,
    filters: Record<string, string>,
  ) => {
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from(table).select('source_entity_id')
      for (const [col, val] of Object.entries(filters)) q = q.eq(col, val)
      const { data, error } = await q.range(from, from + PAGE - 1)
      if (error) throw new Error(`seen-set read failed (${table}): ${error.message}`)
      for (const r of data ?? []) if (r.source_entity_id) seen.add(r.source_entity_id as string)
      if (!data || data.length < PAGE) break
    }
  }

  await drain('ingestion_staging', { source_name: 'gayout', target_table: 'events' })
  await drain('event_sources', { source_slug: 'gayout' })
  return seen
}

/** Per-path record of a fetch that produced NO event, kept in
 *  `ingestion_sources.config.page_attempts` as `{ path: iso }`.
 *
 *  WHY THIS EXISTS. A page whose date is unannounced yields no row, so it is
 *  never "seen" and returns to the head of `pending` on every run. The page
 *  budget was written to absorb that and CANNOT, because the run is stopped by
 *  the TIME budget long before the page budget: measured on prod 2026-10-01,
 *  three consecutive runs fetched 16 pages, parsed 0, and reported success
 *  while `already_seen` stayed at 353 and 377 urls waited. The clock allows
 *  ~16 pages and the unparseable run at the head is longer than that, so the
 *  drain could never reach a parseable page again.
 *
 *  THE MAP IS BOUNDED AND SELF-PRUNING. Only pages that failed to parse are
 *  recorded; a page that parses is staged and leaves `pending` permanently, so
 *  it never needs an entry. Entries for paths no longer pending are dropped on
 *  write, which also clears a page the day its date IS announced. */
async function loadAttempts(
  supabase: ReturnType<typeof getServiceClient>,
): Promise<PageAttempts> {
  const { data, error } = await supabase
    .from('ingestion_sources')
    .select('config')
    .eq('slug', 'gayout')
    .maybeSingle()
  // Fail OPEN: a missing or unreadable row means "no attempts recorded", which
  // degrades to the old every-run-retry rather than aborting the drain.
  if (error || !data) return {}
  const m = (data.config as Record<string, unknown> | null)?.page_attempts
  return m && typeof m === 'object' ? (m as PageAttempts) : {}
}

async function saveAttempts(
  supabase: ReturnType<typeof getServiceClient>,
  attempts: PageAttempts,
): Promise<void> {
  const { data } = await supabase
    .from('ingestion_sources')
    .select('config')
    .eq('slug', 'gayout')
    .maybeSingle()
  const config = { ...((data?.config as Record<string, unknown>) ?? {}), page_attempts: attempts }
  // Best effort. Losing the write costs one run of ordering, not correctness —
  // the next run simply sees staler attempt data.
  await supabase.from('ingestion_sources').update({ config }).eq('slug', 'gayout')
}


/** url -> the source's own `?type=` buckets for that event. */
async function loadTypeMap(apiKey: string, maxAgeMs: number, pacer: Pacer): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  for (const [bucket] of TYPE_PRECEDENCE) {
    try {
      const { rawHtml } = await firecrawlScrape(apiKey, `${LIST_URL}&type=${bucket}`, maxAgeMs, pacer)
      if (!rawHtml) continue
      for (const { url } of parseWorkList(rawHtml)) {
        const cur = map.get(url) ?? []
        cur.push(bucket)
        map.set(url, cur)
      }
    } catch (err) {
      if (err instanceof InvalidCredentialsError) throw err
      // A missing bucket costs precision on `event_type`, never correctness:
      // the fallback is `other`, a legal value. Do not fail the run for it.
      console.warn(`[gayout] type bucket ${bucket} unavailable: ${(err as Error).message}`)
    }
  }
  return map
}

// ─── Handler ────────────────────────────────────────────────────────────────

Deno.serve(withErrorReporting('source-gayout', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient())
  if (_auth instanceof Response) return _auth

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY')
    if (!apiKey) {
      return jsonResponse(
        skippedResponse('FIRECRAWL_API_KEY not configured', ['FIRECRAWL_API_KEY']),
        200,
        req,
      )
    }

    const limit = Math.min(Math.max(Number(body.limit ?? body.batch_size ?? 24), 1), 120)
    const dryRun = Boolean(body.dry_run ?? body.dryRun)
    const refresh = Boolean(body.refresh)
    const probe = Boolean(body.probe)
    const concurrency = Math.min(Math.max(Number(body.concurrency ?? 2), 1), 8)
    const maxAge = refresh ? 0 : LIST_MAX_AGE_MS

    // Default 5s ≈ 12 req/min, just under the plan limit the first prod dry run
    // measured (it reported "Consumed (req/min): 11, Remaining: 0"). Operator
    // override rather than a constant, because the ceiling belongs to the
    // Firecrawl plan and moves when the plan does.
    const pacer = new Pacer(Math.min(Math.max(Number(body.min_interval_ms ?? 5000), 250), 60000))

    // THE BINDING LIMIT IS THE GATEWAY'S 150s IDLE TIMEOUT, NOT THE 546s WALL.
    // This function streams nothing, so the whole invocation has to finish
    // inside one idle window: a run that overruns is killed with
    // `504 IDLE_TIMEOUT`, stages NOTHING, reports no counters, and loses its
    // entire Firecrawl spend. Measured — a first attempt budgeted at 420s was
    // killed at 150s having parsed nothing. Stopping early and RETURNING what
    // was parsed is the whole point of a deadline, so it must sit under 150s.
    //
    // 120s at ~12 req/min is about 24 pages a run, which is also what the
    // Firecrawl per-minute limit allows in that window — the two ceilings agree,
    // so raising this without raising the pacing buys nothing but a killed run.
    const deadline = Date.now() + Math.min(Math.max(Number(body.budget_ms ?? 120000), 15000), 140000)

    // ── work list
    const listing = await firecrawlScrape(apiKey, LIST_URL, maxAge, pacer)
    if (!listing.rawHtml) throw new Error('listing returned no html')
    const workList = parseWorkList(listing.rawHtml)
    if (workList.length === 0) {
      // An empty work list is never a drained queue — it is a parse failure or a
      // blocked fetch. Failing loudly here is the difference between "the source
      // has nothing new" and "we have stopped being able to read it", which is
      // the distinction a run reporting success cannot otherwise make.
      throw new Error('listing ItemList produced 0 events — parse or fetch regression')
    }

    if (probe) {
      return jsonResponse(
        { success: true, probe: true, work_list: workList.length, sample: workList.slice(0, 3) },
        200,
        req,
      )
    }

    const seen = await loadSeen(supabase)
    const unordered = refresh ? workList : workList.filter(w => !seen.has(pathOf(w.url)))

    // ORDERING IS THE WEDGE GUARD — see loadAttempts. The page budget below
    // cannot save us on its own because the TIME budget stops the run first.
    const attempts = await loadAttempts(supabase)
    const pending = orderByAttempt(unordered, attempts, pathOf)
    const neverAttempted = unordered.filter(w => !attempts[pathOf(w.url)]).length

    // PAGE BUDGET, NOT A SLICE — and this is a correctness guard, not a tuning
    // knob. An event whose date is unannounced yields no row, so it is never
    // "seen" and reappears in `pending` on every future run. With a fixed slice
    // of `limit` urls, a cluster of such pages sitting at the head of the list
    // fills the whole slice and the drain stops importing anything, forever,
    // while still reporting success — the resume-by-absence wedge. Fetching up
    // to `pageBudget` pages until `limit` events PARSE means unparseable pages
    // cost throughput but can never block progress.
    //
    // Re-checking them every run is deliberate: it is how an event enters once
    // its date IS announced. Firecrawl's `maxAge` makes the repeat cheap.
    const pageBudget = Math.min(pending.length, limit * 2)
    if (pending.length === 0) {
      return jsonResponse({
        success: true,
        drained: true,
        work_list: workList.length,
        already_seen: seen.size,
        items: 0,
        items_total: 0,
        items_processed: 0,
        items_succeeded: 0,
        items_failed: 0,
      }, 200, req)
    }

    // ── source classification (cheap, cached; degrades to `other`)
    const typeMap = await loadTypeMap(apiKey, maxAge, pacer)

    // ── detail pages
    const events: GayoutEvent[] = []
    const fetchErrors: { url: string; error: string }[] = []
    // Kept apart on purpose — see ParseFailure in ./parse.ts. `date_unannounced`
    // is the source being honest and is NOT a failure; `no_ld` is a regression.
    const skipped: Record<ParseFailure, string[]> = { no_ld: [], no_event_ld: [], incomplete: [] }
    let pagesFetched = 0

    let stoppedOnBudget = false
    for (let i = 0; i < pageBudget && events.length < limit; i += concurrency) {
      if (Date.now() > deadline) { stoppedOnBudget = true; break }
      const chunk = pending.slice(i, Math.min(i + concurrency, pageBudget))
      if (chunk.length === 0) break
      pagesFetched += chunk.length
      const settled = await Promise.allSettled(chunk.map(async (w) => {
        const { rawHtml } = await firecrawlScrape(apiKey, w.url, maxAge, pacer)
        if (!rawHtml) throw new Error('no html')
        const result = parseEventLd(rawHtml, w.url, w.name)
        if (!result.ok) return result
        const buckets = typeMap.get(w.url) ?? []
        return {
          ok: true as const,
          event: {
            ...result.event,
            path: pathOf(w.url),
            sourceTypes: buckets,
            eventType: resolveEventType(buckets),
          } satisfies GayoutEvent,
        }
      }))

      for (const [idx, r] of settled.entries()) {
        const url = chunk[idx].url
        if (r.status === 'rejected') {
          if (r.reason instanceof InvalidCredentialsError) throw r.reason
          fetchErrors.push({ url, error: String((r.reason as Error)?.message ?? r.reason) })
        } else if (!r.value.ok) {
          // Never filled in from the listing title alone: a row with a name and
          // no date cannot commit, so staging it would only move the failure
          // downstream and make the queue look drained.
          skipped[r.value.reason].push(url)
        } else {
          events.push(r.value.event)
        }
      }
    }

    // Record every fetch that produced NO event so it sorts to the back next
    // run, and prune paths that are no longer pending — a page that has since
    // parsed, or whose date was announced, drops out here rather than lingering.
    if (!dryRun) {
      const stamp = new Date().toISOString()
      const pendingPaths = new Set(pending.map(w => pathOf(w.url)))
      const next: PageAttempts = {}
      for (const [p, at] of Object.entries(attempts)) if (pendingPaths.has(p)) next[p] = at
      for (const u of [
        ...skipped.no_event_ld, ...skipped.no_ld, ...skipped.incomplete,
        ...fetchErrors.map(f => f.url),
      ]) next[pathOf(u)] = stamp
      // Keyed through pathOf, not e.path, so the attempts map, the seen-set and
      // the ordering all derive their key the same way and cannot drift.
      for (const e of events) delete next[pathOf(e.url)]
      await saveAttempts(supabase, next)
    }

    const typed = events.filter(e => e.eventType !== 'other').length
    const summary = {
      work_list: workList.length,
      already_seen: seen.size,
      pending_before_this_run: pending.length,
      // The quantity whose absence hid the wedge: with every pending page
      // already attempted, a run that parses nothing is a treadmill, not
      // progress. A healthy backlog keeps this above zero.
      never_attempted: neverAttempted,
      pages_fetched: pagesFetched,
      page_budget: pageBudget,
      stopped_on_time_budget: stoppedOnBudget,
      parsed: events.length,
      // Expected: gayout omits the Event block while a date is unannounced.
      date_unannounced: skipped.no_event_ld.length,
      // Regression signals: a page with no JSON-LD at all, or an event block
      // missing its own name or start date.
      no_json_ld_at_all: skipped.no_ld.length,
      incomplete_event_ld: skipped.incomplete.length,
      fetch_failures: fetchErrors.length,
      type_resolved: typed,
      type_other: events.length - typed,
      with_end_date: events.filter(e => e.end).length,
      with_description: events.filter(e => (e.description?.length ?? 0) >= 20).length,
      with_venue: events.filter(e => e.venueName).length,
      with_country: events.filter(e => e.country ?? countryFromPath(e.path)).length,
    }

    if (dryRun) {
      return jsonResponse({
        success: true,
        dry_run: true,
        ...summary,
        items: 0,
        sample: events.slice(0, 3).map(e =>
          gayoutAdapter.normalize({ sourceId: e.path, data: e as unknown as Record<string, unknown> })
        ),
        date_unannounced_urls: skipped.no_event_ld.slice(0, 10),
        no_json_ld_urls: skipped.no_ld.slice(0, 10),
        incomplete_urls: skipped.incomplete.slice(0, 10),
        fetch_error_sample: fetchErrors.slice(0, 10),
      }, 200, req)
    }

    const config: AdapterConfig = {
      batchSize: limit,
      dryRun: false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
      filters: { items: events },
    }
    const raws = await gayoutAdapter.fetch(config)
    const staged = await writeToStaging(supabase, gayoutAdapter, raws, {
      ...config,
      targetTable: 'events',
      // Refresh mode re-checks an already-staged event and re-opens it only if
      // the normalized payload CHANGED, which is what keeps the weekly cron
      // useful once the backfill drains: a mega event's dates move every year
      // while its url stays put.
      refresh,
    })

    return jsonResponse({
      success: true,
      ...summary,
      items: staged,
      items_total: pagesFetched,
      items_processed: events.length,
      items_succeeded: staged,
      // Only genuine faults count as failed. A date-unannounced page is the
      // source being honest and is reported separately in `summary`; counting it
      // here would make a healthy run look broken and drive the auto-pause
      // counter that `admin_automations` keeps on consecutive failures.
      items_failed: fetchErrors.length + skipped.no_ld.length + skipped.incomplete.length,
      fetch_error_sample: fetchErrors.slice(0, 10),
      no_json_ld_urls: skipped.no_ld.slice(0, 10),
    }, 200, req)
  } catch (error) {
    if (error instanceof MissingCredentialsError) {
      return jsonResponse(skippedResponse(error.message, error.missing), 200, req)
    }
    return errorResponse((error as Error).message, 500, req)
  }
}))
