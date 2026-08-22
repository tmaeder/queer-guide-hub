import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// Source: gay.ch/parties — the Swiss queer party agenda
//
// Plone 6 + plone.app.event. There is NO usable API: `++api++` answers
// `{"type":"NotFound"}` at every path tried, and the collection's own
// `/parties/ics_view` returns 500. So detail pages are parsed.
//
// THE STRUCTURED DATA IS THERE BUT INVISIBLE TO A NORMAL GREP. Each detail
// page carries a schema.org Event object in a BARE `<script>` tag — no
// `type="application/ld+json"` attribute — so every "does this site have
// JSON-LD?" check reports zero and sends you to the CSS classes. It has
// name, description, image, startDate, endDate and a structured
// PostalAddress, and it is the authority for all of those. The surrounding
// HTML is consulted only for what it does NOT carry: body prose, admission
// price, external links, keywords. The regex fallback exists for pre-2022
// pages written before the tile was added.
//
// SCOPE: this fetches the /parties/ LISTING, i.e. upcoming events only. The
// sitemap holds 3,543 party pages back to 2015; walking that archive is a
// one-shot job (scripts/data-quality/import-swiss-events.mjs --phase
// fetch-gaych), not something a daily cron should redo.
//
// IDENTITY: the Plone path slug for events ("xoxo-2020-9"), and
// slug(name)|slug(city) for venues, which have no id of their own anywhere on
// the site. Those namespaces cannot collide: a venue key always contains "|"
// and a Plone slug never does.
//
// See source-display-magazin for why there is no geocoding on this path.
// ============================================================

const BASE = 'https://gay.ch'
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)'

/** See source-display-magazin for why `location` is widened separately. */
type StagedItem = Omit<NormalizedItem, 'location'> &
  Record<string, unknown> & {
    location?: NonNullable<NormalizedItem['location']> & Record<string, unknown>
  }

const stripTags = (s: unknown): string =>
  String(s ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#8217;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const slugify = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const COUNTRY_WORDS: Record<string, string> = {
  schweiz: 'CH', switzerland: 'CH', suisse: 'CH', svizzera: 'CH', ch: 'CH',
  deutschland: 'DE', germany: 'DE', de: 'DE',
  'österreich': 'AT', austria: 'AT', at: 'AT',
  france: 'FR', frankreich: 'FR', italia: 'IT', italien: 'IT', liechtenstein: 'LI',
}

/** Evidence-based; null rather than a guess. See source-display-magazin. */
function resolveCountry(country?: unknown, blob?: string): string | null {
  const w = String(country ?? '').trim().toLowerCase()
  if (w && COUNTRY_WORDS[w]) return COUNTRY_WORDS[w]
  if (/\b[1-9]\d{3}\s+[A-Za-zÀ-ÿ]/.test(blob ?? '')) return 'CH'
  if (/\b\d{5}\s+[A-Za-zÀ-ÿ]/.test(blob ?? '')) return 'DE'
  return null
}

interface ParsedVenue {
  name: string
  street: string | null
  postal: string | null
  city: string | null
  country: string | null
  full: string
}

/** "Heaven, Spitalgasse 5, 8001 Zürich" — the pre-2022 shape. */
function splitLocationLine(text: string): ParsedVenue | null {
  const t = stripTags(text).replace(/\s*Map\s*$/, '').trim()
  if (!t) return null
  const segs = t.split(',').map((s) => s.trim()).filter(Boolean)
  if (!segs.length) return null
  let cityIdx = -1
  for (let i = segs.length - 1; i >= 1; i--) {
    if (/^\d{4,5}\s+\S/.test(segs[i])) { cityIdx = i; break }
  }
  let city: string | null = null
  let postal: string | null = null
  if (cityIdx >= 0) {
    const m = segs[cityIdx].match(/^(\d{4,5})\s+(.+)$/)!
    postal = m[1]
    city = m[2].trim()
  } else if (segs.length > 1) {
    city = segs[segs.length - 1]
  }
  return {
    name: segs[0],
    street: segs.slice(1, cityIdx >= 0 ? cityIdx : segs.length).join(', ') || null,
    postal,
    city,
    country: null,
    full: t,
  }
}

function readJsonLd(html: string): Record<string, unknown> | null {
  const m = html.match(/<script>(\{"@context":\s*"https:\/\/schema\.org"[\s\S]*?)<\/script>/)
  if (!m) return null
  try {
    const d = JSON.parse(m[1])
    return d && d['@type'] === 'Event' ? d : null
  } catch { return null }
}

interface ParsedEvent {
  slug: string
  url: string
  title: string
  start: string
  end: string | null
  description: string | null
  body: string | null
  image: string | null
  cost: string | null
  website: string | null
  keywords: string[]
  venue: ParsedVenue | null
}

function parseEvent(html: string, url: string): ParsedEvent | null {
  const ld = readJsonLd(html)
  const title = stripTags(ld?.name) || stripTags(html.match(/<h1 class="documentFirstHeading">([\s\S]*?)<\/h1>/)?.[1])
  const start = (ld?.startDate as string) || html.match(/<abbr class="dtstart" title="([^"]+)"/)?.[1] || null
  if (!title || !start) return null

  let venue: ParsedVenue | null = null
  const place = ld?.location as Record<string, unknown> | undefined
  if (place?.name) {
    const a = (place.address ?? {}) as Record<string, unknown>
    venue = {
      name: stripTags(place.name),
      street: stripTags(a.street) || null,
      postal: a.postalCode ? String(a.postalCode) : null,
      city: stripTags(a.addressLocality) || null,
      country: stripTags(a.addressCountry) || null,
      full: [place.name, a.street, [a.postalCode, a.addressLocality].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    }
  } else {
    const summary = html.match(/<div class="eventSummaryTile">([\s\S]*?)<\/div>/)?.[1] ?? ''
    const line = summary.match(/<p><span>([\s\S]*?)<\/span><\/p>/)?.[1] ?? ''
    venue = splitLocationLine(line.replace(/<a class="google_maps_link"[\s\S]*$/, ''))
  }

  const side = html.match(/mosaic-ISummaryText-summary-tile">\s*<div class="mosaic-tile-content">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? ''
  const links = [...side.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1])

  return {
    slug: url.replace(/^.*\/parties\//, '').replace(/\/$/, ''),
    url,
    title,
    start,
    end: (ld?.endDate as string) || html.match(/<abbr class="dtend" title="([^"]+)"/)?.[1] || null,
    description: stripTags(ld?.description) || stripTags(html.match(/<div class="documentDescription">([\s\S]*?)<\/div>/)?.[1]) || null,
    body: stripTags(html.match(/mosaic-IRichTextBehavior-text-tile">\s*<div class="mosaic-tile-content">([\s\S]*?)<\/div>\s*<\/div>/)?.[1]) || null,
    image: (ld?.image as string) || html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || null,
    cost: stripTags(side).match(/Eintritt:\s*([^\n]+)/)?.[1]?.trim() || null,
    website: links.find((l) => !/facebook|instagram|tiktok|twitter|x\.com|youtube/i.test(l)) || null,
    keywords: [...html.matchAll(/class="link-category"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1])).filter(Boolean),
    venue,
  }
}

async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } })
  if (!res.ok) throw new Error(`gay.ch ${res.status} for ${url}`)
  return await res.text()
}

const eventAdapter: SourceAdapter = {
  name: 'gay-ch',
  entityType: 'event',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const listing = await getHtml(`${BASE}/parties/`)
    // An event is EXACTLY /parties/<slug> — one path segment, no trailing view.
    // The `[^"#?/]*$` anchor is load-bearing: every listing tile also links
    // `/parties/<slug>/ics_view`, so a pattern that allows a further segment
    // returns two URLs per event, and `slice(batchSize)` then truncates the
    // real ones (measured: 64 URLs for 32 parties, 30 events reaching staging
    // under a cap of 60). It also subsumes the `@@agenda_view` sidebar filters
    // and `/parties/parties/`.
    const urls = [...new Set(
      [...listing.matchAll(/href="(https:\/\/gay\.ch\/parties\/[a-z0-9][^"#?/]*)"/gi)].map((m) => m[1]),
    )].slice(0, config.batchSize)

    const items: RawItem[] = []
    for (const url of urls) {
      try {
        const parsed = parseEvent(await getHtml(url), url)
        if (parsed) items.push({ sourceId: parsed.slug, data: parsed as unknown as Record<string, unknown> })
      } catch (e) {
        // One bad page must not lose the other 32.
        console.warn(`source-gay-ch ${url}: ${(e as Error).message}`)
      }
    }
    return items
  },

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const e = raw.data as unknown as ParsedEvent
    const v = e.venue
    const desc = [e.description, e.body].filter(Boolean).join('\n\n').trim()
    const item: StagedItem = {
      entityType: 'event',
      sourceId: e.slug,
      sourceName: 'gay-ch',
      name: e.title,
      title: e.title,
      description: desc || undefined,
      // The /parties/ tree is a party listing by the section's own editorial
      // definition — this is not inferred from the title.
      event_type: 'party',
      start_date: e.start,
      end_date: e.end,
      dates: { start: e.start, end: e.end ?? undefined },
      venue_name: v?.name ?? null,
      website: e.website,
      ticket_url: e.url,
      location: {
        address: v?.street ?? undefined,
        city: v?.city ?? undefined,
        postal_code: v?.postal ?? undefined,
        country: (v ? resolveCountry(v.country, v.full) : null) ?? undefined,
        timezone: 'Europe/Zurich',
      },
      images: e.image ? [e.image] : [],
      tags: ['lgbtq', ...e.keywords.map(slugify)].filter(Boolean).slice(0, 20),
      urls: [e.url],
      metadata: { url: e.url, source: 'gay-ch', cost: e.cost, keywords: e.keywords },
    }
    return item
  },
}

const venueAdapter: SourceAdapter = {
  name: 'gay-ch',
  entityType: 'venue',

  // Venues come from the already-parsed events; see venuesFromEvents.
  fetch: () => Promise.resolve([]),

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const v = raw.data as unknown as ParsedVenue
    const item: StagedItem = {
      entityType: 'venue',
      sourceId: `${slugify(v.name)}|${slugify(v.city)}`,
      sourceName: 'gay-ch',
      name: v.name,
      category: 'unknown',
      location: {
        address: v.street ?? undefined,
        city: v.city ?? undefined,
        postal_code: v.postal ?? undefined,
        country: resolveCountry(v.country, v.full) ?? undefined,
      },
      tags: ['lgbtq'],
      metadata: { source: 'gay-ch', address_line: v.full },
    }
    return item
  },
}

function venuesFromEvents(events: RawItem[]): RawItem[] {
  const seen = new Map<string, RawItem>()
  for (const e of events) {
    const v = (e.data as unknown as ParsedEvent).venue
    if (!v?.name) continue
    const key = `${slugify(v.name)}|${slugify(v.city)}`
    if (!seen.has(key)) seen.set(key, { sourceId: key, data: v as unknown as Record<string, unknown> })
  }
  return [...seen.values()]
}

Deno.serve(withErrorReporting('source-gay-ch', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.limit ?? body.batch_size ?? 60,
      dryRun: body.dry_run ?? body.dryRun ?? false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }

    const rawEvents = await eventAdapter.fetch(config)
    const rawVenues = venuesFromEvents(rawEvents)

    if (config.dryRun) {
      return jsonResponse({ success: true, items: rawEvents.length, venues: rawVenues.length, dry_run: true }, 200, req)
    }

    const events = await writeToStaging(supabase, eventAdapter, rawEvents, { ...config, targetTable: 'events' })
    const venues = await writeToStaging(supabase, venueAdapter, rawVenues, {
      ...config,
      targetTable: 'venues',
      entityType: 'venue',
    })

    return jsonResponse({
      success: true,
      items: events + venues,
      items_total: rawEvents.length + rawVenues.length,
      items_processed: events + venues,
      items_succeeded: events + venues,
      items_failed: 0,
      events,
      venues,
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
