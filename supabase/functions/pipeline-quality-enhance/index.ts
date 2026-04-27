import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { chatCompletion, isOpenAIAvailable } from '../_shared/openai-client.ts'
import { sanitizeArticle } from '../_shared/news-quality/sanitize.ts'
import { parseQualityDecision, QUALITY_PIPELINE_VERSION, type QualityDecision } from '../_shared/news-quality/schema.ts'
import { QUALITY_SYSTEM_PROMPT, buildQualityUserPrompt } from '../_shared/news-quality/prompts.ts'
import { resolveEntities } from '../_shared/news-quality/entity-link.ts'
import { evaluatePublishGate } from '../_shared/news-quality/decision.ts'
import { probeImage } from '../_shared/news-quality/image-check.ts'
import { findReplacementImage } from '../_shared/news-quality/image-replace.ts'

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
    supabase.from('organisations').select('name').limit(300).then(
      (r) => r.error ? { data: [] as Array<{ name: string }>, error: null } : r,
    ),
    supabase.from('unified_tags').select('slug').limit(200),
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const batchSize     = Math.min(50, body.batch_size ?? 10)
    const dryRun        = body.dry_run === true

    let q = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, enriched_data, target_table')
      .in('target_table', ['news_articles'])
      .eq('enrichment_status', 'success')
      .order('created_at', { ascending: true })
      .limit(batchSize)
    if (pipelineRunId) q = q.eq('pipeline_run_id', pipelineRunId)

    const { data: items, error } = await q
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to quality-enhance' }, 200, req)
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
      }, 200, req)
    }
    const imageReplacementEnabled = cfg.image_replacement_enabled === true

    const pools = await loadCandidatePools(supabase)

    let processed = 0, passed = 0, review = 0, rejected = 0, failed = 0

    for (const item of items) {
      const startedAt = Date.now()
      try {
        const n = (item.normalized_data ?? {}) as Record<string, unknown>
        const title = String(n.title ?? '').trim()
        const content = String(n.content ?? n.body ?? '')
        if (!title) { failed++; continue }

        // Re-run sanitizer locally so we know criticalPaywall/truncated state without
        // requiring pipeline-sanitize-news to have run (defensive).
        const sani = sanitizeArticle({ title, content })

        const imageUrl = String(n.image_url ?? n.imageUrl ?? '') || undefined
        const imageProbe = imageUrl
          ? await probeImage(imageUrl, AbortSignal.timeout(8000))
          : { url: '', ok: false, reason: 'no_image' }

        const userPrompt = buildQualityUserPrompt({
          title: sani.title || title,
          excerpt: String(n.excerpt ?? n.description ?? '') || undefined,
          body: sani.content || content,
          url: String(n.url ?? n.source_url ?? '') || undefined,
          sourceName: String(n.source_name ?? '') || undefined,
          imageUrl,
          imageProbe: imageProbe.url ? imageProbe : undefined,
          existingTags: pools.tags.slice(0, 80),
          candidateCountries: pools.countries.slice(0, 60),
          candidateCities: pools.cities.slice(0, 60),
          candidatePersonalities: pools.personalities.slice(0, 60),
          candidateOrganisations: pools.organisations.slice(0, 60),
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
            removedArtifacts: sani.removedArtifacts, warnings: [llmError ? `llm:${llmError}` : 'llm:no_response'],
            confidence: 0.3, isSatire: false, isAdvertorial: false,
          }
        }

        // Resolve entity links against real DB rows + collect review items.
        const [countryRes, cityRes, personRes, orgRes] = await Promise.all([
          resolveEntities(supabase, 'countries', 'country', decision.linkedCountries, sani.content),
          resolveEntities(supabase, 'cities', 'city', decision.linkedCities, sani.content),
          resolveEntities(supabase, 'personalities', 'personality', decision.linkedPersonalities, sani.content),
          resolveEntities(supabase, 'organisations', 'organisation', decision.linkedOrganisations, sani.content),
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
            articleUrl: String(n.url ?? n.source_url ?? '') || undefined,
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
          hasEntityReviewItems: allReviewItems.length > 0,
          imageProbeOk: effectiveImageOk,
        })

        const enrichedData = {
          ...((item.enriched_data ?? {}) as Record<string, unknown>),
          quality_decision: decision,
          quality_score_after: decision.qualityScoreAfter,
          quality_score_before: decision.qualityScoreBefore,
          relevance_score: decision.relevanceScore,
          sentiment: decision.sentiment,
          quality_pipeline_version: QUALITY_PIPELINE_VERSION,
          quality_status: gate.status,
          auto_publish: gate.autoPublish,
          auto_publish_blocked_reasons: gate.blockedReasons,
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
          if (applyErr) { failed++; console.error(`apply_enrichment ${item.id}: ${applyErr.message}`); continue }
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

    return jsonResponse({
      success: true,
      items: processed,
      items_total: items.length,
      items_processed: processed + failed,
      items_succeeded: processed,
      items_failed: failed,
      passed, review, rejected,
      pipeline_version: QUALITY_PIPELINE_VERSION,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-quality-enhance:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
