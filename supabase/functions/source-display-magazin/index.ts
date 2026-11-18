import { decodeEntities } from '../_shared/html-entities.ts'
import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { displayFeedItems, fetchDisplayFeed } from './feed.ts'

// ============================================================
// Source: display-magazin.ch — Swiss LGBTQ+ lifestyle magazine agenda
//
// The current calendar advertises a static public JSON feed. The old Tribe
// API and /agenda route are retired. Session occurrences preserve their own
// dates, venues and ticket URLs. Only publisher-ID venue objects are staged as
// venues; current name-only venues stay explicit event location evidence.
// No geocoding or synthetic venue post IDs are introduced here.
// ============================================================

/** display-magazin category slug -> events_event_type_check vocabulary. */
const TYPE_MAP: Record<string, string> = {
  'party-nightlife': 'party',
  'pride-festivals': 'pride',
  'film-kino': 'film',
  'community-stammtisch': 'community',
  'theater-buehne': 'theater',
  'sport-outdoor': 'sports',
  'konzerte-musik': 'concert',
  'kunst-ausstellungen': 'art',
  'bildung-politik': 'workshop',
  'literatur-talks': 'workshop',
  'food-drinks': 'social',
  weitere: 'other',
  party: 'party', pride: 'pride', film: 'film', community: 'community',
  sport: 'sports', comedy: 'theater', kultur: 'art', bar: 'social',
}

/**
 * `commit_event_staging_item` / `commit_venue_staging_item` read several keys
 * NormalizedItem does not declare (event_type, venue_name, ticket_url, the
 * postal/state members of location). They are additive, not a different shape.
 *
 * Note that putting event_type inside `metadata` — as source-eventbrite does —
 * means commit never sees it and every row lands as 'other'; it belongs at the
 * root.
 *
 * `location` needs its own widening: an intersection with Record<string, unknown>
 * does not loosen a NESTED object literal, and NormalizedItem['location'] knows
 * nothing about state / postal_code / timezone even though both commit RPCs read
 * all three. Widened here rather than in _shared/source-adapter.ts to keep the
 * blast radius at these two Swiss sources.
 */
export type StagedItem = Omit<NormalizedItem, 'location'> &
  Record<string, unknown> & {
    location?: NonNullable<NormalizedItem['location']> & Record<string, unknown>
  }

/**
 * HTML -> plain text. `&amp;` is decoded LAST, deliberately: decoding it first
 * turns `&amp;lt;` into `&lt;` and the next rule turns that into `<`, so text
 * the source deliberately escaped silently becomes markup (js/double-escaping,
 * flagged by CodeQL on the first version of this file). Numeric entities are
 * safe ahead of it, because `&amp;#60;` contains no `&#60;` substring.
 */
const stripTags = (s: unknown): string =>
  String(s ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[#0-9a-zA-Z]+;/g, (m) => decodeEntities(m))
    .replace(/\s+/g, ' ')
    .trim()

const COUNTRY_WORDS: Record<string, string> = {
  schweiz: 'CH', switzerland: 'CH', suisse: 'CH', svizzera: 'CH', ch: 'CH',
  deutschland: 'DE', germany: 'DE', de: 'DE',
  'österreich': 'AT', austria: 'AT', at: 'AT',
  france: 'FR', frankreich: 'FR', fr: 'FR',
  italia: 'IT', italien: 'IT', it: 'IT', liechtenstein: 'LI', li: 'LI',
}

/**
 * Evidence-based, and returns null rather than guessing. Both country columns
 * accept NULL and `derive_entity_geo_address` fills them from the linked city
 * later; a WRONG country is not recoverable the same way because it drives
 * safety-gating and city linking (the AZ/Sedona -> Azerbaijan class of bug).
 * 183 of the 381 venue records carry no country at all, so this path is the
 * common one, not the exception.
 */
function resolveCountry(country?: unknown): string | null {
  const w = String(country ?? '').trim().toLowerCase()
  if (w && COUNTRY_WORDS[w]) return COUNTRY_WORDS[w]
  // Postcode lengths are shared across countries; retain unknown identity
  // until the existing city/source verification can establish it.
  return null
}

/**
 * A city that is only digits is a postal code in the wrong field.
 *
 * Two venue records carry city='8002' and city='4053', and both
 * `venues_city_nonjunk_check` and `events_city_nonjunk_check` forbid a purely
 * numeric city — so passing it through does not make a bad row, it makes a
 * REJECTED staging item. Route it to postal_code instead.
 */
function cityOrPostal(raw: unknown): { city: string | null; postal: string | null } {
  const s = String(raw ?? '').trim()
  if (!s) return { city: null, postal: null }
  return /^\d{4,5}$/.test(s) ? { city: null, postal: s } : { city: s, postal: null }
}

/**
 * Recover "<postal> <Town>" from the tail of a free-text address.
 *
 * Tribe's `city` field is optional and 59 of the 381 venue records leave it
 * empty while writing the town INTO the address ("Kasernenhof 8 4058 Basel").
 * Those rows are not location-less, just shaped differently — and `city` is
 * what run_event_city_link keys on, so a null there costs city_id and
 * everything derived from it.
 */
function cityFromAddress(address: unknown): { postal: string | null; city: string | null } {
  const m = String(address ?? '').trim().replace(/,\s*$/, '').match(/(\d{4,5})\s+([^,\d]{2,})$/)
  return m ? { postal: m[1], city: m[2].trim() } : { postal: null, city: null }
}

/**
 * Tribe returns local WALL TIME with no offset ("2025-12-27 16:00:00") plus a
 * separate IANA `timezone` field, so the offset must be resolved per instant —
 * a fixed "+02:00" is right for July and an hour wrong for December. Round-trip
 * through Intl to recover the zone's actual offset at that moment.
 */
function toIso(s: unknown, tz?: unknown): string | null {
  const raw = String(s ?? '').trim()
  if (!raw) return null
  const zone = String(tz ?? '') || 'Europe/Zurich'
  const asUtc = new Date(raw.replace(' ', 'T') + 'Z')
  if (!Number.isFinite(asUtc.getTime())) return null
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(asUtc).map((p) => [p.type, p.value]),
  )
  const back = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  )
  return new Date(asUtc.getTime() - (back - asUtc.getTime())).toISOString()
}

export const eventAdapter: SourceAdapter = {
  name: 'display-magazin',
  entityType: 'event',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const payload = await fetchDisplayFeed(AbortSignal.timeout(15000))
    return displayFeedItems(payload, {
      now: Date.now(), daysBack: Math.min(30, Math.max(0, Number(config.filters?.daysBack ?? 7) || 0)),
      limit: Math.min(500, Math.max(1, Number(config.batchSize) || 300)),
    })
  },

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const e = raw.data
    const v = (e.venue && !Array.isArray(e.venue) ? e.venue : null) as Record<string, unknown> | null
    const fromAddr = cityFromAddress(v?.address)
    const rawCity = cityOrPostal(v ? stripTags(v.city) : null)
    const city = rawCity.city || fromAddr.city
    const cats = (e.categories as { slug?: string }[]) ?? []
    const image = (e.image as { url?: string } | null)?.url ?? null
    const start = toIso(e.start_date, e.timezone)
    const publishedEnd = toIso(e.end_date, e.timezone)
    // Some publisher rows put an overnight closing time on the opening date.
    // Keep the published start; leave the contradictory end unknown instead
    // of inventing a next-day date. Preserve the publisher value for review.
    const invalidEnd = Boolean(start && publishedEnd && Date.parse(publishedEnd) < Date.parse(start))
    const end = invalidEnd ? null : publishedEnd

    const item: StagedItem = {
      entityType: 'event',
      sourceId: raw.sourceId,
      sourceName: 'display-magazin',
      name: stripTags(e.title),
      title: stripTags(e.title),
      description: stripTags(e.description) || stripTags(e.excerpt) || undefined,
      event_type: e.kultur_art === 'kino' ? 'film' : TYPE_MAP[cats[0]?.slug ?? ''] ?? 'other',
      start_date: start,
      end_date: end,
      dates: { start: start ?? undefined, end: end ?? undefined },
      venue_name: v ? stripTags(v.venue) : undefined,
      website: (e.website as string) || (e.url as string) || null,
      ticket_url: typeof e.tickets === 'string' ? e.tickets.trim() || null : null,
      location: {
        address: v ? stripTags(v.address) || undefined : undefined,
        city: city ?? undefined,
        postal_code: (fromAddr.postal ?? rawCity.postal) ?? undefined,
        state: v ? stripTags(v.stateprovince ?? v.province) || undefined : undefined,
        country: (v ? resolveCountry(v.country) : null) ?? undefined,
        timezone: (e.timezone as string) || 'Europe/Zurich',
      },
      images: image ? [image] : [],
      tags: ['lgbtq', ...((e.tags as { slug?: string }[]) ?? []).map((t) => t.slug ?? '')].filter(Boolean).slice(0, 20),
      urls: [e.url as string].filter(Boolean),
      metadata: {
        url: e.url,
        source: 'display-magazin',
        wp_id: e.id,
        source_feed: e.source_feed,
        ...(invalidEnd ? { source_date_issue: { code: 'publisher_end_before_start', published_end: e.end_date } } : {}),
        source_session: e.source_session,
        all_day: e.all_day,
        cost: e.cost === '' ? null : e.cost ?? null,
        categories: cats.map((c) => c.slug),
      },
    }
    return item
  },
}

const venueAdapter: SourceAdapter = {
  name: 'display-magazin',
  entityType: 'venue',

  // Venues are collected from the already-fetched events (see the header note),
  // so this is never called by the handler.
  fetch: () => Promise.resolve([]),

  getSourceId: (raw) => String(raw.sourceId),

  normalize(raw: RawItem): NormalizedItem {
    const v = raw.data
    const fromAddr = cityFromAddress(v.address)
    const rawCity = cityOrPostal(stripTags(v.city))
    const city = rawCity.city || fromAddr.city
    const item: StagedItem = {
      entityType: 'venue',
      sourceId: String(v.id),
      sourceName: 'display-magazin',
      name: stripTags(v.venue),
      // Neither source publishes a category and the venue NAME must not be used
      // to infer one (`Quelle schlägt Name`): commit defaults this to 'unknown'.
      category: 'unknown',
      location: {
        address: stripTags(v.address) || undefined,
        city: city ?? undefined,
        postal_code: (fromAddr.postal ?? rawCity.postal) ?? undefined,
        state: stripTags(v.stateprovince ?? v.province) || undefined,
        country: resolveCountry(v.country) ?? undefined,
      },
      contacts: { website: (v.website as string) || (v.url as string) || undefined },
      tags: ['lgbtq'],
      metadata: { url: v.url, source: 'display-magazin', wp_id: v.id },
    }
    return item
  },
}

/** The venue objects embedded in the fetched events, deduped by WP id. */
function venuesFromEvents(events: RawItem[]): RawItem[] {
  const seen = new Map<string, RawItem>()
  for (const e of events) {
    const v = e.data.venue
    if (!v || Array.isArray(v)) continue
    const rec = v as Record<string, unknown>
    if (!rec.id || !stripTags(rec.venue)) continue
    seen.set(String(rec.id), { sourceId: String(rec.id), data: rec })
  }
  return [...seen.values()]
}

Deno.serve(withErrorReporting('source-display-magazin', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.limit ?? body.batch_size ?? 300,
      filters: { daysBack: body.days_back },
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
      items_skipped: rawEvents.length + rawVenues.length - events - venues,
      events,
      venues,
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
