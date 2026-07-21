import { supabase } from '../supabase'
import { PAGE_SIZE, ROLES_ENABLED } from '../config'
import {
  PERSONALITY_COLUMNS,
  type Cohort,
  type Filters,
  type ListeFilters,
  type Personality,
} from '../types'

export interface PageResult {
  rows: Personality[]
  count: number
}

// Minimal structural view of the PostgREST filter/transform builder covering
// only the chainable methods used here. Every method returns the same shape,
// so reassignment (`q = q.eq(...)`) stays typed without falling back to `any`.
// The builder is also awaitable and resolves to a { data, count, error } row set.
interface PgQuery
  extends PromiseLike<{
    data: Record<string, unknown>[] | null
    count: number | null
    error: { message: string } | null
  }> {
  eq(col: string, val: unknown): PgQuery
  is(col: string, val: unknown): PgQuery
  or(filter: string): PgQuery
  not(col: string, op: string, val: unknown): PgQuery
  ilike(col: string, pattern: string): PgQuery
  order(col: string, opts: { ascending: boolean }): PgQuery
  range(from: number, to: number): PgQuery
}

// Apply a cohort preset's WHERE clauses to a PostgREST query builder.
function applyCohort(q: PgQuery, cohort: Cohort): PgQuery {
  switch (cohort) {
    case 'needs_attention':
      return q.eq('needs_attention', true).is('duplicate_of_id', null)
    case 'review_pending':
      return q.eq('review_status', 'pending').is('duplicate_of_id', null)
    case 'no_image':
      return q.is('image_url', null).is('duplicate_of_id', null)
    case 'no_text':
      return q
        .or('description.is.null,description.eq.')
        .or('bio.is.null,bio.eq.')
        .is('duplicate_of_id', null)
    case 'no_lgbti':
      return q
        .or('lgbti_connection.is.null,lgbti_connection.eq.')
        .is('duplicate_of_id', null)
    case 'no_birth':
      return q.is('birth_date', null).is('duplicate_of_id', null)
    case 'no_profession':
      return q
        .or('profession.is.null,profession.eq.')
        .is('duplicate_of_id', null)
    case 'draft':
      return q.eq('visibility', 'draft').is('duplicate_of_id', null)
    case 'public':
      return q.eq('visibility', 'public').is('duplicate_of_id', null)
    case 'duplicates':
      return q.not('duplicate_of_id', 'is', null)
    case 'all':
    default:
      return q.is('duplicate_of_id', null)
  }
}

// Build + run a filtered, paginated read against personalities (anon read-only).
export async function fetchPersonalities(
  filters: Filters,
  page: number,
): Promise<PageResult> {
  let q = supabase
    .from('personalities')
    .select(PERSONALITY_COLUMNS, { count: 'estimated' }) as unknown as PgQuery

  q = applyCohort(q, filters.cohort)

  const term = filters.search.trim()
  if (term) {
    const safe = term.replace(/[%,()]/g, ' ')
    q = q.or(`name.ilike.%${safe}%,profession.ilike.%${safe}%`)
  }
  // Granular filters layer on top of the cohort.
  if (filters.visibility) q = q.eq('visibility', filters.visibility)
  if (filters.reviewStatus) q = q.eq('review_status', filters.reviewStatus)
  if (filters.needsAttention === 'yes') q = q.eq('needs_attention', true)
  if (filters.needsAttention === 'no') q = q.not('needs_attention', 'is', true)
  if (filters.hasImage === 'yes') q = q.not('image_url', 'is', null)
  if (filters.hasImage === 'no') q = q.is('image_url', null)

  const from = page * PAGE_SIZE
  q = q.order('updated_at', { ascending: false }).range(from, from + PAGE_SIZE - 1)

  const { data, count, error } = await q
  if (error) throw error
  return { rows: (data ?? []) as unknown as Personality[], count: count ?? 0 }
}

// Alphabetical slice of all live persons (for the "Liste" view + More button).
export async function fetchAlpha(
  offset: number,
  limit: number,
  f: ListeFilters,
): Promise<Personality[]> {
  let q = supabase
    .from('personalities')
    .select(PERSONALITY_COLUMNS)
    .is('duplicate_of_id', null) as unknown as PgQuery

  if (f.search.trim()) {
    const safe = f.search.trim().replace(/[%,()]/g, ' ')
    // Freitext trifft Name + Beschreibung + Beruf; bei aktiver Rollen-Spalte
    // zusätzlich Tätigkeit (roles) — als exakter Slug-Contains, damit ein
    // Begriff aus BEIDEN Feldern (Beruf oder Tätigkeit) Treffer liefert.
    const parts = [
      `name.ilike.%${safe}%`,
      `description.ilike.%${safe}%`,
      `profession.ilike.%${safe}%`,
    ]
    if (ROLES_ENABLED) {
      const slug = safe.trim().toLowerCase().replace(/\s+/g, '-')
      if (slug) parts.push(`roles.cs.{${slug}}`)
    }
    q = q.or(parts.join(','))
  }
  if (f.profession.trim())
    q = q.ilike('profession', `%${f.profession.trim().replace(/[%,]/g, ' ')}%`)
  if (f.nationality.trim())
    q = q.ilike('nationality', `%${f.nationality.trim().replace(/[%,]/g, ' ')}%`)
  if (f.visibility) q = q.eq('visibility', f.visibility)
  if (f.reviewStatus) q = q.eq('review_status', f.reviewStatus)

  const { data, error } = await q
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data ?? []) as unknown as Personality[]
}

// Full personality by id (e.g. to edit from Upcoming).
export async function fetchPersonById(id: string): Promise<Personality | null> {
  const { data, error } = await supabase
    .from('personalities')
    .select(PERSONALITY_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as Personality) ?? null
}

// Duplicate pairs from duplicate_of_id (canonical ↔ duplicate) for review.
export interface DupPair {
  left: Personality // canonical (survivor)
  right: Personality // marked duplicate
}
export async function fetchDuplicatePairs(limit = 100): Promise<DupPair[]> {
  const { data: dups, error } = await supabase
    .from('personalities')
    .select(PERSONALITY_COLUMNS)
    .not('duplicate_of_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  const rows = (dups ?? []) as unknown as Personality[]
  const canonIds = [...new Set(rows.map((r) => r.duplicate_of_id).filter(Boolean))] as string[]
  const canon = new Map<string, Personality>()
  for (let i = 0; i < canonIds.length; i += 100) {
    const chunk = canonIds.slice(i, i + 100)
    const { data, error: e } = await supabase.from('personalities').select(PERSONALITY_COLUMNS).in('id', chunk)
    if (e) throw e
    for (const c of (data ?? []) as unknown as Personality[]) canon.set(c.id, c)
  }
  const pairs: DupPair[] = []
  for (const r of rows) {
    const c = r.duplicate_of_id ? canon.get(r.duplicate_of_id) : undefined
    if (c) pairs.push({ left: c, right: r })
  }
  return pairs
}

// Recent additions / to-do lists for the Home activity panel.
export async function fetchRecentPersons(limit = 6): Promise<Personality[]> {
  const { data, error } = await supabase
    .from('personalities')
    .select(PERSONALITY_COLUMNS)
    .is('duplicate_of_id', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as Personality[]
}

export async function fetchAttentionPersons(limit = 6): Promise<Personality[]> {
  const { data, error } = await supabase
    .from('personalities')
    .select(PERSONALITY_COLUMNS)
    .is('duplicate_of_id', null)
    .eq('needs_attention', true)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as Personality[]
}

export interface Country {
  id: string
  name: string
  code: string | null
}

// Reference list of all countries.
export async function fetchCountries(): Promise<Country[]> {
  const { data, error } = await supabase
    .from('countries')
    .select('id,name,code')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Country[]
}

// Per-country live-person counts, aggregated client-side (paginated).
export async function fetchCountryCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('personalities')
      .select('country_id')
      .is('duplicate_of_id', null)
      .not('country_id', 'is', null)
      .range(from, from + page - 1)
    if (error) throw error
    const rows = (data ?? []) as { country_id: string }[]
    for (const r of rows) counts[r.country_id] = (counts[r.country_id] ?? 0) + 1
    if (rows.length < page) break
  }
  return counts
}

// City autocomplete against the queer.guide cities table (anon-readable).
export interface CityHit {
  id: string
  name: string
  country: string | null
  code: string | null
}
export async function searchCities(term: string, limit = 8): Promise<CityHit[]> {
  const t = term.trim()
  if (!t) return []
  const safe = t.replace(/[%,()]/g, ' ')
  const { data, error } = await supabase
    .from('cities')
    .select('id,name,countries(name,code)')
    .is('duplicate_of_id', null)
    .ilike('name', `${safe}%`)
    .order('name', { ascending: true })
    .limit(limit)
  if (error) throw error
  type CityJoinRow = {
    id: string
    name: string
    countries: { name: string | null; code: string | null } | null
  }
  return ((data ?? []) as unknown as CityJoinRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    country: c.countries?.name ?? null,
    code: c.countries?.code ?? null,
  }))
}

// Exact head-count for one cohort (dashboard tiles).
async function cohortCount(cohort: Cohort): Promise<number> {
  let q = supabase
    .from('personalities')
    .select('id', { count: 'exact', head: true }) as unknown as PgQuery
  q = applyCohort(q, cohort)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

export type CohortCounts = Partial<Record<Cohort, number>>

// Fetch all tile counts in parallel.
export async function fetchCohortCounts(cohorts: Cohort[]): Promise<CohortCounts> {
  const entries = await Promise.all(
    cohorts.map(async (c) => [c, await cohortCount(c)] as const),
  )
  return Object.fromEntries(entries)
}
