/**
 * Canonical LGBTI equality score (0-100) for a country.
 *
 * Single source of truth — extracted from import-ilga-data so every writer
 * (ILGA import, country pipeline enrich) computes the score the same way.
 * Reads the canonical `countries.lgbti_*` columns. Distinct from
 * `content_completeness_score` (data completeness, not legal status).
 *
 * Granular weighting (base 50):
 *   criminalization (legal +15 / illegal -25, death -15 / life -10 / 8y -5)
 *   same-sex unions (marriage +10 / civil +5)
 *   7 protection categories (SO +2, GI +1 each)
 *   hate crime +3, incitement +2
 *   freedom of expression +3 / -5, association +2 / -5
 *   adoption (joint +3 / second-parent +2)
 *   conversion therapy banned +3
 *   gender recognition (self-id +3 / marker possible +1)
 *   intersex protection +2
 */
export function computeEqualityScore(row: Record<string, unknown>): number {
  let score = 50 // Start from middle

  // Criminalization (biggest factor)
  const crim = row.lgbti_criminalization as Record<string, unknown> | null | undefined
  if (crim?.legal === true) score += 15
  else if (crim?.legal === false) {
    score -= 25
    const penalty = (crim?.penalty as string) || ''
    if (penalty.includes('Death')) score -= 15
    else if (penalty.includes('life')) score -= 10
    else if (penalty.includes('8 years')) score -= 5
  }

  // Same-sex unions (stored as JSON string with summary field)
  const ssuRaw = row.lgbti_same_sex_unions || ''
  let ssuSummary = ''
  if (typeof ssuRaw === 'string') {
    try {
      const parsed = JSON.parse(ssuRaw)
      ssuSummary = parsed.summary || ''
    } catch {
      ssuSummary = ssuRaw // plain string fallback
    }
  }
  if (ssuSummary === 'Marriage' || ssuSummary === 'Marriage & Civil Union') score += 10
  else if (ssuSummary === 'Civil Union Only') score += 5

  // Protection categories (each worth up to 3 points based on SO/GI coverage)
  const protectionCols = [
    'lgbti_constitutional_protection', 'lgbti_employment_protection',
    'lgbti_housing_protection', 'lgbti_education_protection',
    'lgbti_health_protection', 'lgbti_goods_services_protection',
    'lgbti_bullying_protection',
  ]
  for (const col of protectionCols) {
    const p = row[col] as Record<string, unknown> | null | undefined
    if (p?.so === 'Yes') score += 2
    if (p?.gi === 'Yes') score += 1
  }

  // Hate crime & incitement (important)
  if ((row.lgbti_hate_crime_law as Record<string, unknown>)?.so === 'Yes') score += 3
  if ((row.lgbti_incitement_prohibition as Record<string, unknown>)?.so === 'Yes') score += 2

  // Freedom of expression/association
  const foe = row.lgbti_expression_restrictions as Record<string, unknown> | null | undefined
  const foeSummary = (foe?.summary as string) || ''
  if (foeSummary === 'No Known Legal Barriers') score += 3
  else if (foeSummary.includes('Explicit') || foeSummary.includes('Non-Explicit')) score -= 5

  const foa = row.lgbti_association_restrictions as Record<string, unknown> | null | undefined
  const foaStatus = (foa?.status as string) || ''
  if (foaStatus === 'No Known Legal Barriers') score += 2
  else if (foaStatus.includes('Explicit')) score -= 5

  // Adoption
  const ado = row.lgbti_adoption_rights || ''
  if (typeof ado === 'string') {
    if (ado.includes('Joint')) score += 3
    else if (ado.includes('Second Parent')) score += 2
  }

  // Conversion therapy
  const ct = row.lgbti_conversion_therapy_regulation || ''
  if (typeof ct === 'string' && ct === 'Banned') score += 3

  // Gender recognition
  const lgr = row.lgbti_gender_recognition as Record<string, unknown> | null | undefined
  if (lgr?.self_id === 'Yes') score += 3
  else if (lgr?.gender_marker === 'Possible') score += 1

  // Intersex
  const isx = row.lgbti_intersex_protection || ''
  if (typeof isx === 'string' && isx === 'Yes') score += 2

  return Math.max(0, Math.min(100, score))
}
