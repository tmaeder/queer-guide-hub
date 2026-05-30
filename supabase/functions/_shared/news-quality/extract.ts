import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'

// Readability-lite: recover full article body + metadata from a fetched HTML page.
// Pure + deterministic given (html, url). No network — the caller fetches.
// Strategy, in priority order:
//   1. JSON-LD NewsArticle/Article (articleBody, author, datePublished, image)
//   2. <article> / [role=main] / largest <p>-dense container
// Metadata (author, date, image, lang) falls back across JSON-LD → meta tags → DOM.

export type ExtractMethod = 'jsonld' | 'article' | 'main' | 'density' | 'none'

export interface ExtractedArticle {
  content: string          // plain-text paragraphs joined by \n\n ('' if nothing found)
  author: string | null
  publishedAt: string | null  // ISO 8601 or null
  imageUrl: string | null
  lang: string | null      // BCP-47 primary subtag, lowercased (e.g. 'en', 'de')
  method: ExtractMethod
  charCount: number
}

const NOISE_SELECTOR = [
  'script', 'style', 'noscript', 'template', 'iframe', 'svg', 'form',
  'nav', 'header', 'footer', 'aside',
  '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
  '[aria-hidden="true"]',
  '.ad', '.ads', '.advert', '.advertisement', '.share', '.social',
  '.newsletter', '.related', '.recommended', '.comments', '.comment',
  '.cookie', '.consent', '.subscribe', '.paywall', '.promo', '.sidebar',
  'figure figcaption',
].join(',')

function firstNonEmpty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    const s = (v ?? '').toString().trim()
    if (s) return s
  }
  return null
}

function normalizeIsoDate(v: unknown): string | null {
  const s = (v ?? '').toString().trim()
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function langPrimary(v: unknown): string | null {
  const s = (v ?? '').toString().trim().toLowerCase()
  if (!s) return null
  const m = s.match(/^[a-z]{2,3}/)
  return m ? m[0] : null
}

function absolutize(src: string | null, baseUrl: string): string | null {
  if (!src) return null
  try { return new URL(src, baseUrl).toString() } catch { return src }
}

// Collect every JSON-LD object (flattening @graph / arrays) into a flat list.
function collectJsonLd($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  $('script[type="application/ld+json"]').each((_i, el) => {
    const raw = $(el).contents().text().trim()
    if (!raw) return
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { return }
    const stack = [parsed]
    while (stack.length) {
      const node = stack.pop()
      if (Array.isArray(node)) { stack.push(...node); continue }
      if (node && typeof node === 'object') {
        const obj = node as Record<string, unknown>
        out.push(obj)
        if (Array.isArray(obj['@graph'])) stack.push(...(obj['@graph'] as unknown[]))
      }
    }
  })
  return out
}

function jsonLdAuthor(node: Record<string, unknown>): string | null {
  const a = node.author
  if (!a) return null
  if (typeof a === 'string') return a.trim() || null
  if (Array.isArray(a)) {
    const names = a.map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>).name : x))
      .map((n) => (n ?? '').toString().trim()).filter(Boolean)
    return names.length ? names.join(', ') : null
  }
  if (typeof a === 'object') {
    const n = (a as Record<string, unknown>).name
    return n ? n.toString().trim() || null : null
  }
  return null
}

function jsonLdImage(node: Record<string, unknown>): string | null {
  const img = node.image
  if (!img) return null
  if (typeof img === 'string') return img
  if (Array.isArray(img) && img.length) {
    const first = img[0]
    return typeof first === 'string' ? first : ((first as Record<string, unknown>)?.url as string) ?? null
  }
  if (typeof img === 'object') return ((img as Record<string, unknown>).url as string) ?? null
  return null
}

const ARTICLE_TYPES = new Set([
  'NewsArticle', 'Article', 'ReportageNewsArticle', 'BlogPosting', 'OpinionNewsArticle',
])

function isArticleNode(node: Record<string, unknown>): boolean {
  const t = node['@type']
  if (!t) return false
  if (typeof t === 'string') return ARTICLE_TYPES.has(t)
  if (Array.isArray(t)) return t.some((x) => ARTICLE_TYPES.has(String(x)))
  return false
}

// Convert a cheerio element subtree to readable plain text: one paragraph per
// block element, collapsed whitespace, joined by blank lines.
function elementToText($: cheerio.CheerioAPI, el: cheerio.Element): string {
  const parts: string[] = []
  $(el).find('p, h1, h2, h3, h4, li, blockquote').each((_i, node) => {
    const t = $(node).text().replace(/\s+/g, ' ').trim()
    if (t.length >= 2) parts.push(t)
  })
  // Fallback: no block children — take the container's own text.
  if (parts.length === 0) {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (t) parts.push(t)
  }
  // De-dupe consecutive identical paragraphs (common with templated markup).
  const deduped: string[] = []
  for (const p of parts) if (p !== deduped[deduped.length - 1]) deduped.push(p)
  return deduped.join('\n\n').trim()
}

export function extractArticle(html: string, url: string): ExtractedArticle {
  const result: ExtractedArticle = {
    content: '', author: null, publishedAt: null, imageUrl: null,
    lang: null, method: 'none', charCount: 0,
  }
  if (!html || html.length < 50) return result

  const $ = cheerio.load(html)

  // ---- Metadata (independent of body strategy) ----
  const ld = collectJsonLd($)
  const articleLd = ld.find(isArticleNode) ?? null

  result.author = firstNonEmpty(
    articleLd ? jsonLdAuthor(articleLd) : null,
    $('meta[name="author"]').attr('content'),
    $('meta[property="article:author"]').attr('content'),
    $('[rel="author"]').first().text(),
    $('.byline, .author, .c-byline__author').first().text(),
  )

  result.publishedAt = normalizeIsoDate(firstNonEmpty(
    articleLd ? (articleLd.datePublished as string) : null,
    $('meta[property="article:published_time"]').attr('content'),
    $('meta[name="date"]').attr('content'),
    $('meta[itemprop="datePublished"]').attr('content'),
    $('time[datetime]').first().attr('datetime'),
  ))

  result.imageUrl = absolutize(firstNonEmpty(
    $('meta[property="og:image"]').attr('content'),
    $('meta[name="twitter:image"]').attr('content'),
    articleLd ? jsonLdImage(articleLd) : null,
  ), url)

  result.lang = langPrimary(firstNonEmpty(
    $('html').attr('lang'),
    $('meta[property="og:locale"]').attr('content'),
    $('meta[http-equiv="content-language"]').attr('content'),
  ))

  // ---- Body strategy 1: JSON-LD articleBody ----
  if (articleLd && typeof articleLd.articleBody === 'string') {
    const body = (articleLd.articleBody as string).replace(/\r\n/g, '\n').trim()
    if (body.length >= 200) {
      result.content = body
      result.method = 'jsonld'
      result.charCount = body.length
      return result
    }
  }

  // Strip noise once, reused by DOM strategies.
  $(NOISE_SELECTOR).remove()

  // ---- Body strategy 2: <article> ----
  const articleEl = $('article').toArray()
    .map((el) => ({ el, text: elementToText($, el) }))
    .sort((a, b) => b.text.length - a.text.length)[0]
  if (articleEl && articleEl.text.length >= 250) {
    result.content = articleEl.text
    result.method = 'article'
    result.charCount = articleEl.text.length
    return result
  }

  // ---- Body strategy 3: [role=main] / <main> ----
  const mainEl = $('main, [role="main"]').toArray()
    .map((el) => ({ el, text: elementToText($, el) }))
    .sort((a, b) => b.text.length - a.text.length)[0]
  if (mainEl && mainEl.text.length >= 250) {
    result.content = mainEl.text
    result.method = 'main'
    result.charCount = mainEl.text.length
    return result
  }

  // ---- Body strategy 4: densest <p>-cluster container ----
  const scores = new Map<cheerio.Element, number>()
  $('p').each((_i, p) => {
    const len = $(p).text().replace(/\s+/g, ' ').trim().length
    if (len < 40) return
    const parent = $(p).parent().get(0)
    if (!parent) return
    scores.set(parent, (scores.get(parent) ?? 0) + len)
  })
  let best: cheerio.Element | null = null
  let bestScore = 0
  for (const [el, score] of scores) {
    if (score > bestScore) { bestScore = score; best = el }
  }
  if (best && bestScore >= 250) {
    const text = elementToText($, best)
    if (text.length >= 250) {
      result.content = text
      result.method = 'density'
      result.charCount = text.length
      return result
    }
  }

  return result
}
