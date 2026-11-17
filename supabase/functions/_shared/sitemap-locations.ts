import { decodeEntities } from './html-entities.ts'

export function* sitemapLocations(xml: string, kind: 'url' | 'sitemap', limit = Number.POSITIVE_INFINITY, requireImages = false): Generator<string> {
  if (limit <= 0) return
  let yielded = 0
  const blocks = new RegExp(`<${kind}\\b[^>]*>([\\s\\S]*?)</${kind}>`, 'gi')
  for (const match of xml.matchAll(blocks)) {
    const loc = /<loc\b[^>]*>([\s\S]*?)<\/loc>/i.exec(match[1])
    if (!loc) continue
    if (requireImages && !hasImageLocation(match[1])) continue
    const raw = loc[1].trim()
    const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(raw)
    const value = cdata ? cdata[1] : decodeEntities(raw)
    if (value) {
      yield value
      if (++yielded >= limit) return
    }
  }
}

// Only an actual, nonempty image location qualifies an image-bearing entry.
function hasImageLocation(block: string): boolean {
  for (const image of block.matchAll(/<((?:[\w.-]+:)?image)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const location = /<(?:[\w.-]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?loc>/i.exec(image[2])
    if (location?.[1].trim()) return true
  }
  return false
}
