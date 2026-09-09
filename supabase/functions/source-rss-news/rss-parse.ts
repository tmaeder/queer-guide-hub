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
// `maxTextBytes` bounds the TEXT this call will clean, which is the real cost —
// item count alone does not imply it. Measured on the 2026-08-06 21:00 run:
// rss.libsyn.com/shows/384410 is 2.35 MB over 111 items (so the 100-item cap
// applied and the 4 MB read cap never fired), but its items average ~21 KB and
// the largest is 184,632 bytes. cleanText is a 4-pass strip/decode loop, so 100
// such items is ~8 MB of allocating string work and the worker died with
// HTTP 546 in 11s — two seconds after claiming this one feed.
export function parseRssItems(
  xml: string,
  isPodcast = false,
  maxItems = Number.POSITIVE_INFINITY,
  maxTextBytes = 1_000_000,
): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = []
  if (maxItems <= 0) return items
  // Computed ONCE, outside the loop — it is a property of the feed, not the item.
  const channelImage = isPodcast ? extractChannelImage(xml) : null
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let textBytes = 0
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    // Counted on items actually PUSHED, so podcast entries skipped for having
    // no audio enclosure don't consume the budget.
    if (items.length >= maxItems) break
    if (textBytes >= maxTextBytes) break
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
      // Per-episode art first, then a typed image enclosure, then the show's own
      // artwork. Most shows declare artwork at CHANNEL level only, so before the
      // channel fallback existed the vast majority of episodes reached
      // extractMediaUrl with nothing to find — which is what made its untyped
      // enclosure branch fire on essentially the whole podcast corpus.
      const image = extractItunesImage(block) || extractMediaUrl(block) || channelImage
      // cleanText ONCE per item. `content` and `excerpt` derive from the same
      // description, and calling it twice doubled the most expensive work in
      // the parser for no benefit.
      const cleaned = cleanText(desc || '')
      textBytes += (desc || '').length
      items.push({
        title: cleanText(title), content: cleaned,
        url: link.trim(), image_url: image, author,
        published_at: pubDate, excerpt: excerptOf(cleaned),
        media_type: 'podcast', audio_url: audioUrl,
        duration_seconds: parseItunesDuration(extractTag(block, 'itunes:duration')),
      })
    } else {
      const cleaned = cleanText(desc || '')
      textBytes += (desc || '').length
      items.push({
        title: cleanText(title), content: cleaned,
        url: link.trim(), image_url: extractMediaUrl(block), author,
        published_at: pubDate, excerpt: excerptOf(cleaned),
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
  // An <enclosure> is whatever the feed chose to attach, and on a podcast item
  // that is the AUDIO. This fallback used to take the first enclosure with no
  // type check at all, so every episode stored its own .mp3 as artwork: 5,607
  // rows on prod (5,548 mp3 + 52 m4a + 1 wav + 6 mp4), 2,405 of them
  // seo_indexable and therefore publishing an MP3 as og:image to crawlers.
  //
  // Same loop shape as extractAudioEnclosure above — an item may carry several
  // enclosures, so matching the FIRST one and then testing it is also wrong.
  // A typeless enclosure is rejected: it is not evidence of an image, and the
  // two errors are not symmetric — a missing image degrades to the placeholder,
  // a wrong one renders the browser's torn-page glyph and poisons og:image.
  const re = /<enclosure\b[^>]*>/gi
  let m
  while ((m = re.exec(block)) !== null) {
    const tag = m[0]
    if (!/type="image\//i.test(tag)) continue
    const url = /url="([^"]+)"/i.exec(tag)
    if (url) return decodeUrlEntities(url[1])
  }
  return null
}

// Show-level artwork: <itunes:image href="..."/> in the channel header.
//
// SCOPED TO THE TEXT BEFORE THE FIRST <item>, which is the whole difficulty.
// Item-level <itunes:image> exists too, so an unscoped regex over the document
// finds the FIRST episode's art and stamps it on every other episode — wrong
// for exactly the feeds that bother with per-episode artwork.
//
// itunes:image ONLY. RSS 2.0's <image><url> in the channel is the site logo
// (historically an 88x31 banner); publishing that as an article hero is a
// different wrong answer, not a better one.
export function extractChannelImage(xml: string): string | null {
  const head = xml.split(/<item[\s>]/i)[0]
  const itunes = /<itunes:image[^>]+href="([^"]+)"/i.exec(head)
  return itunes ? decodeUrlEntities(itunes[1]) : null
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
