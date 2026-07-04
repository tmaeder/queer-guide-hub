import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import { chatCompletion } from '../_shared/openai-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'

// Backfill LLM enrichment over ALREADY-COMMITTED rows (not staging). Targets:
//   news          → geo country_ids (where empty) + lgbti_relevance_score + classified_at
//   events        → lgbti_relevance_score + classified_at (events already carry geo)
//   venues        → lgbti_relevance_score + classified_at
//   personalities → lgbti_relevance_score + classified_at
//   marketplace   → lgbti_relevance_score + classified_at  (marketplace_listings)
//
// Only news does geo; everyone else is relevance-only. The lgbti_relevance_score +
// classified_at columns are DISJOINT from the columns the other session's venue-geocode job
// writes (lat/lng/city/country) → concurrent per-row writes are row-lock-safe, no clobber.
//
// Uses chatCompletion() → Cloudflare Workers AI (Llama 8B by default; cheap) under the
// 'llm.openai.enrich-news' circuit breaker. No response_format json_object (CF /ai/v1 hangs on
// it — see audit notes); we prompt for JSON and parse defensively.
//
// Resumable + idempotent: driven off classified_at IS NULL (set after every attempt). Disjoint
// id-range shards (id_gte/id_lt) let the driver parallelise safely. Per-row writes stay under
// the search_documents_sync() reindex-trigger timeout.

const BAL = /\{[\s\S]*\}/

function parseJson(text: unknown): Record<string, unknown> | null {
  if (text == null) return null
  if (typeof text === 'object') return text as Record<string, unknown> // CF may return already-structured response
  const s = String(text)
  const m = s.match(BAL)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

function clamp01(v: unknown): number | null {
  const n = Number(v)
  if (!isFinite(n)) return null
  return Math.max(0, Math.min(1, n))
}

const NEWS_SYS =
  'You classify LGBTQ+ news articles. Reply with ONLY a compact JSON object, no prose. ' +
  'Schema: {"countries":["ISO2",...],"relevance":0.0-1.0}. ' +
  '"countries" = ISO 3166-1 alpha-2 codes of the countries the article is primarily ABOUT ' +
  '(its geographic subject), NOT countries merely mentioned in passing or only present as a ' +
  'publisher name. Use [] for global/none/celebrity items with no clear country. ' +
  '"relevance" = how relevant the article is to LGBTQ+ people/rights/culture (1.0 = centrally about it, 0.0 = unrelated).'

const REL_ONLY = (what: string, hi: string) =>
  `You rate how relevant ${what} is to LGBTQ+ people/community. Reply with ONLY a compact JSON ` +
  `object: {"relevance":0.0-1.0} (1.0 = ${hi}, 0.0 = no LGBTQ+ relevance). No prose.`

type Row = Record<string, unknown>
interface TargetCfg {
  table: string
  cols: string
  geo: boolean
  sys: string
  user: (r: Row) => string
}

const TARGETS: Record<string, TargetCfg> = {
  news: {
    table: 'news_articles', cols: 'id, title, excerpt, content, country_ids', geo: true, sys: NEWS_SYS,
    user: (r) => `TITLE: ${r.title ?? ''}\nEXCERPT: ${String(r.excerpt ?? '').slice(0, 400)}\nBODY: ${String(r.content ?? '').slice(0, 800)}`,
  },
  events: {
    table: 'events', cols: 'id, title, description', geo: false,
    sys: REL_ONLY('an event', 'an LGBTQ+/Pride/queer event'),
    user: (r) => `TITLE: ${r.title ?? ''}\nABOUT: ${String(r.description ?? '').slice(0, 600)}`,
  },
  venues: {
    table: 'venues', cols: 'id, name, category, city, description', geo: false,
    // Conservative: most venues have thin descriptions, so an 8B model over-scores generic
    // bars/hotels if invited to. Only a CLEAR signal earns a high score; absent that → low.
    sys:
      'You rate how relevant a venue is to LGBTQ+ people. Reply with ONLY a compact JSON object: ' +
      '{"relevance":0.0-1.0}. Score HIGH (0.8-1.0) ONLY when the name or description gives a CLEAR ' +
      'LGBTQ+ signal (words like gay, queer, lesbian, trans, drag, bear, fetish/cruise, rainbow/pride, ' +
      'or a known LGBTQ+ bar/sauna/bookstore/community center). Score 0.0-0.2 for ordinary venues ' +
      '(generic bars, restaurants, cafés, hotels, shops, parks) with no explicit LGBTQ+ indication. ' +
      'Do NOT assume relevance just because it is a bar/club or appears on an LGBTQ+ platform. No prose.',
    user: (r) => `NAME: ${r.name ?? ''}\nCATEGORY: ${r.category ?? ''}\nCITY: ${r.city ?? ''}\nABOUT: ${String(r.description ?? '').slice(0, 500)}`,
  },
  personalities: {
    table: 'personalities', cols: 'id, name, profession, lgbti_connection, bio, description', geo: false,
    sys: REL_ONLY('a person', 'a central LGBTQ+ figure, icon, or activist'),
    user: (r) => `NAME: ${r.name ?? ''}\nPROFESSION: ${r.profession ?? ''}\nLGBTQ CONNECTION: ${r.lgbti_connection ?? ''}\nBIO: ${String(r.bio ?? r.description ?? '').slice(0, 500)}`,
  },
  marketplace: {
    table: 'marketplace_listings', cols: 'id, title, brand, category, description', geo: false,
    sys: REL_ONLY('a product', 'an explicitly LGBTQ+/Pride product'),
    user: (r) => `TITLE: ${r.title ?? ''}\nBRAND: ${r.brand ?? ''}\nCATEGORY: ${r.category ?? ''}\nABOUT: ${String(r.description ?? '').slice(0, 400)}`,
  },
}

async function llm(supabase: ReturnType<typeof getServiceClient>, system: string, user: string, model: string) {
  return withCircuitBreaker(supabase, 'llm.openai.enrich-news', () =>
    chatCompletion(supabase, {
      model,
      temperature: 0.1,
      max_tokens: 120,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  // Fail-closed: no literal fallback secret — WEBHOOK_SECRET must be set.
  if (!hasValidWebhookSecret(req, 'WEBHOOK_SECRET')) return errorResponse('Unauthorized', 401, req)

  try {
    const body = await req.json().catch(() => ({}))
    const target = (body.target ?? 'news') as string
    const cfg = TARGETS[target]
    if (!cfg) return errorResponse(`unknown target '${target}'`, 400, req)
    const batchSize = Math.min(50, body.batch_size ?? 20)
    const model = (body.model as string) || '@cf/meta/llama-3.1-8b-instruct'
    const idGte = body.id_gte as string | undefined
    const idLt = body.id_lt as string | undefined
    const dryRun = body.dry_run === true

    // ISO2 → country_id map (news geo only).
    let codeToId: Map<string, string> | null = null
    if (cfg.geo) {
      const { data: countries } = await supabase.from('countries').select('id, code')
      codeToId = new Map()
      for (const c of countries ?? []) if (c.code) codeToId.set(String(c.code).toUpperCase(), c.id)
    }

    let qb = supabase.from(cfg.table).select(cfg.cols)
      .is('classified_at', null).is('duplicate_of_id', null)
    if (idGte) qb = qb.gte('id', idGte)
    if (idLt) qb = qb.lt('id', idLt)
    const { data: rows, error } = await qb.order('id', { ascending: true }).limit(batchSize)
    if (error) return errorResponse(`load ${target}: ${error.message}`, 500, req)
    if (!rows || rows.length === 0) return jsonResponse({ success: true, target, processed: 0, message: 'done' }, 200, req)

    let processed = 0, updated = 0, geo = 0, failed = 0, circuitOpen = false

    for (const r of rows as Row[]) {
      processed++
      let res
      try { res = await llm(supabase, cfg.sys, cfg.user(r), model) }
      catch (e) {
        if (e instanceof CircuitOpenError) { circuitOpen = true; processed--; break }
        failed++; continue
      }
      const j = parseJson(res?.content)
      const relevance = j ? clamp01(j.relevance) : null

      const ids: string[] = []
      if (cfg.geo && j && Array.isArray(j.countries)) {
        for (const c of j.countries) {
          const id = codeToId!.get(String(c).toUpperCase())
          if (id && !ids.includes(id)) ids.push(id)
        }
      }
      if (dryRun) { updated++; if (ids.length) geo++; continue }

      const patch: Record<string, unknown> = { classified_at: new Date().toISOString() }
      if (relevance !== null) patch.lgbti_relevance_score = relevance
      if (cfg.geo && ids.length) {
        const had = Array.isArray((r as Row).country_ids) && ((r as Row).country_ids as unknown[]).length > 0
        if (!had) { patch.country_ids = ids; geo++ }
      }
      const { error: upErr } = await supabase.from(cfg.table).update(patch).eq('id', r.id)
      if (upErr) { failed++; continue }
      updated++
    }

    return jsonResponse({ success: true, target, processed, updated, geo, failed, circuit_open: circuitOpen, dry_run: dryRun }, 200, req)
  } catch (error) {
    console.error('backfill-llm-enrich:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
