// Wikinews (MediaWiki) source helper.
//
// Wikinews has no usable per-category RSS feed — its RecentChangesLinked feed
// for Category:LGBT comes back empty — so LGBT articles are pulled via the
// MediaWiki Action API instead:
//   * list=categorymembers  → enumerate Category:LGBT articles (paginated via
//     cmcontinue; this is how the full historical archive is walked)
//   * prop=extracts|pageimages|revisions|info → article text, lead image, the
//     FIRST-revision timestamp (= the Wikinews publication date) and canonical URL
//
// The records returned here match the shape source-rss-news's RSS parser
// produces, so Wikinews items flow through the same
// normalize → sanitize → enrich → dedup → quality → commit pipeline unchanged.
//
// Content is CC BY 2.5: each record carries author/publisher "Wikinews" and the
// canonical article URL is preserved as the required backlink.

import { assertPublicHttpUrl } from './ssrf-guard.ts'

const USER_AGENT = 'QueerGuide/1.0 NewsBot (https://queer.guide)'
const FETCH_TIMEOUT_MS = 20_000
// MediaWiki caps prop=extracts at 20 pages per request.
const EXTRACT_BATCH = 20

export interface WikinewsTarget {
  apiBase: string // e.g. https://en.wikinews.org/w/api.php
  category: string // e.g. Category:LGBT
}

export function isWikinewsHost(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).hostname.toLowerCase().endsWith('wikinews.org')
  } catch {
    return false
  }
}

// Parse the human category-page URL stored in news_sources.url into the API
// endpoint + category title. Accepts e.g.
//   https://en.wikinews.org/wiki/Category:LGBT
//   https://en.wikinews.org/wiki/Category%3ALGBT
//   https://en.wikinews.org/w/index.php?title=Category:LGBT
export function parseWikinewsCategoryUrl(rawUrl: string): WikinewsTarget {
  const u = new URL(rawUrl)
  if (!u.hostname.toLowerCase().endsWith('wikinews.org')) {
    throw new Error(`Not a Wikinews URL: ${rawUrl}`)
  }
  const fromTitleParam = u.searchParams.get('title')
  const pathMatch = /\/wiki\/(.+)$/.exec(u.pathname)
  let category = fromTitleParam
    ? fromTitleParam
    : pathMatch
    ? decodeURIComponent(pathMatch[1])
    : 'Category:LGBT'
  if (!/^category:/i.test(category)) category = `Category:${category}`
  return { apiBase: `${u.protocol}//${u.hostname}/w/api.php`, category }
}

async function apiGet(url: string): Promise<Record<string, unknown>> {
  assertPublicHttpUrl(url) // constructed from DB-supplied URL — refuse private targets
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Wikinews API HTTP ${res.status} ${res.statusText}`)
    return (await res.json()) as Record<string, unknown>
  } finally {
    clearTimeout(timeout)
  }
}

export interface CategoryPage {
  pageIds: number[]
  cmcontinue: string | null
}

// One page (≤limit, hard-capped at 500) of category members, newest
// categorization first. cmnamespace=0 keeps only main-namespace articles,
// dropping Comments:/sub-category noise.
export async function fetchWikinewsCategoryPage(
  target: WikinewsTarget,
  opts: { limit?: number; cmcontinue?: string | null } = {},
): Promise<CategoryPage> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500)
  const params = new URLSearchParams({
    action: 'query',
    list: 'categorymembers',
    cmtitle: target.category,
    cmnamespace: '0',
    cmsort: 'timestamp',
    cmdir: 'desc',
    cmprop: 'ids|title|timestamp',
    cmlimit: String(limit),
    format: 'json',
    formatversion: '2',
  })
  if (opts.cmcontinue) params.set('cmcontinue', opts.cmcontinue)
  const json = await apiGet(`${target.apiBase}?${params.toString()}`)
  const query = (json.query ?? {}) as Record<string, unknown>
  const members = (query.categorymembers ?? []) as Array<Record<string, unknown>>
  const pageIds = members
    .map((m) => m.pageid)
    .filter((id): id is number => typeof id === 'number')
  const cont = (json.continue ?? {}) as Record<string, unknown>
  const cmcontinue = typeof cont.cmcontinue === 'string' ? cont.cmcontinue : null
  return { pageIds, cmcontinue }
}

// Fetch + map a batch of page ids into the source-rss-news record shape.
// Chunks into ≤20-id requests to respect the extracts API limit. Note: revisions
// are NOT requested here — `rvlimit`/`rvdir` only work for single-page queries —
// so the publication date comes from the article's own dateline, with a
// per-page first-revision lookup as fallback for the rare extract-less page.
export async function fetchWikinewsArticles(
  target: WikinewsTarget,
  pageIds: number[],
): Promise<Record<string, unknown>[]> {
  if (pageIds.length === 0) return []
  const out: Record<string, unknown>[] = []
  for (let i = 0; i < pageIds.length; i += EXTRACT_BATCH) {
    const chunk = pageIds.slice(i, i + EXTRACT_BATCH)
    const params = new URLSearchParams({
      action: 'query',
      pageids: chunk.join('|'),
      prop: 'extracts|pageimages|info',
      explaintext: '1',
      exintro: '1', // intro only — the Wikinews lede. REQUIRED for batching:
      exlimit: 'max', // full-text extracts cap at 1 page/request; intro extracts allow up to 20.
      piprop: 'original',
      inprop: 'url',
      format: 'json',
      formatversion: '2',
    })
    const json = await apiGet(`${target.apiBase}?${params.toString()}`)
    const query = (json.query ?? {}) as Record<string, unknown>
    const pages = (query.pages ?? []) as Array<Record<string, unknown>>
    for (const p of pages) {
      const rec = mapWikinewsPage(p)
      if (!rec) continue
      // No dateline in the extract (rare): fall back to the page's first-revision
      // timestamp so historical articles keep their real publication date.
      if (!rec.published_at && typeof p.pageid === 'number') {
        rec.published_at = await fetchFirstRevisionTimestamp(target, p.pageid)
      }
      out.push(rec)
    }
  }
  return out
}

// First (oldest) revision timestamp for a single page. rvlimit/rvdir are only
// valid in single-page enumeration mode, hence the per-page call.
export async function fetchFirstRevisionTimestamp(
  target: WikinewsTarget,
  pageId: number,
): Promise<string | null> {
  const params = new URLSearchParams({
    action: 'query',
    pageids: String(pageId),
    prop: 'revisions',
    rvprop: 'timestamp',
    rvdir: 'newer',
    rvlimit: '1',
    format: 'json',
    formatversion: '2',
  })
  try {
    const json = await apiGet(`${target.apiBase}?${params.toString()}`)
    const query = (json.query ?? {}) as Record<string, unknown>
    const pages = (query.pages ?? []) as Array<Record<string, unknown>>
    const revs = Array.isArray(pages[0]?.revisions) ? (pages[0].revisions as Array<Record<string, unknown>>) : []
    return (revs[0]?.timestamp as string) ?? null
  } catch {
    return null
  }
}

// ── pure mapping (unit-tested, no I/O) ────────────────────────────────

// Wikinews bodies end with boilerplate sections we don't want in content or the
// excerpt. Cut everything from the first such heading onward.
const TAIL_SECTIONS = ['Sources', 'Related news', 'External links', 'References', 'Sister links']

export function stripArticleTail(text: string): string {
  if (!text) return ''
  let cut = text.length
  for (const heading of TAIL_SECTIONS) {
    const re = new RegExp(`(^|\\n)\\s*${heading}\\s*(\\n|$)`, 'i')
    const m = re.exec(text)
    if (m && m.index < cut) cut = m.index
  }
  return text.slice(0, cut).trim()
}

// Wikinews intros open with a dateline line ("Wednesday, October 23, 2013").
// Drop a leading dateline, then return the first paragraph (collapsed to a
// single line) as the excerpt.
export function firstParagraph(text: string): string {
  const body = text.replace(DATELINE_RE, '')
  const paras = body
    .split(/\n\s*\n/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  return paras[0] ?? ''
}

// The Wikinews dateline ("Tuesday, January 28, 2025") at the top of every
// published article — the authoritative editorial publication date.
const DATELINE_RE = /^\s*\w+day,\s+(\w+)\s+(\d{1,2}),\s+(\d{4})/i

export function parseDateline(extract: string): string | null {
  const m = DATELINE_RE.exec(extract ?? '')
  if (!m) return null
  const d = new Date(`${m[1]} ${m[2]}, ${m[3]} UTC`)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// MediaWiki's pageimages appends api utm tracking params to the image URL.
// Strip the query string so we store the clean Commons file URL.
function cleanImageUrl(url: string | null): string | null {
  if (!url) return null
  const q = url.indexOf('?')
  return q >= 0 ? url.slice(0, q) : url
}

// A formatversion=2 page object → a record matching parseRssItems() output.
// Returns null only for missing/redirect/untitled pages. `published_at` is the
// parsed dateline (may be null → the caller fills it from the first revision).
export function mapWikinewsPage(page: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!page || page.missing || !page.title) return null
  const extractRaw = typeof page.extract === 'string' ? page.extract : ''
  const published = parseDateline(extractRaw)
  const extract = stripArticleTail(extractRaw)
  const excerpt = firstParagraph(extract).slice(0, 500)
  const original = (page.original ?? {}) as Record<string, unknown>
  const thumbnail = (page.thumbnail ?? {}) as Record<string, unknown>
  const image = cleanImageUrl((original.source as string) ?? (thumbnail.source as string) ?? null)
  return {
    title: page.title,
    content: extract,
    excerpt,
    url: (page.canonicalurl as string) ?? (page.fullurl as string) ?? null,
    image_url: image,
    image_attribution: image ? 'Wikimedia Commons' : null,
    author: 'Wikinews',
    publisher_name: 'Wikinews',
    published_at: published,
  }
}
