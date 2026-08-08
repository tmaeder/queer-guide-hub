import {
  Ban,
  BookOpen,
  Briefcase,
  Fingerprint,
  Gavel,
  GraduationCap,
  Heart,
  Home,
  Scale,
  Shield,
  ShoppingBag,
  Stethoscope,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * The 18 rights we hold, as data.
 *
 * These lived as hardcoded JSX rows inside LGBTJurisdictionInfo, which made
 * them unreachable from anywhere else — so `/rights` shipped a country ledger
 * that rendered ONE of them while the other 17 sat in the database at 100%
 * coverage. Declaring them here lets the country card, the `/rights` index and
 * the per-right topic pages read one list.
 *
 * `slug` is a URL segment. Any route built from it MUST be declared as a
 * static path (`rights/marriage`), never a param (`rights/:right`) — see the
 * routing comment in src/routes.tsx. A static second segment scores 24 and
 * beats `/:locale/<static>` at 17; a dynamic one ties at 17 and resolves to
 * NotFound for an unknown "locale". Mapping over this const still emits
 * literal `path` strings, so `RIGHT_TOPICS.map(...)` is safe and collapsing it
 * to a param is not.
 */

export type RightSection =
  | 'criminalisation'
  | 'antiDiscrimination'
  | 'criminalJustice'
  | 'family'
  | 'identity';

/**
 * How the value is shaped, which decides how it renders and how a lens reads
 * it. `protection-matrix` is the only kind split across so/gi/ge/sc.
 */
export type RightKind =
  | 'criminalisation'
  | 'protection-matrix'
  | 'union'
  | 'gender-recognition'
  | 'status';

/** Sexual orientation, gender identity, gender expression, sex characteristics. */
export type ProtectionAttr = 'so' | 'gi' | 'ge' | 'sc';

export interface RightTopic {
  slug: string;
  /** Column on `countries`. */
  column: string;
  kind: RightKind;
  section: RightSection;
  /** Which attributes the statute is recorded against; [] when not split. */
  attributes: readonly ProtectionAttr[];
  /** Paths into the value carrying an adoption year, for the since-timeline. */
  sincePaths: readonly string[];
  icon: LucideIcon;
  /** `country.rights.<labelKey>` — reuses the existing 32 keys, unchanged. */
  labelKey: string;
  labelDefault: string;
  /** A negative here is criminal exposure, so it may use --destructive. */
  severeNegative?: boolean;
}

const MATRIX_ATTRS: readonly ProtectionAttr[] = ['so', 'gi', 'ge', 'sc'];
const MATRIX_SINCE: readonly string[] = ['so_since', 'gi_since', 'ge_since', 'sc_since'];

export const RIGHT_TOPICS: readonly RightTopic[] = [
  {
    slug: 'criminalisation',
    column: 'lgbti_criminalization',
    kind: 'criminalisation',
    section: 'criminalisation',
    attributes: [],
    sincePaths: ['decrim_year_1', 'decrim_year_2'],
    icon: Scale,
    labelKey: 'sameSexActivity',
    labelDefault: 'Same-sex activity',
    severeNegative: true,
  },
  {
    slug: 'expression',
    column: 'lgbti_expression_restrictions',
    kind: 'status',
    section: 'criminalisation',
    attributes: [],
    sincePaths: [],
    icon: BookOpen,
    labelKey: 'expression',
    labelDefault: 'Freedom of expression',
  },
  {
    slug: 'association',
    column: 'lgbti_association_restrictions',
    kind: 'status',
    section: 'criminalisation',
    attributes: [],
    sincePaths: [],
    icon: Users,
    labelKey: 'association',
    labelDefault: 'Freedom of association',
  },

  {
    slug: 'constitutional',
    column: 'lgbti_constitutional_protection',
    kind: 'protection-matrix',
    section: 'antiDiscrimination',
    attributes: MATRIX_ATTRS,
    sincePaths: MATRIX_SINCE,
    icon: Shield,
    labelKey: 'constitutional',
    labelDefault: 'Constitutional',
  },
  {
    slug: 'employment',
    column: 'lgbti_employment_protection',
    kind: 'protection-matrix',
    section: 'antiDiscrimination',
    attributes: MATRIX_ATTRS,
    sincePaths: MATRIX_SINCE,
    icon: Briefcase,
    labelKey: 'employment',
    labelDefault: 'Employment',
  },
  {
    slug: 'housing',
    column: 'lgbti_housing_protection',
    kind: 'protection-matrix',
    section: 'antiDiscrimination',
    attributes: MATRIX_ATTRS,
    sincePaths: MATRIX_SINCE,
    icon: Home,
    labelKey: 'housing',
    labelDefault: 'Housing',
  },
  {
    slug: 'education',
    column: 'lgbti_education_protection',
    kind: 'protection-matrix',
    section: 'antiDiscrimination',
    attributes: MATRIX_ATTRS,
    sincePaths: MATRIX_SINCE,
    icon: GraduationCap,
    labelKey: 'education',
    labelDefault: 'Education',
  },
  {
    slug: 'health',
    column: 'lgbti_health_protection',
    kind: 'protection-matrix',
    section: 'antiDiscrimination',
    attributes: MATRIX_ATTRS,
    sincePaths: MATRIX_SINCE,
    icon: Stethoscope,
    labelKey: 'health',
    labelDefault: 'Health',
  },
  {
    slug: 'goods-services',
    column: 'lgbti_goods_services_protection',
    kind: 'protection-matrix',
    section: 'antiDiscrimination',
    attributes: MATRIX_ATTRS,
    sincePaths: MATRIX_SINCE,
    icon: ShoppingBag,
    labelKey: 'goodsServices',
    labelDefault: 'Goods & services',
  },
  {
    slug: 'bullying',
    column: 'lgbti_bullying_protection',
    kind: 'protection-matrix',
    section: 'antiDiscrimination',
    attributes: MATRIX_ATTRS,
    sincePaths: MATRIX_SINCE,
    icon: Shield,
    labelKey: 'bullying',
    labelDefault: 'Bullying',
  },

  {
    slug: 'hate-crime',
    column: 'lgbti_hate_crime_law',
    kind: 'protection-matrix',
    section: 'criminalJustice',
    attributes: MATRIX_ATTRS,
    sincePaths: MATRIX_SINCE,
    icon: Gavel,
    labelKey: 'hateCrime',
    labelDefault: 'Hate crime laws',
  },
  {
    slug: 'incitement',
    column: 'lgbti_incitement_prohibition',
    kind: 'protection-matrix',
    section: 'criminalJustice',
    attributes: MATRIX_ATTRS,
    sincePaths: MATRIX_SINCE,
    icon: Ban,
    labelKey: 'incitement',
    labelDefault: 'Incitement prohibition',
  },

  // Marriage and civil union share one column but are different questions with
  // different adoption years, and Phase 3 gives them separate topic pages.
  {
    slug: 'marriage',
    column: 'lgbti_same_sex_unions',
    kind: 'union',
    section: 'family',
    attributes: [],
    sincePaths: ['marriage_since'],
    icon: Heart,
    labelKey: 'unions',
    labelDefault: 'Same-sex unions',
  },
  {
    slug: 'civil-union',
    column: 'lgbti_same_sex_unions',
    kind: 'union',
    section: 'family',
    attributes: [],
    sincePaths: ['civil_union_since'],
    icon: Heart,
    labelKey: 'unions',
    labelDefault: 'Same-sex unions',
  },
  {
    slug: 'adoption',
    column: 'lgbti_adoption_rights',
    kind: 'status',
    section: 'family',
    attributes: [],
    sincePaths: [],
    icon: Users,
    labelKey: 'adoption',
    labelDefault: 'Adoption rights',
  },

  {
    slug: 'gender-recognition',
    column: 'lgbti_gender_recognition',
    kind: 'gender-recognition',
    section: 'identity',
    attributes: ['gi', 'ge'],
    sincePaths: ['self_id_since'],
    icon: Fingerprint,
    labelKey: 'genderRecognition',
    labelDefault: 'Gender recognition',
  },
  {
    slug: 'conversion-therapy',
    column: 'lgbti_conversion_therapy_regulation',
    kind: 'status',
    section: 'identity',
    attributes: [],
    sincePaths: [],
    icon: Ban,
    labelKey: 'conversionTherapy',
    labelDefault: 'Conversion therapy',
  },
  {
    slug: 'intersex',
    column: 'lgbti_intersex_protection',
    kind: 'status',
    section: 'identity',
    attributes: ['sc'],
    sincePaths: [],
    icon: Shield,
    labelKey: 'intersex',
    labelDefault: 'Intersex bodily integrity',
  },
];

/** Render order for the country card and the `/rights` topic grid. */
export const RIGHT_SECTION_ORDER: readonly RightSection[] = [
  'criminalisation',
  'antiDiscrimination',
  'criminalJustice',
  'family',
  'identity',
];

export const RIGHT_SECTION_LABEL: Record<RightSection, string> = {
  criminalisation: 'Criminalisation & freedoms',
  antiDiscrimination: 'Anti-discrimination protection',
  criminalJustice: 'Criminal justice',
  family: 'Family & relationships',
  identity: 'Identity & health',
};

export function topicsInSection(section: RightSection): readonly RightTopic[] {
  return RIGHT_TOPICS.filter((r) => r.section === section);
}

export function topicBySlug(slug: string): RightTopic | undefined {
  return RIGHT_TOPICS.find((r) => r.slug === slug);
}
