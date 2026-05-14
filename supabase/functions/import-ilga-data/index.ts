import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts';

const ILGA_GRAPHQL = 'https://database.ilga.org/graphql';

// ── GraphQL helpers ────────────────────────────────────────────────

async function gql(query: string): Promise<unknown> {
  const resp = await fetch(ILGA_GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!resp.ok) throw new Error(`ILGA GraphQL ${resp.status}: ${resp.statusText}`);
  const json = await resp.json();
  if (json.errors) throw new Error(`GraphQL error: ${json.errors[0].message}`);
  return json.data;
}

/** Filter to national-level entries only (no subjurisdictions) */
function national<T extends { motherEntry?: { subjurisdiction?: unknown } }>(entries: T[]): T[] {
  return entries.filter(e => !e.motherEntry?.subjurisdiction);
}

/** Build a2_code → entry map from national-level entries */
function byA2<T extends { motherEntry?: { jurisdiction?: { a2_code?: string } } }>(entries: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const e of national(entries)) {
    const code = e.motherEntry?.jurisdiction?.a2_code;
    if (code) map.set(code, e);
  }
  return map;
}

// ── Data fetchers ──────────────────────────────────────────────────

async function fetchCriminalization() {
  const data = await gql(`{
    entriesCsssa(lang: "en") {
      id legal illegal_since decrim_date_1 decrim_date_2
      entry_csssa_penalty { id name }
      entry_csssa_death_penalty_value { id name }
      entry_csssa_max_prison_value { id name }
      max_prison_years has_fine fine enforcement
      entry_csssa_other_punishment_value { id name }
      other
      motherEntry { jurisdiction { id name a2_code } subjurisdiction { id } }
    }
  }`);
  return byA2(data.entriesCsssa);
}

async function fetchFreedomOfExpression() {
  const data = await gql(`{
    entriesFoe(lang: "en") {
      id
      entry_foe_barrier_summary_value { id name }
      entry_foe_barrier_general_value { id name }
      entry_foe_barrier_education_value { id name }
      entry_foe_barrier_media_value { id name }
      motherEntry { jurisdiction { id name a2_code } subjurisdiction { id } }
    }
  }`);
  return byA2(data.entriesFoe);
}

async function fetchFreedomOfAssociation() {
  const data = await gql(`{
    entriesFoa(lang: "en") {
      id barrier_value { id name }
      motherEntry { jurisdiction { id name a2_code } subjurisdiction { id } }
    }
  }`);
  return byA2(data.entriesFoa);
}

async function fetchProtection(type: string) {
  const data = await gql(`{
    entriesProtection(lang: "en", type: "${type}") {
      id
      so_protection_type { id name }
      gi_protection_type { id name }
      ge_protection_type { id name }
      sc_protection_type { id name }
      so_critical_date_1 gi_critical_date_1 ge_critical_date_1 sc_critical_date_1
      motherEntry { jurisdiction { id name a2_code } subjurisdiction { id } }
    }
  }`);
  return byA2(data.entriesProtection);
}

async function fetchConversionTherapy() {
  const data = await gql(`{
    entriesCt(lang: "en") {
      id
      general_ban_type { id name }
      so_value { id name }
      gi_value { id name }
      minors_value { id name }
      all_adults_value { id name }
      motherEntry { jurisdiction { id name a2_code } subjurisdiction { id } }
    }
  }`);
  return byA2(data.entriesCt);
}

async function fetchSameSexUnions() {
  const data = await gql(`{
    entriesSsu(lang: "en") {
      id
      summary_type { id name }
      marriage_type { id name }
      marriage_critical_date_1 marriage_critical_date_2
      civil_type { id name }
      civil_critical_date_1 civil_critical_date_2
      motherEntry { jurisdiction { id name a2_code } subjurisdiction { id } }
    }
  }`);
  return byA2(data.entriesSsu);
}

async function fetchAdoption() {
  const data = await gql(`{
    entriesAdo(lang: "en") {
      id
      map_type { id name }
      joint_adoption_type { id name }
      joint_critical_date_1
      second_parent_adoption_type { id name }
      second_parent_critical_date_1
      motherEntry { jurisdiction { id name a2_code } subjurisdiction { id } }
    }
  }`);
  return byA2(data.entriesAdo);
}

async function fetchIntersex() {
  const data = await gql(`{
    entriesPnc(lang: "en") {
      id pnc_type { id name }
      motherEntry { entry_type_id jurisdiction { id name a2_code } subjurisdiction { id } }
    }
  }`);
  // Filter to entry_type_id A1-17 (intersex) at national level
  const filtered = data.entriesPnc.filter(
    (e: unknown) => !e.motherEntry?.subjurisdiction && e.motherEntry?.entry_type_id === 'A1-17'
  );
  const map = new Map<string, unknown>();
  for (const e of filtered) {
    const code = e.motherEntry?.jurisdiction?.a2_code;
    if (code) map.set(code, e);
  }
  return map;
}

async function fetchGenderRecognition() {
  const data = await gql(`{
    entriesLgr(lang: "en") {
      id
      name_change_lgr_type { id name }
      gender_marker_lgr_type { id name }
      established_procedure { id name }
      gm_selfid_value { id name }
      gm_selfid_since
      gm_diagnosis_gm_value { id name }
      gm_surgery_gm_value { id name }
      motherEntry { jurisdiction { id name a2_code } subjurisdiction { id } }
    }
  }`);
  return byA2(data.entriesLgr);
}

// ── Mappers: ILGA GraphQL → DB column format ──────────────────────

function mapCriminalization(entry: unknown): Record<string, unknown> {
  if (!entry) return {};
  return {
    legal: entry.legal,
    penalty: entry.entry_csssa_penalty?.name || null,
    death_penalty: entry.entry_csssa_death_penalty_value?.name || null,
    max_prison: entry.entry_csssa_max_prison_value?.name || null,
    max_prison_years: entry.max_prison_years,
    has_fine: entry.has_fine,
    fine: entry.fine || null,
    other_punishment: entry.entry_csssa_other_punishment_value?.name || null,
    other: entry.other || null,
    enforcement: entry.enforcement || null,
    decrim_year_1: entry.decrim_date_1,
    decrim_year_2: entry.decrim_date_2,
    illegal_since: entry.illegal_since,
  };
}

function mapProtection(entry: unknown): Record<string, unknown> {
  if (!entry) return {};
  return {
    so: entry.so_protection_type?.name || null,
    gi: entry.gi_protection_type?.name || null,
    ge: entry.ge_protection_type?.name || null,
    sc: entry.sc_protection_type?.name || null,
    so_since: entry.so_critical_date_1 || null,
    gi_since: entry.gi_critical_date_1 || null,
    ge_since: entry.ge_critical_date_1 || null,
    sc_since: entry.sc_critical_date_1 || null,
  };
}

function mapFoe(entry: unknown): Record<string, unknown> {
  if (!entry) return {};
  return {
    summary: entry.entry_foe_barrier_summary_value?.name || null,
    general: entry.entry_foe_barrier_general_value?.name || null,
    education: entry.entry_foe_barrier_education_value?.name || null,
    media: entry.entry_foe_barrier_media_value?.name || null,
  };
}

function mapFoa(entry: unknown): Record<string, unknown> {
  if (!entry) return {};
  return {
    status: entry.barrier_value?.name || null,
  };
}

function mapSsu(entry: unknown): string {
  if (!entry) return 'No data';
  return entry.summary_type?.name || 'No data';
}

function mapSsuFull(entry: unknown): Record<string, unknown> {
  if (!entry) return {};
  return {
    summary: entry.summary_type?.name || null,
    marriage: entry.marriage_type?.name || null,
    marriage_since: entry.marriage_critical_date_1 || null,
    civil_union: entry.civil_type?.name || null,
    civil_union_since: entry.civil_critical_date_1 || null,
  };
}

function mapAdoption(entry: unknown): string {
  if (!entry) return 'No data';
  return entry.map_type?.name || 'No data';
}

function mapCt(entry: unknown): string {
  if (!entry) return 'No data';
  const ban = entry.general_ban_type?.name;
  if (!ban) return 'No data';
  // "Yes" = banned, "No" = not banned, "Partially" etc.
  if (ban === 'Yes') return 'Banned';
  if (ban === 'No') return 'Not banned';
  return ban;
}

function mapIntersex(entry: unknown): string {
  if (!entry) return 'No data';
  return entry.pnc_type?.name || 'No data';
}

function mapGenderRecognition(entry: unknown): Record<string, unknown> {
  if (!entry) return {};
  return {
    name_change: entry.name_change_lgr_type?.name || null,
    gender_marker: entry.gender_marker_lgr_type?.name || null,
    established_procedure: entry.established_procedure?.name || null,
    self_id: entry.gm_selfid_value?.name || null,
    self_id_since: entry.gm_selfid_since || null,
    requires_diagnosis: entry.gm_diagnosis_gm_value?.name || null,
    requires_surgery: entry.gm_surgery_gm_value?.name || null,
  };
}

// ── Equality score calculator ─────────────────────────────────────

function calculateEqualityScore(row: Record<string, unknown>): number {
  let score = 50; // Start from middle

  // Criminalization (biggest factor)
  const crim = row.lgbti_criminalization;
  if (crim?.legal === true) score += 15;
  else if (crim?.legal === false) {
    score -= 25;
    const penalty = crim?.penalty || '';
    if (penalty.includes('Death')) score -= 15;
    else if (penalty.includes('life')) score -= 10;
    else if (penalty.includes('8 years')) score -= 5;
  }

  // Same-sex unions (stored as JSON string with summary field)
  const ssuRaw = row.lgbti_same_sex_unions || '';
  let ssuSummary = '';
  if (typeof ssuRaw === 'string') {
    try {
      const parsed = JSON.parse(ssuRaw);
      ssuSummary = parsed.summary || '';
    } catch {
      ssuSummary = ssuRaw; // plain string fallback
    }
  }
  if (ssuSummary === 'Marriage' || ssuSummary === 'Marriage & Civil Union') score += 10;
  else if (ssuSummary === 'Civil Union Only') score += 5;

  // Protection categories (each worth up to 3 points based on SO coverage)
  const protectionCols = [
    'lgbti_constitutional_protection', 'lgbti_employment_protection',
    'lgbti_housing_protection', 'lgbti_education_protection',
    'lgbti_health_protection', 'lgbti_goods_services_protection',
    'lgbti_bullying_protection',
  ];
  for (const col of protectionCols) {
    const p = row[col];
    if (p?.so === 'Yes') score += 2;
    if (p?.gi === 'Yes') score += 1;
  }

  // Hate crime & incitement (important)
  if (row.lgbti_hate_crime_law?.so === 'Yes') score += 3;
  if (row.lgbti_incitement_prohibition?.so === 'Yes') score += 2;

  // Freedom of expression/association
  const foe = row.lgbti_expression_restrictions;
  if (foe?.summary === 'No Known Legal Barriers') score += 3;
  else if (foe?.summary?.includes('Explicit') || foe?.summary?.includes('Non-Explicit')) score -= 5;

  const foa = row.lgbti_association_restrictions;
  if (foa?.status === 'No Known Legal Barriers') score += 2;
  else if (foa?.status?.includes('Explicit')) score -= 5;

  // Adoption
  const ado = row.lgbti_adoption_rights || '';
  if (typeof ado === 'string') {
    if (ado.includes('Joint')) score += 3;
    else if (ado.includes('Second Parent')) score += 2;
  }

  // Conversion therapy
  const ct = row.lgbti_conversion_therapy_regulation || '';
  if (typeof ct === 'string' && ct === 'Banned') score += 3;

  // Gender recognition
  const lgr = row.lgbti_gender_recognition;
  if (lgr?.self_id === 'Yes') score += 3;
  else if (lgr?.gender_marker === 'Possible') score += 1;

  // Intersex
  const isx = row.lgbti_intersex_protection || '';
  if (typeof isx === 'string' && isx === 'Yes') score += 2;

  return Math.max(0, Math.min(100, score));
}

// ── Main handler ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getServiceClient();
    const auth = await requireAdmin(req, supabase);
    if (auth instanceof Response) return auth;

    // Support both GET (cron) and POST
    let dryRun = false;
    let countryCode: string | null = null;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        dryRun = body.dry_run === true;
        countryCode = body.country_code || null;
      } catch { /* empty body is fine */ }
    }

    console.log(`Starting ILGA GraphQL import. dry_run=${dryRun}, country_code=${countryCode}`);

    // 1. Fetch all data from ILGA GraphQL (17 queries in parallel)
    console.log('Fetching data from ILGA GraphQL API...');
    const [
      crimMap, foeMap, foaMap,
      constMap, goodsMap, healthMap, eduMap, bullyMap, empMap, housingMap,
      hateMap, inciteMap,
      ctMap, ssuMap, adoMap, isxMap, lgrMap,
    ] = await Promise.all([
      fetchCriminalization(),
      fetchFreedomOfExpression(),
      fetchFreedomOfAssociation(),
      fetchProtection('A1-5'),  // Constitutional
      fetchProtection('A1-6'),  // Goods & Services
      fetchProtection('A1-7'),  // Health
      fetchProtection('A1-8'),  // Education
      fetchProtection('A1-9'),  // Bullying
      fetchProtection('A1-10'), // Employment
      fetchProtection('A1-11'), // Housing
      fetchProtection('A1-12'), // Hate crime
      fetchProtection('A1-13'), // Incitement
      fetchConversionTherapy(),
      fetchSameSexUnions(),
      fetchAdoption(),
      fetchIntersex(),
      fetchGenderRecognition(),
    ]);

    console.log(`Fetched: crim=${crimMap.size}, foe=${foeMap.size}, foa=${foaMap.size}, ssu=${ssuMap.size}, ado=${adoMap.size}, ct=${ctMap.size}, lgr=${lgrMap.size}`);

    // 2. Get all countries from our DB
    const { data: countries, error: dbError } = await supabase
      .from('countries')
      .select('id, code, name');

    if (dbError) throw new Error(`DB error: ${dbError.message}`);
    if (!countries?.length) throw new Error('No countries found in database');

    console.log(`Found ${countries.length} countries in DB`);

    // 3. Match and build update rows
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const unmatched: string[] = [];

    // If filtering to one country
    const countriesToProcess = countryCode
      ? countries.filter((c: unknown) => c.code === countryCode.toUpperCase())
      : countries;

    for (const country of countriesToProcess) {
      const code = country.code;
      if (!code) { skipped++; continue; }

      // Check if ILGA has data for this country
      const hasCrim = crimMap.has(code);
      if (!hasCrim && !ssuMap.has(code)) {
        unmatched.push(`${country.name} (${code})`);
        skipped++;
        continue;
      }

      const row: Record<string, unknown> = {
        lgbti_criminalization: mapCriminalization(crimMap.get(code)),
        lgbti_expression_restrictions: mapFoe(foeMap.get(code)),
        lgbti_association_restrictions: mapFoa(foaMap.get(code)),
        lgbti_constitutional_protection: mapProtection(constMap.get(code)),
        lgbti_goods_services_protection: mapProtection(goodsMap.get(code)),
        lgbti_health_protection: mapProtection(healthMap.get(code)),
        lgbti_education_protection: mapProtection(eduMap.get(code)),
        lgbti_bullying_protection: mapProtection(bullyMap.get(code)),
        lgbti_employment_protection: mapProtection(empMap.get(code)),
        lgbti_housing_protection: mapProtection(housingMap.get(code)),
        lgbti_hate_crime_law: mapProtection(hateMap.get(code)),
        lgbti_incitement_prohibition: mapProtection(inciteMap.get(code)),
        lgbti_conversion_therapy_regulation: mapCt(ctMap.get(code)),
        lgbti_same_sex_unions: mapSsu(ssuMap.get(code)),
        lgbti_adoption_rights: mapAdoption(adoMap.get(code)),
        lgbti_intersex_protection: mapIntersex(isxMap.get(code)),
        lgbti_gender_recognition: mapGenderRecognition(lgrMap.get(code)),
        lgbti_data_last_updated: new Date().toISOString(),
      };

      // Store full SSU data in criminalization json for richer display (marriage dates etc.)
      // Actually store it separately — we keep the TEXT column simple, and add full data to the JSONB
      const ssuEntry = ssuMap.get(code);
      if (ssuEntry) {
        // Store detailed SSU data as part of the same_sex_unions info
        // The TEXT column gets the summary, the details go elsewhere
        // For now, let's enrich the criminalization JSONB with SSU details
        // Actually better: store the full SSU as a JSON string in the TEXT column
        const ssuFull = mapSsuFull(ssuEntry);
        row.lgbti_same_sex_unions = JSON.stringify(ssuFull);
      }

      // Calculate equality score
      row.equality_score = calculateEqualityScore(row);

      if (dryRun) {
        console.log(`[DRY RUN] Would update ${country.name} (${code}): score=${row.equality_score}`);
        updated++;
        continue;
      }

      const { error: updateError } = await supabase
        .from('countries')
        .update(row)
        .eq('id', country.id);

      if (updateError) {
        errors.push(`${country.name}: ${updateError.message}`);
      } else {
        updated++;
      }
    }

    const response = {
      success: true,
      dry_run: dryRun,
      total_countries: countriesToProcess.length,
      updated,
      skipped,
      errors_count: errors.length,
      errors: errors.slice(0, 20),
      unmatched: unmatched.slice(0, 20),
      ilga_coverage: {
        criminalization: crimMap.size,
        expression: foeMap.size,
        association: foaMap.size,
        same_sex_unions: ssuMap.size,
        adoption: adoMap.size,
        conversion_therapy: ctMap.size,
        gender_recognition: lgrMap.size,
        intersex: isxMap.size,
      },
    };

    console.log('Import completed:', JSON.stringify(response));

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('ILGA import error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
