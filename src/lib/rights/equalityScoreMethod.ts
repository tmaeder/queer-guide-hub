/**
 * The equality-score method as data, for /tags/rights-by-country/methodology.
 *
 * The formula lives in supabase/functions/_shared/equality-score.ts and runs
 * nightly in import-ilga-data. This table restates it for readers; it is NOT a
 * second implementation. equalityScoreMethod.test.ts feeds every row's `probe`
 * through the real calculateEqualityScore and asserts the score moves by
 * exactly `points`, so a weight changed in the formula fails CI here instead of
 * leaving the published method page wrong.
 *
 * `base` is the record the probe is applied on top of. Most rows start from an
 * empty record (score 50); the penalty rows start from a criminalised record,
 * because the penalty deduction only exists on top of criminalisation.
 */

type Fields = Record<string, unknown>;

export interface MethodRow {
  id: string;
  /** What ILGA records, in reader terms. */
  label: string;
  points: number;
  /** ILGA column the formula reads. */
  field: string;
  probe: Fields;
  base?: Fields;
}

export interface MethodGroup {
  id: string;
  label: string;
  rows: MethodRow[];
}

const CRIMINALISED = { lgbti_criminalization: { legal: false } };

const PROTECTION_AREAS: Array<[string, string]> = [
  ['constitutional', 'Constitution'],
  ['employment', 'Employment'],
  ['housing', 'Housing'],
  ['education', 'Education'],
  ['health', 'Health'],
  ['goods_services', 'Goods and services'],
  ['bullying', 'Bullying'],
];

export const EQUALITY_SCORE_START = 50;

export const EQUALITY_SCORE_METHOD: MethodGroup[] = [
  {
    id: 'criminalisation',
    label: 'Criminalisation',
    rows: [
      {
        id: 'legal',
        label: 'Same-sex sexual acts are legal',
        points: 15,
        field: 'lgbti_criminalization.legal',
        probe: { lgbti_criminalization: { legal: true } },
      },
      {
        id: 'criminalised',
        label: 'Same-sex sexual acts are criminalised',
        points: -25,
        field: 'lgbti_criminalization.legal',
        probe: CRIMINALISED,
      },
      {
        id: 'death',
        label: 'Penalty described as the death penalty, including "possible"',
        points: -15,
        field: 'lgbti_criminalization.penalty',
        base: CRIMINALISED,
        probe: { lgbti_criminalization: { legal: false, penalty: 'Death Penalty (possible)' } },
      },
      {
        id: 'life',
        label: 'Penalty up to life imprisonment',
        points: -10,
        field: 'lgbti_criminalization.penalty',
        base: CRIMINALISED,
        probe: { lgbti_criminalization: { legal: false, penalty: '10 years to life in prison' } },
      },
      {
        id: 'eight',
        label: 'Penalty up to 8 years imprisonment',
        points: -5,
        field: 'lgbti_criminalization.penalty',
        base: CRIMINALISED,
        probe: { lgbti_criminalization: { legal: false, penalty: 'Up to 8 years imprisonment' } },
      },
    ],
  },
  {
    id: 'partnership',
    label: 'Partnership',
    rows: [
      {
        id: 'marriage',
        label: 'Same-sex marriage',
        points: 10,
        field: 'lgbti_same_sex_unions',
        probe: { lgbti_same_sex_unions: JSON.stringify({ summary: 'Marriage' }) },
      },
      {
        id: 'civil-union',
        label: 'Civil union only',
        points: 5,
        field: 'lgbti_same_sex_unions',
        probe: { lgbti_same_sex_unions: JSON.stringify({ summary: 'Civil Union Only' }) },
      },
    ],
  },
  {
    id: 'protection',
    label: 'Anti-discrimination protection',
    rows: PROTECTION_AREAS.flatMap(([col, area]) => [
      {
        id: `${col}-so`,
        label: `${area}: covers sexual orientation`,
        points: 2,
        field: `lgbti_${col}_protection.so`,
        probe: { [`lgbti_${col}_protection`]: { so: 'Yes' } },
      },
      {
        id: `${col}-gi`,
        label: `${area}: covers gender identity`,
        points: 1,
        field: `lgbti_${col}_protection.gi`,
        probe: { [`lgbti_${col}_protection`]: { gi: 'Yes' } },
      },
    ]),
  },
  {
    id: 'hate',
    label: 'Hate crime and incitement',
    rows: [
      {
        id: 'hate-crime',
        label: 'Hate-crime law covers sexual orientation',
        points: 3,
        field: 'lgbti_hate_crime_law.so',
        probe: { lgbti_hate_crime_law: { so: 'Yes' } },
      },
      {
        id: 'incitement',
        label: 'Incitement to hatred prohibited, covering sexual orientation',
        points: 2,
        field: 'lgbti_incitement_prohibition.so',
        probe: { lgbti_incitement_prohibition: { so: 'Yes' } },
      },
    ],
  },
  {
    id: 'civic',
    label: 'Expression and association',
    rows: [
      {
        id: 'expression-free',
        label: 'No known legal barriers to expression',
        points: 3,
        field: 'lgbti_expression_restrictions.summary',
        probe: { lgbti_expression_restrictions: { summary: 'No Known Legal Barriers' } },
      },
      {
        id: 'expression-restricted',
        label: 'Legal restrictions on expression (explicit or not)',
        points: -5,
        field: 'lgbti_expression_restrictions.summary',
        probe: { lgbti_expression_restrictions: { summary: 'Explicit Restrictions' } },
      },
      {
        id: 'association-free',
        label: 'No known legal barriers to association',
        points: 2,
        field: 'lgbti_association_restrictions.status',
        probe: { lgbti_association_restrictions: { status: 'No Known Legal Barriers' } },
      },
      {
        id: 'association-restricted',
        label: 'Explicit legal restrictions on association',
        points: -5,
        field: 'lgbti_association_restrictions.status',
        probe: { lgbti_association_restrictions: { status: 'Explicit Restrictions' } },
      },
    ],
  },
  {
    id: 'family',
    label: 'Family and bodily integrity',
    rows: [
      {
        id: 'joint-adoption',
        label: 'Joint adoption',
        points: 3,
        field: 'lgbti_adoption_rights',
        probe: { lgbti_adoption_rights: 'Joint adoption' },
      },
      {
        id: 'second-parent',
        label: 'Second-parent adoption only',
        points: 2,
        field: 'lgbti_adoption_rights',
        probe: { lgbti_adoption_rights: 'Second Parent adoption' },
      },
      {
        id: 'conversion',
        label: 'Conversion practices banned',
        points: 3,
        field: 'lgbti_conversion_therapy_regulation',
        probe: { lgbti_conversion_therapy_regulation: 'Banned' },
      },
      {
        id: 'self-id',
        label: 'Legal gender recognition by self-determination',
        points: 3,
        field: 'lgbti_gender_recognition.self_id',
        probe: { lgbti_gender_recognition: { self_id: 'Yes' } },
      },
      {
        id: 'marker',
        label: 'Gender marker change possible, without self-determination',
        points: 1,
        field: 'lgbti_gender_recognition.gender_marker',
        probe: { lgbti_gender_recognition: { gender_marker: 'Possible' } },
      },
      {
        id: 'intersex',
        label: 'Protection for intersex people',
        points: 2,
        field: 'lgbti_intersex_protection',
        probe: { lgbti_intersex_protection: 'Yes' },
      },
    ],
  },
];

/**
 * Rows that are alternatives to each other: a record can earn at most one row
 * per set. Used to compute the reachable range, not the score.
 */
const EXCLUSIVE = [
  ['legal', 'criminalised'],
  ['death', 'life', 'eight'],
  ['marriage', 'civil-union'],
  ['expression-free', 'expression-restricted'],
  ['association-free', 'association-restricted'],
  ['joint-adoption', 'second-parent'],
  ['self-id', 'marker'],
];

function rawExtreme(pick: (a: number, b: number) => number): number {
  const rows = EQUALITY_SCORE_METHOD.flatMap((g) => g.rows);
  const points = new Map(rows.map((r) => [r.id, r.points]));
  const exclusive = new Set(EXCLUSIVE.flat());
  let total = EQUALITY_SCORE_START;
  for (const set of EXCLUSIVE) {
    // An empty choice (0) is always available: a record may hold neither.
    total += set.map((id) => points.get(id) ?? 0).reduce((a, b) => pick(a, b), 0);
  }
  for (const row of rows) {
    if (!exclusive.has(row.id)) total += pick(row.points, 0);
  }
  return total;
}

/** Highest and lowest totals before the 0–100 clamp. */
export const EQUALITY_SCORE_RAW_MAX = rawExtreme(Math.max);
export const EQUALITY_SCORE_RAW_MIN = rawExtreme(Math.min);
