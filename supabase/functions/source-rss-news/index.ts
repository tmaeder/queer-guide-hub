import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'
import { parseRssItems, cleanText } from './rss-parse.ts'
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
    // Cap 30/run: at ~90+ eligible sources a single invocation hit the edge
    // worker resource limit (HTTP 546) on alternating hourly runs (2026-07).
    // Cumulative feed-parse cost is the constraint, so keep the per-run set
    // small; last_fetched_at ASC ordering rotates the remainder into the next
    // run so coverage isn't lost.
    const { data: sources, error } = await supabase.rpc('news_sources_eligible', {
      p_limit: 30,
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

    for (const source of sources as NewsSource[]) {
      if (Date.now() > deadlineAt) { skippedForTime++; continue }
      try {
        await supabase.from('news_sources').update({ status: 'processing' }).eq('id', source.id)

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
          articles = await fetchFromRss(source.url, source.feed_type === 'podcast')
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
        author: d.author,
        source_id: d.source_id,
        source_name: d.source_name,
        excerpt: cleanText(d.excerpt as string || d.description as string || '').slice(0, 500),
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

async function fetchFromRss(feedUrl: string, isPodcast = false): Promise<Record<string, unknown>[]> {
  // Throw on failure so the caller's catch can register the failure
  // (consecutive_failures + backoff_until). Returning [] silently would
  // mask flapping feeds and never trip auto-pause.
  assertPublicHttpUrl(feedUrl) // feed URLs are admin/DB-supplied — refuse private targets
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'QueerGuide/1.0 NewsBot' },
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    // Bound the body BEFORE reading it. parseRssItems parses the whole feed
    // (maxArticles only slices afterwards), so a huge podcast-archive feed
    // OOMs/CPU-limits the worker → HTTP 546 kills the entire run. Skip such a
    // feed (throws → backoff) rather than letting it take down every source.
    const declared = Number(res.headers.get('content-length') ?? '0')
    if (declared > MAX_FEED_BYTES) {
      throw new Error(`feed too large: ${declared} bytes (cap ${MAX_FEED_BYTES})`)
    }
    // Stream with a hard byte budget for feeds that don't declare a length.
    const xml = await readCapped(res, MAX_FEED_BYTES)
    return parseRssItems(xml, isPodcast)
  } finally {
    clearTimeout(timeout)
  }
}

// 4 MB: legitimate RSS/podcast feeds are almost always < 2 MB. Keeping the cap
// tight bounds per-feed parse cost (parseRssItems is O(feed size)), which —
// summed across a run of feeds — is what pushes the worker into HTTP 546.
const MAX_FEED_BYTES = 4 * 1024 * 1024

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return await res.text()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new Error(`feed too large: exceeded ${maxBytes} bytes while streaming`)
      }
      chunks.push(value)
    }
  }
  const merged = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { merged.set(c, off); off += c.byteLength }
  return new TextDecoder('utf-8').decode(merged)
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
      filters: { maxArticles: body.maxArticles || 40, sinceHours: body.sinceHours || 24 },
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
