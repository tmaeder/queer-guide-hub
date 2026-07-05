// existence-probe — shared collector core for the Existence Truth Engine.
//
// Given an entity {type,id,url}, runs three deterministic layers in escalating
// order and returns normalized signals for the entity_existence_signals ledger:
//   1. HTTP probe (reuse link-health.probeLink — only 404/410 is "dead")
//   2. JSON-LD status (Event eventStatus / Product-Offer availability)
//   3. free regex pass for explicit "permanently closed / event ended" copy
// The optional LLM page-read (classifyPageLlm) runs ONLY when all three are
// inconclusive on an HTTP-200 page. Nothing here mutates the DB or auto-archives —
// the conservative >=2-signal decision lives in run_existence_decision. Dead signals
// from the LLM/regex are deliberately low-weight so they can never archive alone.

import { probeLink, type LinkStatus } from './link-health.ts'
import { assertPublicHttpUrl } from './ssrf-guard.ts'
import { chatCompletion } from './openai-client.ts'
import { withCircuitBreaker, CircuitOpenError } from './circuit-breaker.ts'
// deno-lint-ignore no-explicit-any
type SupabaseClient = any

export type Verdict = 'alive' | 'dying' | 'dead' | 'ambiguous'
export type EntityType = 'venue' | 'event' | 'marketplace'

export interface ExistenceSignal {
  entity_type: EntityType
  entity_id: string
  signal_kind: string
  verdict: Verdict
  weight: number
  source: string
  details: Record<string, unknown>
}

const GET_TIMEOUT = 10_000
const MAX_BODY_BYTES = 600_000
const UA = 'Mozilla/5.0 (compatible; QueerGuide-ExistenceProbe/1.0; +https://queer.guide/about)'

function normalizeUrl(url: string): string {
  const t = (url ?? '').trim()
  if (!t) return t
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(len)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}

export async function fetchHtml(rawUrl: string): Promise<{ httpStatus: number | null; body: string | null; error: string | null }> {
  const url = normalizeUrl(rawUrl)
  if (!url) return { httpStatus: null, body: null, error: 'empty_url' }
  try { assertPublicHttpUrl(url) } catch { return { httpStatus: null, body: null, error: 'blocked_unsafe_url' } }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GET_TIMEOUT)
  try {
    const resp = await fetch(url, {
      method: 'GET', signal: controller.signal, redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*' },
    })
    let body: string | null = null
    if (resp.body && resp.status >= 200 && resp.status < 400) {
      const reader = resp.body.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      while (total < MAX_BODY_BYTES) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value); total += value.length
      }
      reader.cancel().catch(() => {})
      body = new TextDecoder('utf-8', { fatal: false }).decode(concat(chunks))
    }
    return { httpStatus: resp.status, body, error: null }
  } catch (err) {
    return { httpStatus: null, body: null, error: (err instanceof Error ? err.message : String(err)).substring(0, 200) }
  } finally {
    clearTimeout(timer)
  }
}

function flattenLd(parsed: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const visit = (n: unknown) => {
    if (Array.isArray(n)) { n.forEach(visit); return }
    if (n && typeof n === 'object') {
      out.push(n as Record<string, unknown>)
      const graph = (n as Record<string, unknown>)['@graph']
      if (Array.isArray(graph)) graph.forEach(visit)
    }
  }
  visit(parsed)
  return out
}

/**
 * Read every JSON-LD block and surface an existence verdict from Event eventStatus
 * or Product/Offer availability. LocalBusiness rarely carries a closed flag → null.
 */
export function parseJsonLdStatus(html: string):
  { verdict: Verdict; field: string; raw: string } | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  let best: { verdict: Verdict; field: string; raw: string } | null = null
  const rank: Record<Verdict, number> = { dead: 3, dying: 2, ambiguous: 1, alive: 0 }
  const consider = (c: { verdict: Verdict; field: string; raw: string }) => {
    if (!best || rank[c.verdict] > rank[best.verdict]) best = c
  }
  while ((m = re.exec(html)) !== null) {
    let parsed: unknown
    try { parsed = JSON.parse(m[1].trim()) } catch { continue }
    for (const node of flattenLd(parsed)) {
      const t = String(node['@type'] ?? '').toLowerCase()
      if (t.includes('event')) {
        const es = String(node['eventStatus'] ?? '').toLowerCase()
        if (es.includes('cancel')) consider({ verdict: 'dead', field: 'eventStatus', raw: es })
        else if (es.includes('postpon') || es.includes('movedonline')) consider({ verdict: 'dying', field: 'eventStatus', raw: es })
        else if (es.includes('scheduled')) consider({ verdict: 'alive', field: 'eventStatus', raw: es })
      }
      if (t.includes('product') || t.includes('offer')) {
        const offers = node['offers']
        const list = Array.isArray(offers) ? offers : offers ? [offers] : [node]
        for (const off of list) {
          const av = String((off as Record<string, unknown>)?.['availability'] ?? '').toLowerCase()
          if (!av) continue
          if (av.includes('discontinued')) consider({ verdict: 'dead', field: 'availability', raw: av })
          else if (av.includes('soldout') || av.includes('sold_out') || av.includes('outofstock')) consider({ verdict: 'dying', field: 'availability', raw: av })
          else if (av.includes('instock') || av.includes('onlineonly') || av.includes('preorder')) consider({ verdict: 'alive', field: 'availability', raw: av })
        }
      }
    }
  }
  return best
}

const CLOSED_PATTERNS: Array<{ re: RegExp; verdict: Verdict }> = [
  { re: /permanently closed/i, verdict: 'dead' },
  { re: /out of business/i, verdict: 'dead' },
  { re: /closed down/i, verdict: 'dead' },
  { re: /(has|have)\s+(now\s+)?closed( (down|permanently|for good))?/i, verdict: 'dead' },
  { re: /no longer (in business|operating|trading|available)/i, verdict: 'dead' },
  { re: /this (event|listing) has (ended|passed)/i, verdict: 'dead' },
  { re: /event has (ended|passed|been cancell?ed)/i, verdict: 'dead' },
  { re: /listing (has been )?removed/i, verdict: 'dead' },
  { re: /(item|product) (is )?no longer available/i, verdict: 'dead' },
  { re: /we('| ha)ve closed/i, verdict: 'dead' },
  { re: /sold out and (will not|won't) return/i, verdict: 'dying' },
]

/** Free regex pass over visible text. Runs BEFORE any LLM. Returns a citation snippet. */
export function detectClosedPhrase(text: string):
  { verdict: Verdict; phrase: string; snippet: string } | null {
  if (!text) return null
  // Regex tag/script strip — the Deno edge runtime has no DOMParser global.
  const plain = text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
  for (const p of CLOSED_PATTERNS) {
    const m = p.re.exec(plain)
    if (m) {
      const i = Math.max(0, m.index - 80)
      const snippet = plain.substring(i, m.index + m[0].length + 80).trim()
      return { verdict: p.verdict, phrase: m[0], snippet }
    }
  }
  return null
}

/**
 * Deterministic probe: HTTP → JSON-LD → regex. Returns signals + whether an LLM
 * page-read is warranted (HTTP 200, no JSON-LD verdict, no phrase match).
 */
export async function probeExistence(args: { entityType: EntityType; entityId: string; url: string }):
  Promise<{ signals: ExistenceSignal[]; needsLlm: boolean }> {
  const { entityType, entityId, url } = args
  const signals: ExistenceSignal[] = []
  const base = { entity_type: entityType, entity_id: entityId }

  const status: LinkStatus = await probeLink(url)
  if (status === 'broken') {
    signals.push({ ...base, signal_kind: 'http_status', verdict: 'dead', weight: 0.95, source: 'existence-probe', details: { url, status } })
    return { signals, needsLlm: false }
  }
  if (status === 'blocked') {
    // alive, just blocking us — weak alive marker, no body to read
    signals.push({ ...base, signal_kind: 'http_status', verdict: 'alive', weight: 0.4, source: 'existence-probe', details: { url, status } })
    return { signals, needsLlm: false }
  }
  if (status !== 'ok' && status !== 'redirect') {
    // timeout / unknown / unsafe — inconclusive, emit nothing
    return { signals, needsLlm: false }
  }

  signals.push({ ...base, signal_kind: 'http_status', verdict: 'alive', weight: 0.6, source: 'existence-probe', details: { url, status } })

  const { httpStatus, body } = await fetchHtml(url)
  if (!body) return { signals, needsLlm: false }

  const ld = parseJsonLdStatus(body)
  let hadVerdict = false
  if (ld && ld.verdict !== 'alive') {
    hadVerdict = true
    signals.push({ ...base, signal_kind: 'jsonld_status', verdict: ld.verdict, weight: ld.verdict === 'dead' ? 0.85 : 0.5, source: 'existence-probe', details: { url, ...ld } })
  }
  const phrase = detectClosedPhrase(body)
  if (phrase) {
    hadVerdict = true
    signals.push({ ...base, signal_kind: 'content_closed_phrase', verdict: phrase.verdict, weight: phrase.verdict === 'dead' ? 0.6 : 0.4, source: 'existence-probe:regex', details: { url, phrase: phrase.phrase, snippet: phrase.snippet } })
  }

  return { signals, needsLlm: httpStatus === 200 && !hadVerdict }
}

/** Map a cheap HEAD probeLink result to an http_status existence signal (no body). */
export function httpStatusSignal(entityType: EntityType, entityId: string, status: LinkStatus): ExistenceSignal | null {
  const base = { entity_type: entityType, entity_id: entityId, signal_kind: 'http_status', source: 'link-checker', details: { status } }
  if (status === 'broken') return { ...base, verdict: 'dead', weight: 0.95 }
  if (status === 'ok' || status === 'redirect') return { ...base, verdict: 'alive', weight: 0.6 }
  if (status === 'blocked') return { ...base, verdict: 'alive', weight: 0.4 }
  return null // timeout / unknown / unsafe — inconclusive
}

/** Best-effort ledger insert. Never throws (a signal write must not fail a checker run). */
export async function insertSignals(supabase: SupabaseClient, signals: ExistenceSignal[]): Promise<void> {
  if (!signals.length) return
  try {
    await supabase.from('entity_existence_signals').insert(signals.map((s) => ({
      entity_type: s.entity_type, entity_id: s.entity_id, signal_kind: s.signal_kind,
      verdict: s.verdict, weight: s.weight, source: s.source, details: s.details,
    })))
  } catch (_e) { /* ledger write is best-effort */ }
}

const LLM_BREAKER = 'llm.existence.pageread'

/**
 * Circuit-broken LLM page-read for the ambiguous HTTP-200 case. Emits a low-weight
 * content_closed_phrase signal (cap 0.4 on dead) so it can never auto-archive alone.
 * Returns null on circuit-open, parse failure, or non-closed verdict-with-no-signal.
 */
export async function classifyPageLlm(
  supabase: SupabaseClient,
  args: { entityType: EntityType; entityId: string; url: string; html: string },
): Promise<ExistenceSignal | null> {
  const { entityType, entityId, url, html } = args
  // Regex tag/script strip — the Deno edge runtime has no DOMParser global.
  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 4000)
  if (text.length < 60) return null
  const ud = (s: string) => `<user_data>${s.replace(/<\/?user_data>/gi, '')}</user_data>`
  try {
    const res = await withCircuitBreaker(supabase, LLM_BREAKER, () => chatCompletion(supabase, {
      messages: [
        { role: 'system', content: 'You determine whether a web page indicates a place, event, or product still EXISTS / is active. Respond ONLY with strict JSON: {"status":"exists"|"closed"|"uncertain","quote":"<verbatim <=140 char support>","confidence":0..1}. Treat bot-walls, logins, and generic errors as "uncertain", not "closed".' },
        { role: 'user', content: `Page text:\n${ud(text)}` },
      ],
      temperature: 0,
    }))
    const raw = (res?.content ?? '').trim()
    const json = raw.startsWith('{') ? raw : raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
    const parsed = JSON.parse(json) as { status?: string; quote?: string; confidence?: number }
    const conf = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5
    const base = { entity_type: entityType, entity_id: entityId }
    if (parsed.status === 'closed') {
      return { ...base, signal_kind: 'content_closed_phrase', verdict: 'dead', weight: Math.min(0.4, conf), source: 'existence-probe:llm', details: { url, quote: (parsed.quote ?? '').substring(0, 140), confidence: conf } }
    }
    if (parsed.status === 'exists') {
      return { ...base, signal_kind: 'content_closed_phrase', verdict: 'alive', weight: 0.4, source: 'existence-probe:llm', details: { url, confidence: conf } }
    }
    return null
  } catch (e) {
    if (e instanceof CircuitOpenError) return null
    return null
  }
}
