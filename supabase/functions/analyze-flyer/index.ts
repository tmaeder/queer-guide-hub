/**
 * analyze-flyer — AI flyer/document analysis edge function.
 *
 * Image mode (image_url): CF AI Vision → gpt-4o-mini structuring → entity matching.
 * Text mode (text): gpt-4o-mini structuring → entity matching (vision skipped).
 *
 * Supports multiple events/venues per document — returns items[].
 *
 * Auth: verify_jwt: true — any authenticated user.
 * Rate limit: 20 scans/hour per user.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts'
import { COUNTRY_ALIASES } from '../_shared/automation-utils.ts'

const CF_ACCOUNT_ID = '7aa3765cc5f50f2b681b782eb4a8d296'
const CF_VISION_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

// ── Types ─────────────────────────────────────────────────────────────────

interface AnalyzeRequest {
  image_url?: string
  text?: string
  hint_city?: string
  hint_country?: string
}

interface ExtractedField {
  value: unknown
  confidence: number
  source: string
}

interface ExtractedItem {
  detected_type: 'event' | 'venue'
  fields: Record<string, ExtractedField>
}

interface ExtractionResult {
  items: ExtractedItem[]
  raw_text: string
  language: string
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
Given content from a flyer, poster, or document, extract ALL distinct events and venues as structured JSON.

Return ONLY valid JSON with this exact structure:
{
  "items": [
    {
      "detected_type": "event" or "venue",
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
        "price_presale": {"value": string|number|null, "confidence": 0.0-1.0},
        "price_box_office": {"value": string|number|null, "confidence": 0.0-1.0},
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
  ],
  "language": "ISO 639-1 code",
  "raw_text": "all visible text transcribed"
}

Rules:
- If you find MULTIPLE distinct events or venues, return one item per event/venue (max 10 items)
- If only one event or venue is found, return an array with a single item
- Do NOT merge separate events into one — each gets its own item
- CRITICAL: If a flyer shows MULTIPLE separate dates (e.g. "April 5" and "April 12", or "5. April und 12. April"), these are DIFFERENT events — create one item per date. Do NOT put them into start_date/end_date of a single item. This is the most common mistake — avoid it.
- end_date is ONLY for events that run CONTINUOUSLY from start to end, such as: multi-day festivals ("April 5–7"), overnight events ("Friday 22:00 to Saturday 06:00"), or conferences with exact day spans. If two dates are more than 36 hours apart, they are almost certainly separate events, not a range.
- Recurring events (e.g. "every Friday", multiple listed dates, "5. April und 12. April") → separate items, one per date.
- When in doubt between "range" and "separate events": always prefer separate items.
- Each item should be self-contained with its own location, dates, etc.
- Set confidence to 0 and value to null for fields you cannot determine
- For detected_type: "event" if there's a specific date/time; "venue" if it's a business listing/card
- Parse dates to ISO 8601 when possible (use current year if year not specified)
- Extract ALL visible text into raw_text
- Fill BOTH event_fields and venue_fields per item when possible (an event flyer often has venue data)
- For pricing: extract presale price (advance tickets) into price_presale, box office/door price into price_box_office. If only one price exists, use price_box_office. If prices show different tiers (e.g., "€10 presale / €15 door"), extract both separately.
- Do NOT hallucinate — only extract what's actually described`

async function structureExtraction(
  contentText: string,
  openaiKey: string,
  isTextMode: boolean,
  hintCity?: string,
  hintCountry?: string,
): Promise<ExtractionResult> {
  const hints = []
  if (hintCity) hints.push(`User hint: city is likely "${hintCity}"`)
  if (hintCountry) hints.push(`User hint: country is likely "${hintCountry}"`)
  const hintText = hints.length > 0 ? '\n\n' + hints.join('\n') : ''

  const userMessage = isTextMode
    ? `Here is text extracted from a document:\n\n${contentText}${hintText}`
    : `Here is a detailed description of a flyer/poster image:\n\n${contentText}${hintText}`

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
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 4000,
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
  const source = isTextMode ? 'text+refinement' : 'vision+refinement'

  try {
    const parsed = JSON.parse(content)
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [parsed]
    const items: ExtractedItem[] = rawItems.slice(0, 10).map((item: Record<string, unknown>) => {
      const detectedType = item.detected_type === 'venue' ? 'venue' : 'event'
      const fields = detectedType === 'event'
        ? { ...item.event_fields, ...pickVenueFieldsForEvent(item.venue_fields) }
        : item.venue_fields || {}

      for (const key of Object.keys(fields)) {
        if (fields[key] && typeof fields[key] === 'object' && 'confidence' in fields[key]) {
          fields[key].source = source
        }
      }

      return { detected_type: detectedType, fields }
    })

    return {
      items: items.length > 0 ? items : [{ detected_type: 'event', fields: {} }],
      raw_text: parsed.raw_text || '',
      language: parsed.language || 'en',
    }
  } catch {
    console.error('Failed to parse structuring response:', content?.slice(0, 200))
    return {
      items: [{ detected_type: 'event', fields: {} }],
      raw_text: contentText,
      language: 'en',
    }
  }
}

/** When type is event, pull venue_name/address/city from venue_fields if event_fields is missing them */
function pickVenueFieldsForEvent(venueFields: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!venueFields) return {}
  const extras: Record<string, unknown> = {}
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
    // deno-lint-ignore no-explicit-any
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
  supabase: SupabaseClient,
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

  // deno-lint-ignore no-explicit-any
  return (data || []).map((e: any) => ({
    ...e,
    score: e.title.toLowerCase() === title.toLowerCase() ? 1.0 : 0.6,
  }))
}

async function checkVenueDuplicates(
  name: string | null | undefined,
  cityId: string | null,
  supabase: SupabaseClient,
): Promise<Array<{ id: string; name: string; score: number }>> {
  if (!name) return []

  let query = supabase
    .from('venues')
    .select('id, name, address, city')
    .ilike('name', name.trim())
    .limit(5)

  if (cityId) query = query.eq('city_id', cityId)

  const { data } = await query
  // deno-lint-ignore no-explicit-any
  return (data || []).map((v: any) => ({ ...v, score: 0.9 }))
}

// ── Rate Limiting ─────────────────────────────────────────────────────────

async function checkRateLimit(userId: string, supabase: SupabaseClient): Promise<boolean> {
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
  // Encode in 32KB chunks to avoid call stack limits and O(n²) string concat
  const chunks: string[] = []
  for (let i = 0; i < uint8.length; i += 32768) {
    chunks.push(String.fromCharCode(...uint8.subarray(i, i + 32768)))
  }
  const base64 = btoa(chunks.join(''))

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
    const { image_url, text, hint_city, hint_country }: AnalyzeRequest = await req.json()
    if (!image_url && !text) return errorResponse('Either image_url or text is required', 400)

    const isTextMode = !!text && !image_url
    console.log(`Analyzing flyer for user ${user.id} (${isTextMode ? 'text' : 'image'} mode)`)

    // Step 1: Get content for structuring
    let contentForStructuring: string

    if (isTextMode) {
      // Text mode — skip vision, use extracted text directly
      contentForStructuring = text!
      console.log(`Text input length: ${contentForStructuring.length}`)
    } else {
      // Image mode — fetch + vision
      console.log('Fetching image...')
      const imageBase64 = await fetchImageAsBase64(image_url!)
      console.log(`Image fetched, base64 length: ${imageBase64.length}`)

      console.log('Pass 1: CF AI Vision analysis...')
      await ensureMetaLicense(cfToken)
      contentForStructuring = await visionDescribe(imageBase64, cfToken)
      console.log('Vision description:', contentForStructuring.slice(0, 200))
    }

    // Step 2: gpt-4o-mini — structure into JSON (multi-item)
    console.log('Pass 2: Structuring with gpt-4o-mini...')
    const extraction = await structureExtraction(contentForStructuring, openaiKey, isTextMode, hint_city, hint_country)
    console.log(`Extracted ${extraction.items.length} item(s)`)

    // Step 3: Per-item entity matching
    console.log('Matching entities...')
    const itemsWithMatches = await Promise.all(
      extraction.items.map(async (item) => {
        const countryName = item.fields.country?.value as string || hint_country
        const matchedCountry = await resolveCountry(countryName, supabase)

        const cityName = item.fields.city?.value as string || hint_city
        const matchedCity = await resolveCity(cityName, matchedCountry?.id || null, supabase)

        const cityId = matchedCity?.id || null
        const venueName = item.detected_type === 'event'
          ? item.fields.venue_name?.value as string
          : item.fields.name?.value as string

        // These three checks only depend on cityId — run in parallel
        const [venueCandidates, duplicateEvents, duplicateVenues] = await Promise.all([
          matchVenues(venueName, cityId, supabase),
          item.detected_type === 'event'
            ? checkEventDuplicates(
                item.fields.title?.value as string,
                item.fields.start_date?.value as string,
                cityId,
                supabase,
              )
            : [],
          item.detected_type === 'venue'
            ? checkVenueDuplicates(
                item.fields.name?.value as string,
                cityId,
                supabase,
              )
            : [],
        ])

        return {
          detected_type: item.detected_type,
          fields: item.fields,
          matches: {
            venue_candidates: venueCandidates,
            city: matchedCity,
            country: matchedCountry,
            duplicate_events: duplicateEvents,
            duplicate_venues: duplicateVenues,
          },
        }
      }),
    )

    const processingTime = Date.now() - startTime
    const primaryItem = itemsWithMatches[0]

    // Step 4: Store audit row
    const { data: scanRow, error: insertError } = await supabase
      .from('flyer_scans')
      .insert({
        user_id: user.id,
        image_url: image_url || `text://${text!.slice(0, 60)}`,
        detected_type: primaryItem.detected_type,
        raw_extraction: {
          vision_description: isTextMode ? null : contentForStructuring,
          structured: extraction,
        },
        matched_venue_id: primaryItem.matches.venue_candidates[0]?.id || null,
        matched_city_id: primaryItem.matches.city?.id || null,
        matched_country_id: primaryItem.matches.country?.id || null,
        duplicate_event_id: primaryItem.matches.duplicate_events[0]?.id || null,
        model_used: isTextMode ? 'gpt-4o-mini' : 'cf-llama-3.2-11b-vision + gpt-4o-mini',
        processing_time_ms: processingTime,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Failed to insert audit row:', insertError)
    }

    // Auto-create community_submissions for each extracted item so they
    // flow through the ingestion pipeline (normalize → validate → dedup → commit).
    if (scanRow?.id) {
      for (const item of itemsWithMatches) {
        const fields = item.fields as Record<string, { value: unknown; confidence: number } | unknown>
        // Flatten fields: { fieldName: value } dropping low-confidence nulls
        const flat: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(fields)) {
          if (v && typeof v === 'object' && 'value' in v) {
            const f = v as { value: unknown; confidence: number }
            if (f.value !== null && f.value !== undefined) flat[k] = f.value
          }
        }
        if (Object.keys(flat).length === 0) continue

        const { error: subErr } = await supabase.from('community_submissions').insert({
          content_type:  item.detected_type,
          status:        'pending',
          data:          { ...flat, _source: 'flyer_scan', _scan_id: scanRow.id },
          submitted_by:  user.id,
          flyer_scan_id: scanRow.id,
        })
        if (subErr) console.error('Failed to create community_submission:', subErr.message)
      }
    }

    console.log(`Analysis complete in ${processingTime}ms — ${itemsWithMatches.length} item(s)`)

    return jsonResponse({
      scan_id: scanRow?.id || null,
      items: itemsWithMatches,
      raw_text: extraction.raw_text,
      language: extraction.language,
      processing_time_ms: processingTime,
    })
  } catch (error) {
    console.error('analyze-flyer error:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
