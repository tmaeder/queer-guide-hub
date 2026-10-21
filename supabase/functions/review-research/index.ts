// Bounded evidence collection. Source gaps are visible blocked jobs, never accepted facts.
import { corsResponse, errorResponse, getServiceClient, jsonResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { coordinateEvidence, ids, matchesName, values, type WikiEntity } from '../geography-verify/evidence.ts'
import { readEventSource } from './source-evidence.ts'

type Job = { case_id: string; lease_token: string; family: string; item: { entity_id: string; title: string } }
type Outcome = Record<string, unknown>
const sourceHeaders = { 'User-Agent': 'QueerGuide-ReviewResearch/1.0 (https://queer.guide)' }
async function wikidata(qid: string): Promise<WikiEntity> {
  if (!/^Q\d+$/.test(qid)) throw new Error('Invalid external identity')
  const response = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, { headers: sourceHeaders, signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`Wikidata returned HTTP ${response.status}`)
  const data = await response.json(); const entity = data.entities?.[qid]
  if (!entity?.claims) throw new Error('Wikidata identity has no claims')
  return entity
}
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return errorResponse('Use POST', 405, req)
  const db = getServiceClient(); const auth = await requireInternalOrAdmin(req, db)
  if (auth instanceof Response) return auth
  const started = new Date().toISOString()
  let runId: number | null = null
  const summary = { examined: 0, repaired: 0, ready: 0, blocked: 0, retry: 0, stale: 0 }
  async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await db.rpc(name, args)
    if (error) throw new Error(`${name}: ${error.message}`)
    return data as T
  }
  try {
    const body = await req.json().catch(() => ({}))
    runId = typeof body.run_id === 'number' && Number.isSafeInteger(body.run_id) ? body.run_id : null
    const batch = Math.min(8, Math.max(1, Number(body.batch) || 4))
    const jobs = await rpc<Job[]>('claim_admin_review_research_jobs', { p_batch: batch })
    for (const job of jobs) {
      summary.examined++
      let status = 'blocked'; let outcome: Outcome
      try {
        outcome = await rpc<Outcome>('research_admin_review_local', { p_case_id: job.case_id, p_lease_token: job.lease_token })
        if (job.family === 'city_identity') {
          // Reuse the existing identity resolver and its name/country/coordinate refusal gates.
          const backfill = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/city-factual-backfill`, {
            method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ phase: 'link', city_ids: [job.item.entity_id], batch_limit: 1, dry_run: false }), signal: AbortSignal.timeout(45000),
          })
          if (!backfill.ok) { await backfill.body?.cancel(); throw new Error(`Identity resolver returned HTTP ${backfill.status}`) }
          const resolution = await backfill.json()
          const { data: city, error } = await db.from('cities').select('name,wikidata_qid,country_id,latitude,longitude,field_provenance').eq('id', job.item.entity_id).maybeSingle()
          if (error) throw error
          outcome = { resolver: { processed: resolution.processed, updated: resolution.updated, skipped: resolution.skipped }, decision_ready: false,
            reason: 'No uniquely corroborated settlement identity was found' }
          if (city?.wikidata_qid) {
            const entity = await wikidata(city.wikidata_qid)
            const countryResult = await db.from('countries').select('code,name').eq('id', city.country_id).maybeSingle()
            if (countryResult.error) throw countryResult.error
            const countryCodes: unknown[] = []
            for (const countryId of ids(entity, 'P17').slice(0, 3)) countryCodes.push(...values(await wikidata(countryId), 'P297'))
            const classes = ids(entity, 'P31')
            const settlement = classes.some(id => ['Q515', 'Q3957', 'Q532', 'Q486972'].includes(id))
            const coordinate = coordinateEvidence(entity, city.latitude, city.longitude, 10000)
            const countryMatch = countryCodes.includes(countryResult.data?.code)
            const nameMatch = matchesName(entity, city.name)
            const prior = city.field_provenance?.city_place_audit?.status
            const conflict = ['non_city', 'review'].includes(prior)
            const ready = settlement && coordinate.verified && countryMatch && nameMatch && !conflict
            outcome = { ...outcome, decision_ready: ready, qid: entity.id, classes,
              source_url: `https://www.wikidata.org/wiki/${entity.id}`, retrieved_at: new Date().toISOString(),
              name_match: nameMatch, country_match: countryMatch, coordinate, prior_classification: prior,
              reason: ready ? 'Settlement identity, name, country and coordinates agree; inspect the cited evidence before changing lifecycle'
                : conflict ? 'Existing classification evidence conflicts with the candidate; resolve the cited sources'
                : 'Candidate identity lacks corroborated settlement, name, country or coordinate evidence' }
          }
        } else if (job.family === 'venue' && !outcome.repaired) {
          if (typeof outcome.source_url === 'string') {
            try { outcome.source_evidence = await readEventSource(outcome.source_url, job.item.title) }
            catch (error) {
              if (!outcome.decision_ready) throw error
              outcome.source_evidence = { source_url: outcome.source_url, error: error instanceof Error ? error.message : 'Source could not be read' }
            }
          }
        }
        status = outcome.repaired || outcome.decision_ready ? 'completed' : 'blocked'
      } catch (error) {
        status = 'retry'; outcome = { reason: error instanceof Error ? error.message : 'Evidence research failed', decision_ready: false }
      }
      const saved = await rpc<boolean>('finish_admin_review_research_job', { p_case_id: job.case_id, p_lease_token: job.lease_token, p_status: status, p_outcome: outcome })
      if (!saved) { summary.stale++; continue }
      if (outcome.repaired) summary.repaired++
      else if (outcome.decision_ready) summary.ready++
      else if (status === 'retry') summary.retry++
      else summary.blocked++
    }
    await rpc('refresh_admin_review_worklist')
    await rpc('record_admin_review_research_run', { p_started: started, p_summary: summary, p_failed: false, p_run_id: runId })
    return jsonResponse({ success: true, ...summary }, 200, req)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Review research failed'
    await rpc('record_admin_review_research_run', { p_started: started, p_summary: { ...summary, reason }, p_failed: true, p_run_id: runId }).catch(() => {})
    return errorResponse(reason, 500, req)
  }
})
