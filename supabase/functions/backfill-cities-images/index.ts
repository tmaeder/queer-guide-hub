import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Backfill images for cities missing image_url + curated_image_url.
// Tries Pexels first, falls back to Unsplash. Only sets image_flagged=true
// when both sources return nothing (genuinely unfindable city).
//
// Idempotent. Cron-scheduled (daily 04:45 UTC). Ordered by population DESC
// so the most-visited cities get pictures first.
//
// Body params (all optional):
//   - batch_size  : 1..100 (default 50)
//   - dry_run     : true → don't write
//   - country_id  : limit to one country (operator override)

const PEXELS_SEARCH = 'https://api.pexels.com/v1/search'
const UNSPLASH_SEARCH = 'https://api.unsplash.com/search/photos'
const FETCH_TIMEOUT_MS = 8_000

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
  const data = (await res.json().catch(() => null)) as { photos?: { src?: { large?: string; large2x?: string; medium?: string } }[] } | null
  const photo = data?.photos?.[0]
  return photo?.src?.large2x ?? photo?.src?.large ?? photo?.src?.medium ?? null
}

async function fetchUnsplashImage(query: string, apiKey: string): Promise<string | null> {
  const url =
    `${UNSPLASH_SEARCH}?query=${encodeURIComponent(query)}` +
    `&per_page=1&orientation=landscape`
  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: `Client-ID ${apiKey}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  const data = (await res.json().catch(() => null)) as { results?: { urls?: { regular?: string } }[] } | null
  return data?.results?.[0]?.urls?.regular ?? null
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

    const pexelsKey = Deno.env.get('PEXELS_API_KEY')
    const unsplashKey = Deno.env.get('UNSPLASH_ACCESS_KEY')
    if (!pexelsKey && !unsplashKey) {
      return errorResponse('No image API key configured (PEXELS_API_KEY or UNSPLASH_ACCESS_KEY)', 500, req)
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
        let imageUrl: string | null = null
        if (pexelsKey) imageUrl = await fetchPexelsImage(query, pexelsKey)
        if (!imageUrl && unsplashKey) imageUrl = await fetchUnsplashImage(query, unsplashKey)

        if (!imageUrl) {
          // Only flag when both sources have nothing — genuinely unfindable.
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
