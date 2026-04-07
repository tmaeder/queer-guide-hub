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

async function fetchFromPexels(apiKey: string, q: string): Promise<ImageResult[]> {
  try {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=5&orientation=landscape`,
      { headers: { Authorization: apiKey } },
    )
    if (!r.ok) return []
    const d = await r.json()
    return (d.photos ?? []).map((p: any) => ({
      url: p.src.large2x || p.src.large, thumbnail: p.src.medium, alt: p.alt || q,
      photographer: p.photographer, photographer_url: p.photographer_url,
      source: 'pexels' as const, source_id: String(p.id),
      width: p.width, height: p.height, score: 0,
    }))
  } catch { return [] }
}

async function fetchFromUnsplash(apiKey: string, q: string): Promise<ImageResult[]> {
  try {
    const r = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=5&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${apiKey}` } },
    )
    if (!r.ok) return []
    const d = await r.json()
    return (d.results ?? []).map((p: any) => ({
      url: p.urls.regular, thumbnail: p.urls.small,
      alt: p.alt_description || p.description || q,
      photographer: p.user.name, photographer_url: p.user.links.html,
      source: 'unsplash' as const, source_id: p.id,
      width: p.width, height: p.height, score: 0,
    }))
  } catch { return [] }
}

async function fetchFromWikimedia(q: string): Promise<ImageResult[]> {
  try {
    const r = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q)}&gsrlimit=10&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=1280&format=json&origin=*`,
    )
    if (!r.ok) return []
    const d = await r.json()
    const pages = d.query?.pages
    if (!pages) return []
    const out: ImageResult[] = []
    for (const pg of Object.values(pages) as any[]) {
      const i = pg.imageinfo?.[0]
      if (!i) continue
      const m = i.mime || ''
      if (!m.startsWith('image/jpeg') && !m.startsWith('image/png')) continue
      const w = i.width || 0, h = i.height || 0
      if (w < 600 || h < 300) continue
      const meta = i.extmetadata || {}
      const desc = meta.ImageDescription?.value?.replace(/<[^>]*>/g, '') || ''
      const art = meta.Artist?.value?.replace(/<[^>]*>/g, '') || 'Unknown'
      const lic = meta.LicenseShortName?.value || 'CC'
      out.push({
        url: i.thumburl || i.url, thumbnail: i.thumburl || i.url,
        alt: desc || pg.title?.replace('File:', '') || q,
        photographer: art, photographer_url: i.descriptionurl || '',
        source: 'wikimedia', source_id: String(pg.pageid),
        width: w, height: h, license: lic, score: 0,
      })
    }
    return out
  } catch { return [] }
}

function scoreImage(img: ImageResult, villageName: string, cityName: string): number {
  let s = 0
  const alt = (img.alt || '').toLowerCase()
  const vl = villageName.toLowerCase()
  const cl = cityName.toLowerCase()

  // Queer relevance (highest priority)
  const queerTerms = ['pride', 'gay', 'lgbtq', 'lgbt', 'queer', 'rainbow', 'drag', 'trans', 'lesbian', 'parade', 'march']
  let queer = false
  for (const t of queerTerms) {
    if (alt.includes(t)) { s += 30; queer = true; break }
  }

  // Geographic relevance
  if (alt.includes(vl)) s += 40
  if (alt.includes(cl)) s += 20

  // Bonus: both queer AND geographic
  if (queer && (alt.includes(vl) || alt.includes(cl))) s += 25

  // Source preference
  if (img.source === 'wikimedia') s += 10
  else if (img.source === 'unsplash') s += 5

  // Image quality
  if (img.width && img.height && img.width / img.height >= 1.2) s += 5

  // Penalize maps, diagrams
  for (const t of ['locator', 'map', 'diagram', 'logo', '.png', 'community.png']) {
    if (alt.includes(t)) s -= 30
  }

  return s
}

async function findBestImage(
  village: string, city: string, country: string,
  pK?: string, uK?: string,
): Promise<ImageResult | null> {
  // Search with queer+geo query
  const q = `${village} ${city} pride gay lgbtq`
  const f: Promise<ImageResult[]>[] = [fetchFromWikimedia(`${village} ${city} pride`)]
  if (pK) f.push(fetchFromPexels(pK, q))
  if (uK) f.push(fetchFromUnsplash(uK, q))
  let res = (await Promise.all(f)).flat()

  // If no good results, try without queer terms
  if (!res.length || Math.max(...res.map(i => scoreImage(i, village, city))) < 30) {
    const q2 = `${village} ${city} ${country}`
    const f2: Promise<ImageResult[]>[] = [fetchFromWikimedia(q2)]
    if (pK) f2.push(fetchFromPexels(pK, q2))
    const res2 = (await Promise.all(f2)).flat()
    res.push(...res2)
  }

  if (!res.length) return null
  for (const i of res) i.score = scoreImage(i, village, city)
  const seen = new Set<string>()
  res = res.filter(i => { if (seen.has(i.source_id)) return false; seen.add(i.source_id); return true })
  res.sort((a, b) => b.score - a.score)
  return res[0]
}

async function storeImage(supabase: any, img: ImageResult, id: string): Promise<string> {
  try {
    const r = await fetch(img.url)
    if (!r.ok) return img.url
    const buf = await r.arrayBuffer()
    const ext = img.url.includes('.png') ? 'png' : 'jpg'
    const path = `villages/${id}-${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from('village-images').upload(path, buf, {
      contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
      cacheControl: '86400', upsert: true,
    })
    if (error) { console.error('Upload:', error); return img.url }
    const { data: pu } = supabase.storage.from('village-images').getPublicUrl(data.path)
    return pu.publicUrl
  } catch (e) { console.error('store:', e); return img.url }
}

async function processVillage(
  supabase: any, id: string, name: string, city: string, country: string,
  pK?: string, uK?: string,
) {
  const best = await findBestImage(name, city, country, pK, uK)
  if (!best) return { success: false, error: `No images for ${name}` }
  const url = await storeImage(supabase, best, id)
  const md = {
    thumbnail: best.thumbnail, alt: best.alt,
    photographer: best.photographer, photographer_url: best.photographer_url,
    source: best.source, source_id: best.source_id,
    license: best.license, score: best.score,
    stored_locally: url !== best.url,
    has_queer_content: best.score >= 60,
    updated_at: new Date().toISOString(),
  }
  const { error: ue } = await supabase.from('queer_villages')
    .update({ image_url: url, image_metadata: md, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (ue) return { success: false, error: ue.message }
  return { success: true, image_url: url, image_metadata: md }
}

async function processBatch(
  supabase: any, pK?: string, uK?: string, limit = 25, offset = 0,
) {
  const { data: rows, error } = await supabase
    .from('queer_villages')
    .select('id, name, cities(name), countries(name)')
    .is('image_metadata', null)
    .order('name')
    .limit(limit)
  if (error) throw new Error(error.message)
  if (!rows?.length) return { success: true, message: 'Nothing to process', processed: 0 }
  const res: any[] = []
  let ok = 0, fail = 0
  for (const v of rows) {
    try {
      const r = await processVillage(
        supabase, v.id, v.name, v.cities?.name || '', v.countries?.name || '', pK, uK,
      )
      if (r.success) ok++; else fail++
      res.push({ village: v.name, ...r })
      console.log(`[${ok + fail}/${rows.length}] ${v.name}: ${r.success ? 'OK' : r.error}`)
    } catch (e: any) {
      fail++
      res.push({ village: v.name, success: false, error: e.message })
    }
    await new Promise(r => setTimeout(r, 800))
  }
  return { success: true, processed: rows.length, ok, fail, results: res }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = getServiceClient()
    const auth = await requireAdmin(req, supabase)
    if (auth instanceof Response) return auth

    let body: any = {}
    if (req.method === 'POST') body = await req.json().catch(() => ({}))

    const pK = Deno.env.get('PEXELS_API_KEY')
    const uK = Deno.env.get('UNSPLASH_ACCESS_KEY')
    if (!pK && !uK) return errorResponse('No image API keys configured', 500, req)

    const { batchMode, batchLimit, villageId, villageName, cityName, countryName } = body
    let result: any
    if (batchMode) {
      result = await processBatch(supabase, pK, uK, batchLimit ?? 25)
    } else {
      if (!villageId || !villageName) return errorResponse('villageId and villageName required', 400, req)
      result = await processVillage(supabase, villageId, villageName, cityName || '', countryName || '', pK, uK)
    }
    return jsonResponse({ ...result, timestamp: new Date().toISOString() }, result.success ? 200 : 400, req)
  } catch (e: any) {
    console.error('fetch-village-images:', e)
    return errorResponse('Internal error', 500, req)
  }
})
