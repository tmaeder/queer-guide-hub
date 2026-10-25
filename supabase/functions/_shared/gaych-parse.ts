import { decodeEntities } from './html-entities.ts'

/** Only this event page's published Plone artwork, after matching its Event. */
export function extractGaychEventArtwork(
  html: string,
  event: { title: string; start_date?: unknown },
  pageUrl: string,
): string[] {
  let page: URL
  try { page = new URL(pageUrl) } catch { return [] }
  if (page.origin !== 'https://gay.ch' || page.username || page.password || page.search || page.hash
    || !/^\/parties\/[^/]+\/?$/.test(page.pathname)) return []
  const path = page.pathname.replace(/\/$/, '')
  const key = (value: unknown) => typeof value === 'string'
    ? value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : ''
  const day = (value: unknown) => {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null
    const part = value.slice(0, 10), stamp = Date.parse(part)
    return /^\d{4}-\d{2}-\d{2}$/.test(part) && Number.isFinite(stamp)
      && new Date(stamp).toISOString().slice(0, 10) === part ? stamp : null
  }
  const expectedDay = day(event.start_date)
  if (!key(event.title) || expectedDay === null) return []
  const attribute = (tag: string, name: string) =>
    tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1]
  const clean = html.replace(/<!--[\s\S]*?-->/g, '')
  const matches: Record<string, unknown>[] = []
  for (const script of clean.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    // gay.ch also publishes a bare JSON object. Never evaluate JavaScript.
    if (script[1].trim() && attribute(script[1], 'type')?.toLowerCase() !== 'application/ld+json') continue
    try {
      const node = JSON.parse(script[2])
      if (!node || Array.isArray(node) || typeof node !== 'object'
        || !['https://schema.org', 'http://schema.org'].includes(node['@context'])
        || node['@type'] !== 'Event' || key(node.name) !== key(event.title)) continue
      const sourceDay = day(node.startDate)
      if (sourceDay !== null && Math.abs(sourceDay - expectedDay) <= 86400000) matches.push(node)
    } catch { /* Non-JSON scripts are not evidence. */ }
  }
  const distinct = [...new Map(matches.map(node => [JSON.stringify(node), node])).values()]
  if (distinct.length !== 1) return []
  const owned = (value: unknown, original = false): string | null => {
    if (typeof value !== 'string' || !value.trim()) return null
    try {
      const url = new URL(decodeEntities(value), page.href)
      if (url.origin !== page.origin || url.username || url.password || url.search || url.hash
        || !url.pathname.startsWith(path + '/')) return null
      const tail = url.pathname.slice(path.length + 1)
      if (!(original ? /^@@download\/image\/[^/]+$/ : /^@@(?:download\/image|images)\/[^/]+$/).test(tail)) return null
      return url.href
    } catch { return null }
  }
  // This is a narrowly owned original URL, not a general social-image fallback.
  const head = clean.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1]
    ?.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '') ?? ''
  const originals = [...head.matchAll(/<meta\b[^>]*>/gi)].flatMap(([tag]) => {
    if (attribute(tag, 'property')?.toLowerCase() !== 'og:image') return []
    const url = owned(attribute(tag, 'content'), true)
    return url ? [url] : []
  })
  const image = distinct[0].image
  const structured = (Array.isArray(image) ? image : [image]).flatMap(value => {
    const url = owned(value && typeof value === 'object' ? value.url : value)
    return url ? [url] : []
  })
  const uniqueOriginals = [...new Set(originals)]
  return [...new Set([...(uniqueOriginals.length === 1 ? uniqueOriginals : []), ...structured])].slice(0, 3)
}
/**
 * gay.ch category-link extraction.
 *
 * Split out of source-gay-ch/index.ts so it can be unit-tested: importing that
 * file runs `Deno.serve` at module load, which binds a port for the whole suite.
 * Same shape as gaybasel-parse.ts / kweer-parse.ts / milchjugend-parse.ts.
 *
 * WHAT WAS WRONG. The extractor was
 *
 *   [...html.matchAll(/class="link-category"[^>]*>([\s\S]*?)<\/a>/g)]
 *     .map((m) => stripTags(m[1]))
 *
 * and every value it produced on prod was attribute soup, not a label:
 *
 *   class="link-category" rel="nofollow">Zürich      2,699 rows
 *   class="link-category" rel="nofollow">Heaven        964
 *   class="link-category" rel="nofollow">Bern          474
 *
 * Two independent faults compose to make that:
 *
 *  1. The pattern is anchored on the bare ATTRIBUTE TEXT `class="link-category"`,
 *     not on an `<a>` element, so it will start matching inside an attribute
 *     value, a data- payload or a script blob — anywhere that string appears.
 *     `<a\b[^>]*` fixes that: a match must begin at a real anchor tag.
 *
 *  2. `stripTags` removes tags BEFORE decoding entities (index.ts:64 strips,
 *     :68-71 then turns &quot; into " and &gt; into >). So markup that arrives
 *     entity-encoded is invisible to the strip and is *revealed* by the decode,
 *     one step too late to be removed. Decoding first and stripping after is the
 *     order that terminates.
 *
 * MEASURED BLAST RADIUS, so the next reader does not over- or under-estimate it:
 * the soup reached `event_sources.payload.metadata.keywords` only. Across all
 * 3,876 gay-ch events, `events.tags` holds clean curated vocabulary (gay, drag,
 * kink, queer, trans, …), `unified_tags` has zero rows matching it, and no title
 * or description carries it. Nothing rendered was wrong; the stored provenance
 * was.
 */

/* Entity decoding is shared with source-gay-ch's stripTags via
 * _shared/html-entities.ts — see the import at the top of this file. It is
 * still applied BEFORE tag removal here, which is deliberate for this parser:
 * gay.ch encodes angle brackets inside category labels and they must survive
 * as text rather than be read as markup. */

/**
 * Residual markup in a finished label. A category name is a place or a festival
 * — "Zürich", "Street Parade", "Lila - Queer Festival" — never something
 * carrying angle brackets or an HTML attribute.
 *
 * This is a REFUSAL, not a repair: a value that still looks like markup after
 * decoding and stripping is dropped rather than stored. Absence of a keyword is
 * honest and self-correcting; a stored `class="link-category" rel="nofollow">Zürich`
 * is a fact the corpus now has to carry, and it sat in 2,699 rows.
 */
const LOOKS_LIKE_MARKUP = /[<>]|\b(?:class|rel|href|style|data-[\w-]+)\s*=/i

export function extractCategoryKeywords(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*\bclass="link-category"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => decodeEntities(m[1]))
    // Strip AFTER decoding, so markup the decode just revealed is still removed.
    .map((s) => s.replace(/<[^>]+>/g, ' '))
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0 && !LOOKS_LIKE_MARKUP.test(s))
}
