import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Backfill Pexels images for countries missing image_url + curated_image_url.
// Idempotent. Mirrors backfill-cities-images pattern.
//
// Body params (all optional):
//   - batch_size : 1..250 (default 50)
//   - dry_run    : true → don't write

const PEXELS_SEARCH = 'https://api.pexels.com/v1/search'
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

interface CountryRow {
  id: string
  name: string
}

Deno.serve(
  withErrorReporting('backfill-countries-images', async (req) => {
    if (req.method === 'OPTIONS') return corsResponse(req)

    const supabase = getServiceClient()

    const apiKey = Deno.env.get('PEXELS_API_KEY')
    if (!apiKey) {
      return errorResponse('PEXELS_API_KEY not configured', 500, req)
    }

    const body = (await req.json().catch(() => ({}))) as {
      batch_size?: number
      dry_run?: boolean
    }
    const batchSize = Math.max(1, Math.min(250, body.batch_size ?? 50))
    const dryRun = body.dry_run === true

    const { data: rows, error } = await supabase
      .from('countries')
      .select('id, name')
      .is('image_url', null)
      .is('curated_image_url', null)
      .eq('image_flagged', false)
      .order('population', { ascending: false })
      .limit(batchSize)

    if (error) return errorResponse(`load: ${error.message}`, 500, req)

    const candidates = (rows ?? []) as unknown as CountryRow[]
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

    for (const country of candidates) {
      const query = `${country.name} country landscape travel`
      try {
        const imageUrl = await fetchPexelsImage(query, apiKey)
        if (!imageUrl) {
          if (!dryRun) {
            await supabase
              .from('countries')
              .update({ image_flagged: true })
              .eq('id', country.id)
          }
          noImage++
          continue
        }
        if (!dryRun) {
          const { error: upErr } = await supabase
            .from('countries')
            .update({ image_url: imageUrl })
            .eq('id', country.id)
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
