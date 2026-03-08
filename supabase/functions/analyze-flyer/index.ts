/**
 * analyze-flyer — Two-pass AI flyer analysis edge function.
 *
 * Pass 1: CF AI Vision (Llama 3.2 11B) describes the image content.
 * Pass 2: OpenAI gpt-4o-mini structures the description into reliable JSON.
 * Then: Entity matching against venues, cities, countries + duplicate detection.
 *
 * Auth: verify_jwt: true — any authenticated user.
 * Rate limit: 20 scans/hour per user.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts'

const CF_ACCOUNT_ID = '7aa3765cc5f50f2b681b782eb4a8d296'
const CF_VISION_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

// ── Country alias map (reused from geo-link-content) ──────────────────────

const COUNTRY_ALIASES: Record<string, string> = {
  'us': 'United States', 'gb': 'United Kingdom', 'de': 'Germany',
  'fr': 'France', 'es': 'Spain', 'it': 'Italy', 'nl': 'Netherlands',
  'ch': 'Switzerland', 'at': 'Austria', 'au': 'Australia',
  'ca': 'Canada', 'br': 'Brazil', 'mx': 'Mexico', 'jp': 'Japan',
  'za': 'South Africa', 'nz': 'New Zealand', 'il': 'Israel',
  'th': 'Thailand', 'pt': 'Portugal', 'be': 'Belgium',
  'se': 'Sweden', 'dk': 'Denmark', 'no': 'Norway', 'fi': 'Finland',
  'ie': 'Ireland', 'cz': 'Czech Republic', 'tw': 'Taiwan',
  'ar': 'Argentina', 'co': 'Colombia', 'cl': 'Chile', 'pe': 'Peru',
  'in': 'India', 'cn': 'China', 'kr': 'South Korea', 'ru': 'Russia',
  'tr': 'Turkey', 'gr': 'Greece', 'pl': 'Poland', 'ro': 'Romania',
  'hu': 'Hungary', 'ph': 'Philippines', 'id': 'Indonesia',
  'usa': 'United States', 'uk': 'United Kingdom',
  'united states of america': 'United States',
  'great britain': 'United Kingdom', 'england': 'United Kingdom',
  'scotland': 'United Kingdom', 'wales': 'United Kingdom',
  'holland': 'Netherlands', 'the netherlands': 'Netherlands',
  'czechia': 'Czech Republic',
  'republic of korea': 'South Korea', 'korea': 'South Korea',
  'deutschland': 'Germany', 'schweiz': 'Switzerland', 'suisse': 'Switzerland',
  'österreich': 'Austria', 'españa': 'Spain', 'italia': 'Italy',
  'brasil': 'Brazil', 'méxico': 'Mexico', 'france': 'France',
}

// ── Types ─────────────────────────────────────────────────────────────────

interface AnalyzeRequest {
  image_url: string
  hint_city?: string
  hint_country?: string
}

interface ExtractedField {
  value: unknown
  confidence: number
  source: string
}

interface ExtractionResult {
  detected_type: 'event' | 'venue'
  raw_text: string
  language: string
  fields: Record<string, ExtractedField>
}

interface VenueCandidate {
  id: string
  name: string
  score: number
  address: string
  city: string
  city_id: string | null
  country_id: string | null
  latitude: number | null
  longitude: number | null
}

// ── Vision Pass (CF AI) ───────────────────────────────────────────────────

async function ensureMetaLicense(cfToken: string): Promise<void> {
  try {
    await fetch(CF_VISION_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'agree' }),
    })
    console.log('Meta license agreement sent')
  } catch (e) {
    console.log('Meta license agreement attempt:', e)
  }
}

async function visionDescribe(imageBase64: string, cfToken: string): Promise<string> {
  const response = await fetch(CF_VISION_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are analyzing an image of a flyer, poster, or promotional graphic for an LGBTQ+ community platform. Describe EVERYTHING you see in detail:

1. ALL text visible on the image (transcribe exactly, preserving line breaks)
2. Layout structure (headers, subheaders, body text, footer)
3. Visual hierarchy (what text is largest/most prominent?)
4. Any logos, icons, or symbols
5. Design patterns suggesting event type (party, workshop, pride, drag show, etc.)
6. Any dates, times, prices, addresses, URLs, social media handles
7. Any venue names, organizer names, or brand names
8. Language(s) used on the flyer
9. Whether this appears to be an EVENT flyer or a VENUE/business card/listing

Be thorough and precise. Transcribe all text exactly as shown.`,
            },
            {
              type: 'image_url',
              image_url: { url: imageBase64 },
            },
          ],
        },
      ],
      max_tokens: 2048,
      temperature: 0.1,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    console.error('CF Vision error:', err)
    throw new Error(`CF Vision API error: ${response.status}`)
  }

  const data = await response.json()
  const content = data.result?.response || data.choices?.[0]?.message?.content || ''
  console.log('Vision description length:', content.length)
  return content
}

// ── Structuring Pass (gpt-4o-mini) ────────────────────────────────────────

const STRUCTURING_PROMPT = `You are a data extraction assistant for queer.guide, an LGBTQ+ travel and community platform.
Given a description of a flyer/poster image, extract structured data as JSON.

Return ONLY valid JSON with this exact structure:
{
  "detected_type": "event" or "venue",
  "language": "ISO 639-1 code",
  "raw_text": "all visible text transcribed",
  "event_fields": {
    "title": {"value": string|null, "confidence": 0.0-1.0},
    "description": {"value": string|null, "confidence": 0.0-1.0},
    "event_type": {"value": "party"|"festival"|"pride"|"meetup"|"workshop"|"concert"|"exhibition"|"fundraiser"|"sports"|"community"|"other"|null, "confidence": 0.0-1.0},
    "date_text": {"value": string|null, "confidence": 0.0-1.0},
    "start_date": {"value": "ISO8601"|null, "confidence": 0.0-1.0},
    "end_date": {"value": "ISO8601"|null, "confidence": 0.0-1.0},
    "venue_name": {"value": string|null, "confidence": 0.0-1.0},
    "address": {"value": string|null, "confidence": 0.0-1.0},
    "city": {"value": string|null, "confidence": 0.0-1.0},
    "country": {"value": string|null, "confidence": 0.0-1.0},
    "organizer_name": {"value": string|null, "confidence": 0.0-1.0},
    "organizer_contact": {"value": string|null, "confidence": 0.0-1.0},
    "ticket_url": {"value": string|null, "confidence": 0.0-1.0},
    "website": {"value": string|null, "confidence": 0.0-1.0},
    "is_free": {"value": boolean|null, "confidence": 0.0-1.0},
    "price_text": {"value": string|null, "confidence": 0.0-1.0},
    "age_restriction": {"value": string|null, "confidence": 0.0-1.0}
  },
  "venue_fields": {
    "name": {"value": string|null, "confidence": 0.0-1.0},
    "description": {"value": string|null, "confidence": 0.0-1.0},
    "category": {"value": "bar"|"club"|"restaurant"|"cafe"|"sauna"|"hotel"|"shop"|"community_center"|"beach"|"cruise_club"|"theater"|"gallery"|"bookstore"|"gym"|"other"|null, "confidence": 0.0-1.0},
    "address": {"value": string|null, "confidence": 0.0-1.0},
    "city": {"value": string|null, "confidence": 0.0-1.0},
    "country": {"value": string|null, "confidence": 0.0-1.0},
    "postal_code": {"value": string|null, "confidence": 0.0-1.0},
    "phone": {"value": string|null, "confidence": 0.0-1.0},
    "email": {"value": string|null, "confidence": 0.0-1.0},
    "website": {"value": string|null, "confidence": 0.0-1.0},
    "instagram": {"value": string|null, "confidence": 0.0-1.0},
    "hours_text": {"value": string|null, "confidence": 0.0-1.0}
  }
}

Rules:
- Set confidence to 0 and value to null for fields you cannot determine
- For detected_type: "event" if there's a specific date/time; "venue" if it's a business listing/card
- Parse dates to ISO 8601 when possible (use current year if year not specified)
- Extract ALL visible text into raw_text
- Fill BOTH event_fields and venue_fields when possible (a flyer may have both event and venue data)
- Do NOT hallucinate — only extract what's actually described`

async function structureExtraction(
  visionDescription: string,
  openaiKey: string,
  hintCity?: string,
  hintCountry?: string,
): Promise<ExtractionResult> {
  const hints = []
  if (hintCity) hints.push(`User hint: city is likely "${hintCity}"`)
  if (hintCountry) hints.push(`User hint: country is likely "${hintCountry}"`)
  const hintText = hints.length > 0 ? '\n\n' + hints.join('\n') : ''

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: STRUCTURING_PROMPT },
        {
          role: 'user',
          content: `Here is a detailed description of a flyer/poster image:\n\n${visionDescription}${hintText}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      store: false,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    console.error('OpenAI structuring error:', err)
    throw new Error(`OpenAI API error: ${response.status}`)
  }

  const data = await response.json()
  const content = data.choices[0].message.content

  try {
    const parsed = JSON.parse(content)
    const detectedType = parsed.detected_type === 'venue' ? 'venue' : 'event'
    const fields = detectedType === 'event'
      ? { ...parsed.event_fields, ...pickVenueFieldsForEvent(parsed.venue_fields) }
      : parsed.venue_fields || {}

    // Add source attribution to all fields
    for (const key of Object.keys(fields)) {
      if (fields[key] && typeof fields[key] === 'object' && 'confidence' in fields[key]) {
        fields[key].source = 'vision+refinement'
      }
    }

    return {
      detected_type: detectedType,
      raw_text: parsed.raw_text || '',
      language: parsed.language || 'en',
      fields,
    }
  } catch {
    console.error('Failed to parse structuring response:', content?.slice(0, 200))
    return {
      detected_type: 'event',
      raw_text: visionDescription,
      language: 'en',
      fields: {},
    }
  }
}

/** When type is event, pull venue_name/address/city from venue_fields if event_fields is missing them */
function pickVenueFieldsForEvent(venueFields: Record<string, any> | undefined): Record<string, any> {
  if (!venueFields) return {}
  const extras: Record<string, any> = {}
  // Only use venue_fields to fill gaps — don't override event_fields
  for (const key of ['venue_name', 'address', 'city', 'country', 'postal_code']) {
    const venueKey = key === 'venue_name' ? 'name' : key
    if (venueFields[venueKey]?.value && venueFields[venueKey].confidence > 0) {
      extras[key] = { ...venueFields[venueKey], source: 'vision+refinement(venue)' }
    }
  }
  return extras
}

// ── Entity Matching ───────────────────────────────────────────────────────

async function resolveCountry(
  name: string | null | undefined,
  supabase: any,
): Promise<{ id: string; name: string } | null> {
  if (!name) return null
  const normalized = name.trim().toLowerCase()
  const canonical = COUNTRY_ALIASES[normalized] || name.trim()

  const { data } = await supabase
    .from('countries')
    .select('id, name')
    .ilike('name', canonical)
    .limit(1)
    .single()

  if (data) return data

  // Fallback: try code match
  if (normalized.length === 2) {
    const { data: byCode } = await supabase
      .from('countries')
      .select('id, name')
      .ilike('code', normalized)
      .limit(1)
      .single()
    if (byCode) return byCode
  }

  return null
}

async function resolveCity(
  name: string | null | undefined,
  countryId: string | null,
  supabase: any,
): Promise<{ id: string; name: string } | null> {
  if (!name) return null
  const trimmed = name.trim()

  // Check city_aliases first
  const { data: alias } = await supabase
    .from('city_aliases')
    .select('city_id, cities!inner(id, name)')
    .ilike('alias_name', trimmed)
    .limit(1)
    .single()

  if (alias?.cities) return { id: alias.cities.id, name: alias.cities.name }

  // Direct city name match
  let query = supabase
    .from('cities')
    .select('id, name')
    .ilike('name', trimmed)
    .limit(1)

  if (countryId) query = query.eq('country_id', countryId)

  const { data } = await query.single()
  return data || null
}

async function matchVenues(
  venueName: string | null | undefined,
  cityId: string | null,
  supabase: any,
): Promise<VenueCandidate[]> {
  if (!venueName || venueName.trim().length < 2) return []

  const name = venueName.trim()

  // Use pg_trgm similarity search
  let sql = `
    SELECT id, name, address, city, city_id, country_id, latitude, longitude,
           similarity(name, $1) as score
    FROM venues
    WHERE similarity(name, $1) > 0.3
  `
  const params: string[] = [name]

  if (cityId) {
    sql += ` AND city_id = $2`
    params.push(cityId)
  }

  sql += ` ORDER BY score DESC LIMIT 5`

  const { data, error } = await supabase.rpc('execute_raw_sql', {
    query_text: sql,
    query_params: params,
  })

  // Fallback: if the RPC doesn't exist, use a simpler approach
  if (error) {
    console.log('Raw SQL RPC not available, using ilike fallback')
    let query = supabase
      .from('venues')
      .select('id, name, address, city, city_id, country_id, latitude, longitude')
      .ilike('name', `%${name}%`)
      .limit(5)

    if (cityId) query = query.eq('city_id', cityId)

    const { data: fallbackData } = await query
    return (fallbackData || []).map((v: any) => ({
      ...v,
      score: v.name.toLowerCase() === name.toLowerCase() ? 1.0 : 0.5,
    }))
  }

  return data || []
}

async function checkEventDuplicates(
  title: string | null | undefined,
  startDate: string | null | undefined,
  cityId: string | null,
  supabase: any,
): Promise<Array<{ id: string; title: string; start_date: string; score: number }>> {
  if (!title || !startDate) return []

  // Simple title + date proximity check
  const { data } = await supabase
    .from('events')
    .select('id, title, start_date')
    .ilike('title', `%${title.trim().slice(0, 50)}%`)
    .gte('start_date', new Date(new Date(startDate).getTime() - 86400000).toISOString())
    .lte('start_date', new Date(new Date(startDate).getTime() + 86400000).toISOString())
    .limit(5)

  return (data || []).map((e: any) => ({
    ...e,
    score: e.title.toLowerCase() === title.toLowerCase() ? 1.0 : 0.6,
  }))
}

async function checkVenueDuplicates(
  name: string | null | undefined,
  cityId: string | null,
  supabase: any,
): Promise<Array<{ id: string; name: string; score: number }>> {
  if (!name) return []

  let query = supabase
    .from('venues')
    .select('id, name, address, city')
    .ilike('name', name.trim())
    .limit(5)

  if (cityId) query = query.eq('city_id', cityId)

  const { data } = await query
  return (data || []).map((v: any) => ({ ...v, score: 0.9 }))
}

// ── Rate Limiting ─────────────────────────────────────────────────────────

async function checkRateLimit(userId: string, supabase: any): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
  const { count } = await supabase
    .from('flyer_scans')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', oneHourAgo)

  return (count || 0) < 20
}

// ── Image Fetching ────────────────────────────────────────────────────────

async function fetchImageAsBase64(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`)

  const contentLength = parseInt(response.headers.get('content-length') || '0', 10)
  if (contentLength > 20 * 1024 * 1024) {
    throw new Error('Image too large (max 20MB)')
  }

  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > 20 * 1024 * 1024) {
    throw new Error('Image too large (max 20MB)')
  }
  const uint8 = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i])
  }
  const base64 = btoa(binary)

  // Detect MIME type from URL or default to jpeg
  const ext = imageUrl.split('.').pop()?.split('?')[0]?.toLowerCase()
  const mimeMap: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  }
  const mime = mimeMap[ext || ''] || 'image/jpeg'

  return `data:${mime};base64,${base64}`
}

// ── Main Handler ──────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    // Auth: extract user from JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization', 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const cfToken = Deno.env.get('CLOUDFLARE_API_TOKEN')
    const openaiKey = Deno.env.get('OPENAI_API_KEY')

    if (!cfToken) return errorResponse('CLOUDFLARE_API_TOKEN not configured', 500)
    if (!openaiKey) return errorResponse('OPENAI_API_KEY not configured', 500)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return errorResponse('Invalid authorization', 401)

    // Rate limit
    const withinLimit = await checkRateLimit(user.id, supabase)
    if (!withinLimit) return errorResponse('Rate limit exceeded (20 scans/hour)', 429)

    // Parse request
    const { image_url, hint_city, hint_country }: AnalyzeRequest = await req.json()
    if (!image_url) return errorResponse('image_url is required', 400)

    console.log(`Analyzing flyer for user ${user.id}: ${image_url.slice(0, 80)}...`)

    // Step 1: Fetch image and convert to base64
    console.log('Fetching image...')
    const imageBase64 = await fetchImageAsBase64(image_url)
    console.log(`Image fetched, base64 length: ${imageBase64.length}`)

    // Step 2: CF AI Vision — describe the image (ensure license agreement first)
    console.log('Pass 1: CF AI Vision analysis...')
    await ensureMetaLicense(cfToken)
    const visionDescription = await visionDescribe(imageBase64, cfToken)
    console.log('Vision description:', visionDescription.slice(0, 200))

    // Step 3: gpt-4o-mini — structure into JSON
    console.log('Pass 2: Structuring with gpt-4o-mini...')
    const extraction = await structureExtraction(visionDescription, openaiKey, hint_city, hint_country)
    console.log(`Detected type: ${extraction.detected_type}, fields: ${Object.keys(extraction.fields).length}`)

    // Step 4: Entity matching
    console.log('Matching entities...')

    // Resolve country
    const countryName = extraction.fields.country?.value as string || hint_country
    const matchedCountry = await resolveCountry(countryName, supabase)

    // Resolve city
    const cityName = extraction.fields.city?.value as string || hint_city
    const matchedCity = await resolveCity(cityName, matchedCountry?.id || null, supabase)

    // Match venues
    const venueName = extraction.detected_type === 'event'
      ? extraction.fields.venue_name?.value as string
      : extraction.fields.name?.value as string
    const venueCandidates = await matchVenues(venueName, matchedCity?.id || null, supabase)

    // Check duplicates
    const duplicateEvents = extraction.detected_type === 'event'
      ? await checkEventDuplicates(
          extraction.fields.title?.value as string,
          extraction.fields.start_date?.value as string,
          matchedCity?.id || null,
          supabase,
        )
      : []

    const duplicateVenues = extraction.detected_type === 'venue'
      ? await checkVenueDuplicates(
          extraction.fields.name?.value as string,
          matchedCity?.id || null,
          supabase,
        )
      : []

    const processingTime = Date.now() - startTime

    // Step 5: Store audit row
    const { data: scanRow, error: insertError } = await supabase
      .from('flyer_scans')
      .insert({
        user_id: user.id,
        image_url,
        detected_type: extraction.detected_type,
        raw_extraction: {
          vision_description: visionDescription,
          structured: extraction,
        },
        matched_venue_id: venueCandidates[0]?.id || null,
        matched_city_id: matchedCity?.id || null,
        matched_country_id: matchedCountry?.id || null,
        duplicate_event_id: duplicateEvents[0]?.id || null,
        model_used: 'cf-llama-3.2-11b-vision + gpt-4o-mini',
        processing_time_ms: processingTime,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Failed to insert audit row:', insertError)
    }

    console.log(`Analysis complete in ${processingTime}ms`)

    return jsonResponse({
      scan_id: scanRow?.id || null,
      detected_type: extraction.detected_type,
      extraction: {
        raw_text: extraction.raw_text,
        language: extraction.language,
        fields: extraction.fields,
      },
      matches: {
        venue_candidates: venueCandidates,
        city: matchedCity,
        country: matchedCountry,
        duplicate_events: duplicateEvents,
        duplicate_venues: duplicateVenues,
      },
      processing_time_ms: processingTime,
    })
  } catch (error) {
    console.error('analyze-flyer error:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
