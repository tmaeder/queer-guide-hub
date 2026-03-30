/**
 * automation-auto-tagger — Suggests tags using embedding cosine similarity.
 *
 * Uses content_embeddings + tag_embeddings (pgvector BGE-base 768d) to find
 * matching tags. Writes to content_changes for confidence-based approval.
 * No OpenAI calls — pure embedding similarity.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts'
import {
  loadModuleConfig, checkRateLimit, writeChanges, logRun, delay,
  getContentName, CONTENT_TYPE_CONFIG,
  type ProposedChange,
} from '../_shared/automation-utils.ts'

const MODULE_SLUG = 'auto-tagger'

// ── Embedding-based tag matching ────────────────────────────────────────────

interface TagMatch {
  tag_id: string
  tag_name: string
  similarity: number
}

async function findSimilarTags(
  supabase: ReturnType<typeof createClient>,
  contentId: string,
  contentType: string,
  minSimilarity: number,
  maxTags: number,
): Promise<TagMatch[]> {
  // Get content embedding
  const { data: contentEmb } = await supabase
    .from('content_embeddings')
    .select('embedding')
    .eq('content_id', contentId)
    .eq('content_type', contentType)
    .single()

  if (!contentEmb?.embedding) return []

  // Find similar tag embeddings using pgvector cosine distance
  const { data: matches } = await supabase.rpc('match_tag_embeddings', {
    query_embedding: contentEmb.embedding,
    match_threshold: minSimilarity,
    match_count: maxTags,
  })

  if (!matches) return []

  return matches.map((m: { tag_id: string; tag_name: string; similarity: number }) => ({
    tag_id: m.tag_id,
    tag_name: m.tag_name,
    similarity: m.similarity,
  }))
}

// Fallback: use existing get_similar_tags DB function for items without embeddings
async function findTagsBySimilarity(
  supabase: ReturnType<typeof createClient>,
  item: Record<string, unknown>,
  contentType: string,
  maxTags: number,
): Promise<TagMatch[]> {
  // Get existing tag assignments for this item
  const { data: existingAssignments } = await supabase
    .from('unified_tag_assignments')
    .select('tag_id')
    .eq('entity_id', String(item.id))
    .eq('entity_type', contentType)

  if (!existingAssignments?.length) return []

  // For each existing tag, find similar tags that aren't already assigned
  const existingTagIds = new Set(existingAssignments.map(a => a.tag_id))
  const allMatches: TagMatch[] = []

  for (const assignment of existingAssignments.slice(0, 3)) {
    const { data: similar } = await supabase.rpc('get_similar_tags', {
      p_tag_id: assignment.tag_id,
      p_limit: 5,
      p_min_score: 0.75,
    })

    for (const s of similar || []) {
      if (!existingTagIds.has(s.related_tag_id) && !allMatches.some(m => m.tag_id === s.related_tag_id)) {
        allMatches.push({
          tag_id: s.related_tag_id,
          tag_name: s.related_tag_name,
          similarity: s.score,
        })
      }
    }
  }

  return allMatches
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxTags)
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const startTime = Date.now()
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    let payload: Record<string, unknown> = {}
    if (req.method === 'POST') {
      payload = await req.json().catch(() => ({}))
    }

    const config = await loadModuleConfig(supabase, MODULE_SLUG)
    if (!config) return errorResponse('Module disabled or not found', 404)

    const withinLimit = await checkRateLimit(supabase, config.module.id, config.module.rate_limit_per_hour)
    if (!withinLimit) return jsonResponse({ success: false, error: 'Rate limit exceeded' }, 429)

    const moduleConfig = config.module.config as { min_similarity?: number; max_tags_per_item?: number }
    const minSimilarity = moduleConfig.min_similarity ?? 0.7
    const maxTags = moduleConfig.max_tags_per_item ?? 8

    const batchId = crypto.randomUUID()
    const workflowRunId = payload.workflow_run_id as string | null ?? null
    const dryRun = payload.dry_run === true
    const allChanges: ProposedChange[] = []
    let totalScanned = 0
    let totalErrors = 0

    for (const contentType of config.module.content_types) {
      const ctConfig = CONTENT_TYPE_CONFIG[contentType]
      if (!ctConfig) continue

      // Fetch items that have embeddings but may need more tags
      const { data: items, error: fetchErr } = await supabase
        .from(ctConfig.table)
        .select(ctConfig.selectFields)
        .limit(config.module.batch_size)

      if (fetchErr) {
        console.error(`[${MODULE_SLUG}] Error fetching ${contentType}: ${fetchErr.message}`)
        totalErrors++
        continue
      }

      // Get existing tag assignment counts to prioritize under-tagged items
      const itemIds = (items || []).map(i => (i as Record<string, unknown>).id as string)
      const { data: assignments } = await supabase
        .from('unified_tag_assignments')
        .select('entity_id')
        .eq('entity_type', contentType)
        .in('entity_id', itemIds)

      const tagCounts = new Map<string, number>()
      for (const a of assignments || []) {
        tagCounts.set(a.entity_id, (tagCounts.get(a.entity_id) ?? 0) + 1)
      }

      // Sort: items with fewest tags first
      const sortedItems = [...(items || [])].sort((a, b) => {
        const aCount = tagCounts.get((a as Record<string, unknown>).id as string) ?? 0
        const bCount = tagCounts.get((b as Record<string, unknown>).id as string) ?? 0
        return aCount - bCount
      })

      for (const item of sortedItems) {
        totalScanned++
        const itemRecord = item as Record<string, unknown>
        const contentId = String(itemRecord.id)
        const name = getContentName(itemRecord, ctConfig)
        const existingTagCount = tagCounts.get(contentId) ?? 0

        // Skip items that already have many tags
        if (existingTagCount >= maxTags) continue

        try {
          // Try embedding-based matching first
          let matches = await findSimilarTags(supabase, contentId, contentType, minSimilarity, maxTags - existingTagCount)

          // Fallback: find tags similar to existing tags
          if (matches.length === 0) {
            matches = await findTagsBySimilarity(supabase, itemRecord, contentType, maxTags - existingTagCount)
          }

          // Filter out already-assigned tags
          const { data: existing } = await supabase
            .from('unified_tag_assignments')
            .select('tag_id')
            .eq('entity_id', contentId)
            .eq('entity_type', contentType)

          const existingIds = new Set((existing || []).map(e => e.tag_id))
          const newMatches = matches.filter(m => !existingIds.has(m.tag_id))

          for (const match of newMatches) {
            allChanges.push({
              content_type: contentType,
              content_id: contentId,
              content_name: name,
              field_name: 'tags',
              old_value: null,
              new_value: JSON.stringify({ tag_id: match.tag_id, tag_name: match.tag_name }),
              change_type: 'enrich',
              confidence: match.similarity,
              reasoning: `Tag "${match.tag_name}" matches with ${(match.similarity * 100).toFixed(1)}% similarity`,
            })
          }

          // Small delay between items to avoid hammering the DB
          if (totalScanned % 10 === 0) await delay(100)
        } catch (e) {
          console.error(`[${MODULE_SLUG}] Error processing ${contentType}/${contentId}: ${e}`)
          totalErrors++
        }
      }
    }

    let autoApproved = 0
    let pendingReview = 0

    if (!dryRun && allChanges.length > 0) {
      const result = await writeChanges(supabase, config.module, workflowRunId, batchId, allChanges)
      autoApproved = result.autoApproved
      pendingReview = result.pendingReview
    }

    const durationMs = Date.now() - startTime

    if (!dryRun) {
      await logRun(supabase, config.module.id, workflowRunId, {
        items_scanned: totalScanned,
        changes_proposed: allChanges.length,
        changes_auto_approved: autoApproved,
        changes_pending_review: pendingReview,
        errors: totalErrors,
        duration_ms: durationMs,
      })
    }

    console.log(`[${MODULE_SLUG}] Done: scanned=${totalScanned} changes=${allChanges.length} auto=${autoApproved} pending=${pendingReview} ${durationMs}ms`)
    return jsonResponse({
      success: true,
      items_total: totalScanned,
      items_processed: totalScanned - totalErrors,
      items_succeeded: totalScanned - totalErrors,
      items_failed: totalErrors,
      changes_proposed: allChanges.length,
      changes_auto_approved: autoApproved,
      changes_pending_review: pendingReview,
      duration_ms: durationMs,
      batch_id: batchId,
      ...(dryRun ? { dry_run: true } : {}),
    })
  } catch (e) {
    console.error(`[${MODULE_SLUG}] Fatal: ${e}`)
    return errorResponse(e instanceof Error ? e.message : 'Internal error', 500)
  }
})
