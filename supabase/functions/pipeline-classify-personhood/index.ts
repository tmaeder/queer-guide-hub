// pipeline-classify-personhood — detect organizations / venues / teams misfiled
// in `personalities` and reversibly archive the confirmed non-persons.
//
// Heuristic recall selector (personalities_nonperson_candidates RPC) → per-row
// classification fusing name/bio heuristics + Wikidata P31 + LLM grounded in the
// bio → hybrid-by-confidence disposition:
//   verdict=non_person & confidence>=0.8  → archive_personality_as_nonperson (reversible)
//   verdict=uncertain                     → enrichment_status.personhood (needs_attention), NOT archived
//   verdict=person                        → enrichment_status.personhood (confirmed), excluded from future runs
//
// LLM-gated: circuit-broken + per-day cap. Auth: X-Internal-Secret (cron via
// workflow-dispatcher) or admin/service-role. Body:
//   { batch_limit?, dry_run?, ids?: uuid[], daily_cap?, archive_confidence? }

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker, checkCircuit, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { classifyPersonhood, llmPersonhood, type PersonhoodInput } from '../_shared/personhood-classifier.ts'

const DEFAULT_BATCH_LIMIT = 15
const DEFAULT_DAILY_CAP = 200
const DEFAULT_ARCHIVE_CONFIDENCE = 0.8
const STEP = 'classify-personhood'
const LLM_BREAKER = 'llm.openai.classify-personhood'

interface CandidateRow {
  id: string
  name: string
  bio: string | null
  profession: string | null
  nationality: string | null
  visibility: string
  has_dates: boolean
  signals: string[]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth

  const body = await req.json().catch(() => ({}))
  const batchLimit: number = body.batch_limit ?? DEFAULT_BATCH_LIMIT
  const dailyCap: number = body.daily_cap ?? DEFAULT_DAILY_CAP
  const dryRun: boolean = body.dry_run ?? false
  const ids: string[] | undefined = Array.isArray(body.ids) && body.ids.length ? body.ids : undefined
  const archiveConfidence: number = body.archive_confidence ?? DEFAULT_ARCHIVE_CONFIDENCE

  // Daily cap — count rows classified today (any disposition).
  const since = new Date(); since.setUTCHours(0, 0, 0, 0)
  const { count: doneToday } = await supabase
    .from('enrichment_log').select('id', { count: 'exact', head: true })
    .eq('step', STEP).eq('status', 'done').gte('created_at', since.toISOString())
  if (!ids && (doneToday ?? 0) >= dailyCap) {
    return jsonResponse({ classified: 0, capped: true, done_today: doneToday, daily_cap: dailyCap }, 200, req)
  }
  const remaining = ids ? batchLimit : Math.min(batchLimit, dailyCap - (doneToday ?? 0))

  // Select candidates.
  let candidates: CandidateRow[]
  if (ids) {
    const { data, error } = await supabase
      .from('personalities')
      .select('id, name, bio, description, profession, nationality, visibility, birth_date, death_date')
      .in('id', ids)
    if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
    candidates = (data ?? []).map((p) => ({
      id: p.id, name: p.name, bio: p.bio ?? p.description ?? null,
      profession: p.profession, nationality: p.nationality, visibility: p.visibility,
      has_dates: !!(p.birth_date || p.death_date), signals: [],
    }))
  } else {
    const { data, error } = await supabase.rpc('personalities_nonperson_candidates', { p_limit: remaining })
    if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
    candidates = (data ?? []) as CandidateRow[]
  }
  if (!candidates.length) return jsonResponse({ classified: 0, message: 'no candidates' }, 200, req)

  // If the LLM circuit is already open, skip the LLM layer for the whole batch
  // (Wikidata + heuristics still run; archiving still possible on strong agreement).
  const circuit = await checkCircuit(supabase, LLM_BREAKER)
  const llmDep = circuit.allowed
    ? (input: PersonhoodInput) => withCircuitBreaker(supabase, LLM_BREAKER, () => llmPersonhood(input))
    : async () => null

  let archived = 0, flagged = 0, confirmedPerson = 0, errors = 0
  let circuitOpen = !circuit.allowed
  const results: Array<Record<string, unknown>> = []

  for (const c of candidates) {
    const started = Date.now()
    let status = 'done'
    try {
      const result = await classifyPersonhood(
        { name: c.name, bio: c.bio, profession: c.profession, hasDates: c.has_dates },
        { llm: llmDep },
      )
      const signals = Array.from(new Set([...(c.signals ?? []), ...result.signals]))

      if (result.verdict === 'non_person' && result.confidence >= archiveConfidence) {
        if (!dryRun) {
          const { error } = await supabase.rpc('archive_personality_as_nonperson', {
            p_id: c.id,
            p_reason: `classified non-person (${result.suggestedType ?? 'unknown'}, conf ${result.confidence.toFixed(2)})`,
            p_signals: {
              confidence: result.confidence,
              suggested_type: result.suggestedType,
              signals,
              wikidata_qid: result.wikidataQid ?? null,
              source: STEP,
            },
          })
          if (error) throw error
        }
        archived++
        results.push({ id: c.id, name: c.name, verdict: 'non_person', confidence: result.confidence, type: result.suggestedType, action: dryRun ? 'would_archive' : 'archived' })
      } else {
        // Persist verdict (person or uncertain) so the row is excluded from
        // future candidate selection and, when uncertain, surfaced for triage.
        const verdict = result.verdict === 'non_person' ? 'uncertain' : result.verdict // low-conf non_person → uncertain
        if (!dryRun) {
          const { error } = await supabase.rpc('set_personhood_verdict', {
            p_id: c.id, p_verdict: verdict,
            p_payload: {
              confidence: result.confidence,
              suggested_type: result.suggestedType,
              signals,
              wikidata_qid: result.wikidataQid ?? null,
              source: STEP,
              needs_attention: verdict === 'uncertain',
            },
          })
          if (error) throw error
        }
        if (verdict === 'person') confirmedPerson++; else flagged++
        results.push({ id: c.id, name: c.name, verdict, confidence: result.confidence, action: dryRun ? 'would_flag' : 'flagged' })
      }
    } catch (e) {
      if (e instanceof CircuitOpenError) {
        circuitOpen = true
        await logStep(supabase, c.id, 'skipped', started, dryRun)
        results.push({ id: c.id, status: 'circuit_open' })
        break
      }
      status = 'failed'; errors++
      results.push({ id: c.id, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
    await logStep(supabase, c.id, status, started, dryRun)
  }

  return jsonResponse({
    classified: archived + flagged + confirmedPerson,
    archived, flagged, confirmed_person: confirmedPerson, errors,
    circuit_open: circuitOpen, dry_run: dryRun, results,
  }, 200, req)
})

async function logStep(supabase: ReturnType<typeof getServiceClient>, id: string, status: string, started: number, dryRun: boolean) {
  if (dryRun) return
  await supabase.from('enrichment_log').insert({
    entity_type: 'personality', entity_id: id, step: STEP, status, duration_ms: Date.now() - started,
  }).then(() => {}, () => {})
}
