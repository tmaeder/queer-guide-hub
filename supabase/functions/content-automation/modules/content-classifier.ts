/**
 * content-classifier module — AI-powered LGBTI relevance and sensitivity detection.
 *
 * Processes unclassified content items, runs them through the shared
 * content-classifier, and writes results both as content_flags (for review)
 * and directly to the content table (lgbti_relevance_score, sensitivity_flags).
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import {
  type ModuleConfig, type SharedRefs, type ProposedChange,
  CONTENT_TYPE_CONFIG, getContentName, delay,
} from '../../_shared/automation-utils.ts'
import {
  classifyContent, classificationToFlags,
  type ClassificationInput, type ClassificationResult, type ContentType,
} from '../../_shared/content-classifier.ts'

interface ProcessOpts {
  dryRun: boolean
  contentType?: string
  contentId?: string
  workflowRunId: string | null
  offset?: number
}

interface ProcessResult {
  scanned: number
  changes: ProposedChange[]
  errors: number
}

/**
 * Fetch unclassified items for a content type.
 * Only selects items where classified_at IS NULL (not yet processed).
 */
async function fetchUnclassified(
  supabase: SupabaseClient,
  contentType: string,
  batchSize: number,
  opts?: { contentId?: string; offset?: number },
): Promise<Record<string, unknown>[]> {
  const ctConfig = CONTENT_TYPE_CONFIG[contentType]
  if (!ctConfig) return []

  // Extend select fields to include classification columns
  const selectFields = `${ctConfig.selectFields}, lgbti_relevance_score, sensitivity_flags, classified_at`

  let query = supabase.from(ctConfig.table).select(selectFields)

  if (opts?.contentId) {
    query = query.eq('id', opts.contentId)
  } else {
    query = query.is('classified_at', null)
  }

  const offset = opts?.offset ?? 0
  const { data, error } = await query
    .order('created_at', { ascending: true })
    .range(offset, offset + batchSize - 1)

  if (error) {
    console.error(`[content-classifier] Error fetching ${contentType}: ${error.message}`)
    return []
  }
  return (data || []) as Record<string, unknown>[]
}

/**
 * Build ClassificationInput from a DB row.
 */
function buildInput(item: Record<string, unknown>, contentType: string): ClassificationInput {
  const ctConfig = CONTENT_TYPE_CONFIG[contentType]

  const title = String(item[ctConfig?.nameField || 'name'] || item.title || item.name || 'Unknown')

  const descriptionFields = ['description', 'bio', 'excerpt', 'lgbti_connection', 'content']
  const description = descriptionFields
    .map(f => item[f] ? String(item[f]) : '')
    .filter(Boolean)
    .join(' ')
    .slice(0, 2000)

  const tags = Array.isArray(item.tags) ? item.tags.map(String) : []

  return {
    content_type: contentType as ContentType,
    title,
    description: description || undefined,
    tags: tags.length > 0 ? tags : undefined,
    category: item.category ? String(item.category) : undefined,
    source: item.source_name ? String(item.source_name) : undefined,
    location: [item.city, item.country].filter(Boolean).map(String).join(', ') || undefined,
    country: item.country ? String(item.country) : undefined,
  }
}

export async function processContentClassifier(
  supabase: SupabaseClient,
  config: ModuleConfig,
  _refs: SharedRefs,
  opts: ProcessOpts,
): Promise<ProcessResult> {
  const changes: ProposedChange[] = []
  let scanned = 0
  let errors = 0

  const contentTypes = opts.contentType
    ? [opts.contentType]
    : config.module.content_types

  for (const contentType of contentTypes) {
    const ctConfig = CONTENT_TYPE_CONFIG[contentType]
    if (!ctConfig) continue

    const items = await fetchUnclassified(supabase, contentType, config.module.batch_size, {
      contentId: opts.contentId,
      offset: opts.offset,
    })

    for (const item of items) {
      scanned++
      const contentId = String(item.id)
      const contentName = getContentName(item, ctConfig)

      try {
        const input = buildInput(item, contentType)
        const result = await classifyContent(supabase, input)

        // Write classification result directly to the content table
        if (!opts.dryRun) {
          const { error: updateErr } = await supabase
            .from(ctConfig.table)
            .update({
              lgbti_relevance_score: result.lgbti_relevance_score,
              sensitivity_flags: result.sensitivity_flags.length > 0 ? result.sensitivity_flags : null,
              classified_at: result.classified_at,
            })
            .eq('id', contentId)

          if (updateErr) {
            console.error(`[content-classifier] Update ${contentType}/${contentId} failed: ${updateErr.message}`)
            errors++
          }
        }

        // Convert to content_flags for items that need review
        const flags = classificationToFlags(contentType, contentId, contentName, result, config.module.id)

        // Write flags directly to content_flags table
        if (!opts.dryRun && flags.length > 0) {
          // Check for existing open flags to avoid duplicates
          const { data: existing } = await supabase
            .from('content_flags')
            .select('flag_type')
            .eq('content_id', contentId)
            .eq('module_name', 'content-classifier')
            .eq('status', 'pending')

          const existingTypes = new Set((existing || []).map(e => e.flag_type))
          const newFlags = flags.filter(f => !existingTypes.has(f.flag_type))

          if (newFlags.length > 0) {
            const { error: flagErr } = await supabase
              .from('content_flags')
              .insert(newFlags)

            if (flagErr) {
              console.error(`[content-classifier] Flag insert failed: ${flagErr.message}`)
            }
          }
        }

        // Also produce ProposedChange entries for the automation system tracking
        if (result.lgbti_relevance_score < 0.7 || result.sensitivity_flags.length > 0) {
          changes.push({
            content_type: contentType,
            content_id: contentId,
            content_name: contentName,
            field_name: 'classification_result',
            old_value: null,
            new_value: {
              lgbti_relevance_score: result.lgbti_relevance_score,
              lgbti_relevant: result.lgbti_relevant,
              lgbti_reasoning: result.lgbti_reasoning,
              sensitivity_flags: result.sensitivity_flags,
              review_priority: result.review_priority,
            },
            change_type: 'flag',
            confidence: result.lgbti_relevance_score < 0.5 ? 0.9 : 0.7,
            reasoning: buildChangeReasoning(result),
          })
        }

        // Rate limit: 300ms between AI calls
        await delay(300)
      } catch (err) {
        console.error(`[content-classifier] Error classifying ${contentType}/${contentId}:`, err)
        errors++
      }
    }
  }

  return { scanned, changes, errors }
}

function buildChangeReasoning(result: ClassificationResult): string {
  const parts: string[] = []

  if (result.lgbti_relevance_score < 0.7) {
    parts.push(`Low LGBTI relevance (${(result.lgbti_relevance_score * 100).toFixed(0)}%)`)
  }

  for (const sf of result.sensitivity_flags) {
    parts.push(`${sf.category.toUpperCase()} [${sf.severity}]: ${sf.indicators.slice(0, 3).join(', ')}`)
  }

  if (result.review_priority === 'urgent' || result.review_priority === 'high') {
    parts.push(`Priority: ${result.review_priority}`)
  }

  return parts.join(' | ') || result.lgbti_reasoning
}
