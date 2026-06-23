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

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { corsHeaders, jsonResponse, errorResponse, hasInternalSecret } from '../_shared/supabase-client.ts'
import { chatCompletion } from '../_shared/openai-client.ts'
import { extractContent, type ExtractResult } from '../_shared/extract-client.ts'
import { COUNTRY_ALIASES } from '../_shared/automation-utils.ts'
import { buildTagSuggestions } from '../_shared/scan-tags.ts'
import { mergeExtractedItems } from '../_shared/scan-merge.ts'

/** A pasted link could not be read server-side (bot-blocked, JS-only, non-HTML,
 *  empty). Surfaced as a 422 so the client shows actionable copy instead of a 500. */
class PageUnreadableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PageUnreadableError'
  }
}

const CF_ACCOUNT_ID = '7aa3765cc5f50f2b681b782eb4a8d296'
const CF_VISION_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`

// ── Types ─────────────────────────────────────────────────────────────────

interface AnalyzeRequest {
  image_url?: string
  image_urls?: string[]
  text?: string
  page_url?: string
  hint_city?: string
  hint_country?: string
  /** Internal cron re-scan: attribute the scan to this user (requires X-Internal-Secret). */
  as_user_id?: string
}

const MAX_IMAGES_PER_SCAN = 5

interface ExtractedField {
  value: unknown
  confidence: number
  source: string
}

type DetectedType = 'event' | 'venue' | 'hotel' | 'news' | 'marketplace'

interface ExtractedItem {
  detected_type: DetectedType
  fields: Record<string, ExtractedField>
  raw_tags: string[]
}

/** Unified duplicate match shape returned to the client across all entity types. */
interface DuplicateMatch {
  id: string
  title: string
  score: number
  type: DetectedType
  city?: string | null
}

interface ExtractionResult {
  items: ExtractedItem[]
  raw_text: string
  language: string
}

/** Typed empty item for structuring-failure fallbacks. */
const EMPTY_ITEM: ExtractedItem = { detected_type: 'event', fields: {}, raw_tags: [] }

// Dynamic extraction bounds. No fixed 10-item cap: long pages (venue calendars)
// are split into chunks, structured in parallel, then merged + deduped. MAX_ITEMS
// is a safety ceiling, not the expected count.
const MAX_ITEMS = 60
const CHUNK_SIZE = 4_000        // chars per LLM structuring call (keeps each ~20-30s)
const CHUNK_OVERLAP = 300       // overlap so an item split across a seam survives in one chunk
const MAX_CHUNKS = 4            // parallel calls cap → wall-clock ≈ one call, under the 45s ceiling
const MAX_STRUCTURE_CHARS = CHUNK_SIZE * MAX_CHUNKS // total content fed to structuring (~16k)

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
Given content from a flyer, poster, page, or document, extract ALL distinct entities as structured JSON.

detected_type is one of: "event" (a dated happening), "venue" (a bar/club/shop/cafe/etc.),
"hotel" (any accommodation — hotel/hostel/B&B/resort/guesthouse), "news" (a news article/blog post),
"marketplace" (a product or service for sale). Fill ONLY the *_fields block matching detected_type
(hotel uses venue_fields plus the hotel-only keys; event flyers may also carry venue data).

Return ONLY valid JSON with this exact structure:
{
  "items": [
    {
      "detected_type": "event"|"venue"|"hotel"|"news"|"marketplace",
      "tags": ["short topical keyword", "..."],
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
        "hours_text": {"value": string|null, "confidence": 0.0-1.0},
        "star_rating": {"value": number|null, "confidence": 0.0-1.0},
        "amenities": {"value": string|null, "confidence": 0.0-1.0},
        "booking_url": {"value": string|null, "confidence": 0.0-1.0}
      },
      "news_fields": {
        "title": {"value": string|null, "confidence": 0.0-1.0},
        "summary": {"value": string|null, "confidence": 0.0-1.0},
        "author": {"value": string|null, "confidence": 0.0-1.0},
        "published_at": {"value": "ISO8601"|null, "confidence": 0.0-1.0},
        "source_name": {"value": string|null, "confidence": 0.0-1.0},
        "url": {"value": string|null, "confidence": 0.0-1.0}
      },
      "marketplace_fields": {
        "title": {"value": string|null, "confidence": 0.0-1.0},
        "description": {"value": string|null, "confidence": 0.0-1.0},
        "price": {"value": string|number|null, "confidence": 0.0-1.0},
        "currency": {"value": string|null, "confidence": 0.0-1.0},
        "brand": {"value": string|null, "confidence": 0.0-1.0},
        "url": {"value": string|null, "confidence": 0.0-1.0},
        "image": {"value": string|null, "confidence": 0.0-1.0}
      }
    }
  ],
  "language": "ISO 639-1 code",
  "raw_text": "all visible text transcribed"
}

Rules:
- COMPACTNESS (important): OMIT any field you cannot determine — do NOT emit null/empty fields or zero-confidence fields. Only include fields you actually found. This keeps each item small so ALL events fit in the response.
- If you find MULTIPLE distinct events or venues, return one item per event/venue — return ALL of them, no fixed limit.
- VENUE WITH A CALENDAR: when the page is a venue's own site/homepage that lists many upcoming events (an event calendar), return the VENUE as the first item (detected_type "venue") AND a separate "event" item for EVERY upcoming event listed. Do not return only the venue, and do not stop early.
- If only one event or venue is found, return an array with a single item
- Do NOT merge separate events into one — each gets its own item
- CRITICAL: If a flyer shows MULTIPLE separate dates (e.g. "April 5" and "April 12", or "5. April und 12. April"), these are DIFFERENT events — create one item per date. Do NOT put them into start_date/end_date of a single item. This is the most common mistake — avoid it.
- end_date is ONLY for events that run CONTINUOUSLY from start to end, such as: multi-day festivals ("April 5–7"), overnight events ("Friday 22:00 to Saturday 06:00"), or conferences with exact day spans. If two dates are more than 36 hours apart, they are almost certainly separate events, not a range.
- Recurring events (e.g. "every Friday", multiple listed dates, "5. April und 12. April") → separate items, one per date.
- When in doubt between "range" and "separate events": always prefer separate items.
- Each item should be self-contained with its own location, dates, etc.
- Omit fields you cannot determine (see COMPACTNESS) rather than emitting null
- For detected_type: "event" if there's a specific date/time; "hotel" for any accommodation; "news" for an article/blog post; "marketplace" for a product/service for sale; "venue" for any other business listing/card
- tags: 2-6 SHORT lowercase topical keywords per item (themes, audience, vibe, category — e.g. "drag", "techno", "lesbian", "leather", "brunch"). Omit generic words like "event"/"venue"/"lgbtq". Omit the tags array entirely if none apply.
- Parse dates to ISO 8601 when possible (use current year if year not specified)
- Extract ALL visible text into raw_text
- Fill BOTH event_fields and venue_fields per item when possible (an event flyer often has venue data)
- For pricing: extract presale price (advance tickets) into price_presale, box office/door price into price_box_office. If only one price exists, use price_box_office. If prices show different tiers (e.g., "€10 presale / €15 door"), extract both separately.
- Do NOT hallucinate — only extract what's actually described`

/** One LLM structuring call over a single content window. Never throws — degrades
 *  to [] items so a bad chunk can't sink the whole scan. */
async function structureChunk(
  chunkText: string,
  supabase: SupabaseClient,
  isTextMode: boolean,
  hintText: string,
  source: string,
): Promise<{ items: ExtractedItem[]; raw_text: string; language: string }> {
  const userMessage = isTextMode
    ? `Here is text extracted from a document:\n\n${chunkText}${hintText}`
    : `Here is a detailed description of a flyer/poster image:\n\n${chunkText}${hintText}`

  let content: string
  try {
    const result = await chatCompletion(supabase, {
      // The 70B follows the JSON contract reliably (Scout produced garbled JSON on
      // real links). Each call is bounded to one CHUNK_SIZE window so it stays
      // ~20-30s under the 45s ceiling; many items come from running chunks in
      // parallel, not from one giant call.
      model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      messages: [
        { role: 'system', content: STRUCTURING_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    })
    content = result.content
  } catch (e) {
    console.error('Structuring model call failed:', (e as Error).message)
    return { items: [], raw_text: '', language: 'en' }
  }

  try {
    // Tolerate models that wrap JSON in ```json fences or surrounding prose.
    const jsonText = (() => {
      const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
      if (fenced) return fenced[1].trim()
      const first = content.indexOf('{')
      const last = content.lastIndexOf('}')
      return first >= 0 && last > first ? content.slice(first, last + 1) : content
    })()
    const parsed = JSON.parse(jsonText)
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [parsed]
    return { items: mapRawItems(rawItems, source), raw_text: parsed.raw_text || '', language: parsed.language || 'en' }
  } catch {
    // Truncated mid-array → salvage the objects that fully closed.
    const salvaged = salvageTruncatedItems(content)
    if (salvaged.length > 0) {
      console.warn(`Structuring JSON invalid — salvaged ${salvaged.length} item(s)`)
      return { items: mapRawItems(salvaged, source), raw_text: '', language: 'en' }
    }
    console.error('Failed to parse structuring response:', content?.slice(0, 200))
    return { items: [], raw_text: '', language: 'en' }
  }
}

/** Split text into ≤ MAX_CHUNKS overlapping windows (overlap so an item straddling
 *  a seam survives whole in one chunk). Short text → a single window. */
function splitIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text]
  const bounded = text.slice(0, MAX_STRUCTURE_CHARS)
  const chunks: string[] = []
  let i = 0
  while (i < bounded.length && chunks.length < MAX_CHUNKS) {
    chunks.push(bounded.slice(i, i + CHUNK_SIZE))
    i += CHUNK_SIZE - CHUNK_OVERLAP
  }
  return chunks
}

async function structureExtraction(
  contentText: string,
  supabase: SupabaseClient,
  isTextMode: boolean,
  hintCity?: string,
  hintCountry?: string,
): Promise<ExtractionResult> {
  const hints = []
  if (hintCity) hints.push(`User hint: city is likely "${hintCity}"`)
  if (hintCountry) hints.push(`User hint: country is likely "${hintCountry}"`)
  const hintText = hints.length > 0 ? '\n\n' + hints.join('\n') : ''
  const source = isTextMode ? 'text+refinement' : 'vision+refinement'

  const chunks = splitIntoChunks(contentText)

  // Single window (flyers, single events, vision descriptions) → one call, no
  // added latency. Long pages → parallel calls; wall-clock ≈ slowest single call.
  const results = await Promise.all(
    chunks.map((c) => structureChunk(c, supabase, isTextMode, hintText, source)),
  )

  const merged = mergeExtractedItems(results.flatMap((r) => r.items), MAX_ITEMS)
  const raw_text = results.find((r) => r.raw_text)?.raw_text || ''
  const language = results.find((r) => r.language && r.language !== 'en')?.language || 'en'

  return { items: merged.length > 0 ? merged : [EMPTY_ITEM], raw_text, language }
}

const VALID_TYPES: DetectedType[] = ['event', 'venue', 'hotel', 'news', 'marketplace']
const FIELD_BLOCK: Record<DetectedType, string> = {
  event: 'event_fields',
  venue: 'venue_fields',
  hotel: 'venue_fields', // hotel is a venue with accommodation fields
  news: 'news_fields',
  marketplace: 'marketplace_fields',
}

/** Map raw model items (per-type *_fields shape) to ExtractedItem[]. */
function mapRawItems(rawItems: unknown[], source: string): ExtractedItem[] {
  return rawItems.slice(0, MAX_ITEMS).map((raw) => {
    const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const detectedType = (VALID_TYPES.includes(item.detected_type as DetectedType)
      ? item.detected_type
      : 'event') as DetectedType

    const block = (item[FIELD_BLOCK[detectedType]] as Record<string, unknown>) || {}
    const fields = (detectedType === 'event'
      ? { ...block, ...pickVenueFieldsForEvent(item.venue_fields as Record<string, unknown>) }
      : block) as Record<string, { confidence: number; source?: string } | unknown>

    for (const key of Object.keys(fields)) {
      const f = fields[key]
      if (f && typeof f === 'object' && 'confidence' in f) {
        (f as { source?: string }).source = source
      }
    }

    const rawTags = Array.isArray(item.tags)
      ? (item.tags as unknown[]).map((t) => String(t)).filter(Boolean).slice(0, 12)
      : []

    return { detected_type: detectedType, fields: fields as ExtractedItem['fields'], raw_tags: rawTags }
  })
}

/** Recover complete `{...}` objects from a truncated `"items":[ ... ` array.
 *  Stops at the first object that didn't fully close. Returns [] if none. */
function salvageTruncatedItems(content: string): Record<string, unknown>[] {
  const m = content.match(/"items"\s*:\s*\[/)
  if (!m || m.index == null) return []
  let i = m.index + m[0].length
  const out: Record<string, unknown>[] = []
  while (i < content.length && out.length < MAX_ITEMS) {
    while (i < content.length && /[\s,]/.test(content[i])) i++
    if (content[i] !== '{') break
    let depth = 0, inStr = false, esc = false
    const start = i
    for (; i < content.length; i++) {
      const c = content[i]
      if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === '"') inStr = false
      } else if (c === '"') inStr = true
      else if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) { i++; break } }
    }
    if (depth !== 0) break // truncated mid-object — stop salvaging
    try { out.push(JSON.parse(content.slice(start, i))) } catch { break }
  }
  return out
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (fallbackData || []).map((v: any) => ({
      ...v,
      score: v.name.toLowerCase() === name.toLowerCase() ? 1.0 : 0.5,
    }))
  }

  return data || []
}

/** Shared duplicate matcher: trigram + vector over search_documents via find_duplicates RPC. */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findDuplicates(entityType: string, title: string, supabase: SupabaseClient): Promise<any[]> {
  const { data, error } = await supabase.rpc('find_duplicates', {
    p_content_type: entityType,
    p_title: title.trim(),
    p_limit: 5,
  })
  if (error || !Array.isArray(data)) return []
  return data
}

async function checkEventDuplicates(
  title: string | null | undefined,
  startDate: string | null | undefined,
  cityId: string | null,
  supabase: SupabaseClient,
): Promise<Array<{ id: string; title: string; start_date: string; score: number }>> {
  if (!title || title.trim().length < 2) return []

  const dups = await findDuplicates('event', title, supabase)
  if (dups.length > 0) {
    return dups.map((d) => ({
      id: d.id,
      title: d.title,
      start_date: d.start_date ?? '',
      score: d.title_sim ?? d.vec_sim ?? 0.6,
    }))
  }

  // Fallback: title + date proximity check
  if (!startDate) return []
  const { data } = await supabase
    .from('events')
    .select('id, title, start_date')
    .ilike('title', `%${title.trim().slice(0, 50)}%`)
    .gte('start_date', new Date(new Date(startDate).getTime() - 86400000).toISOString())
    .lte('start_date', new Date(new Date(startDate).getTime() + 86400000).toISOString())
    .limit(5)

  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  if (!name || name.trim().length < 2) return []

  const dups = await findDuplicates('venue', name, supabase)
  if (dups.length > 0) {
    return dups.map((d) => ({ id: d.id, name: d.title, score: d.title_sim ?? d.vec_sim ?? 0.9 }))
  }

  // Fallback: exact-ish name match
  let query = supabase
    .from('venues')
    .select('id, name, address, city')
    .ilike('name', name.trim())
    .limit(5)

  if (cityId) query = query.eq('city_id', cityId)

  const { data } = await query
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((v: any) => ({ ...v, score: 0.9 }))
}

/** News / marketplace dedup via the shared find_duplicates RPC (trigram + vector). */
async function checkSimpleDuplicates(
  contentType: 'news' | 'marketplace',
  type: DetectedType,
  title: string | null | undefined,
  supabase: SupabaseClient,
): Promise<DuplicateMatch[]> {
  if (!title || title.trim().length < 2) return []
  const dups = await findDuplicates(contentType, title, supabase)
  return dups.map((d) => ({
    id: d.id,
    title: d.title,
    score: d.title_sim ?? d.vec_sim ?? 0.7,
    type,
    city: d.city ?? null,
  }))
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

// ── Page URL Fetching (SSRF-guarded) ──────────────────────────────────────

/** Reject obviously-internal hosts to limit SSRF. IP literals in private/loopback/
 *  link-local ranges and well-known internal hostnames are blocked. */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '') // strip IPv6 brackets
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true
  // IPv6 loopback / unique-local / link-local
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true
  // IPv4 literal in private/loopback/link-local/unspecified ranges
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true // link-local incl. cloud metadata 169.254.169.254
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
  }
  return false
}

/** Strip an HTML document down to readable text for the structuring pass. */
function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript[^>]*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A static extract is "weak" (worth escalating to Browser Rendering) when it
 *  came back empty or has little body text AND no structured metadata to lean on. */
function isWeakExtract(e: ExtractResult | null): boolean {
  if (!e) return true
  const md = (e.markdown || '').trim()
  const hasJsonLd = Array.isArray(e.jsonLd) && e.jsonLd.length > 0
  const hasDesc = !!(e.meta?.description && e.meta.description.trim().length > 0)
  return md.length < 200 && !hasJsonLd && !hasDesc
}

/** Build structuring text from an extract: og:title + og:description + serialized
 *  JSON-LD + markdown. Pages with structured metadata but thin bodies (Eventbrite,
 *  many SPAs) still produce a usable extraction this way. Returns the og:image too. */
function assembleExtractedContent(e: ExtractResult): { text: string; image: string | null } {
  const parts: string[] = []
  if (e.meta?.title) parts.push(`# ${e.meta.title}`)
  if (e.meta?.description) parts.push(e.meta.description)
  if (Array.isArray(e.jsonLd) && e.jsonLd.length > 0) {
    try {
      parts.push('Structured data (schema.org):\n' + JSON.stringify(e.jsonLd))
    } catch { /* non-serializable — skip */ }
  }
  const md = (e.markdown || '').trim()
  if (md) parts.push(md)
  return { text: parts.join('\n\n'), image: e.meta?.image ?? null }
}

const MAX_PAGE_BYTES = 2 * 1024 * 1024 // 2MB of HTML is plenty for extraction

/** Fetch a public web page and return its visible text (SSRF-guarded). */
async function fetchPageText(pageUrl: string): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(pageUrl)
  } catch {
    throw new Error('Invalid page_url')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('page_url must be http(s)')
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error('page_url host is not allowed')
  }

  const response = await fetch(parsed.toString(), {
    signal: AbortSignal.timeout(12_000),
    redirect: 'follow',
    headers: {
      // Realistic Chrome UA — the bot UA was blocked / served degraded pages by
      // many event & venue sites (the common scan targets).
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
  })
  if (!response.ok) throw new Error(`Failed to fetch page: ${response.status}`)

  const contentType = response.headers.get('content-type') || ''
  if (contentType && !/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
    throw new Error('page_url did not return an HTML page')
  }

  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > MAX_PAGE_BYTES) throw new Error('Page too large (max 2MB)')
  const html = new TextDecoder().decode(buffer)
  const text = htmlToText(html)
  if (text.length < 20) throw new Error('Page had no extractable text')
  // structureExtraction chunks this across parallel LLM calls; feed the full window.
  return text.slice(0, MAX_STRUCTURE_CHARS)
}

// ── Main Handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const cfToken = Deno.env.get('CLOUDFLARE_API_TOKEN')

    if (!cfToken) return errorResponse('CLOUDFLARE_API_TOKEN not configured', 500)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request first so internal callers (refresh-watched-urls cron) can pass as_user_id.
    const { image_url, image_urls, text, page_url, hint_city, hint_country, as_user_id }: AnalyzeRequest = await req.json()

    // Auth: a user JWT (interactive scan) OR a valid internal secret + as_user_id
    // (cron re-scan of a watched URL, attributed to the watch owner — no per-user
    // rate limit, since it's system-driven).
    const internal = hasInternalSecret(req)
    let userId: string
    if (internal && as_user_id) {
      userId = as_user_id
    } else {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) return errorResponse('Missing authorization', 401)
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) return errorResponse('Invalid authorization', 401)
      userId = user.id
      const withinLimit = await checkRateLimit(userId, supabase)
      if (!withinLimit) return errorResponse('Rate limit exceeded (20 scans/hour)', 429)
    }

    const urls: string[] = (Array.isArray(image_urls) ? image_urls : [])
      .concat(image_url ? [image_url] : [])
      .filter((u, i, arr) => typeof u === 'string' && u.length > 0 && arr.indexOf(u) === i)
      .slice(0, MAX_IMAGES_PER_SCAN)
    if (urls.length === 0 && !text && !page_url) {
      return errorResponse('image_url, image_urls, text, or page_url is required', 400)
    }

    // A pasted link is fetched + stripped to text, then rides the text pipeline.
    let textInput = text
    let pageImageUrl: string | null = null
    if (urls.length === 0 && !textInput && page_url) {
      console.log(`Fetching page for extraction: ${page_url}`)
      // Prefer the deepcrawl extract worker (clean markdown + OG/JSON-LD metadata).
      // Static fetch first; escalate once to Browser Rendering for JS-only pages
      // whose static pass yields little usable content. Fall back to the naive
      // in-function fetcher. A genuine read failure becomes an actionable 422.
      let extracted = await extractContent(supabase, { url: page_url })
      if (isWeakExtract(extracted)) {
        console.log('Static extract weak — escalating to Browser Rendering')
        const rendered = await extractContent(supabase, {
          url: page_url,
          render: true,
          timeoutMs: 20_000,
        })
        if (rendered && (!isWeakExtract(rendered) || !extracted)) extracted = rendered
      }
      const assembled = extracted ? assembleExtractedContent(extracted) : null
      if (assembled && assembled.text.trim().length >= 20) {
        textInput = assembled.text.slice(0, MAX_STRUCTURE_CHARS)
        pageImageUrl = assembled.image
      } else {
        try {
          textInput = await fetchPageText(page_url)
        } catch (e) {
          throw new PageUnreadableError((e as Error).message || 'page unreadable')
        }
      }
    }

    const isTextMode = !!textInput && urls.length === 0
    console.log(`Analyzing flyer for user ${userId} (${isTextMode ? 'text' : `image x${urls.length}`} mode)`)

    // Step 1: Get content for structuring
    let contentForStructuring: string

    if (isTextMode) {
      contentForStructuring = textInput!
      console.log(`Text input length: ${contentForStructuring.length}`)
    } else {
      console.log('Pass 1: CF AI Vision analysis...')
      await ensureMetaLicense(cfToken)
      const descriptions: string[] = []
      for (let i = 0; i < urls.length; i++) {
        try {
          const b64 = await fetchImageAsBase64(urls[i])
          const desc = await visionDescribe(b64, cfToken)
          descriptions.push(urls.length > 1 ? `--- IMAGE ${i + 1}/${urls.length} ---\n${desc}` : desc)
        } catch (e) {
          console.error(`Vision failed for image ${i + 1}:`, e)
          descriptions.push(`--- IMAGE ${i + 1}/${urls.length} (failed) ---`)
        }
      }
      contentForStructuring = descriptions.join('\n\n')
      console.log('Combined vision description length:', contentForStructuring.length)
    }

    // Step 2: gpt-4o-mini — structure into JSON (multi-item)
    console.log('Pass 2: Structuring with gpt-4o-mini...')
    const extraction = await structureExtraction(contentForStructuring, supabase, isTextMode, hint_city, hint_country)
    console.log(`Extracted ${extraction.items.length} item(s)`)

    // Step 3: Per-item entity matching
    console.log('Matching entities...')
    const itemsWithMatches = await Promise.all(
      extraction.items.map(async (item) => {
        const type = item.detected_type
        const isVenueLike = type === 'venue' || type === 'hotel'
        const title = (type === 'venue' || type === 'hotel'
          ? item.fields.name?.value
          : item.fields.title?.value) as string | undefined
        const description = (item.fields.description?.value ?? item.fields.summary?.value) as string | undefined

        const countryName = item.fields.country?.value as string || hint_country
        const matchedCountry = await resolveCountry(countryName, supabase)
        const cityName = item.fields.city?.value as string || hint_city
        const matchedCity = await resolveCity(cityName, matchedCountry?.id || null, supabase)
        const cityId = matchedCity?.id || null

        // venue_candidates: link an event/hotel to an existing venue.
        const venueName = type === 'event' ? item.fields.venue_name?.value as string : title

        const [venueCandidates, duplicateEvents, duplicateVenues, simpleDups, tagSuggestions] = await Promise.all([
          matchVenues(venueName, cityId, supabase),
          type === 'event'
            ? checkEventDuplicates(title, item.fields.start_date?.value as string, cityId, supabase)
            : Promise.resolve([]),
          isVenueLike ? checkVenueDuplicates(title, cityId, supabase) : Promise.resolve([]),
          type === 'news'
            ? checkSimpleDuplicates('news', 'news', title, supabase)
            : type === 'marketplace'
              ? checkSimpleDuplicates('marketplace', 'marketplace', title, supabase)
              : Promise.resolve([] as DuplicateMatch[]),
          buildTagSuggestions(supabase, item.raw_tags, title, description),
        ])

        // Unified duplicate list across all entity types, highest score first.
        const duplicates: DuplicateMatch[] = [
          ...duplicateEvents.map((d) => ({ id: d.id, title: d.title, score: d.score, type: 'event' as DetectedType })),
          ...duplicateVenues.map((d) => ({ id: d.id, title: d.name, score: d.score, type })),
          ...simpleDups,
        ].sort((a, b) => b.score - a.score)

        return {
          detected_type: type,
          fields: item.fields,
          tag_suggestions: tagSuggestions,
          matches: {
            venue_candidates: venueCandidates,
            city: matchedCity,
            country: matchedCountry,
            duplicates,
            // Retained for back-compat with older clients.
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
        user_id: userId,
        image_url: urls[0] || page_url || `text://${(textInput || '').slice(0, 60)}`,
        detected_type: primaryItem.detected_type,
        raw_extraction: {
          vision_description: isTextMode ? null : contentForStructuring,
          image_urls: urls,
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

    // NOTE: no longer auto-creates community_submissions. The scan is read-only —
    // extraction + matching + this audit row. The client reviews all items and
    // submits the batch explicitly (single source of truth, avoids double-submit).

    console.log(`Analysis complete in ${processingTime}ms — ${itemsWithMatches.length} item(s)`)

    return jsonResponse({
      scan_id: scanRow?.id || null,
      items: itemsWithMatches,
      raw_text: extraction.raw_text,
      language: extraction.language,
      // OG image of a scanned page, so the form can prefill a preview image.
      image_url: urls[0] || pageImageUrl || null,
      processing_time_ms: processingTime,
    })
  } catch (error) {
    console.error('analyze-flyer error:', error)
    if (error instanceof PageUnreadableError) {
      return errorResponse(
        "We couldn't read that link. It may require a login or block automated access. Upload a screenshot of the flyer instead.",
        422,
      )
    }
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
