import { getServiceClient, requireAdmin, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

const MEILI_URL = Deno.env.get('MEILISEARCH_URL')!
const MEILI_ADMIN_KEY = Deno.env.get('MEILISEARCH_ADMIN_KEY')!

interface SyncRequest {
  action: 'full-sync' | 'sync-type' | 'upsert' | 'delete' | 'reconcile'
  type?: string
  id?: string
  types?: string[]
}

// Kept in sync with workers/search-proxy and the meilisearch index config.
const ALL_TYPES = [
  'venues', 'events', 'cities', 'countries', 'news',
  'marketplace', 'personalities', 'tags', 'queer_villages',
  'hotels', 'festivals',
] as const

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  try {
    const serviceClient = getServiceClient()

    // Webhook calls from DB triggers use a shared secret instead of admin auth
    // Secret must match the hardcoded value in notify_meilisearch_sync trigger
    const webhookSecret = req.headers.get('x-webhook-secret')
    const expectedSecret = Deno.env.get('WEBHOOK_SECRET') || 'meilisearch-sync-webhook-2026'
    const isWebhook = webhookSecret !== null && webhookSecret === expectedSecret

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

      case 'reconcile': {
        // Tombstone sweep: find docs in the Meilisearch index whose source
        // rows no longer exist in Supabase and delete them. Without this,
        // deleted venues/events/etc. linger in search results.
        if (!type) return errorResponse('type required', 400, req)
        const result = await reconcileType(serviceClient, type)
        return jsonResponse({ success: true, type, ...result }, 200, req)
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

async function _meiliPost(path: string, body: unknown) {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncType(supabase: any, type: string): Promise<number> {
  const fetcher = TYPE_FETCHERS[type]
  if (!fetcher) throw new Error(`Unknown type: ${type}`)

  // Paginate: Supabase returns max 1000 rows per query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // For events: expand each master to one Meili doc per active occurrence.
  // Falls back to a single doc when there are no occurrences (common for
  // one-off events). See expandEventDocsToOccurrences below.
  let toIndex = allDocs
  if (type === 'events') {
    toIndex = await expandEventDocsToOccurrences(supabase, allDocs)
  }

  // Augment each doc with cluster_ids[] / cluster_slugs[] from
  // topic_clusters membership before pushing to Meili. Done in batches of 500
  // to keep the IN clause manageable.
  for (let i = 0; i < toIndex.length; i += 500) {
    const batch = toIndex.slice(i, i + 500)
    await enrichDocsWithClusters(supabase, type, batch)
    await meiliPut(`/indexes/${type}/documents`, batch)
  }

  return toIndex.length
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertDocument(supabase: any, type: string, id: string) {
  const fetcher = SINGLE_FETCHERS[type]
  if (!fetcher) throw new Error(`Unknown type: ${type}`)

  const doc = await fetcher(supabase, id)
  if (!doc) {
    // Record deleted or filtered out — remove from Meilisearch
    await meiliDelete(type, id)
    return
  }

  let toIndex = [doc]
  if (type === 'events') {
    toIndex = await expandEventDocsToOccurrences(supabase, [doc])
    // Single-row trigger sync: also delete any stale per-occurrence docs that
    // may exist from a previous expansion. We don't know the old occurrence
    // ids; rely on the reconcile sweep + future expansion to overwrite.
  }
  await enrichDocsWithClusters(supabase, type, toIndex)
  await meiliPut(`/indexes/${type}/documents`, toIndex)
}

/**
 * Expand a batch of master event docs into per-occurrence Meili docs.
 *
 * Reads event_occurrences (status='active') for each master event in
 * `docs`. For each active occurrence, emits a copy of the master doc with:
 *   id                = `evt-{master_id}-{occurrence_start_iso}`
 *   master_event_id   = master row id
 *   occurrence_id     = event_occurrences.id
 *   start_date        = occurrence_start (overrides master)
 *   end_date          = occurrence_end (or master end_date)
 *   title             = override_title ?? master title
 *   description       = override_description ?? master description
 *
 * Master docs without any active occurrence pass through unchanged with
 * `master_event_id = id` for storefront grouping consistency.
 *
 * Storefront usage: set `distinctAttribute = 'master_event_id'` so list
 * pages show one card per series; date-window queries filter on the
 * occurrence's start_date directly.
 *
 * Returns the new docs array. Does not mutate the input.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function expandEventDocsToOccurrences(supabase: any, docs: any[]): Promise<any[]> {
  if (!docs.length) return docs
  const ids = docs.map((d) => d.id).filter((x) => typeof x === 'string')
  if (!ids.length) return docs

  const { data: occurrences, error } = await supabase
    .from('event_occurrences')
    .select(
      'id, master_event_id, occurrence_start, occurrence_end, override_title, override_description, status',
    )
    .in('master_event_id', ids)
    .eq('status', 'active')
  if (error) {
    console.warn(
      'expandEventDocsToOccurrences: event_occurrences fetch failed; falling back to master docs',
      error.message,
    )
    return docs.map((d) => ({ ...d, master_event_id: d.id }))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byMaster = new Map<string, any[]>()
  for (const o of occurrences ?? []) {
    const arr = byMaster.get(o.master_event_id) ?? []
    arr.push(o)
    byMaster.set(o.master_event_id, arr)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (const d of docs) {
    const occ = byMaster.get(d.id)
    if (!occ || occ.length === 0) {
      out.push({ ...d, master_event_id: d.id })
      continue
    }
    for (const o of occ) {
      out.push({
        ...d,
        id: `evt-${d.id}-${o.occurrence_start}`,
        master_event_id: d.id,
        occurrence_id: o.id,
        start_date: o.occurrence_start,
        end_date: o.occurrence_end ?? d.end_date ?? null,
        title: o.override_title ?? d.title,
        description: o.override_description ?? d.description,
      })
    }
  }
  return out
}

// Map Meilisearch index name -> unified_tag_assignments.entity_type. Indexes
// without a mapping (cities, countries, queer_villages, hotels, festivals,
// tags) don't carry tag assignments today, so cluster membership is empty
// for them by definition.
const INDEX_TO_ASSIGNMENT_TYPE: Record<string, string> = {
  venues: 'venue',
  events: 'event',
  news: 'article',
  marketplace: 'listing',
  personalities: 'profile',
}

/**
 * Enrich a batch of Meili docs with cluster_ids[] + cluster_slugs[] from the
 * topic_clusters membership graph. Mutates docs in place. Fail-open: if the
 * entity_cluster_membership view isn't available (migration not applied yet),
 * each doc gets empty arrays and a console.warn — never blocks the sync.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichDocsWithClusters(supabase: any, type: string, docs: any[]) {
  if (!docs.length) return
  const assignmentType = INDEX_TO_ASSIGNMENT_TYPE[type]
  if (!assignmentType) {
    for (const doc of docs) {
      doc.cluster_ids = []
      doc.cluster_slugs = []
    }
    return
  }
  const ids = docs.map((d) => d.id).filter((x) => typeof x === 'string')
  if (!ids.length) {
    for (const doc of docs) {
      doc.cluster_ids = []
      doc.cluster_slugs = []
    }
    return
  }
  const { data, error } = await supabase
    .from('entity_cluster_membership')
    .select('entity_id, cluster_ids, cluster_slugs')
    .eq('entity_type', assignmentType)
    .in('entity_id', ids)
  if (error) {
    console.warn(
      'cluster enrichment failed (entity_cluster_membership view missing?); emitting empty arrays',
      error.message,
    )
    for (const doc of docs) {
      doc.cluster_ids = []
      doc.cluster_slugs = []
    }
    return
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map<string, any>((data ?? []).map((r: any) => [r.entity_id, r]))
  for (const doc of docs) {
    const row = byId.get(doc.id)
    doc.cluster_ids = row?.cluster_ids ?? []
    doc.cluster_slugs = row?.cluster_slugs ?? []
  }
}

// --- Data transformers ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchVenues(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('venues')
    .select('id, name, description, category, address, city, country, latitude, longitude, images, featured, slug, tags, target_groups, services, accessibility_attributes')
    .neq('data_source', 'refuge_restrooms')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapVenue)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchEvents(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('events')
    .select('id, title, description, event_type, venue_name, address, city, country, latitude, longitude, start_date, end_date, is_free, price_min, price_max, featured, target_groups, accessibility_attributes, slug, logo_url')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapEvent)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchCities(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('cities')
    .select('id, name, description, latitude, longitude, image_url, slug, population, lgbt_friendly_rating, countries(name, code)')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapCity)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchCountries(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('countries')
    .select('id, name, description, code, latitude, longitude, image_url, slug, continents(name)')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapCountry)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchNews(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('news_articles')
    .select('id, title, content, category, is_featured, published_at, slug, image_url')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapNews)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchMarketplace(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('marketplace_listings')
    .select('id, title, description, category, price, featured, slug')
    .eq('status', 'active')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapMarketplace)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchPersonalities(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('personalities')
    .select('id, name, description, profession, lgbti_connection, nationality, birth_date, is_featured, slug, image_url')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapPersonality)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchTags(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('unified_tags')
    .select('id, name, description, category, slug, image_url')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapTag)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchQueerVillages(sb: any, limit: number, offset: number) {
  const { data, error } = await sb
    .from('queer_villages')
    .select('id, name, description, latitude, longitude, images, featured, slug, cities(name), countries(name)')
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data || []).map(mapQueerVillage)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchQueerVillage(sb: any, id: string) {
  const { data, error } = await sb
    .from('queer_villages')
    .select('id, name, description, latitude, longitude, images, featured, slug, cities(name), countries(name)')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return mapQueerVillage(data)
}

// --- Tombstone reconciliation -----------------------------------

/**
 * For the given index type, list every document ID in Meilisearch and
 * compare it against live IDs in the source table. Any ID in the index
 * that no longer exists in the source gets deleted.
 *
 * Bounded to 50k docs per run — the scheduled call should process all
 * indexes sequentially.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function reconcileType(supabase: any, type: string): Promise<{
  meili_count: number
  source_count: number
  deleted: number
}> {
  const table = TYPE_TO_TABLE[type]
  if (!table) throw new Error(`reconcile: unknown type ${type}`)

  // 1) Collect all live IDs from Supabase. For very large tables (>50k), this
  // paginates in 10k chunks — keep the source of truth authoritative rather
  // than skipping the check.
  const liveIds = new Set<string>()
  const PAGE = 10_000
  for (let from = 0; from < 500_000; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`source query ${table}: ${error.message}`)
    if (!data || data.length === 0) break
    for (const row of data) liveIds.add(String(row.id))
    if (data.length < PAGE) break
  }

  // 2) List all IDs in the Meilisearch index.
  const meiliIds: string[] = []
  let offset = 0
  const INDEX_PAGE = 1000
  while (offset < 50_000) {
    const res = await fetch(
      `${MEILI_URL}/indexes/${type}/documents?limit=${INDEX_PAGE}&offset=${offset}&fields=id`,
      { headers: { Authorization: `Bearer ${MEILI_ADMIN_KEY}` } },
    )
    if (!res.ok) throw new Error(`meili list: ${res.status}`)
    const body = (await res.json()) as { results?: Array<{ id: string | number }> }
    const rows = body.results ?? []
    if (rows.length === 0) break
    for (const r of rows) meiliIds.push(String(r.id))
    if (rows.length < INDEX_PAGE) break
    offset += INDEX_PAGE
  }

  // 3) Diff — anything in Meilisearch but not in the source is a tombstone.
  const stale = meiliIds.filter((id) => !liveIds.has(id))
  if (stale.length > 0) {
    const res = await fetch(`${MEILI_URL}/indexes/${type}/documents/delete-batch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MEILI_ADMIN_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stale),
    })
    if (!res.ok) throw new Error(`meili delete-batch: ${res.status} ${await res.text()}`)
  }

  return { meili_count: meiliIds.length, source_count: liveIds.size, deleted: stale.length }
}

/** Map of Meilisearch index name → Supabase source table. */
const TYPE_TO_TABLE: Record<string, string> = {
  venues: 'venues',
  events: 'events',
  cities: 'cities',
  countries: 'countries',
  news: 'news_articles',
  marketplace: 'marketplace_listings',
  personalities: 'personalities',
  tags: 'unified_tags',
  queer_villages: 'queer_villages',
  hotels: 'hotels',
  festivals: 'festivals',
}
