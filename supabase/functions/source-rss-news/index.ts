import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'
import { parseRssItems, cleanText, excerptOf, stripLoneSurrogates } from './rss-parse.ts'
import {
  isWikinewsHost,
  parseWikinewsCategoryUrl,
  fetchWikinewsCategoryPage,
  fetchWikinewsArticles,
} from '../_shared/wikinews.ts'

// ============================================================
// Source: RSS/News APIs — unified adapter for all news sources
// Replaces: fetch-news (v485)
// Sources: RSS feeds, NewsAPI, NewsData, GNews, TheNewsAPI
// ============================================================

interface NewsSource {
  id: string
  name: string
  source_type: string
  url: string
  is_active: boolean
  last_fetched_at: string | null
  feed_type?: string | null  // 'news' | 'podcast' — gates podcast enclosure parsing
}

const LGBTQ_KEYWORDS = ['lgbtq', 'lgbt', 'gay', 'lesbian', 'trans', 'transgender', 'bisexual', 'queer', 'pride', 'nonbinary', 'rainbow', 'drag', 'same-sex']

// Feeds per invocation. 30 was the previous ceiling and per-invocation work
// still tripped the edge CPU limit (HTTP 546 — top news-DAG failure cause,
// ×102/14d); the wall-clock/byte/item budgets below bound the tail but the
// feed count is the primary work knob, so halve the default. Configurable via
// body.max_feeds_per_run (DAG node config), clamped to the known-safe ceiling.
// Capped runs lose nothing: last_fetched_at is stamped at claim time and
// news_sources_eligible orders by it ASC, so the next run picks up the feeds
// this one didn't touch.
//
// THAT WAS ONLY TRUE WITHIN A RELIABILITY TIER, and the difference cost two
// sources 53 days of silence. Until 20280417125946 the selector ordered
// `reliability_score DESC` FIRST and used last_fetched_at only as a tiebreaker,
// so with 293 live sources at score 1.000 and two at 0.999, those two sat at
// rank ~294 and this cap could never reach them — however stale they got.
// Staleness is the primary key now and reliability scales the re-fetch interval
// instead, so the sentence above holds as written. Sentinel:
// news_source_starvation_stats(), checked by scripts/check-pipeline-health.mjs.
const MAX_FEEDS_HARD_CAP = 30
const DEFAULT_MAX_FEEDS_PER_RUN = 15

const rssNewsAdapter: SourceAdapter = {
  name: 'rss-news',
  entityType: 'news_article',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const supabase = getServiceClient()
    const maxArticles = (config.filters?.maxArticles as number) || 100
    const sinceHours = (config.filters?.sinceHours as number) || 24

    // Only pull sources eligible to run right now (respects auto_paused,
    // backoff_until, fetch_frequency). The RPC encapsulates the
    // circuit-breaker policy at the source level — see news_sources_eligible().
    // Bounded per run: at ~90+ eligible sources a single invocation hit the
    // edge worker resource limit (HTTP 546) on alternating hourly runs
    // (2026-07). Cumulative feed-parse cost is the constraint, so keep the
    // per-run set small; last_fetched_at ASC ordering rotates the remainder
    // into the next run so coverage isn't lost.
    const maxFeedsRaw = Number(config.filters?.maxFeedsPerRun ?? DEFAULT_MAX_FEEDS_PER_RUN)
    const maxFeeds = Math.min(
      MAX_FEEDS_HARD_CAP,
      Math.max(1, Number.isFinite(maxFeedsRaw) ? Math.floor(maxFeedsRaw) : DEFAULT_MAX_FEEDS_PER_RUN),
    )
    const { data: sources, error } = await supabase.rpc('news_sources_eligible', {
      p_limit: maxFeeds,
    })

    if (error || !sources || sources.length === 0) {
      console.log('No eligible news sources')
      return []
    }

    const allItems: RawItem[] = []

    // Hard wall-clock budget. Feeds are fetched sequentially and each may take
    // up to 20s (fetchFromRss timeout), so a run of many slow feeds can blow
    // past the 150s edge-function limit → HTTP 546 (WORKER_LIMIT), failing the
    // whole pipeline. Stop admitting new feeds at 120s; unprocessed sources
    // keep their old last_fetched_at and are prioritised next run (ASC order).
    const deadlineAt = Date.now() + 120_000
    let skippedForTime = 0

    // Cumulative parse budget. Wall-clock alone does NOT bound the worker:
    // parseRssItems is O(feed size) and podcast archives run 2–3 MB each, so a
    // batch of them exhausts the memory/CPU limit well inside 120s. This is the
    // constraint that actually produced HTTP 546 (2026-08-03: the 30 oldest
    // sources drifted into an all-podcast cohort and every hourly run died).
    const RUN_BYTE_BUDGET = 12 * 1024 * 1024
    let bytesParsed = 0
    let skippedForBytes = 0

    // Cap the ITEMS a run accumulates, not just the bytes it downloads. These
    // are different constraints and the byte budget does not imply this one:
    // measured on the 2026-08-06 11:00 run, 30 feeds totalling 6.6 MB (well
    // under RUN_BYTE_BUDGET) with no single feed reaching the 100-item cap
    // still produced 1,681 items — and the worker died with HTTP 546 at 44s,
    // AFTER all 30 sources had been fetched successfully in 30s. The cost is
    // downstream of the loop (normalize + writeToStaging over allItems), so it
    // scales with item count. The run that completed the same morning carried
    // 83 items. 500 sits well inside that gap and bounds the staging payload.
    const RUN_ITEM_BUDGET = 500
    let skippedForItems = 0

    // A feed that KILLS the worker never reaches the catch below, so it never
    // increments consecutive_failures and can never auto-pause. That is how one
    // source (queertheology.com, 8.5 MB / 652 episodes) took the pipeline down
    // for three days while sitting at consecutive_failures = 0.
    //
    // `status='processing'` is already the marker we need: it is written at
    // claim and overwritten on every completion path, so a source still showing
    // it at the START of a later run is one a previous run died on. Charge it a
    // failure so the existing backoff/auto-pause machinery can finally see it.
    // We still attempt the fetch — a healthy source then succeeds and resets the
    // counter, so this cannot slowly pause a feed that is actually fine.
    const sourceIds = (sources as NewsSource[]).map((s) => s.id)
    const { data: stalled } = await supabase
      .from('news_sources')
      .select('id, consecutive_failures')
      .in('id', sourceIds)
      .eq('status', 'processing')
    const diedLastRun = new Map<string, number>(
      (stalled ?? []).map((s: Record<string, unknown>) => [s.id as string, (s.consecutive_failures as number) ?? 0]),
    )

    for (const source of sources as NewsSource[]) {
      if (Date.now() > deadlineAt) { skippedForTime++; continue }
      if (bytesParsed > RUN_BYTE_BUDGET) { skippedForBytes++; continue }
      if (allItems.length >= RUN_ITEM_BUDGET) { skippedForItems++; continue }
      try {
        // Claim the source: advance last_fetched_at NOW, not on completion.
        // last_fetched_at is the queue cursor (news_sources_eligible orders by
        // it ASC), so stamping it only on success means a run that dies mid-loop
        // re-selects the very same batch next hour — for ever. That is exactly
        // how one heavy batch turned into 82 consecutive failures. Advancing at
        // claim time makes the batch rotate whatever the outcome, so this class
        // of failure self-heals instead of latching. `last_successful_fetch`
        // remains the field that means "we actually got data".
        const claim: Record<string, unknown> = {
          status: 'processing',
          last_fetched_at: new Date().toISOString(),
        }
        if (diedLastRun.has(source.id)) {
          const failures = (diedLastRun.get(source.id) ?? 0) + 1
          claim.consecutive_failures = failures
          claim.last_error = 'worker terminated while fetching this source (no completion recorded)'
          claim.backoff_until = new Date(
            Date.now() + Math.min(5 * 60 * 1000 * Math.pow(2, failures - 1), 24 * 60 * 60 * 1000),
          ).toISOString()
          if (failures >= 8) {
            claim.auto_paused = true
            claim.auto_paused_reason = `${failures} consecutive failures: worker terminated while fetching (likely oversized feed)`
          }
          console.warn(`Source ${source.name} killed a previous run (streak: ${failures})`)
        }
        await supabase.from('news_sources').update(claim).eq('id', source.id)

        let articles: Record<string, unknown>[] = []
        const apiName = detectApiName(source.url)

        if (isWikinewsHost(source.url)) {
          // Wikinews has no usable category RSS feed — pull recent LGBT articles
          // via the MediaWiki API. Full historical import goes through the
          // backfill mode in the HTTP handler below.
          articles = await withCircuitBreaker(supabase, 'wikinews', () =>
            fetchRecentWikinews(source.url, maxArticles)
          )
        } else if (apiName) {
          articles = await withCircuitBreaker(supabase, apiName, () =>
            fetchFromApi(source, sinceHours)
          )
        } else {
          // Pass maxArticles down so the parser STOPS there. The slice below
          // used to be the only limit, which meant a 652-episode podcast
          // archive was fully parsed and cleaned just to keep 100.
          const rss = await fetchFromRss(source.url, source.feed_type === 'podcast', maxArticles)
          articles = rss.items
          bytesParsed += rss.bytes
        }

        for (let i = 0; i < Math.min(articles.length, maxArticles); i++) {
          const article = articles[i]
          allItems.push({
            sourceId: (article.url as string) || `${source.id}-${Date.now()}-${i}`,
            data: { ...article, source_id: source.id, source_name: source.name },
          })
        }

        // Silent-zero detection: HTTP 200 with empty results (e.g. NewsAPI
        // returning {articles: []} from a bad key or stale query) used to be
        // marked as success. Track consecutive empties and auto-pause at 8,
        // mirroring the failure path.
        if (articles.length === 0) {
          const { data: cur } = await supabase
            .from('news_sources')
            .select('consecutive_empty_fetches')
            .eq('id', source.id)
            .single()
          const empties = ((cur?.consecutive_empty_fetches as number) ?? 0) + 1
          const update: Record<string, unknown> = {
            status: 'active',
            last_fetched_at: new Date().toISOString(),
            last_error: 'fetched 0 items (silent zero)',
            consecutive_empty_fetches: empties,
          }
          if (empties >= 8) {
            update.auto_paused = true
            update.auto_paused_reason = `${empties} consecutive empty fetches (no items returned)`.slice(0, 500)
          }
          console.warn(`Source ${source.name} returned 0 items (empty streak: ${empties})`)
          await supabase.from('news_sources').update(update).eq('id', source.id)
        } else {
          await supabase.from('news_sources').update({
            status: 'active',
            last_fetched_at: new Date().toISOString(),
            last_successful_fetch: new Date().toISOString(),
            last_error: null,
            consecutive_failures: 0,
            consecutive_empty_fetches: 0,
            backoff_until: null,
          }).eq('id', source.id)
        }
      } catch (e) {
        // Failure: exponential backoff (5min * 2^n, capped at 24h),
        // auto-pause after 8 consecutive failures.
        const { data: current } = await supabase
          .from('news_sources')
          .select('consecutive_failures')
          .eq('id', source.id)
          .single()
        const failures = ((current?.consecutive_failures as number) ?? 0) + 1
        const backoffMs = Math.min(
          5 * 60 * 1000 * Math.pow(2, failures - 1),
          24 * 60 * 60 * 1000,
        )
        const update: Record<string, unknown> = {
          status: 'error',
          last_error: (e as Error).message,
          consecutive_failures: failures,
          backoff_until: new Date(Date.now() + backoffMs).toISOString(),
        }
        if (failures >= 8) {
          update.auto_paused = true
          update.auto_paused_reason = `${failures} consecutive failures: ${(e as Error).message}`.slice(0, 500)
        }
        console.error(`Error fetching from source ${source.name} (attempt ${failures}):`, (e as Error).message)
        await supabase.from('news_sources').update(update).eq('id', source.id)
      }
    }

    if (skippedForTime > 0) {
      console.log(`source-rss-news: hit 120s budget, skipped ${skippedForTime} feed(s) — they rotate to next run`)
    }
    if (skippedForBytes > 0) {
      console.log(`source-rss-news: hit ${RUN_BYTE_BUDGET} byte budget after ${bytesParsed}, skipped ${skippedForBytes} feed(s) — they rotate to next run`)
    }
    if (skippedForItems > 0) {
      console.log(`source-rss-news: hit ${RUN_ITEM_BUDGET} item budget at ${allItems.length}, skipped ${skippedForItems} feed(s) — they rotate to next run`)
    }

    return allItems
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data
    return {
      entityType: 'news_article',
      sourceId: raw.sourceId,
      sourceName: (d.source_name as string) || 'rss-news',
      name: cleanText(d.title as string || ''),
      description: cleanText(d.content as string || d.description as string || ''),
      urls: d.url ? [String(d.url)] : [],
      images: d.image_url ? [String(d.image_url)] : d.image ? [String(d.image)] : [],
      dates: { start: normalizeDate(d.published_at || d.publishedAt || d.pubDate) },
      tags: extractTags(d.title as string || '', d.content as string || ''),
      metadata: {
        author: typeof d.author === 'string' ? stripLoneSurrogates(d.author) : d.author,
        source_id: d.source_id,
        source_name: d.source_name,
        excerpt: excerptOf(cleanText(d.excerpt as string || d.description as string || '')),
        published_at: normalizeDate(d.published_at || d.publishedAt || d.pubDate),
        url: d.url,
        image_url: d.image_url || d.image,
        media_type: (d.media_type as string) || 'article',
        audio_url: d.audio_url,
        duration_seconds: d.duration_seconds,
      },
    }
  },

  getSourceId(raw: RawItem): string {
    return raw.sourceId
  },
}

// ─── API Fetchers ────────────────────────────────────────────

function getApiNameFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    if (hostname === 'newsapi.org') return 'newsapi'
    if (hostname === 'newsdata.io') return 'newsdata'
    if (hostname === 'gnews.io') return 'gnews'
    if (hostname === 'thenewsapi.com') return 'thenewsapi'
    return null
  } catch {
    return null
  }
}

function detectApiName(url: string): string | null {
  return getApiNameFromUrl(url)
}

// RETIRED PATH — all four aggregator rows were set is_active=false by
// 20280417125946, so nothing below currently runs. It is kept rather than
// deleted because the admin UI (NewsSourcesManager.tsx) toggles is_active with
// one click, and whoever flips one back on should meet these two defects here
// rather than rediscover them from the corpus:
//
//   1. `news_sources.keywords` IS NEVER READ. Every aggregator row carries a
//      curated array — NewsData's names "Sexual Orientation" and "Christopher
//      Street Day", NewsAPI's names "hiv" and "aids" — and news_sources_eligible
//      RETURNS the column. The NewsSource interface at the top of this file
//      omits it, so it is dropped at the type boundary before any fetcher sees
//      it. The per-source curation has never had any effect.
//
//   2. WHAT IS SENT INSTEAD is `LGBTQ_KEYWORDS.slice(0, 5)`, identical for all
//      four: `lgbtq OR lgbt OR gay OR lesbian OR trans`. That is simultaneously
//      too loose and too narrow — bare "gay" and "trans" match namesakes and
//      prefixes, while the five-term slice omits queer (this site's own name),
//      pride, nonbinary, bisexual, drag, rainbow and same-sex, so those
//      identities were never searched for at all.
//
// Reviving one means fixing both first. Context for whether it is worth it: the
// quality gate rejected 8,338 of the 14,838 articles these produced (56%, none
// of them indexable), and monthly volume rose after they stopped.
async function fetchFromApi(source: NewsSource, sinceHours: number): Promise<Record<string, unknown>[]> {
  const url = source.url
  const since = new Date(Date.now() - sinceHours * 3600000).toISOString()
  const apiName = getApiNameFromUrl(url)

  if (apiName === 'newsapi') return fetchNewsApi(url, since)
  if (apiName === 'newsdata') return fetchNewsData(url)
  if (apiName === 'gnews') return fetchGNews(url)
  if (apiName === 'thenewsapi') return fetchTheNewsApi(url)
  return []
}

async function fetchNewsApi(baseUrl: string, since: string): Promise<Record<string, unknown>[]> {
  const apiKey = Deno.env.get('NEWS_API_KEY')
  if (!apiKey) throw new Error('NEWS_API_KEY not configured')
  const query = LGBTQ_KEYWORDS.slice(0, 5).join(' OR ')
  const url = `${baseUrl}?apiKey=${apiKey}&q=${encodeURIComponent(query)}&from=${since}&sortBy=publishedAt&pageSize=50`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`NewsAPI ${res.status}`)
  const json = await res.json()
  return (json.articles || []).map((a: Record<string, unknown>) => ({
    title: a.title, content: a.content || a.description, url: a.url,
    image_url: a.urlToImage, author: a.author,
    published_at: a.publishedAt, excerpt: a.description,
  }))
}

async function fetchNewsData(baseUrl: string): Promise<Record<string, unknown>[]> {
  const apiKey = Deno.env.get('NEWSDATA_API_KEY')
  if (!apiKey) throw new Error('NEWSDATA_API_KEY not configured')
  const query = LGBTQ_KEYWORDS.slice(0, 5).join(' OR ')
  const url = `${baseUrl}?apikey=${apiKey}&q=${encodeURIComponent(query)}&language=en`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`NewsData ${res.status}`)
  const json = await res.json()
  return (json.results || []).map((a: Record<string, unknown>) => ({
    title: a.title, content: a.content || a.description, url: a.link,
    image_url: a.image_url, author: a.creator,
    published_at: a.pubDate, excerpt: a.description,
  }))
}

async function fetchGNews(baseUrl: string): Promise<Record<string, unknown>[]> {
  const apiKey = Deno.env.get('GNEWS_API_KEY')
  if (!apiKey) throw new Error('GNEWS_API_KEY not configured')
  const query = LGBTQ_KEYWORDS.slice(0, 5).join(' OR ')
  const url = `${baseUrl}?token=${apiKey}&q=${encodeURIComponent(query)}&lang=en&max=50`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GNews ${res.status}`)
  const json = await res.json()
  return (json.articles || []).map((a: Record<string, unknown>) => ({
    title: a.title, content: a.content || a.description, url: a.url,
    image_url: a.image, author: (a.source as Record<string, unknown>)?.name,
    published_at: a.publishedAt, excerpt: a.description,
  }))
}

async function fetchTheNewsApi(baseUrl: string): Promise<Record<string, unknown>[]> {
  const apiKey = Deno.env.get('THENEWSAPI_API_KEY')
  if (!apiKey) throw new Error('THENEWSAPI_API_KEY not configured')
  const query = LGBTQ_KEYWORDS.slice(0, 5).join(' OR ')
  const url = `${baseUrl}?api_token=${apiKey}&search=${encodeURIComponent(query)}&language=en&limit=50`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TheNewsAPI ${res.status}`)
  const json = await res.json()
  return (json.data || []).map((a: Record<string, unknown>) => ({
    title: a.title, content: a.description || a.snippet, url: a.url,
    image_url: a.image_url, author: a.source,
    published_at: a.published_at, excerpt: a.snippet || a.description,
  }))
}

// Recent Wikinews articles for a category page URL: newest-categorized page of
// members, then per-page extract/image/first-revision-date via the MediaWiki API.
async function fetchRecentWikinews(url: string, maxArticles: number): Promise<Record<string, unknown>[]> {
  const target = parseWikinewsCategoryUrl(url)
  const { pageIds } = await fetchWikinewsCategoryPage(target, { limit: Math.min(maxArticles, 50) })
  return fetchWikinewsArticles(target, pageIds)
}

async function fetchFromRss(
  feedUrl: string,
  isPodcast = false,
  maxItems = Number.POSITIVE_INFINITY,
): Promise<{ items: Record<string, unknown>[]; bytes: number }> {
  // Throw on failure so the caller's catch can register the failure
  // (consecutive_failures + backoff_until). Returning [] silently would
  // mask flapping feeds and never trip auto-pause.
  assertPublicHttpUrl(feedUrl) // feed URLs are admin/DB-supplied — refuse private targets
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    let res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'QueerGuide/1.0 NewsBot' },
      signal: controller.signal,
    })
    if (res.status === 403) {
      // Some publishers (e.g. GLAAD) 403 obvious bot UAs but serve browsers.
      // One honest-UA attempt first, then a single browser-UA fallback.
      await res.body?.cancel()
      res = await fetch(feedUrl, {
        headers: { 'User-Agent': BROWSER_UA },
        signal: controller.signal,
      })
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    // Bound the body: parseRssItems parses the whole feed (maxArticles only
    // slices afterwards), so a huge podcast-archive feed OOMs/CPU-limits the
    // worker → HTTP 546 kills the entire run. Feeds over the cap are read up
    // to the budget and TRUNCATED, not failed: RSS is newest-first, so the
    // prefix holds the newest items, and the regex item parser simply drops
    // the incomplete trailing block. (Hard-failing here auto-paused four
    // legitimate podcast feeds whose full archives exceed 4 MB.)
    const xml = await readCapped(res, MAX_FEED_BYTES)
    // Report the parsed size so the caller can enforce a per-RUN byte budget.
    // The per-feed cap alone cannot bound a run: 30 feeds each just under the
    // cap is still ~120 MB of parsing.
    return { items: parseRssItems(xml, isPodcast, maxItems), bytes: xml.length }
  } finally {
    clearTimeout(timeout)
  }
}

// 4 MB: legitimate RSS/podcast feeds are almost always < 2 MB. Keeping the cap
// tight bounds per-feed parse cost (parseRssItems is O(feed size)), which —
// summed across a run of feeds — is what pushes the worker into HTTP 546.
const MAX_FEED_BYTES = 4 * 1024 * 1024

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return await res.text()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      const room = maxBytes - total
      if (value.byteLength >= room) {
        chunks.push(value.subarray(0, room))
        total += room
        await reader.cancel()
        break
      }
      total += value.byteLength
      chunks.push(value)
    }
  }
  const merged = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { merged.set(c, off); off += c.byteLength }
  // stream:true tolerates a multi-byte UTF-8 sequence cut at the byte budget.
  return new TextDecoder('utf-8').decode(merged, { stream: true })
}

// ─── Utilities ──────────────────────

function normalizeDate(val: unknown): string | null {
  if (!val) return null
  try { const d = new Date(String(val)); return isNaN(d.getTime()) ? null : d.toISOString() } catch { return null }
}

function extractTags(title: string, content: string): string[] {
  const text = `${title} ${content}`.toLowerCase()
  return LGBTQ_KEYWORDS.filter(kw => text.includes(kw)).slice(0, 5)
}

// ─── Wikinews backfill ───────────────────────────────────────

async function handleWikinewsBackfill(
  supabase: ReturnType<typeof getServiceClient>,
  body: Record<string, unknown>,
  config: AdapterConfig,
  req: Request,
): Promise<Response> {
  const sourceId = String(body.wikinews_backfill_source_id)
  const cmcontinue = (body.cmcontinue as string | undefined) ?? null
  const limit = Math.min(Number(body.limit) || 50, 500)

  const { data: source, error } = await supabase
    .from('news_sources')
    .select('id, name, url')
    .eq('id', sourceId)
    .single()
  if (error || !source) {
    return errorResponse(`Wikinews source not found: ${sourceId}`, 404, req)
  }
  if (!isWikinewsHost(source.url)) {
    return errorResponse(`Source ${sourceId} is not a Wikinews source`, 400, req)
  }

  const target = parseWikinewsCategoryUrl(source.url)
  const page = await fetchWikinewsCategoryPage(target, { limit, cmcontinue })
  const articles = await fetchWikinewsArticles(target, page.pageIds)

  const rawItems: RawItem[] = articles.map((article, i) => ({
    sourceId: (article.url as string) || `${source.id}-backfill-${Date.now()}-${i}`,
    data: { ...article, source_id: source.id, source_name: source.name },
  }))

  let written = 0
  if (!config.dryRun && rawItems.length > 0) {
    written = await writeToStaging(supabase, rssNewsAdapter, rawItems, {
      ...config,
      targetTable: 'news_articles',
    })
  }

  return jsonResponse({
    success: true,
    items: config.dryRun ? rawItems.length : written,
    items_total: rawItems.length,
    page_ids: page.pageIds.length,
    cmcontinue: page.cmcontinue,
    done: page.cmcontinue === null,
    dry_run: config.dryRun,
  }, 200, req)
}

// ─── HTTP Handler ────────────────────────────────────────────

Deno.serve(withErrorReporting('source-rss-news', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.batch_size || 100,
      // 40/source (was 100): with up to 50 feeds, 100 kept ~5000 article bodies
      // in memory at once, contributing to the intermittent HTTP 546
      // (WORKER_LIMIT) that killed runs at ~64s. Recent items are what matter
      // for an hourly feed; older ones are already captured by prior runs.
      // max_feeds_per_run: per-invocation feed cap (default 15, clamped ≤30) —
      // see DEFAULT_MAX_FEEDS_PER_RUN above.
      filters: {
        maxArticles: body.maxArticles || 40,
        sinceHours: body.sinceHours || 24,
        maxFeedsPerRun: body.max_feeds_per_run,
      },
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }

    // Wikinews historical backfill: paginate one Category:LGBT page (≤50) for a
    // single source per call and return the next cmcontinue cursor. The driver
    // (scripts/import-wikinews-history.mjs) threads cmcontinue until exhausted.
    // Staged rows are processed by the normal news pipeline crons.
    if (body.wikinews_backfill_source_id) {
      return await handleWikinewsBackfill(supabase, body, config, req)
    }

    const rawItems = await rssNewsAdapter.fetch(config)

    if (config.dryRun) {
      return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    }

    const written = await writeToStaging(supabase, rssNewsAdapter, rawItems, {
      ...config,
      targetTable: 'news_articles',
    })

    return jsonResponse({
      success: true,
      items: written,
      items_total: rawItems.length,
      items_processed: written,
      items_succeeded: written,
      items_failed: 0,
    }, 200, req)
  } catch (error) {
    console.error('source-rss-news error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
