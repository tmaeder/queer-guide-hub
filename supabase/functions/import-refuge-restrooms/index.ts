import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, getServiceClient, requireAdmin, corsResponse, errorResponse, jsonResponse } from '../_shared/supabase-client.ts'

const REFUGE_API = 'https://www.refugerestrooms.org/api/v1/restrooms'
const PER_PAGE = 100 // Refuge API max per page
const MAX_PAGES = 200 // safety cap: 20,000 restrooms max per run

interface RefugeRestroom {
  id: number
  name: string
  street: string
  city: string
  state: string
  country: string
  latitude: number
  longitude: number
  accessible: boolean
  unisex: boolean
  changing_table: boolean
  comment: string
  directions: string
  created_at: string
  updated_at: string
  upvote: number
  downvote: number
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = getServiceClient()
    const auth = await requireAdmin(req, supabase)
    if (auth instanceof Response) return auth

    // Parse optional params from body or query
    let maxPages = MAX_PAGES
    let startPage = 1
    let dryRun = false
    let skipExisting = false
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        maxPages = body.max_pages ?? MAX_PAGES
        startPage = body.start_page ?? 1
        dryRun = body.dry_run ?? false
        skipExisting = body.skip_existing ?? false
      } catch { /* no body */ }
    } else {
      const url = new URL(req.url)
      maxPages = parseInt(url.searchParams.get('max_pages') ?? '') || MAX_PAGES
      startPage = parseInt(url.searchParams.get('start_page') ?? '') || 1
      dryRun = url.searchParams.get('dry_run') === 'true'
      skipExisting = url.searchParams.get('skip_existing') === 'true'
    }

    console.log(`Starting Refuge Restrooms import (start_page=${startPage}, max_pages=${maxPages}, dry_run=${dryRun}, skip_existing=${skipExisting})...`)

    // Pre-load existing refuge venue external_ids for dedup
    const { data: existingVenues } = await supabase
      .from('venues')
      .select('id, external_id')
      .eq('data_source', 'refuge_restrooms')
      .not('external_id', 'is', null)

    const existingMap = new Map<string, string>()
    for (const v of existingVenues ?? []) {
      if (v.external_id) existingMap.set(v.external_id, v.id)
    }
    console.log(`Found ${existingMap.size} existing refuge venues in DB`)

    // Pre-load cities for matching
    const { data: cities } = await supabase
      .from('cities')
      .select('id, name')
    const cityMap = new Map<string, string>()
    for (const c of cities ?? []) {
      cityMap.set(c.name.toLowerCase(), c.id)
    }

    let imported = 0
    let updated = 0
    let skipped = 0
    let totalFetched = 0

    const endPage = startPage + maxPages - 1
    for (let page = startPage; page <= endPage; page++) {
      const url = `${REFUGE_API}?page=${page}&per_page=${PER_PAGE}`
      console.log(`Fetching page ${page}...`)

      const response = await fetch(url, {
        headers: { 'User-Agent': 'Queer Guide App' },
      })

      if (!response.ok) {
        console.error(`API error on page ${page}: ${response.status}`)
        break
      }

      const restrooms: RefugeRestroom[] = await response.json()
      if (restrooms.length === 0) {
        console.log(`Page ${page} empty, done.`)
        break
      }

      totalFetched += restrooms.length

      // Build batch arrays
      const toInsert: any[] = []
      const toUpdate: { id: string; data: any }[] = []

      for (const r of restrooms) {
        if (!r.latitude || !r.longitude) {
          skipped++
          continue
        }

        const extId = r.id.toString()
        const amenities: string[] = []
        const accessibilityAttrs: string[] = []

        if (r.unisex) amenities.push('unisex')
        if (r.changing_table) amenities.push('changing_table')
        if (r.accessible) accessibilityAttrs.push('wheelchair_accessible')

        const cityId = r.city ? cityMap.get(r.city.trim().toLowerCase()) ?? null : null

        const venueData: Record<string, any> = {
          name: r.name || `Restroom at ${r.street || 'Unknown'}`,
          description: [r.comment, r.directions].filter(Boolean).join(' — ') || null,
          address: r.street || null,
          city: r.city || null,
          state: r.state || null,
          country: r.country || 'US',
          latitude: r.latitude,
          longitude: r.longitude,
          category: 'other',
          amenities: amenities.length > 0 ? amenities : null,
          accessibility_attributes: accessibilityAttrs.length > 0 ? accessibilityAttrs : null,
          data_source: 'refuge_restrooms',
          external_id: extId,
          verified: false,
          featured: false,
        }

        if (cityId) venueData.city_id = cityId

        const existingId = existingMap.get(extId)
        if (existingId) {
          if (!skipExisting) {
            toUpdate.push({ id: existingId, data: venueData })
          } else {
            skipped++
          }
        } else {
          toInsert.push(venueData)
        }
      }

      if (dryRun) {
        imported += toInsert.length
        updated += toUpdate.length
        console.log(`[dry_run] Page ${page}: ${toInsert.length} new, ${toUpdate.length} updates`)
        continue
      }

      // Batch insert new venues
      if (toInsert.length > 0) {
        const { error: insertErr, count } = await supabase
          .from('venues')
          .insert(toInsert)

        if (insertErr) {
          console.error(`Insert error on page ${page}:`, insertErr.message)
          skipped += toInsert.length
        } else {
          imported += toInsert.length
          // Add to dedup map for subsequent pages
          for (const v of toInsert) {
            existingMap.set(v.external_id, 'new')
          }
        }
      }

      // Batch update existing venues
      for (const { id, data } of toUpdate) {
        const { error: updateErr } = await supabase
          .from('venues')
          .update(data)
          .eq('id', id)

        if (updateErr) {
          console.error(`Update error for ${id}:`, updateErr.message)
          skipped++
        } else {
          updated++
        }
      }

      console.log(`Page ${page}: +${toInsert.length} new, ~${toUpdate.length} updated, ${restrooms.length} fetched`)

      // If we got less than a full page, we're done
      if (restrooms.length < PER_PAGE) {
        console.log('Last page reached.')
        break
      }
    }

    const result = {
      message: 'Refuge Restrooms import completed',
      imported,
      updated,
      skipped,
      total_fetched: totalFetched,
      dry_run: dryRun,
    }
    console.log('Import summary:', JSON.stringify(result))

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Import error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
