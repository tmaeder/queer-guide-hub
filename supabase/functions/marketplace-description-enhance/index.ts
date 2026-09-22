import {
  getServiceClient,
  getCorsHeaders,
  corsResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'
import { consumeLlmBudget } from '../_shared/llm-budget.ts'
import { marketplaceDescriptionFromRaw } from '../_shared/marketplace-description.ts'

// ============================================================
// marketplace-description-enhance — translate + clean poor marketplace
// descriptions into one concise, factual English paragraph.
//
// Phase 1 target: ohmyfantasy.com (~6.1k listings) is a German-only store, so 28%
// of the catalog shipped German descriptions on an English-default site. This fn
// translates DE→EN and strips merchant boilerplate (size charts, care/wash,
// shipping, composition tables, SKUs, marketing slop), preserving the original
// in description_i18n (under its source-lang key + _original) for reversibility
// and locale serving.
//
// LLM: Cloudflare Workers AI is the primary provider (CF_ACCOUNT_ID + CF_AI_API_TOKEN,
// native /ai/run endpoint — the /ai/v1 compat endpoint hangs on JSON mode; response
// can be string|object so we coerce). Anthropic Haiku is only a fallback if CF creds
// are absent. (ANTHROPIC_API_KEY is not configured project-wide anyway.)
//
// Body: { merchant_domain?, batch_size?, dry_run?, model? ('@cf/...' opt-in strong model) }
// Cost: cheap 8B default + central llm_budget daily cap (500/day).
// ============================================================

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' } })
const client = () => getServiceClient()

const SYSTEM_PROMPT = `You rewrite e-commerce product descriptions for the queer.guide marketplace. Given a product title and its source description (often German), return ONE concise, factual ENGLISH paragraph (40-600 characters) describing what the product IS and its key real features. RULES: translate to natural English if not English; remove duplicated specifications, shipping/returns/payment, SKU/article numbers, store policy, and marketing slop (discover, curated, elevate, premium experience, must-have); PRESERVE factual measurements, materials, care instructions, and safety information; keep adult/fetish wording factual, plain, neutral; do NOT invent sizes, materials, measurements, brands, or claims not in the source; if already clean English just tighten it. Return ONLY minified JSON, no markdown: {"description":"...","source_lang":"de|en|fr|other"}`

function coerce(x: unknown): string {
  if (typeof x === 'string') return x
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>
    return String(o.response ?? o.text ?? JSON.stringify(o))
  }
  return String(x ?? '')
}

async function callAnthropic(apiKey: string, title: string, source: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: `Title: ${title}\nSource:\n${(source || '').slice(0, 1500)}` }] }) })
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 120)}`)
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

async function callWorkersAI(acct: string, token: string, title: string, source: string, modelOverride?: string): Promise<string> {
  // Cheap 8B by default (the _shared/openai-client.ts fleet default). This fn
  // runs on a */5 cron and its old default was the ~9x-pricier 70B — the single
  // largest mis-priced LLM call site behind invoice IN-72568830. The strong
  // model stays reachable per-run (body.model) or fleet-wide (CF_AI_MODEL).
  const model = modelOverride || Deno.env.get('CF_AI_MODEL') || '@cf/meta/llama-3.1-8b-instruct-fast'
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 45000)
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${model}`, { method: 'POST', signal: ctrl.signal, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: `Title: ${title}\nSource:\n${(source || '').slice(0, 1500)}` }], max_tokens: 400 }) })
    if (!res.ok) throw new Error(`workers-ai ${res.status}: ${(await res.text()).slice(0, 120)}`)
    const data = await res.json()
    return coerce(data?.result?.response ?? data?.result)
  } finally { clearTimeout(t) }
}

async function enhance(title: string, source: string, modelOverride?: string): Promise<{ description: string; source_lang: string }> {
  // Cloudflare Workers AI is the primary provider; Anthropic is only a fallback
  // if CF creds are absent.
  const acct = Deno.env.get('CF_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
  const cfToken = Deno.env.get('CF_AI_API_TOKEN') || Deno.env.get('CLOUDFLARE_API_TOKEN')
  const anthropic = Deno.env.get('ANTHROPIC_API_KEY')
  let raw: string
  if (acct && cfToken) raw = await callWorkersAI(acct, cfToken, title, source, modelOverride)
  else if (anthropic) raw = await callAnthropic(anthropic, title, source)
  else throw new Error('no LLM configured (need CF_ACCOUNT_ID+CF_AI_API_TOKEN or ANTHROPIC_API_KEY)')
  const s = coerce(raw)
  const match = s.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('non-json LLM response: ' + s.slice(0, 80))
  const parsed = JSON.parse(match[0])
  return { description: String(parsed.description || '').trim(), source_lang: String(parsed.source_lang || 'other').toLowerCase() }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = client()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth
  try {
    const body = await req.json().catch(() => ({}))
    // A merchant_domain in the body scopes a manual run; the cron passes none
    // and works the marketplace_enhance_claim queue instead — boilerplate
    // spec-sheet groups first, then thin descriptions, then the never-enhanced
    // backlog, across ALL sources. (The old default pinned the */5 cron to
    // ohmyfantasy.com forever, so 12.5k boilerplate rows elsewhere never
    // became eligible.)
    const merchantDomain = typeof body.merchant_domain === 'string' ? (body.merchant_domain as string) : null
    const batchSize = Math.min(Number(body.batch_size ?? 25), 60)
    const dryRun = body.dry_run || false
    // Opt-in strong model for manual runs; the default is the cheap 8B.
    const modelOverride = typeof body.model === 'string' && body.model.startsWith('@cf/') ? (body.model as string) : undefined
    let rows: { id: string; title: unknown; description: unknown; description_i18n: unknown }[] | null
    if (merchantDomain) {
      const res = await supabase.from('marketplace_listings').select('id, title, description, description_i18n').eq('status', 'active').eq('merchant_domain', merchantDomain).not('description', 'is', null).order('updated_at', { ascending: true }).limit(batchSize * 4)
      if (res.error) return json({ success: false, error: res.error.message }, 500)
      rows = res.data
    } else {
      const claim = await supabase.rpc('marketplace_enhance_claim', { p_limit: batchSize })
      if (claim.error) return json({ success: false, error: claim.error.message }, 500)
      const ids = (claim.data ?? []) as string[]
      if (ids.length === 0) return json({ success: true, items: 0, message: 'queue empty' })
      const res = await supabase.from('marketplace_listings').select('id, title, description, description_i18n').in('id', ids)
      if (res.error) return json({ success: false, error: res.error.message }, 500)
      rows = res.data
    }
    const missing = (rows || []).filter((r) => String(r.description ?? '').trim().length <= 20)
    const recoveredIds = new Set<string>()
    let recovered = 0, recoveryMisses = 0
    if (missing.length) {
      const { data: sourceRows, error: sourceError } = await supabase
        .from('marketplace_listing_sources')
        .select('listing_id, source_slug, raw')
        .in('listing_id', missing.map((r) => r.id))
        .order('is_primary', { ascending: false })
      if (sourceError) return json({ success: false, error: sourceError.message, items_examined: missing.length, items_changed: 0, items_terminal: 0, items_failed: missing.length }, 500)
      const byListing = new Map<string, Array<{ source_slug: string; raw: Record<string, unknown> }>>()
      for (const source of sourceRows ?? []) {
        const current = byListing.get(source.listing_id) ?? []
        current.push({ source_slug: source.source_slug, raw: (source.raw ?? {}) as Record<string, unknown> })
        byListing.set(source.listing_id, current)
      }
      for (const row of missing) {
        const sources = byListing.get(row.id) ?? []
        const found = sources.map((source) => ({ source, text: marketplaceDescriptionFromRaw(source.raw) })).find((x) => x.text)
        const i18n = { ...((row.description_i18n ?? {}) as Record<string, unknown>) }
        if (!found?.text) {
          recoveryMisses++
          if (!dryRun) {
            i18n._recovery_checked_at = new Date().toISOString()
            i18n._recovery_version = 'source-payload-v1'
            await supabase.from('marketplace_listings').update({ description_i18n: i18n }).eq('id', row.id)
          }
          continue
        }
        recovered++
        recoveredIds.add(row.id)
        if (!dryRun) {
          i18n._recovered_at = new Date().toISOString()
          i18n._recovered_from = found.source.source_slug
          i18n._recovery_version = 'source-payload-v1'
          i18n._original = found.text
          await supabase.from('marketplace_listings').update({
            description: found.text.slice(0, 1200),
            description_i18n: i18n,
            updated_at: new Date().toISOString(),
          }).eq('id', row.id)
        }
      }
    }

    const pending = (rows || []).filter((r) => {
      const i18n = (r.description_i18n ?? {}) as Record<string, unknown>
      return !recoveredIds.has(r.id) && !i18n._enhanced_at && String(r.description ?? '').trim().length > 20
    }).slice(0, batchSize)
    if (pending.length === 0) return json({ success: true, items: recovered, items_examined: (rows || []).length, items_changed: recovered, items_terminal: recovered + recoveryMisses, items_failed: 0, recovered, recovery_misses: recoveryMisses, message: 'source recovery complete' })
    // Central daily cap (llm_budget, seeded 500/day — migration 20260817090000):
    // this fn previously ran the */5 cron with NO cap. One consume for the whole
    // batch (one LLM call per pending row). If the RPC is missing (fn deployed
    // ahead of the migration), consumeLlmBudget warns and we run uncapped, as
    // before.
    const budget = await consumeLlmBudget(supabase, 'marketplace-description-enhance', pending.length)
    if (!budget.allowed) {
      return json({
        success: true,
        items: recovered,
        items_examined: (rows || []).length,
        items_changed: recovered,
        // The queue claim is terminal for this dispatch even though inference
        // is deferred to a later UTC budget window. Refill makes the rows
        // eligible again; this avoids treating an intentional spend ceiling as
        // a broken worker and auto-pausing it for the following day.
        items_terminal: (rows || []).length,
        items_failed: 0,
        skipped: pending.length,
        recovered,
        recovery_misses: recoveryMisses,
        message: 'llm_budget_deferred',
        daily_cap: budget.cap,
        merchant_domain: merchantDomain,
        dry_run: dryRun,
      })
    }
    let done = 0, skipped = 0, failed = 0, firstErr: string | null = null
    for (const row of pending) {
      const original = (row.description as string) || ''
      try {
        const r = await enhance(String(row.title || ''), original, modelOverride)
        if (!r.description || r.description.length < 25 || r.description.length > 900) { skipped++; continue }
        if (dryRun) { done++; continue }
        const i18n = { ...((row.description_i18n ?? {}) as Record<string, unknown>) }
        const lang = ['de', 'fr', 'en', 'other'].includes(r.source_lang) ? r.source_lang : 'other'
        if (lang !== 'en') i18n[lang] = original
        i18n._original = original; i18n._original_lang = lang; i18n._enhanced_at = new Date().toISOString()
        await supabase.from('marketplace_listings').update({ description: r.description.slice(0, 600), description_i18n: i18n, updated_at: new Date().toISOString() }).eq('id', row.id)
        done++
        await new Promise((res) => setTimeout(res, 150))
      } catch (err) { if (!firstErr) firstErr = (err as Error).message; failed++ }
    }
    return json({ success: failed === 0, items: done + recovered, items_examined: (rows || []).length, items_changed: done + recovered, items_terminal: done + recovered + recoveryMisses + skipped, items_processed: done + skipped + failed + recovered + recoveryMisses, items_succeeded: done + recovered, items_skipped: skipped, items_failed: failed, recovered, recovery_misses: recoveryMisses, generator_version: 'marketplace-description-v2', first_error: firstErr, merchant_domain: merchantDomain, dry_run: dryRun })
  } catch (error) { return json({ success: false, error: (error as Error).message }, 500) }
})
