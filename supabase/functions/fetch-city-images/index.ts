import { getCorsHeaders, getServiceClient, requireAdmin, errorResponse, jsonResponse } from '../_shared/supabase-client.ts'
import { scoreImage as sharedScoreImage, pickBest, isAcceptable, MIN_ACCEPTANCE_SCORE } from '../_shared/scoreImage.ts'
import { upsertImageAsset, deriveImageFormat } from '../_shared/image-assets.ts'

interface ImageResult {
  url: string
  thumbnail: string
  alt: string
  photographer: string
  photographer_url: string
  source: 'pexels' | 'unsplash' | 'wikimedia'
  source_id: string
  width?: number
  height?: number
  license?: string
  score: number
}

interface CityImageRequest {
  cityId?: string
  cityName?: string
  countryName?: string
  batchMode?: boolean
  forceUpdate?: boolean
  batchLimit?: number
}

// ---------------------------------------------------------------------------
// API fetch helpers
// ---------------------------------------------------------------------------

async function fetchFromPexels(apiKey: string, query: string): Promise<ImageResult[]> {
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`,
      { headers: { Authorization: apiKey } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.photos ?? []).map((p: Record<string, unknown>) => ({
      url: p.src.large2x || p.src.large,
      thumbnail: p.src.medium,
      alt: p.alt || query,
      photographer: p.photographer,
      photographer_url: p.photographer_url,
      source: 'pexels' as const,
      source_id: String(p.id),
      width: p.width,
      height: p.height,
      score: 0,
    }))
  } catch { return [] }
}

async function fetchFromUnsplash(apiKey: string, query: string): Promise<ImageResult[]> {
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${apiKey}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map((p: Record<string, unknown>) => ({
      url: p.urls.regular,
      thumbnail: p.urls.small,
      alt: p.alt_description || p.description || query,
      photographer: p.user.name,
      photographer_url: p.user.links.html,
      source: 'unsplash' as const,
      source_id: p.id,
      width: p.width,
      height: p.height,
      score: 0,
    }))
  } catch { return [] }
}

async function fetchFromWikimedia(query: string): Promise<ImageResult[]> {
  try {
    // Search Wikimedia Commons for images related to the place
    const searchQuery = `${query} view`
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(searchQuery)}&gsrlimit=8&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=1280&format=json&origin=*`

    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()

    const pages = data.query?.pages
    if (!pages) return []

    const results: ImageResult[] = []
    for (const page of Object.values(pages) as unknown[]) {
      const info = page.imageinfo?.[0]
      if (!info) continue

      // Only JPEG/PNG images
      const mime = info.mime || ''
      if (!mime.startsWith('image/jpeg') && !mime.startsWith('image/png')) continue

      // Skip tiny images and non-landscape
      const w = info.width || 0
      const h = info.height || 0
      if (w < 800 || h < 400 || w < h) continue

      const meta = info.extmetadata || {}
      const desc = meta.ImageDescription?.value?.replace(/<[^>]*>/g, '') || ''
      const artist = meta.Artist?.value?.replace(/<[^>]*>/g, '') || 'Unknown'
      const license = meta.LicenseShortName?.value || 'CC'

      results.push({
        url: info.thumburl || info.url,
        thumbnail: info.thumburl || info.url,
        alt: desc || page.title?.replace('File:', '') || query,
        photographer: artist,
        photographer_url: info.descriptionurl || '',
        source: 'wikimedia',
        source_id: String(page.pageid),
        width: w,
        height: h,
        license,
        score: 0,
      })
    }
    return results
  } catch { return [] }
}

// ---------------------------------------------------------------------------
// Scoring: pick the image most likely to actually depict the target place
// ---------------------------------------------------------------------------

// Known coastal/port cities — ferries and ships are acceptable depictions.
const COASTAL_CITIES = new Set([
  'amsterdam', 'venice', 'venezia', 'istanbul', 'stockholm', 'copenhagen',
  'hamburg', 'rotterdam', 'hong kong', 'singapore', 'sydney', 'naples',
  'lisbon', 'lisboa', 'oslo', 'helsinki', 'piraeus', 'genoa', 'marseille',
  'san francisco', 'seattle', 'vancouver', 'dubrovnik', 'santorini',
  'mykonos', 'rhodes', 'heraklion', 'split', 'valletta', 'reykjavik',
  'tallinn', 'riga', 'gdansk', 'cartagena', 'havana', 'miami',
])

function scoreImage(img: ImageResult, cityName: string, countryName: string): number {
  return sharedScoreImage({
    alt: img.alt,
    width: img.width,
    height: img.height,
    source: img.source,
    subject: { name: cityName, country: countryName },
    subjectType: 'city',
    isPortOrCoastal: COASTAL_CITIES.has(cityName.toLowerCase()),
  })
}

// ---------------------------------------------------------------------------
// Search orchestration: query all sources in parallel, score, pick best
// ---------------------------------------------------------------------------

async function findBestImage(
  cityName: string,
  countryName: string,
  pexelsKey?: string,
  unsplashKey?: string,
): Promise<ImageResult | null> {
  // Primary query: specific place name
  const primaryQuery = countryName ? `${cityName} ${countryName}` : cityName

  // Fetch from all sources in parallel
  const fetches: Promise<ImageResult[]>[] = [
    fetchFromWikimedia(primaryQuery),
  ]
  if (pexelsKey) fetches.push(fetchFromPexels(pexelsKey, primaryQuery))
  if (unsplashKey) fetches.push(fetchFromUnsplash(unsplashKey, primaryQuery))

  const results = (await Promise.all(fetches)).flat()

  if (results.length === 0) {
    // Fallback: broader search without country
    const fallbackQuery = `${cityName} city landmark`
    const fallbackFetches: Promise<ImageResult[]>[] = [
      fetchFromWikimedia(cityName),
    ]
    if (pexelsKey) fallbackFetches.push(fetchFromPexels(pexelsKey, fallbackQuery))
    if (unsplashKey) fallbackFetches.push(fetchFromUnsplash(unsplashKey, fallbackQuery))

    const fallbackResults = (await Promise.all(fallbackFetches)).flat()
    if (fallbackResults.length === 0) return null

    for (const img of fallbackResults) {
      img.score = scoreImage(img, cityName, countryName)
    }
    logTopCandidates(fallbackResults, `${cityName} (fallback)`)
    return pickBest(fallbackResults)
  }

  for (const img of results) {
    img.score = scoreImage(img, cityName, countryName)
  }
  logTopCandidates(results, cityName)
  return pickBest(results)
}

function logTopCandidates(imgs: ImageResult[], label: string) {
  const top = [...imgs].sort((a, b) => b.score - a.score).slice(0, 3)
  console.log(
    `[fetch-city-images] ${label} — top candidates:`,
    top.map((i) => ({ source: i.source, score: i.score, alt: i.alt?.slice(0, 80) })),
  )
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

async function storeImage(supabase: unknown, img: ImageResult, entityId: string, bucket: string): Promise<string> {
  try {
    const imageRes = await fetch(img.url)
    if (!imageRes.ok) return img.url

    const buffer = await imageRes.arrayBuffer()
    const ext = img.url.includes('.png') ? 'png' : 'jpg'
    const filePath = `cities/${entityId}-${Date.now()}.${ext}`

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
        cacheControl: '86400',
        upsert: true,
      })

    if (error) {
      console.error('Storage upload error:', error)
      return img.url
    }

    const { data: pubUrl } = supabase.storage.from(bucket).getPublicUrl(data.path)
    return pubUrl.publicUrl
  } catch (e) {
    console.error('storeImage error:', e)
    return img.url
  }
}

// ---------------------------------------------------------------------------
// Process single city
// ---------------------------------------------------------------------------

async function processSingleCity(
  supabase: unknown,
  cityId: string,
  cityName: string,
  countryName: string,
  pexelsKey?: string,
  unsplashKey?: string,
  forceUpdate = false,
) {
  // Honor curated_image_url, existing image (unless force/flagged)
  const { data: existing } = await supabase
    .from('cities')
    .select('image_url, image_flagged, curated_image_url')
    .eq('id', cityId)
    .single()
  if (existing?.curated_image_url) {
    return { success: true, image_url: existing.curated_image_url, cached: true, source: 'curated' }
  }
  const mustRefresh = forceUpdate || !!existing?.image_flagged
  if (!mustRefresh && existing?.image_url) {
    return { success: true, image_url: existing.image_url, cached: true }
  }

  const best = await findBestImage(cityName, countryName, pexelsKey, unsplashKey)
  if (!best || !isAcceptable(best.score)) {
    // Persist null + rejection metadata rather than a bad image.
    await supabase
      .from('cities')
      .update({
        image_url: null,
        image_metadata: {
          rejected: true,
          reason: best ? `score ${best.score} < ${MIN_ACCEPTANCE_SCORE}` : 'no candidates',
          updated_at: new Date().toISOString(),
        },
        image_flagged: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cityId)
    return { success: false, error: `No acceptable image for ${cityName}`, rejected: true }
  }

  const storedUrl = await storeImage(supabase, best, cityId, 'city-images')

  const metadata = {
    thumbnail: best.thumbnail,
    alt: best.alt,
    photographer: best.photographer,
    photographer_url: best.photographer_url,
    source: best.source,
    source_id: best.source_id,
    license: best.license,
    score: best.score,
    stored_locally: storedUrl !== best.url,
    updated_at: new Date().toISOString(),
  }

  const { error: updateError } = await supabase
    .from('cities')
    .update({
      image_url: storedUrl,
      image_metadata: metadata,
      image_flagged: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cityId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Mirror into the image_assets registry. Best-effort — failures here log
  // but don't fail the city update. Producer-side metadata (dimensions, alt,
  // license, attribution) is richer here than for URL-mirroring producers
  // because we just decoded + scored the image.
  await upsertImageAsset(supabase, {
    url: storedUrl,
    source: 'scraper',
    source_ref: `${best.source}:${best.source_id}`,
    license: best.license ?? null,
    attribution: best.photographer ?? null,
    alt_text: best.alt ?? null,
    alt_provenance: 'imported',
    width: best.width ?? null,
    height: best.height ?? null,
    format: deriveImageFormat(storedUrl) ?? deriveImageFormat(best.url),
    entity_type: 'city',
    entity_id: cityId,
    role: 'cover',
  })

  return { success: true, image_url: storedUrl, image_metadata: metadata, cached: false }
}

// ---------------------------------------------------------------------------
// Batch mode
// ---------------------------------------------------------------------------

async function processBatch(
  supabase: unknown,
  pexelsKey?: string,
  unsplashKey?: string,
  forceUpdate = false,
  batchLimit = 50,
) {
  let query = supabase
    .from('cities')
    .select('id, name, countries(name)')

  if (!forceUpdate) {
    // Pick rows missing image OR flagged for refresh.
    query = query.or('image_url.is.null,image_flagged.eq.true')
  }

  const { data: cities, error } = await query.order('name').limit(batchLimit)

  if (error) throw new Error(`Failed to fetch cities: ${error.message}`)
  if (!cities?.length) return { success: true, message: 'No cities to process', processed: 0 }

  const results: unknown[] = []
  let ok = 0, fail = 0

  for (const city of cities) {
    try {
      const r = await processSingleCity(
        supabase, city.id, city.name, city.countries?.name || '',
        pexelsKey, unsplashKey, forceUpdate,
      )
      if (r.success) ok++; else fail++
      results.push({ city: city.name, ...r })
    } catch (e: unknown) {
      fail++
      results.push({ city: city.name, success: false, error: e.message })
    }
    // Rate-limit: 1.5s between API calls
    await new Promise(r => setTimeout(r, 1500))
  }

  return { success: true, processed: cities.length, ok, fail, results }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = getServiceClient()
    const auth = await requireAdmin(req, supabase)
    if (auth instanceof Response) return auth

    let body: CityImageRequest = {}
    if (req.method === 'POST') {
      body = await req.json().catch(() => ({}))
    }

    const pexelsKey = Deno.env.get('PEXELS_API_KEY')
    const unsplashKey = Deno.env.get('UNSPLASH_ACCESS_KEY')
    if (!pexelsKey && !unsplashKey) {
      return errorResponse('No image API keys configured (PEXELS_API_KEY or UNSPLASH_ACCESS_KEY)', 500, req)
    }

    const { cityId, cityName, countryName, batchMode, forceUpdate, batchLimit } = body

    let result: unknown
    if (batchMode) {
      result = await processBatch(supabase, pexelsKey, unsplashKey, forceUpdate ?? false, batchLimit ?? 50)
    } else {
      if (!cityId || !cityName) {
        return errorResponse('cityId and cityName are required', 400, req)
      }
      result = await processSingleCity(
        supabase, cityId, cityName, countryName || '',
        pexelsKey, unsplashKey, forceUpdate ?? false,
      )
    }

    return jsonResponse({ ...result, timestamp: new Date().toISOString() }, result.success ? 200 : 400, req)
  } catch (e: unknown) {
    console.error('fetch-city-images error:', e)
    return errorResponse('Internal error', 500, req)
  }
})
