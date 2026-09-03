import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'
import { writeToStaging, type NormalizedItem, type RawItem } from '../_shared/source-adapter.ts'
import {
  dedupeBySourceId,
  parseSitemapLocs,
  parseSpotPage,
  parseSpotUrl,
  type CruisingSpot,
} from '../_shared/gays-cruising-parse.ts'

// ============================================================
// Source: gays-cruising.com — cruising zones.
//
// ── SHIPPED DISABLED, ON PURPOSE ─────────────────────────────
// Their Condiciones de Uso §5 forbids reproducing or exploiting any part of the
// service without consent given "expresso y por escrito"; §12 repeats it for
// contents; §17 Spanish law, Valencia; §18 Keyup Studio S.L.
//
// So this function REFUSES to fetch unless `GAYS_CRUISING_CONSENT_REF` is set.
// The variable holds a pointer to the written consent (message id, contract
// ref, ticket) — it is not a password and nothing verifies its contents. Its
// job is to make enabling this an act that has to NAME the permission it relies
// on, so "who said we could?" has an answer in the deploy config rather than in
// somebody's memory. Deliberately fails CLOSED: unset means 428, not a fetch.
//
// There is also no entry in config.toml and no cron migration, so nothing can
// reach it on a schedule. `gaysCruisingLicence.test.ts` fails the build if
// either appears. Enabling is therefore: obtain consent -> set the env ref ->
// add verify_jwt=false -> add the cron migration. Four visible steps.
//
// ── FACTS ONLY ───────────────────────────────────────────────
// `CruisingSpot` carries no prose field. The spot write-ups are their USERS'
// text; ids, coordinates, a name and a backlink are facts. See the parser
// header — the boundary is enforced by the type and by that test.
//
// ── SHAPE ────────────────────────────────────────────────────
// 58,618 spots, republished across 8 language paths x 3 files = 24 sitemaps.
// The numeric slug id is identical across languages, so ONE language is
// fetched and `dedupeBySourceId` is a second belt. `lastmod` is uniformly
// 2025-03-01 and cannot drive an incremental sync.
//
// Category is always `cruising`, which since 20261110100000 means every row
// commits `safety_gated=true` — signed-in only, out of the sitemap, out of anon
// search. That is the entire reason the gate shipped before this did.
// ============================================================

const SOURCE_NAME = 'gays-cruising'
const ORIGIN = 'https://www.gays-cruising.com'
const SITEMAP_INDEX = `${ORIGIN}/sitemaps/sitemap_zonas_cruising_aprobadas_GC.xml`
/** One language is the whole corpus; the rest are translations of it. */
const CANONICAL_LANG = 'es'
const HARD_CAP = 500

interface SpotRaw extends Record<string, unknown> {
  spot: CruisingSpot
}

async function getText(url: string, signal?: AbortSignal): Promise<string | null> {
  assertPublicHttpUrl(url)
  const res = await fetch(url, {
    signal,
    headers: { accept: 'text/html,application/xhtml+xml,application/xml' },
  })
  // A block is not a verdict about the data. Return null so the caller tallies
  // it as unreachable rather than recording "this spot does not exist".
  if (!res.ok) return null
  return await res.text()
}

const adapter = {
  name: SOURCE_NAME,
  entityType: 'venue',

  getSourceId(raw: RawItem): string {
    return (raw.data as SpotRaw).spot.sourceId
  },

  normalize(raw: RawItem): NormalizedItem {
    const s = (raw.data as SpotRaw).spot
    return {
      entityType: 'venue',
      sourceId: s.sourceId,
      sourceName: SOURCE_NAME,
      name: s.name,
      category: 'cruising',
      location: {
        // `country` MUST be ISO-2 or absent. NEVER '' — venues_country_iso2_check
        // rejects the empty string, which silently killed 907/1851 refuge-restrooms
        // rows and 203/381 osm rows before 20260915131700.
        ...(s.countryCode ? { country: s.countryCode } : {}),
        ...(s.city ? { city: s.city } : {}),
        ...(s.lat !== undefined && s.lng !== undefined ? { lat: s.lat, lng: s.lng } : {}),
        // commit_venue_staging_item falls back to the venue name when address is
        // absent; these are laybys and parks with no street address.
        address: s.city ? `${s.name}, ${s.city}` : s.name,
      },
      metadata: {
        url: s.url,
        external_id: s.sourceId,
        attribution: 'Gays-Cruising',
        source_terms: 'Condiciones de Uso §5 — used under written consent',
      },
    } as NormalizedItem
  },

  async fetch(config: {
    batchSize: number
    offset?: number
    signal?: AbortSignal
  }): Promise<RawItem[]> {
    const indexXml = await getText(SITEMAP_INDEX, config.signal)
    if (!indexXml) return []

    const childSitemaps = parseSitemapLocs(indexXml).filter((u) =>
      u.includes(`/${CANONICAL_LANG}/`),
    )

    // Collect spot URLs up to the window this run needs.
    const offset = config.offset ?? 0
    const want = Math.min(HARD_CAP, config.batchSize) + offset
    const urls: string[] = []
    for (const sm of childSitemaps) {
      if (urls.length >= want) break
      const xml = await getText(sm, config.signal)
      if (!xml) continue
      urls.push(...parseSitemapLocs(xml).filter((u) => parseSpotUrl(u)))
    }

    const window = urls.slice(offset, want)
    const out: RawItem[] = []
    for (const url of window) {
      const html = await getText(url, config.signal)
      if (!html) continue
      const spot = parseSpotPage(html, url)
      if (!spot) continue
      out.push({ sourceId: spot.sourceId, data: { spot } })
    }
    return out
  },
}

Deno.serve(
  withErrorReporting('source-gays-cruising', async (req: Request) => {
    if (req.method === 'OPTIONS') return corsResponse(req)
    const auth = await requireInternalOrAdmin(req, getServiceClient())
    if (auth instanceof Response) return auth

    // The consent gate. Fails closed and says exactly what is missing.
    const consentRef = Deno.env.get('GAYS_CRUISING_CONSENT_REF')?.trim()
    if (!consentRef) {
      return jsonResponse(
        {
          success: false,
          skipped: true,
          reason: 'consent_not_recorded',
          detail:
            'gays-cruising.com Condiciones de Uso §5 requires express written consent from ' +
            'Keyup Studio S.L. before any part of the service may be reproduced. Set ' +
            'GAYS_CRUISING_CONSENT_REF to a pointer to that consent to enable this source.',
          items: 0,
        },
        428,
      )
    }

    try {
      const body = await req.json().catch(() => ({}))
      const batchSize = Math.min(HARD_CAP, Number(body.batchSize ?? 100))
      const offset = Number(body.offset ?? 0)
      const dryRun = body.dryRun === true

      const raws = await adapter.fetch({ batchSize, offset })
      const spots = dedupeBySourceId(raws.map((r) => (r.data as SpotRaw).spot))
      const deduped = raws.filter((r, i, a) =>
        spots.some((s) => s.sourceId === (r.data as SpotRaw).spot.sourceId) &&
        a.findIndex((x) => (x.data as SpotRaw).spot.sourceId === (r.data as SpotRaw).spot.sourceId) === i,
      )

      if (dryRun) {
        return jsonResponse({
          success: true,
          dry_run: true,
          consent_ref: consentRef,
          items: deduped.length,
          sample: deduped.slice(0, 5).map((r) => adapter.normalize(r)),
        })
      }

      const result = await writeToStaging(getServiceClient(), adapter, deduped, {
        batchSize,
        targetTable: 'venues',
        entityType: 'venue',
      })

      return jsonResponse({
        success: true,
        consent_ref: consentRef,
        items: deduped.length,
        items_total: deduped.length,
        items_processed: deduped.length,
        items_succeeded: result?.inserted ?? deduped.length,
        items_failed: result?.failed ?? 0,
      })
    } catch (err) {
      return errorResponse(err as Error)
    }
  }),
)
