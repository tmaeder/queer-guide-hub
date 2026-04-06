import {
  corsResponse,
  errorResponse,
  getServiceClient,
  jsonResponse,
  requireAdmin,
} from '../_shared/supabase-client.ts'
import {
  extractAllPlaintext,
  extractPlaintext,
  parseArray,
  parseAreaKm2,
  parseElevationM,
  parseNumber,
  queryWolfram,
  type WolframResult,
} from '../_shared/wolfram-client.ts'

// ---------------------------------------------------------------------------
// Scientific tag category slugs (whitelist)
// ---------------------------------------------------------------------------

const SCIENTIFIC_CATEGORY_SLUGS = [
  'health-wellness',
  'mental-health',
  'physical-wellness',
  'reproductive-health',
  'sexual-health',
  'intersex',
  'substances-harm-reduction',
]

// Category slugs where WA is NOT useful (identity / culture)
const SKIP_CATEGORY_SLUGS = [
  'gender-identity',
  'sexual-orientation',
  'expression-presentation',
  'culture-slang',
  'slang-terminology',
  'community-events',
  'kink-fetish',
  'bdsm',
  'fetish-practices',
  'leather-gear',
  'rights-activism',
  'political-activism',
  'history-heritage',
  'historical-movements',
  'art-literature',
  'media-entertainment',
  'relationships',
  'roles-dynamics',
  'relationship-roles',
  'sexual-roles',
  'power-exchange',
  'safety-practices',
  'venue-travel',
  'news-topics',
  'miscellaneous',
  'support-resources',
  'workplace-education',
  'legal-rights',
  'body-modification',
]

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  const appId = Deno.env.get('WOLFRAM_APP_ID')
  if (!appId) return errorResponse('WOLFRAM_APP_ID not configured', 500, req)

  try {
    const body = req.method === 'GET' ? {} : await req.json()
    const contentType: string = body.content_type ?? 'country'
    const limit: number = Math.min(body.limit ?? 50, 200)
    const ids: string[] | undefined = body.ids
    const dryRun: boolean = body.dry_run === true

    let result: EnrichResult
    switch (contentType) {
      case 'country':
        result = await enrichCountries(supabase, appId, limit, ids, dryRun)
        break
      case 'city':
        result = await enrichCities(supabase, appId, limit, ids, dryRun)
        break
      case 'tag':
        result = await enrichTags(supabase, appId, limit, ids, dryRun)
        break
      default:
        return errorResponse(`Unknown content_type: ${contentType}`, 400, req)
    }

    return jsonResponse({ success: true, content_type: contentType, dry_run: dryRun, ...result }, 200, req)
  } catch (err) {
    console.error('enrich-wolfram error:', err)
    return errorResponse(String(err), 500, req)
  }
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnrichResult {
  items_total: number
  items_processed: number
  items_succeeded: number
  items_failed: number
  items_skipped: number
  needs_review: number
}

function emptyResult(): EnrichResult {
  return { items_total: 0, items_processed: 0, items_succeeded: 0, items_failed: 0, items_skipped: 0, needs_review: 0 }
}

// ---------------------------------------------------------------------------
// Countries
// ---------------------------------------------------------------------------

async function enrichCountries(
  supabase: any, appId: string, limit: number, ids?: string[], dryRun?: boolean,
): Promise<EnrichResult> {
  const res = emptyResult()

  let query = supabase
    .from('countries')
    .select('id, name, code, population, area_km2, gdp_usd, gdp_per_capita_usd, life_expectancy, literacy_rate, human_development_index, government_type, natural_resources, unesco_sites')
    .is('wolfram_enriched_at', null)
    .order('population', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (ids?.length) {
    query = supabase
      .from('countries')
      .select('id, name, code, population, area_km2, gdp_usd, gdp_per_capita_usd, life_expectancy, literacy_rate, human_development_index, government_type, natural_resources, unesco_sites')
      .in('id', ids)
      .limit(limit)
  }

  const { data: countries, error } = await query
  if (error) throw error
  if (!countries?.length) return res

  res.items_total = countries.length

  for (const country of countries) {
    try {
      const updates: Record<string, any> = {}
      let anyUpdate = false

      // Query 1: economic / demographic data (only if any field is null)
      const needsEcon = !country.gdp_usd || !country.gdp_per_capita_usd ||
        !country.life_expectancy || !country.literacy_rate || !country.human_development_index
      if (needsEcon) {
        const wa = await queryWolfram(`${country.name} GDP per capita life expectancy literacy rate HDI`, appId)
        if (wa.success) {
          const all = extractAllPlaintext(wa.pods)
          if (!country.gdp_usd) {
            const v = findInPods(all, ['gdp', 'gross domestic product'])
            if (v) { const n = parseNumber(v); if (n) { updates.gdp_usd = n; anyUpdate = true } }
          }
          if (!country.gdp_per_capita_usd) {
            const v = findInPods(all, ['gdp per capita', 'per capita'])
            if (v) { const n = parseNumber(v); if (n) { updates.gdp_per_capita_usd = n; anyUpdate = true } }
          }
          if (!country.life_expectancy) {
            const v = findInPods(all, ['life expectancy'])
            if (v) { const n = parseNumber(v); if (n) { updates.life_expectancy = n; anyUpdate = true } }
          }
          if (!country.literacy_rate) {
            const v = findInPods(all, ['literacy'])
            if (v) { const n = parseNumber(v); if (n) { updates.literacy_rate = n; anyUpdate = true } }
          }
          if (!country.human_development_index) {
            const v = findInPods(all, ['human development', 'hdi'])
            if (v) { const n = parseNumber(v); if (n) { updates.human_development_index = n; anyUpdate = true } }
          }
        }
      }

      // Query 2: cultural / geographic data (only if any field is null)
      const needsCulture = !country.government_type ||
        !country.natural_resources?.length || !country.unesco_sites?.length
      if (needsCulture) {
        const wa = await queryWolfram(`${country.name} government type natural resources UNESCO world heritage sites`, appId)
        if (wa.success) {
          const all = extractAllPlaintext(wa.pods)
          if (!country.government_type) {
            const v = findInPods(all, ['government', 'form of government'])
            if (v) { updates.government_type = v.split('\n')[0].trim(); anyUpdate = true }
          }
          if (!country.natural_resources?.length) {
            const v = findInPods(all, ['natural resources', 'resources'])
            if (v) { const arr = parseArray(v); if (arr.length) { updates.natural_resources = arr; anyUpdate = true } }
          }
          if (!country.unesco_sites?.length) {
            const v = findInPods(all, ['unesco', 'world heritage', 'heritage site'])
            if (v) { const arr = parseArray(v); if (arr.length) { updates.unesco_sites = arr; anyUpdate = true } }
          }
        }
      }

      if (!needsEcon && !needsCulture) {
        res.items_skipped++
        res.items_processed++
        // Still mark as enriched so we don't re-query
        if (!dryRun) {
          await supabase.from('countries').update({ wolfram_enriched_at: new Date().toISOString() }).eq('id', country.id)
        }
        continue
      }

      if (anyUpdate) {
        updates.wolfram_enriched_at = new Date().toISOString()
        if (!dryRun) {
          const { error: upErr } = await supabase.from('countries').update(updates).eq('id', country.id)
          if (upErr) throw upErr
        }
        console.log(`[country] ${country.name}: updated ${Object.keys(updates).filter(k => k !== 'wolfram_enriched_at').join(', ')}`)
        res.items_succeeded++
      } else {
        // WA returned nothing useful
        if (!dryRun) {
          await supabase.from('countries').update({ wolfram_enriched_at: new Date().toISOString() }).eq('id', country.id)
        }
        console.log(`[country] ${country.name}: needs_review (no useful WA data)`)
        res.needs_review++
      }
      res.items_processed++
    } catch (err) {
      console.error(`[country] ${country.name} failed:`, err)
      res.items_failed++
      res.items_processed++
    }
  }

  return res
}

// ---------------------------------------------------------------------------
// Cities
// ---------------------------------------------------------------------------

async function enrichCities(
  supabase: any, appId: string, limit: number, ids?: string[], dryRun?: boolean,
): Promise<EnrichResult> {
  const res = emptyResult()

  let query = supabase
    .from('cities')
    .select('id, name, population, area_km2, elevation_m, climate_type, country:countries!inner(name)')
    .is('wolfram_enriched_at', null)
    .order('population', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (ids?.length) {
    query = supabase
      .from('cities')
      .select('id, name, population, area_km2, elevation_m, climate_type, country:countries!inner(name)')
      .in('id', ids)
      .limit(limit)
  }

  const { data: cities, error } = await query
  if (error) throw error
  if (!cities?.length) return res

  res.items_total = cities.length

  for (const city of cities) {
    try {
      const countryName = city.country?.name ?? ''
      const needsAny = !city.population || !city.area_km2 || !city.elevation_m || !city.climate_type

      if (!needsAny) {
        res.items_skipped++
        res.items_processed++
        if (!dryRun) {
          await supabase.from('cities').update({ wolfram_enriched_at: new Date().toISOString() }).eq('id', city.id)
        }
        continue
      }

      const wa = await queryWolfram(`${city.name} ${countryName} population area elevation climate`, appId)
      const updates: Record<string, any> = {}
      let anyUpdate = false

      if (wa.success) {
        const all = extractAllPlaintext(wa.pods)

        if (!city.population) {
          const v = findInPods(all, ['population', 'city population'])
          if (v) { const n = parseNumber(v); if (n && n > 100) { updates.population = n; anyUpdate = true } }
        }
        if (!city.area_km2) {
          const v = findInPods(all, ['area', 'total area', 'city area'])
          if (v) { const n = parseAreaKm2(v); if (n) { updates.area_km2 = Math.round(n * 100) / 100; anyUpdate = true } }
        }
        if (!city.elevation_m) {
          const v = findInPods(all, ['elevation', 'altitude'])
          if (v) { const n = parseElevationM(v); if (n !== null) { updates.elevation_m = n; anyUpdate = true } }
        }
        if (!city.climate_type) {
          const v = findInPods(all, ['climate', 'climate type', 'climate classification', 'koppen'])
          if (v) { updates.climate_type = v.split('\n')[0].trim().substring(0, 100); anyUpdate = true }
        }
      }

      updates.wolfram_enriched_at = new Date().toISOString()
      if (anyUpdate) {
        if (!dryRun) {
          const { error: upErr } = await supabase.from('cities').update(updates).eq('id', city.id)
          if (upErr) throw upErr
        }
        console.log(`[city] ${city.name}: updated ${Object.keys(updates).filter(k => k !== 'wolfram_enriched_at').join(', ')}`)
        res.items_succeeded++
      } else {
        if (!dryRun) {
          await supabase.from('cities').update(updates).eq('id', city.id)
        }
        console.log(`[city] ${city.name}: needs_review`)
        res.needs_review++
      }
      res.items_processed++
    } catch (err) {
      console.error(`[city] ${city.name} failed:`, err)
      res.items_failed++
      res.items_processed++
    }
  }

  return res
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

async function enrichTags(
  supabase: any, appId: string, limit: number, ids?: string[], dryRun?: boolean,
): Promise<EnrichResult> {
  const res = emptyResult()

  // Resolve scientific category IDs
  const { data: sciCats } = await supabase
    .from('tag_categories')
    .select('id')
    .in('slug', SCIENTIFIC_CATEGORY_SLUGS)
  const sciCatIds = (sciCats ?? []).map((c: any) => c.id)

  // Resolve skip category IDs
  const { data: skipCats } = await supabase
    .from('tag_categories')
    .select('id')
    .in('slug', SKIP_CATEGORY_SLUGS)
  const skipCatIds = new Set((skipCats ?? []).map((c: any) => c.id))

  if (!sciCatIds.length) {
    console.warn('No scientific categories found')
    return res
  }

  // Find tags assigned to scientific categories, not yet enriched
  const { data: assignments } = await supabase
    .from('tag_category_assignments')
    .select('tag_id')
    .in('category_id', sciCatIds)

  if (!assignments?.length) return res

  const candidateTagIds = [...new Set(assignments.map((a: any) => a.tag_id))]

  // Also find tags in skip categories to exclude
  const { data: skipAssignments } = await supabase
    .from('tag_category_assignments')
    .select('tag_id')
    .in('category_id', [...skipCatIds])

  const skipTagIds = new Set((skipAssignments ?? []).map((a: any) => a.tag_id))
  const eligibleTagIds = candidateTagIds.filter((id: string) => !skipTagIds.has(id))

  if (!eligibleTagIds.length) return res

  // Fetch the actual tags
  let tagQuery = supabase
    .from('unified_tags')
    .select('id, name, description')
    .is('wolfram_enriched_at', null)
    .in('id', eligibleTagIds)
    .limit(limit)

  if (ids?.length) {
    tagQuery = supabase
      .from('unified_tags')
      .select('id, name, description')
      .in('id', ids)
      .limit(limit)
  }

  const { data: tags, error } = await tagQuery
  if (error) throw error
  if (!tags?.length) return res

  res.items_total = tags.length

  for (const tag of tags) {
    try {
      const wa = await queryWolfram(`${tag.name} definition medical biology`, appId)

      const scientificData: Record<string, any> = {
        fetched_at: new Date().toISOString(),
        source_query: `${tag.name} definition medical biology`,
      }

      if (wa.success && wa.source !== 'none') {
        if (wa.source === 'full' && wa.pods.length > 0) {
          const all = extractAllPlaintext(wa.pods)
          // Look for definition/result pods
          const def = findInPods(all, ['definition', 'result', 'basic information', 'basic properties'])
          const facts: string[] = []

          for (const [title, text] of Object.entries(all)) {
            const lower = title.toLowerCase()
            if (lower.includes('input') || lower === 'definition') continue
            if (text.length > 10 && text.length < 500) facts.push(text)
          }

          scientificData.definition = def ?? null
          scientificData.facts = facts.slice(0, 5)
          scientificData.pods_used = Object.keys(all)
          scientificData.source = 'full'

          if (!def && facts.length === 0) {
            scientificData.needs_review = true
            scientificData.reason = 'no_relevant_content'
          }
        } else if (wa.source === 'short' && wa.plaintext) {
          scientificData.definition = wa.plaintext
          scientificData.facts = []
          scientificData.source = 'short'
        }
      } else {
        scientificData.needs_review = true
        scientificData.reason = 'no_wa_response'
        scientificData.source = 'none'
      }

      const updates: Record<string, any> = {
        scientific_data: scientificData,
        wolfram_enriched_at: new Date().toISOString(),
      }

      if (!dryRun) {
        const { error: upErr } = await supabase.from('unified_tags').update(updates).eq('id', tag.id)
        if (upErr) throw upErr
      }

      if (scientificData.needs_review) {
        console.log(`[tag] ${tag.name}: needs_review (${scientificData.reason})`)
        res.needs_review++
      } else {
        console.log(`[tag] ${tag.name}: enriched (${scientificData.source})`)
        res.items_succeeded++
      }
      res.items_processed++
    } catch (err) {
      console.error(`[tag] ${tag.name} failed:`, err)
      res.items_failed++
      res.items_processed++
    }
  }

  return res
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Search pod text map for keys containing any of the given terms. */
function findInPods(allPods: Record<string, string>, terms: string[]): string | null {
  for (const term of terms) {
    const lower = term.toLowerCase()
    for (const [title, text] of Object.entries(allPods)) {
      if (title.toLowerCase().includes(lower)) return text
    }
  }
  // Also search in values for lines containing the terms
  for (const term of terms) {
    const lower = term.toLowerCase()
    for (const text of Object.values(allPods)) {
      const lines = text.split('\n')
      for (const line of lines) {
        if (line.toLowerCase().includes(lower)) return line.trim()
      }
    }
  }
  return null
}
