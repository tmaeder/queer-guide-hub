import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { chatCompletion, isOpenAIAvailable } from '../_shared/openai-client.ts'
import { sanitizeArticle } from '../_shared/news-quality/sanitize.ts'
import { parseQualityDecision, QUALITY_PIPELINE_VERSION, type QualityDecision } from '../_shared/news-quality/schema.ts'
import { extractJsonCandidates, parseJsonObject, repairJsonControlChars } from '../_shared/json-extract.ts'
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
    // See the same call in pipeline-quality-enhance: an unordered `.limit(200)` is
    // served from unified_tags_slug_key, so this handed the model the alphabetical
    // head of the vocabulary instead of a relevant pool. Rank by usage and exclude
    // deprecated/merged tags.
    supabase.from('unified_tags').select('slug').eq('status', 'active').is('merged_into_id', null)
      .order('usage_count', { ascending: false, nullsFirst: false }).limit(200),
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
// Attempt ceiling per ARTICLE (not per job row — see the enqueue comment).
// Three 'no_decision' verdicts on the same content is not a transient failure;
// it is the model telling us the article is undecidable.
const DEFAULT_MAX_FAILURES = 3

interface RunSummary {
  processed: number; passed: number; review: number; rejected: number; failed: number; mutated: number
}

/** A completion that arrived but could not be read, recorded where SQL can see it.
 *
 * WHY THE JOB ROW AND NOT JUST THE LOG.
 *
 *   `parseQualityDecision` already console.errors an unparseable completion,
 *   and that is the right place for it — but the edge-function log is not
 *   reachable from every environment that has to diagnose this (no log source
 *   resolves through the Supabase MCP, and reading it needs a token an
 *   operator may not hold). So the diagnosis rides the `error` column, which
 *   is already read by hand whenever this queue is investigated.
 *
 * WHY IT NAMES THE PARSE ERROR RATHER THAN SHOWING MORE OF THE TEXT.
 *
 *   The first cut of this recorded `len` plus the first 240 chars, and that
 *   measurement (prod, 2026-09-20, three articles) ruled two hypotheses out
 *   and identified none. It showed the completions are REAL and their heads
 *   are well-formed JSON — `{ "isRelevant": true, "relevanceScore": 0.9, ...`
 *   from character 0, every key correct — at 2,641 / 5,092 / 5,239 chars for
 *   624 / 1,203 / 1,201 output tokens, i.e. a steady ~4.2 chars per token and
 *   nothing near the 2,200 ceiling. So the answer is not missing and it is not
 *   truncated; `JSON.parse` is rejecting a complete object, and a longer head
 *   cannot say why because the head is the part that is fine.
 *
 *   `JSON.parse`'s own error does say why, and names the offset: a raw newline
 *   inside a string value reads `Bad control character in string literal ... at
 *   position N`, an unterminated object reads `Unexpected end of JSON input`,
 *   trailing prose reads `Unexpected non-whitespace character after JSON`. That
 *   is a cause, not another clue — which is the whole reason to spend a second
 *   round trip here instead of guessing a third time.
 *
 *   The tail rides along because it is the one part never yet seen, and it
 *   distinguishes "stopped mid-sentence" from "closed and kept talking" at a
 *   glance. Every candidate is tried, not just the first: the stages are
 *   ordered best-first, so an error from the fenced candidate alone would
 *   misreport a run the balanced candidate also failed.
 */
export function describeUnparseable(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  const errs: string[] = []
  let candidates = 0
  for (const candidate of extractJsonCandidates(content)) {
    candidates++
    // Ask EXACTLY what the parser asks, or this reports a cause the parser no
    // longer has: a completion whose only fault is a literal newline inside
    // cleanedBody is recovered now, and describing it as having failed on a
    // control character would send the next reader after a fixed bug.
    if (parseJsonObject(candidate)) {
      if (!errs.includes('parsed_as_object')) errs.push('parsed_as_object')
      continue
    }
    try {
      JSON.parse(repairJsonControlChars(candidate))
      // Parsed, so `parseQualityDecision` rejected it for the only other
      // reason it can: the value is not a JSON object (an array, a bare
      // string). Worth naming — it is a different bug from a parse failure.
      if (!errs.includes('parsed_but_not_object')) errs.push('parsed_but_not_object')
    } catch (e) {
      const m = (e as Error).message
      if (!errs.includes(m)) errs.push(m)
    }
  }
  // Zero candidates has two causes and they are not the same finding: no brace
  // anywhere (a refusal, prose) versus a brace that never closes (a cut-off
  // answer — every stage needs a closing '}', including the legacy greedy one).
  // Reading them apart off the tail works but asks the next person to squint.
  const why = candidates === 0
    ? (content.includes('{') ? 'unterminated_object' : 'no_candidates')
    : errs.slice(0, 2).join(' | ')
  const tail = flat.slice(-120)
  return `no_decision:len=${content.length}:cands=${candidates}:why=${why}:tail=${tail}`
}

/**
 * Recover the structured verdict when the model's long `cleanedBody` value is
 * the only malformed field.
 *
 * The body is deliberately discarded rather than heuristically repaired: the
 * caller already preserves the article's existing content when cleanedBody is
 * empty. Everything before and after the body still has to parse against the
 * normal schema, so this cannot turn arbitrary prose into a verdict.
 */
export function parseQualityDecisionPreservingBody(content: string): QualityDecision | null {
  for (const candidate of extractJsonCandidates(content)) {
    const bodyKey = /"cleanedBody"\s*:/.exec(candidate)
    if (!bodyKey?.index && bodyKey?.index !== 0) continue

    // The prompt fixes `sentiment` immediately after `cleanedBody`. Use the
    // last matching key so quoted article prose that happens to mention the
    // word cannot truncate the candidate early.
    const tail = candidate.slice(bodyKey.index + bodyKey[0].length)
    const boundary = [...tail.matchAll(/,\s*"sentiment"\s*:/g)].at(-1)
    if (!boundary?.index && boundary?.index !== 0) continue

    const bodyEnd = bodyKey.index + bodyKey[0].length + boundary.index
    const withoutBody =
      candidate.slice(0, bodyKey.index + bodyKey[0].length) +
      ' ""' +
      candidate.slice(bodyEnd)
    const raw = parseJsonObject(withoutBody)
    const required = [
      'isRelevant',
      'relevanceScore',
      'qualityScoreBefore',
      'qualityScoreAfter',
      'shouldPublish',
      'needsManualReview',
      'title',
      'excerpt',
      'cleanedBody',
      'sentiment',
      'tags',
      'linkedCountries',
      'linkedCities',
      'linkedRegions',
      'linkedVenues',
      'linkedEvents',
      'linkedPersonalities',
      'linkedOrganisations',
      'imageAssessment',
      'removedArtifacts',
      'warnings',
      'confidence',
    ]
    if (!raw || !required.every((key) => Object.hasOwn(raw, key))) continue

    const decision = parseQualityDecision(withoutBody)
    if (decision) {
      decision.warnings = [
        ...decision.warnings,
        'cleaned_body_preserved_after_json_repair',
      ].slice(0, 20)
      return decision
    }
  }
  return null
}

async function callQualityLLM(
  supabase: ReturnType<typeof getServiceClient>,
  userPrompt: string,
): Promise<{ decision: QualityDecision | null; unparseable?: string }> {
  if (!(await isOpenAIAvailable(supabase))) return { decision: null }
  const result = await chatCompletion(supabase, {
    callerFn: 'news-quality-backfill',
    messages: [
      { role: 'system', content: QUALITY_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1,
    max_tokens: 2200,
    response_format: { type: 'json_object' },
  })
  const decision = parseQualityDecision(result.content) ??
    parseQualityDecisionPreservingBody(result.content)
  if (decision) return { decision }
  // A completion arrived and could not be read. That is a DIFFERENT fact from
  // "no completion arrived", and until now both landed as the same string.
  return { decision: null, unparseable: describeUnparseable(result.content ?? '') }
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
  let unparseable: string | undefined
  let llmError: string | null = null
  try {
    const out = await withCircuitBreaker(supabase, 'llm.openai.quality-enhance',
      () => callQualityLLM(supabase, userPrompt))
    decision = out.decision
    unparseable = out.unparseable
  } catch (e) {
    llmError = e instanceof CircuitOpenError ? `circuit_open:${e.apiName}` : (e as Error).message
  }

  // Order matters: a thrown error (circuit open, transport) outranks an
  // unreadable body, because in that case there IS no body. `no_decision`
  // stays the last resort and now means what it always claimed to mean —
  // the model was asked and returned nothing usable that we never saw.
  if (!decision) return { status: 'failed', error: llmError ?? unparseable ?? 'no_decision' }

  const gate = evaluatePublishGate({
    decision,
    criticalPaywall: sani.criticalPaywall,
    truncated: sani.truncated,
    codeResidue: sani.codeResidue,
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
      const maxFailures = Math.max(1, body.max_failures ?? DEFAULT_MAX_FAILURES)

      // Candidate selection moved into SQL (news_quality_enqueue_candidates).
      //
      // The old query here was `quality_pipeline_version IS NULL` and nothing
      // else, which had no attempt ceiling: a 'no_decision' failure never
      // stamps that column, so the same article was re-enqueued forever. Each
      // re-enqueue INSERTs a fresh row, so the per-row `attempts` counter never
      // exceeded 1 and no backoff could ever see the repetition. Measured
      // 2026-08-10: 29,181 failed jobs across 1,159 articles (~25 attempts
      // each), all 'no_decision', ~$41/month of LLM spend re-asking questions
      // that had already returned "no answer".
      //
      // Asking an undecidable article a 26th time does not make it decidable.
      //
      // The SQL version also excludes articles that already have a pending or
      // running job, which the old query did not — that is where the duplicate
      // churn came from.
      const { data: rows, error } = await supabase.rpc('news_quality_enqueue_candidates', {
        p_limit: limit,
        p_max_failures: maxFailures,
      })
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
