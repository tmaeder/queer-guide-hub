// ============================================================
// kweer.io — Zurich queer party promoter (Wix Events)
//
// The LISTING is client-rendered and carries no data, which is why this looked
// like a browser job at first. It is not: `event-pages-sitemap.xml` enumerates
// every event, and each detail page is server-rendered with a clean schema.org
// Event. 25 pages, one sitemap fetch — an ordinary edge function.
//
// ── THE VENUE-NAME TRAP ──────────────────────────────────────
// `location.name` is the CITY on 7 of the 25 events — literally "Zürich" —
// while the real venue is only implied by the street address. Staging that as
// `venue_name` would feed a city name into venue matching, which is exactly the
// documented place-collision failure (15 of 65 `name_exact` venue matches were
// cities or queer-village names, a 23% error rate on a branch that auto-applies).
//
// The name is NOT recoverable from the address either, and that was measured
// rather than assumed: "Schiffbaustrasse 3" appears as "LABOR5 Zürich" on one
// event, "Fabrik Du Plaisir" on another and "Zürich" on three more. So a
// city-shaped name yields a NULL venue, never a guess — the address still
// carries street, postal code and city, so the event keeps a real location.
//
// ── ONLINE EVENTS ────────────────────────────────────────────
// Four are pandemic-era streams whose "venue" is "Vimeo & Zoom" or a twitch URL
// and which carry no address at all. They have no physical location, so they
// are dropped rather than given one.
// ============================================================

export interface KwEvent {
  /** The sitemap slug — stable, and 25/25 distinct. */
  slug: string
  url: string
  title: string
  /** ISO-8601; the source supplies a correct offset. */
  start: string
  end: string | null
  description: string | null
  image: string | null
  /** NULL when the source named a city or a streaming platform. */
  venueName: string | null
  street: string | null
  postal: string | null
  city: string | null
  country: string | null
}

export const stripTags = (s: unknown): string =>
  String(s ?? '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Sitemap entries come in pairs — the event page and its `/form` signup child.
 * Both resolve to the same event, so the suffix is stripped and the result
 * deduped: 25 <loc> entries collapse to 25 distinct pages only because the
 * strip happens first.
 */
export function pagesFromSitemap(xml: unknown): string[] {
  const locs = [...String(xml ?? '').matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?\s*<\/loc>/g)]
    .map((m) => m[1].trim().replace(/\/form\/?$/, '').replace(/\/$/, ''))
    .filter((l) => /\/event-details\//.test(l))
  return [...new Set(locs)]
}

export const slugFromUrl = (url: unknown): string | null =>
  String(url ?? '').match(/\/event-details\/([^/?#]+)/)?.[1] ?? null

const COUNTRY_WORDS: Record<string, string> = {
  switzerland: 'CH', schweiz: 'CH', suisse: 'CH', svizzera: 'CH',
  germany: 'DE', deutschland: 'DE', austria: 'AT', 'österreich': 'AT',
  france: 'FR', frankreich: 'FR', italy: 'IT', italien: 'IT',
}

/**
 * Wix writes the address as one string: "Schiffbaustrasse 3, 8005 Zürich,
 * Switzerland". Uniform across all 21 events that have one.
 */
export function splitAddress(raw: unknown): {
  street: string | null; postal: string | null; city: string | null; country: string | null
} {
  const s = stripTags(raw)
  if (!s) return { street: null, postal: null, city: null, country: null }
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean)
  let country: string | null = null
  if (parts.length > 1) {
    const maybe = COUNTRY_WORDS[parts[parts.length - 1].toLowerCase()]
    if (maybe) { country = maybe; parts.pop() }
  }
  let postal: string | null = null
  let city: string | null = null
  if (parts.length > 1) {
    const tail = parts.pop()!
    const m = tail.match(/^(\d{4,5})\s+(.+)$/)
    if (m) { postal = m[1]; city = m[2].trim() } else city = tail
  }
  return { street: parts.join(', ') || null, postal, city, country }
}

/**
 * Names that are not venues. Two kinds: the city itself (7 of 25 events), and
 * the streaming platforms used for the 2020-21 online balls.
 *
 * Compared against the address's own city too, so this stays correct if kweer
 * ever lists an event outside Zurich — the rule is "the venue is not just the
 * city", not a hardcoded city list.
 */
const NON_VENUE = /^(z(ü|ue|u)rich|switzerland|schweiz|online|tba|vimeo|zoom|twitch)\b/i

export function cleanVenueName(raw: unknown, city: string | null): string | null {
  const n = stripTags(raw)
  if (!n) return null
  if (/^https?:\/\//i.test(n)) return null                       // a twitch/vimeo URL
  if (NON_VENUE.test(n)) return null                             // "Zürich", "Vimeo & Zoom"
  if (city && n.toLowerCase() === city.toLowerCase()) return null // the address's own city
  // Plurals matter: `\bpodcast\b` does not match "podcasts", which is the exact
  // string one live row uses ("Where ever fine podcasts are hosted").
  if (/\b(vimeo|zooms?|twitch|podcasts?|online|livestreams?|streams?)\b/i.test(n)) return null
  return n
}

export function readEventJsonLd(html: unknown): Record<string, unknown> | null {
  for (const m of String(html ?? '').matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let blob: unknown
    try { blob = JSON.parse(m[1]) } catch { continue }
    for (const o of (Array.isArray(blob) ? blob : [blob])) {
      if (o && typeof o === 'object' && String((o as Record<string, unknown>)['@type'] ?? '').includes('Event')) {
        return o as Record<string, unknown>
      }
    }
  }
  return null
}

export function parseEvent(html: unknown, url: string): KwEvent | null {
  const ev = readEventJsonLd(html)
  const slug = slugFromUrl(url)
  if (!ev || !slug) return null

  const title = stripTags(ev.name)
  const start = String(ev.startDate ?? '').trim()
  // commit RAISEs event_missing_title / event_missing_start_date.
  if (!title || !start) return null

  const loc = (Array.isArray(ev.location) ? ev.location[0] : ev.location) as Record<string, unknown> | undefined
  const addr = splitAddress(typeof loc?.address === 'string' ? loc.address : (loc?.address as Record<string, unknown>)?.streetAddress)

  // No address at all means an online-only event: pipeline-validate raises
  // E_NO_LOCATION on it, so drop it here rather than bank a rejected row.
  if (!addr.city && !addr.street) return null

  const image = Array.isArray(ev.image) ? String(ev.image[0] ?? '') : String(ev.image ?? '')
  return {
    slug,
    url,
    title,
    start,
    end: String(ev.endDate ?? '').trim() || null,
    description: stripTags(ev.description) || null,
    image: image ? image.split('?')[0] : null,
    venueName: cleanVenueName(loc?.name, addr.city),
    street: addr.street,
    postal: addr.postal,
    city: addr.city,
    country: addr.country,
  }
}
