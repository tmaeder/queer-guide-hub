// Pure RSS/podcast parsing helpers — no I/O, unit-testable.
// Used by source-rss-news/index.ts; kept out of index.ts so tests can import
// without triggering its Deno.serve() entrypoint.

import { stripHtmlTags, decodeHtmlEntities } from '../_shared/news-quality/sanitize.ts'

// `maxItems` bounds how many items are PARSED, not just how many are returned.
// The caller only ever keeps `maxArticles` of these, but this function used to
// build every item in the feed first — and each one runs cleanText, a 4-pass
// strip/decode loop over the full description. On a podcast archive that is
// ruinous: queertheology.com serves 8.5 MB / 652 episodes of long HTML show
// notes, and fully cleaning all 652 to keep 100 burned ~60s of CPU and killed
// the edge worker with HTTP 546 — taking the whole news pipeline down with it
// (2026-08-03 → 2026-08-06, 82 consecutive failed runs).
//
// Stopping early is free: RSS is newest-first, so the first N items ARE the N
// the caller wants. The regex scans from lastIndex, so breaking also means the
// tail of the string is never scanned at all.
export function parseRssItems(
  xml: string,
  isPodcast = false,
  maxItems = Number.POSITIVE_INFINITY,
): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = []
  if (maxItems <= 0) return items
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    // Counted on items actually PUSHED, so podcast entries skipped for having
    // no audio enclosure don't consume the budget.
    if (items.length >= maxItems) break
    const block = match[1]
    const title = extractTag(block, 'title')
    const link = extractTag(block, 'link') || extractTag(block, 'guid')
    // Prefer rich show notes for podcasts so the episode satisfies the
    // non-empty-content guard downstream (get_news_front / useNews).
    const desc = extractTag(block, 'content:encoded') || extractTag(block, 'itunes:summary') || extractTag(block, 'description')
    const pubDate = extractTag(block, 'pubDate')
    // Sanitized like the other text fields — `author` never went through
    // cleanText, so it was the one raw string in the payload. Kept null-preserving:
    // extractTag returns string | null and the metadata shape distinguishes them.
    const authorRaw = extractTag(block, 'dc:creator') || extractTag(block, 'itunes:author') || extractTag(block, 'author')
    const author = authorRaw ? stripLoneSurrogates(authorRaw) : authorRaw

    if (!title || !link) continue

    if (isPodcast) {
      const audioUrl = extractAudioEnclosure(block)
      // An episode with no audio is not a podcast item — skip it.
      if (!audioUrl) continue
      const image = extractItunesImage(block) || extractMediaUrl(block)
      items.push({
        title: cleanText(title), content: cleanText(desc || ''),
        url: link.trim(), image_url: image, author,
        published_at: pubDate, excerpt: excerptOf(cleanText(desc || '')),
        media_type: 'podcast', audio_url: audioUrl,
        duration_seconds: parseItunesDuration(extractTag(block, 'itunes:duration')),
      })
    } else {
      items.push({
        title: cleanText(title), content: cleanText(desc || ''),
        url: link.trim(), image_url: extractMediaUrl(block), author,
        published_at: pubDate, excerpt: excerptOf(cleanText(desc || '')),
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
  if (mediaMatch) return decodeUrlEntities(mediaMatch[1])
  const encMatch = /<enclosure[^>]+url="([^"]+)"/i.exec(block)
  return encMatch ? decodeUrlEntities(encMatch[1]) : null
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
  return stripLoneSurrogates(out
    .replace(/The post .* appeared first on .*\./g, '')
    .replace(/Continue reading.*/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim())
}

// A lone surrogate is not representable in UTF-8, and `ingestion_staging.raw_data`
// is JSONB — Postgres rejects the INSERT with
//   22P02 invalid input syntax for type json
//   DETAIL: Unicode low surrogate must follow a high surrogate.
// The staging write is ONE batch, so a single bad character discards every item
// in the run and fails the node. That killed the 2026-08-06 19:00 run in 7s,
// after all 8 of its sources had already fetched successfully.
//
// Two sources of lone surrogates, and both need covering:
//   1. the feed ships one (mojibake / bad transcoding upstream)
//   2. WE create one — `.slice(0, 500)` for the excerpt counts UTF-16 code
//      units, so a cut landing between the halves of an emoji's surrogate pair
//      orphans the high half. Calling this inside cleanText does NOT cover that,
//      because the slice runs afterwards — hence excerptOf below.
export function stripLoneSurrogates(s: string): string {
  if (!s) return ''
  // High surrogate not followed by a low one, or low not preceded by a high.
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}

// Slice that can never orphan half of a surrogate pair.
export function excerptOf(s: string, max = 500): string {
  return stripLoneSurrogates(s.slice(0, max))
}
