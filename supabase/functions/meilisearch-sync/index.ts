import { getCorsHeaders, getServiceClient, requireAdmin, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

const MEILI_URL = Deno.env.get('MEILISEARCH_URL')!
const MEILI_ADMIN_KEY = Deno.env.get('MEILISEARCH_ADMIN_KEY')!

interface SyncRequest {
  action: 'full-sync' | 'sync-type' | 'upsert' | 'delete'
  type?: string
  id?: string
  types?: string[]
}

const ALL_TYPES = [
  'venues', 'events', 'cities', 'countries', 'news',
  'marketplace', 'personalities', 'tags', 'queer_villages',
] as const

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  try {
    const serviceClient = getServiceClient()

    // Webhook calls from Supabase use a shared secret instead of admin auth
    const webhookSecret = req.headers.get('x-webhook-secret')
    const isWebhook = webhookSecret === Deno.env.get('WEBHOOK_SECRET')

    if (!isWebhook) {
      const authResult = await requireAdmin(req, serviceClient)
      if (authResult instanceof Response) return authResult
    }

    const body: SyncRequest = await req.json()
    const { action, type, id, types } = body

    switch (action) {
      case 'full-sync': {
        const syncTypes = types?.length ? types : ALL_TYPES
        const results: Record<string, { count: number; error?: string }> = {}
        for (const t of syncTypes) {
          try {
            const count = await syncType(serviceClient, t as string)
            results[t] = { count }
          } catch (e) {
            results[t] = { count: 0, error: e.message }
          }
        }
        return jsonResponse({ success: true, results }, 200, req)
      }

      case 'sync-type': {
        if (!type) return errorResponse('type required', 400, req)
        const count = await syncType(serviceClient, type)
        return jsonResponse({ success: true, type, count }, 200, req)
      }

      case 'upsert': {
        if (!type || !id) return errorResponse('type and id required', 400, req)
        await upsertDocument(serviceClient, type, id)
        return jsonResponse({ success: true, type, id }, 200, req)
      }

      case 'delete': {
        if (!type || !id) return errorResponse('type and id required', 400, req)
        await meiliDelete(type, id)
        return jsonResponse({ success: true, type, id }, 200, req)
      }

      default:
        return errorResponse(`Unknown action: ${action}`, 400, req)
    }
  } catch (error) {
    console.error('Meilisearch sync error:', error)
    return errorResponse(error.message, 500, req)
  }
})

// --- Meilisearch HTTP helpers ---

async function meiliPost(path: string, body: unknown) {
  const res = await fetch(`${MEILI_URL}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MEILI_ADMIN_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Meilisearch ${path}: ${res.status} ${text}`)
  }
  return res.json()
}

async function meiliPut(path: string, body: unknown) {
  const res = await fetch(`${MEILI_URL}${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${MEILI_ADMIN_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Meilisearch PUT ${path}: ${res.status} ${text}`)
  }
  return res.json()
}

async function meiliDelete(index: string, docId: string) {
  const res = await fetch(`${MEILI_URL}/indexes/${index}/documents/${docId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${MEILI_ADMIN_KEY}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Meilisearch DELETE: ${res.status} ${text}`)
  }
}

// --- Sync logic per type ---

async function syncType(supabase: any, type: string): Promise<number> {
  const fetcher = TYPE_FETCHERS[type]
  if (!fetcher) throw new Error(`Unknown type: ${type}`)

  // Paginate: Supabase returns max 1000 rows per query
  const allDocs: any[] = []
  const PAGE_SIZE = 1000
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const docs = await fetcher(supabase, PAGE_SIZE, offset)
    allDocs.push(...docs)
    hasMore = docs.length === PAGE_SIZE
    offset += PAGE_SIZE
  }

  if (!allDocs.length) return 0

  // Upsert documents in batches of 500
  for (let i = 0; i < allDocs.length; i += 500) {
    const batch = allDocs.slice(i, i + 500)
    await meiliPut(`/indexes/${type}/documents`, batch)
  }

  return allDocs.length
}

async function upsertDocument(supabase: any, type: string, id: string) {
  const fetcher = SINGLE_FETCHERS[type]
  if (!fetcher) throw new Error(`Unknown type: ${type}`)

  const doc = await fetcher(supabase, id)
  if (!doc) {
    // Record deleted or filtered out — remove from Meilisearch
    await meiliDelete(type, id)
    return
  }

  await meiliPut(`/indexes/${type}/documents`, [doc])
}

// --- Data transformers ---

const TYPE_FETCHERS: Record<string, (sb: any, limit: number, offset: number) => Promise<any[]>> = {
  venues: fetchVenues,
  events: fetchEvents,
  cities: fetchCities,
  countries: fetchCountries,
  news: fetchNews,
  marketplace: fetchMarketplace,
  personalities: fetchPersonalities,
  tags: fetchTags,
  queer_villages: fetchQueerVillages,
}

const SINGLE_FETCHERS: Record<string, (sb: any, id: string) => Promise<any | null>> = {
  venues: fetchVenue,
  events: fetchEvent,
  cities: fetchCity,
  countries: fetchCountry,
  news: fetchNewsArticle,
  marketplace: fetchMarketplaceListing,
  personalities: fetchPersonality,
  tags: fetchTag,
  queer_villages: fetchQueerVillage,
}

// --- Venues ---

function mapVenue(v: any) {
  return {
    id: v.id,
    title: v.name,
    description: v.description,
    type: 'venue',
    category: v.category,
    address: v.address,
    city: v.city,
    country: v.country,
    tags: v.tags || [],
    target_groups: v.target_groups || [],
    services: v.services || [],
    accessibility: v.accessibility_attributes || [],
    featured: v.featured || false,
    slug: v.slug,
    image_url: Array.isArray(v.images) ? v.images[0] : v.images,
    ...(v.latitude && v.longitude ? { _geo: { lat: Number(v.latitude), lng: Number(v.longitude) } } : {}),
  }
}

async function fetchVenues(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('venues')
    .select('id, name, description, category, address, city, country, latitude, longitude, images, featured, slug, tags, target_groups, services, accessibility_attributes')
    .neq('data_source', 'refuge_restrooms')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapVenue)
}

async function fetchVenue(sb: any, id: string) {
  const { data, error } = await sb
    .from('venues')
    .select('id, name, description, category, address, city, country, latitude, longitude, images, featured, slug, tags, target_groups, services, accessibility_attributes, data_source')
    .eq('id', id)
    .single()
  if (error || !data) return null
  if (data.data_source === 'refuge_restrooms') return null
  return mapVenue(data)
}

// --- Events ---

function mapEvent(e: any) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    type: 'event',
    event_type: e.event_type,
    venue_name: e.venue_name,
    address: e.address,
    city: e.city,
    country: e.country,
    start_date: e.start_date,
    end_date: e.end_date,
    is_free: e.is_free,
    price_min: e.price_min,
    price_max: e.price_max,
    featured: e.featured || false,
    target_groups: e.target_groups || [],
    accessibility: e.accessibility_attributes || [],
    slug: e.slug,
    logo_url: e.logo_url,
    ...(e.latitude && e.longitude ? { _geo: { lat: Number(e.latitude), lng: Number(e.longitude) } } : {}),
  }
}

async function fetchEvents(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('events')
    .select('id, title, description, event_type, venue_name, address, city, country, latitude, longitude, start_date, end_date, is_free, price_min, price_max, featured, target_groups, accessibility_attributes, slug, logo_url')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapEvent)
}

async function fetchEvent(sb: any, id: string) {
  const { data, error } = await sb
    .from('events')
    .select('id, title, description, event_type, venue_name, address, city, country, latitude, longitude, start_date, end_date, is_free, price_min, price_max, featured, target_groups, accessibility_attributes, slug, logo_url')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return mapEvent(data)
}

// --- Cities ---

function mapCity(c: any) {
  return {
    id: c.id,
    title: c.name,
    description: c.description,
    type: 'city',
    country: c.countries?.name,
    country_code: c.countries?.code,
    lgbt_friendly_rating: c.lgbt_friendly_rating,
    population: c.population,
    featured: false,
    slug: c.slug,
    image_url: c.image_url,
    ...(c.latitude && c.longitude ? { _geo: { lat: Number(c.latitude), lng: Number(c.longitude) } } : {}),
  }
}

async function fetchCities(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('cities')
    .select('id, name, description, latitude, longitude, image_url, slug, population, lgbt_friendly_rating, countries(name, code)')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapCity)
}

async function fetchCity(sb: any, id: string) {
  const { data, error } = await sb
    .from('cities')
    .select('id, name, description, latitude, longitude, image_url, slug, population, lgbt_friendly_rating, countries(name, code)')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return mapCity(data)
}

// --- Countries ---

function mapCountry(c: any) {
  return {
    id: c.id,
    title: c.name,
    description: c.description,
    type: 'country',
    code: c.code,
    continent: c.continents?.name,
    featured: false,
    slug: c.slug,
    image_url: c.image_url,
    ...(c.latitude && c.longitude ? { _geo: { lat: Number(c.latitude), lng: Number(c.longitude) } } : {}),
  }
}

async function fetchCountries(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('countries')
    .select('id, name, description, code, latitude, longitude, image_url, slug, continents(name)')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapCountry)
}

async function fetchCountry(sb: any, id: string) {
  const { data, error } = await sb
    .from('countries')
    .select('id, name, description, code, latitude, longitude, image_url, slug, continents(name)')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return mapCountry(data)
}

// --- News ---

function mapNews(n: any) {
  return {
    id: n.id,
    title: n.title,
    description: n.content?.substring(0, 500),
    type: 'news',
    category: n.category,
    is_featured: n.is_featured || false,
    published_at: n.published_at,
    slug: n.slug,
    image_url: n.image_url,
  }
}

async function fetchNews(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('news_articles')
    .select('id, title, content, category, is_featured, published_at, slug, image_url')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapNews)
}

async function fetchNewsArticle(sb: any, id: string) {
  const { data, error } = await sb
    .from('news_articles')
    .select('id, title, content, category, is_featured, published_at, slug, image_url')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return mapNews(data)
}

// --- Marketplace ---

function mapMarketplace(m: any) {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    type: 'marketplace',
    category: m.category,
    price: m.price ? Number(m.price) : null,
    featured: m.featured || false,
    slug: m.slug,
  }
}

async function fetchMarketplace(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('marketplace_listings')
    .select('id, title, description, category, price, featured, slug')
    .eq('status', 'active')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapMarketplace)
}

async function fetchMarketplaceListing(sb: any, id: string) {
  const { data, error } = await sb
    .from('marketplace_listings')
    .select('id, title, description, category, price, featured, slug, status')
    .eq('id', id)
    .single()
  if (error || !data) return null
  if (data.status !== 'active') return null
  return mapMarketplace(data)
}

// --- Personalities ---

function mapPersonality(p: any) {
  return {
    id: p.id,
    title: p.name,
    description: p.description,
    type: 'personality',
    profession: p.profession,
    lgbti_connection: p.lgbti_connection,
    nationality: p.nationality,
    birth_date: p.birth_date,
    is_featured: p.is_featured || false,
    slug: p.slug,
    image_url: p.image_url,
  }
}

async function fetchPersonalities(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('personalities')
    .select('id, name, description, profession, lgbti_connection, nationality, birth_date, is_featured, slug, image_url')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapPersonality)
}

async function fetchPersonality(sb: any, id: string) {
  const { data, error } = await sb
    .from('personalities')
    .select('id, name, description, profession, lgbti_connection, nationality, birth_date, is_featured, slug, image_url')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return mapPersonality(data)
}

// --- Tags ---

function mapTag(t: any) {
  return {
    id: t.id,
    title: t.name,
    description: t.description,
    type: 'tag',
    category: t.category,
    slug: t.slug,
    image_url: t.image_url,
  }
}

async function fetchTags(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('unified_tags')
    .select('id, name, description, category, slug, image_url')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapTag)
}

async function fetchTag(sb: any, id: string) {
  const { data, error } = await sb
    .from('unified_tags')
    .select('id, name, description, category, slug, image_url')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return mapTag(data)
}

// --- Queer Villages ---

function mapQueerVillage(qv: any) {
  return {
    id: qv.id,
    title: qv.name,
    description: qv.description,
    type: 'queer_village',
    city: qv.cities?.name,
    country: qv.countries?.name,
    featured: qv.featured || false,
    slug: qv.slug,
    image_url: qv.image_url,
    ...(qv.latitude && qv.longitude ? { _geo: { lat: Number(qv.latitude), lng: Number(qv.longitude) } } : {}),
  }
}

async function fetchQueerVillages(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('queer_villages')
    .select('id, name, description, latitude, longitude, images, featured, slug, cities(name), countries(name)')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapQueerVillage)
}

async function fetchQueerVillage(sb: any, id: string) {
  const { data, error } = await sb
    .from('queer_villages')
    .select('id, name, description, latitude, longitude, images, featured, slug, cities(name), countries(name)')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return mapQueerVillage(data)
}
