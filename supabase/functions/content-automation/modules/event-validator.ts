/**
 * Event Validator — validates event time windows, day-of-week, date ordering,
 * and detects duplicates by time+place with auto-merge or review flagging.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import {
  fetchBatch, getContentName, CONTENT_TYPE_CONFIG,
  type ModuleConfig, type SharedRefs, type ProposedChange, type AutomationRule,
} from '../../_shared/automation-utils.ts'
import {
  checkTimeWindow, checkDayOfWeek, checkTimeOrder,
  findTimePlaceDuplicates, pickPrimary, computeMergeChanges,
  type EventRecord, type ValidationIssue, type TimeWindowConfig,
  type DayCheckConfig, type DedupConfig, type DuplicatePair,
} from '../../_shared/event-validation-rules.ts'
import {
  upsertModerationFlag, loadExistingAutomationFlags,
} from '../../_shared/moderation-flag-utils.ts'

// ── Helpers ──────────────────────────────────────────────────────────────────

function castToEventRecord(item: Record<string, unknown>): EventRecord {
  return {
    id: String(item.id ?? ''),
    title: String(item.title ?? ''),
    event_type: String(item.event_type ?? ''),
    start_date: String(item.start_date ?? ''),
    end_date: item.end_date ? String(item.end_date) : null,
    timezone: item.timezone ? String(item.timezone) : null,
    venue_id: item.venue_id ? String(item.venue_id) : null,
    venue_name: item.venue_name ? String(item.venue_name) : null,
    address: item.address ? String(item.address) : null,
    latitude: item.latitude != null ? Number(item.latitude) : null,
    longitude: item.longitude != null ? Number(item.longitude) : null,
    city: String(item.city ?? ''),
    city_id: item.city_id ? String(item.city_id) : null,
    country_id: item.country_id ? String(item.country_id) : null,
    status: item.status ? String(item.status) : null,
  }
}

function evaluatePerEventRule(event: EventRecord, rule: AutomationRule): ValidationIssue | null {
  const config = rule.rule_config as Record<string, unknown>

  switch (rule.rule_type) {
    case 'event_time_window':
      return checkTimeWindow(event, {
        event_types: (config.event_types as string[]) ?? [],
        min_hour: (config.min_hour as number) ?? 0,
        max_hour: (config.max_hour as number) ?? 23,
      }, rule.id, rule.name)

    case 'event_day_check':
      return checkDayOfWeek(event, {
        event_types: (config.event_types as string[]) ?? [],
        expected_day: (config.expected_day as number) ?? 6,
      }, rule.id, rule.name)

    case 'event_time_order':
      return checkTimeOrder(event, rule.id, rule.name)

    default:
      return null
  }
}

// ── Auto-merge logic ─────────────────────────────────────────────────────────

async function autoMergePair(
  supabase: SupabaseClient,
  pair: DuplicatePair,
  rule: AutomationRule,
  existingFlagKeys: Set<string>,
  allChanges: ProposedChange[],
): Promise<number> {
  const { primary, secondary } = pickPrimary(pair.eventA, pair.eventB)
  const mergeFields = computeMergeChanges(primary, secondary)
  let changesCount = 0

  // Create content_changes for each merged field
  for (const mc of mergeFields) {
    allChanges.push({
      content_type: 'events',
      content_id: primary.id,
      content_name: primary.title.slice(0, 100),
      field_name: mc.field,
      old_value: mc.old_value,
      new_value: mc.new_value,
      change_type: 'normalize',
      confidence: 0.96,
      reasoning: `Auto-merged from duplicate event ${secondary.id}: ${mc.field}`,
      rule_id: rule.id,
    })
    changesCount++
  }

  // Mark secondary as cancelled (soft delete)
  allChanges.push({
    content_type: 'events',
    content_id: secondary.id,
    content_name: secondary.title.slice(0, 100),
    field_name: 'status',
    old_value: secondary.status,
    new_value: 'cancelled',
    change_type: 'normalize',
    confidence: 0.96,
    reasoning: `Duplicate of ${primary.id} — auto-merged, marking as cancelled`,
    rule_id: rule.id,
  })
  changesCount++

  // Log the merge in moderation_flags for audit trail
  const flagKey = `${secondary.id}:${rule.name}`
  if (!existingFlagKeys.has(flagKey)) {
    await upsertModerationFlag(supabase, {
      content_type: 'events',
      content_id: secondary.id,
      flag_type: 'DUPLICATE',
      reason: `Auto-merged into ${primary.id} (${primary.title})`,
      rule_id: rule.id,
      rule_name: rule.name,
      severity: 'warning',
      details: {
        action: 'auto_merged',
        primary_id: primary.id,
        secondary_id: secondary.id,
        time_diff_min: pair.timeDiffMin,
        distance_m: pair.distanceM,
        fields_merged: mergeFields.map(f => f.field),
      },
      suggested_action: 'merged',
      related_event_ids: [primary.id, secondary.id],
    })
    existingFlagKeys.add(flagKey)
  }

  return changesCount
}

async function flagDuplicatePair(
  supabase: SupabaseClient,
  pair: DuplicatePair,
  rule: AutomationRule,
  existingFlagKeys: Set<string>,
  allChanges: ProposedChange[],
): Promise<void> {
  // Flag both events for review
  for (const event of [pair.eventA, pair.eventB]) {
    const other = event === pair.eventA ? pair.eventB : pair.eventA
    const flagKey = `${event.id}:${rule.name}`
    if (!existingFlagKeys.has(flagKey)) {
      await upsertModerationFlag(supabase, {
        content_type: 'events',
        content_id: event.id,
        flag_type: 'DUPLICATE',
        reason: `Potential duplicate of "${other.title}" (${other.id}) — titles or types differ, manual review needed`,
        rule_id: rule.id,
        rule_name: rule.name,
        severity: 'warning',
        details: {
          action: 'flag_review',
          other_event_id: other.id,
          other_title: other.title,
          time_diff_min: pair.timeDiffMin,
          distance_m: pair.distanceM,
          this_title: event.title,
          this_type: event.event_type,
          other_type: other.event_type,
        },
        suggested_action: 'review_merge',
        related_event_ids: [pair.eventA.id, pair.eventB.id],
      })
      existingFlagKeys.add(flagKey)
    }

    allChanges.push({
      content_type: 'events',
      content_id: event.id,
      content_name: event.title.slice(0, 100),
      field_name: 'start_date',
      old_value: null,
      new_value: null,
      change_type: 'flag',
      confidence: 0.75,
      reasoning: `Potential duplicate of ${other.id} — ${pair.timeDiffMin}min apart, conflicting titles/types`,
      rule_id: rule.id,
    })
  }
}

// ── Main processor ───────────────────────────────────────────────────────────

export async function processEventValidator(
  supabase: SupabaseClient,
  config: ModuleConfig,
  _refs: SharedRefs,
  opts: { dryRun: boolean; contentType?: string; contentId?: string;
          workflowRunId: string | null; offset?: number },
): Promise<{ scanned: number; changes: ProposedChange[]; errors: number }> {
  const allChanges: ProposedChange[] = []
  let totalScanned = 0
  let totalErrors = 0

  const ctConfig = CONTENT_TYPE_CONFIG['events']
  if (!ctConfig) return { scanned: 0, changes: [], errors: 0 }

  // Only process events
  if (opts.contentType && opts.contentType !== 'events') {
    return { scanned: 0, changes: [], errors: 0 }
  }

  const items = await fetchBatch(supabase, 'events', config.module.batch_size, {
    contentId: opts.contentId,
    offset: opts.offset,
  })

  if (items.length === 0) return { scanned: 0, changes: [], errors: 0 }

  const events = items.map(castToEventRecord)
  const eventIds = events.map(e => e.id)

  // Pre-load existing OPEN automation flags for idempotency
  const existingFlagKeys = opts.dryRun
    ? new Set<string>()
    : await loadExistingAutomationFlags(supabase, 'events', eventIds)

  // ── Per-event rules ────────────────────────────────────────────────────────

  const perEventRuleTypes = ['event_time_window', 'event_day_check', 'event_time_order']
  const perEventRules = config.rules.filter(r =>
    r.content_type === 'events' && perEventRuleTypes.includes(r.rule_type)
  )

  for (const event of events) {
    totalScanned++

    for (const rule of perEventRules) {
      try {
        const issue = evaluatePerEventRule(event, rule)
        if (!issue) continue

        if (issue.action === 'autofix' && issue.suggested_changes) {
          // Time order swap: create content_changes for both fields
          for (const sc of issue.suggested_changes) {
            allChanges.push({
              content_type: 'events',
              content_id: event.id,
              content_name: event.title.slice(0, 100),
              field_name: sc.field,
              old_value: sc.old_value,
              new_value: sc.new_value,
              change_type: 'normalize',
              confidence: 0.98,
              reasoning: issue.details.reason as string,
              rule_id: rule.id,
            })
          }
        } else {
          // FLAG_FOR_REVIEW
          const flagKey = `${event.id}:${rule.name}`
          if (!existingFlagKeys.has(flagKey) && !opts.dryRun) {
            await upsertModerationFlag(supabase, {
              content_type: 'events',
              content_id: event.id,
              flag_type: 'REVIEW',
              reason: issue.details.reason as string,
              rule_id: rule.id,
              rule_name: rule.name,
              severity: issue.severity,
              details: issue.details,
            })
            existingFlagKeys.add(flagKey)
          }

          allChanges.push({
            content_type: 'events',
            content_id: event.id,
            content_name: event.title.slice(0, 100),
            field_name: rule.field_name,
            old_value: (event as Record<string, unknown>)[rule.field_name] ?? null,
            new_value: (event as Record<string, unknown>)[rule.field_name] ?? null,
            change_type: 'flag',
            confidence: 0.80,
            reasoning: issue.details.reason as string,
            rule_id: rule.id,
          })
        }
      } catch (e) {
        console.error(`[event-validator] Error on ${event.id} rule=${rule.name}: ${e}`)
        totalErrors++
      }
    }
  }

  // ── Dedup rule ─────────────────────────────────────────────────────────────

  const dedupRules = config.rules.filter(r =>
    r.content_type === 'events' && r.rule_type === 'event_dedup'
  )

  if (dedupRules.length > 0 && events.length > 1) {
    for (const rule of dedupRules) {
      try {
        const ruleConfig = rule.rule_config as Record<string, unknown>
        const dedupConfig: DedupConfig = {
          time_tolerance_min: (ruleConfig.time_tolerance_min as number) ?? 10,
          distance_threshold_m: (ruleConfig.distance_threshold_m as number) ?? 50,
        }

        const pairs = findTimePlaceDuplicates(events, dedupConfig)

        for (const pair of pairs) {
          if (pair.classification === 'auto_merge' && !opts.dryRun) {
            await autoMergePair(supabase, pair, rule, existingFlagKeys, allChanges)
          } else if (pair.classification === 'flag_review' && !opts.dryRun) {
            await flagDuplicatePair(supabase, pair, rule, existingFlagKeys, allChanges)
          } else if (opts.dryRun) {
            // In dry_run, just log the finding
            allChanges.push({
              content_type: 'events',
              content_id: pair.eventA.id,
              content_name: pair.eventA.title.slice(0, 100),
              field_name: 'start_date',
              old_value: null,
              new_value: null,
              change_type: 'flag',
              confidence: 0.75,
              reasoning: `Duplicate pair: ${pair.eventA.id} <-> ${pair.eventB.id} (${pair.classification}, ${pair.timeDiffMin}min, ${pair.distanceM ?? '?'}m)`,
              rule_id: rule.id,
            })
          }
        }
      } catch (e) {
        console.error(`[event-validator] Dedup error: ${e}`)
        totalErrors++
      }
    }
  }

  return { scanned: totalScanned, changes: allChanges, errors: totalErrors }
}
