import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { fetchWikipediaImage, fetchFirstPexelsUrl } from '../_shared/image-search.ts'

// Backfill images for public personalities missing image_url.
// Strategy: Wikipedia first (authoritative, free), fall back to Pexels.
//
// Body params (all optional):
//   - batch_size : 1..50 (default 20)
//   - dry_run    : true → don't write

Deno.serve(
  withErrorReporting('backfill-personality-images', async (req) => {
    if (req.method === 'OPTIONS') return corsResponse(req)

    const supabase = getServiceClient()

    const pexelsKey = Deno.env.get('PEXELS_API_KEY')

    const body = (await req.json().catch(() => ({}))) as {
      batch_size?: number
      dry_run?: boolean
    }
    const batchSize = Math.max(1, Math.min(50, body.batch_size ?? 20))
    const dryRun = body.dry_run === true

    const { data: rows, error } = await supabase
      .from('personalities')
      .select('id, name, profession')
      .is('image_url', null)
      .eq('visibility', 'public')
      .order('name')
      .limit(batchSize)

    if (error) return errorResponse(`load: ${error.message}`, 500, req)

    const candidates = (rows ?? []) as { id: string; name: string; profession: string | null }[]
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
    const results: { name: string; source: string | null }[] = []

    for (const p of candidates) {
      try {
        // Try Wikipedia first — most accurate for real people
        let imageUrl = await fetchWikipediaImage(p.name)
        let source = imageUrl ? 'wikipedia' : null

        // Fall back to Pexels if Wikipedia has nothing and key is available
        if (!imageUrl && pexelsKey) {
          const query = p.profession
            ? `${p.name} ${p.profession}`
            : p.name
          imageUrl = await fetchFirstPexelsUrl(pexelsKey, query)
          source = imageUrl ? 'pexels' : null
        }

        if (!imageUrl) {
          noImage++
          results.push({ name: p.name, source: null })
          continue
        }

        if (!dryRun) {
          const { error: upErr } = await supabase
            .from('personalities')
            .update({ image_url: imageUrl })
            .eq('id', p.id)
          if (upErr) {
            failed++
            continue
          }
        }
        updated++
        results.push({ name: p.name, source })
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
        results,
      },
      200,
      req,
    )
  }),
)
