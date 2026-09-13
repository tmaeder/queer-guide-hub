// city-agentic-enrich — the queer moat. For thin / low-completeness cities, fetch
// grounding sources (Wikipedia extract + official site) and extract queer-aware
// travel fields. Hybrid-by-confidence for NARRATIVE fields (auto-fill empty cols at
// >=0.8). SAFETY-SENSITIVE fields (lgbt_friendly_rating, editorial_hook,
// best_time_to_visit) are ALWAYS routed to city_review_queue — never auto-published —
// and the rating is only queued when backed by citations. safety_notes is composed
// deterministically elsewhere (compose_safety_note / city safety backfill).
// LLM-gated: circuit-broken + per-day cap.
//
// best_time_to_visit joined the gated set on 2026-09-12 because the voice adoption
// changed what the model is willing to say. Measured across all 209 cities this
// composer had ever touched, it returned null 209/209 — conservatism this codebase
// treats as correct, not as a gap. The first `voice: 'compact'` A/B filled it on 2 of
// 5 cities, and one of the two was WRONG: it dated the Busan Queer Culture Festival to
// "June or July" (it is a September/October event; June/July is Seoul's). Chillán's was
// right. A travel-timing recommendation is the one narrative field that reaches past
// the grounding sources by construction — the sources say what a city IS, not when to
// go — so at a 0.8 auto-publish bar it is a fabrication surface. No regex sees this:
// styleguide_content_drift() scores vocabulary, and the sentence carried no avoid
// phrase at all. Gate the field, keep the voice.
//
// Auth: X-Webhook-Secret (cron) or admin/service-role.
// Body: { batch_limit?, dry_run?, city_ids?, daily_cap?, skip_gated?, voice? }.
//
// `voice` selects the editorial-standard arm ('off' | 'compact' | 'core' |
// 'full'). It ships 'off'; the production lever is
// admin_automations.conditions.voice on slug `city_agentic_enrich`, flippable
// with a plain UPDATE. Pair the body param with dry_run to A/B two arms on the
// same cities without writing anything — the dry-run result carries the
// generated proposal for exactly that comparison.

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { consumeLlmBudget } from '../_shared/llm-budget.ts'
import { researchEnrichCityFromSources, type CityMoatEnrichment, type VoiceSetting } from '../_shared/ai-enrichment.ts'
import { fetchPageText } from '../_shared/enrich-harness.ts'
import { cityNameCandidates } from '../_shared/city-name-normalize.ts'
import { cityWikiVerdict, regionQualifiedTitle } from '../_shared/city-wiki-guard.ts'

const DEFAULT_BATCH_LIMIT = 5
const DEFAULT_DAILY_CAP = 120
const COMPLETENESS_CEILING = 70     // only enrich cities below this
const STEP = 'city-agentic-enrich'
const AUTO_APPLY_CONFIDENCE = 0.8
const GET_TIMEOUT = 10_000
const MAX_BODY_BYTES = 400_000
const WP_UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'
const _GATED_FIELDS = ['lgbt_friendly_rating', 'editorial_hook'] as const

const fetchCityPage = (url: string) =>
  fetchPageText(url, {
    userAgent: 'Mozilla/5.0 (compatible; QueerGuide-CityEnrich/1.0)',
    maxBytes: MAX_BODY_BYTES,
    timeoutMs: GET_TIMEOUT,
  })

// Full-text plaintext extract (not just the lead paragraph) so the model has
// real material to ground queer-relevant fields on.
async function fetchWikipediaExtract(query: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(query)}`
    const r = await fetch(url, { headers: { 'User-Agent': WP_UA, Accept: 'application/json' } })
    if (!r.ok) return null
    const d = await r.json()
    const pages = d?.query?.pages
    if (!pages) return null
    for (const k of Object.keys(pages)) {
      const ex = pages[k]?.extract
      if (typeof ex === 'string' && ex.trim().length > 120) return ex
    }
    return null
  } catch { return null }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  if (!hasValidWebhookSecret(req, 'CITY_QUALITY_WEBHOOK_SECRET')) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const body = await req.json().catch(() => ({}))
  const batchLimit: number = body.batch_limit ?? DEFAULT_BATCH_LIMIT
  const dailyCap: number = body.daily_cap ?? DEFAULT_DAILY_CAP
  const dryRun: boolean = body.dry_run ?? false
  const cityIds: string[] | undefined = body.city_ids
  // Suppress the review-gated proposals. Used during operator backfills: this
  // function queues lgbt_friendly_rating / editorial_hook for human approval,
  // and 692 such items are already open and unreviewed since 2026-06-28. A bulk
  // sweep would grow that backlog into the thousands while nobody is draining it.
  const skipGated: boolean = body.skip_gated ?? false

  // --- Editorial voice: rollout lever, not a constant -----------------------
  // Measured on 328 real runs before this shipped: 16.8% of generated
  // descriptions and 21.8% of hooks carried a styleguide avoid phrase, and
  // `vibrant` alone was 95 of ~124 hits. That is the number this exists to move.
  //
  // It ships `off`. This is a LIVE pipeline writing to published city columns,
  // and the arm that runs by default must be the one that was measured, not the
  // one that looked right — prepending ~13.5k characters to a 1.8k bare-JSON
  // prompt is exactly the change that can silently stop returning parseable
  // JSON, which degrades to "nothing enriched" rather than to bad content.
  //
  // Precedence: an explicit body param (the A/B, used with dry_run) beats the
  // registry, which is the production lever — flip it with a plain UPDATE on
  // admin_automations.conditions, no migration and no deploy, the same shape as
  // the dedup sweep's `mode`.
  const VOICE_VALUES: readonly string[] = ['off', 'compact', 'core', 'full']
  let voice: VoiceSetting = 'off'
  if (typeof body.voice === 'string' && VOICE_VALUES.includes(body.voice)) {
    voice = body.voice as VoiceSetting
  } else {
    const { data: reg } = await supabase
      .from('admin_automations').select('conditions').eq('slug', 'city_agentic_enrich').maybeSingle()
    const want = (reg?.conditions as Record<string, unknown> | null)?.voice
    // An unrecognised value falls back to `off` rather than throwing: a typo in
    // a hand-edited registry row must not take the hourly cron down.
    if (typeof want === 'string' && VOICE_VALUES.includes(want)) voice = want as VoiceSetting
  }

  // Daily cap — central llm_budget ledger (migration 20260817090000; STEP is
  // the caller_key, seeded 120/day): probe with n=0 (spends nothing), then one
  // consume per LLM attempt in the loop. body.daily_cap can only LOWER the
  // effective cap for a run; raising it past the ledger cap needs an UPDATE on
  // llm_budget. RPC missing (fn deployed ahead of the migration) → the legacy
  // enrichment_log count keeps the old behavior unchanged.
  const probe = await consumeLlmBudget(supabase, STEP, 0)
  const budgetDegraded = probe.degraded
  let remaining: number
  if (budgetDegraded) {
    const since = new Date(); since.setUTCHours(0, 0, 0, 0)
    const { count: doneToday } = await supabase
      .from('enrichment_log').select('id', { count: 'exact', head: true })
      .eq('step', STEP).eq('status', 'done').gte('created_at', since.toISOString())
    if (!cityIds?.length && (doneToday ?? 0) >= dailyCap) {
      return jsonResponse({ enriched: 0, capped: true, done_today: doneToday, daily_cap: dailyCap }, 200, req)
    }
    remaining = cityIds?.length ? batchLimit : Math.min(batchLimit, dailyCap - (doneToday ?? 0))
  } else {
    const capEff = body.daily_cap != null ? Math.min(dailyCap, probe.cap ?? dailyCap) : (probe.cap ?? dailyCap)
    const left = Math.max(0, capEff - (probe.spent ?? 0))
    if (!cityIds?.length && left <= 0) {
      return jsonResponse({ enriched: 0, capped: true, done_today: probe.spent, daily_cap: capEff }, 200, req)
    }
    remaining = cityIds?.length ? batchLimit : Math.min(batchLimit, left)
  }

  let query = supabase
    .from('cities')
    .select('id, name, slug, region_name, description, best_time_to_visit, local_customs, official_website, completeness_score, enrichment_status, wikipedia_title, country_id, countries(name, equality_score, lgbti_criminalization)')
    .is('duplicate_of_id', null)
  if (cityIds?.length) {
    query = query.in('id', cityIds)
  } else {
    query = query
      .not('slug', 'like', 'tmp-%')
      .lt('completeness_score', COMPLETENESS_CEILING)
      .order('completeness_score', { ascending: true })
      // Tiebreaker. Without it a stable low-completeness tail is re-picked every
      // hour while the daily cap burns on the same cities.
      .order('last_refreshed_at', { ascending: true, nullsFirst: true })
      .limit(remaining)
  }
  const { data: cities, error } = await query
  if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
  if (!cities?.length) return jsonResponse({ enriched: 0, message: 'no thin cities to enrich' }, 200, req)

  let enriched = 0, gated = 0, skipped = 0
  const results: Array<Record<string, unknown>> = []

  for (const c of cities) {
    const started = Date.now()
    let status = 'skipped'
    let failReason: string | null = null
    try {
      // Grounding sources: Wikipedia extract + official site page.
      const country = (c.countries as { name?: string } | null)?.name
      const sources: { url: string; text: string }[] = []
      // Prefer the enwiki sitelink title cached by city-factual-backfill. Looking
      // the page up by cities.name is what produced 3,590 `no_sources` skips in
      // 30 days — the import residue ("Kapstadt, Südafrika") 404s the title API.
      const titles = c.wikipedia_title
        ? [c.wikipedia_title]
        : cityNameCandidates(c.name, { country }).queries
      let wpExtract: string | null = null
      let wpTitle: string | null = null
      for (const t of titles) {
        wpExtract = await fetchWikipediaExtract(t)
        if (wpExtract) { wpTitle = t; break }
      }

      // The extract must actually be about THIS city. `redirects=1` follows a bare
      // name wherever it leads, so "Daphne" served the Greek myth and auto-published
      // it to /city/daphne; a disambiguation page carries a long enough extract to
      // pass the length check and reads to the model as "no information available".
      // See _shared/city-wiki-guard.ts for the 14 measured rows.
      const identity = { name: c.name, region_name: c.region_name, countryName: country }
      let wpVerdict = cityWikiVerdict(wpExtract, identity)
      if (!wpVerdict.adopt && wpExtract) {
        // Retry under Wikipedia's own convention for a shared name. Reachable ONLY
        // after a refusal, so a city that resolves correctly today never enters this
        // path — which is why the retry needs no separate false-positive measurement.
        const qualified = regionQualifiedTitle(identity)
        if (qualified) {
          const retry = await fetchWikipediaExtract(qualified)
          const retryVerdict = cityWikiVerdict(retry, identity)
          if (retryVerdict.adopt) {
            wpExtract = retry
            wpTitle = qualified
            wpVerdict = retryVerdict
          }
        }
      }
      const wikiRefused = !!wpExtract && !wpVerdict.adopt
      if (wikiRefused) {
        console.log(`[city-agentic-enrich] wiki source refused for ${c.name}: ` +
          `${wpVerdict.reason}${wpVerdict.detail ? ` — ${wpVerdict.detail}` : ''}`)
        wpExtract = null
      }

      if (wpExtract) sources.push({ url: `https://en.wikipedia.org/wiki/${encodeURIComponent(wpTitle ?? c.name)}`, text: wpExtract })
      if (c.official_website) { const site = await fetchCityPage(c.official_website); if (site) sources.push({ url: c.official_website, text: site }) }
      // A refused wiki source must NOT fall through to the existing description: that
      // description was written from the same bad article, so re-feeding it launders
      // the wrong subject into a fresh run. Prose may not vouch for its own source.
      if (c.description && !wpExtract && !wikiRefused) sources.push({ url: 'existing', text: c.description })
      if (!sources.length) { skipped++; results.push({ id: c.id, status: 'no_sources' }); await logStep(supabase, c.id, status, started, dryRun, 'no_sources'); continue }

      // Destination safety context.
      let safetyContext: string | undefined
      const co = c.countries as { name?: string; equality_score?: number; lgbti_criminalization?: Record<string, unknown> } | null
      if (co) {
        const crim = (co.lgbti_criminalization ?? {}) as Record<string, unknown>
        const legal = crim.legal === false ? `criminalized${typeof crim.penalty === 'string' && crim.penalty ? ` (${crim.penalty})` : ''}`
          : crim.legal === true ? 'legal' : 'n/a'
        safetyContext = `${co.name}: equality_score=${co.equality_score ?? 'n/a'}, legal_status=${legal}`
      }

      // Central budget: one unit per LLM attempt (no_sources skips above never
      // consume). Explicit city_ids runs keep their historical cap bypass — a
      // denial then just goes unrecorded.
      if (!budgetDegraded) {
        const spend = await consumeLlmBudget(supabase, STEP, 1)
        if (!spend.allowed && !cityIds?.length) {
          return jsonResponse({ enriched, gated, skipped, capped: true, daily_cap: spend.cap, results }, 200, req)
        }
      }

      let ai: CityMoatEnrichment | null = null
      try {
        ai = await withCircuitBreaker(supabase, 'llm.openai.city-enrich', () =>
          researchEnrichCityFromSources(supabase, {
            name: c.name, country, region: c.region_name, existingDescription: c.description, sources, safetyContext,
            voice,
          }))
      } catch (e) {
        if (e instanceof CircuitOpenError) return jsonResponse({ enriched, gated, skipped, circuit_open: true, results }, 200, req)
        throw e
      }
      if (!ai) { skipped++; results.push({ id: c.id, status: 'no_ai' }); await logStep(supabase, c.id, status, started, dryRun, 'no_ai'); continue }

      const confidence = typeof ai.confidence === 'number' ? ai.confidence : 0.5
      const highConf = confidence >= AUTO_APPLY_CONFIDENCE
      const citations = Array.isArray(ai.citations) ? ai.citations : []

      // --- Auto-apply NARRATIVE fields (empty only, high confidence) ---
      const update: Record<string, unknown> = {}
      if (highConf) {
        if (ai.description && (!c.description || String(c.description).trim().length < 80)) update.description = ai.description
        if (ai.local_customs && !c.local_customs) update.local_customs = ai.local_customs
      }
      update.enrichment_status = { ...(c.enrichment_status ?? {}), agentic: { at: new Date().toISOString(), confidence, ...ai } }
      update.last_refreshed_at = new Date().toISOString()

      // --- Review-gate SAFETY-SENSITIVE fields (never auto-publish) ---
      const queued: string[] = []
      const ratingValid = typeof ai.lgbt_friendly_rating === 'number'
        && Number.isFinite(ai.lgbt_friendly_rating)
        && citations.length > 0   // rating MUST be cited or it is not produced
      const gatedProposals: { field: string; value: unknown; cite: typeof citations }[] = []
      if (ratingValid) {
        const r = Math.max(1, Math.min(5, Math.round(ai.lgbt_friendly_rating as number)))
        gatedProposals.push({ field: 'lgbt_friendly_rating', value: { value: r, scale: '1-5', rationale: ai.rating_rationale ?? null }, cite: citations.filter(x => x?.field === 'lgbt_friendly_rating' || x?.field === 'rating') })
      }
      // safety_notes is no longer LLM-generated — it is composed deterministically by
      // the SQL compose_safety_note() / city safety backfill (migration 20260608000001).
      if (ai.editorial_hook) gatedProposals.push({ field: 'editorial_hook', value: { value: ai.editorial_hook }, cite: citations.filter(x => x?.field === 'editorial_hook' || x?.field === 'hook') })
      // Still fill-if-empty: a city that already carries a best_time_to_visit keeps it,
      // and queueing a proposal against it would invite a reviewer to overwrite curated
      // text. Deliberately NOT gated on highConf, following editorial_hook — a human
      // reads it either way and the row carries its own confidence.
      if (ai.best_time_to_visit && !c.best_time_to_visit) {
        gatedProposals.push({
          field: 'best_time_to_visit',
          value: { value: ai.best_time_to_visit },
          cite: citations.filter(x => x?.field === 'best_time_to_visit' || x?.field === 'best_time'),
        })
      }

      if (skipGated) gatedProposals.length = 0
      if (gatedProposals.length) update.needs_attention = true

      if (!dryRun) {
        await supabase.from('cities').update(update).eq('id', c.id)
        for (const g of gatedProposals) {
          await supabase.from('city_review_queue').delete().eq('city_id', c.id).eq('field', g.field).eq('status', 'open')
          await supabase.from('city_review_queue').insert({
            city_id: c.id, field: g.field, proposed_value: g.value,
            citations: g.cite.length ? g.cite : citations, confidence, model: 'gpt-4o-mini', status: 'open',
          })
          queued.push(g.field)
        }
        await supabase.from('city_quality_signals').insert({
          city_id: c.id, signal_type: 'enrichment', value: Math.round(confidence * 10000) / 10000,
          source: STEP, details: { applied: Object.keys(update).filter(k => !['enrichment_status', 'last_refreshed_at', 'needs_attention'].includes(k)), gated: queued },
        })
        await supabase.from('city_consensus_audit').insert({
          city_id: c.id, field: queued.join(','), winning_source: 'llm', confidence,
          action: queued.length ? 'review_gated' : 'auto_commit',
          details: { auto_fields: Object.keys(update).filter(k => !['enrichment_status', 'last_refreshed_at', 'needs_attention'].includes(k)), gated_fields: queued, citations },
        }).then(() => {}, () => {})
      }

      status = 'done'
      const autoCount = Object.keys(update).filter(k => !['enrichment_status', 'last_refreshed_at', 'needs_attention'].includes(k)).length
      if (autoCount) enriched++
      if (queued.length) gated++
      // A dry run that hides what the model produced cannot be used to evaluate
      // a prompt change — which is the only way to compare voice arms on real
      // sources without writing. Dry-run only: the live response stays a
      // counts-and-ids summary.
      results.push({
        id: c.id, name: c.name, confidence, auto_filled: autoCount, gated: queued,
        ...(dryRun
          ? {
              proposal: {
                description: ai.description ?? null,
                editorial_hook: ai.editorial_hook ?? null,
                best_time_to_visit: ai.best_time_to_visit ?? null,
                local_customs: ai.local_customs ?? null,
                lgbt_friendly_rating: ai.lgbt_friendly_rating ?? null,
                citations: citations.length,
              },
              voice_profile: ai.voice_profile ?? voice,
              voice_system_chars: ai.voice_system_chars ?? null,
            }
          : {}),
      })
    } catch (e) {
      status = 'failed'
      failReason = (e instanceof Error ? e.message : String(e)).slice(0, 200)
      results.push({ id: c.id, status: 'error', error: failReason })
    }
    await logStep(supabase, c.id, status, started, dryRun, failReason)
  }

  return jsonResponse({ enriched, gated, skipped, skip_gated: skipGated, dry_run: dryRun, voice, results }, 200, req)
})

/**
 * Every non-done outcome carries a reason. Without one, 3,590 identical bare
 * `skipped` rows over 30 days were indistinguishable from "nothing to do" — which
 * is exactly how this function's starvation went unnoticed.
 */
async function logStep(
  supabase: ReturnType<typeof getServiceClient>, cityId: string, status: string,
  started: number, dryRun: boolean, reason?: string | null,
) {
  if (dryRun) return
  await supabase.from('enrichment_log').insert({
    entity_type: 'city', entity_id: cityId, step: STEP, status,
    error_message: status === 'done' ? null : (reason ?? null),
    duration_ms: Date.now() - started,
  }).then(() => {}, () => {})
}
