// Image replacement helpers — used by pipeline-quality-enhance when the
// source article's image fails the probe or is judged unusable by the LLM.
//
// Strategy (in order):
//   1. Open Graph / Twitter card scrape from the article URL itself
//   2. Unsplash search keyed on the article tags + title nouns (if UNSPLASH_ACCESS_KEY set)
//
// Returns null if nothing usable was found. Caller must respect the
// `news_quality_settings.image_replacement_enabled` flag before invoking.

import { probeImage, type ImageProbe } from './image-check.ts'

export interface ReplacementResult {
  imageUrl: string
  source: 'og' | 'twitter' | 'unsplash'
  attribution: string | null
  probe: ImageProbe
}

const META_TAG_RE = /<meta[^>]+>/gi
const PROP_RE     = /(?:property|name)\s*=\s*["']([^"']+)["']/i
const CONTENT_RE  = /content\s*=\s*["']([^"']+)["']/i

function pickMeta(html: string, names: string[]): string | null {
  const tags = html.match(META_TAG_RE) ?? []
  for (const tag of tags) {
    const prop = tag.match(PROP_RE)?.[1]?.toLowerCase()
    if (!prop || !names.includes(prop)) continue
    const content = tag.match(CONTENT_RE)?.[1]
    if (content && content.startsWith('http')) return content
  }
  return null
}

/** Fetch the source HTML and extract og:image / twitter:image. Returns null on failure. */
export async function scrapeSocialCardImage(
  articleUrl: string,
  signal?: AbortSignal,
): Promise<{ imageUrl: string; source: 'og' | 'twitter' } | null> {
  if (!articleUrl || !/^https?:\/\//i.test(articleUrl)) return null
  try {
    const res = await fetch(articleUrl, {
      method: 'GET',
      signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'queer.guide/news-quality (+https://queer.guide)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) return null
    // Limit how much HTML we read — meta tags are always near the top.
    const reader = res.body?.getReader()
    if (!reader) return null
    const decoder = new TextDecoder()
    let html = ''
    let total = 0
    while (total < 64_000) {
      const { value, done } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      total += value.byteLength
      if (html.includes('</head>')) break
    }
    try { await reader.cancel() } catch { /* ignore */ }

    const og = pickMeta(html, ['og:image', 'og:image:url', 'og:image:secure_url'])
    if (og) return { imageUrl: og, source: 'og' }
    const tw = pickMeta(html, ['twitter:image', 'twitter:image:src'])
    if (tw) return { imageUrl: tw, source: 'twitter' }
    return null
  } catch {
    return null
  }
}

/** Search Unsplash for an article-relevant photo. Requires UNSPLASH_ACCESS_KEY. */
export async function searchUnsplash(
  query: string,
  signal?: AbortSignal,
): Promise<{ imageUrl: string; attribution: string } | null> {
  const key = Deno.env.get('UNSPLASH_ACCESS_KEY')
  if (!key) return null
  const q = query.trim().slice(0, 100)
  if (!q) return null
  try {
    const url = `https://api.unsplash.com/search/photos?per_page=3&orientation=landscape&content_filter=high&query=${encodeURIComponent(q)}`
    const res = await fetch(url, {
      method: 'GET',
      signal,
      headers: {
        Authorization: `Client-ID ${key}`,
        'Accept-Version': 'v1',
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      results?: Array<{
        urls?: { regular?: string }
        user?: { name?: string; links?: { html?: string } }
        links?: { html?: string }
      }>
    }
    const hit = data.results?.[0]
    const photoUrl = hit?.urls?.regular
    if (!photoUrl) return null
    const author = hit?.user?.name ?? 'Unsplash'
    const photoLink = hit?.links?.html ?? 'https://unsplash.com'
    const attribution = `Photo by ${author} on Unsplash (${photoLink})`
    return { imageUrl: photoUrl, attribution }
  } catch {
    return null
  }
}

export interface ReplacementInput {
  articleUrl?: string
  query: string // tags + title — used for Unsplash search
  signal?: AbortSignal
}

/** Try OG card → Unsplash. Probes each candidate; returns the first usable result. */
export async function findReplacementImage(
  input: ReplacementInput,
): Promise<ReplacementResult | null> {
  // 1. OG / twitter card from the source URL.
  if (input.articleUrl) {
    const social = await scrapeSocialCardImage(input.articleUrl, input.signal)
    if (social) {
      const probe = await probeImage(social.imageUrl, input.signal)
      if (probe.ok) {
        return { imageUrl: social.imageUrl, source: social.source, attribution: null, probe }
      }
    }
  }

  // 2. Unsplash search.
  const unsplash = await searchUnsplash(input.query, input.signal)
  if (unsplash) {
    const probe = await probeImage(unsplash.imageUrl, input.signal)
    if (probe.ok) {
      return { imageUrl: unsplash.imageUrl, source: 'unsplash', attribution: unsplash.attribution, probe }
    }
  }

  return null
}

// Exposed for tests.
export const _internals = { pickMeta, scrapeSocialCardImage, searchUnsplash }
