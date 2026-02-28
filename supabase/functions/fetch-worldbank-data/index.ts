import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { requireAdmin, getCorsHeaders, jsonResponse } from '../_shared/supabase-client.ts'

const WB_BASE = 'https://api.worldbank.org/v2'

// Indicators that map to existing DB columns
const DIRECT_INDICATORS: Record<string, string> = {
  'NY.GDP.MKTP.CD': 'gdp_usd',
  'NY.GDP.PCAP.CD': 'gdp_per_capita_usd',
  'SP.POP.TOTL': 'population',
  'SP.DYN.LE00.IN': 'life_expectancy',
  'SE.ADT.LITR.ZS': 'literacy_rate',
}

// Indicators stored in wb_indicators JSONB
const JSONB_INDICATORS: Record<string, string> = {
  'SP.POP.GROW': 'population_growth',
  'SL.UEM.TOTL.ZS': 'unemployment_rate',
  'FP.CPI.TOTL.ZG': 'inflation_rate',
  'IT.NET.USER.ZS': 'internet_users_pct',
  'EG.ELC.ACCS.ZS': 'electricity_access_pct',
  'SP.URB.TOTL.IN.ZS': 'urban_population_pct',
  'SH.XPD.CHEX.PC.CD': 'health_expenditure_pc',
  'SE.XPD.TOTL.GD.ZS': 'education_expenditure_pct',
  'EN.ATM.CO2E.PC': 'co2_emissions_pc',
  'NE.TRD.GNFS.ZS': 'trade_pct_gdp',
  'SI.POV.GINI': 'gini_index',
  'NY.GNP.PCAP.CD': 'gni_per_capita',
  'SH.DYN.MORT': 'child_mortality_rate',
}

const ALL_INDICATOR_CODES = [...Object.keys(DIRECT_INDICATORS), ...Object.keys(JSONB_INDICATORS)]

// Fetch country metadata from World Bank
async function fetchCountryMeta(iso2: string): Promise<Record<string, any> | null> {
  try {
    const resp = await fetch(`${WB_BASE}/country/${iso2}?format=json`)
    if (!resp.ok) return null
    const data = await resp.json()
    // WB API returns [metadata, [country_data]]
    if (!Array.isArray(data) || data.length < 2 || !data[1]?.length) return null
    const c = data[1][0]
    return {
      wb_income_level: c.incomeLevel?.value || null,
      wb_lending_type: c.lendingType?.value || null,
      wb_region: c.region?.value || null,
    }
  } catch (e) {
    console.warn(`Failed to fetch WB metadata for ${iso2}:`, e)
    return null
  }
}

// Fetch indicators in batches using semicolon-separated codes
async function fetchIndicators(iso2: string): Promise<Record<string, number | null>> {
  const results: Record<string, number | null> = {}

  // Batch indicators in groups of 5
  const batchSize = 5
  for (let i = 0; i < ALL_INDICATOR_CODES.length; i += batchSize) {
    const batch = ALL_INDICATOR_CODES.slice(i, i + batchSize)
    const indicatorStr = batch.join(';')

    try {
      // mrv=1 = most recent value, per_page=50 covers all indicators in batch
      const url = `${WB_BASE}/country/${iso2}/indicator/${indicatorStr}?format=json&mrv=1&per_page=50`
      const resp = await fetch(url)
      if (!resp.ok) {
        console.warn(`WB API ${resp.status} for ${iso2} indicators: ${indicatorStr}`)
        continue
      }

      const data = await resp.json()
      if (!Array.isArray(data) || data.length < 2 || !data[1]) continue

      for (const entry of data[1]) {
        if (entry?.indicator?.id && entry?.value != null) {
          results[entry.indicator.id] = Number(entry.value)
        }
      }
    } catch (e) {
      console.warn(`Failed to fetch indicators batch for ${iso2}:`, e)
    }

    // Rate limit between batches
    await new Promise(r => setTimeout(r, 200))
  }

  return results
}

// Build the DB update object from fetched data
function buildUpdateObject(meta: Record<string, any> | null, indicators: Record<string, number | null>) {
  const update: Record<string, any> = {
    wb_last_synced_at: new Date().toISOString(),
  }

  // Country metadata
  if (meta) {
    if (meta.wb_income_level) update.wb_income_level = meta.wb_income_level
    if (meta.wb_lending_type) update.wb_lending_type = meta.wb_lending_type
    if (meta.wb_region) update.wb_region = meta.wb_region
  }

  // Direct column mappings
  for (const [code, column] of Object.entries(DIRECT_INDICATORS)) {
    const val = indicators[code]
    if (val != null) {
      // Special handling for different column types
      if (column === 'population' || column === 'gdp_usd') {
        update[column] = Math.round(val)
      } else if (column === 'gdp_per_capita_usd') {
        update[column] = Math.round(val)
      } else {
        update[column] = Number(val.toFixed(2))
      }
    }
  }

  // JSONB indicators
  const wbIndicators: Record<string, number> = {}
  for (const [code, key] of Object.entries(JSONB_INDICATORS)) {
    const val = indicators[code]
    if (val != null) {
      wbIndicators[key] = Number(val.toFixed(2))
    }
  }
  if (Object.keys(wbIndicators).length > 0) {
    update.wb_indicators = wbIndicators
  }

  return update
}

// Sync a single country
async function syncCountry(supabase: any, iso2: string): Promise<{ success: boolean; country?: string; error?: string }> {
  const code = iso2.toUpperCase()

  // Find country in DB
  const { data: country, error } = await supabase
    .from('countries')
    .select('id, name, code')
    .eq('code', code)
    .maybeSingle()

  if (error || !country) {
    return { success: false, error: `Country ${code} not found in database` }
  }

  console.log(`Syncing World Bank data for ${country.name} (${code})...`)

  // Fetch metadata and indicators in parallel
  const [meta, indicators] = await Promise.all([
    fetchCountryMeta(code),
    fetchIndicators(code),
  ])

  const indicatorCount = Object.keys(indicators).filter(k => indicators[k] != null).length
  if (indicatorCount === 0 && !meta) {
    return { success: false, error: `No World Bank data found for ${code}` }
  }

  const updateObj = buildUpdateObject(meta, indicators)

  const { error: updateError } = await supabase
    .from('countries')
    .update(updateObj)
    .eq('id', country.id)

  if (updateError) {
    return { success: false, error: `DB update failed: ${updateError.message}` }
  }

  console.log(`Synced ${indicatorCount} indicators for ${country.name}`)
  return { success: true, country: country.name }
}

// Sync all countries
async function syncAllCountries(supabase: any): Promise<{ synced: number; failed: number; errors: string[] }> {
  const { data: countries, error } = await supabase
    .from('countries')
    .select('id, name, code')
    .order('name')

  if (error || !countries?.length) {
    return { synced: 0, failed: 0, errors: ['Failed to load countries from DB'] }
  }

  let synced = 0
  let failed = 0
  const errors: string[] = []

  for (const country of countries) {
    if (!country.code || country.code.length !== 2) {
      console.log(`Skipping ${country.name}: invalid ISO2 code "${country.code}"`)
      continue
    }

    const result = await syncCountry(supabase, country.code)
    if (result.success) {
      synced++
    } else {
      failed++
      errors.push(`${country.name}: ${result.error}`)
    }

    // Rate limit between countries (500ms to be respectful)
    await new Promise(r => setTimeout(r, 500))
  }

  return { synced, failed, errors }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Require admin
    const authResult = await requireAdmin(req, supabase)
    if (authResult instanceof Response) return authResult

    const body = await req.json()
    const { action, country_code } = body

    if (action === 'sync_one') {
      if (!country_code) {
        return jsonResponse({ error: 'country_code is required for sync_one' }, 400, req)
      }
      const result = await syncCountry(supabase, country_code)
      return jsonResponse({ success: result.success, ...result }, 200, req)
    }

    if (action === 'sync_all') {
      const result = await syncAllCountries(supabase)
      return jsonResponse({
        success: true,
        message: `World Bank sync complete: ${result.synced} synced, ${result.failed} failed`,
        ...result,
      }, 200, req)
    }

    return jsonResponse({ error: 'Invalid action. Use "sync_one" or "sync_all"' }, 400, req)
  } catch (error) {
    console.error('World Bank fetch error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', success: false }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
