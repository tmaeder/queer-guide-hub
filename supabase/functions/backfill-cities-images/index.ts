import {
  getServiceClient,
  requireInternalOrAdmin,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Backfill verified image candidates for cities missing a usable cover.
// Multiple candidates are ranked by city/country/landmark evidence. Ambiguous
// results enter review; they are never guessed into a public city record.
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

interface ImageCandidate {
  url: string
  source: 'pexels' | 'unsplash'
  sourceIdentity: string
  sourceUrl: string
  caption: string
  license: string
  width: number
  height: number
  sourceRank: number
}

async function fetchPexelsImages(query: string, apiKey: string): Promise<ImageCandidate[]> {
  const url =
    `${PEXELS_SEARCH}?query=${encodeURIComponent(query)}` +
    `&per_page=8&page=1&orientation=landscape`
  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    return []
  }
  if (!res.ok) return []
  const data = (await res.json().catch(() => null)) as {
    photos?: Array<{
      id: number
      width?: number
      height?: number
      url?: string
      photographer?: string
      alt?: string
      src?: { large?: string; large2x?: string; medium?: string }
    }>
  } | null
  return (data?.photos ?? []).flatMap((photo, index) => {
    const imageUrl = photo.src?.large2x ?? photo.src?.large ?? photo.src?.medium
    if (!imageUrl) return []
    return [{
      url: imageUrl,
      source: 'pexels' as const,
      sourceIdentity: `pexels:${photo.id}`,
      sourceUrl: photo.url ?? `https://www.pexels.com/photo/${photo.id}`,
      caption: [photo.alt, photo.photographer].filter(Boolean).join(' · '),
      license: 'Pexels License',
      width: photo.width ?? 0,
      height: photo.height ?? 0,
      sourceRank: index,
    }]
  })
}

async function fetchUnsplashImages(query: string, apiKey: string): Promise<ImageCandidate[]> {
  const url =
    `${UNSPLASH_SEARCH}?query=${encodeURIComponent(query)}` +
    `&per_page=8&orientation=landscape`
  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: `Client-ID ${apiKey}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    return []
  }
  if (!res.ok) return []
  const data = (await res.json().catch(() => null)) as {
    results?: Array<{
      id: string
      width?: number
      height?: number
      description?: string
      alt_description?: string
      urls?: { regular?: string }
      links?: { html?: string }
      user?: { name?: string }
    }>
  } | null
  return (data?.results ?? []).flatMap((photo, index) => {
    if (!photo.urls?.regular) return []
    return [{
      url: photo.urls.regular,
      source: 'unsplash' as const,
      sourceIdentity: `unsplash:${photo.id}`,
      sourceUrl: photo.links?.html ?? `https://unsplash.com/photos/${photo.id}`,
      caption: [photo.description, photo.alt_description, photo.user?.name].filter(Boolean).join(' · '),
      license: 'Unsplash License',
      width: photo.width ?? 0,
      height: photo.height ?? 0,
      sourceRank: index,
    }]
  })
}

interface CityRow {
  id: string
  name: string
  notable_landmarks: string[] | null
  field_provenance: Record<string, unknown> | null
  countries: { name: string | null } | null
}

function normalized(value: string): string {
  return value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function rankCandidate(candidate: ImageCandidate, city: CityRow): number {
  const haystack = normalized(`${candidate.caption} ${candidate.sourceUrl} ${candidate.sourceIdentity}`)
  const cityName = normalized(city.name)
  const country = normalized(city.countries?.name ?? '')
  const landmarkMatches = (city.notable_landmarks ?? [])
    .map(normalized)
    .filter((term) => term.length >= 4 && haystack.includes(term))
    .length
  return Math.max(0, 2.5 - candidate.sourceRank * 0.25)
    + (haystack.includes(cityName) ? 4 : 0)
    + (country && haystack.includes(country) ? 2 : 0)
    + Math.min(4, landmarkMatches * 2)
    + (candidate.width >= 1200 && candidate.height >= 675 ? 1 : 0)
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value)
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return value.split(/[?#]/, 1)[0].replace(/\/$/, '')
  }
}

async function validateCandidate(candidate: ImageCandidate): Promise<string | null> {
  if (candidate.width < 800 || candidate.height < 450) return null
  try {
    const response = await fetch(candidate.url, {
      headers: { Range: 'bytes=0-2047' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    const mimeType = (response.headers.get('content-type') ?? '').split(';', 1)[0].toLowerCase()
    return response.ok && mimeType.startsWith('image/') ? mimeType : null
  } catch {
    return null
  }
}

function formatFromMime(mimeType: string): string {
  const format = mimeType.replace(/^image\//, '').replace('jpg', 'jpeg')
  return ['jpeg', 'png', 'webp', 'avif', 'gif', 'svg', 'heic'].includes(format) ? format : 'other'
}

async function queueImageReview(
  supabase: ReturnType<typeof getServiceClient>,
  city: CityRow,
  reason: string,
  candidates: Array<ImageCandidate & { score: number }>,
) {
  const { error } = await supabase.from('review_queue').insert({
    entity_type: 'city',
    entity_id: city.id,
    review_type: 'CITY_IMAGE_AMBIGUOUS',
    status: 'pending',
    details: {
      city_name: city.name,
      country: city.countries?.name,
      reason,
      candidates: candidates.slice(0, 5).map((candidate) => ({
        url: candidate.url,
        source: candidate.source,
        source_identity: candidate.sourceIdentity,
        source_url: candidate.sourceUrl,
        caption: candidate.caption,
        score: candidate.score,
      })),
    },
  })
  if (error && error.code !== '23505') throw new Error(error.message)
}

Deno.serve(
  withErrorReporting('backfill-cities-images', async (req) => {
    if (req.method === 'OPTIONS') return corsResponse(req)

    const supabase = getServiceClient()
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
    const startedAt = new Date().toISOString()
    const { data: automation } = await supabase
      .from('admin_automations')
      .select('id')
      .eq('slug', 'backfill-cities-images')
      .maybeSingle()
    const { data: run } = await supabase
      .from('admin_automation_runs')
      .insert({
        automation_id: automation?.id ?? null,
        automation_slug: 'backfill-cities-images',
        started_at: startedAt,
        status: 'success',
      })
      .select('id')
      .maybeSingle()
    const finishRun = async (
      status: 'success' | 'partial' | 'error',
      examined: number,
      changed: number,
      summary: Record<string, unknown>,
      error?: string,
    ) => {
      if (run?.id) {
        await supabase.from('admin_automation_runs').update({
          finished_at: new Date().toISOString(),
          status,
          items_examined: examined,
          items_changed: changed,
          summary,
          error: error ?? null,
        }).eq('id', run.id)
      }
      if (automation?.id) {
        await supabase.from('admin_automations').update({
          last_run_at: startedAt,
          last_run_status: status,
        }).eq('id', automation.id)
      }
    }

    const pexelsKey = Deno.env.get('PEXELS_API_KEY')
    const unsplashKey = Deno.env.get('UNSPLASH_ACCESS_KEY')
    if (!pexelsKey && !unsplashKey) {
      await finishRun('error', 0, 0, { probe_ok: false }, 'image_api_key_missing')
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
      .select('id, name, notable_landmarks, field_provenance, countries:country_id(name)')
      .is('duplicate_of_id', null)
      .not('shell_status', 'in', '(ghost,merged,placeholder)')
      .eq('seo_indexable', true)
      .or('and(image_url.is.null,curated_image_url.is.null),image_flagged.eq.true')
      .order('population', { ascending: false })
      .limit(batchSize)

    if (body.country_id) q = q.eq('country_id', body.country_id)

    const { data: rows, error } = await q
    if (error) {
      await finishRun('error', 0, 0, { probe_ok: false }, 'candidate_load_failed')
      return errorResponse(`load: ${error.message}`, 500, req)
    }

    const candidates = (rows ?? []) as unknown as CityRow[]
    if (candidates.length === 0) {
      await finishRun('success', 0, 0, { probe_ok: true, backlog_empty: true })
      return jsonResponse(
        { success: true, candidates: 0, message: 'nothing to backfill' },
        200,
        req,
      )
    }

    let updated = 0
    let noImage = 0
    let ambiguous = 0
    let duplicate = 0
    let invalid = 0
    let failed = 0

    for (const city of candidates) {
      const country = city.countries?.name
      const query = country
        ? `${city.name} ${country} city skyline architecture`
        : `${city.name} city skyline architecture`
      try {
        const found = [
          ...(pexelsKey ? await fetchPexelsImages(query, pexelsKey) : []),
          ...(unsplashKey ? await fetchUnsplashImages(query, unsplashKey) : []),
        ]
        const ranked = found
          .map((candidate) => ({ ...candidate, score: rankCandidate(candidate, city) }))
          .sort((a, b) => b.score - a.score || a.sourceRank - b.sourceRank)

        if (ranked.length === 0) {
          if (!dryRun) await queueImageReview(supabase, city, 'no_candidates', ranked)
          noImage++
          continue
        }
        const best = ranked[0]
        const runnerUp = ranked[1]
        if (best.score < 5 || (runnerUp && best.score - runnerUp.score < 1)) {
          if (!dryRun) await queueImageReview(supabase, city, 'insufficient_identity_margin', ranked)
          ambiguous++
          continue
        }
        const mimeType = await validateCandidate(best)
        if (!mimeType) {
          if (!dryRun) await queueImageReview(supabase, city, 'asset_validation_failed', ranked)
          invalid++
          continue
        }

        const canonical = canonicalUrl(best.url)
        const urlHash = await sha256(canonical)
        const { data: existingAsset, error: assetError } = await supabase
          .from('image_assets')
          .select('id')
          .eq('url_hash', urlHash)
          .maybeSingle()
        if (assetError) throw new Error(assetError.message)
        if (existingAsset?.id) {
          const { count, error: linkError } = await supabase
            .from('image_asset_links')
            .select('entity_id', { head: true, count: 'exact' })
            .eq('asset_id', existingAsset.id)
            .eq('entity_type', 'city')
            .neq('entity_id', city.id)
          if (linkError) throw new Error(linkError.message)
          if ((count ?? 0) > 0) {
            if (!dryRun) await queueImageReview(supabase, city, 'asset_already_used_by_city', ranked)
            duplicate++
            continue
          }
        }

        if (!dryRun) {
          const retrievedAt = new Date().toISOString()
          const imageProvenance = {
            source: best.source,
            source_url: best.sourceUrl,
            source_identity: best.sourceIdentity,
            retrieved_at: retrievedAt,
            source_hash: urlHash,
            language: 'und',
            confidence: Math.min(1, best.score / 10),
            license: best.license,
            caption: best.caption,
          }
          const { error: upErr } = await supabase
            .from('cities')
            .update({
              image_url: best.url,
              image_flagged: false,
              field_provenance: {
                ...(city.field_provenance ?? {}),
                image_url: imageProvenance,
              },
            })
            .eq('id', city.id)
          if (upErr) {
            failed++
            continue
          }
          const { data: link, error: linkLoadError } = await supabase
            .from('image_asset_links')
            .select('asset_id')
            .eq('entity_type', 'city')
            .eq('entity_id', city.id)
            .eq('role', 'cover')
            .limit(1)
            .maybeSingle()
          if (linkLoadError || !link?.asset_id) {
            failed++
            continue
          }
          const { error: assetUpdateError } = await supabase
            .from('image_assets')
            .update({
              width: best.width,
              height: best.height,
              format: formatFromMime(mimeType),
              last_seen_at: retrievedAt,
            })
            .eq('id', link.asset_id)
          if (assetUpdateError) {
            failed++
            continue
          }
        }
        updated++
      } catch {
        failed++
      }
    }

    const summary = {
        success: true,
        probe_ok: true,
        candidates: candidates.length,
        updated,
        no_image: noImage,
        ambiguous,
        duplicate,
        invalid,
        failed,
        dry_run: dryRun,
      }
    await finishRun(failed > 0 ? 'partial' : 'success', candidates.length, updated, summary)
    return jsonResponse(
      summary,
      200,
      req,
    )
  }),
)
