/**
 * Dedup Checker — scans news_articles and personalities for near-duplicates
 * using the fuzzy dedup-engine (multi-signal confidence scoring).
 *
 * Rule types:
 *   news_dedup       — title fuzzy match + source/domain/excerpt signals
 *   personality_dedup — name similarity + birth_date + nationality
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import {
  fetchBatch, getContentName, CONTENT_TYPE_CONFIG,
  type ModuleConfig, type SharedRefs, type ProposedChange,
} from '../../_shared/automation-utils.ts'
import { deduplicateNews, deduplicatePersonality } from '../../_shared/dedup-engine.ts'
import { upsertModerationFlag, loadExistingAutomationFlags } from '../../_shared/moderation-flag-utils.ts'

// ── Main processor ────────────────────────────────────────────────────────────

export async function processDedupChecker(
  supabase: SupabaseClient,
  config: ModuleConfig,
  _refs: SharedRefs,
  opts: {
    dryRun: boolean
    contentType?: string
    contentId?: string
    workflowRunId: string | null
    offset?: number
  },
): Promise<{ scanned: number; changes: ProposedChange[]; errors: number }> {
  const allChanges: ProposedChange[] = []
  let totalScanned = 0
  let totalErrors = 0

  // ── News dedup ─────────────────────────────────────────────────────────────

  const newsRules = config.rules.filter(r =>
    r.content_type === 'news_articles' && r.rule_type === 'news_dedup',
  )

  if (newsRules.length > 0 && (!opts.contentType || opts.contentType === 'news_articles')) {
    const rule = newsRules[0]
    try {
      const items = await fetchBatch(supabase, 'news_articles', config.module.batch_size, {
        contentId: opts.contentId,
        offset: opts.offset,
      })

      const newsIds = items.map(i => String(i.id))
      const existingFlags = opts.dryRun
        ? new Set<string>()
        : await loadExistingAutomationFlags(supabase, 'news_articles', newsIds)

      for (const item of items) {
        totalScanned++
        try {
          const result = await deduplicateNews(supabase, {
            title: String(item.title ?? ''),
            url: item.url ? String(item.url) : undefined,
            source_id: item.source_id ? String(item.source_id) : undefined,
            excerpt: item.excerpt ? String(item.excerpt) : undefined,
          })

          if (result.status === 'unique') continue

          const confidence = result.confidence!
          const flagKey = `${String(item.id)}:${rule.name}`
          const isDuplicate = result.status === 'duplicate'

          if (!existingFlags.has(flagKey) && !opts.dryRun) {
            await upsertModerationFlag(supabase, {
              content_type: 'news_articles',
              content_id: String(item.id),
              flag_type: 'DUPLICATE',
              reason: isDuplicate
                ? `Exact duplicate of article ${result.match_id} (${(confidence.score * 100).toFixed(0)}% confidence)`
                : `Near-duplicate of article ${result.match_id} (${(confidence.score * 100).toFixed(0)}% confidence) — manual review needed`,
              rule_id: rule.id,
              rule_name: rule.name,
              severity: isDuplicate ? 'error' : 'warning',
              details: {
                match_id: result.match_id,
                match_score: result.match_score,
                status: result.status,
                confidence: confidence.score,
                confidence_factors: confidence.factors,
                ...result.details,
              },
              suggested_action: isDuplicate ? 'delete' : 'review_merge',
            })
            existingFlags.add(flagKey)
          }

          allChanges.push({
            content_type: 'news_articles',
            content_id: String(item.id),
            content_name: String(item.title ?? '').slice(0, 100),
            field_name: 'url',
            old_value: null,
            new_value: null,
            change_type: 'flag',
            confidence: confidence.score,
            reasoning: `${isDuplicate ? 'Duplicate' : 'Near-duplicate'} of ${result.match_id}: ${confidence.reasoning}`,
            rule_id: rule.id,
          })
        } catch (e) {
          console.error(`[dedup-checker] News item ${item.id}: ${e}`)
          totalErrors++
        }
      }
    } catch (e) {
      console.error(`[dedup-checker] News dedup error: ${e}`)
      totalErrors++
    }
  }

  // ── Personality dedup ──────────────────────────────────────────────────────

  const personalityRules = config.rules.filter(r =>
    r.content_type === 'personalities' && r.rule_type === 'personality_dedup',
  )

  if (personalityRules.length > 0 && (!opts.contentType || opts.contentType === 'personalities')) {
    const rule = personalityRules[0]
    try {
      const items = await fetchBatch(supabase, 'personalities', config.module.batch_size, {
        contentId: opts.contentId,
        offset: opts.offset,
      })

      const personIds = items.map(i => String(i.id))
      const existingFlags = opts.dryRun
        ? new Set<string>()
        : await loadExistingAutomationFlags(supabase, 'personalities', personIds)

      for (const item of items) {
        if (opts.contentType === 'news_articles') break // only personalities when filtering
        totalScanned++
        try {
          const result = await deduplicatePersonality(supabase, {
            name: String(item.name ?? ''),
            birth_date: item.birth_date ? String(item.birth_date) : undefined,
            nationality: item.nationality ? String(item.nationality) : undefined,
          })

          if (result.status === 'unique') continue

          const confidence = result.confidence!
          const flagKey = `${String(item.id)}:${rule.name}`
          const isDuplicate = result.status === 'duplicate'

          if (!existingFlags.has(flagKey) && !opts.dryRun) {
            await upsertModerationFlag(supabase, {
              content_type: 'personalities',
              content_id: String(item.id),
              flag_type: 'DUPLICATE',
              reason: isDuplicate
                ? `Duplicate of personality ${result.match_id} — "${result.details.matched_name}" (${(confidence.score * 100).toFixed(0)}% confidence)`
                : `Near-duplicate of personality ${result.match_id} — "${result.details.matched_name}" (${(confidence.score * 100).toFixed(0)}% confidence)`,
              rule_id: rule.id,
              rule_name: rule.name,
              severity: isDuplicate ? 'error' : 'warning',
              details: {
                match_id: result.match_id,
                match_score: result.match_score,
                status: result.status,
                confidence: confidence.score,
                confidence_factors: confidence.factors,
                ...result.details,
              },
              suggested_action: isDuplicate ? 'review_merge' : 'review',
            })
            existingFlags.add(flagKey)
          }

          allChanges.push({
            content_type: 'personalities',
            content_id: String(item.id),
            content_name: String(item.name ?? '').slice(0, 100),
            field_name: 'name',
            old_value: null,
            new_value: null,
            change_type: 'flag',
            confidence: confidence.score,
            reasoning: `${isDuplicate ? 'Duplicate' : 'Near-duplicate'} of ${result.match_id} ("${result.details.matched_name}"): ${confidence.reasoning}`,
            rule_id: rule.id,
          })
        } catch (e) {
          console.error(`[dedup-checker] Personality ${item.id}: ${e}`)
          totalErrors++
        }
      }
    } catch (e) {
      console.error(`[dedup-checker] Personality dedup error: ${e}`)
      totalErrors++
    }
  }

  return { scanned: totalScanned, changes: allChanges, errors: totalErrors }
}
