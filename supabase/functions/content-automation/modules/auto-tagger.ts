/**
 * Auto Tagger — Suggests tags using embedding cosine similarity.
 *
 * Primary path: batch_match_tag_embeddings (single SQL query per content type).
 * Fallback path: tag_relationships (pre-computed similarity, single batch query).
 * No per-item DB loops — all queries are batched.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import {
  getContentName, CONTENT_TYPE_CONFIG,
  type ModuleConfig, type SharedRefs, type ProposedChange,
} from '../../_shared/automation-utils.ts'

interface TagMatch {
  tag_id: string
  tag_name: string
  similarity: number
}

/** Maps automation content_type keys to content_embeddings.content_type values */
const EMBEDDING_TYPE: Record<string, string> = {
  venues: 'venue',
  events: 'event',
  personalities: 'personality',
  news_articles: 'news',
}

/** Single SQL query: finds top-N similar tags for all items at once via pgvector */
async function batchFindByEmbedding(
  supabase: SupabaseClient,
  itemIds: string[],
  contentType: string,
  minSimilarity: number,
  maxTags: number,
): Promise<Map<string, TagMatch[]>> {
  if (itemIds.length === 0) return new Map()

  const { data, error } = await supabase.rpc('batch_match_tag_embeddings', {
    p_content_type: EMBEDDING_TYPE[contentType] ?? contentType,
    p_content_ids: itemIds,
    p_match_threshold: minSimilarity,
    p_match_count: maxTags,
  })

  if (error || !data) return new Map()

  const result = new Map<string, TagMatch[]>()
  for (const row of data as { content_id: string; tag_id: string; tag_name: string; similarity: number }[]) {
    if (!result.has(row.content_id)) result.set(row.content_id, [])
    result.get(row.content_id)!.push({ tag_id: row.tag_id, tag_name: row.tag_name, similarity: row.similarity })
  }
  return result
}

/**
 * Single batch query via tag_relationships for items that had no embedding matches.
 * Queries tag_relationships for all existing tag IDs at once, maps back to items.
 */
async function batchFindByTagRelationships(
  supabase: SupabaseClient,
  itemIds: string[],
  existingTagsByItem: Map<string, Set<string>>,
  minSimilarity: number,
): Promise<Map<string, TagMatch[]>> {
  // Collect all existing tag IDs across items that have at least one tag
  const tagToItems = new Map<string, string[]>() // tagId → list of contentIds that have it
  for (const contentId of itemIds) {
    for (const tagId of existingTagsByItem.get(contentId) ?? []) {
      if (!tagToItems.has(tagId)) tagToItems.set(tagId, [])
      tagToItems.get(tagId)!.push(contentId)
    }
  }
  if (tagToItems.size === 0) return new Map()

  const existingTagIds = [...tagToItems.keys()].slice(0, 50) // limit to 50 tag IDs

  // Single batch query to tag_relationships
  const { data: rels } = await supabase
    .from('tag_relationships')
    .select('tag1_id, tag2_id, similarity_score')
    .or(`tag1_id.in.(${existingTagIds.join(',')}),tag2_id.in.(${existingTagIds.join(',')})`)
    .gte('similarity_score', minSimilarity)
    .order('similarity_score', { ascending: false })
    .limit(500)

  if (!rels?.length) return new Map()

  // Fetch tag names for the related tags
  const relatedTagIds = new Set<string>()
  for (const rel of rels) {
    const related = existingTagIds.includes(rel.tag1_id) ? rel.tag2_id : rel.tag1_id
    relatedTagIds.add(related)
  }

  const { data: tagNames } = await supabase
    .from('unified_tags')
    .select('id, name')
    .in('id', [...relatedTagIds])
    .eq('status', 'active')

  const tagNameMap = new Map((tagNames ?? []).map(t => [t.id, t.name]))

  // Map results back to items
  const result = new Map<string, TagMatch[]>()
  for (const rel of rels) {
    const sourceTagId = existingTagIds.includes(rel.tag1_id) ? rel.tag1_id : rel.tag2_id
    const relatedTagId = existingTagIds.includes(rel.tag1_id) ? rel.tag2_id : rel.tag1_id
    const tagName = tagNameMap.get(relatedTagId)
    if (!tagName) continue

    for (const contentId of tagToItems.get(sourceTagId) ?? []) {
      if (!result.has(contentId)) result.set(contentId, [])
      const existing = result.get(contentId)!
      if (!existing.some(m => m.tag_id === relatedTagId)) {
        existing.push({ tag_id: relatedTagId, tag_name: tagName, similarity: rel.similarity_score })
      }
    }
  }
  return result
}

export async function processAutoTagger(
  supabase: SupabaseClient,
  config: ModuleConfig,
  _refs: SharedRefs,
  opts: { dryRun: boolean; contentType?: string; contentId?: string; offset?: number },
): Promise<{ scanned: number; changes: ProposedChange[]; errors: number }> {
  const moduleConfig = config.module.config as { min_similarity?: number; max_tags_per_item?: number }
  const minSimilarity = moduleConfig.min_similarity ?? 0.60
  const maxTags = moduleConfig.max_tags_per_item ?? 8

  const allChanges: ProposedChange[] = []
  let totalScanned = 0, totalErrors = 0

  const contentTypes = opts.contentType
    ? config.module.content_types.filter(ct => ct === opts.contentType)
    : config.module.content_types

  for (const contentType of contentTypes) {
    const ctConfig = CONTENT_TYPE_CONFIG[contentType]
    if (!ctConfig) continue

    // Fetch items
    const offset = opts.offset ?? 0
    const { data: items, error: fetchErr } = await supabase
      .from(ctConfig.table)
      .select(ctConfig.selectFields)
      .range(offset, offset + config.module.batch_size - 1)

    if (fetchErr || !items?.length) {
      if (fetchErr) {
        console.error(`[auto-tagger] Error fetching ${contentType}: ${fetchErr.message}`)
        totalErrors++
      }
      continue
    }

    const itemIds = items.map(i => (i as Record<string, unknown>).id as string)

    // Batch-fetch existing tag assignments (single query)
    const { data: assignments } = await supabase
      .from('unified_tag_assignments')
      .select('entity_id, tag_id')
      .eq('entity_type', contentType)
      .in('entity_id', itemIds)

    const tagCounts = new Map<string, number>()
    const existingTagsByItem = new Map<string, Set<string>>()
    for (const a of assignments || []) {
      tagCounts.set(a.entity_id, (tagCounts.get(a.entity_id) ?? 0) + 1)
      if (!existingTagsByItem.has(a.entity_id)) existingTagsByItem.set(a.entity_id, new Set())
      existingTagsByItem.get(a.entity_id)!.add(a.tag_id)
    }

    // Count already-pending proposals toward the tag budget to avoid re-proposing
    const { data: pendingTags } = await supabase
      .from('content_changes')
      .select('content_id')
      .eq('module_id', config.module.id)
      .in('content_id', itemIds)
      .eq('field_name', 'tags')
      .in('status', ['pending', 'auto_approved'])
    for (const pt of pendingTags || []) {
      tagCounts.set(pt.content_id, (tagCounts.get(pt.content_id) ?? 0) + 1)
    }

    // Items that still need more tags
    const needsTags = itemIds.filter(id => (tagCounts.get(id) ?? 0) < maxTags)
    if (needsTags.length === 0) continue

    // PRIMARY: batch embedding similarity (single SQL query via pgvector)
    const embeddingMatches = await batchFindByEmbedding(supabase, needsTags, contentType, minSimilarity, maxTags)

    // FALLBACK: items with no embedding matches → use tag_relationships (single batch query)
    const noEmbeddingMatch = needsTags.filter(id => {
      const matches = embeddingMatches.get(id) ?? []
      const existingIds = existingTagsByItem.get(id) ?? new Set()
      return matches.filter(m => !existingIds.has(m.tag_id)).length === 0
    })

    const relMatches = noEmbeddingMatch.length > 0
      ? await batchFindByTagRelationships(supabase, noEmbeddingMatch, existingTagsByItem, 0.75)
      : new Map<string, TagMatch[]>()

    // Build changes from all matches
    for (const item of items) {
      const itemRecord = item as Record<string, unknown>
      const contentId = String(itemRecord.id)
      totalScanned++

      if (!needsTags.includes(contentId)) continue

      try {
        const name = getContentName(itemRecord, ctConfig)
        const existingIds = existingTagsByItem.get(contentId) ?? new Set()

        // Use embedding matches first, then relationship fallback
        let matches = (embeddingMatches.get(contentId) ?? []).filter(m => !existingIds.has(m.tag_id))
        if (matches.length === 0) {
          matches = (relMatches.get(contentId) ?? []).filter(m => !existingIds.has(m.tag_id))
        }

        for (const match of matches.slice(0, maxTags - (tagCounts.get(contentId) ?? 0))) {
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
      } catch (e) {
        console.error(`[auto-tagger] Error processing ${contentType}/${contentId}: ${e}`)
        totalErrors++
      }
    }
  }

  return { scanned: totalScanned, changes: allChanges, errors: totalErrors }
}
