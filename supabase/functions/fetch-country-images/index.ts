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

interface CountryImageRequest {
  countryId?: string
  countryName?: string
  capital?: string
  batchMode?: boolean
  forceUpdate?: boolean
  batchLimit?: number
}

// ---------------------------------------------------------------------------
// Country-specific search keywords (reused from get-pexels-images)
// ---------------------------------------------------------------------------

const COUNTRY_KEYWORDS: Record<string, string> = {
  'france': 'Paris Eiffel Tower France',
  'italy': 'Rome Colosseum Italy',
  'spain': 'Barcelona Sagrada Familia Spain',
  'germany': 'Berlin Brandenburg Gate Germany',
  'united kingdom': 'London Big Ben England',
  'netherlands': 'Amsterdam canals Netherlands',
  'sweden': 'Stockholm Sweden',
  'norway': 'Norway fjords landscape',
  'denmark': 'Copenhagen Denmark Nyhavn',
  'greece': 'Santorini Greece',
  'portugal': 'Lisbon Portugal',
  'switzerland': 'Swiss Alps Switzerland',
  'austria': 'Vienna Schoenbrunn Austria',
  'poland': 'Krakow Poland old town',
  'czech republic': 'Prague Czech Republic',
  'czechia': 'Prague Czech Republic',
  'hungary': 'Budapest Parliament Hungary',
  'croatia': 'Dubrovnik Croatia',
  'ireland': 'Dublin Ireland cliffs',
  'belgium': 'Brussels Grand Place Belgium',
  'finland': 'Helsinki Finland',
  'iceland': 'Iceland landscape Reykjavik',
  'romania': 'Bucharest Romania',
  'bulgaria': 'Sofia Bulgaria',
  'serbia': 'Belgrade Serbia',
  'slovenia': 'Ljubljana Slovenia',
  'slovakia': 'Bratislava Slovakia',
  'lithuania': 'Vilnius Lithuania',
  'latvia': 'Riga Latvia',
  'estonia': 'Tallinn Estonia old town',
  'malta': 'Valletta Malta',
  'luxembourg': 'Luxembourg city',
  'montenegro': 'Kotor Montenegro',
  'albania': 'Tirana Albania',
  'north macedonia': 'Skopje North Macedonia',
  'bosnia and herzegovina': 'Mostar bridge Bosnia',
  'moldova': 'Chisinau Moldova',
  'united states': 'New York City Statue of Liberty USA',
  'canada': 'Toronto skyline Canada',
  'mexico': 'Mexico City Zocalo',
  'japan': 'Tokyo Mount Fuji Japan',
  'china': 'Beijing Great Wall China',
  'india': 'Taj Mahal India',
  'south korea': 'Seoul South Korea',
  'thailand': 'Bangkok temple Thailand',
  'indonesia': 'Bali Indonesia temple',
  'vietnam': 'Hanoi Vietnam',
  'philippines': 'Manila Philippines',
  'singapore': 'Singapore Marina Bay skyline',
  'malaysia': 'Kuala Lumpur Petronas Malaysia',
  'turkey': 'Istanbul Hagia Sophia Turkey',
  'israel': 'Jerusalem Israel',
  'iran': 'Isfahan Iran mosque',
  'saudi arabia': 'Riyadh Saudi Arabia',
  'united arab emirates': 'Dubai Burj Khalifa UAE',
  'qatar': 'Doha Qatar skyline',
  'jordan': 'Petra Jordan',
  'lebanon': 'Beirut Lebanon',
  'egypt': 'Cairo Pyramids Giza Egypt',
  'south africa': 'Cape Town Table Mountain South Africa',
  'morocco': 'Marrakech Morocco medina',
  'kenya': 'Nairobi Kenya safari',
  'tanzania': 'Kilimanjaro Tanzania',
  'nigeria': 'Lagos Nigeria',
  'ghana': 'Accra Ghana',
  'ethiopia': 'Addis Ababa Ethiopia',
  'tunisia': 'Tunis Tunisia Sidi Bou Said',
  'senegal': 'Dakar Senegal',
  'brazil': 'Rio de Janeiro Christ Redeemer Brazil',
  'argentina': 'Buenos Aires Argentina',
  'chile': 'Santiago Chile Andes',
  'peru': 'Machu Picchu Peru',
  'colombia': 'Cartagena Colombia',
  'ecuador': 'Quito Ecuador',
  'uruguay': 'Montevideo Uruguay',
  'bolivia': 'La Paz Bolivia Uyuni',
  'paraguay': 'Asuncion Paraguay',
  'venezuela': 'Caracas Venezuela Angel Falls',
  'australia': 'Sydney Opera House Australia',
  'new zealand': 'Queenstown New Zealand Milford Sound',
  'fiji': 'Fiji islands tropical beach',
  'russia': 'Moscow Red Square Russia',
  'ukraine': 'Kyiv Ukraine cathedral',
  'georgia': 'Tbilisi Georgia Caucasus',
  'armenia': 'Yerevan Armenia Ararat',
  'azerbaijan': 'Baku Azerbaijan flame towers',
  'kazakhstan': 'Astana Kazakhstan',
  'uzbekistan': 'Samarkand Uzbekistan Registan',
  'cuba': 'Havana Cuba vintage cars',
  'jamaica': 'Jamaica beach Caribbean',
  'costa rica': 'Costa Rica rainforest',
  'panama': 'Panama City skyline canal',
  'guatemala': 'Antigua Guatemala',
  'nepal': 'Kathmandu Nepal Himalayas',
  'sri lanka': 'Sigiriya Sri Lanka',
  'cambodia': 'Angkor Wat Cambodia',
  'myanmar': 'Bagan Myanmar temples',
  'laos': 'Luang Prabang Laos',
  'mongolia': 'Mongolia steppe landscape',
  'bangladesh': 'Dhaka Bangladesh',
  'pakistan': 'Lahore Badshahi Mosque Pakistan',
  'afghanistan': 'Afghanistan landscape mountains',
  'iraq': 'Baghdad Iraq',
  'oman': 'Muscat Oman Sultan Qaboos mosque',
  'bahrain': 'Manama Bahrain skyline',
  'kuwait': 'Kuwait City towers',
  'taiwan': 'Taipei 101 Taiwan',
  'hong kong': 'Hong Kong Victoria Harbour skyline',
}

function getCountrySearchQuery(countryName: string, capital?: string): string {
  const key = countryName.toLowerCase()
  if (COUNTRY_KEYWORDS[key]) return COUNTRY_KEYWORDS[key]
  if (capital) return `${capital} ${countryName} landmark`
  return `${countryName} landmark famous place landscape`
}

// ---------------------------------------------------------------------------
// API fetch helpers (same pattern as fetch-city-images)
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
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=8&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=1280&format=json&origin=*`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    const pages = data.query?.pages
    if (!pages) return []

    const results: ImageResult[] = []
    for (const page of Object.values(pages) as unknown[]) {
      const info = page.imageinfo?.[0]
      if (!info) continue
      const mime = info.mime || ''
      if (!mime.startsWith('image/jpeg') && !mime.startsWith('image/png')) continue
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
        width: w, height: h, license, score: 0,
      })
    }
    return results
  } catch { return [] }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreImage(img: ImageResult, countryName: string, capital?: string): number {
  const base = sharedScoreImage({
    alt: img.alt,
    width: img.width,
    height: img.height,
    source: img.source,
    subject: { name: countryName },
    subjectType: 'country',
  })
  if (!Number.isFinite(base)) return base
  // Bonus if the country's capital is mentioned.
  if (capital && (img.alt || '').toLowerCase().includes(capital.toLowerCase())) {
    return base + 30
  }
  return base
}

async function findBestImage(
  countryName: string,
  capital: string | undefined,
  pexelsKey?: string,
  unsplashKey?: string,
): Promise<ImageResult | null> {
  const query = getCountrySearchQuery(countryName, capital)

  const fetches: Promise<ImageResult[]>[] = [fetchFromWikimedia(query)]
  if (pexelsKey) fetches.push(fetchFromPexels(pexelsKey, query))
  if (unsplashKey) fetches.push(fetchFromUnsplash(unsplashKey, query))

  let results = (await Promise.all(fetches)).flat()

  if (results.length === 0) {
    // Fallback: just the country name
    const fallback: Promise<ImageResult[]>[] = [fetchFromWikimedia(countryName)]
    if (pexelsKey) fallback.push(fetchFromPexels(pexelsKey, `${countryName} landscape`))
    results = (await Promise.all(fallback)).flat()
    if (results.length === 0) return null
  }

  for (const img of results) img.score = scoreImage(img, countryName, capital)
  const top = [...results].sort((a, b) => b.score - a.score).slice(0, 3)
  console.log(
    `[fetch-country-images] ${countryName} — top:`,
    top.map((i) => ({ source: i.source, score: i.score, alt: i.alt?.slice(0, 80) })),
  )
  return pickBest(results)
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

async function storeImage(supabase: unknown, img: ImageResult, countryId: string): Promise<string> {
  try {
    const imageRes = await fetch(img.url)
    if (!imageRes.ok) return img.url

    const buffer = await imageRes.arrayBuffer()
    const ext = img.url.includes('.png') ? 'png' : 'jpg'
    const filePath = `countries/${countryId}-${Date.now()}.${ext}`

    const { data, error } = await supabase.storage
      .from('country-images')
      .upload(filePath, buffer, {
        contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
        cacheControl: '86400',
        upsert: true,
      })

    if (error) {
      console.error('Storage upload error:', error)
      return img.url
    }

    const { data: pubUrl } = supabase.storage.from('country-images').getPublicUrl(data.path)
    return pubUrl.publicUrl
  } catch (e) {
    console.error('storeImage error:', e)
    return img.url
  }
}

// ---------------------------------------------------------------------------
// Process single country
// ---------------------------------------------------------------------------

async function processCountry(
  supabase: unknown,
  countryId: string,
  countryName: string,
  capital: string | undefined,
  pexelsKey?: string,
  unsplashKey?: string,
  forceUpdate = false,
) {
  const { data: existing } = await supabase
    .from('countries')
    .select('image_url, image_flagged, curated_image_url')
    .eq('id', countryId)
    .single()
  if (existing?.curated_image_url) {
    return { success: true, image_url: existing.curated_image_url, cached: true, source: 'curated' }
  }
  const mustRefresh = forceUpdate || !!existing?.image_flagged
  if (!mustRefresh && existing?.image_url) {
    return { success: true, image_url: existing.image_url, cached: true }
  }

  const best = await findBestImage(countryName, capital, pexelsKey, unsplashKey)
  if (!best || !isAcceptable(best.score)) {
    await supabase
      .from('countries')
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
      .eq('id', countryId)
    return { success: false, error: `No acceptable image for ${countryName}`, rejected: true }
  }

  const storedUrl = await storeImage(supabase, best, countryId)

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
    .from('countries')
    .update({
      image_url: storedUrl,
      image_metadata: metadata,
      image_flagged: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', countryId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Mirror into the image_assets registry. Best-effort — failures here log
  // but don't fail the country update. Producer-side metadata (dimensions,
  // alt, license, attribution) is richer here than for URL-mirroring
  // producers because we just decoded + scored the image.
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
    entity_type: 'country',
    entity_id: countryId,
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
    .from('countries')
    .select('id, name, capital')

  if (!forceUpdate) {
    query = query.or('image_url.is.null,image_flagged.eq.true')
  }

  const { data: countries, error } = await query.order('name').limit(batchLimit)
  if (error) throw new Error(`Failed to fetch countries: ${error.message}`)
  if (!countries?.length) return { success: true, message: 'No countries to process', processed: 0 }

  const results: unknown[] = []
  let ok = 0, fail = 0

  for (const country of countries) {
    try {
      const r = await processCountry(
        supabase, country.id, country.name, country.capital,
        pexelsKey, unsplashKey, forceUpdate,
      )
      if (r.success) ok++; else fail++
      results.push({ country: country.name, ...r })
      console.log(`[${ok + fail}/${countries.length}] ${country.name}: ${r.success ? 'OK' : r.error}`)
    } catch (e: unknown) {
      fail++
      results.push({ country: country.name, success: false, error: e.message })
    }
    await new Promise(r => setTimeout(r, 1500))
  }

  return { success: true, processed: countries.length, ok, fail, results }
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

    let body: CountryImageRequest = {}
    if (req.method === 'POST') {
      body = await req.json().catch(() => ({}))
    }

    const pexelsKey = Deno.env.get('PEXELS_API_KEY')
    const unsplashKey = Deno.env.get('UNSPLASH_ACCESS_KEY')
    if (!pexelsKey && !unsplashKey) {
      return errorResponse('No image API keys configured', 500, req)
    }

    const { countryId, countryName, capital, batchMode, forceUpdate, batchLimit } = body

    let result: unknown
    if (batchMode) {
      result = await processBatch(supabase, pexelsKey, unsplashKey, forceUpdate ?? false, batchLimit ?? 50)
    } else {
      if (!countryId || !countryName) {
        return errorResponse('countryId and countryName are required', 400, req)
      }
      result = await processCountry(
        supabase, countryId, countryName, capital,
        pexelsKey, unsplashKey, forceUpdate ?? false,
      )
    }

    return jsonResponse({ ...result, timestamp: new Date().toISOString() }, result.success ? 200 : 400, req)
  } catch (e: unknown) {
    console.error('fetch-country-images error:', e)
    return errorResponse('Internal error', 500, req)
  }
})
