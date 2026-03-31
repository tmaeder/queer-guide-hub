/**
 * content-automation — Unified automation engine for all content modules.
 *
 * Replaces 6 separate automation-* edge functions with a single entry point.
 * Loads shared reference data once, routes to the correct module processor.
 *
 * POST { module: "content-validator"|"link-sanitizer"|"data-normalizer"|
 *                "geo-enricher"|"auto-tagger"|"ai-enhancer"|"all",
 *        dry_run?: boolean, full_scan?: boolean,
 *        content_type?: string, content_id?: string,
 *        workflow_run_id?: string }
 *
 * full_scan=true: paginates through ALL content (not just one batch) for each module.
 * Skips rate limit checks. ai-enhancer always runs one batch (real API costs).
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { corsHeaders, jsonResponse, errorResponse, requireAdmin, getCorsHeaders } from '../_shared/supabase-client.ts'
import {
  loadModuleConfig, checkRateLimit, writeChangesBatch, logRun,
  getContentName, CONTENT_TYPE_CONFIG, loadSharedReferenceData,
  type ProposedChange, type AutomationRule, type ModuleConfig, type SharedRefs,
} from '../_shared/automation-utils.ts'

// ── Module processors ─────────────────────────────────────────────────────────
// Each returns ProposedChange[] for a batch of items. Pure logic, no DB writes.

import { processContentValidator } from './modules/content-validator.ts'
import { processLinkSanitizer } from './modules/link-sanitizer.ts'
import { processDataNormalizer } from './modules/data-normalizer.ts'
import { processGeoEnricher } from './modules/geo-enricher.ts'
import { processAutoTagger } from './modules/auto-tagger.ts'
import { processAiEnhancer } from './modules/ai-enhancer.ts'
import { processEventValidator } from './modules/event-validator.ts'
import { processContentClassifier } from './modules/content-classifier.ts'

type ModuleProcessor = (
  supabase: SupabaseClient,
  config: ModuleConfig,
  refs: SharedRefs,
  opts: ProcessOpts,
) => Promise<ProcessResult>

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

const PROCESSORS: Record<string, ModuleProcessor> = {
  'content-validator': processContentValidator,
  'link-sanitizer': processLinkSanitizer,
  'data-normalizer': processDataNormalizer,
  'geo-enricher': processGeoEnricher,
  'auto-tagger': processAutoTagger,
  'ai-enhancer': processAiEnhancer,
  'event-validator': processEventValidator,
  'content-classifier': processContentClassifier,
}

const ALL_MODULES = Object.keys(PROCESSORS)

// PostgREST caps rows returned per query at 1000 by default.
// full_scan uses this as the page size so pagination terminates correctly.
const FULL_SCAN_PAGE_SIZE = 1000

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const startTime = Date.now()
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── Authentication: require admin role ──────────────────────────────────────
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    let payload: Record<string, unknown> = {}
    if (req.method === 'POST') {
      payload = await req.json().catch(() => ({}))
    }

    const moduleSlug = (payload.module as string) || 'all'
    const dryRun = payload.dry_run === true
    const fullScan = payload.full_scan === true
    const contentType = payload.content_type as string | undefined
    const contentId = payload.content_id as string | undefined
    const workflowRunId = (payload.workflow_run_id as string) ?? null

    // Determine which modules to run
    const slugsToRun = moduleSlug === 'all'
      ? ALL_MODULES
      : PROCESSORS[moduleSlug]
        ? [moduleSlug]
        : null

    if (!slugsToRun) {
      return errorResponse(`Unknown module: ${moduleSlug}. Valid: ${ALL_MODULES.join(', ')}, all`, 400)
    }

    // Load shared reference data once (countries, cities, aliases)
    const refs = await loadSharedReferenceData(supabase)

    const results: Record<string, {
      scanned: number
      proposed: number
      auto_approved: number
      pending_review: number
      errors: number
      duration_ms: number
    }> = {}

    let totalScanned = 0
    let totalProposed = 0
    let totalAutoApproved = 0
    let totalPendingReview = 0
    let totalErrors = 0

    for (const slug of slugsToRun) {
      const moduleStart = Date.now()
      const config = await loadModuleConfig(supabase, slug)

      if (!config) {
        results[slug] = { scanned: 0, proposed: 0, auto_approved: 0, pending_review: 0, errors: 0, duration_ms: 0 }
        continue
      }

      // full_scan bypasses rate limit (intentional admin action covering all content)
      if (!fullScan) {
        const withinLimit = await checkRateLimit(supabase, config.module.id, config.module.rate_limit_per_hour)
        if (!withinLimit) {
          results[slug] = { scanned: 0, proposed: 0, auto_approved: 0, pending_review: 0, errors: 1, duration_ms: Date.now() - moduleStart }
          totalErrors++
          console.log(`[content-automation] ${slug}: rate limit exceeded`)
          continue
        }
      }

      const processor = PROCESSORS[slug]
      let moduleScanned = 0, moduleProposed = 0, moduleAutoApproved = 0, modulePendingReview = 0, moduleErrors = 0, moduleFirstError = ''

      // ai-enhancer is excluded from full_scan pagination: it makes real API calls per item
      // and has its own internal "needsWork" filter — runs one batch as normal.
      const shouldLoop = fullScan && slug !== 'ai-enhancer'

      if (shouldLoop) {
        // Use PostgREST's page cap as the effective page size so termination is correct.
        config.module.batch_size = FULL_SCAN_PAGE_SIZE
        let offset = 0
        let pageScanned: number
        do {
          const result = await processor(supabase, config, refs, { dryRun, contentType, contentId, workflowRunId, offset })
          pageScanned = result.scanned
          moduleScanned += result.scanned
          moduleErrors += result.errors
          moduleProposed += result.changes.length

          if (!dryRun && result.changes.length > 0) {
            const batchId = crypto.randomUUID()
            const wr = await writeChangesBatch(supabase, config.module, workflowRunId, batchId, result.changes)
            moduleAutoApproved += wr.autoApproved
            modulePendingReview += wr.pendingReview
          } else if (dryRun) {
            for (const c of result.changes) {
              if (c.confidence >= config.module.auto_approve_threshold) moduleAutoApproved++
              else modulePendingReview++
            }
          }

          console.log(`[content-automation] ${slug} offset=${offset}: scanned=${result.scanned} changes=${result.changes.length}`)
          offset += result.scanned
        } while (pageScanned >= FULL_SCAN_PAGE_SIZE)
      } else {
        const result = await processor(supabase, config, refs, { dryRun, contentType, contentId, workflowRunId })
        moduleScanned = result.scanned
        moduleErrors = result.errors
        moduleProposed = result.changes.length
        moduleFirstError = (result as Record<string, unknown>).firstError as string ?? ''
        const debugTasks = (result as Record<string, unknown>).debugTasks as string[] ?? []
        if (debugTasks.length > 0) moduleFirstError = `[tasks: ${debugTasks.join(' | ')}] ${moduleFirstError}`

        if (!dryRun && result.changes.length > 0) {
          const batchId = crypto.randomUUID()
          const wr = await writeChangesBatch(supabase, config.module, workflowRunId, batchId, result.changes)
          moduleAutoApproved = wr.autoApproved
          modulePendingReview = wr.pendingReview
        } else if (dryRun) {
          for (const c of result.changes) {
            if (c.confidence >= config.module.auto_approve_threshold) moduleAutoApproved++
            else modulePendingReview++
          }
        }
      }

      const moduleDuration = Date.now() - moduleStart

      if (!dryRun) {
        await logRun(supabase, config.module.id, workflowRunId, {
          items_scanned: moduleScanned,
          changes_proposed: moduleProposed,
          changes_auto_approved: moduleAutoApproved,
          changes_pending_review: modulePendingReview,
          errors: moduleErrors,
          duration_ms: moduleDuration,
        })
      }

      results[slug] = {
        scanned: moduleScanned,
        proposed: moduleProposed,
        auto_approved: moduleAutoApproved,
        pending_review: modulePendingReview,
        errors: moduleErrors,
        duration_ms: moduleDuration,
        ...(moduleFirstError ? { first_error: moduleFirstError } : {}),
      }

      totalScanned += moduleScanned
      totalProposed += moduleProposed
      totalAutoApproved += moduleAutoApproved
      totalPendingReview += modulePendingReview
      totalErrors += moduleErrors

      console.log(`[content-automation] ${slug}: scanned=${moduleScanned} changes=${moduleProposed} auto=${moduleAutoApproved} pending=${modulePendingReview} errors=${moduleErrors} ${moduleDuration}ms`)
    }

    const totalDuration = Date.now() - startTime
    console.log(`[content-automation] Total: modules=${slugsToRun.length} scanned=${totalScanned} changes=${totalProposed} ${totalDuration}ms`)

    return jsonResponse({
      success: true,
      dry_run: dryRun,
      full_scan: fullScan,
      modules_run: slugsToRun,
      items_total: totalScanned,
      changes_proposed: totalProposed,
      changes_auto_approved: totalAutoApproved,
      changes_pending_review: totalPendingReview,
      errors: totalErrors,
      duration_ms: totalDuration,
      results,
    })
  } catch (e) {
    console.error(`[content-automation] Fatal: ${e}`)
    return errorResponse('Internal server error', 500)
  }
})
