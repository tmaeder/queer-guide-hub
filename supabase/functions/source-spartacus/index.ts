import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { parseCountries, parseMarkers, mapCategory } from '../_shared/spartacus-parse.ts'

// ============================================================
// Source: Spartacus gay guide (going-out venues + saunas)
// ============================================================
//
// HOST CORRECTION (do not revert): this pointed at `https://www.spartacus.world`
// with a `/en/gay-guide/<country>` path and hand-invented `div.listing` /
// `h3` selectors. That host answers EVERY path with HTTP 200 and a 114-byte
// empty body, so `res.ok` passed, the parser matched nothing, and the function
// reported success while writing zero rows — for its entire life. The live
// guide is `spartacus.gayguide.travel`.
//
// One request per (vertical, country) covers the whole corpus: the country
// listing page has no pagination and embeds a Leaflet marker array with
// coordinates, category, name and detail URL for every venue in that country.
// ~190 requests for ~5,800 venues. Parsers + their regression tests live in
// `_shared/spartacus-parse.ts`.
//
// Deep fields (street address, phone, website, opening hours, amenity codes)
// need one request per venue and are handled out-of-band by
// `scripts/data-quality/import-spartacus.mjs`, which caches to disk — that
// volume does not fit an edge function's execution budget.

const BASE = 'https://spartacus.gayguide.travel'
const VERTICALS = ['goingout', 'saunas'] as const

// A cold country listing is ~1s. The cluster budget is ~2 min, so a single
// invocation walks a bounded slice and returns a cursor rather than trying to
// sweep all 194 pages and dying halfway with no record of where it stopped.
const DEFAULT_MAX_COUNTRIES = 20
const DELAY_MS = 600

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'QueerGuideBot/1.0 (+https://queer.guide; venue directory sync)',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  // Guard the soft-200 failure mode described above: on this family of hosts a
  // short body is an error page, never an empty result set.
  if (html.length < 500) throw new Error(`short body (${html.length}B) — treat as failure, not "no results"`)
  return html
}

interface SpartacusRaw extends Record<string, unknown> {
  id: string
  url: string
  name: string
  lat: number
  lng: number
  marker: string
  vertical: string
  country_name: string
  country_slug: string
  region_slug: string | null
  city_slug: string
}

const spartacusAdapter: SourceAdapter = {
  name: 'spartacus',
  entityType: 'venue',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const wanted = ((config.filters?.countries as string[]) || []).map((c) => String(c).toLowerCase())
    const verticals = ((config.filters?.verticals as string[]) || VERTICALS) as readonly string[]
    const maxCountries = Number(config.filters?.max_countries ?? DEFAULT_MAX_COUNTRIES)
    const offset = Number(config.offset ?? 0)

    // Flatten (vertical, country) into one ordered work list so `offset` is a
    // stable cursor across invocations.
    const work: Array<{ vertical: string; id: string; name: string }> = []
    for (const vertical of verticals) {
      if (!VERTICALS.includes(vertical as typeof VERTICALS[number])) continue
      const searchHtml = await getHtml(`${BASE}/${vertical}/search/`)
      for (const c of parseCountries(searchHtml)) {
        if (wanted.length && !wanted.includes(c.name.toLowerCase())) continue
        work.push({ vertical, id: c.id, name: c.name })
      }
      await sleep(DELAY_MS)
    }

    const slice = work.slice(offset, offset + maxCountries)
    const items: RawItem[] = []

    for (const w of slice) {
      const url = `${BASE}/${w.vertical}/search/?s=true&search_name=&countries_id=${w.id}&cities_id=`
      let html: string
      try {
        html = await getHtml(url)
      } catch (e) {
        // Surface, never swallow into a silent zero.
        console.warn(`spartacus ${w.vertical}/${w.name}: ${(e as Error).message}`)
        continue
      }
      for (const m of parseMarkers(html)) {
        items.push({
          sourceId: m.id,
          data: {
            id: m.id,
            url: m.url,
            name: m.name,
            lat: m.lat,
            lng: m.lng,
            marker: m.marker,
            vertical: w.vertical,
            country_name: w.name,
            country_slug: m.countrySlug,
            region_slug: m.regionSlug,
            city_slug: m.citySlug,
          } satisfies SpartacusRaw,
        })
      }
      await sleep(DELAY_MS)
    }

    return items
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data as SpartacusRaw
    const category = mapCategory({ marker: d.marker, vertical: d.vertical })
    const tags = ['queer-friendly']
    if (category === 'sauna') tags.push('sauna')

    return {
      entityType: 'venue',
      sourceId: d.id,
      sourceName: 'spartacus',
      name: d.name,
      // `category` is read by commit_venue_staging_item and validated by
      // venues_category_check; a missing value becomes 'unknown', which that
      // CHECK rejects, so every row must carry one.
      category,
      location: {
        // City is deliberately the raw metro label. Spartacus is inconsistent
        // ("Malta - Valletta" is region-city, "Birmingham - West Midlands" is
        // city-region), so any split rule is wrong half the time. Coordinates
        // are always present, so the coordinate-driven linkers resolve city_id.
        city: d.city_slug ? d.city_slug.replace(/-/g, ' ') : undefined,
        country: d.country_name,
        lat: d.lat,
        lng: d.lng,
      },
      tags,
      urls: [d.url],
      metadata: {
        data_source: 'spartacus',
        url: d.url,
        id: d.id,
        vertical: d.vertical,
        marker: d.marker,
        country_slug: d.country_slug,
        region_slug: d.region_slug,
        city_slug: d.city_slug,
      },
    } as NormalizedItem
  },

  // The bare numeric id from the detail URL. This is the cross-run identity
  // key: venue_sources(source_slug='spartacus', source_entity_id) is what makes
  // commit take the UPDATE branch instead of minting a duplicate. The
  // 2026-04-26 import keyed on `spartacus:<name-slug>:<city>` instead and
  // duplicated 47% of itself. Do not change this without a migration.
  getSourceId(raw: RawItem): string {
    return String((raw.data as SpartacusRaw).id)
  },
}

Deno.serve(withErrorReporting('source-spartacus', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.batch_size || 200,
      offset: body.offset || 0,
      filters: {
        countries: body.countries || [],
        verticals: body.verticals,
        max_countries: body.max_countries,
      },
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }
    const rawItems = await spartacusAdapter.fetch(config)
    if (config.dryRun) {
      return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    }
    const written = await writeToStaging(supabase, spartacusAdapter, rawItems, {
      ...config,
      targetTable: 'venues',
    })
    return jsonResponse(
      {
        success: true,
        items: written,
        items_total: rawItems.length,
        items_processed: written,
        items_succeeded: written,
        items_failed: 0,
        next_offset: (config.offset ?? 0) + Number(body.max_countries ?? DEFAULT_MAX_COUNTRIES),
      },
      200,
      req,
    )
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
