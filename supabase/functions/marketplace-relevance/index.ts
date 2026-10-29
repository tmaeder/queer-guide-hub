import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { consumeLlmBudget } from '../_shared/llm-budget.ts'
import { readRelevanceResult, relevanceDisposition, type RelevanceResult } from './decision.ts'
import { classifyPublicProduct, JEV_RELEVANCE_PILOT_SOURCES } from './jev.ts'
import { projectPublicSource } from '../_shared/jev-pipeline-judgments.ts'
import { JevBudgetDeferred, JevBudgetError, JevProviderError } from '../_shared/jev-client.ts'

const SYSTEM_PROMPT = `You are a data quality validator for queer.guide marketplace.
Assess whether a product is relevant to the LGBTQ+ community.

Queer-relevant signals: rainbow/pride imagery, explicit LGBTQ+ language, drag/ballroom items, queer art, binders, packers, tucking aids, gender-affirming gear, sex toys with LGBTQ+ positioning, queer books, pride flags, allyship/solidarity merch, LGBTQ+-owned brands.

NOT queer-relevant: generic commodity products unless explicitly framed queer.

Also flag sensitivity: "nsfw" (explicit adult), "medical" (HIV, gender-affirming care), "legal" (criminalization/asylum).

Return ONLY JSON, no markdown.`

// Coerce CF Workers AI result (.result.response can be a string OR an object).
function coerceText(x: unknown): string {
  if (typeof x === 'string') return x
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>
    return String(o.response ?? o.text ?? JSON.stringify(o))
  }
  return String(x ?? '')
}

async function validateRelevance(item: { title: string; description: string; brand?: string; category?: string; tags?: string[] }): Promise<RelevanceResult> {
  // Cloudflare Workers AI (primary). ANTHROPIC_API_KEY is not configured project-wide,
  // and CF is the chosen provider. Native /ai/run endpoint (the /ai/v1 compat endpoint
  // hangs on JSON mode); coerce the string|object response before parsing.
  const acct = Deno.env.get('CF_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
  const cfToken = Deno.env.get('CF_AI_API_TOKEN') || Deno.env.get('CLOUDFLARE_API_TOKEN')
  if (!acct || !cfToken) throw new Error('CF Workers AI not configured (CF_ACCOUNT_ID + CF_AI_API_TOKEN)')
  // Relevance is a classification task → the cheap 8B is ample and ~9x cheaper
  // per token than the 70B this used to default to (cost control, invoice IN-72568830).
  const model = Deno.env.get('CF_AI_MODEL') || '@cf/meta/llama-3.1-8b-instruct-fast'
  const userPrompt = `Product: ${item.title}\nBrand: ${item.brand || 'N/A'}\nCategory: ${item.category || 'N/A'}\nTags: ${(item.tags || []).join(', ')}\nDescription: ${(item.description || '').slice(0, 800)}\n\nReturn ONLY minified JSON: {"queer_relevant":boolean,"confidence":0-1,"reasoning":"brief","suggested_tags":["..."],"sensitivity_flags":[{"category":"legal|medical|nsfw","confidence":0-1,"severity":"low|medium|high","indicators":["terms"]}]}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 45000)
  let data: unknown
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${model}`, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${cfToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt }], max_tokens: 512 }),
    })
    if (!res.ok) throw new Error(`workers-ai ${res.status}: ${(await res.text()).slice(0, 150)}`)
    data = await res.json()
  } finally { clearTimeout(timer) }
  const text = coerceText((data as { result?: { response?: unknown } })?.result?.response ?? (data as { result?: unknown })?.result)
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('non-json LLM response')
  return readRelevanceResult(JSON.parse(match[0]))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  // verify_jwt = false, so this handler is the ONLY gate. Every input below is
  // caller-controlled, and `trust_sources` in particular writes
  // classification_result — the exact column 20260713195608 made mandatory to
  // stop unclassified rows reaching live listings. Without this check anyone
  // could POST a source name and force-approve staged listings with empty
  // sensitivity_flags. pg_cron sends x-internal-secret, pipeline-executor sends
  // the service-role bearer; both satisfy requireInternalOrAdmin.
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse('Invalid relevance request', 400, req)
    if (body.dry_run !== undefined && typeof body.dry_run !== 'boolean') return errorResponse('dry_run must be boolean', 400, req)
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const batchSize = Math.min(100, Math.max(1, Math.trunc(Number(body.batch_size)) || 25))
    const threshold = body.threshold ?? 0.5
    // Multi-brand resellers get a stricter gate: their mainstream-wholesale
    // bulk drowns the catalog, while indie single-brand shops keep 0.5.
    const aggregatorThreshold = body.aggregator_threshold ?? 0.6
    const aggregatorSources: string[] = body.aggregator_sources ?? ['ohmyfantasy', 'misterb']
    const dryRun = body.dry_run || false
    const jevEnabled = Deno.env.get('JEV_MARKETPLACE_RELEVANCE') !== 'false'
    const workerStarted = Date.now()

    // Source-trust stamp: for merchants that ARE the editorial filter (a dedicated
    // queer bookshop curates its own shelves), classify deterministically instead of
    // spending an LLM call per item. commit_marketplace_staging_batch hard-requires
    // classification_result IS NOT NULL — a gate added in 20260713195608 to close a
    // bypass — so we SATISFY that contract rather than loosening it, and the stamp
    // carries classifier:'source_trust' so a later pass can re-classify exactly these
    // rows for real. Trust stamps neither consume nor are bounded by daily_cap.
    const trustSources: string[] = body.trust_sources ?? []
    const sourceNames: string[] = body.source_names ?? []
    if (![trustSources, aggregatorSources, sourceNames].every(values => Array.isArray(values) && values.every(value => typeof value === 'string' && value.length > 0 && value.length <= 120))) return errorResponse('Invalid relevance source configuration', 400, req)
    const trustScore = Number(body.trust_score ?? 0.75) // > 0.60 so marketplace_prune_candidates() won't sweep them
    if (![threshold, aggregatorThreshold, trustScore].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) return errorResponse('Invalid relevance thresholds', 400, req)

    // Daily cap / circuit-breaker: this node has no per-call rate limit beyond
    // batch_size + a 200ms sleep. With the recurring registry engine now driving
    // many vendors, bound total LLM spend per UTC day (steady-state stays far
    // under this because refreshed existing products skip the LLM path — only
    // genuinely new products are classified). Count today's relevance events.
    const dailyCap = Number(body.daily_cap ?? 800)
    if (!Number.isSafeInteger(dailyCap) || dailyCap < 0) return errorResponse('Invalid daily cap', 400, req)
    const startOfDay = new Date().toISOString().slice(0, 10) + 'T00:00:00Z'
    const { count: doneToday } = await supabase.from('ingestion_events')
      .select('id', { count: 'exact', head: true })
      .eq('stage', 'relevance').gte('created_at', startOfDay)
    // Trust-stamped items make no LLM call, so a run that only has trusted sources
    // must not be short-circuited by the cap. With no trust_sources the behaviour is
    // byte-identical to before.
    let llmBudget = Math.max(0, dailyCap - (doneToday ?? 0))
    // Central ledger (llm_budget, seeded 'marketplace-relevance' @ 800/day):
    // probe with n=0 and take the tighter of central vs legacy remaining. The
    // legacy ingestion_events count stays as the degraded fallback — the
    // helper fails open when the RPC is missing/erroring.
    const centralProbe = await consumeLlmBudget(supabase, 'marketplace-relevance', 0)
    if (!centralProbe.degraded && centralProbe.remaining !== null) {
      llmBudget = Math.min(llmBudget, Math.max(0, centralProbe.remaining))
    }
    if (llmBudget <= 0 && trustSources.length === 0 && !jevEnabled) {
      return jsonResponse({ success: true, items: 0, message: 'daily_cap_reached', daily_cap: dailyCap, done_today: doneToday, central_remaining: centralProbe.remaining }, 200, req)
    }
    const effectiveBatch = trustSources.length > 0 ? batchSize : Math.max(1, Math.min(batchSize, llmBudget + (jevEnabled ? 4 : 0)))

    // order='newest' classifies freshly-synced vendor products first so they
    // reach live listings promptly instead of starving behind the large legacy
    // approved-but-unclassified backlog (the recurring staging drain runs a
    // newest-first tick for new products + an oldest-first tick to grind the
    // backlog). Default stays oldest-first (unchanged behavior).
    const ascending = String(body.order ?? 'oldest') !== 'newest'
    // dedup_status guard: never spend an LLM call on a row dedup already marked
    // 'duplicate' — the commit path discards it anyway. 'pending' stays allowed
    // so the current DAG order (relevance BEFORE dedup) keeps working; once the
    // DAG moves dedup ahead of this node, duplicates are filtered here for free.
    // (Column is NOT NULL DEFAULT 'pending', so .in() has no NULL trap.)
    // Scope the batch to specific merchants. Without this a trust-stamp backfill still
    // pulls a mixed batch and spends most of it on LLM calls for unrelated sources —
    // the staging table carries source_name, so filter in SQL rather than in the loop.
    // Protection and actionable source filtering happen before LIMIT. The apply
    // RPC repeats the protection check against a decision arriving in flight.
    const { data: candidates, error } = await supabase.rpc('marketplace_relevance_candidates', {
      p_limit: effectiveBatch, p_pipeline_run_id: pipelineRunId ?? null, p_source_names: sourceNames,
      p_jev_only: llmBudget <= 0 && trustSources.length === 0 && jevEnabled, p_newest: !ascending,
    })
    const items = candidates as Array<{ id: string; entity_type: string; source_name: string | null; raw_data: Record<string, unknown>; normalized_data: Record<string, unknown> | null; updated_at: string }> | null
    if (error) return errorResponse(error.message, 500, req)
    if (!items || items.length === 0) return jsonResponse({ success: true, items: 0, message: 'nothing to classify' }, 200, req)
    let approved = 0, rejected = 0, review = 0, failed = 0, stale = 0, trusted = 0, capSkipped = 0, llmUsed = 0
    let jevAttempts = 0, jevUsed = 0, evidenceDeferred = 0, jevBudgetDeferred = 0, workerDeferred = 0, examined = 0
    let providerFailure: string | null = null
    const previews: unknown[] = []
    for (const item of items) {
      if (Date.now() - workerStarted > 100000) { workerDeferred = items.length - examined; break }
      examined++
      const n = (item.normalized_data ?? {}) as Record<string, unknown>
      const meta = (n.metadata ?? {}) as Record<string, unknown>
      const itemSource = typeof item.source_name === 'string' ? item.source_name : ''

      // ── Source-trust path: no LLM, no cap consumption ──────────────────────
      if (trustSources.includes(itemSource)) {
        if (dryRun) { trusted++; continue }
        const classification = {
          lgbti_relevant: true,
          lgbti_relevance_score: trustScore,
          lgbti_reasoning: `source_trust: ${itemSource} is a trusted LGBTQ+ merchant; catalog admitted without per-item classification`,
          classifier: 'source_trust',
          sensitivity_flags: [] as unknown[],
          review_priority: 'normal',
          suggested_tags: [] as string[],
          classified_at: new Date().toISOString(),
        }
        // disposition stays 'pending' and review_status stays 'auto', so the row
        // satisfies the commit gate on the next pipeline-commit tick.
        const { data: stamped, error: tErr } = await supabase.rpc('record_marketplace_relevance', {
          p_staging_id: item.id, p_expected_updated_at: item.updated_at,
          p_classification: classification, p_decision: 'trust',
        })
        if (tErr) { failed++; continue }
        if (stamped !== true) { stale++; continue }
        // stage='relevance_trust', NOT 'relevance' — the daily-cap query counts only
        // 'relevance', so stamps must not eat tomorrow's LLM budget.
        trusted++
        continue
      }

      if (jevEnabled && (JEV_RELEVANCE_PILOT_SOURCES as readonly string[]).includes(itemSource)) {
        if (jevAttempts >= 4) { capSkipped++; continue }
        const projection = projectPublicSource(item as unknown as Record<string, unknown>)
        if (!projection.evidence || projection.evidence.entity_type !== 'marketplace') { evidenceDeferred++; continue }
        try {
          jevAttempts++
          const result = await classifyPublicProduct(supabase, projection.evidence.original,
            Deno.env.get('JEV_API_KEY') || Deno.env.get('TYPESAFE_API_KEY') || '', Boolean(dryRun))
          jevUsed++
          const effectiveThreshold = aggregatorSources.includes(itemSource) ? aggregatorThreshold : threshold
          const disposition = result.judgment.route === 'approve' && result.judgment.score < effectiveThreshold ? 'review' : result.judgment.route
          const classification = { ...result.classification, source_updated_at: item.updated_at,
            ...(disposition === 'review' ? { lgbti_relevant: null, routing_decision: 'review' } : {}) }
          if (dryRun) {
            previews.push({ staging_id: item.id, expected_updated_at: item.updated_at, request: result.request, response: result.response, judgment: result.judgment, decision: disposition })
            continue
          }
          const saved = await supabase.rpc('record_marketplace_relevance', {
            p_staging_id: item.id, p_expected_updated_at: item.updated_at, p_classification: classification, p_decision: disposition,
          })
          if (saved.error) { failed++; providerFailure = 'relevance_persistence_unavailable'; break }
          if (saved.data !== true) { stale++; continue }
          if (disposition === 'reject') rejected++
          else if (disposition === 'review') review++
          else approved++
        } catch (error) {
          if (error instanceof JevBudgetDeferred) { jevBudgetDeferred++; break }
          failed++
          providerFailure = error instanceof JevProviderError ? `jev_http_${error.status}` : error instanceof JevBudgetError ? 'jev_accounting_unavailable' : 'jev_evaluation_failed'
          break
        }
        continue // never fall through to a second provider on failure/deferral
      }

      // ── Legacy provider path: existing independently accounted daily budget ──
      if (llmUsed >= llmBudget) { capSkipped++; continue }
      llmUsed++
      try {
        const r = await validateRelevance({
          title: String(n.name ?? n.title ?? meta.product_name ?? ''),
          description: String(n.description ?? meta.description ?? ''),
          brand: String(n.brand ?? meta.brand ?? meta.brand_name ?? ''),
          category: String(n.category ?? meta.category ?? ''),
          tags: (n.tags as string[]) || [],
        })
        const effectiveThreshold = aggregatorSources.includes(itemSource) ? aggregatorThreshold : threshold
        const disposition = relevanceDisposition(r, effectiveThreshold)
        const classification = {
          lgbti_relevant: disposition === 'review' ? null : r.queer_relevant, lgbti_relevance_score: r.queer_relevant ? r.confidence : 1 - r.confidence, lgbti_reasoning: r.reasoning,
          observed_relevance_answer: r.queer_relevant, routing_decision: disposition,
          answer_confidence: r.confidence, classifier: 'legacy_cf_validated_v2',
          sensitivity_flags: r.sensitivity_flags,
          review_priority: r.sensitivity_flags.some(f => f.severity === 'high') ? 'high' : r.sensitivity_flags.length > 0 ? 'medium' : 'normal',
          suggested_tags: r.suggested_tags, classified_at: new Date().toISOString(),
        }
        if (dryRun) continue
        const saved = await supabase.rpc('record_marketplace_relevance', {
          p_staging_id: item.id, p_expected_updated_at: item.updated_at,
          p_classification: classification, p_decision: disposition,
        })
        if (saved.error) { failed++; continue }
        if (saved.data !== true) { stale++; continue }
        if (disposition === 'reject') rejected++
        else if (disposition === 'review') review++
        else approved++
        await new Promise(r => setTimeout(r, 200))
      } catch (err) { failed++; console.error(`relevance ${item.id}:`, (err as Error).message) }
    }
    // Record the actual LLM spend in the central ledger (fail-open; the
    // legacy ingestion_events count above remains the degraded fallback).
    if (llmUsed > 0 && !dryRun) {
      await consumeLlmBudget(supabase, 'marketplace-relevance', llmUsed)
    }
    const handled = approved + rejected + review + trusted
    return jsonResponse({
      success: !providerFailure, items: handled, items_processed: handled, items_examined: examined, items_total: items.length,
      items_succeeded: handled, items_failed: failed,
      approved, rejected, review, failed, stale, trusted, llm_used: llmUsed, cap_skipped: capSkipped,
      jev_attempts: jevAttempts, jev_used: jevUsed, evidence_deferred: evidenceDeferred, jev_budget_deferred: jevBudgetDeferred, worker_deferred: workerDeferred,
      ...(dryRun ? { jev_previews: previews } : {}),
      ...(providerFailure ? { error: providerFailure } : {}),
      daily_cap: dailyCap, dry_run: dryRun,
    }, providerFailure ? 503 : 200, req)
  } catch (error) { return errorResponse((error as Error).message, 500, req) }
})
