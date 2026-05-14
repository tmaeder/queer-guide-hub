/**
 * Shared utilities for all automation pipeline edge functions.
 * Provides module config loading, rate limiting, change writing, and run logging.
 *
 * Used by both the unified content-automation function and legacy individual functions.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { applySuggestion, insertSuggestion } from './ai-suggestions.ts'

// ── Types ───────────────────────────────────────────────────────────────────────

export interface AutomationModule {
  id: string
  slug: string
  display_name: string
  module_type: string
  content_types: string[]
  is_enabled: boolean
  auto_approve_threshold: number
  batch_size: number
  rate_limit_per_hour: number
  config: Record<string, unknown>
  workflow_definition_id: string | null
}

export interface AutomationRule {
  id: string
  module_id: string
  name: string
  description: string | null
  content_type: string
  field_name: string
  rule_type: string
  rule_config: Record<string, unknown>
  severity: string
  is_enabled: boolean
  auto_fix: boolean
  sort_order: number
}

/**
 * Review action classification for proposed changes:
 * - auto_correct: Safe to apply automatically (deterministic fix, high confidence)
 * - needs_review: Requires human verification (ambiguous, medium confidence)
 * - clearly_wrong: Definitively invalid content that should be blocked/removed
 * - info_only: Low confidence observation, informational only
 */
export type ReviewAction = 'auto_correct' | 'needs_review' | 'clearly_wrong' | 'info_only'

export interface ProposedChange {
  content_type: string
  content_id: string
  content_name: string
  field_name: string
  old_value: unknown
  new_value: unknown
  /** Change type: update, normalize, sanitize, enrich, flag */
  change_type: string
  /** Confidence score 0.0-1.0 */
  confidence: number
  /** Human-readable explanation */
  reasoning: string
  rule_id?: string
  /** Recommended review action (derived from confidence + change_type if not set) */
  review_action?: ReviewAction
}

/** Derive review action from a proposed change if not explicitly set. */
export function deriveReviewAction(change: ProposedChange, autoApproveThreshold: number): ReviewAction {
  if (change.review_action) return change.review_action
  if (change.change_type === 'flag') return change.confidence >= 0.85 ? 'clearly_wrong' : 'needs_review'
  if (change.confidence >= autoApproveThreshold) return 'auto_correct'
  if (change.confidence >= 0.55) return 'needs_review'
  return 'info_only'
}

export interface PipelineResult {
  success: boolean
  items_total: number
  items_processed: number
  items_succeeded: number
  items_failed: number
  changes_proposed: number
  changes_auto_approved: number
  changes_pending_review: number
  errors: string[]
}

export interface ContentTypeConfig {
  table: string
  nameField: string
  selectFields: string
  textFields: string[]
}

/** Config loaded for a module — module row + its enabled rules */
export interface ModuleConfig {
  module: AutomationModule
  rules: AutomationRule[]
}

/** Shared reference data loaded once and reused across modules */
export interface SharedRefs {
  countryByName: Map<string, CountryRef>
  countryByCode: Map<string, CountryRef>
  countryById: Map<string, CountryRef>
  citiesByName: Map<string, CityRef[]>
  cityAliases: Map<string, string>
}

export interface CountryRef { id: string; name: string; code: string }
export interface CityRef { id: string; name: string; country_id: string }

/** Canonical country alias map — shared by geo-enricher + data-normalizer */
export const COUNTRY_ALIASES: Record<string, string> = {
  'us': 'United States', 'usa': 'United States', 'u.s.': 'United States', 'u.s.a.': 'United States',
  'united states of america': 'United States', 'america': 'United States',
  'gb': 'United Kingdom', 'uk': 'United Kingdom', 'u.k.': 'United Kingdom',
  'great britain': 'United Kingdom', 'england': 'United Kingdom', 'scotland': 'United Kingdom',
  'wales': 'United Kingdom', 'britain': 'United Kingdom',
  'de': 'Germany', 'deutschland': 'Germany', 'alemania': 'Germany', 'allemagne': 'Germany',
  'fr': 'France', 'es': 'Spain', 'españa': 'Spain', 'espana': 'Spain',
  'it': 'Italy', 'italia': 'Italy',
  'nl': 'Netherlands', 'holland': 'Netherlands', 'the netherlands': 'Netherlands', 'nederland': 'Netherlands',
  'ch': 'Switzerland', 'schweiz': 'Switzerland', 'suisse': 'Switzerland', 'svizzera': 'Switzerland',
  'at': 'Austria', 'österreich': 'Austria', 'osterreich': 'Austria',
  'au': 'Australia', 'ca': 'Canada', 'br': 'Brazil', 'brasil': 'Brazil',
  'mx': 'Mexico', 'méxico': 'Mexico', 'jp': 'Japan',
  'za': 'South Africa', 'nz': 'New Zealand', 'il': 'Israel',
  'th': 'Thailand', 'pt': 'Portugal', 'be': 'Belgium',
  'se': 'Sweden', 'dk': 'Denmark', 'no': 'Norway', 'fi': 'Finland',
  'ie': 'Ireland', 'cz': 'Czech Republic', 'czechia': 'Czech Republic',
  'tw': 'Taiwan', 'ar': 'Argentina', 'co': 'Colombia',
  'in': 'India', 'cn': 'China', 'kr': 'South Korea', 'ru': 'Russia',
  'tr': 'Turkey', 'türkiye': 'Turkey', 'türkei': 'Turkey', 'turkei': 'Turkey', 'turkiye': 'Turkey',
  'gr': 'Greece', 'pl': 'Poland', 'česko': 'Czech Republic', 'cesko': 'Czech Republic',
  // Demonyms
  'american': 'United States', 'british': 'United Kingdom', 'english': 'United Kingdom',
  'german': 'Germany', 'french': 'France', 'spanish': 'Spain',
  'italian': 'Italy', 'dutch': 'Netherlands', 'swiss': 'Switzerland',
  'austrian': 'Austria', 'australian': 'Australia', 'canadian': 'Canada',
  'brazilian': 'Brazil', 'mexican': 'Mexico', 'japanese': 'Japan',
  'south african': 'South Africa', 'israeli': 'Israel', 'thai': 'Thailand',
  'portuguese': 'Portugal', 'belgian': 'Belgium', 'swedish': 'Sweden',
  'danish': 'Denmark', 'norwegian': 'Norway', 'finnish': 'Finland',
  'irish': 'Ireland', 'czech': 'Czech Republic', 'taiwanese': 'Taiwan',
  'argentinian': 'Argentina', 'colombian': 'Colombia', 'indian': 'India',
  'chinese': 'China', 'korean': 'South Korea', 'russian': 'Russia',
  'turkish': 'Turkey', 'greek': 'Greece', 'polish': 'Poland',
  'filipino': 'Philippines', 'nigerian': 'Nigeria', 'kenyan': 'Kenya',
  'egyptian': 'Egypt', 'moroccan': 'Morocco', 'lebanese': 'Lebanon',
  'jamaican': 'Jamaica', 'cuban': 'Cuba',
}

// ── Content Type Registry ───────────────────────────────────────────────────────

export const CONTENT_TYPE_CONFIG: Record<string, ContentTypeConfig> = {
  venues: {
    table: 'venues',
    nameField: 'name',
    selectFields: 'id, name, description, category, website, city, country, address, phone, email, featured, foursquare_rating, city_id, country_id, latitude, longitude, state, postal_code, queer_village_id',
    textFields: ['name', 'description', 'category', 'city', 'country', 'address'],
  },
  events: {
    table: 'events',
    nameField: 'title',
    selectFields: 'id, title, description, event_type, venue_name, venue_id, city, country, website, start_date, end_date, timezone, address, latitude, longitude, city_id, country_id, status, queer_village_id',
    textFields: ['title', 'description', 'event_type', 'venue_name', 'city', 'country'],
  },
  personalities: {
    table: 'personalities',
    nameField: 'name',
    selectFields: 'id, name, bio, profession, lgbti_connection, nationality, birth_place, city_id, country_id',
    textFields: ['name', 'bio', 'profession', 'lgbti_connection', 'nationality'],
  },
  news_articles: {
    table: 'news_articles',
    nameField: 'title',
    selectFields: 'id, title, excerpt, url, category, is_featured',
    textFields: ['title', 'excerpt', 'category'],
  },
  cities: {
    table: 'cities',
    nameField: 'name',
    selectFields: 'id, name, description, country_id',
    textFields: ['name', 'description'],
  },
  countries: {
    table: 'countries',
    nameField: 'name',
    selectFields: 'id, name, description, code',
    textFields: ['name', 'description'],
  },
  hotels: {
    table: 'hotels',
    nameField: 'name',
    selectFields: 'id, name, description, website, city, country, address, latitude, longitude, city_id, country_id, queer_village_id',
    textFields: ['name', 'description', 'city', 'country'],
  },
}

// ── Module Config ───────────────────────────────────────────────────────────────

export async function loadModuleConfig(
  supabase: SupabaseClient,
  moduleSlug: string
): Promise<{ module: AutomationModule; rules: AutomationRule[] } | null> {
  const { data: module, error: modErr } = await supabase
    .from('automation_modules')
    .select('*')
    .eq('slug', moduleSlug)
    .eq('is_enabled', true)
    .single()

  if (modErr || !module) return null

  const { data: rules } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('module_id', module.id)
    .eq('is_enabled', true)
    .order('sort_order')

  return { module: module as AutomationModule, rules: (rules || []) as AutomationRule[] }
}

// ── Rate Limiting ───────────────────────────────────────────────────────────────

export async function checkRateLimit(
  supabase: SupabaseClient,
  moduleId: string,
  limitPerHour: number
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString()
  const { count } = await supabase
    .from('automation_run_log')
    .select('*', { count: 'exact', head: true })
    .eq('module_id', moduleId)
    .gte('created_at', oneHourAgo)

  return (count ?? 0) < limitPerHour
}

// ── Tag-suggestion routing ──────────────────────────────────────────────────
//
// Tag proposals (field_name='tags') used to flow through content_changes, but
// the generic apply_content_change RPC can't handle them — entity tables have
// no `tags` column, the M:N lives in unified_tag_assignments. Route them
// through ai_suggestions instead, mirroring auto-tag-content (PR 5).
//
// Auto-apply for high-confidence rows uses the shared applySuggestion helper.
// Idempotency is enforced by the partial unique index added in PR 5
// (ai_suggestions_tag_idempotency_idx); we still select-first to avoid the
// noisy 23505 on retries.

async function routeTagsToAiSuggestions(
  supabase: SupabaseClient,
  module: AutomationModule,
  batchId: string,
  tagChanges: ProposedChange[],
): Promise<{ autoApproved: number; pendingReview: number }> {
  let autoApproved = 0
  let pendingReview = 0

  for (const c of tagChanges) {
    let parsed: { tag_id?: string }
    try {
      parsed = typeof c.new_value === 'string'
        ? JSON.parse(c.new_value)
        : (c.new_value as { tag_id?: string })
    } catch {
      continue
    }
    if (!parsed?.tag_id) continue

    const isHighConf = c.confidence >= module.auto_approve_threshold
    const nowIso = new Date().toISOString()

    const { data: existing } = await supabase
      .from('ai_suggestions')
      .select('id')
      .eq('suggestion_type', 'tag')
      .eq('entity_type', c.content_type)
      .eq('entity_id', c.content_id)
      .eq('proposed_value->>tag_id', parsed.tag_id)
      .in('status', ['pending', 'approved'])
      .maybeSingle()
    if (existing) continue

    let inserted
    try {
      inserted = await insertSuggestion(supabase, {
        suggestion_type: 'tag',
        entity_type: c.content_type,
        entity_id: c.content_id,
        proposed_value: { tag_id: parsed.tag_id },
        source: 'workers-ai',
        source_model: 'tag-similarity-bge-base-768',
        source_run_id: batchId,
        confidence: c.confidence,
        status: isHighConf ? 'approved' : 'pending',
        approved_at: isHighConf ? nowIso : null,
        reviewer_id: null,
      })
    } catch (err) {
      console.error(
        `[automation] ai_suggestions insert failed for ${c.content_type}/${c.content_id}: ${(err as Error).message}`,
      )
      continue
    }

    if (!isHighConf) {
      pendingReview++
      continue
    }

    try {
      const ok = await applySuggestion(supabase, inserted)
      if (ok) {
        await supabase
          .from('ai_suggestions')
          .update({ status: 'applied', applied_at: nowIso })
          .eq('id', inserted.id)
        autoApproved++
      } else {
        pendingReview++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown apply error'
      await supabase
        .from('ai_suggestions')
        .update({ review_notes: `auto-apply failed: ${msg}` })
        .eq('id', inserted.id)
      pendingReview++
    }
  }

  return { autoApproved, pendingReview }
}

// ── Write Changes ───────────────────────────────────────────────────────────────

export async function writeChanges(
  supabase: SupabaseClient,
  module: AutomationModule,
  workflowRunId: string | null,
  batchId: string,
  changes: ProposedChange[]
): Promise<{ autoApproved: number; pendingReview: number }> {
  if (changes.length === 0) return { autoApproved: 0, pendingReview: 0 }

  // Filter out any changes with null/undefined new_value (DB column is NOT NULL)
  const valid = changes.filter(c => c.new_value != null)
  if (valid.length === 0) return { autoApproved: 0, pendingReview: 0 }

  let autoApproved = 0
  let pendingReview = 0

  // Tag proposals route through ai_suggestions instead of content_changes.
  const tagChanges = valid.filter(c => c.field_name === 'tags')
  const otherChanges = valid.filter(c => c.field_name !== 'tags')
  if (tagChanges.length > 0) {
    const r = await routeTagsToAiSuggestions(supabase, module, batchId, tagChanges)
    autoApproved += r.autoApproved
    pendingReview += r.pendingReview
  }

  const rows = otherChanges.map(c => ({
    module_id: module.id,
    rule_id: c.rule_id || null,
    workflow_run_id: workflowRunId,
    content_type: c.content_type,
    content_id: c.content_id,
    content_name: c.content_name,
    field_name: c.field_name,
    old_value: c.old_value ?? null,
    new_value: c.new_value,
    change_type: c.change_type,
    confidence: c.confidence,
    reasoning: c.reasoning,
    status: c.confidence >= module.auto_approve_threshold ? 'auto_approved' : 'pending',
    batch_id: batchId,
  }))

  // Insert in chunks of 50 to avoid payload limits
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50)
    const { data: inserted, error } = await supabase
      .from('content_changes')
      .insert(chunk)
      .select('id, status')

    if (error) {
      console.error(`[automation] Failed to insert content_changes chunk: ${error.message}`)
      continue
    }

    for (const row of inserted || []) {
      if (row.status === 'auto_approved') {
        const { data: applied } = await supabase.rpc('apply_content_change', { p_change_id: row.id })
        if (applied) autoApproved++
        else pendingReview++
      } else {
        pendingReview++
      }
    }
  }

  return { autoApproved, pendingReview }
}

// ── Run Logging ─────────────────────────────────────────────────────────────────

export async function logRun(
  supabase: SupabaseClient,
  moduleId: string,
  workflowRunId: string | null,
  stats: {
    content_type?: string
    items_scanned: number
    changes_proposed: number
    changes_auto_approved: number
    changes_pending_review: number
    errors: number
    duration_ms: number
  }
): Promise<void> {
  await supabase.from('automation_run_log').insert({
    module_id: moduleId,
    workflow_run_id: workflowRunId,
    ...stats,
  })

  // Update module last_run info + increment counters
  await supabase
    .from('automation_modules')
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: stats.errors > 0 ? 'partial' : 'success',
    })
    .eq('id', moduleId)

  await supabase.rpc('increment_automation_counters', {
    p_module_id: moduleId,
    p_runs: 1,
    p_proposed: stats.changes_proposed,
    p_applied: stats.changes_auto_approved,
  }) /* ignore if RPC not available yet */
}

// ── Batch Write Changes (replaces N+1 apply_content_change calls) ───────────

export async function writeChangesBatch(
  supabase: SupabaseClient,
  module: AutomationModule,
  workflowRunId: string | null,
  batchId: string,
  changes: ProposedChange[]
): Promise<{ autoApproved: number; pendingReview: number }> {
  if (changes.length === 0) return { autoApproved: 0, pendingReview: 0 }

  // Dedup: skip changes already pending/auto_approved for the same item+field+rule.
  // Tag proposals are deduped separately in the auto-tagger via pending tagCounts.
  const nonTagIds = [...new Set(changes.filter(c => c.field_name !== 'tags').map(c => c.content_id))]
  if (nonTagIds.length > 0) {
    const { data: existing } = await supabase
      .from('content_changes')
      .select('content_id, field_name, rule_id')
      .eq('module_id', module.id)
      .in('content_id', nonTagIds)
      .in('status', ['pending', 'auto_approved'])
      .not('field_name', 'eq', 'tags')
    if (existing?.length) {
      const pendingKeys = new Set(existing.map(e => `${e.content_id}:${e.field_name}:${e.rule_id ?? ''}`))
      changes = changes.filter(c =>
        c.field_name === 'tags' ||
        !pendingKeys.has(`${c.content_id}:${c.field_name}:${c.rule_id ?? ''}`)
      )
      if (changes.length === 0) return { autoApproved: 0, pendingReview: 0 }
    }
  }

  // Filter out any changes with null/undefined new_value (DB column is NOT NULL)
  const valid = changes.filter(c => c.new_value != null)
  if (valid.length === 0) return { autoApproved: 0, pendingReview: 0 }

  let autoApproved = 0
  let pendingReview = 0

  // Tag proposals route through ai_suggestions instead of content_changes.
  const tagChanges = valid.filter(c => c.field_name === 'tags')
  const otherChanges = valid.filter(c => c.field_name !== 'tags')
  if (tagChanges.length > 0) {
    const r = await routeTagsToAiSuggestions(supabase, module, batchId, tagChanges)
    autoApproved += r.autoApproved
    pendingReview += r.pendingReview
  }

  if (otherChanges.length === 0) {
    return { autoApproved, pendingReview }
  }

  const rows = otherChanges.map(c => ({
    module_id: module.id,
    rule_id: c.rule_id || null,
    workflow_run_id: workflowRunId,
    content_type: c.content_type,
    content_id: c.content_id,
    content_name: c.content_name,
    field_name: c.field_name,
    old_value: c.old_value ?? null,
    new_value: c.new_value,
    change_type: c.change_type,
    confidence: c.confidence,
    reasoning: c.reasoning,
    status: c.confidence >= module.auto_approve_threshold ? 'auto_approved' : 'pending',
    batch_id: batchId,
  }))

  // Insert in chunks of 100
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    const { error } = await supabase.from('content_changes').insert(chunk)

    if (error) {
      // 23505 = unique_violation — concurrent duplicate insert, safe to skip
      if (error.code === '23505') {
        console.log(`[automation] Skipped ${chunk.length} duplicate changes (concurrent insert)`)
        continue
      }
      console.error(`[automation] Insert content_changes failed: code=${error.code} message=${error.message} hint=${error.hint} details=${error.details}`)
      throw new Error(`content_changes insert: [${error.code}] ${error.message}${error.hint ? ' — ' + error.hint : ''}`)
    }
  }

  // Batch-apply all auto_approved changes for this batch in one RPC call.
  // (Tag rows live in ai_suggestions and were already applied inline above.)
  let cAutoApproved = 0
  const { data: applied, error: applyErr } = await supabase.rpc('bulk_apply_batch_changes', {
    p_batch_id: batchId,
  })

  if (!applyErr && applied != null) {
    cAutoApproved = Number(applied) || 0
  } else {
    if (applyErr) console.error(`[automation] bulk_apply_batch_changes error: ${applyErr.message}`)
    const { count: autoCount } = await supabase
      .from('content_changes')
      .select('*', { count: 'exact', head: true })
      .eq('batch_id', batchId)
      .eq('status', 'auto_approved')
    cAutoApproved = autoCount ?? 0
  }

  const { count: pendingCount } = await supabase
    .from('content_changes')
    .select('*', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .eq('status', 'pending')

  autoApproved += cAutoApproved
  pendingReview += pendingCount ?? 0

  return { autoApproved, pendingReview }
}

// ── Shared Reference Data (loaded once, shared across modules) ──────────────

export async function loadSharedReferenceData(supabase: SupabaseClient): Promise<SharedRefs> {
  const [countriesRes, citiesRes, aliasesRes] = await Promise.all([
    supabase.from('countries').select('id, name, code').order('name'),
    supabase.from('cities').select('id, name, country_id').order('population', { ascending: false, nullsFirst: false }),
    supabase.from('city_aliases').select('alias, city_id'),
  ])

  const countryByName = new Map<string, CountryRef>()
  const countryByCode = new Map<string, CountryRef>()
  const countryById = new Map<string, CountryRef>()
  for (const c of countriesRes.data || []) {
    const ref = c as CountryRef
    countryByName.set(ref.name.toLowerCase(), ref)
    if (ref.code) countryByCode.set(ref.code.toLowerCase(), ref)
    countryById.set(ref.id, ref)
  }

  const citiesByName = new Map<string, CityRef[]>()
  for (const city of citiesRes.data || []) {
    const ref = city as CityRef
    const key = ref.name.toLowerCase()
    if (!citiesByName.has(key)) citiesByName.set(key, [])
    citiesByName.get(key)!.push(ref)
  }

  const cityAliases = new Map<string, string>()
  for (const a of aliasesRes.data || []) {
    for (const [name, citiesArr] of citiesByName) {
      if (citiesArr.some(c => c.id === (a as { city_id: string }).city_id)) {
        cityAliases.set((a as { alias: string }).alias.toLowerCase(), name)
        break
      }
    }
  }

  return { countryByName, countryByCode, countryById, citiesByName, cityAliases }
}

// ── Geo resolution helpers (shared by geo-enricher + data-normalizer) ───────

export function resolveCountry(text: string | null | undefined, refs: SharedRefs): CountryRef | null {
  if (!text?.trim()) return null
  const normalized = text.trim().toLowerCase()
  const aliasName = COUNTRY_ALIASES[normalized]
  if (aliasName) {
    const match = refs.countryByName.get(aliasName.toLowerCase())
    if (match) return match
  }
  const nameMatch = refs.countryByName.get(normalized)
  if (nameMatch) return nameMatch
  const codeMatch = refs.countryByCode.get(normalized)
  if (codeMatch) return codeMatch
  return null
}

export function resolveCity(text: string | null | undefined, countryId: string | null | undefined, refs: SharedRefs): CityRef | null {
  if (!text?.trim()) return null
  let normalized = text.trim().toLowerCase()
  const aliasTarget = refs.cityAliases.get(normalized)
  if (aliasTarget) normalized = aliasTarget
  const candidates = refs.citiesByName.get(normalized)
  if (!candidates?.length) return null
  if (countryId) {
    const inCountry = candidates.find(c => c.country_id === countryId)
    if (inCountry) return inCountry
  }
  return candidates[0]
}

/** Fetch items for a content type, optionally filtering to only unprocessed items */
export async function fetchBatch(
  supabase: SupabaseClient,
  contentType: string,
  batchSize: number,
  opts?: { contentId?: string; contentTypeFilter?: string; filterUnlinkedGeo?: boolean; offset?: number },
): Promise<Record<string, unknown>[]> {
  const ctConfig = CONTENT_TYPE_CONFIG[contentType]
  if (!ctConfig) return []

  let query = supabase.from(ctConfig.table).select(ctConfig.selectFields)

  if (opts?.contentId) {
    query = query.eq('id', opts.contentId)
  }

  if (opts?.filterUnlinkedGeo) {
    const geoFields: Record<string, string[]> = {
      venues: ['country_id', 'city_id'],
      events: ['country_id', 'city_id'],
      personalities: ['country_id', 'city_id'],
    }
    const fields = geoFields[contentType]
    if (fields) {
      query = query.or(fields.map(f => `${f}.is.null`).join(','))
    }
  }

  const offset = opts?.offset ?? 0
  const { data, error } = await query.range(offset, offset + batchSize - 1)
  if (error) {
    console.error(`[automation] Error fetching ${contentType}: ${error.message}`)
    return []
  }
  return (data || []) as Record<string, unknown>[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function getContentName(item: Record<string, unknown>, config: ContentTypeConfig): string {
  return String(item[config.nameField] || 'Unknown').slice(0, 100)
}
