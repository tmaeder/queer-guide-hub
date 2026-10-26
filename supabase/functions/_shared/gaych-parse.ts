import { decodeEntities } from './html-entities.ts'
import { parse, type DefaultTreeAdapterTypes } from 'npm:parse5@8.0.1'

/** Only this event page's published Plone artwork, after matching its Event. */
export function gaychEventArtworkEvidence(
  html: string,
  event: { title: string; start_date?: unknown },
  pageUrl: string,
): { urls: string[]; sourceEvent: Record<string, unknown> } | null {
  let page: URL
  try { page = new URL(pageUrl) } catch { return null }
  if (html.length > 600_000 || page.origin !== 'https://gay.ch' || page.username || page.password || page.search || page.hash
    || !/^\/parties\/[^/]+\/?$/.test(page.pathname)) return null
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
  if (!key(event.title) || expectedDay === null) return null
  const matches: Record<string, unknown>[] = []
  const metadata: string[] = []
  let tooDeep = false
  function walk(node: DefaultTreeAdapterTypes.Node, inHead = false, depth = 0): void {
    if (depth > 100) { tooDeep = true; return }
    if ('tagName' in node) {
      if (['template', 'noscript', 'iframe', 'svg', 'math'].includes(node.tagName)) return
      const attribute = (name: string) => node.attrs.find(attr => attr.name === name)?.value
      if (node.tagName === 'script') {
        // Parse inert JSON only. Never evaluate a publisher's JavaScript.
        if (node.attrs.length && attribute('type')?.toLowerCase() !== 'application/ld+json') return
        const raw = node.childNodes.flatMap(child => child.nodeName === '#text' && 'value' in child ? [child.value] : []).join('')
        try {
          const value = JSON.parse(raw)
          if (!value || Array.isArray(value) || typeof value !== 'object'
            || !['https://schema.org', 'http://schema.org'].includes(value['@context'])
            || value['@type'] !== 'Event' || key(value.name) !== key(event.title)) return
          const sourceDay = day(value.startDate)
          if (sourceDay !== null && Math.abs(sourceDay - expectedDay!) <= 86400000) matches.push(value)
        } catch { /* Non-JSON scripts are not evidence. */ }
        return
      }
      if (node.tagName === 'meta' && inHead && attribute('property')?.toLowerCase() === 'og:image') {
        const value = attribute('content')
        if (value) metadata.push(value)
      }
      inHead ||= node.tagName === 'head'
    }
    if ('childNodes' in node) for (const child of node.childNodes) walk(child, inHead, depth + 1)
  }
  walk(parse(html))
  const distinct = [...new Map(matches.map(node => [JSON.stringify(node), node])).values()]
  if (tooDeep || distinct.length !== 1) return null
  const owned = (value: unknown, original = false): string | null => {
    if (typeof value !== 'string' || !value.trim()) return null
    try {
      const url = new URL(value, page.href)
      if (url.origin !== page.origin || url.username || url.password || url.search || url.hash
        || !url.pathname.startsWith(path + '/')) return null
      const tail = url.pathname.slice(path.length + 1)
      if (!(original ? /^@@download\/image\/[^/]+$/ : /^@@(?:download\/image|images)\/[^/]+$/).test(tail)) return null
      return url.href
    } catch { return null }
  }
  const originals = metadata.flatMap(value => { const url = owned(value, true); return url ? [url] : [] })
  const image = distinct[0].image
  const structured = (Array.isArray(image) ? image : [image]).flatMap(value => {
    const url = owned(value && typeof value === 'object' ? value.url : value)
    return url ? [url] : []
  })
  const uniqueOriginals = [...new Set(originals)]
  return { urls: [...new Set([...(uniqueOriginals.length === 1 ? uniqueOriginals : []), ...structured])].slice(0, 3), sourceEvent: distinct[0] }
}

export function extractGaychEventArtwork(html: string, event: { title: string; start_date?: unknown }, pageUrl: string): string[] {
  return gaychEventArtworkEvidence(html, event, pageUrl)?.urls ?? []
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
