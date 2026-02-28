import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// ─── Types ──────────────────────────────────────────────────────────────────

interface AutomationModule {
  id: string
  name: string
  is_enabled: boolean
  confidence_threshold: number
  auto_approve: boolean
  batch_size: number
  rate_limit_per_minute: number
  config: Record<string, unknown>
}

interface ContentFlag {
  module_name: string
  content_type: string
  content_id: string
  flag_type: string
  severity: string
  confidence: number
  title: string
  description: string
  current_value?: unknown
  suggested_value?: unknown
  auto_approved: boolean
  status: string
}

interface ProcessingResult {
  items_total: number
  items_processed: number
  items_succeeded: number
  items_failed: number
  flags_created: number
  auto_approved: number
  errors: string[]
}

// ─── Tracking params to strip from URLs ─────────────────────────────────────

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid', 'twclid',
  'mc_cid', 'mc_eid', 'igshid', 'ref', '_ga', '_gl',
  'yclid', 'zanpid', 'epik', 'pp', 'si',
])

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()

  try {
    let payload: Record<string, unknown> = {}
    try {
      payload = await req.json()
    } catch {
      // empty body ok for cron dispatch
    }

    const moduleName = payload.module as string
    if (!moduleName) {
      return errorResponse('Missing "module" parameter', 400, req)
    }

    // Load module config
    const { data: mod, error: modError } = await supabase
      .from('automation_modules')
      .select('*')
      .eq('name', moduleName)
      .single()

    if (modError || !mod) {
      return errorResponse(`Unknown automation module: ${moduleName}`, 404, req)
    }

    if (!mod.is_enabled) {
      return jsonResponse({ success: true, message: `Module ${moduleName} is disabled`, items_processed: 0 }, 200, req)
    }

    const result = await runModule(supabase, mod as AutomationModule, payload)

    // Update module stats
    await supabase
      .from('automation_modules')
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: result.items_failed > 0 ? (result.items_succeeded > 0 ? 'partial' : 'failed') : 'success',
        total_runs: (mod as AutomationModule).total_runs + 1,
        total_items_processed: (mod as AutomationModule).total_items_processed + result.items_processed,
      })
      .eq('id', mod.id)

    return jsonResponse({ success: true, module: moduleName, ...result }, 200, req)
  } catch (error) {
    console.error('content-automation error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})

// ─── Module Router ──────────────────────────────────────────────────────────

async function runModule(
  supabase: SupabaseClient,
  mod: AutomationModule,
  payload: Record<string, unknown>
): Promise<ProcessingResult> {
  switch (mod.name) {
    case 'content-quality-checker':
      return runContentQualityCheck(supabase, mod)
    case 'link-validator':
      return runLinkValidation(supabase, mod, payload)
    case 'geo-enricher':
      return runGeoEnrichment(supabase, mod)
    case 'date-normalizer':
      return runDateNormalization(supabase, mod)
    case 'auto-tagger':
      return runAutoTagger(supabase, mod)
    case 'contact-normalizer':
      return runContactNormalization(supabase, mod)
    case 'ai-content-enhancer':
      return runAIEnhancement(supabase, mod)
    default:
      throw new Error(`No handler for module: ${mod.name}`)
  }
}

// ─── Content Quality Check ──────────────────────────────────────────────────

async function runContentQualityCheck(
  supabase: SupabaseClient,
  mod: AutomationModule
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    items_total: 0, items_processed: 0, items_succeeded: 0,
    items_failed: 0, flags_created: 0, auto_approved: 0, errors: [],
  }
  const config = mod.config as Record<string, unknown>
  const minDescLen = (config.min_description_length as number) || 20

  // Process venues
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, description, address')
    .order('created_at', { ascending: false })
    .limit(mod.batch_size)

  result.items_total += venues?.length || 0

  for (const venue of venues || []) {
    try {
      const flags: Omit<ContentFlag, 'status'>[] = []

      // Check description length
      if (!venue.description || venue.description.length < minDescLen) {
        flags.push({
          module_name: mod.name,
          content_type: 'venues',
          content_id: venue.id,
          flag_type: 'quality_issue',
          severity: 'warning',
          confidence: 0.95,
          title: `Short or missing description for "${venue.name}"`,
          description: `Description is ${venue.description?.length || 0} chars (min: ${minDescLen})`,
          current_value: { description: venue.description },
          auto_approved: false,
        })
      }

      // Check encoding issues
      if (venue.description && hasEncodingIssues(venue.description)) {
        flags.push({
          module_name: mod.name,
          content_type: 'venues',
          content_id: venue.id,
          flag_type: 'encoding_issue',
          severity: 'error',
          confidence: 0.99,
          title: `Encoding issues in "${venue.name}"`,
          description: 'Description contains mojibake or broken character encoding',
          current_value: { description: venue.description },
          suggested_value: { description: fixEncoding(venue.description) },
          auto_approved: mod.auto_approve && mod.confidence_threshold <= 0.99,
        })
      }

      // Check HTML issues
      if (venue.description && hasBrokenHTML(venue.description)) {
        flags.push({
          module_name: mod.name,
          content_type: 'venues',
          content_id: venue.id,
          flag_type: 'quality_issue',
          severity: 'warning',
          confidence: 0.90,
          title: `Malformed HTML in "${venue.name}"`,
          description: 'Description contains broken or unclosed HTML tags',
          current_value: { description: venue.description },
          suggested_value: { description: cleanHTML(venue.description) },
          auto_approved: false,
        })
      }

      await insertFlags(supabase, flags, mod)
      result.flags_created += flags.length
      result.auto_approved += flags.filter(f => f.auto_approved).length
      result.items_succeeded++
    } catch (e) {
      result.items_failed++
      result.errors.push(`venue ${venue.id}: ${(e as Error).message}`)
    }
    result.items_processed++
  }

  // Process events with similar checks
  const { data: events } = await supabase
    .from('events')
    .select('id, name, description')
    .order('created_at', { ascending: false })
    .limit(mod.batch_size)

  result.items_total += events?.length || 0

  for (const event of events || []) {
    try {
      const flags: Omit<ContentFlag, 'status'>[] = []

      if (!event.description || event.description.length < minDescLen) {
        flags.push({
          module_name: mod.name,
          content_type: 'events',
          content_id: event.id,
          flag_type: 'quality_issue',
          severity: 'warning',
          confidence: 0.95,
          title: `Short or missing description for "${event.name}"`,
          description: `Description is ${event.description?.length || 0} chars (min: ${minDescLen})`,
          current_value: { description: event.description },
          auto_approved: false,
        })
      }

      if (event.description && hasEncodingIssues(event.description)) {
        flags.push({
          module_name: mod.name,
          content_type: 'events',
          content_id: event.id,
          flag_type: 'encoding_issue',
          severity: 'error',
          confidence: 0.99,
          title: `Encoding issues in "${event.name}"`,
          description: 'Description contains broken character encoding',
          current_value: { description: event.description },
          suggested_value: { description: fixEncoding(event.description) },
          auto_approved: mod.auto_approve && mod.confidence_threshold <= 0.99,
        })
      }

      await insertFlags(supabase, flags, mod)
      result.flags_created += flags.length
      result.items_succeeded++
    } catch (e) {
      result.items_failed++
      result.errors.push(`event ${event.id}: ${(e as Error).message}`)
    }
    result.items_processed++
  }

  return result
}

// ─── Link Validation ────────────────────────────────────────────────────────

async function runLinkValidation(
  supabase: SupabaseClient,
  mod: AutomationModule,
  payload: Record<string, unknown>
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    items_total: 0, items_processed: 0, items_succeeded: 0,
    items_failed: 0, flags_created: 0, auto_approved: 0, errors: [],
  }
  const config = mod.config as Record<string, boolean | number | string>
  const timeoutMs = (config.timeout_ms as number) || 10000
  const isIncremental = payload.incremental === true
  const batchSize = (payload.batch_size as number) || mod.batch_size

  // Get venues with website URLs
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, external_apis, rss_feed_url, apple_pass_url')
    .order(isIncremental ? 'updated_at' : 'created_at', { ascending: false })
    .limit(batchSize)

  result.items_total += venues?.length || 0

  for (const venue of venues || []) {
    try {
      const urls: { field: string; url: string }[] = []

      // Extract website from external_apis
      const externalApis = venue.external_apis as Record<string, unknown> | null
      if (externalApis?.website) urls.push({ field: 'website', url: externalApis.website as string })
      if (venue.rss_feed_url) urls.push({ field: 'rss_feed_url', url: venue.rss_feed_url })

      for (const { field, url } of urls) {
        if (!url || !isValidUrl(url)) continue

        const validation = await validateUrl(url, timeoutMs)
        const normalized = normalizeUrl(url, config.strip_utm !== false)
        const strippedParams = getStrippedParams(url, normalized)

        // Upsert link validation
        await supabase
          .from('link_validations')
          .upsert({
            content_type: 'venues',
            content_id: venue.id,
            field_name: field,
            original_url: url,
            normalized_url: normalized,
            http_status: validation.status,
            redirect_url: validation.redirectUrl,
            is_alive: validation.isAlive,
            is_https: url.startsWith('https://'),
            had_tracking_params: strippedParams.length > 0,
            stripped_params: strippedParams,
            response_time_ms: validation.responseTimeMs,
            error_message: validation.error,
            last_checked_at: new Date().toISOString(),
          }, { onConflict: 'content_type,content_id,field_name,original_url' })

        // Flag dead links
        if (!validation.isAlive) {
          const flags: Omit<ContentFlag, 'status'>[] = [{
            module_name: mod.name,
            content_type: 'venues',
            content_id: venue.id,
            flag_type: 'broken_link',
            severity: validation.status === 0 ? 'error' : 'warning',
            confidence: 0.98,
            title: `Dead link in "${venue.name}" (${field})`,
            description: `URL ${url} returned ${validation.status || 'timeout'}: ${validation.error || 'unreachable'}`,
            current_value: { [field]: url },
            auto_approved: false,
          }]
          await insertFlags(supabase, flags, mod)
          result.flags_created++
        }

        // Flag HTTP-only links
        if (!url.startsWith('https://') && config.enforce_https) {
          const httpsUrl = url.replace('http://', 'https://')
          const httpsCheck = await validateUrl(httpsUrl, timeoutMs)
          if (httpsCheck.isAlive) {
            const flags: Omit<ContentFlag, 'status'>[] = [{
              module_name: mod.name,
              content_type: 'venues',
              content_id: venue.id,
              flag_type: 'broken_link',
              severity: 'info',
              confidence: 0.95,
              title: `HTTP link can be upgraded to HTTPS: "${venue.name}" (${field})`,
              description: `URL ${url} is available over HTTPS`,
              current_value: { [field]: url },
              suggested_value: { [field]: httpsUrl },
              auto_approved: mod.auto_approve && mod.confidence_threshold <= 0.95,
            }]
            await insertFlags(supabase, flags, mod)
            result.flags_created++
          }
        }

        // Flag tracking params
        if (strippedParams.length > 0) {
          const flags: Omit<ContentFlag, 'status'>[] = [{
            module_name: mod.name,
            content_type: 'venues',
            content_id: venue.id,
            flag_type: 'broken_link',
            severity: 'info',
            confidence: 0.99,
            title: `Tracking params in "${venue.name}" (${field})`,
            description: `Removed: ${strippedParams.join(', ')}`,
            current_value: { [field]: url },
            suggested_value: { [field]: normalized },
            auto_approved: mod.auto_approve,
          }]
          await insertFlags(supabase, flags, mod)
          result.flags_created++
          if (mod.auto_approve) result.auto_approved++
        }
      }

      result.items_succeeded++
    } catch (e) {
      result.items_failed++
      result.errors.push(`venue ${venue.id}: ${(e as Error).message}`)
    }
    result.items_processed++
  }

  return result
}

// ─── Geo Enrichment ─────────────────────────────────────────────────────────

async function runGeoEnrichment(
  supabase: SupabaseClient,
  mod: AutomationModule
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    items_total: 0, items_processed: 0, items_succeeded: 0,
    items_failed: 0, flags_created: 0, auto_approved: 0, errors: [],
  }

  // Get venues with coordinates but no geo validation
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, address, location, city_id')
    .not('location', 'is', null)
    .order('created_at', { ascending: false })
    .limit(mod.batch_size)

  result.items_total = venues?.length || 0

  for (const venue of venues || []) {
    try {
      // Check if already validated
      const { data: existing } = await supabase
        .from('geo_validations')
        .select('id')
        .eq('content_type', 'venues')
        .eq('content_id', venue.id)
        .single()

      if (existing) {
        result.items_processed++
        result.items_succeeded++
        continue
      }

      // Extract coordinates from PostGIS geometry
      const coords = extractCoords(venue.location)
      if (!coords) {
        result.items_processed++
        result.items_failed++
        result.errors.push(`venue ${venue.id}: Could not extract coordinates`)
        continue
      }

      // Reverse geocode via Nominatim
      const geo = await reverseGeocode(coords.lat, coords.lng)

      // Detect mismatches
      const hasMismatch = venue.address && geo.city
        ? !venue.address.toLowerCase().includes(geo.city.toLowerCase()) &&
          !venue.address.toLowerCase().includes(geo.country?.toLowerCase() || '')
        : false

      // Store validation
      await supabase.from('geo_validations').upsert({
        content_type: 'venues',
        content_id: venue.id,
        original_lat: coords.lat,
        original_lng: coords.lng,
        validated_lat: coords.lat,
        validated_lng: coords.lng,
        geocoded_address: geo.display_name,
        continent: geo.continent,
        country: geo.country,
        country_code: geo.country_code,
        region: geo.state,
        city: geo.city,
        timezone: geo.timezone,
        confidence: geo.confidence,
        has_mismatch: hasMismatch,
        mismatch_details: hasMismatch ? `Address "${venue.address}" does not match geocoded location "${geo.city}, ${geo.country}"` : null,
        source: 'nominatim',
        last_validated_at: new Date().toISOString(),
      }, { onConflict: 'content_type,content_id' })

      // Flag mismatches
      if (hasMismatch) {
        const flags: Omit<ContentFlag, 'status'>[] = [{
          module_name: mod.name,
          content_type: 'venues',
          content_id: venue.id,
          flag_type: 'geo_mismatch',
          severity: 'warning',
          confidence: geo.confidence || 0.7,
          title: `Location mismatch for "${venue.name}"`,
          description: `Address "${venue.address}" doesn't match coordinates → "${geo.city}, ${geo.country}"`,
          current_value: { address: venue.address, lat: coords.lat, lng: coords.lng },
          suggested_value: { geocoded: `${geo.city}, ${geo.state}, ${geo.country}` },
          auto_approved: false,
        }]
        await insertFlags(supabase, flags, mod)
        result.flags_created++
      }

      result.items_succeeded++
    } catch (e) {
      result.items_failed++
      result.errors.push(`venue ${venue.id}: ${(e as Error).message}`)
    }
    result.items_processed++

    // Rate limit: nominatim allows 1 req/s
    await delay(1100)
  }

  return result
}

// ─── Date Normalization ─────────────────────────────────────────────────────

async function runDateNormalization(
  supabase: SupabaseClient,
  mod: AutomationModule
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    items_total: 0, items_processed: 0, items_succeeded: 0,
    items_failed: 0, flags_created: 0, auto_approved: 0, errors: [],
  }

  // Find events with missing end_time or past events still marked active
  const { data: events } = await supabase
    .from('events')
    .select('id, name, start_time, end_time, status, city_id')
    .order('created_at', { ascending: false })
    .limit(mod.batch_size)

  result.items_total = events?.length || 0

  for (const event of events || []) {
    try {
      const flags: Omit<ContentFlag, 'status'>[] = []
      const now = new Date()

      // Flag past events still marked published
      if (event.status === 'published' && event.start_time) {
        const startDate = new Date(event.start_time)
        const endDate = event.end_time ? new Date(event.end_time) : startDate
        if (endDate < now) {
          flags.push({
            module_name: mod.name,
            content_type: 'events',
            content_id: event.id,
            flag_type: 'date_issue',
            severity: 'info',
            confidence: 0.99,
            title: `Past event still published: "${event.name}"`,
            description: `Event ended ${endDate.toISOString()} but is still marked as published`,
            current_value: { status: event.status, end_time: event.end_time },
            suggested_value: { status: 'completed' },
            auto_approved: mod.auto_approve && mod.confidence_threshold <= 0.99,
          })
        }
      }

      // Flag events without end_time
      if (event.start_time && !event.end_time) {
        flags.push({
          module_name: mod.name,
          content_type: 'events',
          content_id: event.id,
          flag_type: 'date_issue',
          severity: 'info',
          confidence: 0.90,
          title: `Missing end time: "${event.name}"`,
          description: 'Event has no end time set',
          current_value: { start_time: event.start_time, end_time: null },
          auto_approved: false,
        })
      }

      await insertFlags(supabase, flags, mod)
      result.flags_created += flags.length
      result.auto_approved += flags.filter(f => f.auto_approved).length
      result.items_succeeded++
    } catch (e) {
      result.items_failed++
      result.errors.push(`event ${event.id}: ${(e as Error).message}`)
    }
    result.items_processed++
  }

  return result
}

// ─── Auto Tagger ────────────────────────────────────────────────────────────

async function runAutoTagger(
  supabase: SupabaseClient,
  mod: AutomationModule
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    items_total: 0, items_processed: 0, items_succeeded: 0,
    items_failed: 0, flags_created: 0, auto_approved: 0, errors: [],
  }

  // Get all existing tags for matching
  const { data: allTags } = await supabase
    .from('tags')
    .select('id, name')
    .limit(1000)

  const tagNames = (allTags || []).map(t => t.name.toLowerCase())

  // Process venues missing tags
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, description, address')
    .order('created_at', { ascending: false })
    .limit(mod.batch_size)

  result.items_total = venues?.length || 0

  for (const venue of venues || []) {
    try {
      if (!venue.description) {
        result.items_processed++
        result.items_succeeded++
        continue
      }

      // Simple keyword-based tag matching
      const text = `${venue.name} ${venue.description} ${venue.address || ''}`.toLowerCase()
      const suggestedTags = tagNames.filter(tag => tag.length > 2 && text.includes(tag))

      if (suggestedTags.length > 0) {
        const flags: Omit<ContentFlag, 'status'>[] = [{
          module_name: mod.name,
          content_type: 'venues',
          content_id: venue.id,
          flag_type: 'missing_tags',
          severity: 'info',
          confidence: 0.75,
          title: `Tag suggestions for "${venue.name}"`,
          description: `Found ${suggestedTags.length} potential tags from content analysis`,
          suggested_value: { tags: suggestedTags.slice(0, 15) },
          auto_approved: false,
        }]
        await insertFlags(supabase, flags, mod)
        result.flags_created++
      }

      result.items_succeeded++
    } catch (e) {
      result.items_failed++
      result.errors.push(`venue ${venue.id}: ${(e as Error).message}`)
    }
    result.items_processed++
  }

  return result
}

// ─── Contact Normalization ──────────────────────────────────────────────────

async function runContactNormalization(
  supabase: SupabaseClient,
  mod: AutomationModule
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    items_total: 0, items_processed: 0, items_succeeded: 0,
    items_failed: 0, flags_created: 0, auto_approved: 0, errors: [],
  }

  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, external_apis')
    .not('external_apis', 'is', null)
    .order('created_at', { ascending: false })
    .limit(mod.batch_size)

  result.items_total = venues?.length || 0

  for (const venue of venues || []) {
    try {
      const apis = venue.external_apis as Record<string, unknown> | null
      if (!apis) { result.items_processed++; result.items_succeeded++; continue }

      const flags: Omit<ContentFlag, 'status'>[] = []

      // Validate email
      const email = apis.email as string
      if (email && !isValidEmail(email)) {
        flags.push({
          module_name: mod.name,
          content_type: 'venues',
          content_id: venue.id,
          flag_type: 'contact_invalid',
          severity: 'warning',
          confidence: 0.95,
          title: `Invalid email for "${venue.name}"`,
          description: `Email "${email}" does not appear to be RFC-compliant`,
          current_value: { email },
          auto_approved: false,
        })
      }

      // Normalize website URLs
      const website = apis.website as string
      if (website) {
        const normalized = normalizeUrl(website, true)
        if (normalized !== website) {
          flags.push({
            module_name: mod.name,
            content_type: 'venues',
            content_id: venue.id,
            flag_type: 'contact_invalid',
            severity: 'info',
            confidence: 0.95,
            title: `Website URL can be cleaned for "${venue.name}"`,
            description: `Website contains tracking parameters or can be normalized`,
            current_value: { website },
            suggested_value: { website: normalized },
            auto_approved: mod.auto_approve,
          })
        }
      }

      await insertFlags(supabase, flags, mod)
      result.flags_created += flags.length
      result.auto_approved += flags.filter(f => f.auto_approved).length
      result.items_succeeded++
    } catch (e) {
      result.items_failed++
      result.errors.push(`venue ${venue.id}: ${(e as Error).message}`)
    }
    result.items_processed++
  }

  return result
}

// ─── AI Content Enhancement ─────────────────────────────────────────────────

async function runAIEnhancement(
  supabase: SupabaseClient,
  mod: AutomationModule
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    items_total: 0, items_processed: 0, items_succeeded: 0,
    items_failed: 0, flags_created: 0, auto_approved: 0, errors: [],
  }
  const config = mod.config as Record<string, unknown>

  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiKey) {
    return { ...result, errors: ['OPENAI_API_KEY not configured'] }
  }

  // Get venues with short descriptions
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, description, address')
    .or('description.is.null,description.lt.100')
    .order('created_at', { ascending: false })
    .limit(mod.batch_size)

  result.items_total = venues?.length || 0

  for (const venue of venues || []) {
    try {
      const prompt = `You are helping improve listings for a queer-friendly venue directory. Write a concise, welcoming, and inclusive description (2-3 sentences, max 200 words) for the following venue. Use inclusive language and be culturally sensitive.\n\nVenue: ${venue.name}\nAddress: ${venue.address || 'Unknown'}\nCurrent description: ${venue.description || 'None'}\n\nProvide only the improved description text, no other commentary.`

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: (config.model as string) || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: (config.max_tokens as number) || 500,
          temperature: (config.temperature as number) || 0.3,
        }),
      })

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`)
      }

      const data = await response.json()
      const improvedDescription = data.choices?.[0]?.message?.content?.trim()

      if (improvedDescription) {
        const confidence = 0.70 // AI-generated suggestions start at lower confidence
        const flags: Omit<ContentFlag, 'status'>[] = [{
          module_name: mod.name,
          content_type: 'venues',
          content_id: venue.id,
          flag_type: 'ai_suggestion',
          severity: 'info',
          confidence,
          title: `AI-improved description for "${venue.name}"`,
          description: 'AI-generated description improvement based on venue context',
          current_value: { description: venue.description },
          suggested_value: { description: improvedDescription },
          auto_approved: mod.auto_approve && confidence >= mod.confidence_threshold,
        }]
        await insertFlags(supabase, flags, mod)
        result.flags_created++
        if (flags[0].auto_approved) result.auto_approved++
      }

      result.items_succeeded++
    } catch (e) {
      result.items_failed++
      result.errors.push(`venue ${venue.id}: ${(e as Error).message}`)
    }
    result.items_processed++

    // Rate limit OpenAI calls
    await delay(500)
  }

  return result
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function insertFlags(
  supabase: SupabaseClient,
  flags: Omit<ContentFlag, 'status'>[],
  mod: AutomationModule
): Promise<void> {
  if (flags.length === 0) return

  const rows = flags.map(f => ({
    ...f,
    status: f.auto_approved ? 'applied' : 'pending',
    applied_at: f.auto_approved ? new Date().toISOString() : null,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
  }))

  await supabase.from('content_flags').insert(rows)

  // Auto-apply approved changes
  for (const flag of flags) {
    if (flag.auto_approved && flag.suggested_value) {
      await applyChange(supabase, flag.content_type, flag.content_id, flag.suggested_value as Record<string, unknown>)
    }
  }
}

async function applyChange(
  supabase: SupabaseClient,
  contentType: string,
  contentId: string,
  changes: Record<string, unknown>
): Promise<void> {
  try {
    await supabase
      .from(contentType)
      .update(changes)
      .eq('id', contentId)
  } catch (e) {
    console.error(`Failed to auto-apply change to ${contentType}/${contentId}:`, e)
  }
}

function hasEncodingIssues(text: string): boolean {
  // Common mojibake patterns
  return /Ã¤|Ã¶|Ã¼|Ã©|Ã¨|â€™|â€"|â€œ|â€|Â |Â·|Ã¢|Ã®/.test(text)
}

function fixEncoding(text: string): string {
  return text
    .replace(/Ã¤/g, 'ä').replace(/Ã¶/g, 'ö').replace(/Ã¼/g, 'ü')
    .replace(/Ã©/g, 'é').replace(/Ã¨/g, 'è')
    .replace(/â€™/g, "'").replace(/â€"/g, '—')
    .replace(/â€œ/g, '"').replace(/â€/g, '"')
    .replace(/Â /g, ' ')
}

function hasBrokenHTML(text: string): boolean {
  const openTags = text.match(/<[a-z][^>]*(?<!\/)>/gi) || []
  const closeTags = text.match(/<\/[a-z]+>/gi) || []
  // Simple heuristic: significantly mismatched open/close tags
  return Math.abs(openTags.length - closeTags.length) > 2
}

function cleanHTML(text: string): string {
  // Strip all HTML tags as a safe fallback
  return text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

function normalizeUrl(url: string, stripTracking: boolean): string {
  try {
    const parsed = new URL(url)
    if (stripTracking) {
      const params = new URLSearchParams(parsed.search)
      for (const key of [...params.keys()]) {
        if (TRACKING_PARAMS.has(key)) {
          params.delete(key)
        }
      }
      parsed.search = params.toString()
    }
    // Remove trailing slash for consistency (except root)
    let normalized = parsed.toString()
    if (normalized.endsWith('/') && parsed.pathname !== '/') {
      normalized = normalized.slice(0, -1)
    }
    return normalized
  } catch {
    return url
  }
}

function getStrippedParams(original: string, normalized: string): string[] {
  try {
    const origParams = new URL(original).searchParams
    const normParams = new URL(normalized).searchParams
    const stripped: string[] = []
    for (const key of origParams.keys()) {
      if (!normParams.has(key)) stripped.push(key)
    }
    return stripped
  } catch {
    return []
  }
}

async function validateUrl(url: string, timeoutMs: number): Promise<{
  isAlive: boolean
  status: number
  redirectUrl?: string
  responseTimeMs: number
  error?: string
}> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), timeoutMs)

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    })

    clearTimeout(tid)
    const responseTimeMs = Date.now() - start

    return {
      isAlive: response.ok,
      status: response.status,
      redirectUrl: response.redirected ? response.url : undefined,
      responseTimeMs,
    }
  } catch (e) {
    return {
      isAlive: false,
      status: 0,
      responseTimeMs: Date.now() - start,
      error: (e as Error).name === 'AbortError' ? 'Timeout' : (e as Error).message,
    }
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function extractCoords(location: unknown): { lat: number; lng: number } | null {
  if (!location) return null
  // PostGIS geometry objects in Supabase come as GeoJSON
  const geo = location as { type?: string; coordinates?: number[] }
  if (geo.type === 'Point' && geo.coordinates?.length === 2) {
    return { lng: geo.coordinates[0], lat: geo.coordinates[1] }
  }
  return null
}

async function reverseGeocode(lat: number, lng: number): Promise<{
  display_name?: string
  continent?: string
  country?: string
  country_code?: string
  state?: string
  city?: string
  timezone?: string
  confidence?: number
}> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      { headers: { 'User-Agent': 'QueerGuide/1.0 (admin@queer.guide)' } }
    )

    if (!response.ok) return {}

    const data = await response.json()
    const addr = data.address || {}

    return {
      display_name: data.display_name,
      country: addr.country,
      country_code: addr.country_code?.toUpperCase(),
      state: addr.state || addr.region,
      city: addr.city || addr.town || addr.village || addr.municipality,
      confidence: 0.85,
    }
  } catch {
    return {}
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
