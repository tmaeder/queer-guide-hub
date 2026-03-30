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
  findDuplicateAddressVenues, findSimilarNameSameStreetVenues,
  type EventRecord, type VenueRecord, type ValidationIssue, type TimeWindowConfig,
  type DayCheckConfig, type DedupConfig, type DuplicatePair, type VenueDuplicatePair,
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
  const pairConfidence = pair.confidence.score
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
      confidence: pairConfidence,
      reasoning: `Auto-merged from duplicate event ${secondary.id}: ${mc.field} (${pair.confidence.reasoning})`,
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
    confidence: pairConfidence,
    reasoning: `Duplicate of ${primary.id} — auto-merged, marking as cancelled (${pair.confidence.reasoning})`,
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
        title_similarity: pair.titleSimilarity,
        confidence: pair.confidence.score,
        confidence_factors: pair.confidence.factors,
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
  const pairConfidence = pair.confidence.score

  // Flag both events for review
  for (const event of [pair.eventA, pair.eventB]) {
    const other = event === pair.eventA ? pair.eventB : pair.eventA
    const flagKey = `${event.id}:${rule.name}`
    if (!existingFlagKeys.has(flagKey)) {
      await upsertModerationFlag(supabase, {
        content_type: 'events',
        content_id: event.id,
        flag_type: 'DUPLICATE',
        reason: `Potential duplicate of "${other.title}" (${other.id}) — title similarity ${(pair.titleSimilarity * 100).toFixed(0)}%, manual review needed`,
        rule_id: rule.id,
        rule_name: rule.name,
        severity: pairConfidence >= 0.75 ? 'warning' : 'warning',
        details: {
          action: 'flag_review',
          other_event_id: other.id,
          other_title: other.title,
          time_diff_min: pair.timeDiffMin,
          distance_m: pair.distanceM,
          title_similarity: pair.titleSimilarity,
          confidence: pairConfidence,
          confidence_factors: pair.confidence.factors,
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
      confidence: pairConfidence,
      reasoning: `Potential duplicate of ${other.id} — title ${(pair.titleSimilarity * 100).toFixed(0)}% similar, ${pair.timeDiffMin}min apart (${pair.confidence.reasoning})`,
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

  // ── Venue dedup rules (same address / similar name same street) ─────────

  const venueDupRules = config.rules.filter(r =>
    r.rule_type === 'venue_dup_address' || r.rule_type === 'venue_dup_name'
  )

  if (venueDupRules.length > 0) {
    try {
      const venues = await fetchVenues(supabase, config.module.batch_size)
      if (venues.length > 1) {
        // Pre-load existing venue flags
        const venueIds = venues.map(v => v.id)
        const existingVenueFlags = opts.dryRun
          ? new Set<string>()
          : await loadExistingAutomationFlags(supabase, 'venues', venueIds)

        for (const rule of venueDupRules) {
          try {
            const ruleConfig = rule.rule_config as Record<string, unknown>
            let venuePairs: VenueDuplicatePair[] = []

            if (rule.rule_type === 'venue_dup_address') {
              venuePairs = findDuplicateAddressVenues(venues)
            } else if (rule.rule_type === 'venue_dup_name') {
              const minSim = (ruleConfig.min_similarity as number) ?? 0.75
              venuePairs = findSimilarNameSameStreetVenues(venues, minSim)
            }

            for (const pair of venuePairs) {
              await flagVenueDuplicatePair(
                supabase, pair, rule, existingVenueFlags, allChanges, opts.dryRun,
              )
            }
          } catch (e) {
            console.error(`[event-validator] Venue dedup rule=${rule.name} error: ${e}`)
            totalErrors++
          }
        }
      }
    } catch (e) {
      console.error(`[event-validator] Venue fetch error: ${e}`)
      totalErrors++
    }
  }

  return { scanned: totalScanned, changes: allChanges, errors: totalErrors }
}

// ── Venue helpers ─────────────────────────────────────────────────────────

async function fetchVenues(
  supabase: SupabaseClient,
  batchSize: number,
): Promise<VenueRecord[]> {
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, address, city, country, latitude, longitude')
    .limit(batchSize)

  if (error) {
    console.error(`[event-validator] Venue fetch: ${error.message}`)
    return []
  }

  return (data || []).map((v: Record<string, unknown>) => ({
    id: String(v.id),
    name: String(v.name ?? ''),
    address: String(v.address ?? ''),
    city: String(v.city ?? ''),
    country: String(v.country ?? ''),
    latitude: v.latitude != null ? Number(v.latitude) : null,
    longitude: v.longitude != null ? Number(v.longitude) : null,
  }))
}

async function flagVenueDuplicatePair(
  supabase: SupabaseClient,
  pair: VenueDuplicatePair,
  rule: AutomationRule,
  existingFlagKeys: Set<string>,
  allChanges: ProposedChange[],
  dryRun: boolean,
): Promise<void> {
  const isHighSimilarity = pair.nameSimilarity >= 0.90
  const classification = isHighSimilarity ? 'likely_duplicate' : 'possible_duplicate'

  for (const venue of [pair.venueA, pair.venueB]) {
    const other = venue === pair.venueA ? pair.venueB : pair.venueA
    const flagKey = `${venue.id}:${rule.name}`
    if (existingFlagKeys.has(flagKey)) continue

    const reason = pair.matchType === 'same_address'
      ? `Venue "${other.name}" (${other.id}) has the same address: ${pair.normalizedAddress} — ${classification} (name similarity ${(pair.nameSimilarity * 100).toFixed(0)}%)`
      : `Venue "${other.name}" (${other.id}) has similar name on same street "${pair.street}" — name similarity ${(pair.nameSimilarity * 100).toFixed(0)}%`

    if (!dryRun) {
      await upsertModerationFlag(supabase, {
        content_type: 'venues',
        content_id: venue.id,
        flag_type: 'DUPLICATE',
        reason,
        rule_id: rule.id,
        rule_name: rule.name,
        severity: 'warning',
        details: {
          match_type: pair.matchType,
          classification,
          other_venue_id: other.id,
          other_venue_name: other.name,
          name_similarity: pair.nameSimilarity,
          normalized_address: pair.normalizedAddress,
          street: pair.street,
        },
        suggested_action: isHighSimilarity ? 'review_merge' : 'review',
        related_event_ids: [pair.venueA.id, pair.venueB.id],
      })
      existingFlagKeys.add(flagKey)
    }

    allChanges.push({
      content_type: 'venues',
      content_id: venue.id,
      content_name: venue.name.slice(0, 100),
      field_name: pair.matchType === 'same_address' ? 'address' : 'name',
      old_value: null,
      new_value: null,
      change_type: 'flag',
      confidence: 0.75,
      reasoning: reason,
      rule_id: rule.id,
    })
  }
}
