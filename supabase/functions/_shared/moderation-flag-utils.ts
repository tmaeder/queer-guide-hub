/**
 * Idempotent moderation flag helpers for automation modules.
 * Creates flags in moderation_flags with structured metadata in suggested_changes.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

export interface AutomationFlagParams {
  content_type: string
  content_id: string
  flag_type: 'REVIEW' | 'DUPLICATE'
  reason: string
  rule_id: string
  rule_name: string
  severity: 'warning' | 'error'
  details: Record<string, unknown>
  suggested_action?: string
  related_event_ids?: string[]
}

/**
 * Batch-load existing OPEN automation flags for idempotency.
 * Returns Set of "content_id:rule_name" keys.
 */
export async function loadExistingAutomationFlags(
  supabase: SupabaseClient,
  contentType: string,
  contentIds: string[],
): Promise<Set<string>> {
  const keys = new Set<string>()
  if (contentIds.length === 0) return keys

  for (let i = 0; i < contentIds.length; i += 200) {
    const chunk = contentIds.slice(i, i + 200)
    const { data } = await supabase
      .from('moderation_flags')
      .select('content_id, suggested_changes')
      .eq('content_type', contentType)
      .eq('status', 'OPEN')
      .eq('source', 'automation')
      .in('content_id', chunk)

    for (const flag of data || []) {
      const sc = flag.suggested_changes as Record<string, unknown> | null
      if (sc?.rule_name) {
        keys.add(`${flag.content_id}:${sc.rule_name}`)
      }
    }
  }
  return keys
}

/**
 * Insert a moderation flag. Caller should check idempotency via loadExistingAutomationFlags first.
 */
export async function upsertModerationFlag(
  supabase: SupabaseClient,
  params: AutomationFlagParams,
): Promise<{ created: boolean; flag_id: string | null }> {
  const { data, error } = await supabase
    .from('moderation_flags')
    .insert({
      content_type: params.content_type,
      content_id: params.content_id,
      flag_type: params.flag_type,
      reason: params.reason,
      source: 'automation',
      status: 'OPEN',
      suggested_changes: {
        rule_id: params.rule_id,
        rule_name: params.rule_name,
        severity: params.severity,
        details: params.details,
        suggested_action: params.suggested_action ?? 'review',
        related_event_ids: params.related_event_ids ?? [],
      },
    })
    .select('id')
    .single()

  if (error) {
    console.error(`[moderation-flag] Insert failed: ${error.message}`)
    return { created: false, flag_id: null }
  }

  return { created: true, flag_id: data.id }
}
