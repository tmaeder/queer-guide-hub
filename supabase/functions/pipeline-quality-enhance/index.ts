import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import { chatCompletion, isOpenAIAvailable } from '../_shared/openai-client.ts'
import { sanitizeArticle } from '../_shared/news-quality/sanitize.ts'
import { parseQualityDecision, QUALITY_PIPELINE_VERSION, type QualityDecision } from '../_shared/news-quality/schema.ts'
import { QUALITY_SYSTEM_PROMPT, buildQualityUserPrompt } from '../_shared/news-quality/prompts.ts'
import { resolveEntities } from '../_shared/news-quality/entity-link.ts'
import { evaluatePublishGate, extractionIsEmpty } from '../_shared/news-quality/decision.ts'
import { probeImage, resolveStagedImageUrl } from '../_shared/news-quality/image-check.ts'
import { findReplacementImage } from '../_shared/news-quality/image-replace.ts'
import { hashImageUrl } from '../_shared/news-quality/image-hash.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { readStagedNewsInput, STAGED_NEWS_INPUT_VERSION } from './staging-input.ts'
import { attemptNewsQuality } from './quality-attempt.ts'

// Pipeline Quality Enhance (News) — AI-assisted relevance + rewrite + entity linking + image probe.
// Reads ingestion_staging rows post-enrich, writes a QualityDecision into enriched_data + applies
// publish gate. Falls back to needs-review on circuit breaker / parse failure.

interface CandidatePools {
  countries: string[]
  cities: string[]
  personalities: string[]
  organisations: string[]
  tags: string[]
}

async function loadCandidatePools(supabase: ReturnType<typeof getServiceClient>): Promise<CandidatePools> {
  const [countries, cities, personalities, organisations, tags] = await Promise.all([
    supabase.from('countries').select('name').limit(300),
    supabase.from('cities').select('name').order('population', { ascending: false, nullsFirst: false }).limit(500),
    supabase.from('personalities').select('name').limit(500),
    supabase.from('organizations').select('name').limit(300).then(
      (r) => r.error ? { data: [] as Array<{ name: string }>, error: null } : r,
    ),
    // The order is load-bearing, not cosmetic. An unordered `.limit(200)` is served
    // from unified_tags_slug_key (verified on prod: Index Only Scan), so the model was
    // handed the first 200 slugs ALPHABETICALLY -- a slice of the 'ab*'/'ac*' region
    // that has nothing to do with any article. QUALITY_SYSTEM_PROMPT tells it to
    // "prefer existing tags listed in user message", so it duly preferred them, and
    // 368 articles ended up carrying abroromantic/ace-of-spades/abduction-play. Rank
    // by usage so the pool is the vocabulary readers actually see, exactly as the
    // cities pool above ranks by population. Status/merge filters match the canonical
    // lookup in run_tag_assignment_reconcile, which turns this text into graph edges:
    // 5,392 of 9,591 tags are deprecated and must never be offered.
    supabase.from('unified_tags').select('slug').eq('status', 'active').is('merged_into_id', null)
      .order('usage_count', { ascending: false, nullsFirst: false }).limit(200),
  ])
  return {
    countries: (countries.data ?? []).map((r: { name: string }) => r.name).filter(Boolean),
    cities: (cities.data ?? []).map((r: { name: string }) => r.name).filter(Boolean),
    personalities: (personalities.data ?? []).map((r: { name: string }) => r.name).filter(Boolean),
    organisations: (organisations.data ?? []).map((r: { name: string }) => r.name).filter(Boolean),
    tags: (tags.data ?? []).map((r: { slug: string }) => r.slug).filter(Boolean),
  }
}

async function callQualityLLM(
  supabase: ReturnType<typeof getServiceClient>,
  userPrompt: string,
): Promise<QualityDecision | null> {
  const result = await chatCompletion(supabase, {
    callerFn: 'pipeline-quality-enhance',
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

// Empty/failed verdicts are retried this many times in total before review.
const MAX_QUALITY_ATTEMPTS = 3

Deno.serve(withErrorReporting('pipeline-quality-enhance', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string | undefined
    // Each item triggers an LLM call (~8-15s). Processed concurrently (pool
    // below) so a 24-item batch fits the 150s wall clock — the old sequential
    // batch of 5 was far slower than the commit node (500/run), so most
    // articles committed before ever getting a quality verdict.
    const batchSize     = Math.min(60, body.batch_size ?? 24)
    const concurrency   = Math.min(6, Math.max(1, body.concurrency ?? 4))
    const dryRun        = body.dry_run === true

    let q = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, enriched_data, target_table')
      .in('target_table', ['news_articles'])
      // apply_enrichment() writes 'enriched' on success — not 'success'.
      // 'completed' is written by an older enrich path. A row whose empty verdict
      // was reset for a retry can carry it, and selecting 'enriched' alone left
      // those rows unjudgeable forever (64 measured on 2026-10-23).
      .in('enrichment_status', ['enriched', 'completed'])
      // Never spend an LLM call on a row a deterministic gate already discarded:
      // validate-reject stamps disposition='rejected', dedup marks duplicates
      // (disposition stays 'pending' there, hence the separate neq). validate
      // and dedup run on their own ticks without waiting for a quality verdict,
      // so this saves calls in the CURRENT order too, and becomes the main cost
      // gate once they move ahead of the LLM stages. Both columns are NOT NULL
      // DEFAULT 'pending' — no NULL trap.
      .eq('disposition', 'pending')
      .neq('dedup_status', 'duplicate')
      // Skip rows already quality-enhanced. apply_enrichment re-stamps
      // enrichment_status='enriched' on our own write, so without this filter the
      // node re-selects the oldest rows every tick and the backlog never drains.
      .filter('enriched_data->>quality_status', 'is', null)
      // Retried rows (empty/failed verdict) go behind first attempts, so a run of
      // flaky completions cannot monopolise every batch.
      .order('enriched_data->quality_attempts', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
      .limit(batchSize)
    if (pipelineRunId) q = q.eq('pipeline_run_id', pipelineRunId)

    const { data: items, error } = await q
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, input_version: STAGED_NEWS_INPUT_VERSION,
        message: 'nothing to quality-enhance' }, 200, req)
    }

    // Honor the kill switch — short-circuit before any LLM call.
    const { data: settings } = await supabase
      .from('news_quality_settings')
      .select('enabled, image_replacement_enabled')
      .eq('id', 1)
      .maybeSingle()
    const cfg = (settings ?? {}) as { enabled?: boolean; image_replacement_enabled?: boolean }
    if (cfg.enabled === false) {
      return jsonResponse({
        success: true, items: 0, items_total: items.length, items_processed: 0,
        items_succeeded: 0, items_failed: 0,
        skipped_reason: 'news_quality_disabled',
        input_version: STAGED_NEWS_INPUT_VERSION,
      }, 200, req)
    }
    const imageReplacementEnabled = cfg.image_replacement_enabled === true

    const pools = await loadCandidatePools(supabase)

    let processed = 0, passed = 0, review = 0, rejected = 0, failed = 0, deferred = 0, retried = 0
    const deferredReasons = new Set<string>()

    const processItem = async (item: (typeof items)[number]) => {
      const startedAt = Date.now()
      try {
        const n = (item.normalized_data ?? {}) as Record<string, unknown>
        // Some sources land the headline under `name` (not `title`) — mirror the
        // fallback enrich-news uses, else ~45% of enriched rows fail with no title.
        const sourceInput = readStagedNewsInput(n)
        const { title, content } = sourceInput
        if (!title) { failed++; return }

        // Re-run sanitizer locally so we know criticalPaywall/truncated state without
        // requiring pipeline-sanitize-news to have run (defensive).
        const sani = sanitizeArticle({ title, content })

        // Resolve through the same chain news_commit_staging_batch uses. Reading
        // n.image_url alone missed every podcast and most articles, so the probe
        // reported `no_image` and the Pexels replacement overwrote real artwork.
        const imageUrl = resolveStagedImageUrl(n)
        const imageProbe = imageUrl
          ? await probeImage(imageUrl, AbortSignal.timeout(8000))
          : { url: '', ok: false, reason: 'no_image' }

        const userPrompt = buildQualityUserPrompt({
          title: sani.title || title,
          excerpt: sourceInput.excerpt,
          body: sani.content || content,
          url: sourceInput.url,
          sourceName: sourceInput.sourceName,
          imageUrl,
          imageProbe: imageProbe.url ? imageProbe : undefined,
          existingTags: pools.tags.slice(0, 80),
          candidateCountries: pools.countries.slice(0, 60),
          candidateCities: pools.cities.slice(0, 60),
          candidatePersonalities: pools.personalities.slice(0, 60),
          candidateOrganisations: pools.organisations.slice(0, 60),
          alreadyRemoved: sani.removedArtifacts,
        })

        const attempt = await attemptNewsQuality(
          () => isOpenAIAvailable(supabase),
          () => withCircuitBreaker(supabase, 'llm.openai.quality-enhance',
            () => callQualityLLM(supabase, userPrompt)),
        )
        if (attempt.kind === 'deferred') {
          deferred++
          deferredReasons.add(attempt.reason)
          console.warn(`quality-enhance deferred ${item.id}: ${attempt.reason}`, attempt.error)
          return
        }
        let decision: QualityDecision | null = attempt.kind === 'decision' ? attempt.decision : null

        // No verdict, or a completion that parsed to an all-default record, is
        // absence of evidence. Retry on a later run (usually a different
        // provider) instead of handing a blank verdict to a human; only after
        // MAX_QUALITY_ATTEMPTS does it fall through to review.
        const prevAttempts = Number((item.enriched_data as Record<string, unknown> | null)?.quality_attempts ?? 0)
        if ((!decision || extractionIsEmpty(decision)) && prevAttempts + 1 < MAX_QUALITY_ATTEMPTS) {
          if (!dryRun) {
            const { error: retryErr } = await supabase.rpc('apply_enrichment', {
              p_staging_id:      item.id,
              p_pipeline_run_id: pipelineRunId ?? null,
              p_stage:           'quality-enhance',
              p_new_enriched:    {
                ...((item.enriched_data ?? {}) as Record<string, unknown>),
                quality_attempts: prevAttempts + 1,
                quality_last_error: decision ? 'empty_extraction' : 'malformed',
                quality_last_attempt_at: new Date().toISOString(),
              },
              p_actor:           'pipeline-quality-enhance',
              p_status:          'success',
              p_error_message:   null,
              p_duration_ms:     Date.now() - startedAt,
            })
            if (retryErr) console.error(`apply_enrichment retry ${item.id}: ${retryErr.message}`)
          }
          retried++
          return
        }

        if (!decision) {
          // Cannot make a confident call — push to review with available signals.
          decision = {
            isRelevant: true, relevanceScore: 0.5, qualityScoreBefore: 0.4, qualityScoreAfter: 0.4,
            shouldPublish: false, needsManualReview: true,
            title: sani.title || title, excerpt: '', cleanedBody: sani.content || content,
            sentiment: 'neutral', tags: [],
            linkedCountries: [], linkedCities: [], linkedRegions: [],
            linkedVenues: [], linkedEvents: [], linkedPersonalities: [], linkedOrganisations: [],
            imageAssessment: { isUsable: imageProbe.ok, qualityScore: imageProbe.ok ? 0.5 : 0,
              isRelevant: imageProbe.ok, needsReplacement: !imageProbe.ok, reason: imageProbe.reason ?? '' },
            removedArtifacts: sani.removedArtifacts, warnings: ['llm:malformed_response'],
            confidence: 0.3, isSatire: false, isAdvertorial: false,
          }
        }

        // Resolve entity links against real DB rows + collect review items.
        const [countryRes, cityRes, personRes, orgRes] = await Promise.all([
          resolveEntities(supabase, 'countries', 'country', decision.linkedCountries, sani.content),
          resolveEntities(supabase, 'cities', 'city', decision.linkedCities, sani.content),
          resolveEntities(supabase, 'personalities', 'personality', decision.linkedPersonalities, sani.content),
          resolveEntities(supabase, 'organizations', 'organisation', decision.linkedOrganisations, sani.content),
        ])
        const allReviewItems = [
          ...countryRes.needsReview.map((r) => ({ ...r, type: 'country' as const })),
          ...cityRes.needsReview.map((r) => ({ ...r, type: 'city' as const })),
          ...personRes.needsReview.map((r) => ({ ...r, type: 'personality' as const })),
          ...orgRes.needsReview.map((r) => ({ ...r, type: 'organisation' as const })),
        ]

        // Image replacement: try OG card → Unsplash when the source image fails the probe
        // OR the LLM judged it unusable. Gated by news_quality_settings.image_replacement_enabled.
        let replacementImage: { url: string; source: string; attribution: string | null } | null = null
        let effectiveImageOk = imageProbe.ok && decision.imageAssessment.isUsable
        if (
          imageReplacementEnabled &&
          (!imageProbe.ok || decision.imageAssessment.needsReplacement)
        ) {
          const replaceQuery = [decision.title || sani.title, ...(decision.tags ?? [])]
            .filter(Boolean).join(' ').slice(0, 100)
          const found = await findReplacementImage({
            articleUrl: sourceInput.url,
            query: replaceQuery,
            signal: AbortSignal.timeout(10000),
          })
          if (found) {
            replacementImage = {
              url: found.imageUrl,
              source: found.source,
              attribution: found.attribution,
            }
            effectiveImageOk = true
          }
        }

        const gate = evaluatePublishGate({
          decision,
          criticalPaywall: sani.criticalPaywall,
          truncated: sani.truncated,
          codeResidue: sani.codeResidue,
          hasEntityReviewItems: allReviewItems.length > 0,
          imageProbeOk: effectiveImageOk,
          stagingRelaxations: true,
        })

        const enrichedData = {
          ...((item.enriched_data ?? {}) as Record<string, unknown>),
          quality_decision: decision,
          quality_score_after: decision.qualityScoreAfter,
          quality_score_before: decision.qualityScoreBefore,
          relevance_score: decision.relevanceScore,
          sentiment: decision.sentiment,
          quality_pipeline_version: QUALITY_PIPELINE_VERSION,
          quality_input_version: STAGED_NEWS_INPUT_VERSION,
          quality_status: gate.status,
          auto_publish: gate.autoPublish,
          auto_publish_blocked_reasons: gate.blockedReasons,
          quality_attempts: prevAttempts + 1,
          // Commit drops the image when the article passed only without it.
          image_suppressed: gate.suppressImage && !replacementImage,
          quality_image_probe: imageProbe,
          // Replacement (if any) — commit RPC reads top-level image_url + image_attribution.
          ...(replacementImage ? {
            image_url: replacementImage.url,
            image_attribution: replacementImage.attribution,
            quality_image_replaced: { source: replacementImage.source, replaced_at: new Date().toISOString() },
          } : {}),
          // Top-level resolved IDs are what news_commit_staging_batch reads.
          country_ids: countryRes.linked.map((c) => c.id),
          city_ids:    cityRes.linked.map((c) => c.id),
          // Image dedup hash — uses replacement URL when set, else original.
          image_hash: await hashImageUrl(
            replacementImage?.url ?? imageUrl ?? '',
          ),
          quality_resolved_links: {
            countries: countryRes.linked,
            cities: cityRes.linked,
            personalities: personRes.linked,
            organisations: orgRes.linked,
            review: allReviewItems,
          },
          quality_run_at: new Date().toISOString(),
        }

        if (!dryRun) {
          const { error: applyErr } = await supabase.rpc('apply_enrichment', {
            p_staging_id:      item.id,
            p_pipeline_run_id: pipelineRunId ?? null,
            p_stage:           'quality-enhance',
            p_new_enriched:    enrichedData,
            p_actor:           'pipeline-quality-enhance',
            p_status:          'success',
            p_error_message:   null,
            p_duration_ms:     Date.now() - startedAt,
          })
          if (applyErr) { failed++; console.error(`apply_enrichment ${item.id}: ${applyErr.message}`); return }
        }

        processed++
        if (gate.status === 'passed') passed++
        else if (gate.status === 'review') review++
        else rejected++
      } catch (e) {
        failed++
        console.error(`quality-enhance item failed: ${(e as Error).message}`)
      }
    }

    // Bounded-concurrency pool — keeps a 24-item batch under the 150s wall clock.
    for (let i = 0; i < items.length; i += concurrency) {
      await Promise.all(items.slice(i, i + concurrency).map(processItem))
    }

    return jsonResponse({
      success: true,
      items: processed,
      items_total: items.length,
      items_processed: processed + failed,
      items_succeeded: processed,
      items_failed: failed,
      items_deferred: deferred,
      ...(deferred > 0 ? { deferred_reasons: [...deferredReasons] } : {}),
      passed, review, rejected, retried,
      pipeline_version: QUALITY_PIPELINE_VERSION,
      input_version: STAGED_NEWS_INPUT_VERSION,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-quality-enhance:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
