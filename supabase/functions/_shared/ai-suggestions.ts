// Shared helpers for the ai_suggestions queue (schema in
// 20260429190000_image_assets_and_ai_suggestions.sql).
//
// Two consumers:
//   - supabase/functions/search-intelligence/index.ts   (admin review/approve route)
//   - supabase/functions/auto-tag-content/index.ts      (AI tag producer)
//
// Keep `applySuggestion` byte-compatible with the original copy in
// search-intelligence/index.ts — the route's existing call expectations are
// preserved (throws on validation/DB error, returns false for unsupported
// suggestion_types).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

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
 * cases (tag, synonym, cluster_membership). Other suggestion_types require
 * entity-specific writes that are out of scope here — caller marks status as
 * 'approved' with review_notes='manual apply required'.
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
    default:
      return false
  }
}
