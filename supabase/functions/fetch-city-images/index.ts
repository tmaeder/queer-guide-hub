import { getCorsHeaders, getServiceClient, requireAdmin, errorResponse, jsonResponse } from '../_shared/supabase-client.ts'

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

function scoreImage(img: ImageResult, cityName: string, countryName: string): number {
  let score = 0
  const alt = (img.alt || '').toLowerCase()
  const cityLower = cityName.toLowerCase()
  const countryLower = countryName.toLowerCase()

  // Highest priority: alt text contains the city name
  if (alt.includes(cityLower)) score += 50

  // Also good: alt text contains country name
  if (countryLower && alt.includes(countryLower)) score += 20

  // Wikimedia images are more likely to be correctly tagged
  if (img.source === 'wikimedia') score += 15
  else if (img.source === 'unsplash') score += 5

  // Prefer landscape orientation and decent size
  if (img.width && img.height) {
    const ratio = img.width / img.height
    if (ratio >= 1.3 && ratio <= 2.5) score += 10
    if (img.width >= 1280) score += 5
  }

  // Penalize generic stock-photo alt text
  const genericTerms = ['skyscraper', 'modern building', 'abstract', 'business', 'office']
  for (const term of genericTerms) {
    if (alt.includes(term) && !alt.includes(cityLower)) score -= 10
  }

  return score
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
    fallbackResults.sort((a, b) => b.score - a.score)
    return fallbackResults[0]
  }

  // Score and pick the best
  for (const img of results) {
    img.score = scoreImage(img, cityName, countryName)
  }
  results.sort((a, b) => b.score - a.score)
  return results[0]
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
  // Skip if already has image (unless force)
  if (!forceUpdate) {
    const { data: existing } = await supabase
      .from('cities')
      .select('image_url')
      .eq('id', cityId)
      .single()
    if (existing?.image_url) {
      return { success: true, image_url: existing.image_url, cached: true }
    }
  }

  const best = await findBestImage(cityName, countryName, pexelsKey, unsplashKey)
  if (!best) {
    return { success: false, error: `No images found for ${cityName}` }
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
    .update({ image_url: storedUrl, image_metadata: metadata, updated_at: new Date().toISOString() })
    .eq('id', cityId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

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
    query = query.is('image_url', null)
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
