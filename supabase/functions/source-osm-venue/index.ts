import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { writeToStaging, skippedResponse } from '../_shared/source-adapter.ts'
import type { RawItem, NormalizedItem } from '../_shared/source-adapter.ts'

// Source: OpenStreetMap (Overpass API) — LGBTQ+ venues
// Queries OSM for nodes/ways tagged lgbtq=yes or similar identifiers
// in top LGBTQ+ cities. No API key required.

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'

// OSM tags that indicate LGBTQ+ relevance
const LGBT_OVERPASS_QUERY = `
[out:json][timeout:60];
(
  node["lgbtq"~"yes|primary|only"]["amenity"]({{bbox}});
  node["gay"="yes"]["amenity"]({{bbox}});
  node["lesbian"="yes"]["amenity"]({{bbox}});
  node["lgbtq:primary"="yes"]({{bbox}});
  node["community"="lgbtq"]({{bbox}});
  node["lgbtq"~"yes|primary|only"]["tourism"]({{bbox}});
  node["gay"="yes"]["tourism"]({{bbox}});
);
out body;
`

// Top LGBTQ+ cities with bounding boxes [south, west, north, east]
const CITIES: Array<{ name: string; bbox: [number, number, number, number] }> = [
  { name: 'Berlin',        bbox: [52.338, 13.088, 52.675, 13.761] },
  { name: 'Amsterdam',     bbox: [52.278, 4.729,  52.431, 5.079]  },
  { name: 'Barcelona',     bbox: [41.320, 2.052,  41.468, 2.228]  },
  { name: 'London',        bbox: [51.384, -0.489, 51.617, 0.236]  },
  { name: 'Paris',         bbox: [48.815, 2.224,  48.902, 2.470]  },
  { name: 'New York',      bbox: [40.477, -74.259, 40.916, -73.700] },
  { name: 'San Francisco', bbox: [37.632, -122.514, 37.930, -122.355] },
  { name: 'Sydney',        bbox: [-34.173, 150.502, -33.578, 151.343] },
  { name: 'Bangkok',       bbox: [13.494, 100.326, 13.957, 100.937] },
  { name: 'Toronto',       bbox: [43.573, -79.640, 43.855, -79.122] },
  { name: 'Madrid',        bbox: [40.311, -3.888, 40.644, -3.517] },
  { name: 'São Paulo',     bbox: [-23.688, -46.826, -23.356, -46.364] },
  { name: 'Cape Town',     bbox: [-34.358, 18.295, -33.743, 18.945] },
  { name: 'Tel Aviv',      bbox: [31.968, 34.720, 32.131, 34.851] },
  { name: 'Montreal',      bbox: [45.400, -73.971, 45.705, -73.476] },
]

const AMENITY_TO_CATEGORY: Record<string, string> = {
  bar: 'bar', pub: 'bar', nightclub: 'club', restaurant: 'restaurant',
  cafe: 'cafe', fast_food: 'cafe', community_centre: 'community-center',
  sauna: 'sauna', cinema: 'other', library: 'other', theatre: 'other',
  hotel: 'hotel', hostel: 'hotel', guest_house: 'hotel',
  shop: 'shop', boutique: 'shop',
}

function osmToNormalized(el: Record<string, unknown>, city: string): NormalizedItem {
  const tags = (el.tags ?? {}) as Record<string, string>
  const id = `osm-${el.type ?? 'node'}-${el.id}`
  const name = tags.name ?? tags['name:en'] ?? id
  const lat = el.lat as number | undefined
  const lon = el.lon as number | undefined
  const amenity = tags.amenity ?? tags.tourism ?? ''
  const category = AMENITY_TO_CATEGORY[amenity] ?? 'other'

  const osmTags: string[] = ['osm']
  if (tags.lgbtq === 'primary' || tags['lgbtq:primary'] === 'yes') osmTags.push('lgbtq-primary')
  if (tags.gay === 'yes') osmTags.push('gay')
  if (tags.lesbian === 'yes') osmTags.push('lesbian')
  if (tags.outdoor_seating === 'yes') osmTags.push('outdoor-seating')
  if (tags.wheelchair === 'yes') osmTags.push('wheelchair-accessible')

  const website = tags.website ?? tags['contact:website'] ?? tags.url ?? ''
  const phone   = tags.phone ?? tags['contact:phone'] ?? ''
  const address = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ')

  return {
    entityType:  'venue',
    sourceId:    id,
    sourceName:  'osm',
    name,
    description: tags.description ?? '',
    category,
    venue_type:  amenity,
    location: {
      lat:      lat ?? null,
      lng:      lon ?? null,
      address,
      city:     tags['addr:city'] ?? city,
      country:  tags['addr:country'] ?? '',
      postcode: tags['addr:postcode'] ?? '',
    },
    urls:     website ? [website] : [],
    contacts: { phone, website },
    tags:     osmTags,
    metadata: {
      osm_id:      el.id,
      osm_type:    el.type,
      osm_amenity: amenity,
      osm_tags:    tags,
      data_source: 'osm',
    },
  } as NormalizedItem
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body   = await req.json().catch(() => ({}))
    const dryRun = body.dry_run === true
    const limit  = body.batch_size ?? 500
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const nodeId        = body.node_id as string | undefined

    const allItems: RawItem[] = []

    for (const city of CITIES) {
      if (allItems.length >= limit) break
      const bbox = city.bbox.join(',')
      const query = LGBT_OVERPASS_QUERY.replace(/\{\{bbox\}\}/g, bbox)

      try {
        const res = await fetch(OVERPASS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(65_000),
        })
        if (!res.ok) {
          console.warn(`OSM Overpass ${city.name}: HTTP ${res.status}`)
          continue
        }
        const json = await res.json() as { elements?: unknown[] }
        for (const el of json.elements ?? []) {
          const e = el as Record<string, unknown>
          const tags = (e.tags ?? {}) as Record<string, string>
          if (!tags.name) continue // skip unnamed features
          allItems.push({ sourceId: `osm-${e.type ?? 'node'}-${e.id}`, data: { el: e, city: city.name } })
          if (allItems.length >= limit) break
        }
      } catch (e) {
        console.warn(`OSM ${city.name} query failed:`, (e as Error).message)
      }
    }

    if (dryRun) {
      return jsonResponse({ success: true, items: allItems.length, dry_run: true }, 200, req)
    }

    // Normalize inline (adapter pattern but without a class)
    const normalized: NormalizedItem[] = allItems.map(raw => {
      const d = raw.data as { el: Record<string, unknown>; city: string }
      return osmToNormalized(d.el, d.city)
    })

    // Write to staging using bulk insert
    let written = 0
    const batchSize = 50
    for (let i = 0; i < normalized.length; i += batchSize) {
      const batch = normalized.slice(i, i + batchSize)
      const rows = batch.map(item => ({
        source_name:       'osm',
        entity_type:       'venue',
        target_table:      'venues',
        source_entity_id:  item.sourceId,
        raw_data:          item,
        normalized_data:   item,
        enrichment_status: 'pending',
        dedup_status:      'pending',
        pipeline_run_id:   pipelineRunId ?? null,
        node_id:           nodeId ?? null,
      }))
      const { error } = await supabase.from('ingestion_staging').upsert(rows, {
        onConflict: 'source_name,source_entity_id',
        ignoreDuplicates: false,
      })
      if (error) console.error('OSM staging insert error:', error.message)
      else written += batch.length
    }

    return jsonResponse({
      success: true,
      items: written,
      items_total: normalized.length,
      items_processed: written,
      items_succeeded: written,
      items_failed: normalized.length - written,
      cities_queried: CITIES.length,
    }, 200, req)
  } catch (error) {
    console.error('source-osm-venue:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
