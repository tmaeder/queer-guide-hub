import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { requireAdmin, getCorsHeaders, jsonResponse } from '../_shared/supabase-client.ts'

const SDG_API_BASE = 'https://unstats.un.org/sdgs/UNSDGAPIV5/v1/sdg'

// ISO alpha-2 to UN M49 numeric code mapping
const ISO2_TO_M49: Record<string, number> = {
  AF: 4, AL: 8, DZ: 12, AS: 16, AD: 20, AO: 24, AG: 28, AR: 32, AM: 51,
  AU: 36, AT: 40, AZ: 31, BS: 44, BH: 48, BD: 50, BB: 52, BY: 112, BE: 56,
  BZ: 84, BJ: 204, BT: 64, BO: 68, BA: 70, BW: 72, BR: 76, BN: 96, BG: 100,
  BF: 854, BI: 108, CV: 132, KH: 116, CM: 120, CA: 124, CF: 140, TD: 148,
  CL: 152, CN: 156, CO: 170, KM: 174, CG: 178, CD: 180, CR: 188, CI: 384,
  HR: 191, CU: 192, CY: 196, CZ: 203, DK: 208, DJ: 262, DM: 212, DO: 214,
  EC: 218, EG: 818, SV: 222, GQ: 226, ER: 232, EE: 233, SZ: 748, ET: 231,
  FJ: 242, FI: 246, FR: 250, GA: 266, GM: 270, GE: 268, DE: 276, GH: 288,
  GR: 300, GD: 308, GT: 320, GN: 324, GW: 624, GY: 328, HT: 332, HN: 340,
  HU: 348, IS: 352, IN: 356, ID: 360, IR: 364, IQ: 368, IE: 372, IL: 376,
  IT: 380, JM: 388, JP: 392, JO: 400, KZ: 398, KE: 404, KI: 296, KP: 408,
  KR: 410, KW: 414, KG: 417, LA: 418, LV: 428, LB: 422, LS: 426, LR: 430,
  LY: 434, LI: 438, LT: 440, LU: 442, MG: 450, MW: 454, MY: 458, MV: 462,
  ML: 466, MT: 470, MH: 584, MR: 478, MU: 480, MX: 484, FM: 583, MD: 498,
  MC: 492, MN: 496, ME: 499, MA: 504, MZ: 508, MM: 104, NA: 516, NR: 520,
  NP: 524, NL: 528, NZ: 554, NI: 558, NE: 562, NG: 566, MK: 807, NO: 578,
  OM: 512, PK: 586, PW: 585, PA: 591, PG: 598, PY: 600, PE: 604, PH: 608,
  PL: 616, PT: 620, QA: 634, RO: 642, RU: 643, RW: 646, KN: 659, LC: 662,
  VC: 670, WS: 882, SM: 674, ST: 678, SA: 682, SN: 686, RS: 688, SC: 690,
  SL: 694, SG: 702, SK: 703, SI: 705, SB: 90, SO: 706, ZA: 710, SS: 728,
  ES: 724, LK: 144, SD: 729, SR: 740, SE: 752, CH: 756, SY: 760, TJ: 762,
  TZ: 834, TH: 764, TL: 626, TG: 768, TO: 776, TT: 780, TN: 788, TR: 792,
  TM: 795, TV: 798, UG: 800, UA: 804, AE: 784, GB: 826, US: 840, UY: 858,
  UZ: 860, VU: 548, VE: 862, VN: 704, YE: 887, ZM: 894, ZW: 716,
  PS: 275, TW: 158, XK: 412, CW: 531, SX: 534, MF: 663, BQ: 535,
}

// One key series per SDG goal — the most representative indicator
const SDG_SERIES: Record<number, { code: string; description: string; unit: string }> = {
  1:  { code: 'SI_POV_DAY1',     description: 'Population below $2.15/day',          unit: '%' },
  2:  { code: 'SN_ITK_DEFC',     description: 'Prevalence of undernourishment',      unit: '%' },
  3:  { code: 'SH_DYN_MORT',     description: 'Under-5 mortality rate',              unit: 'per 1,000 live births' },
  4:  { code: 'SE_GPI_PART',     description: 'Gender parity index (education)',     unit: 'index' },
  5:  { code: 'SG_GEN_PARL',     description: 'Women in national parliament',        unit: '%' },
  6:  { code: 'SH_H2O_SAFE',     description: 'Safe drinking water services',        unit: '%' },
  7:  { code: 'EG_EGY_CLEAN',    description: 'Access to clean fuels for cooking',   unit: '%' },
  8:  { code: 'SL_TLF_UEM',      description: 'Unemployment rate (ILO)',             unit: '%' },
  9:  { code: 'IT_NET_BBN',      description: 'Fixed broadband subscriptions',       unit: 'per 100 inhabitants' },
  10: { code: 'SI_POV_GINI',     description: 'GINI coefficient',                    unit: 'index' },
  11: { code: 'EN_LND_SLUM',     description: 'Urban slum population',               unit: '%' },
  12: { code: 'EN_MAT_DOMCMPC',  description: 'Material footprint per capita',       unit: 'tonnes' },
  13: { code: 'VC_DSR_DAFF',     description: 'Disaster-affected persons',           unit: 'per 100,000' },
  14: { code: 'ER_MRN_MARIN',    description: 'Marine protected areas',              unit: '% of territorial waters' },
  15: { code: 'ER_PTD_TERRS',    description: 'Protected terrestrial areas',         unit: '% of total land' },
  16: { code: 'VC_IHR_PSRC',     description: 'Intentional homicide rate',           unit: 'per 100,000' },
  17: { code: 'DC_ODA_TOTL',     description: 'Net ODA received',                    unit: '% of GNI' },
}

// Fetch SDG series data for a country
async function fetchSeriesData(
  m49Code: number,
  seriesCode: string
): Promise<{ value: number | null; year: number | null }> {
  try {
    const url = `${SDG_API_BASE}/Series/Data?seriesCode=${seriesCode}&areaCode=${m49Code}&pageSize=50&page=1`
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    })

    if (!resp.ok) {
      console.warn(`SDG API ${resp.status} for series ${seriesCode}, area ${m49Code}`)
      return { value: null, year: null }
    }

    const json = await resp.json()

    // The API returns { totalCount, pageSize, data: [...] } or similar structure
    // Each data entry has: value, timePeriodStart (or timePeriod), geoAreaCode, etc.
    const records = json.data || json.Data || json || []

    if (!Array.isArray(records) || records.length === 0) {
      return { value: null, year: null }
    }

    // Find the most recent record with a numeric value
    // Sort by time period descending, take the first valid one
    const sortedRecords = records
      .filter((r: any) => {
        const val = r.value ?? r.Value
        return val != null && val !== '' && val !== 'NaN' && val !== 'N'
      })
      .sort((a: any, b: any) => {
        const yearA = Number(a.timePeriodStart || a.TimePeriod || a.timePeriod || 0)
        const yearB = Number(b.timePeriodStart || b.TimePeriod || b.timePeriod || 0)
        return yearB - yearA
      })

    if (sortedRecords.length === 0) {
      return { value: null, year: null }
    }

    const latest = sortedRecords[0]
    const value = Number(latest.value ?? latest.Value)
    const year = Number(latest.timePeriodStart || latest.TimePeriod || latest.timePeriod || null)

    return {
      value: isNaN(value) ? null : Number(value.toFixed(2)),
      year: isNaN(year) ? null : year,
    }
  } catch (e) {
    console.warn(`Failed to fetch SDG series ${seriesCode} for area ${m49Code}:`, e)
    return { value: null, year: null }
  }
}

// Sync SDG data for a single country
async function syncCountry(
  supabase: any,
  iso2: string
): Promise<{ success: boolean; country?: string; error?: string; goalsWithData?: number }> {
  const code = iso2.toUpperCase()
  const m49 = ISO2_TO_M49[code]

  if (!m49) {
    return { success: false, error: `No M49 code mapping for ${code}` }
  }

  // Find country in DB
  const { data: country, error } = await supabase
    .from('countries')
    .select('id, name, code')
    .eq('code', code)
    .maybeSingle()

  if (error || !country) {
    return { success: false, error: `Country ${code} not found in database` }
  }

  console.log(`Syncing SDG data for ${country.name} (${code}, M49: ${m49})...`)

  // Fetch all 17 SDG goal indicators
  const sdgData: Record<string, any> = {}
  let goalsWithData = 0

  for (const [goalNum, seriesInfo] of Object.entries(SDG_SERIES)) {
    const result = await fetchSeriesData(m49, seriesInfo.code)

    sdgData[goalNum] = {
      series: seriesInfo.code,
      description: seriesInfo.description,
      unit: seriesInfo.unit,
      value: result.value,
      year: result.year,
    }

    if (result.value != null) {
      goalsWithData++
    }

    // Rate limit between API calls
    await new Promise(r => setTimeout(r, 300))
  }

  // Update DB
  const updateObj: Record<string, any> = {
    un_m49_code: m49,
    sdg_data: sdgData,
    sdg_last_synced_at: new Date().toISOString(),
  }

  const { error: updateError } = await supabase
    .from('countries')
    .update(updateObj)
    .eq('id', country.id)

  if (updateError) {
    return { success: false, error: `DB update failed: ${updateError.message}` }
  }

  console.log(`Synced SDG data for ${country.name}: ${goalsWithData}/17 goals with data`)
  return { success: true, country: country.name, goalsWithData }
}

// Sync all countries
async function syncAllCountries(
  supabase: any
): Promise<{ synced: number; failed: number; errors: string[] }> {
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

    // Rate limit between countries
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
        message: `SDG sync complete: ${result.synced} synced, ${result.failed} failed`,
        ...result,
      }, 200, req)
    }

    return jsonResponse({ error: 'Invalid action. Use "sync_one" or "sync_all"' }, 400, req)
  } catch (error) {
    console.error('SDG fetch error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', success: false }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
