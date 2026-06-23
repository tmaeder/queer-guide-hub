import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'
import { parseRssItems, cleanText } from './rss-parse.ts'

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
    const { data: sources, error } = await supabase.rpc('news_sources_eligible', {
      p_limit: 100,
    })

    if (error || !sources || sources.length === 0) {
      console.log('No eligible news sources')
      return []
    }

    const allItems: RawItem[] = []

    for (const source of sources as NewsSource[]) {
      try {
        await supabase.from('news_sources').update({ status: 'processing' }).eq('id', source.id)

        let articles: Record<string, unknown>[] = []
        const apiName = detectApiName(source.url)

        if (apiName) {
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
    const xml = await res.text()
    return parseRssItems(xml, isPodcast)
  } finally {
    clearTimeout(timeout)
  }
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

// ─── HTTP Handler ────────────────────────────────────────────

Deno.serve(withErrorReporting('source-rss-news', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.batch_size || 100,
      filters: { maxArticles: body.maxArticles || 100, sinceHours: body.sinceHours || 24 },
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
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
