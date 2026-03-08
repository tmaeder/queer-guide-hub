/**
 * automation-geo-enricher — Links content to cities/countries, validates coordinates.
 *
 * Reuses country alias map + city matching from geo-link-content but writes
 * to content_changes instead of direct updates. Deterministic (no AI).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts'
import {
  loadModuleConfig, checkRateLimit, writeChanges, logRun,
  getContentName, CONTENT_TYPE_CONFIG,
  type ProposedChange, type AutomationRule,
} from '../_shared/automation-utils.ts'

const MODULE_SLUG = 'geo-enricher'

// ── Country alias map (subset — full map is in geo-link-content) ─────────────

const COUNTRY_ALIASES: Record<string, string> = {
  'us': 'United States', 'usa': 'United States', 'united states of america': 'United States',
  'gb': 'United Kingdom', 'uk': 'United Kingdom', 'great britain': 'United Kingdom',
  'england': 'United Kingdom', 'scotland': 'United Kingdom', 'wales': 'United Kingdom',
  'de': 'Germany', 'deutschland': 'Germany',
  'fr': 'France', 'es': 'Spain', 'españa': 'Spain',
  'it': 'Italy', 'italia': 'Italy',
  'nl': 'Netherlands', 'holland': 'Netherlands', 'the netherlands': 'Netherlands',
  'ch': 'Switzerland', 'schweiz': 'Switzerland', 'suisse': 'Switzerland',
  'at': 'Austria', 'österreich': 'Austria',
  'au': 'Australia', 'ca': 'Canada', 'br': 'Brazil', 'brasil': 'Brazil',
  'mx': 'Mexico', 'méxico': 'Mexico', 'jp': 'Japan',
  'za': 'South Africa', 'nz': 'New Zealand', 'il': 'Israel',
  'th': 'Thailand', 'pt': 'Portugal', 'be': 'Belgium',
  'se': 'Sweden', 'dk': 'Denmark', 'no': 'Norway', 'fi': 'Finland',
  'ie': 'Ireland', 'cz': 'Czech Republic', 'czechia': 'Czech Republic',
  'tw': 'Taiwan', 'ar': 'Argentina', 'co': 'Colombia',
  'in': 'India', 'cn': 'China', 'kr': 'South Korea', 'ru': 'Russia',
  'tr': 'Turkey', 'türkiye': 'Turkey', 'gr': 'Greece', 'pl': 'Poland',
  // Demonyms
  'american': 'United States', 'british': 'United Kingdom', 'english': 'United Kingdom',
  'german': 'Germany', 'french': 'France', 'spanish': 'Spain',
  'italian': 'Italy', 'dutch': 'Netherlands', 'swiss': 'Switzerland',
  'austrian': 'Austria', 'australian': 'Australia', 'canadian': 'Canada',
  'brazilian': 'Brazil', 'mexican': 'Mexico', 'japanese': 'Japan',
  'south african': 'South Africa', 'israeli': 'Israel', 'thai': 'Thailand',
  'portuguese': 'Portugal', 'belgian': 'Belgium', 'swedish': 'Sweden',
  'danish': 'Denmark', 'norwegian': 'Norway', 'finnish': 'Finland',
  'irish': 'Ireland', 'czech': 'Czech Republic', 'taiwanese': 'Taiwan',
  'argentinian': 'Argentina', 'colombian': 'Colombia', 'indian': 'India',
  'chinese': 'China', 'korean': 'South Korea', 'russian': 'Russia',
  'turkish': 'Turkey', 'greek': 'Greece', 'polish': 'Poland',
  'filipino': 'Philippines', 'nigerian': 'Nigeria', 'kenyan': 'Kenya',
  'egyptian': 'Egypt', 'moroccan': 'Morocco', 'lebanese': 'Lebanon',
  'jamaican': 'Jamaica', 'cuban': 'Cuba',
}

// ── Types ────────────────────────────────────────────────────────────────────

interface CountryRef { id: string; name: string; code: string }
interface CityRef { id: string; name: string; country_id: string }

// ── Reference data ──────────────────────────────────────────────────────────

let countryByName: Map<string, CountryRef>
let countryByCode: Map<string, CountryRef>
let countryById: Map<string, CountryRef>
let citiesByName: Map<string, CityRef[]>
let cityAliases: Map<string, string>

async function loadReferenceData(supabase: ReturnType<typeof createClient>) {
  const { data: countries } = await supabase
    .from('countries')
    .select('id, name, code')
    .order('name')

  countryByName = new Map()
  countryByCode = new Map()
  countryById = new Map()
  for (const c of countries || []) {
    countryByName.set(c.name.toLowerCase(), c as CountryRef)
    if (c.code) countryByCode.set(c.code.toLowerCase(), c as CountryRef)
    countryById.set(c.id, c as CountryRef)
  }

  const { data: cities } = await supabase
    .from('cities')
    .select('id, name, country_id')
    .order('population', { ascending: false, nullsFirst: false })

  citiesByName = new Map()
  for (const city of cities || []) {
    const key = city.name.toLowerCase()
    if (!citiesByName.has(key)) citiesByName.set(key, [])
    citiesByName.get(key)!.push(city as CityRef)
  }

  // Load city aliases
  cityAliases = new Map()
  const { data: aliases } = await supabase
    .from('city_aliases')
    .select('alias_name, city_id')

  for (const a of aliases || []) {
    // Resolve city name from cities list
    for (const [name, citiesArr] of citiesByName) {
      if (citiesArr.some(c => c.id === a.city_id)) {
        cityAliases.set(a.alias_name.toLowerCase(), name)
        break
      }
    }
  }
}

function resolveCountry(text: string | null | undefined): CountryRef | null {
  if (!text?.trim()) return null
  const normalized = text.trim().toLowerCase()

  // 1. Alias map
  const aliasName = COUNTRY_ALIASES[normalized]
  if (aliasName) {
    const match = countryByName.get(aliasName.toLowerCase())
    if (match) return match
  }

  // 2. Exact name match
  const nameMatch = countryByName.get(normalized)
  if (nameMatch) return nameMatch

  // 3. Code match
  const codeMatch = countryByCode.get(normalized)
  if (codeMatch) return codeMatch

  return null
}

function resolveCity(text: string | null | undefined, countryId?: string | null): CityRef | null {
  if (!text?.trim()) return null
  let normalized = text.trim().toLowerCase()

  // Check city aliases first
  const aliasTarget = cityAliases.get(normalized)
  if (aliasTarget) normalized = aliasTarget

  const candidates = citiesByName.get(normalized)
  if (!candidates?.length) return null

  // Prefer city in the same country
  if (countryId) {
    const inCountry = candidates.find(c => c.country_id === countryId)
    if (inCountry) return inCountry
  }

  return candidates[0] // Highest population
}

// ── Geo-matching field config per content type ──────────────────────────────

const GEO_FIELDS: Record<string, {
  countryTextField?: string
  cityTextField?: string
  countryIdField: string
  cityIdField: string
  stateField?: string
  postalCodeField?: string
  villageIdField?: string
}> = {
  venues: { countryTextField: 'country', cityTextField: 'city', countryIdField: 'country_id', cityIdField: 'city_id', stateField: 'state', postalCodeField: 'postal_code', villageIdField: 'queer_village_id' },
  events: { countryTextField: 'country', cityTextField: 'city', countryIdField: 'country_id', cityIdField: 'city_id', villageIdField: 'queer_village_id' },
  hotels: { countryTextField: 'country', cityTextField: 'city', countryIdField: 'country_id', cityIdField: 'city_id', villageIdField: 'queer_village_id' },
  personalities: { countryTextField: 'nationality', cityTextField: undefined, countryIdField: 'country_id', cityIdField: 'city_id' },
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

async function processItem(
  item: Record<string, unknown>,
  contentType: string,
  contentName: string,
  rules: AutomationRule[],
  supabase: ReturnType<typeof createClient>,
  reverseGeocodeCounter: { count: number; limit: number },
  rpcCounter: { count: number; limit: number },
): Promise<ProposedChange[]> {
  const changes: ProposedChange[] = []
  const contentId = String(item.id)
  const geoConfig = GEO_FIELDS[contentType]
  if (!geoConfig) return changes

  for (const rule of rules) {
    if (rule.content_type !== contentType) continue
    const cfg = rule.rule_config as { source?: string }

    // ── geo_match: link country/city text → IDs ──────────────────────────
    if (rule.rule_type === 'geo_match') {
      if (cfg.source === 'country' && geoConfig.countryTextField) {
        const existingCountryId = item[geoConfig.countryIdField]
        if (existingCountryId) continue

        const countryText = item[geoConfig.countryTextField] as string | null
        const resolved = resolveCountry(countryText)

        if (resolved) {
          changes.push({
            content_type: contentType,
            content_id: contentId,
            content_name: contentName,
            field_name: geoConfig.countryIdField,
            old_value: null,
            new_value: resolved.id,
            change_type: 'enrich',
            confidence: 0.92,
            reasoning: `Matched country "${countryText}" → "${resolved.name}" (id: ${resolved.id})`,
            rule_id: rule.id,
          })
        } else if (countryText?.trim()) {
          changes.push({
            content_type: contentType,
            content_id: contentId,
            content_name: contentName,
            field_name: geoConfig.countryIdField,
            old_value: null,
            new_value: null,
            change_type: 'flag',
            confidence: 0.70,
            reasoning: `Could not resolve country text: "${countryText}"`,
            rule_id: rule.id,
          })
        }
      }

      if (cfg.source === 'city' && geoConfig.cityTextField) {
        const existingCityId = item[geoConfig.cityIdField]
        if (existingCityId) continue

        const cityText = item[geoConfig.cityTextField] as string | null
        const countryId = (item[geoConfig.countryIdField] as string | null) ?? null
        const resolved = resolveCity(cityText, countryId)

        if (resolved) {
          changes.push({
            content_type: contentType,
            content_id: contentId,
            content_name: contentName,
            field_name: geoConfig.cityIdField,
            old_value: null,
            new_value: resolved.id,
            change_type: 'enrich',
            confidence: countryId ? 0.95 : 0.85,
            reasoning: `Matched city "${cityText}" → "${resolved.name}" (id: ${resolved.id})${countryId ? ' (country-scoped)' : ''}`,
            rule_id: rule.id,
          })
        }
      }

      if (cfg.source === 'nationality' && contentType === 'personalities') {
        const existingCountryId = item.country_id
        if (existingCountryId) continue

        const nationality = item.nationality as string | null
        const resolved = resolveCountry(nationality)

        if (resolved) {
          changes.push({
            content_type: contentType,
            content_id: contentId,
            content_name: contentName,
            field_name: 'country_id',
            old_value: null,
            new_value: resolved.id,
            change_type: 'enrich',
            confidence: 0.88,
            reasoning: `Matched nationality "${nationality}" → "${resolved.name}" (id: ${resolved.id})`,
            rule_id: rule.id,
          })
        }
      }
    }

    // ── geo_text_validate: country text must be full name (not code) ─────
    if (rule.rule_type === 'geo_text_validate' && geoConfig.countryTextField) {
      const existingCountryId = item[geoConfig.countryIdField] as string | null
      const countryText = item[geoConfig.countryTextField] as string | null

      if (existingCountryId && countryText?.trim()) {
        const linkedCountry = countryById.get(existingCountryId)
        if (linkedCountry) {
          const normalizedText = countryText.trim().toLowerCase()
          const nameMatch = normalizedText === linkedCountry.name.toLowerCase()

          // Always correct to full name — codes like "US", "DE" should become "United States", "Germany"
          if (!nameMatch) {
            changes.push({
              content_type: contentType,
              content_id: contentId,
              content_name: contentName,
              field_name: geoConfig.countryTextField,
              old_value: countryText,
              new_value: linkedCountry.name,
              change_type: 'correct',
              confidence: 0.92,
              reasoning: `Country text "${countryText}" → "${linkedCountry.name}" (correcting to full name)`,
              rule_id: rule.id,
            })
          }
        }
      }
    }

    // ── geo_reverse_fill: reverse geocode lat/lng → city, country, state, postal_code
    if (rule.rule_type === 'geo_reverse_fill') {
      const lat = item.latitude as number | null
      const lng = item.longitude as number | null
      if (!lat || !lng) continue

      const needsCity = geoConfig.cityTextField && !item[geoConfig.cityTextField]
      const needsCountry = geoConfig.countryTextField && !item[geoConfig.countryTextField]
      const needsState = geoConfig.stateField && !item[geoConfig.stateField]
      const needsPostal = geoConfig.postalCodeField && !item[geoConfig.postalCodeField]
      if (!needsCity && !needsCountry && !needsState && !needsPostal) continue

      if (reverseGeocodeCounter.count >= reverseGeocodeCounter.limit) continue
      reverseGeocodeCounter.count++
      if (reverseGeocodeCounter.count > 1) await delay(200)

      try {
        const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1`)
        if (res.ok) {
          const data = await res.json()
          const props = data.features?.[0]?.properties
          if (props) {
            if (needsCity && (props.city || props.name)) {
              changes.push({
                content_type: contentType,
                content_id: contentId,
                content_name: contentName,
                field_name: geoConfig.cityTextField!,
                old_value: null,
                new_value: props.city || props.name,
                change_type: 'enrich',
                confidence: 0.85,
                reasoning: `Reverse geocoded (${lat}, ${lng}) → city: "${props.city || props.name}"`,
                rule_id: rule.id,
              })
            }
            if (needsCountry && props.country) {
              changes.push({
                content_type: contentType,
                content_id: contentId,
                content_name: contentName,
                field_name: geoConfig.countryTextField!,
                old_value: null,
                new_value: props.country,
                change_type: 'enrich',
                confidence: 0.85,
                reasoning: `Reverse geocoded (${lat}, ${lng}) → country: "${props.country}"`,
                rule_id: rule.id,
              })
            }
            if (needsState && props.state) {
              changes.push({
                content_type: contentType,
                content_id: contentId,
                content_name: contentName,
                field_name: geoConfig.stateField!,
                old_value: null,
                new_value: props.state,
                change_type: 'enrich',
                confidence: 0.88,
                reasoning: `Reverse geocoded (${lat}, ${lng}) → state: "${props.state}"`,
                rule_id: rule.id,
              })
            }
            if (needsPostal && props.postcode) {
              changes.push({
                content_type: contentType,
                content_id: contentId,
                content_name: contentName,
                field_name: geoConfig.postalCodeField!,
                old_value: null,
                new_value: props.postcode,
                change_type: 'enrich',
                confidence: 0.88,
                reasoning: `Reverse geocoded (${lat}, ${lng}) → postal_code: "${props.postcode}"`,
                rule_id: rule.id,
              })
            }
          }
        }
      } catch (e) {
        console.warn(`[${MODULE_SLUG}] Reverse geocode failed for ${contentId}: ${e}`)
      }
    }

    // ── geo_village_assign: assign queer village from coordinates ────────
    if (rule.rule_type === 'geo_village_assign') {
      const villageField = geoConfig.villageIdField
      if (!villageField || item[villageField]) continue

      const lat = item.latitude as number | null
      const lng = item.longitude as number | null
      if (!lat || !lng) continue

      if (rpcCounter.count >= rpcCounter.limit) continue
      rpcCounter.count++

      try {
        const { data: villages } = await supabase.rpc('find_queer_village', {
          p_lat: lat,
          p_lng: lng,
          p_city_id: (item[geoConfig.cityIdField] as string | null) ?? null,
        })
        if (villages?.[0]?.village_id) {
          changes.push({
            content_type: contentType,
            content_id: contentId,
            content_name: contentName,
            field_name: villageField,
            old_value: null,
            new_value: villages[0].village_id,
            change_type: 'enrich',
            confidence: 0.90,
            reasoning: `Assigned queer village "${villages[0].village_name}" (${villages[0].match_type}) at (${lat}, ${lng})`,
            rule_id: rule.id,
          })
        }
      } catch (e) {
        console.warn(`[${MODULE_SLUG}] Village assign failed for ${contentId}: ${e}`)
      }
    }
  }

  return changes
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const startTime = Date.now()
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    let payload: Record<string, unknown> = {}
    if (req.method === 'POST') {
      payload = await req.json().catch(() => ({}))
    }
    // Allow overriding limits per run (defaults for cron, higher for backfill)
    const reverseGeocodeLimit = Math.min(Number(payload.reverse_geocode_limit) || 50, 500)
    const rpcLimit = Math.min(Number(payload.rpc_limit) || 200, 2000)

    const config = await loadModuleConfig(supabase, MODULE_SLUG)
    if (!config) return errorResponse('Module disabled or not found', 404)

    const withinLimit = await checkRateLimit(supabase, config.module.id, config.module.rate_limit_per_hour)
    if (!withinLimit) return jsonResponse({ success: false, error: 'Rate limit exceeded' }, 429)

    // Load reference data once
    await loadReferenceData(supabase)

    const batchId = crypto.randomUUID()
    const workflowRunId = payload.workflow_run_id as string | null ?? null
    const dryRun = payload.dry_run === true
    const allChanges: ProposedChange[] = []
    let totalScanned = 0
    let totalErrors = 0

    for (const contentType of config.module.content_types) {
      const ctConfig = CONTENT_TYPE_CONFIG[contentType]
      if (!ctConfig || !GEO_FIELDS[contentType]) continue

      const rulesForType = config.rules.filter(r => r.content_type === contentType)
      if (rulesForType.length === 0) continue

      // Only fetch items missing geo IDs
      let query = supabase
        .from(ctConfig.table)
        .select(ctConfig.selectFields)
        .limit(config.module.batch_size)

      // Fetch items missing any geo data (IDs, text fields, state, postal_code, village)
      const geoConfig = GEO_FIELDS[contentType]
      const filterParts = [
        `${geoConfig.countryIdField}.is.null`,
        `${geoConfig.cityIdField}.is.null`,
      ]
      if (geoConfig.cityTextField) filterParts.push(`${geoConfig.cityTextField}.is.null`)
      if (geoConfig.countryTextField) filterParts.push(`${geoConfig.countryTextField}.is.null`)
      if (geoConfig.stateField) filterParts.push(`${geoConfig.stateField}.is.null`)
      if (geoConfig.postalCodeField) filterParts.push(`${geoConfig.postalCodeField}.is.null`)
      if (geoConfig.villageIdField) filterParts.push(`${geoConfig.villageIdField}.is.null`)
      query = query.or(filterParts.join(','))

      const { data: items, error: fetchErr } = await query

      if (fetchErr) {
        console.error(`[${MODULE_SLUG}] Error fetching ${contentType}: ${fetchErr.message}`)
        totalErrors++
        continue
      }

      const reverseGeocodeCounter = { count: 0, limit: reverseGeocodeLimit }
      const rpcCounter = { count: 0, limit: rpcLimit }

      for (const item of items || []) {
        totalScanned++
        try {
          const name = getContentName(item as Record<string, unknown>, ctConfig)
          const itemChanges = await processItem(item as Record<string, unknown>, contentType, name, rulesForType, supabase, reverseGeocodeCounter, rpcCounter)
          allChanges.push(...itemChanges)
        } catch (e) {
          console.error(`[${MODULE_SLUG}] Error processing ${contentType}/${item.id}: ${e}`)
          totalErrors++
        }
      }
    }

    let autoApproved = 0
    let pendingReview = 0

    if (!dryRun && allChanges.length > 0) {
      const result = await writeChanges(supabase, config.module, workflowRunId, batchId, allChanges)
      autoApproved = result.autoApproved
      pendingReview = result.pendingReview
    }

    const durationMs = Date.now() - startTime

    if (!dryRun) {
      await logRun(supabase, config.module.id, workflowRunId, {
        items_scanned: totalScanned,
        changes_proposed: allChanges.length,
        changes_auto_approved: autoApproved,
        changes_pending_review: pendingReview,
        errors: totalErrors,
        duration_ms: durationMs,
      })
    }

    console.log(`[${MODULE_SLUG}] Done: scanned=${totalScanned} changes=${allChanges.length} auto=${autoApproved} pending=${pendingReview} ${durationMs}ms`)
    return jsonResponse({
      success: true,
      items_total: totalScanned,
      items_processed: totalScanned - totalErrors,
      items_succeeded: totalScanned - totalErrors,
      items_failed: totalErrors,
      changes_proposed: allChanges.length,
      changes_auto_approved: autoApproved,
      changes_pending_review: pendingReview,
      duration_ms: durationMs,
      batch_id: batchId,
      ...(dryRun ? { dry_run: true } : {}),
    })
  } catch (e) {
    console.error(`[${MODULE_SLUG}] Fatal: ${e}`)
    return errorResponse(e instanceof Error ? e.message : 'Internal error', 500)
  }
})
