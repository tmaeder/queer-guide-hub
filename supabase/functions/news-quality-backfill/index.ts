import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { chatCompletion, isOpenAIAvailable } from '../_shared/openai-client.ts'
import { sanitizeArticle } from '../_shared/news-quality/sanitize.ts'
import { parseQualityDecision, QUALITY_PIPELINE_VERSION, type QualityDecision } from '../_shared/news-quality/schema.ts'
import { QUALITY_SYSTEM_PROMPT, buildQualityUserPrompt } from '../_shared/news-quality/prompts.ts'
import { evaluatePublishGate } from '../_shared/news-quality/decision.ts'
import { probeImage } from '../_shared/news-quality/image-check.ts'
import { hashImageUrl } from '../_shared/news-quality/image-hash.ts'
import { resolveEntities } from '../_shared/news-quality/entity-link.ts'

interface CandidatePools { countries: string[]; cities: string[]; tags: string[] }

async function loadCandidatePools(supabase: ReturnType<typeof getServiceClient>): Promise<CandidatePools> {
  const [countries, cities, tags] = await Promise.all([
    supabase.from('countries').select('name').limit(300),
    supabase.from('cities').select('name').order('population', { ascending: false, nullsFirst: false }).limit(500),
    supabase.from('unified_tags').select('slug').limit(200),
  ])
  return {
    countries: (countries.data ?? []).map((r: { name: string }) => r.name).filter(Boolean),
    cities: (cities.data ?? []).map((r: { name: string }) => r.name).filter(Boolean),
    tags: (tags.data ?? []).map((r: { slug: string }) => r.slug).filter(Boolean),
  }
}

// News quality backfill — re-runs the quality pipeline over published / archived
// news_articles rows. Two modes:
//   action=enqueue → paginate news_articles, insert pending rows into quality_backfill_jobs
//   action=run     → process N pending jobs (default), respecting dry_run
//
// Originals are snapshotted via RPC before any mutation. Safe + reversible.

const DEFAULT_RUN_BATCH = 10
const DEFAULT_ENQUEUE_BATCH = 200

interface RunSummary {
  processed: number; passed: number; review: number; rejected: number; failed: number; mutated: number
}

async function callQualityLLM(
  supabase: ReturnType<typeof getServiceClient>,
  userPrompt: string,
): Promise<QualityDecision | null> {
  if (!(await isOpenAIAvailable(supabase))) return null
  const result = await chatCompletion(supabase, {
    messages: [
      { role: 'system', content: QUALITY_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1,
    max_tokens: 2200,
    response_format: { type: 'json_object' },
  })
  return parseQualityDecision(result.content)
}

async function processJob(
  supabase: ReturnType<typeof getServiceClient>,
  job: { id: string; article_id: string; dry_run: boolean },
  pools: CandidatePools,
): Promise<{ status: 'completed' | 'failed' | 'skipped'; decision?: QualityDecision; error?: string; mutated?: boolean }> {
  const { data: article, error: artErr } = await supabase
    .from('news_articles')
    .select('id, title, content, image_url, url, quality_status')
    .eq('id', job.article_id)
    .single()
  if (artErr || !article) return { status: 'skipped', error: artErr?.message ?? 'article_missing' }

  const sani = sanitizeArticle({ title: article.title ?? '', content: article.content ?? '' })
  const imageProbe = article.image_url
    ? await probeImage(article.image_url, AbortSignal.timeout(8000))
    : { url: '', ok: false, reason: 'no_image' }

  const userPrompt = buildQualityUserPrompt({
    title: sani.title,
    body: sani.content,
    url: article.url ?? undefined,
    imageUrl: article.image_url ?? undefined,
    imageProbe: imageProbe.url ? imageProbe : undefined,
    existingTags: pools.tags.slice(0, 80),
    candidateCountries: pools.countries.slice(0, 60),
    candidateCities: pools.cities.slice(0, 60),
    alreadyRemoved: sani.removedArtifacts,
  })

  let decision: QualityDecision | null = null
  let llmError: string | null = null
  try {
    decision = await withCircuitBreaker(supabase, 'llm.openai.quality-enhance',
      () => callQualityLLM(supabase, userPrompt))
  } catch (e) {
    llmError = e instanceof CircuitOpenError ? `circuit_open:${e.apiName}` : (e as Error).message
  }

  if (!decision) return { status: 'failed', error: llmError ?? 'no_decision' }

  const gate = evaluatePublishGate({
    decision,
    criticalPaywall: sani.criticalPaywall,
    truncated: sani.truncated,
    hasEntityReviewItems: false,
    imageProbeOk: imageProbe.ok,
  })

  if (job.dry_run) {
    return { status: 'completed', decision, mutated: false }
  }

  // Resolve geo entities (disambiguation-guarded) so the backfill heals the
  // country_ids/city_ids gap on live rows, not just the verdict.
  const [countryRes, cityRes] = await Promise.all([
    resolveEntities(supabase, 'countries', 'country', decision.linkedCountries ?? [], sani.content),
    resolveEntities(supabase, 'cities', 'city', decision.linkedCities ?? [], sani.content),
  ])
  const countryIds = countryRes.linked.map((c) => c.id)
  const cityIds = cityRes.linked.map((c) => c.id)
  const tags = Array.isArray(decision.tags) ? decision.tags.slice(0, 12) : []

  // Snapshot original (idempotent — onConflict do nothing).
  await supabase.rpc('snapshot_news_article_original', {
    p_article_id: article.id,
    p_pipeline_version: QUALITY_PIPELINE_VERSION,
  })

  const update: Record<string, unknown> = {
    title: decision.title || article.title,
    content: decision.cleanedBody || article.content,
    // NB: news_articles.quality_score is smallint (0-100 completeness) owned by
    // run_news_quality_recompute — do NOT write the 0-1 qualityScoreAfter here
    // (it errors on smallint). The 0-1 assessment lives in quality_decision.
    quality_score_before: decision.qualityScoreBefore,
    relevance_score: decision.relevanceScore,
    sentiment: decision.sentiment,
    quality_decision: decision,
    quality_pipeline_version: QUALITY_PIPELINE_VERSION,
    quality_status: gate.status,
    last_quality_run_at: new Date().toISOString(),
    auto_publish_blocked_reasons: gate.blockedReasons,
    image_hash: article.image_url ? await hashImageUrl(article.image_url) : null,
  }
  if (tags.length) update.tags = tags
  // Merge (don't clobber) any geo we resolved; only set when we found something.
  if (countryIds.length) update.country_ids = countryIds
  if (cityIds.length) update.city_ids = cityIds

  const { error: upErr } = await supabase.from('news_articles').update(update).eq('id', article.id)
  if (upErr) return { status: 'failed', error: upErr.message }

  if (countryIds.length) {
    await supabase.from('news_article_countries')
      .upsert(countryIds.map((cid) => ({ article_id: article.id, country_id: cid })),
        { onConflict: 'article_id,country_id', ignoreDuplicates: true })
  }
  if (cityIds.length) {
    await supabase.from('news_article_cities')
      .upsert(cityIds.map((cid) => ({ article_id: article.id, city_id: cid })),
        { onConflict: 'article_id,city_id', ignoreDuplicates: true })
  }

  return { status: 'completed', decision, mutated: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  // Service-role / internal-secret (cron) and admins only.
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    const body = await req.json().catch(() => ({}))
    const action = (body.action ?? 'run') as 'enqueue' | 'run'
    const dryRunDefault = body.dry_run !== false

    // Honor the kill switch — short-circuit before doing any LLM work.
    const { data: settings } = await supabase
      .from('news_quality_settings')
      .select('enabled')
      .eq('id', 1)
      .maybeSingle()
    if (settings && (settings as { enabled: boolean }).enabled === false) {
      return jsonResponse({ success: true, items: 0, skipped_reason: 'news_quality_disabled' }, 200, req)
    }

    if (action === 'enqueue') {
      const limit = Math.min(20000, body.limit ?? DEFAULT_ENQUEUE_BATCH)
      const onlyMissing = body.only_missing !== false
      // Newest-first: heal the most-visible recent articles before the long tail.
      let q = supabase.from('news_articles').select('id').limit(limit).order('published_at', { ascending: false })
      if (onlyMissing) q = q.is('quality_pipeline_version', null)
      const { data: rows, error } = await q
      if (error) return errorResponse(`enqueue load: ${error.message}`, 500, req)

      const jobs = (rows ?? []).map((r: { id: string }) => ({
        article_id: r.id,
        dry_run: dryRunDefault,
        mode: 'backfill' as const,
        status: 'pending' as const,
        pipeline_version: QUALITY_PIPELINE_VERSION,
      }))
      if (jobs.length === 0) return jsonResponse({ success: true, enqueued: 0 }, 200, req)

      const { error: insErr } = await supabase.from('quality_backfill_jobs').insert(jobs)
      if (insErr) return errorResponse(`enqueue insert: ${insErr.message}`, 500, req)
      return jsonResponse({ success: true, enqueued: jobs.length, dry_run: dryRunDefault }, 200, req)
    }

    // action=run
    const runBatch = Math.min(50, body.batch_size ?? DEFAULT_RUN_BATCH)
    const { data: jobs, error: jobErr } = await supabase
      .from('quality_backfill_jobs')
      .select('id, article_id, dry_run, attempts')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(runBatch)
    if (jobErr) return errorResponse(`load jobs: ${jobErr.message}`, 500, req)
    if (!jobs || jobs.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'no pending jobs' }, 200, req)
    }

    const summary: RunSummary = { processed: 0, passed: 0, review: 0, rejected: 0, failed: 0, mutated: 0 }
    const pools = await loadCandidatePools(supabase)

    for (const j of jobs) {
      // Mark running (best-effort optimistic claim)
      await supabase.from('quality_backfill_jobs')
        .update({ status: 'running', attempts: (j.attempts ?? 0) + 1 })
        .eq('id', j.id)
        .eq('status', 'pending')

      const result = await processJob(supabase, j, pools)

      const updates: Record<string, unknown> = {
        status: result.status,
        decision: result.decision ?? null,
        error: result.error ?? null,
        processed_at: new Date().toISOString(),
      }
      await supabase.from('quality_backfill_jobs').update(updates).eq('id', j.id)

      summary.processed++
      if (result.status === 'failed') summary.failed++
      if (result.mutated) summary.mutated++
      if (result.decision) {
        const status = result.decision.shouldPublish ? 'passed' : (result.decision.needsManualReview ? 'review' : 'rejected')
        if (status === 'passed') summary.passed++
        else if (status === 'review') summary.review++
        else summary.rejected++
      }
    }

    return jsonResponse({
      success: true,
      items: summary.processed,
      items_total: jobs.length,
      items_processed: summary.processed,
      items_succeeded: summary.processed - summary.failed,
      items_failed: summary.failed,
      ...summary,
      pipeline_version: QUALITY_PIPELINE_VERSION,
    }, 200, req)
  } catch (error) {
    console.error('news-quality-backfill:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
