import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { llmChatCompletion } from '../_shared/llm-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Pipeline Enrich (Places) — drafts editorial_hook + (optional) editorial_long
// for countries / cities / queer_villages that don't have one yet. Drafts land
// in `editorial_drafts` for human review at /admin/places-editorial. Approved
// drafts copy through to the entity's editorial_hook via approve_editorial_draft.

type EntityType = 'country' | 'city' | 'village'

interface DraftCandidate {
  entity_type: EntityType
  entity_id: string
  name: string
  context: string
  needs_long: boolean
}

const HOOK_SYSTEM = `You write one-line editorial hooks for an LGBTQ+ travel guide.

Rules (hard):
- Maximum 120 characters. Single line. No trailing period unless mid-sentence.
- Direct factual voice. Concrete, specific, useful.
- Banned words: discover, explore, unlock, curated, journey, amazing, tailored, personalized, vibrant, charming, hidden gem.
- No metaphors, no marketing fluff, no second-person ("you / your").
- LGBTQ+ relevance must be evident but never forced.

Output JSON only: {"hook": "..."} — no prose, no markdown.`

const LONG_SYSTEM = `You write 3-6 sentence editorial paragraphs for an LGBTQ+ travel guide hero feature.

Rules:
- Direct factual voice. Concrete, specific.
- Same banned words and tone as the one-line hook.
- Cover: what makes the place notable for LGBTQ+ travelers, one safety/legality note, one cultural anchor (neighborhood, event, person, era).

Output JSON only: {"long": "..."} — no prose, no markdown.`

Deno.serve(withErrorReporting('pipeline-enrich-places', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  if (req.method !== 'POST') return errorResponse('POST only', 405, req)

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const entityType = (body.entity_type ?? 'country') as EntityType
    const batchSize  = Math.min(50, Number(body.batch_size ?? 10))
    const includeLong = body.include_long === true
    const onlyIds    = Array.isArray(body.entity_ids) ? (body.entity_ids as string[]) : null
    const dryRun     = body.dry_run === true

    if (!['country', 'city', 'village'].includes(entityType)) {
      return errorResponse(`invalid entity_type: ${entityType}`, 400, req)
    }

    const candidates = await loadCandidates(supabase, entityType, batchSize, onlyIds)
    if (candidates.length === 0) {
      return jsonResponse({ success: true, drafted: 0, message: 'nothing to enrich' }, 200, req)
    }

    let drafted = 0
    let failed = 0
    const errors: string[] = []

    for (const c of candidates) {
      try {
        const hook = await draftHook(c)
        const long = (includeLong && c.needs_long) ? await draftLong(c) : null

        if (!dryRun) {
          const { error } = await supabase.from('editorial_drafts').insert({
            entity_type: c.entity_type,
            entity_id:   c.entity_id,
            draft_hook:  hook,
            draft_long:  long,
            status:      'pending',
            model:       'llm-default',
          })
          if (error) {
            failed++
            errors.push(`${c.entity_type}:${c.entity_id} insert: ${error.message}`)
            continue
          }
        }
        drafted++
      } catch (e) {
        failed++
        errors.push(`${c.entity_type}:${c.entity_id} llm: ${(e as Error).message}`)
      }
    }

    return jsonResponse({
      success: true,
      drafted,
      failed,
      candidates: candidates.length,
      errors: errors.slice(0, 5),
      dry_run: dryRun,
    }, 200, req)
  } catch (e) {
    return errorResponse((e as Error).message, 500, req)
  }
}))

// ---------------------------------------------------------------------------
// Candidate loading: pull entities lacking editorial_hook AND lacking a
// pending/approved draft (so we don't queue duplicates).
// ---------------------------------------------------------------------------

async function loadCandidates(
  supabase: SupabaseClient,
  entityType: EntityType,
  batchSize: number,
  onlyIds: string[] | null,
): Promise<DraftCandidate[]> {
  const table  = entityType === 'country' ? 'countries'
              : entityType === 'city'    ? 'cities'
              : 'queer_villages'

  const select = entityType === 'country'
    ? 'id, name, capital, code, population'
    : entityType === 'city'
    ? 'id, name, region_name, country_id, population, is_capital'
    : 'id, name, slug, description'

  let q = supabase.from(table).select(select).is('editorial_hook', null).limit(batchSize)
  if (onlyIds) q = q.in('id', onlyIds)

  const { data: rows, error } = await q
  if (error || !rows) return []

  // Exclude entities already in pending/approved drafts.
  const ids = rows.map((r: { id: string }) => r.id)
  if (ids.length === 0) return []

  const { data: existing } = await supabase
    .from('editorial_drafts')
    .select('entity_id')
    .eq('entity_type', entityType)
    .in('status', ['pending', 'approved'])
    .in('entity_id', ids)

  const skip = new Set((existing ?? []).map((d: { entity_id: string }) => d.entity_id))

  return rows
    .filter((r: { id: string }) => !skip.has(r.id))
    .map((r: Record<string, unknown>) => ({
      entity_type: entityType,
      entity_id:   r.id as string,
      name:        (r.name as string) ?? '',
      context:     buildContext(entityType, r),
      needs_long:  entityType === 'country',
    }))
}

function buildContext(entityType: EntityType, r: Record<string, unknown>): string {
  if (entityType === 'country') {
    const bits = [
      r.capital     ? `Capital: ${r.capital}` : null,
      r.code        ? `ISO: ${r.code}` : null,
      r.population  ? `Population: ${r.population}` : null,
    ].filter(Boolean)
    return bits.join('. ')
  }
  if (entityType === 'city') {
    const bits = [
      r.region_name ? `Region: ${r.region_name}` : null,
      r.population  ? `Population: ${r.population}` : null,
      r.is_capital  ? 'Capital city' : null,
    ].filter(Boolean)
    return bits.join('. ')
  }
  return String(r.description ?? '').slice(0, 400)
}

// ---------------------------------------------------------------------------
// LLM calls
// ---------------------------------------------------------------------------

async function draftHook(c: DraftCandidate): Promise<string> {
  const userMsg = `Place: ${c.name}\nType: ${c.entity_type}\n${c.context}\n\nWrite one hook.`
  const res = await llmChatCompletion({
    messages: [
      { role: 'system', content: HOOK_SYSTEM },
      { role: 'user',   content: userMsg },
    ],
    temperature: 0.4,
    max_tokens: 200,
    response_format: { type: 'json_object' },
  })
  const parsed = parseJson(res.content)
  const hook = (parsed?.hook ?? '').trim()
  if (!hook) throw new Error('empty hook')
  if (hook.length > 140) throw new Error(`hook too long: ${hook.length} chars`)
  return hook
}

async function draftLong(c: DraftCandidate): Promise<string> {
  const userMsg = `Place: ${c.name}\nType: ${c.entity_type}\n${c.context}\n\nWrite the paragraph.`
  const res = await llmChatCompletion({
    messages: [
      { role: 'system', content: LONG_SYSTEM },
      { role: 'user',   content: userMsg },
    ],
    temperature: 0.5,
    max_tokens: 500,
    response_format: { type: 'json_object' },
  })
  const parsed = parseJson(res.content)
  const long = (parsed?.long ?? '').trim()
  if (!long) throw new Error('empty long')
  return long
}

function parseJson(s: string): Record<string, string> | null {
  try {
    return JSON.parse(s) as Record<string, string>
  } catch {
    const m = s.match(/\{[\s\S]*\}/)
    if (!m) return null
    try { return JSON.parse(m[0]) as Record<string, string> } catch { return null }
  }
}
