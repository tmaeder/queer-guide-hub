import { createClient } from 'jsr:@supabase/supabase-js@2'

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
// Body: { merchant_domain?, batch_size?, dry_run? }
// ============================================================

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
const client = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const SYSTEM_PROMPT = `You rewrite e-commerce product descriptions for the queer.guide marketplace. Given a product title and its source description (often German), return ONE concise, factual ENGLISH paragraph (40-480 characters) describing what the product IS and its key real features. RULES: translate to natural English if not English; REMOVE size charts, care/washing instructions, shipping/returns/payment, material composition tables, SKU/article numbers, store policy, and marketing slop (discover, curated, elevate, premium experience, must-have); keep adult/fetish wording factual, plain, neutral; do NOT invent sizes, materials, measurements, brands, or claims not in the source; if already clean English just tighten it. Return ONLY minified JSON, no markdown: {"description":"...","source_lang":"de|en|fr|other"}`

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

async function callWorkersAI(acct: string, token: string, title: string, source: string): Promise<string> {
  const model = Deno.env.get('CF_AI_MODEL') || '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 45000)
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${model}`, { method: 'POST', signal: ctrl.signal, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: `Title: ${title}\nSource:\n${(source || '').slice(0, 1500)}` }], max_tokens: 400 }) })
    if (!res.ok) throw new Error(`workers-ai ${res.status}: ${(await res.text()).slice(0, 120)}`)
    const data = await res.json()
    return coerce(data?.result?.response ?? data?.result)
  } finally { clearTimeout(t) }
}

async function enhance(title: string, source: string): Promise<{ description: string; source_lang: string }> {
  // Cloudflare Workers AI is the primary provider; Anthropic is only a fallback
  // if CF creds are absent.
  const acct = Deno.env.get('CF_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
  const cfToken = Deno.env.get('CF_AI_API_TOKEN') || Deno.env.get('CLOUDFLARE_API_TOKEN')
  const anthropic = Deno.env.get('ANTHROPIC_API_KEY')
  let raw: string
  if (acct && cfToken) raw = await callWorkersAI(acct, cfToken, title, source)
  else if (anthropic) raw = await callAnthropic(anthropic, title, source)
  else throw new Error('no LLM configured (need CF_ACCOUNT_ID+CF_AI_API_TOKEN or ANTHROPIC_API_KEY)')
  const s = coerce(raw)
  const match = s.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('non-json LLM response: ' + s.slice(0, 80))
  const parsed = JSON.parse(match[0])
  return { description: String(parsed.description || '').trim(), source_lang: String(parsed.source_lang || 'other').toLowerCase() }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const supabase = client()
  try {
    const body = await req.json().catch(() => ({}))
    const merchantDomain = (body.merchant_domain as string) || 'ohmyfantasy.com'
    const batchSize = Math.min(Number(body.batch_size ?? 25), 60)
    const dryRun = body.dry_run || false
    const { data: rows, error } = await supabase.from('marketplace_listings').select('id, title, description, description_i18n').eq('status', 'active').eq('merchant_domain', merchantDomain).not('description', 'is', null).order('updated_at', { ascending: true }).limit(batchSize * 4)
    if (error) return json({ success: false, error: error.message }, 500)
    const pending = (rows || []).filter((r) => { const i18n = (r.description_i18n ?? {}) as Record<string, unknown>; return !i18n._enhanced_at && (r.description as string).trim().length > 20 }).slice(0, batchSize)
    if (pending.length === 0) return json({ success: true, items: 0, message: 'nothing to enhance' })
    let done = 0, skipped = 0, failed = 0, firstErr: string | null = null
    for (const row of pending) {
      const original = (row.description as string) || ''
      try {
        const r = await enhance(String(row.title || ''), original)
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
    return json({ success: true, items: done, items_processed: done + skipped + failed, items_succeeded: done, items_skipped: skipped, items_failed: failed, first_error: firstErr, merchant_domain: merchantDomain, dry_run: dryRun })
  } catch (error) { return json({ success: false, error: (error as Error).message }, 500) }
})
