import { AGE_BANDS, BODY_TYPES, GENITALIA_OPTIONS, INTO_TAGS } from '@/assets/intimate/options';

export type PreferenceStrength = 'any' | 'preferred' | 'required';
export interface MatchingRule {
  strength: PreferenceStrength;
  values: string[];
}

export const CONNECTION_GOALS = [
  'dates',
  'relationship',
  'casual',
  'queerplatonic',
  'friendship',
  'chosen_family',
] as const;
export const CONNECTION_PRACTICES = [
  'ask_before_touch',
  'text_first',
  'slow_pace',
  'step_free_meetup',
  'quiet_meetup',
  'discreet_contact',
  'no_public_photos',
] as const;

export const MATCHING_FIELDS = [
  {
    key: 'genders',
    label: 'Genders I’m open to meeting',
    options: [
      'woman',
      'man',
      'non_binary',
      'genderfluid',
      'agender',
      'bigender',
      'genderqueer',
      'demigender',
      'two_spirit',
      'questioning',
      'other',
    ],
  },
  { key: 'age_bands', label: 'Age ranges', options: AGE_BANDS },
  {
    key: 'relationship_styles',
    label: 'Relationship styles I’m open to',
    options: [
      'monogamous',
      'polyamorous',
      'relationship_anarchist',
      'open_relationship',
      'swinging',
      'exploring',
    ],
  },
  {
    key: 'relationship_statuses',
    label: 'Relationship statuses I’m open to',
    options: ['single', 'taken', 'its_complicated', 'open_to_explore'],
  },
  { key: 'goals', label: 'Connections I want to share', options: CONNECTION_GOALS },
  {
    key: 'positions',
    label: 'Sexual positions I’m open to',
    options: ['top', 'bottom', 'vers', 'vers-top', 'vers-bottom', 'side'],
  },
  { key: 'dynamics', label: 'Power dynamics I’m open to', options: ['dom', 'sub', 'switch'] },
  { key: 'activities', label: 'Activities I want to share', options: INTO_TAGS, all: true },
  { key: 'protection', label: 'Protection boundaries', options: ['condoms_always'], all: true },
  {
    key: 'practices',
    label: 'Communication, access & discretion I need',
    options: CONNECTION_PRACTICES,
    all: true,
  },
  { key: 'body_types', label: 'Body types', options: BODY_TYPES },
  {
    key: 'genitalia',
    label: 'Anatomy',
    options: GENITALIA_OPTIONS.filter((o) => o.value !== 'prefer_not_to_say').map((o) => o.value),
  },
] as const;
export type MatchingField = (typeof MATCHING_FIELDS)[number]['key'];
export type MatchingRules = Partial<Record<MatchingField, MatchingRule>>;

export interface DatingMatchingSettings {
  user_id?: string;
  dating_enabled: boolean;
  adult_consent_at: string | null;
  active_until: string | null;
  connection_goals: string[];
  offered_practices: string[];
  rules: MatchingRules;
  distance_strength: PreferenceStrength;
  max_distance_km: number | null;
  height_strength: PreferenceStrength;
  min_height_cm: number | null;
  max_height_cm: number | null;
  use_identity: boolean;
  use_interests: boolean;
  use_intimate: boolean;
  use_checklist: boolean;
  use_hanky: boolean;
  use_culture: boolean;
}

export const DEFAULT_MATCHING_SETTINGS: DatingMatchingSettings = {
  dating_enabled: false,
  adult_consent_at: null,
  active_until: null,
  connection_goals: [],
  offered_practices: [],
  rules: {},
  distance_strength: 'any',
  max_distance_km: null,
  height_strength: 'any',
  min_height_cm: null,
  max_height_cm: null,
  use_identity: false,
  use_interests: false,
  use_intimate: false,
  use_checklist: false,
  use_hanky: false,
  use_culture: false,
};

export function matchingSettingsError(settings: DatingMatchingSettings): string | null {
  if (settings.dating_enabled && !settings.adult_consent_at)
    return 'Affirm that you are 18 or older to enable dating discovery.';
  for (const field of MATCHING_FIELDS) {
    const rule = settings.rules[field.key];
    if (rule && rule.strength !== 'any' && !rule.values.length)
      return `Choose at least one option for ${field.label.toLowerCase()}.`;
  }
  if (
    settings.distance_strength !== 'any' &&
    (!settings.max_distance_km || settings.max_distance_km < 1 || settings.max_distance_km > 20000)
  )
    return 'Choose a distance between 1 and 20,000 km.';
  if (
    settings.height_strength !== 'any' &&
    settings.min_height_cm === null &&
    settings.max_height_cm === null
  )
    return 'Choose a minimum or maximum height.';
  if (
    (settings.min_height_cm !== null &&
      (settings.min_height_cm < 50 || settings.min_height_cm > 300)) ||
    (settings.max_height_cm !== null &&
      (settings.max_height_cm < 50 || settings.max_height_cm > 300))
  )
    return 'Height must be between 50 and 300 cm.';
  if (
    settings.min_height_cm !== null &&
    settings.max_height_cm !== null &&
    settings.min_height_cm > settings.max_height_cm
  )
    return 'Minimum height cannot exceed maximum height.';
  return null;
}

export function matchingLabel(value: string): string {
  const labels: Record<string, string> = {
    casual: 'Casual intimacy',
    queerplatonic: 'Queerplatonic connection',
    chosen_family: 'Chosen family',
    condoms_always: 'Condoms required',
    dom: 'Dominant',
    sub: 'Submissive',
    vers: 'Versatile',
    ask_before_touch: 'Ask before touching',
    text_first: 'Text before calling',
    step_free_meetup: 'Meet somewhere step-free',
    quiet_meetup: 'Meet somewhere quiet',
    discreet_contact: 'Keep contact discreet',
    no_public_photos: 'No public photos',
  };
  return labels[value] ?? value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export const MATCHING_QUERY_KEYS = [
  'dating-matching-settings',
  'intimate-discovery',
  'people-discovery',
  'dating-profile',
  'intimate-profile',
  'compatibility',
  'intimate-matches',
] as const;
