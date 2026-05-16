/**
 * Unified image fetcher for all entity types.
 * Replaces: fetch-city-images, fetch-country-images, fetch-village-images,
 *           fetch-venue-images, fetch-event-images, fetch-personality-images
 *
 * POST body: { entity_type, batchMode?, batchLimit?, forceUpdate?, dry_run?, ...entityParams }
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { getCorsHeaders, getServiceClient, requireAdmin, errorResponse, jsonResponse } from '../_shared/supabase-client.ts'
import { scoreImage as sharedScoreImage, pickBest, isAcceptable, MIN_ACCEPTANCE_SCORE } from '../_shared/scoreImage.ts'
import { upsertImageAsset, deriveImageFormat } from '../_shared/image-assets.ts'
import {
  type ImageResult,
  fetchFromPexels,
  fetchFromUnsplash,
  fetchFromWikimedia,
  fetchWikipediaImage,
  fetchFirstPexelsUrl,
  fetchFirstUnsplashUrl,
  storeImageToStorage,
} from '../_shared/image-search.ts'

// ---------------------------------------------------------------------------
// Entity-specific config
// ---------------------------------------------------------------------------

const COASTAL_CITIES = new Set([
  'amsterdam', 'venice', 'venezia', 'istanbul', 'stockholm', 'copenhagen',
  'hamburg', 'rotterdam', 'hong kong', 'singapore', 'sydney', 'naples',
  'lisbon', 'lisboa', 'oslo', 'helsinki', 'piraeus', 'genoa', 'marseille',
  'san francisco', 'seattle', 'vancouver', 'dubrovnik', 'santorini',
  'mykonos', 'rhodes', 'heraklion', 'split', 'valletta', 'reykjavik',
  'tallinn', 'riga', 'gdansk', 'cartagena', 'havana', 'miami',
])

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

// ---------------------------------------------------------------------------
// Scored image search (city, country, village)
// ---------------------------------------------------------------------------

function scoreCityImage(img: ImageResult, cityName: string, countryName: string): number {
  return sharedScoreImage({
    alt: img.alt,
    width: img.width,
    height: img.height,
    source: img.source as 'pexels' | 'unsplash' | 'wikimedia',
    subject: { name: cityName, country: countryName },
    subjectType: 'city',
    isPortOrCoastal: COASTAL_CITIES.has(cityName.toLowerCase()),
  })
}

function scoreCountryImage(img: ImageResult, countryName: string, capital?: string): number {
  const base = sharedScoreImage({
    alt: img.alt,
    width: img.width,
    height: img.height,
    source: img.source as 'pexels' | 'unsplash' | 'wikimedia',
    subject: { name: countryName },
    subjectType: 'country',
  })
  if (!Number.isFinite(base)) return base
  if (capital && (img.alt || '').toLowerCase().includes(capital.toLowerCase())) return base + 30
  return base
}

function scoreVillageImage(img: ImageResult, villageName: string, cityName: string): number {
  let s = 0
  const alt = (img.alt || '').toLowerCase()
  const vl = villageName.toLowerCase()
  const cl = cityName.toLowerCase()

  const queerTerms = ['pride', 'gay', 'lgbtq', 'lgbt', 'queer', 'rainbow', 'drag', 'trans', 'lesbian', 'parade', 'march']
  let queer = false
  for (const t of queerTerms) {
    if (alt.includes(t)) { s += 30; queer = true; break }
  }
  if (alt.includes(vl)) s += 40
  if (alt.includes(cl)) s += 20
  if (queer && (alt.includes(vl) || alt.includes(cl))) s += 25
  if (img.source === 'wikimedia') s += 10
  else if (img.source === 'unsplash') s += 5
  if (img.width && img.height && img.width / img.height >= 1.2) s += 5
  for (const t of ['locator', 'map', 'diagram', 'logo', '.png', 'community.png']) {
    if (alt.includes(t)) s -= 30
  }
  return s
}

async function findBestScoredImage(
  queries: string[],
  scoreFn: (img: ImageResult) => number,
  pexelsKey?: string,
  unsplashKey?: string,
): Promise<ImageResult | null> {
  for (const query of queries) {
    const fetches: Promise<ImageResult[]>[] = [fetchFromWikimedia(query)]
    if (pexelsKey) fetches.push(fetchFromPexels(pexelsKey, query))
    if (unsplashKey) fetches.push(fetchFromUnsplash(unsplashKey, query))

    const results = (await Promise.all(fetches)).flat()
    if (results.length === 0) continue

    for (const img of results) img.score = scoreFn(img)
    const best = pickBest(results)
    if (best) return best
  }
  return null
}

// ---------------------------------------------------------------------------
// City processing
// ---------------------------------------------------------------------------


async function processCity(supabase: SupabaseClient, id: string, name: string, country: string, pK?: string, uK?: string, force = false) {
  const { data: existing } = await supabase.from('cities').select('image_url, image_flagged, curated_image_url').eq('id', id).single()
  if (existing?.curated_image_url) return { success: true, image_url: existing.curated_image_url, cached: true, source: 'curated' }
  if (!force && !existing?.image_flagged && existing?.image_url) return { success: true, image_url: existing.image_url, cached: true }

  const queries = [
    country ? `${name} ${country}` : name,
    `${name} city landmark`,
  ]
  const best = await findBestScoredImage(queries, (img) => scoreCityImage(img, name, country), pK, uK)

  if (!best || !isAcceptable(best.score)) {
    await supabase.from('cities').update({
      image_url: null,
      image_metadata: { rejected: true, reason: best ? `score ${best.score} < ${MIN_ACCEPTANCE_SCORE}` : 'no candidates', updated_at: new Date().toISOString() },
      image_flagged: false, updated_at: new Date().toISOString(),
    }).eq('id', id)
    return { success: false, error: `No acceptable image for ${name}`, rejected: true }
  }

  const storedUrl = await storeImageToStorage(supabase, best.url, 'city-images', 'cities', id)
  const metadata = { thumbnail: best.thumbnail, alt: best.alt, photographer: best.photographer, photographer_url: best.photographer_url, source: best.source, source_id: best.source_id, license: best.license, score: best.score, stored_locally: storedUrl !== best.url, updated_at: new Date().toISOString() }

  const { error } = await supabase.from('cities').update({ image_url: storedUrl, image_metadata: metadata, image_flagged: false, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { success: false, error: error.message }

  await upsertImageAsset(supabase, { url: storedUrl, source: 'scraper', source_ref: `${best.source}:${best.source_id}`, license: best.license ?? null, attribution: best.photographer ?? null, alt_text: best.alt ?? null, alt_provenance: 'imported', width: best.width ?? null, height: best.height ?? null, format: deriveImageFormat(storedUrl) ?? deriveImageFormat(best.url), entity_type: 'city', entity_id: id, role: 'cover' })
  return { success: true, image_url: storedUrl, image_metadata: metadata, cached: false }
}

// ---------------------------------------------------------------------------
// Country processing
// ---------------------------------------------------------------------------


async function processCountry(supabase: SupabaseClient, id: string, name: string, capital?: string, pK?: string, uK?: string, force = false) {
  const { data: existing } = await supabase.from('countries').select('image_url, image_flagged, curated_image_url').eq('id', id).single()
  if (existing?.curated_image_url) return { success: true, image_url: existing.curated_image_url, cached: true, source: 'curated' }
  if (!force && !existing?.image_flagged && existing?.image_url) return { success: true, image_url: existing.image_url, cached: true }

  const key = name.toLowerCase()
  const primaryQuery = COUNTRY_KEYWORDS[key] ?? (capital ? `${capital} ${name} landmark` : `${name} landmark famous place landscape`)
  const queries = [primaryQuery, `${name} landscape`]

  const best = await findBestScoredImage(queries, (img) => scoreCountryImage(img, name, capital), pK, uK)

  if (!best || !isAcceptable(best.score)) {
    await supabase.from('countries').update({
      image_url: null,
      image_metadata: { rejected: true, reason: best ? `score ${best.score} < ${MIN_ACCEPTANCE_SCORE}` : 'no candidates', updated_at: new Date().toISOString() },
      image_flagged: false, updated_at: new Date().toISOString(),
    }).eq('id', id)
    return { success: false, error: `No acceptable image for ${name}`, rejected: true }
  }

  const storedUrl = await storeImageToStorage(supabase, best.url, 'country-images', 'countries', id)
  const metadata = { thumbnail: best.thumbnail, alt: best.alt, photographer: best.photographer, photographer_url: best.photographer_url, source: best.source, source_id: best.source_id, license: best.license, score: best.score, stored_locally: storedUrl !== best.url, updated_at: new Date().toISOString() }

  const { error } = await supabase.from('countries').update({ image_url: storedUrl, image_metadata: metadata, image_flagged: false, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { success: false, error: error.message }

  await upsertImageAsset(supabase, { url: storedUrl, source: 'scraper', source_ref: `${best.source}:${best.source_id}`, license: best.license ?? null, attribution: best.photographer ?? null, alt_text: best.alt ?? null, alt_provenance: 'imported', width: best.width ?? null, height: best.height ?? null, format: deriveImageFormat(storedUrl) ?? deriveImageFormat(best.url), entity_type: 'country', entity_id: id, role: 'cover' })
  return { success: true, image_url: storedUrl, image_metadata: metadata, cached: false }
}

// ---------------------------------------------------------------------------
// Village processing
// ---------------------------------------------------------------------------


async function processVillage(supabase: SupabaseClient, id: string, name: string, city: string, country: string, pK?: string, uK?: string) {
  const queries = [
    `${name} ${city} pride gay lgbtq`,
    `${name} ${city} ${country}`,
  ]
  const scoreFn = (img: ImageResult) => scoreVillageImage(img, name, city)

  // Village uses a lower threshold (no shared MIN_ACCEPTANCE_SCORE)
  let best: ImageResult | null = null
  for (const query of queries) {
    const fetches: Promise<ImageResult[]>[] = [fetchFromWikimedia(query, 600, 300)]
    if (pK) fetches.push(fetchFromPexels(pK, query))
    if (uK) fetches.push(fetchFromUnsplash(uK, query))
    const results = (await Promise.all(fetches)).flat()
    if (!results.length) continue
    for (const img of results) img.score = scoreFn(img)
    results.sort((a, b) => b.score - a.score)
    if (!best || results[0].score > best.score) best = results[0]
  }

  if (!best) return { success: false, error: `No images for ${name}` }

  const storedUrl = await storeImageToStorage(supabase, best.url, 'village-images', 'villages', id)
  const metadata = { thumbnail: best.thumbnail, alt: best.alt, photographer: best.photographer, photographer_url: best.photographer_url, source: best.source, source_id: best.source_id, license: best.license, score: best.score, stored_locally: storedUrl !== best.url, has_queer_content: best.score >= 60, updated_at: new Date().toISOString() }

  const { error } = await supabase.from('queer_villages').update({ image_url: storedUrl, image_metadata: metadata, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { success: false, error: error.message }

  await upsertImageAsset(supabase, { url: storedUrl, source: 'scraper', attribution: best.photographer ?? null, license: best.license ?? null, entity_type: 'queer_village', entity_id: id, role: 'cover' })
  return { success: true, image_url: storedUrl, image_metadata: metadata }
}

// ---------------------------------------------------------------------------
// Simple enrichers (venue, event, personality)
// ---------------------------------------------------------------------------


async function processVenueBatch(supabase: SupabaseClient, pK: string, uK: string, limit: number, force: boolean, dryRun: boolean) {
  let q = supabase.from('venues').select('id, name, city, country, category').order('updated_at', { ascending: true }).limit(limit)
  if (!force) q = q.or('images.is.null,images.eq.{}')
  const { data: rows, error } = await q
  if (error) throw new Error(error.message)
  if (!rows?.length) return { success: true, updated: 0, message: 'nothing to do' }

  let updated = 0, skipped = 0
  for (const v of rows) {
    const lgbtqQ = `${v.name} LGBTQ ${v.city ?? ''}`.trim()
    const searchQ = [v.name, v.city, v.category].filter(Boolean).join(' ')

    let imageUrl: string | null = null
    if (pK) imageUrl = await fetchFirstPexelsUrl(pK, lgbtqQ) ?? await fetchFirstPexelsUrl(pK, searchQ)
    if (!imageUrl && uK) imageUrl = await fetchFirstUnsplashUrl(uK, lgbtqQ) ?? await fetchFirstUnsplashUrl(uK, searchQ)

    if (!imageUrl) { skipped++; continue }
    if (dryRun) { updated++; continue }

    const { error: upErr } = await supabase.from('venues').update({ images: [imageUrl], updated_at: new Date().toISOString() }).eq('id', v.id)
    if (upErr) { console.error(`venue ${v.id}:`, upErr.message); skipped++ }
    else { updated++; await upsertImageAsset(supabase, { url: imageUrl, source: 'scraper', entity_type: 'venue', entity_id: v.id, role: 'cover' }) }
    await new Promise(r => setTimeout(r, 200))
  }
  return { success: true, updated, skipped, total: rows.length, dry_run: dryRun }
}


async function processEventBatch(supabase: SupabaseClient, pK: string, uK: string, limit: number, force: boolean, dryRun: boolean) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  let q = supabase.from('events').select('id, title, city, country, event_type').gte('start_date', cutoff).order('start_date', { ascending: true }).limit(limit)
  if (!force) q = q.or('images.is.null,images.eq.{}')
  const { data: rows, error } = await q
  if (error) throw new Error(error.message)
  if (!rows?.length) return { success: true, updated: 0, message: 'nothing to do' }

  let updated = 0, skipped = 0
  for (const e of rows) {
    const lgbtqQ = `${e.event_type ?? 'pride'} LGBT event ${e.city ?? ''}`.trim()
    const titleQ = `${e.title} ${e.city ?? ''}`.trim()

    let imageUrl: string | null = null
    if (pK) imageUrl = await fetchFirstPexelsUrl(pK, lgbtqQ) ?? await fetchFirstPexelsUrl(pK, titleQ)
    if (!imageUrl && uK) imageUrl = await fetchFirstUnsplashUrl(uK, lgbtqQ) ?? await fetchFirstUnsplashUrl(uK, titleQ)

    if (!imageUrl) { skipped++; continue }
    if (dryRun) { updated++; continue }

    const { error: upErr } = await supabase.from('events').update({ images: [imageUrl], updated_at: new Date().toISOString() }).eq('id', e.id)
    if (upErr) { console.error(`event ${e.id}:`, upErr.message); skipped++ }
    else { updated++; await upsertImageAsset(supabase, { url: imageUrl, source: 'scraper', entity_type: 'event', entity_id: e.id, role: 'cover' }) }
    await new Promise(r => setTimeout(r, 200))
  }
  return { success: true, updated, skipped, total: rows.length, dry_run: dryRun }
}


async function processPersonalityBatch(supabase: SupabaseClient, pK: string, limit: number, force: boolean, dryRun: boolean) {
  let q = supabase.from('personalities').select('id, name, profession, nationality').order('updated_at', { ascending: true }).limit(limit)
  if (!force) q = q.or('image_url.is.null,image_url.eq.')
  const { data: rows, error } = await q
  if (error) throw new Error(error.message)
  if (!rows?.length) return { success: true, updated: 0, message: 'nothing to do' }

  let updated = 0, skipped = 0
  for (const p of rows) {
    let imageUrl: string | null = await fetchWikipediaImage(p.name)
    if (!imageUrl && pK) imageUrl = await fetchFirstPexelsUrl(pK, `${p.name} ${p.profession ?? 'portrait'}`)

    if (!imageUrl) { skipped++; continue }
    if (dryRun) { updated++; continue }

    const { error: upErr } = await supabase.from('personalities').update({ image_url: imageUrl, updated_at: new Date().toISOString() }).eq('id', p.id)
    if (upErr) { console.error(`personality ${p.id}:`, upErr.message); skipped++ }
    else { updated++; await upsertImageAsset(supabase, { url: imageUrl, source: 'scraper', entity_type: 'personality', entity_id: p.id, role: 'cover' }) }
    await new Promise(r => setTimeout(r, 300))
  }
  return { success: true, updated, skipped, total: rows.length, dry_run: dryRun }
}

// ---------------------------------------------------------------------------
// Batch wrappers for scored entities
// ---------------------------------------------------------------------------


async function processCityBatch(supabase: SupabaseClient, pK?: string, uK?: string, force = false, limit = 50) {
  let q = supabase.from('cities').select('id, name, countries(name)')
  if (!force) q = q.or('image_url.is.null,image_flagged.eq.true')
  const { data: rows, error } = await q.order('name').limit(limit)
  if (error) throw new Error(error.message)
  if (!rows?.length) return { success: true, message: 'No cities to process', processed: 0 }

  let ok = 0, fail = 0
  for (const row of rows) {
    try {
      const r = await processCity(supabase, row.id, row.name, row.countries?.name || '', pK, uK, force)
      if (r.success) ok++; else fail++
    } catch (e: unknown) { fail++; console.error(`city ${row.name}:`, (e as Error).message) }
    await new Promise(r => setTimeout(r, 1500))
  }
  return { success: true, processed: rows.length, ok, fail }
}


async function processCountryBatch(supabase: SupabaseClient, pK?: string, uK?: string, force = false, limit = 50) {
  let q = supabase.from('countries').select('id, name, capital')
  if (!force) q = q.or('image_url.is.null,image_flagged.eq.true')
  const { data: rows, error } = await q.order('name').limit(limit)
  if (error) throw new Error(error.message)
  if (!rows?.length) return { success: true, message: 'No countries to process', processed: 0 }

  let ok = 0, fail = 0
  for (const row of rows) {
    try {
      const r = await processCountry(supabase, row.id, row.name, row.capital, pK, uK, force)
      if (r.success) ok++; else fail++
    } catch (e: unknown) { fail++; console.error(`country ${row.name}:`, (e as Error).message) }
    await new Promise(r => setTimeout(r, 1500))
  }
  return { success: true, processed: rows.length, ok, fail }
}


async function processVillageBatch(supabase: SupabaseClient, pK?: string, uK?: string, limit = 25) {
  const { data: rows, error } = await supabase.from('queer_villages').select('id, name, cities(name), countries(name)').is('image_metadata', null).order('name').limit(limit)
  if (error) throw new Error(error.message)
  if (!rows?.length) return { success: true, message: 'Nothing to process', processed: 0 }

  let ok = 0, fail = 0
  for (const row of rows) {
    try {
      const r = await processVillage(supabase, row.id, row.name, row.cities?.name || '', row.countries?.name || '', pK, uK)
      if (r.success) ok++; else fail++
    } catch (e: unknown) { fail++; console.error(`village ${row.name}:`, (e as Error).message) }
    await new Promise(r => setTimeout(r, 800))
  }
  return { success: true, processed: rows.length, ok, fail }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

type EntityType = 'city' | 'country' | 'village' | 'venue' | 'event' | 'personality'
const VALID_ENTITY_TYPES: EntityType[] = ['city', 'country', 'village', 'venue', 'event', 'personality']

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = getServiceClient()
    const auth = await requireAdmin(req, supabase)
    if (auth instanceof Response) return auth

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const entityType = body.entity_type as EntityType

    if (!entityType || !VALID_ENTITY_TYPES.includes(entityType)) {
      return errorResponse(`entity_type required, one of: ${VALID_ENTITY_TYPES.join(', ')}`, 400, req)
    }

    const pK = Deno.env.get('PEXELS_API_KEY') ?? ''
    const uK = Deno.env.get('UNSPLASH_ACCESS_KEY') ?? ''
    if (!pK && !uK) return errorResponse('No image API keys configured (PEXELS_API_KEY or UNSPLASH_ACCESS_KEY)', 500, req)

    const { batchMode, batchLimit, forceUpdate, dry_run: dryRun } = body
    const force = forceUpdate === true
    const dry = dryRun === true
    const limit = Math.min(batchLimit ?? 50, 200)

    let result: unknown

    switch (entityType) {
      case 'city':
        if (batchMode) {
          result = await processCityBatch(supabase, pK || undefined, uK || undefined, force, limit)
        } else {
          if (!body.id || !body.name) return errorResponse('id and name required for single city', 400, req)
          result = await processCity(supabase, body.id, body.name, body.country || '', pK || undefined, uK || undefined, force)
        }
        break

      case 'country':
        if (batchMode) {
          result = await processCountryBatch(supabase, pK || undefined, uK || undefined, force, limit)
        } else {
          if (!body.id || !body.name) return errorResponse('id and name required for single country', 400, req)
          result = await processCountry(supabase, body.id, body.name, body.capital, pK || undefined, uK || undefined, force)
        }
        break

      case 'village':
        if (batchMode) {
          result = await processVillageBatch(supabase, pK || undefined, uK || undefined, limit)
        } else {
          if (!body.id || !body.name) return errorResponse('id and name required for single village', 400, req)
          result = await processVillage(supabase, body.id, body.name, body.city || '', body.country || '', pK || undefined, uK || undefined)
        }
        break

      case 'venue':
        result = await processVenueBatch(supabase, pK, uK, limit, force, dry)
        break

      case 'event':
        result = await processEventBatch(supabase, pK, uK, limit, force, dry)
        break

      case 'personality':
        result = await processPersonalityBatch(supabase, pK, limit, force, dry)
        break
    }

    
    const success = (result as { success?: boolean })?.success ?? true
    return jsonResponse({ ...result as Record<string, unknown>, timestamp: new Date().toISOString() }, success ? 200 : 400, req)
  } catch (e: unknown) {
    console.error('fetch-images error:', e)
    return errorResponse('Internal error', 500, req)
  }
})
