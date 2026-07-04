// Phase 3a of the personalities content-quality remediation
// (docs/plans/2026-06-07-personalities-content-quality-design.md).
//
// The Wikidata-absent residue is 94% bare names (no URL, bio, socials) — an LLM
// "researching" those would fabricate identity claims about possibly-private
// people, the exact outing/misID harm the platform exists to prevent. So the
// only safe LLM residual is GROUNDED EXTRACTION: for the minority of unanchored
// rows that already carry a substantive bio, pull the FACTUAL fields
// (birth/death year, profession, nationality) STRICTLY from that bio text — never
// inventing, never using outside knowledge — fill only blanks, then re-queue the
// row so the Wikidata resolver gets a second pass now that it has a birth year /
// profession to disambiguate on.
//
// Deliberately does NOT write lgbti_connection: deriving a sensitive identity
// claim from an unverified scraped bio and then letting it satisfy the outing
// guard via its own self-provenance row would be circular. The connection stays
// Wikidata-sourced (P91/P21) or human-curated.
//
// Auth: X-Webhook-Secret (cron) or admin/service-role. Body:
//   { batch_size?, dry_run?, model? }

import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import { chatCompletion } from '../_shared/openai-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'

const BAL = /\{[\s\S]*\}/

function parseJson(text: unknown): Record<string, unknown> | null {
  if (text == null) return null
  if (typeof text === 'object') return text as Record<string, unknown>
  const m = String(text).match(BAL)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

function intYear(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isInteger(n)) return null
  if (n < 1000 || n > 2100) return null
  return n
}

function cleanStr(v: unknown, max = 80): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'unknown') return null
  return s.slice(0, max)
}

const SYS =
  'You extract biographical facts from a provided BIO about a person. Output ONLY a compact ' +
  'JSON object, no prose. Use a value ONLY if it is explicitly stated in the BIO text. If a field ' +
  'is not explicitly stated in the BIO, use null. NEVER guess, infer, or use any knowledge beyond ' +
  'the BIO itself. Schema: {"birth_year":int|null,"death_year":int|null,"profession":string|null,' +
  '"nationality":string|null}. profession = a short occupation label (e.g. "writer", "activist"). ' +
  'nationality = a demonym or country (e.g. "American", "Germany").'

async function llm(supabase: ReturnType<typeof getServiceClient>, user: string, model: string) {
  return withCircuitBreaker(supabase, 'llm.openai.enrich-news', () =>
    chatCompletion(supabase, {
      model,
      temperature: 0.0,
      max_tokens: 120,
      messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }],
    }))
}

type Row = Record<string, unknown>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  // Fail-closed: no literal fallback secret — WEBHOOK_SECRET must be set.
  if (!hasValidWebhookSecret(req, 'WEBHOOK_SECRET')) return errorResponse('Unauthorized', 401, req)

  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = Math.min(50, body.batch_size ?? 20)
    const model = (body.model as string) || '@cf/meta/llama-3.1-8b-instruct'
    const dryRun = body.dry_run === true

    // Unanchored, non-archived rows with a substantive bio but at least one
    // missing structured field. Self-grounded only.
    const { data: rows, error } = await supabase
      .from('personalities')
      .select('id, name, bio, birth_date, death_date, profession, nationality')
      .is('wikidata_qid', null)
      .is('duplicate_of_id', null)
      .neq('review_status', 'archived')
      .not('bio', 'is', null)
      .or('birth_date.is.null,profession.is.null,nationality.is.null')
      .limit(batchSize * 2)
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!rows?.length) return jsonResponse({ success: true, processed: 0, message: 'done' }, 200, req)

    let processed = 0, updated = 0, requeued = 0, failed = 0, circuitOpen = false
    const results: Row[] = []

    for (const r of rows as Row[]) {
      const bio = String(r.bio ?? '')
      if (bio.trim().length < 120) continue // substantive only
      if (processed >= batchSize) break
      processed++

      let res
      try { res = await llm(supabase, `NAME: ${r.name ?? ''}\nBIO: ${bio.slice(0, 1500)}`, model) }
      catch (e) {
        if (e instanceof CircuitOpenError) { circuitOpen = true; processed--; break }
        failed++; continue
      }
      const j = parseJson(res?.content)
      if (!j) { failed++; continue }

      const by = intYear(j.birth_year)
      const dy = intYear(j.death_year)
      const prof = cleanStr(j.profession)
      const nat = cleanStr(j.nationality)

      // Fill ONLY blank columns. Year-only dates use Jan 1 (the resolver
      // disambiguates on year; month/day are not claimed precisely elsewhere).
      const patch: Record<string, unknown> = {}
      if (by && r.birth_date == null) patch.birth_date = `${String(by).padStart(4, '0')}-01-01`
      if (dy && r.death_date == null) patch.death_date = `${String(dy).padStart(4, '0')}-01-01`
      if (prof && r.profession == null) patch.profession = prof
      if (nat && r.nationality == null) patch.nationality = nat

      const changed = Object.keys(patch)
      results.push({ id: r.id, name: r.name, extracted: changed })
      if (!changed.length || dryRun) { if (changed.length) updated++; continue }

      // Re-queue for a Wikidata pass now that the row has a birth year / profession.
      patch.last_refreshed_at = null
      patch.updated_at = new Date().toISOString()

      const { error: upErr } = await supabase.from('personalities').update(patch).eq('id', r.id)
      if (upErr) { failed++; results[results.length - 1].error = upErr.message; continue }
      updated++; requeued++

      await supabase.from('personality_sources').upsert({
        personality_id: r.id, source_slug: 'self-bio', source_entity_id: String(r.id),
        source_url: null, confidence: 0.5, is_primary: false, last_seen_at: new Date().toISOString(),
        raw: { extracted: changed, grounded_in: 'own bio text', note: 'factual fields only; no identity claim' },
      }, { onConflict: 'source_slug,source_entity_id' })
    }

    return jsonResponse({ success: true, processed, updated, requeued, failed, circuit_open: circuitOpen, dry_run: dryRun, results }, 200, req)
  } catch (error) {
    console.error('personality-extract-from-bio:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
