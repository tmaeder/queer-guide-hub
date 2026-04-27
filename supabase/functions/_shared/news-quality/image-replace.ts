// Image replacement helpers — used by pipeline-quality-enhance when the
// source article's image fails the probe or is judged unusable by the LLM.
//
// Strategy (in order):
//   1. Open Graph / Twitter card scrape from the article URL itself
//   2. Pexels search keyed on the article tags + title nouns (if PEXELS_API_KEY set)
//
// Returns null if nothing usable was found. Caller must respect the
// `news_quality_settings.image_replacement_enabled` flag before invoking.

import { probeImage, type ImageProbe } from './image-check.ts'

export interface ReplacementResult {
  imageUrl: string
  source: 'og' | 'twitter' | 'pexels'
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

/** Search Pexels for an article-relevant photo. Requires PEXELS_API_KEY. */
export async function searchPexels(
  query: string,
  signal?: AbortSignal,
): Promise<{ imageUrl: string; attribution: string } | null> {
  const key = Deno.env.get('PEXELS_API_KEY')
  if (!key) return null
  const q = query.trim().slice(0, 100)
  if (!q) return null
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=3&orientation=landscape`
    const res = await fetch(url, {
      method: 'GET',
      signal,
      headers: {
        Authorization: key,
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      photos?: Array<{
        src?: { large?: string; large2x?: string; medium?: string; original?: string }
        photographer?: string
        photographer_url?: string
        url?: string
      }>
    }
    const hit = data.photos?.[0]
    const photoUrl = hit?.src?.large2x ?? hit?.src?.large ?? hit?.src?.medium ?? hit?.src?.original
    if (!photoUrl) return null
    const author = hit?.photographer ?? 'Pexels'
    const photoLink = hit?.url ?? 'https://www.pexels.com'
    const attribution = `Photo by ${author} on Pexels (${photoLink})`
    return { imageUrl: photoUrl, attribution }
  } catch {
    return null
  }
}

export interface ReplacementInput {
  articleUrl?: string
  query: string // tags + title — used for Pexels search
  signal?: AbortSignal
}

/** Try OG card → Pexels. Probes each candidate; returns the first usable result. */
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

  // 2. Pexels search.
  const pexels = await searchPexels(input.query, input.signal)
  if (pexels) {
    const probe = await probeImage(pexels.imageUrl, input.signal)
    if (probe.ok) {
      return { imageUrl: pexels.imageUrl, source: 'pexels', attribution: pexels.attribution, probe }
    }
  }

  return null
}

// Exposed for tests.
export const _internals = { pickMeta, scrapeSocialCardImage, searchPexels }
