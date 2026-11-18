/**
 * The single shared equality-score formula (0–100) for countries, computed
 * from ILGA legal-status columns. Extracted verbatim from import-ilga-data —
 * previously the formula lived only inline there while CLAUDE.md already
 * documented it as shared. Applied nightly by the wf-import-ilga-data cron.
 *
 * NOT the same thing as `content_completeness_score` (data completeness) or
 * the frontend risk tiers (`useTripSafety.ts`, which consume this value).
 */

// deno-lint-ignore no-explicit-any -- ILGA rows are loosely-shaped JSON blobs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/**
 * Human-readable statement of the formula below, published on
 * /tags/rights-by-country/sources#points. NOT read by calculateEqualityScore
 * (the nightly cron's formula stays untouched); equalityScoreRules.test.ts
 * fails if a row here stops matching what the function actually does.
 */
export const EQUALITY_SCORE_BASE = 50;

export interface EqualityScoreRule {
  id: string;
  /** What ILGA records. */
  factor: string;
  /** Signed points added to the base. */
  points: number;
}

export const EQUALITY_SCORE_RULES: readonly EqualityScoreRule[] = [
  { id: 'legal', factor: 'Same-sex sexual acts are legal', points: 15 },
  { id: 'criminalised', factor: 'Same-sex sexual acts are criminalised', points: -25 },
  { id: 'death', factor: '…and the penalty is death (in addition)', points: -15 },
  { id: 'life', factor: '…or the penalty runs to life imprisonment (in addition)', points: -10 },
  { id: 'eight', factor: '…or the penalty is up to 8 years (in addition)', points: -5 },
  { id: 'marriage', factor: 'Same-sex marriage', points: 10 },
  { id: 'civil-union', factor: 'Civil union only (no marriage)', points: 5 },
  {
    id: 'protection-so',
    factor:
      'Protection by sexual orientation, per area: constitution, employment, housing, education, health, goods and services, bullying (7 areas)',
    points: 2,
  },
  { id: 'protection-gi', factor: 'Protection by gender identity, per area (same 7 areas)', points: 1 },
  { id: 'hate-crime', factor: 'Hate-crime law covering sexual orientation', points: 3 },
  { id: 'incitement', factor: 'Incitement to hatred prohibited (sexual orientation)', points: 2 },
  { id: 'expression-free', factor: 'No known legal barriers to freedom of expression', points: 3 },
  { id: 'expression-restricted', factor: 'Legal restrictions on freedom of expression', points: -5 },
  { id: 'association-free', factor: 'No known legal barriers to freedom of association', points: 2 },
  { id: 'association-restricted', factor: 'Explicit restrictions on freedom of association', points: -5 },
  { id: 'adoption-joint', factor: 'Joint adoption by same-sex couples', points: 3 },
  { id: 'adoption-second-parent', factor: 'Second-parent adoption only', points: 2 },
  { id: 'conversion-ban', factor: 'Conversion practices banned', points: 3 },
  { id: 'self-id', factor: 'Legal gender recognition by self-identification', points: 3 },
  { id: 'marker-change', factor: 'Gender marker change possible (not self-ID)', points: 1 },
  { id: 'intersex', factor: 'Protection of intersex bodily integrity', points: 2 },
];

export function calculateEqualityScore(row: Row): number {
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
