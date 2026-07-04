// Pure RSS/podcast parsing helpers — no I/O, unit-testable.
// Used by source-rss-news/index.ts; kept out of index.ts so tests can import
// without triggering its Deno.serve() entrypoint.

import { stripHtmlTags, decodeHtmlEntities } from '../_shared/news-quality/sanitize.ts'

export function parseRssItems(xml: string, isPodcast = false): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const title = extractTag(block, 'title')
    const link = extractTag(block, 'link') || extractTag(block, 'guid')
    // Prefer rich show notes for podcasts so the episode satisfies the
    // non-empty-content guard downstream (get_news_front / useNews).
    const desc = extractTag(block, 'content:encoded') || extractTag(block, 'itunes:summary') || extractTag(block, 'description')
    const pubDate = extractTag(block, 'pubDate')
    const author = extractTag(block, 'dc:creator') || extractTag(block, 'itunes:author') || extractTag(block, 'author')

    if (!title || !link) continue

    if (isPodcast) {
      const audioUrl = extractAudioEnclosure(block)
      // An episode with no audio is not a podcast item — skip it.
      if (!audioUrl) continue
      const image = extractItunesImage(block) || extractMediaUrl(block)
      items.push({
        title: cleanText(title), content: cleanText(desc || ''),
        url: link.trim(), image_url: image, author,
        published_at: pubDate, excerpt: cleanText(desc || '').slice(0, 500),
        media_type: 'podcast', audio_url: audioUrl,
        duration_seconds: parseItunesDuration(extractTag(block, 'itunes:duration')),
      })
    } else {
      items.push({
        title: cleanText(title), content: cleanText(desc || ''),
        url: link.trim(), image_url: extractMediaUrl(block), author,
        published_at: pubDate, excerpt: cleanText(desc || '').slice(0, 500),
      })
    }
  }
  return items
}

// Decode the XML entities that appear inside URL attributes (feeds encode
// query-string `&` as `&amp;`). Without this the stored URL is unusable.
function decodeUrlEntities(url: string): string {
  // Single pass so a decoded `&` can't be re-scanned and double-unescaped
  // (e.g. `&amp;#38;` must stay `&#38;`, not collapse to `&`).
  return url.replace(/&(?:amp|#38|#x26);/gi, '&')
}

// Audio enclosure: <enclosure url="..." type="audio/mpeg" .../>. Match the
// enclosure tag that declares an audio MIME type (url may precede or follow type).
export function extractAudioEnclosure(block: string): string | null {
  const re = /<enclosure\b[^>]*>/gi
  let m
  while ((m = re.exec(block)) !== null) {
    const tag = m[0]
    if (/type="audio\//i.test(tag)) {
      const url = /url="([^"]+)"/i.exec(tag)
      if (url) return decodeUrlEntities(url[1])
    }
  }
  return null
}

// Episode artwork: <itunes:image href="..."/> or <media:thumbnail url="..."/>
export function extractItunesImage(block: string): string | null {
  const itunes = /<itunes:image[^>]+href="([^"]+)"/i.exec(block)
  if (itunes) return decodeUrlEntities(itunes[1])
  const media = /<media:thumbnail[^>]+url="([^"]+)"/i.exec(block)
  return media ? decodeUrlEntities(media[1]) : null
}

// <itunes:duration> accepts HH:MM:SS, MM:SS, or raw seconds. Returns seconds.
export function parseItunesDuration(raw: string | null): number | null {
  if (!raw) return null
  const s = raw.trim()
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  const parts = s.split(':').map((p) => parseInt(p, 10))
  if (parts.some((n) => isNaN(n))) return null
  let secs = 0
  for (const p of parts) secs = secs * 60 + p
  return secs > 0 ? secs : null
}

export function extractTag(xml: string, tag: string): string | null {
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i')
  const cdataMatch = cdataRe.exec(xml)
  if (cdataMatch) return cdataMatch[1]
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const m = re.exec(xml)
  return m ? m[1] : null
}

export function extractMediaUrl(block: string): string | null {
  const mediaMatch = /url="([^"]+\.(jpg|jpeg|png|gif|webp)[^"]*)"/i.exec(block)
  if (mediaMatch) return mediaMatch[1]
  const encMatch = /<enclosure[^>]+url="([^"]+)"/i.exec(block)
  return encMatch ? encMatch[1] : null
}

export function cleanText(s: string): string {
  if (!s) return ''
  // Iteratively decode entities → strip WHOLE tags (name + attributes) →
  // decode again, until stable. Uses the shared single-pass state-machine
  // stripHtmlTags: a `<` opens tag mode, `>` closes it, so an entire
  // `<figure class="…">` is removed — NOT just its angle brackets. The old
  // implementation stripped only `<`/`>` (and `&lt;`/`&gt;`), which left tag
  // guts as visible text (`figure class="…"`, `pThe headline/p`) and fused
  // tag names to adjacent words — the root cause of "broken HTML" in stored
  // articles. The state machine is equally CodeQL-safe (no regex tag match,
  // nothing for js/incomplete-multi-character-sanitization to flag).
  let out = s
  for (let i = 0; i < 4; i++) {
    const before = out
    out = stripHtmlTags(decodeHtmlEntities(out))
    if (out === before) break
  }
  out = decodeHtmlEntities(out)

  // Cosmetic RSS-junk removal.
  return out
    .replace(/The post .* appeared first on .*\./g, '')
    .replace(/Continue reading.*/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
