import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Backfill Pexels images for cities missing image_url + curated_image_url.
//
// Idempotent. Cron-scheduled (daily 04:45 UTC) until the catalog is complete;
// after that it returns "nothing to backfill" and is a no-op. Matches the
// pipeline-geo-validate auth pattern (no requireAdmin) so pg_cron can call
// with the project anon JWT. Protection against abuse is structural:
// bounded batch (≤100), image_flagged auto-throttle on miss, Pexels' own
// per-key rate limit, and the function failing fast without PEXELS_API_KEY.
//
// Per-call:
//   - batch up to 50 cities, ordered by population DESC so the biggest /
//     most-visited cities get pictures first
//   - one Pexels search per city ("{name} city skyline architecture")
//   - take the first landscape result, store the *large* URL on
//     cities.image_url. If Pexels has no result, we tag the row with
//     image_flagged=true (existing column) so subsequent runs skip it.
//
// Body params (all optional):
//   - batch_size  : 1..100 (default 50)
//   - dry_run     : true → don't write
//   - country_id  : limit to one country (operator override)

const PEXELS_SEARCH = 'https://api.pexels.com/v1/search'
const FETCH_TIMEOUT_MS = 8_000

interface PexelsPhoto {
  src?: { large?: string; large2x?: string; medium?: string }
}

interface PexelsResponse {
  photos?: PexelsPhoto[]
}

async function fetchPexelsImage(query: string, apiKey: string): Promise<string | null> {
  const url =
    `${PEXELS_SEARCH}?query=${encodeURIComponent(query)}` +
    `&per_page=1&page=1&orientation=landscape`
  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  const data = (await res.json().catch(() => null)) as PexelsResponse | null
  const photo = data?.photos?.[0]
  return photo?.src?.large ?? photo?.src?.large2x ?? photo?.src?.medium ?? null
}

interface CityRow {
  id: string
  name: string
  countries: { name: string | null } | null
}

Deno.serve(
  withErrorReporting('backfill-cities-images', async (req) => {
    if (req.method === 'OPTIONS') return corsResponse(req)

    const supabase = getServiceClient()

    const apiKey = Deno.env.get('PEXELS_API_KEY')
    if (!apiKey) {
      return errorResponse('PEXELS_API_KEY not configured', 500, req)
    }

    const body = (await req.json().catch(() => ({}))) as {
      batch_size?: number
      dry_run?: boolean
      country_id?: string
    }
    const batchSize = Math.max(1, Math.min(100, body.batch_size ?? 50))
    const dryRun = body.dry_run === true

    let q = supabase
      .from('cities')
      .select('id, name, countries:country_id(name)')
      .is('duplicate_of_id', null)
      .is('image_url', null)
      .is('curated_image_url', null)
      .eq('image_flagged', false)
      .order('population', { ascending: false })
      .limit(batchSize)

    if (body.country_id) q = q.eq('country_id', body.country_id)

    const { data: rows, error } = await q
    if (error) return errorResponse(`load: ${error.message}`, 500, req)

    const candidates = (rows ?? []) as unknown as CityRow[]
    if (candidates.length === 0) {
      return jsonResponse(
        { success: true, candidates: 0, message: 'nothing to backfill' },
        200,
        req,
      )
    }

    let updated = 0
    let noImage = 0
    let failed = 0

    for (const city of candidates) {
      const country = city.countries?.name
      const query = country
        ? `${city.name} ${country} city skyline architecture`
        : `${city.name} city skyline architecture`
      try {
        const imageUrl = await fetchPexelsImage(query, apiKey)
        if (!imageUrl) {
          // Mark so subsequent runs skip cities Pexels can't satisfy.
          if (!dryRun) {
            await supabase
              .from('cities')
              .update({ image_flagged: true })
              .eq('id', city.id)
          }
          noImage++
          continue
        }
        if (!dryRun) {
          const { error: upErr } = await supabase
            .from('cities')
            .update({ image_url: imageUrl })
            .eq('id', city.id)
          if (upErr) {
            failed++
            continue
          }
        }
        updated++
      } catch {
        failed++
      }
    }

    return jsonResponse(
      {
        success: true,
        candidates: candidates.length,
        updated,
        no_image: noImage,
        failed,
        dry_run: dryRun,
      },
      200,
      req,
    )
  }),
)
