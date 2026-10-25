import { corsResponse, errorResponse, getServiceClient, jsonResponse, requireInternalOrAdmin } from './supabase-client.ts'
import { hasValidWebhookSecret } from './webhook-auth.ts'
import { consumeLlmBudget } from './llm-budget.ts'
import { withCircuitBreaker, CircuitOpenError } from './circuit-breaker.ts'
import { researchEnrichEventFromPage } from './ai-enrichment.ts'
import { htmlToText } from './enrich-harness.ts'
import { assertPublicHttpUrl } from './ssrf-guard.ts'
import { gateImages } from './image-gate.ts'
import { readImageDimensions } from './image-dimensions.ts'
import { evaluateCover } from './image-probe.ts'
import { storedAgendaqDescription } from './event-source-copy.ts'
import { boundedInt, cleanDescription, hasUnverifiedLongRange, supportedContentPatch, imageCandidates, mapConcurrent, sourceArtwork, sourceCancellation, sourceUrls, storedDescription, structuredEvent, text, type GapEvent, type GapLane, type GapPatch, type SourceEvidence } from './event-gap-core.ts'

type Candidate = { event_id: string; event: GapEvent; sources: SourceEvidence[] }
type Evidence = { source_url?: string; confidence?: number; previous_images?: unknown }
type Result = { id: string; outcome: string; fields: string[]; error?: string }

// Redirects are checked too. Bound reads even when upstream ignores Range or
// Content-Length, and cancel streams when the useful prefix has been consumed.
async function fetchPrefix(raw: string, maxBytes: number, image = false): Promise<{ bytes: Uint8Array; mime: string; url: string; totalBytes?: number } | null> {
  let url = assertPublicHttpUrl(raw)
  const signal = AbortSignal.timeout(10_000)
  for (let redirects = 0; redirects <= 4; redirects++) {
    if (url.username || url.password || !url.hostname.includes('.')) return null
    const response = await fetch(url, { redirect: 'manual', signal, headers: {
      'User-Agent': 'QueerGuide-EventGap/1.0', Accept: image ? 'image/*' : 'text/html,application/xhtml+xml',
      ...(image ? { Range: `bytes=0-${maxBytes - 1}` } : {}),
    } })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) return null
      url = assertPublicHttpUrl(new URL(location, url).href)
      continue
    }
    if (!response.ok || !response.body) { await response.body?.cancel(); return null }
    const mime = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (image ? !mime.startsWith('image/') : !/text\/html|application\/xhtml/.test(mime)) {
      await response.body.cancel(); return null
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      while (total < maxBytes) {
        const { value, done } = await reader.read()
        if (done) break
        const part = value.subarray(0, maxBytes - total)
        chunks.push(part); total += part.byteLength
      }
    } finally { await reader.cancel().catch(() => {}) }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength }
    const rangeTotal = Number(response.headers.get('content-range')?.split('/')[1])
    const announced = Number(response.headers.get('content-length'))
    const totalBytes = rangeTotal > 0 ? rangeTotal : response.status === 200 && announced > 0 ? announced : total < maxBytes ? total : undefined
    return { bytes, mime, url: url.href, totalBytes }
  }
  return null
}

export function serveEventGaps(lane: GapLane) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return corsResponse(req)
    const db = getServiceClient()
    if (!hasValidWebhookSecret(req, 'EVENT_QUALITY_WEBHOOK_SECRET')) {
      const auth = await requireInternalOrAdmin(req, db)
      if (auth instanceof Response) return auth
    }
    if (req.method !== 'POST') return errorResponse('POST required', 405, req)
    const body = await req.json().catch(() => ({}))
    if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse('JSON object required', 400, req)
    const dryRun = body.dry_run === true
    const batch = boundedInt(body.batch_limit ?? body.batch_size, lane === 'content' ? 8 : 12, 20)
    const ids = body.event_ids
    if (ids != null && (!Array.isArray(ids) || ids.length > 40 || ids.some((v: unknown) => typeof v !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)))) {
      return errorResponse('event_ids must contain at most 40 UUIDs', 400, req)
    }
    const token = crypto.randomUUID()
    const { data, error } = await db.rpc('claim_event_gaps', {
      p_lane: lane, p_token: token, p_limit: batch, p_event_ids: ids ?? null, p_dry_run: dryRun,
    })
    if (error) return errorResponse(`claim: ${error.message}`, 500, req)
    const candidates = (data ?? []) as Candidate[]
    // A dry run is genuinely read-only: no lease, page requests or AI spend.
    if (dryRun) return jsonResponse({ success: true, dry_run: true, lane, candidates: candidates.map(c => ({ id: c.event_id, urls: sourceUrls(c.event, c.sources), stored_description: !!(storedAgendaqDescription(c.sources, c.event) ?? storedDescription(c.sources)) })) }, 200, req)
    const budgetProbe = lane === 'content' ? await consumeLlmBudget(db, 'event-agentic-enrich', 0) : null
    const deadline = Date.now() + 90_000
    const pages = new Map<string, Promise<Awaited<ReturnType<typeof fetchPrefix>>>>()
    let aiAttempts = 0
    let networkRequests = 0
    const stats = new Map<string, { ai_attempts: number; network_requests: number }>()
    const page = (url: string, id: string) => {
      if (!pages.has(url)) { networkRequests++; stats.get(id)!.network_requests++; pages.set(url, fetchPrefix(url, 500_000).catch(() => null)) }
      return pages.get(url)!
    }
    async function finish(c: Candidate, patch: GapPatch, evidence: Evidence, outcome: string, details: Record<string, unknown> = {}): Promise<Result> {
      const { data: result, error: finishError } = await db.rpc('finish_event_gap', {
        p_event_id: c.event_id, p_lane: lane, p_token: token, p_patch: patch,
        p_evidence: evidence, p_outcome: outcome, p_details: { ...details, ...stats.get(c.event_id) },
      })
      if (finishError) throw new Error(`finish: ${finishError.message}`)
      return { id: c.event_id, outcome: result.outcome, fields: result.fields ?? [] }
    }
    const results = await mapConcurrent(candidates, 3, async (c): Promise<Result> => {
      stats.set(c.event_id, { ai_attempts: 0, network_requests: 0 })
      try {
        if (Date.now() >= deadline) return await finish(c, {}, {}, 'capped', { reason: 'wall_clock' })
        if (hasUnverifiedLongRange(c.event)) return await finish(c, {}, {}, 'review', { reason: 'unverified_long_running_schedule' })
        if (lane === 'image') {
          for (const asset of sourceArtwork(c.sources)) {
            // A usable poster can already be in the gallery behind a broken
            // thumbnail. It still needs promotion to the primary image.
            if (Array.isArray(c.event.images) && c.event.images[0] === asset.url) continue
            if (!gateImages([asset.url]).kept.length) continue
            networkRequests++; stats.get(c.event_id)!.network_requests++
            const probe = await fetchPrefix(asset.url, 65_536, true).catch(() => null)
            const dims = probe ? readImageDimensions(probe.bytes) : null
            if (!probe || probe.bytes.length < 20_000 || !dims || evaluateCover({ width: dims.width, height: dims.height, bytes: probe.totalBytes }, 'event_artwork')) continue
            return await finish(c, { images: [asset.url] }, { source_url: asset.source_url, confidence: 1, previous_images: c.event.images }, 'updated', { method: 'raw_source_artwork', width: dims.width, height: dims.height })
          }
        }
        if (lane === 'content' && !text(c.event.website) && !text(c.event.ticket_url)) {
          const knownUrl = sourceUrls(c.event, c.sources)[0]
          if (knownUrl) return await finish(c, { website: knownUrl }, { source_url: knownUrl, confidence: 1 }, 'updated', { method: 'source_registry' })
        }
        if (lane === 'content' && text(c.event.description).length < 80) {
          const captured = storedAgendaqDescription(c.sources, c.event)
          const stored = captured ?? storedDescription(c.sources)
          if (stored) return await finish(c, { description: stored.description }, { source_url: stored.source_url, confidence: 1 }, 'updated', {
            method: captured ? 'captured_source_html' : 'raw_source',
            ...(captured ? { source_id: captured.source_id, source_payload_hash: captured.source_payload_hash } : {}),
          })
        }
        if (lane === 'content' && text(c.event.description).length >= 80 && (budgetProbe?.degraded || !budgetProbe?.allowed || (budgetProbe.remaining ?? 0) <= 0)) {
          return await finish(c, {}, {}, 'capped', { reason: 'daily_budget_before_fetch' })
        }
        const urls = sourceUrls(c.event, c.sources)
        for (const url of urls) {
          if (Date.now() >= deadline) break
          const fetched = await page(url, c.event_id)
          if (!fetched) continue
          const html = new TextDecoder().decode(fetched.bytes)
          const cancellation = sourceCancellation(html, c.event)
          if (cancellation) return await finish(c, {}, { source_url: fetched.url, confidence: 1 }, 'review', {
            reason: 'source_event_cancelled_or_postponed', source_status: cancellation,
          })
          if (lane === 'image') {
            for (const image of gateImages(imageCandidates(html, c.event, fetched.url)).kept) {
              if (Array.isArray(c.event.images) && c.event.images[0] === image) continue
              networkRequests++; stats.get(c.event_id)!.network_requests++
              const probe = await fetchPrefix(image, 65_536, true).catch(() => null)
              const dims = probe ? readImageDimensions(probe.bytes) : null
              // Same minimum as cover auditor; do not swap one poor image for another.
              if (!probe || probe.bytes.length < 20_000 || !dims || evaluateCover({ width: dims.width, height: dims.height, bytes: probe.totalBytes }, 'event_artwork')) continue
              return await finish(c, { images: [image] }, { source_url: fetched.url, confidence: 1, previous_images: c.event.images }, 'updated', { method: 'source_artwork', width: dims.width, height: dims.height })
            }
            continue
          }
          const structured = structuredEvent(html, c.event)
          const description = cleanDescription(structured?.description)
          if (text(c.event.description).length < 80 && description) {
            return await finish(c, { description }, { source_url: fetched.url, confidence: 1 }, 'updated', { method: 'event_jsonld' })
          }
          const pageText = htmlToText(html)
          if (pageText.length < 80 || /just a moment|checking your browser|verify you are human|access denied/i.test(pageText.slice(0, 500))) continue
          // Fail closed: neither explicit IDs nor an unavailable ledger bypasses
          // the existing daily spend ceiling. A request cap can only lower spend.
          const { data: allowed, error: budgetError } = await db.rpc('consume_event_gap_budget', {
            p_cap: typeof body.daily_cap === 'number' && Number.isFinite(body.daily_cap) ? Math.max(0, Math.trunc(body.daily_cap)) : null,
          })
          if (budgetError || allowed !== true) return await finish(c, {}, {}, 'capped', { reason: budgetError ? 'budget_unavailable' : 'daily_budget' })
          aiAttempts++; stats.get(c.event_id)!.ai_attempts++
          const ai = await withCircuitBreaker(db, 'llm.openai.agentic-enrich', () => researchEnrichEventFromPage(db, {
            title: c.event.title, city: text(c.event.city), country: text(c.event.country),
            venue_name: text(c.event.venue_name), existingDescription: text(c.event.description), pageText,
          }))
          if (!ai) return await finish(c, {}, {}, 'failed', { reason: 'extraction_failed' })
          const date = text(ai.extracted_date).slice(0, 10)
          const start = text(c.event.start_date).slice(0, 10)
          if (date && start && Math.abs(Date.parse(date) - Date.parse(start)) > 86400000) {
            return await finish(c, {}, { source_url: fetched.url, confidence: ai.confidence }, 'review', { reason: 'date_mismatch', extracted_date: date, start_date: start })
          }
          const end = text(ai.extracted_end_date).slice(0, 10)
          if (/^\d{4}-\d{2}-\d{2}$/.test(end) && end < new Date().toISOString().slice(0, 10)) {
            return await finish(c, {}, { source_url: fetched.url, confidence: ai.confidence }, 'review', { reason: 'source_event_ended', extracted_end_date: end })
          }
          // Optional attendee-facing metadata also needs verbatim page support.
          for (const field of ['safety_notes', 'dress_code', 'lineup']) {
            const quote = text(ai.field_evidence?.[field]).replace(/\s+/g, ' ').toLowerCase()
            if (quote.length < 8 || !pageText.replace(/\s+/g, ' ').toLowerCase().includes(quote)) delete ai[field as 'safety_notes' | 'dress_code' | 'lineup']
          }
          const patch = supportedContentPatch(c.event, ai as Record<string, unknown>, pageText)
          return await finish(c, patch, { source_url: fetched.url, confidence: ai.confidence }, (ai.confidence ?? 0) < 0.8 ? 'review' : 'updated', { method: 'grounded_extraction', ai_attempts: 1, extraction: ai })
        }
        return await finish(c, {}, {}, 'no_change', { reason: urls.length ? 'no_usable_evidence' : 'no_event_page' })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        try {
          return await finish(c, {}, {}, err instanceof CircuitOpenError ? 'capped' : 'failed', { reason: message.slice(0, 300) })
        } catch {
          // Leave the lease to expire: a failed persistence call is never success.
          return { id: c.event_id, outcome: 'failed', fields: [], error: message.slice(0, 300) }
        }
      }
    })
    const failed = results.filter(r => r.outcome === 'failed').length
    return jsonResponse({ success: failed === 0, lane, processed: results.length,
      updated: results.filter(r => r.fields.length > 0).length,
      fields_filled: results.reduce((n, r) => n + r.fields.length, 0),
      no_change: results.filter(r => r.outcome === 'no_change').length,
      failed, ai_attempts: aiAttempts, network_requests: networkRequests, results,
    }, failed === results.length && failed > 0 ? 500 : 200, req)
  }
}
