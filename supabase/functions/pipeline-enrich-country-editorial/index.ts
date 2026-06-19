// pipeline-enrich-country-editorial — generates editorial content (hook + long
// paragraph) for countries that have none, grounded in their factual + LGBTI
// legal data. Hybrid by confidence:
//   high confidence AND not safety-sensitive  → auto-publish to countries
//       (editorial_hook, editorial_long, description) + audit draft row.
//   low confidence OR criminalizing destination → editorial_drafts (pending)
//       for human review at /admin/places-editorial.
//
// LLM-gated (circuit-broken). Auth: X-Internal-Secret (dispatcher/cron) or admin.
// Body: { batch_size?, dry_run?, country_ids? }

import { getServiceClient, requireInternalOrAdmin, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { llmChatCompletion } from '../_shared/llm-client.ts'
import { computeConfidence, type ConfidenceFactor } from '../_shared/confidence-scoring.ts'
import { isSafetySensitiveCountry, AUTO_PUBLISH_CONFIDENCE, type CriminalizationLike } from '../_shared/editorial-confidence.ts'

const STEP = 'editorial'
const BREAKER = 'llm.editorial'
const DEFAULT_BATCH = 8
const MAX_BATCH = 25

const SYSTEM = `You write editorial content for an LGBTQ+ travel guide, in a direct factual voice.

Produce two things for the given country:
1. "hook": ONE line, max 120 characters, no trailing period. A concrete, specific pull line.
2. "long": 3 to 5 sentences. Cover what makes the country notable for LGBTQ+ travelers,
   one accurate safety/legality note (use the provided legal context — never contradict it),
   and one cultural anchor (a city, neighborhood, event, or era).

Rules (hard):
- Banned words: discover, explore, unlock, curated, journey, amazing, tailored, personalized, vibrant, charming, hidden gem, must-see.
- No metaphors, no marketing fluff, no second person ("you / your").
- Never overstate safety. If the legal context says criminalized, say so plainly.

Output JSON only: {"hook":"...","long":"..."} — no prose, no markdown.`

interface Candidate {
  id: string
  name: string
  capital: string | null
  population: number | null
  currency: string | null
  languages: string[] | null
  equality_score: number | null
  region_name: string | null
  crim: CriminalizationLike | null
  same_sex_unions: string | null
  has_description: boolean
  enrichment_status: Record<string, unknown>
}

function parseJson(s: string): { hook?: string; long?: string } | null {
  try { return JSON.parse(s) } catch {
    const m = s.match(/\{[\s\S]*\}/)
    if (!m) return null
    try { return JSON.parse(m[0]) } catch { return null }
  }
}

function sentenceCount(text: string): number {
  return text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean).length
}

function legalContext(c: Candidate): string {
  const crim = c.crim ?? {}
  const legal = crim.legal === false
    ? `same-sex activity CRIMINALIZED${crim.penalty ? ` (${crim.penalty})` : ''}`
    : crim.legal === true ? 'same-sex activity legal' : 'legal status unknown'
  let unions = 'n/a'
  if (c.same_sex_unions) {
    try { unions = (JSON.parse(c.same_sex_unions).summary as string) || c.same_sex_unions } catch { unions = c.same_sex_unions }
  }
  return `equality_score=${c.equality_score ?? 'n/a'}; ${legal}; same-sex unions: ${unions}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth

  const body = await req.json().catch(() => ({}))
  const batchSize = Math.min(MAX_BATCH, Math.max(1, Number(body.batch_size ?? DEFAULT_BATCH)))
  const dryRun = body.dry_run === true
  const countryIds: string[] | null = Array.isArray(body.country_ids) ? body.country_ids : null

  // Candidates: countries missing the editorial hook, never already published/queued.
  // Best-grounded first (richer countries auto-publish; sparse ones fall to review).
  // Skip non-serviceable territories (shell_status) — they have no LGBTQ+ content to write about.
  let q = supabase
    .from('countries')
    .select('id, name, capital, population, currency, languages, equality_score, description, enrichment_status, lgbti_criminalization, lgbti_same_sex_unions, regions(name)')
    .is('duplicate_of_id', null)
    .eq('shell_status', 'real')
    .is('editorial_hook', null)
    .order('content_completeness_score', { ascending: false, nullsFirst: false })
    .limit(batchSize * 2)
  if (countryIds?.length) q = q.in('id', countryIds)

  const { data: rows, error } = await q
  if (error) return errorResponse(`load: ${error.message}`, 500, req)
  if (!rows?.length) return jsonResponse({ success: true, generated: 0, message: 'nothing to enrich' }, 200, req)

  // Drop countries already published/under-review in enrichment_status, or with an
  // open draft, so we never double-queue.
  const ids = rows.map((r: { id: string }) => r.id)
  const { data: openDrafts } = await supabase
    .from('editorial_drafts').select('entity_id')
    .eq('entity_type', 'country').in('status', ['pending', 'approved']).in('entity_id', ids)
  const skip = new Set((openDrafts ?? []).map((d: { entity_id: string }) => d.entity_id))

  const candidates: Candidate[] = rows
    .filter((r: Record<string, unknown>) => {
      if (skip.has(r.id as string)) return false
      const ed = ((r.enrichment_status ?? {}) as Record<string, { state?: string }>).editorial
      return !(ed?.state === 'published' || ed?.state === 'review')
    })
    .slice(0, batchSize)
    .map((r: Record<string, unknown>) => ({
      id: r.id as string,
      name: (r.name as string) ?? '',
      capital: (r.capital as string) ?? null,
      population: (r.population as number) ?? null,
      currency: (r.currency as string) ?? null,
      languages: (r.languages as string[]) ?? null,
      equality_score: (r.equality_score as number) ?? null,
      region_name: ((r.regions as { name?: string } | null)?.name) ?? null,
      crim: (r.lgbti_criminalization as CriminalizationLike) ?? null,
      same_sex_unions: (r.lgbti_same_sex_unions as string) ?? null,
      has_description: typeof r.description === 'string' && (r.description as string).trim().length > 0,
      enrichment_status: (r.enrichment_status as Record<string, unknown>) ?? {},
    }))

  if (candidates.length === 0) return jsonResponse({ success: true, generated: 0, message: 'all candidates already handled' }, 200, req)

  let published = 0, queued = 0, failed = 0, circuitOpen = false
  const results: Array<Record<string, unknown>> = []

  for (const c of candidates) {
    const started = Date.now()
    const grounding = [c.capital, c.population, c.currency, c.languages?.length, c.region_name].filter(Boolean).length
    const userMsg = [
      `Country: ${c.name}`,
      c.capital ? `Capital: ${c.capital}` : null,
      c.region_name ? `Region: ${c.region_name}` : null,
      c.population ? `Population: ${c.population}` : null,
      c.currency ? `Currency: ${c.currency}` : null,
      c.languages?.length ? `Languages: ${c.languages.slice(0, 4).join(', ')}` : null,
      `Legal context: ${legalContext(c)}`,
      '',
      'Write the hook and long paragraph.',
    ].filter((x) => x !== null).join('\n')

    let hook: string
    let long: string
    try {
      const res = await withCircuitBreaker(supabase, BREAKER, () => llmChatCompletion({
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userMsg }],
        temperature: 0.4, max_tokens: 600, timeoutMs: 30_000, retries: 2,
      }))
      const parsed = parseJson(res.content)
      hook = (parsed?.hook ?? '').trim()
      long = (parsed?.long ?? '').trim()
    } catch (e) {
      if (e instanceof CircuitOpenError) { circuitOpen = true; break }
      failed++
      results.push({ id: c.id, name: c.name, status: 'llm_error', error: (e as Error).message })
      continue
    }

    if (!hook || !long) {
      failed++
      results.push({ id: c.id, name: c.name, status: 'empty_output' })
      continue
    }

    // Confidence: grounding richness + output validity + legal context presence.
    const sc = sentenceCount(long)
    const validityScore = (hook.length <= 120 ? 0.5 : 0) + (sc >= 3 && sc <= 6 ? 0.5 : 0)
    const factors: ConfidenceFactor[] = [
      { name: 'grounding', score: Math.min(1, grounding / 5), weight: 0.4, label: 'Factual grounding' },
      { name: 'output_validity', score: validityScore, weight: 0.4, label: 'Output validity' },
      { name: 'legal_context', score: c.equality_score != null ? 1 : 0.5, weight: 0.2, label: 'Legal context' },
    ]
    const conf = computeConfidence(factors, { auto_correct: AUTO_PUBLISH_CONFIDENCE, needs_review: 0.5 })
    const safetySensitive = isSafetySensitiveCountry(c.crim)
    const autoPublish = conf.score >= AUTO_PUBLISH_CONFIDENCE && !safetySensitive
    const at = new Date().toISOString()
    const status = { ...c.enrichment_status, editorial: {
      state: autoPublish ? 'published' : 'review',
      confidence: conf.score,
      reason: autoPublish ? undefined : safetySensitive ? 'safety_sensitive' : 'low_confidence',
      at,
    } }

    if (dryRun) {
      results.push({ id: c.id, name: c.name, action: autoPublish ? 'would_publish' : 'would_review', confidence: conf.score, safety_sensitive: safetySensitive })
      if (autoPublish) published++; else queued++
      continue
    }

    let logStatus = 'done'
    if (autoPublish) {
      // Service-role direct write (approve_editorial_draft requires an admin JWT).
      // Fill description (most-rendered About field) only when still empty.
      const update: Record<string, unknown> = { editorial_hook: hook, editorial_long: long, enrichment_status: status }
      if (!c.has_description) update.description = long
      const { error: upErr } = await supabase.from('countries').update(update).eq('id', c.id)
      if (upErr) {
        failed++; logStatus = 'failed'
        results.push({ id: c.id, name: c.name, status: 'publish_failed', error: upErr.message })
      } else {
        await supabase.from('editorial_drafts').insert({
          entity_type: 'country', entity_id: c.id, draft_hook: hook, draft_long: long,
          status: 'published', model: 'completeness-engine', reviewer_note: `auto-published (confidence ${conf.score})`,
        })
        published++
        results.push({ id: c.id, name: c.name, action: 'published', confidence: conf.score })
      }
    } else {
      const { error: dErr } = await supabase.from('editorial_drafts').insert({
        entity_type: 'country', entity_id: c.id, draft_hook: hook, draft_long: long,
        status: 'pending', model: 'completeness-engine',
        reviewer_note: safetySensitive ? 'safety-sensitive: human review required' : `low confidence (${conf.score})`,
      })
      await supabase.from('countries').update({ enrichment_status: status }).eq('id', c.id)
      if (dErr) { failed++; logStatus = 'failed' } else queued++
      results.push({ id: c.id, name: c.name, action: 'queued_for_review', confidence: conf.score, reason: safetySensitive ? 'safety' : 'low_confidence' })
    }

    await supabase.from('enrichment_log').insert({
      entity_type: 'country', entity_id: c.id, step: STEP, status: logStatus, duration_ms: Date.now() - started,
    })
  }

  return jsonResponse({ success: true, published, queued, failed, circuit_open: circuitOpen, dry_run: dryRun, candidates: candidates.length, results }, 200, req)
})
