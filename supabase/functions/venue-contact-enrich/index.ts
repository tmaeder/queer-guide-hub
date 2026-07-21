// venue-contact-enrich — fills missing email/phone on venues from their OWN
// website. Deterministic-first: mailto:/tel: hrefs + conservative text regexes
// on the homepage and common contact pages; ONE LLM fallback call (via
// ai-gateway) only when regex finds nothing and the page has text. Extracted
// emails must pass an MX check before they are ever written or queued.
//
// Writes: deterministic on-site hits carry confidence 0.95; at the shared
// >=0.92 threshold (confidence-scoring.ts) values auto-apply to the venue
// column + venue_field_provenance (is_winning) + a venue_quality_signals
// ledger row; lower-confidence LLM results go to venue_review_queue.
// description is deliberately NEVER touched here — it has its own LLM budget.
// enrichment_status.contact_crawl = {at, outcome} is stamped even on failure,
// so reruns skip venues crawled <90 days ago.
//
// Auth: X-Internal-Secret (cron/dispatcher) or admin. Body: { limit?, dry_run?, daily_cap? }.

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { llmChatCompletion } from '../_shared/llm-client.ts'
import { htmlToText, normalizeUrl, countDoneToday } from '../_shared/enrich-harness.ts'
import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'
import { determineAction } from '../_shared/confidence-scoring.ts'
import { hasMxRecords } from '../_shared/email-validate.ts'

const STEP = 'venue-contact-enrich'
const BREAKER = 'llm.venue-contact-enrich'
const DEFAULT_LIMIT = 25
const DEFAULT_DAILY_CAP = 150
const RECRAWL_DAYS = 90
const GET_TIMEOUT = 10_000
const MAX_BODY_BYTES = 400_000
const DETERMINISTIC_CONFIDENCE = 0.95
const MIN_TEXT_FOR_LLM = 200
const LLM_TEXT_CAP = 6_000
const CONTACT_PATHS = ['/contact', '/kontakt', '/about']
const UA = 'Mozilla/5.0 (compatible; QueerGuide-ContactEnrich/1.0)'

const SYSTEM = `You extract contact details from a venue's own website text.
Only report values that literally appear in the text — never guess or invent.
Output JSON only, no prose, no markdown:
{"email": string|null, "phone": string|null, "instagram": string|null, "confidence": number}
confidence is 0..1 for how certain you are the values belong to this venue.`

// Raw-HTML fetch (same caps as enrich-harness fetchPageText, which strips tags
// — mailto:/tel: hrefs only exist in the markup, so we need the HTML too).
async function fetchHtml(rawUrl: string): Promise<string | null> {
  const url = normalizeUrl(rawUrl)
  if (!url) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GET_TIMEOUT)
  try {
    const resp = await fetch(url, {
      method: 'GET', signal: controller.signal, redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' },
    })
    if (!resp.ok || !resp.body) return null
    const reader = resp.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (total < MAX_BODY_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value); total += value.length
    }
    reader.cancel().catch(() => {})
    const len = chunks.reduce((n, c) => n + c.length, 0)
    const buf = new Uint8Array(len); let off = 0
    for (const c of chunks) { buf.set(c, off); off += c.length }
    return new TextDecoder('utf-8', { fatal: false }).decode(buf)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
// Junk that email regexes love to catch on real pages.
const EMAIL_JUNK = /\.(png|jpe?g|gif|webp|svg|css|js)$|@(example\.|sentry\.|.*\.?wixpress\.com|.*\.?sentry\.io)/i

function extractEmails(html: string, text: string): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    const e = decodeURIComponent(m[1]).trim().toLowerCase()
    if (e.includes('@')) out.add(e)
  }
  for (const m of text.matchAll(EMAIL_RE)) out.add(m[0].toLowerCase())
  return [...out].filter(e => !EMAIL_JUNK.test(e))
}

function cleanPhone(raw: string): string | null {
  const p = raw.replace(/[^\d+]/g, '')
  const digits = p.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15 ? (raw.trim().startsWith('+') || p.startsWith('+') ? `+${digits}` : raw.replace(/[^\d\s+()/.-]/g, '').trim()) : null
}

function extractPhones(html: string, text: string): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(/tel:([^"'?\s>]+)/gi)) {
    const p = cleanPhone(decodeURIComponent(m[1]))
    if (p) out.add(p)
  }
  // Text fallback: international format only — bare local numbers are too noisy.
  for (const m of text.matchAll(/\+\d[\d\s/().-]{6,18}\d/g)) {
    const p = cleanPhone(m[0])
    if (p) out.add(p)
  }
  return [...out]
}

function parseJson(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s) } catch {
    const m = s.match(/\{[\s\S]*\}/)
    if (!m) return null
    try { return JSON.parse(m[0]) } catch { return null }
  }
}

interface Proposal {
  field: 'email' | 'phone'
  value: string
  confidence: number
  source: 'website' | 'llm'
  url: string
  model?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth

  const body = await req.json().catch(() => ({}))
  const limit: number = body.limit ?? DEFAULT_LIMIT
  const dailyCap: number = body.daily_cap ?? DEFAULT_DAILY_CAP
  const dryRun: boolean = body.dry_run ?? false

  const doneToday = await countDoneToday(supabase, STEP)
  if (doneToday >= dailyCap) {
    return jsonResponse({ items_processed: 0, capped: true, done_today: doneToday, daily_cap: dailyCap }, 200, req)
  }
  const remaining = Math.min(limit, dailyCap - doneToday)

  // Over-fetch, then drop venues crawled <90 days ago in JS: the recency stamp
  // lives inside enrichment_status jsonb and a null-safe PostgREST json-path
  // filter over it is not expressible in one .or().
  const { data: rows, error } = await supabase
    .from('venues')
    .select('id, name, website, email, phone, description, instagram, enrichment_status, quality_score')
    .is('duplicate_of_id', null)
    .not('website', 'is', null)
    .or('email.is.null,phone.is.null,description.is.null')
    .order('quality_score', { ascending: false, nullsFirst: false })
    .limit(Math.min(remaining * 4, 200))
  if (error) return jsonResponse({ error: error.message, success: false }, 500, req)

  const cutoff = Date.now() - RECRAWL_DAYS * 86_400_000
  const venues = (rows ?? []).filter(v => {
    const at = ((v.enrichment_status ?? {}) as Record<string, { at?: string }>).contact_crawl?.at
    return !at || new Date(at).getTime() < cutoff
  }).slice(0, remaining)
  if (!venues.length) return jsonResponse({ items_processed: 0, message: 'no venues due for contact crawl' }, 200, req)

  let applied = 0, queued = 0, skipped = 0
  const results: Array<Record<string, unknown>> = []

  for (const v of venues) {
    const started = Date.now()
    let logStatus = 'skipped'
    let outcome: string
    try {
      let baseUrl: URL
      try {
        baseUrl = assertPublicHttpUrl(normalizeUrl(v.website))
      } catch {
        outcome = 'blocked_url'; skipped++
        results.push({ id: v.id, status: 'blocked_url' })
        await stamp(supabase, v, outcome, dryRun)
        await logStep(supabase, v.id, logStatus, started, dryRun)
        continue
      }

      const needEmail = v.email == null
      const needPhone = v.phone == null

      // Homepage first, then contact pages; stop as soon as every missing
      // field has a deterministic candidate.
      const pageUrls = [baseUrl.toString(), ...CONTACT_PATHS.map(p => new URL(p, baseUrl.origin).toString())]
      let emailHit: { value: string; url: string } | null = null
      let phoneHit: { value: string; url: string } | null = null
      let combinedText = ''
      let fetchedAny = false
      for (const pageUrl of pageUrls) {
        const html = await fetchHtml(pageUrl)
        if (!html) continue
        fetchedAny = true
        const text = htmlToText(html)
        if (combinedText.length < LLM_TEXT_CAP) combinedText += ` ${text}`
        if (needEmail && !emailHit) {
          const e = extractEmails(html, text)[0]
          if (e) emailHit = { value: e, url: pageUrl }
        }
        if (needPhone && !phoneHit) {
          const p = extractPhones(html, text)[0]
          if (p) phoneHit = { value: p, url: pageUrl }
        }
        if ((!needEmail || emailHit) && (!needPhone || phoneHit)) break
      }
      if (!fetchedAny) {
        outcome = 'no_page'; skipped++
        results.push({ id: v.id, status: 'no_page' })
        await stamp(supabase, v, outcome, dryRun)
        await logStep(supabase, v.id, logStatus, started, dryRun)
        continue
      }

      const proposals: Proposal[] = []
      let instagramCandidate: { value: string; confidence: number; model: string } | null = null
      if (emailHit && await hasMxRecords(emailHit.value.split('@')[1] ?? '')) {
        proposals.push({ field: 'email', value: emailHit.value, confidence: DETERMINISTIC_CONFIDENCE, source: 'website', url: emailHit.url })
      }
      if (phoneHit) {
        proposals.push({ field: 'phone', value: phoneHit.value, confidence: DETERMINISTIC_CONFIDENCE, source: 'website', url: phoneHit.url })
      }

      // LLM fallback: only when regex found NOTHING and there is text to ground on.
      const text = combinedText.trim().slice(0, LLM_TEXT_CAP)
      if (!proposals.length && text.length >= MIN_TEXT_FOR_LLM) {
        let res
        try {
          res = await withCircuitBreaker(supabase, BREAKER, () => llmChatCompletion({
            messages: [
              { role: 'system', content: SYSTEM },
              { role: 'user', content: `Venue: ${v.name}\nWebsite: ${v.website}\n\nPage text:\n${text}` },
            ],
            temperature: 0.1, max_tokens: 300, timeoutMs: 30_000, retries: 1,
          }))
        } catch (e) {
          if (e instanceof CircuitOpenError) {
            return jsonResponse({ items_processed: results.length, applied, queued, skipped, circuit_open: true, dry_run: dryRun, results }, 200, req)
          }
          throw e
        }
        const ai = parseJson(res.content)
        const conf = typeof ai?.confidence === 'number' ? Math.max(0, Math.min(1, ai.confidence as number)) : 0.5
        const aiEmail = typeof ai?.email === 'string' ? ai.email.trim().toLowerCase() : ''
        const aiPhone = typeof ai?.phone === 'string' ? cleanPhone(ai.phone as string) : null
        if (needEmail && aiEmail && EMAIL_RE.test(aiEmail) && !EMAIL_JUNK.test(aiEmail) && await hasMxRecords(aiEmail.split('@')[1] ?? '')) {
          proposals.push({ field: 'email', value: aiEmail, confidence: conf, source: 'llm', url: baseUrl.toString(), model: res.model })
        }
        if (needPhone && aiPhone) {
          proposals.push({ field: 'phone', value: aiPhone, confidence: conf, source: 'llm', url: baseUrl.toString(), model: res.model })
        }
        if (typeof ai?.instagram === 'string' && ai.instagram.trim() && v.instagram == null) {
          instagramCandidate = { value: ai.instagram.trim(), confidence: conf, model: res.model }
        }
      }

      const autoApply = proposals.filter(p => determineAction(p.confidence) === 'auto_correct')
      const toQueue = proposals.filter(p => determineAction(p.confidence) === 'needs_review')
      outcome = autoApply.length ? 'applied' : toQueue.length ? 'queued' : 'none_found'

      if (dryRun) {
        results.push({
          id: v.id, name: v.name, status: 'dry_run',
          would_apply: autoApply.map(p => ({ field: p.field, value: p.value, confidence: p.confidence, source: p.source })),
          would_queue: toQueue.map(p => ({ field: p.field, value: p.value, confidence: p.confidence })),
          would_stamp: outcome,
        })
        if (autoApply.length) applied++
        if (toQueue.length) queued++
        continue
      }

      const at = new Date().toISOString()
      const update: Record<string, unknown> = {
        enrichment_status: { ...(v.enrichment_status ?? {}), contact_crawl: { at, outcome } },
      }
      for (const p of autoApply) update[p.field] = p.value
      if (toQueue.length) update.needs_attention = true
      await supabase.from('venues').update(update).eq('id', v.id)

      for (const p of autoApply) {
        // venues has no field_provenance jsonb column — provenance is the
        // venue_field_provenance table (UNIQUE venue_id/field/source).
        await supabase.from('venue_field_provenance').upsert({
          venue_id: v.id, field: p.field,
          value: { value: p.value, sources: [p.url], at },
          source: p.source, confidence: p.confidence, is_winning: true, observed_at: at,
        }, { onConflict: 'venue_id,field,source' })
      }
      if (instagramCandidate) {
        // Extracted but out of write scope for this function: keep as a
        // non-winning provenance candidate so consensus/review can use it.
        await supabase.from('venue_field_provenance').upsert({
          venue_id: v.id, field: 'instagram',
          value: { value: instagramCandidate.value, sources: [baseUrl.toString()], at },
          source: 'llm', confidence: instagramCandidate.confidence, is_winning: false, observed_at: at,
        }, { onConflict: 'venue_id,field,source' })
      }
      for (const p of toQueue) {
        await supabase.from('venue_review_queue').delete().eq('venue_id', v.id).eq('field', p.field).eq('status', 'open')
        await supabase.from('venue_review_queue').insert({
          venue_id: v.id, field: p.field,
          proposed_value: { value: p.value, source_url: p.url },
          citations: [{ source: p.url }],
          confidence: p.confidence, model: p.model ?? null, status: 'open',
        })
      }
      if (autoApply.length || toQueue.length) {
        await supabase.from('venue_quality_signals').insert({
          venue_id: v.id, signal_type: 'enrichment',
          value: Math.round(Math.max(...proposals.map(p => p.confidence)) * 10000) / 10000,
          source: STEP,
          details: { applied: autoApply.map(p => p.field), queued: toQueue.map(p => p.field) },
        })
      }

      logStatus = 'done'
      if (autoApply.length) applied++
      if (toQueue.length) queued++
      if (!autoApply.length && !toQueue.length) skipped++
      results.push({ id: v.id, name: v.name, outcome, applied: autoApply.map(p => p.field), queued: toQueue.map(p => p.field) })
    } catch (e) {
      logStatus = 'failed'
      results.push({ id: v.id, status: 'error', error: e instanceof Error ? e.message : String(e) })
      await stamp(supabase, v, 'error', dryRun)
    }
    await logStep(supabase, v.id, logStatus, started, dryRun)
  }

  return jsonResponse({ items_processed: results.length, applied, queued, skipped, dry_run: dryRun, results }, 200, req)
})

// Merge the contact_crawl stamp on paths that skip the main update, so failed
// or blocked venues are not re-crawled every run.
async function stamp(
  supabase: ReturnType<typeof getServiceClient>,
  v: { id: string; enrichment_status?: unknown },
  outcome: string,
  dryRun: boolean,
) {
  if (dryRun) return
  await supabase.from('venues').update({
    enrichment_status: { ...((v.enrichment_status ?? {}) as Record<string, unknown>), contact_crawl: { at: new Date().toISOString(), outcome } },
  }).eq('id', v.id).then(() => {}, () => {})
}

async function logStep(supabase: ReturnType<typeof getServiceClient>, venueId: string, status: string, started: number, dryRun: boolean) {
  if (dryRun) return
  await supabase.from('enrichment_log').insert({
    entity_type: 'venue', entity_id: venueId, step: STEP, status, duration_ms: Date.now() - started,
  }).then(() => {}, () => {})
}
