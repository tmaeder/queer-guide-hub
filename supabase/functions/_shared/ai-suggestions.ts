// Shared helpers for the ai_suggestions queue (schema in
// 20260429190000_image_assets_and_ai_suggestions.sql).
//
// Consumer: supabase/functions/search-intelligence/index.ts (admin review/approve
// route). The auto-tag-content producer was retired in the 2026-06-10 declutter.
//
// Keep `applySuggestion` byte-compatible with the original copy in
// search-intelligence/index.ts — the route's existing call expectations are
// preserved (throws on validation/DB error, returns false for unsupported
// suggestion_types).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { decodeHtmlEntities } from './news-quality/sanitize.ts'

export type SuggestionType =
  | 'tag'
  | 'synonym'
  | 'alt_text'
  | 'description'
  | 'title'
  | 'cluster_membership'
  | 'category'
  | 'image_replacement'
  | 'translation'
  | 'other'

export type SuggestionStatus =
  | 'pending'
  | 'approved'
  | 'applied'
  | 'rejected'
  | 'superseded'
  | 'expired'

export type SuggestionSource =
  | 'openai'
  | 'anthropic'
  | 'workers-ai'
  | 'rule'
  | 'editor'
  | 'external'

export interface AiSuggestionInsert {
  suggestion_type: SuggestionType
  entity_type: string | null
  entity_id: string | null
  locale?: string | null
  proposed_value: Record<string, unknown>
  current_value?: Record<string, unknown> | null
  source: SuggestionSource
  source_model?: string | null
  source_run_id?: string | null
  prompt_hash?: string | null
  confidence?: number | null
  status?: SuggestionStatus
  reviewer_id?: string | null
  approved_at?: string | null
  expires_at?: string | null
}

export interface AiSuggestionRow extends AiSuggestionInsert {
  id: string
  status: SuggestionStatus
  applied_at: string | null
  rejected_at: string | null
  review_notes: string | null
  created_at: string
  updated_at: string
}

/**
 * Insert a new ai_suggestions row and return the inserted record.
 * Throws on database error so callers can decide whether to swallow or surface.
 */
export async function insertSuggestion(
  client: SupabaseClient,
  row: AiSuggestionInsert,
): Promise<AiSuggestionRow> {
  const { data, error } = await client
    .from('ai_suggestions')
    .insert({
      ...row,
      locale: row.locale ?? null,
      current_value: row.current_value ?? null,
      source_model: row.source_model ?? null,
      source_run_id: row.source_run_id ?? null,
      prompt_hash: row.prompt_hash ?? null,
      confidence: row.confidence ?? null,
      status: row.status ?? 'pending',
      reviewer_id: row.reviewer_id ?? null,
      approved_at: row.approved_at ?? null,
      expires_at: row.expires_at ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(`ai_suggestions insert failed: ${error.message}`)
  return data as AiSuggestionRow
}

/**
 * Apply a suggestion's proposed_value to the live system. Handles the common
 * cases (tag, synonym, cluster_membership, translation). Other suggestion_types
 * require entity-specific writes that are out of scope here — caller marks
 * status as 'approved' with review_notes='manual apply required'.
 *
 * @returns true if the suggestion was applied to the live system,
 *          false if the suggestion_type is unsupported (caller should leave
 *                the row at status='approved' for manual handling).
 * @throws  if validation fails or the underlying DB write errors.
 */
export async function applySuggestion(
  client: SupabaseClient,
  s: {
    suggestion_type: string
    entity_type: string | null
    entity_id: string | null
    locale: string | null
    proposed_value: Record<string, unknown> | unknown
  },
): Promise<boolean> {
  const v = s.proposed_value as Record<string, unknown>
  switch (s.suggestion_type) {
    case 'tag': {
      if (!s.entity_type || !s.entity_id || !v?.tag_id) {
        throw new Error('tag suggestion needs entity_type, entity_id, proposed_value.tag_id')
      }
      const { error } = await client
        .from('unified_tag_assignments')
        .upsert(
          { entity_type: s.entity_type, entity_id: s.entity_id, tag_id: v.tag_id },
          { onConflict: 'entity_type,entity_id,tag_id' },
        )
      if (error) throw new Error(error.message)
      return true
    }
    case 'synonym': {
      const terms = v?.terms as string[] | undefined
      const replacements = v?.replacements as string[] | undefined
      if (!terms || !replacements) {
        throw new Error('synonym suggestion needs terms[] and replacements[]')
      }
      const { error } = await client.from('search_synonyms').insert({
        terms,
        replacements,
        is_one_way: Boolean(v?.is_one_way),
        locale: s.locale ?? '*',
        indexes: (v?.indexes as string[]) ?? [],
        status: 'active',
        source: 'ai-suggested',
      })
      if (error) throw new Error(error.message)
      return true
    }
    case 'cluster_membership': {
      if (!v?.cluster_id || !v?.tag_id) {
        throw new Error('cluster_membership needs proposed_value.cluster_id and tag_id')
      }
      const { error } = await client
        .from('topic_cluster_tags')
        .upsert(
          { cluster_id: v.cluster_id, tag_id: v.tag_id },
          { onConflict: 'cluster_id,tag_id' },
        )
      if (error) throw new Error(error.message)
      return true
    }
    case 'translation': {
      if (!s.entity_type || !s.entity_id || !s.locale) {
        throw new Error('translation suggestion needs entity_type, entity_id, locale')
      }
      const field = v?.field as string | undefined
      const value = v?.value as string | undefined
      if (!field || typeof value !== 'string') {
        throw new Error('translation needs proposed_value.field and string proposed_value.value')
      }
      if (!TRANSLATION_FIELDS[s.entity_type]?.has(field)) {
        throw new Error(`translation: ${s.entity_type} does not support i18n field '${field}'`)
      }
      const i18nCol = `${field}_i18n`
      // Decode any HTML entities the source carried into the translation (e.g.
      // `&#038;`/`&#8217;` from WordPress feeds) so localized text never renders
      // raw entities. Pure decode — preserves the translated wording + newlines.
      const cleanValue = decodeHtmlEntities(value)
      // Read-merge-write the JSONB column. The merge preserves locales the
      // producer didn't touch — we only set the target locale's slot.
      const { data: row, error: readErr } = await client
        .from(s.entity_type)
        .select(i18nCol)
        .eq('id', s.entity_id)
        .single()
      if (readErr) throw new Error(`translation read failed: ${readErr.message}`)
      const current = ((row as Record<string, unknown>)[i18nCol] as Record<string, unknown> | null) ?? {}
      const next = { ...current, [s.locale]: cleanValue }
      const { error: writeErr } = await client
        .from(s.entity_type)
        .update({ [i18nCol]: next, updated_at: new Date().toISOString() })
        .eq('id', s.entity_id)
      if (writeErr) throw new Error(`translation write failed: ${writeErr.message}`)
      return true
    }
    case 'description': {
      // Tag glossary copy backfill. Other entity types are out of scope here.
      if (s.entity_type !== 'unified_tags') return false
      if (!s.entity_id) throw new Error('description suggestion needs entity_id')
      const field = (v?.field as string) ?? 'description'
      const value = v?.value
      if (!TAG_DESCRIPTION_FIELDS.has(field) || typeof value !== 'string') {
        throw new Error(
          'description needs proposed_value.field in {description,short_description,long_description} and string proposed_value.value',
        )
      }
      const { error } = await client
        .from('unified_tags')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', s.entity_id)
      if (error) throw new Error(error.message)
      return true
    }
    case 'image_replacement': {
      if (s.entity_type !== 'unified_tags') return false
      if (!s.entity_id) throw new Error('image_replacement suggestion needs entity_id')
      const url = v?.image_url
      if (typeof url !== 'string' || !url) {
        throw new Error('image_replacement needs proposed_value.image_url')
      }
      const patch: Record<string, unknown> = { image_url: url, updated_at: new Date().toISOString() }
      for (const k of ['image_alt', 'image_source', 'image_attribution', 'image_license']) {
        if (typeof v?.[k] === 'string') patch[k] = v[k]
      }
      const { error } = await client.from('unified_tags').update(patch).eq('id', s.entity_id)
      if (error) throw new Error(error.message)
      return true
    }
    case 'category': {
      // Insert directly into the assignment table (source of truth). We do NOT
      // touch unified_tags.category_id: that fires sync_tag_category_assignment
      // -> unified_tags_recompute_is_adult, which re-enters the same row.
      if (s.entity_type !== 'unified_tags') return false
      if (!s.entity_id || !v?.category_id) {
        throw new Error('category suggestion needs entity_id and proposed_value.category_id')
      }
      const { error } = await client
        .from('tag_category_assignments')
        .upsert(
          { tag_id: s.entity_id, category_id: v.category_id, is_primary: true },
          { onConflict: 'tag_id,category_id' },
        )
      if (error) throw new Error(error.message)
      return true
    }
    default:
      return false
  }
}

/** Plain (non-i18n) tag copy fields a 'description' suggestion may target. */
const TAG_DESCRIPTION_FIELDS = new Set(['description', 'short_description', 'long_description'])

/**
 * Per-entity allowlist of i18n source fields. The corresponding JSONB column
 * is `${field}_i18n` (e.g. 'name' → 'name_i18n'). Mirrors the table in
 * supabase/functions/translate-i18n-batch/index.ts so the apply path stays in
 * sync with the producer's accepted shape.
 */
const TRANSLATION_FIELDS: Record<string, Set<string>> = {
  unified_tags: new Set(['name', 'description']),
  venues: new Set(['name', 'description']),
  personalities: new Set(['name', 'description']),
  queer_villages: new Set(['name', 'description']),
  hotels: new Set(['name', 'description']),
  cities: new Set(['name']),
  countries: new Set(['name']),
  events: new Set(['title', 'description']),
  news_articles: new Set(['title']),
  marketplace_listings: new Set(['title', 'description']),
}
