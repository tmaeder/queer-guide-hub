import { ROLES_ENABLED } from './config'

// Shape of a personalities row — the subset we read + display.
// Mirrors the live public.personalities table (Queer.guide).
export interface Personality {
  id: string
  name: string
  slug: string
  pronouns: string | null
  description: string | null
  bio: string | null
  birth_date: string | null
  death_date: string | null
  is_living: boolean | null
  profession: string | null // Beruf (Erwerb) — Freitext
  roles: string[] | null // Tätigkeit(en) (Slugs) — getrennt vom Beruf; nur wenn ROLES_ENABLED
  nationality: string | null
  birth_place: string | null
  death_place: string | null
  cause_of_death: string | null
  image_url: string | null
  website_url: string | null
  wikipedia_url: string | null
  wikidata_qid: string | null
  social_links: unknown | null
  tags: string[] | null
  fields: unknown | null
  achievements: unknown | null
  lgbti_connection: string | null
  lgbti_details: string | null
  visibility: string | null
  review_status: string | null
  verification_status: string | null
  needs_attention: boolean | null
  is_featured: boolean | null
  is_adult: boolean
  quality_score: number | null
  trust_score: number | null
  completeness_score: number | null
  view_count: number | null
  duplicate_of_id: string | null
  created_at: string
  updated_at: string
}

// Blank personality for the "New → manuell" mask (create is v2/read-only).
export function emptyPersonality(): Personality {
  const now = new Date().toISOString()
  return {
    id: '', name: '', slug: '', pronouns: null, description: null, bio: null,
    birth_date: null, death_date: null, is_living: true, profession: null,
    roles: null,
    nationality: null, birth_place: null, death_place: null, cause_of_death: null,
    image_url: null, website_url: null, wikipedia_url: null, wikidata_qid: null,
    social_links: null, tags: null, fields: null, achievements: null,
    lgbti_connection: null, lgbti_details: null,
    visibility: 'draft', review_status: 'pending', verification_status: 'pending',
    needs_attention: null, is_featured: null, is_adult: false, quality_score: null,
    trust_score: null, completeness_score: null, view_count: null,
    duplicate_of_id: null, created_at: now, updated_at: now,
  }
}

// Columns pulled in list/detail queries.
// `roles` is only requested once ROLES_ENABLED — before the migration the
// column doesn't exist and selecting it would 400 the whole query.
export const PERSONALITY_COLUMNS = [
  'id', 'name', 'slug', 'pronouns', 'description', 'bio',
  'birth_date', 'death_date', 'is_living', 'profession', 'nationality',
  'birth_place', 'death_place', 'cause_of_death', 'image_url', 'website_url',
  'wikipedia_url', 'wikidata_qid', 'social_links', 'tags', 'fields',
  'achievements', 'lgbti_connection', 'lgbti_details',
  'visibility', 'review_status', 'verification_status', 'needs_attention',
  'is_featured', 'is_adult', 'quality_score', 'trust_score',
  'completeness_score', 'view_count', 'duplicate_of_id', 'created_at',
  'updated_at',
  ...(ROLES_ENABLED ? ['roles'] : []),
].join(',')

// Check cohorts — quick presets for the "Personen-Check" dashboard.
export type Cohort =
  | 'all'
  | 'needs_attention'
  | 'review_pending'
  | 'no_image'
  | 'no_text'
  | 'no_lgbti'
  | 'no_birth'
  | 'no_profession'
  | 'draft'
  | 'public'
  | 'duplicates'

export interface CohortDef {
  key: Cohort
  label: string
  hint: string
}

export const COHORTS: CohortDef[] = [
  { key: 'all', label: 'Alle (live)', hint: 'ohne Duplikate' },
  { key: 'needs_attention', label: 'Needs attention', hint: 'markiert zur Prüfung' },
  { key: 'review_pending', label: 'Review offen', hint: "review_status = 'pending'" },
  { key: 'no_birth', label: 'Kein Geburtsdatum', hint: 'birth_date leer' },
  { key: 'no_image', label: 'Kein Bild', hint: 'image_url leer' },
  { key: 'no_text', label: 'Kein Text', hint: 'Beschreibung + Bio leer' },
  { key: 'no_lgbti', label: 'Kein LGBTI-Bezug', hint: 'lgbti_connection leer' },
  { key: 'no_profession', label: 'Kein Beruf', hint: 'profession leer' },
  { key: 'draft', label: 'Entwürfe', hint: "visibility = 'draft'" },
  { key: 'public', label: 'Öffentlich', hint: "visibility = 'public'" },
  { key: 'duplicates', label: 'Duplikate', hint: 'duplicate_of_id gesetzt' },
]

export interface Filters {
  search: string
  cohort: Cohort
  visibility: string // '' = any
  reviewStatus: string // '' = any
  needsAttention: 'any' | 'yes' | 'no'
  hasImage: 'any' | 'yes' | 'no'
  hideChecked: boolean // hide locally-checked persons
}

export const EMPTY_FILTERS: Filters = {
  search: '',
  cohort: 'all',
  visibility: '',
  reviewStatus: '',
  needsAttention: 'any',
  hasImage: 'any',
  hideChecked: false,
}

// Allowed values observed in the live DB (for filter dropdowns).
export const VISIBILITY_VALUES = ['public', 'draft', 'private']
export const REVIEW_STATUS_VALUES = [
  'pending', 'manually_verified', 'approved', 'archived',
]
// DB CHECK constraints.
export const VERIFICATION_STATUS_VALUES = ['pending', 'verified', 'disputed']
export const CAUSE_OF_DEATH_VALUES = [
  'natural', 'illness', 'hiv_aids', 'suicide', 'homicide',
  'accident', 'overdose', 'execution', 'unknown', 'other',
]

// Filters for the alphabetical Liste view.
export interface ListeFilters {
  search: string // free text: name / description contains
  profession: string // ilike contains
  nationality: string // ilike contains
  visibility: string // '' = any
  reviewStatus: string // '' = any
}

export const EMPTY_LISTE_FILTERS: ListeFilters = {
  search: '',
  profession: '',
  nationality: '',
  visibility: '',
  reviewStatus: '',
}
