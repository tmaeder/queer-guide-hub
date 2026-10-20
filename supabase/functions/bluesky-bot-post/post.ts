// Builds an app.bsky.feed.post record for the official @queer.guide account.
// Pure: no network, so it is unit-tested directly.

export const SITE = 'https://queer.guide'
const MAX_GRAPHEMES = 300

export interface Candidate {
  entity_type: 'news' | 'event'
  entity_id: string
  title: string
  summary: string | null
  path: string
  tags: string[] | null
}

const graphemes = (s: string) =>
  Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (g) => g.segment)

/** A tag becomes a hashtag only if it is one plain word (Bluesky tag rules). */
export function hashtagFor(tag: string): string | null {
  const t = tag.replace(/[\s-]+(\p{L})/gu, (_, c: string) => c.toUpperCase()).replace(/[^\p{L}\p{N}_]/gu, '')
  return t.length >= 2 && t.length <= 30 && !/^\d+$/.test(t) ? t : null
}

export function buildPost(c: Candidate, now = new Date()) {
  const tags = [...new Set((c.tags ?? []).map(hashtagFor).filter((t): t is string => !!t))].slice(0, 2)
  const suffix = tags.map((t) => ` #${t}`).join('')
  const room = MAX_GRAPHEMES - graphemes(suffix).length
  const title = c.title.trim()
  const head = graphemes(title).length <= room ? title : graphemes(title).slice(0, room - 1).join('').trimEnd() + '…'
  const text = head + suffix

  // Facets index UTF-8 bytes, not characters.
  const enc = new TextEncoder()
  const facets = tags.map((t) => {
    const at = text.lastIndexOf(`#${t}`)
    const byteStart = enc.encode(text.slice(0, at)).length
    return {
      index: { byteStart, byteEnd: byteStart + enc.encode(`#${t}`).length },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: t }],
    }
  })

  return {
    $type: 'app.bsky.feed.post',
    text,
    ...(facets.length ? { facets } : {}),
    langs: ['en'],
    embed: {
      $type: 'app.bsky.embed.external',
      external: {
        uri: SITE + c.path,
        title: title.slice(0, 300),
        description: (c.summary ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
      },
    },
    createdAt: now.toISOString(),
  }
}
