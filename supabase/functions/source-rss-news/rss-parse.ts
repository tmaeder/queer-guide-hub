// Pure RSS/podcast parsing helpers — no I/O, unit-testable.
// Used by source-rss-news/index.ts; kept out of index.ts so tests can import
// without triggering its Deno.serve() entrypoint.

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
  // Single pass: each matched entity is replaced exactly once, so a decoded
  // `&` can't combine with following text into a new entity (double-unescaping).
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
  // Phase 1: strip HTML entity references for angle brackets BEFORE any
  // other decoding. `&lt;` / `&gt;` are stripped (not decoded) so they can
  // never reintroduce raw `<` or `>` characters. Single-character regex,
  // no multi-char sanitization concern.
  let out = s.replace(/&lt;/g, '').replace(/&gt;/g, '')

  // Phase 2: strip angle brackets. This is the terminal sanitizer for
  // HTML-injection risk — every subsequent transformation in this function
  // is text-only (entity decoding for non-bracket entities + cosmetic
  // regexes) and cannot reintroduce `<` or `>`.
  out = out.replace(/</g, '').replace(/>/g, '')

  // Phase 3: decode the remaining entities. None of these can produce an
  // angle bracket directly, but a doubly-encoded payload like
  // `&amp;lt;script&amp;gt;` is unchanged by Phases 1+2 (no literal `&lt;`,
  // no literal `<`) and gets decoded here to `&lt;script&gt;`. That output is
  // XSS-safe in any React text context, but Phase 3b below re-strips brackets
  // and bracket entities after decode to close the loop and silence CodeQL
  // `js/incomplete-multi-character-sanitization`.
  const AMP_SENTINEL = '__AMP_SENTINEL__'
  out = out
    .replace(/&amp;/g, AMP_SENTINEL)
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#8217;/g, "'") // smart apostrophe
    .replace(/&#8220;/g, '\u201c').replace(/&#8221;/g, '\u201d').replace(/&#8211;/g, '\u2013')
    .replace(new RegExp(AMP_SENTINEL, 'g'), '&')
    .replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ')

  // Phase 3b: defensive re-strip after entity decode.
  out = out.replace(/&lt;/g, '').replace(/&gt;/g, '').replace(/</g, '').replace(/>/g, '')

  // Phase 4: cosmetic RSS-junk removal.
  return out
    .replace(/The post .* appeared first on .*\./g, '')
    .replace(/Continue reading.*/g, '')
    .trim()
}
