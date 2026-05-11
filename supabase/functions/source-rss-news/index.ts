import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

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
}

const LGBTQ_KEYWORDS = ['lgbtq', 'lgbt', 'gay', 'lesbian', 'trans', 'transgender', 'bisexual', 'queer', 'pride', 'nonbinary', 'rainbow', 'drag', 'same-sex']

const rssNewsAdapter: SourceAdapter = {
  name: 'rss-news',
  entityType: 'news_article',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const supabase = getServiceClient()
    const maxArticles = (config.filters?.maxArticles as number) || 100
    const sinceHours = (config.filters?.sinceHours as number) || 24

    const { data: sources, error } = await supabase
      .from('news_sources')
      .select('*')
      .eq('is_active', true)

    if (error || !sources || sources.length === 0) {
      console.log('No active news sources found')
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
          articles = await fetchFromRss(source.url)
        }

        for (let i = 0; i < Math.min(articles.length, maxArticles); i++) {
          const article = articles[i]
          allItems.push({
            sourceId: (article.url as string) || `${source.id}-${Date.now()}-${i}`,
            data: { ...article, source_id: source.id, source_name: source.name },
          })
        }

        await supabase.from('news_sources').update({
          status: 'active',
          last_fetched_at: new Date().toISOString(),
          last_error: null,
        }).eq('id', source.id)
      } catch (e) {
        console.error(`Error fetching from source ${source.name}:`, (e as Error).message)
        await supabase.from('news_sources').update({
          status: 'error',
          last_error: (e as Error).message,
        }).eq('id', source.id)
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
      },
    }
  },

  getSourceId(raw: RawItem): string {
    return raw.sourceId
  },
}

// ─── API Fetchers ────────────────────────────────────────────

function detectApiName(url: string): string | null {
  if (url.includes('newsapi.org')) return 'newsapi'
  if (url.includes('newsdata.io')) return 'newsdata'
  if (url.includes('gnews.io')) return 'gnews'
  if (url.includes('thenewsapi.com')) return 'thenewsapi'
  return null
}

async function fetchFromApi(source: NewsSource, sinceHours: number): Promise<Record<string, unknown>[]> {
  const url = source.url
  const since = new Date(Date.now() - sinceHours * 3600000).toISOString()

  if (url.includes('newsapi.org')) return fetchNewsApi(url, since)
  if (url.includes('newsdata.io')) return fetchNewsData(url)
  if (url.includes('gnews.io')) return fetchGNews(url)
  if (url.includes('thenewsapi.com')) return fetchTheNewsApi(url)
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

async function fetchFromRss(feedUrl: string): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(feedUrl, { headers: { 'User-Agent': 'QueerGuide/1.0 NewsBot' } })
    if (!res.ok) return []
    const xml = await res.text()
    return parseRssItems(xml)
  } catch (e) {
    console.error(`RSS fetch error for ${feedUrl}:`, (e as Error).message)
    return []
  }
}

function parseRssItems(xml: string): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const title = extractTag(block, 'title')
    const link = extractTag(block, 'link') || extractTag(block, 'guid')
    const desc = extractTag(block, 'description') || extractTag(block, 'content:encoded')
    const pubDate = extractTag(block, 'pubDate')
    const author = extractTag(block, 'dc:creator') || extractTag(block, 'author')
    const image = extractMediaUrl(block)

    if (title && link) {
      items.push({
        title: cleanText(title), content: cleanText(desc || ''),
        url: link.trim(), image_url: image, author,
        published_at: pubDate, excerpt: cleanText(desc || '').slice(0, 500),
      })
    }
  }
  return items
}

function extractTag(xml: string, tag: string): string | null {
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i')
  const cdataMatch = cdataRe.exec(xml)
  if (cdataMatch) return cdataMatch[1]
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const m = re.exec(xml)
  return m ? m[1] : null
}

function extractMediaUrl(block: string): string | null {
  const mediaMatch = /url="([^"]+\.(jpg|jpeg|png|gif|webp)[^"]*)"/i.exec(block)
  if (mediaMatch) return mediaMatch[1]
  const encMatch = /<enclosure[^>]+url="([^"]+)"/i.exec(block)
  return encMatch ? encMatch[1] : null
}

// ─── Utilities ────────────────────────────────────────────

function cleanText(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '\u201c').replace(/&#8221;/g, '\u201d').replace(/&#8211;/g, '\u2013')
    .replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ')
    .replace(/The post .* appeared first on .*\./g, '')
    .replace(/Continue reading.*/g, '')
    .trim()
}

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
