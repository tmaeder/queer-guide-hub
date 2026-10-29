import { corsResponse, errorResponse, getServiceClient, jsonResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { callJev, createJevBudget, JevBudgetDeferred } from '../_shared/jev-client.ts'
import { buildFieldEvidenceRequest, fieldEvidenceVerdict, EVIDENCE_QUESTION_VERSION } from '../_shared/jev-evidence-judgments.ts'
import { VALIDATION_FIXTURES } from './fixtures.ts'

/** Approved $5 lifetime canary; fixed synthetic records only, never claims or source writes. */
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return errorResponse('Use POST', 405, req)
  const db = getServiceClient(), auth = await requireInternalOrAdmin(req, db)
  if (auth instanceof Response) return auth
  if (!req.body) return errorResponse('Invalid JSON', 400, req)
  const reader = req.body.getReader(), decoder = new TextDecoder()
  let text = '', bytes = 0
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break
      bytes += part.value.byteLength
      if (bytes > 4096) return errorResponse('Request exceeds 4 KiB', 413, req)
      text += decoder.decode(part.value, { stream: true })
    }
    text += decoder.decode()
  } finally { await reader.cancel().catch(() => {}) }
  let body: { fixtures?: unknown; execute?: unknown }
  try { body = JSON.parse(text) } catch { return errorResponse('Invalid JSON', 400, req) }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['fixtures', 'execute'].includes(k))) return errorResponse('Invalid validation request', 400, req)
  const names = body.fixtures
  if (!Array.isArray(names) || names.length < 1 || names.length > 4 || new Set(names).size !== names.length || names.some(n => typeof n !== 'string' || !Object.hasOwn(VALIDATION_FIXTURES, n))) return errorResponse('Provide one to four unique fixture names', 400, req)
  if (body.execute !== undefined && typeof body.execute !== 'boolean') return errorResponse('execute must be boolean', 400, req)
  const prepared = (names as string[]).map(name => ({ name, ...VALIDATION_FIXTURES[name], request: buildFieldEvidenceRequest(VALIDATION_FIXTURES[name].candidate) }))
  if (body.execute !== true) return jsonResponse({ source_writes: 0, inference_calls: 0, question_version: EVIDENCE_QUESTION_VERSION, fixtures: prepared.map(({ name, expected, request }) => ({ name, expected, request })) }, 200, req)
  const results: Record<string, unknown>[] = []
  try {
    const budget = createJevBudget(db, 'validation-2026-10-29')
    for (const fixture of prepared) {
      const response = await callJev(fixture.request, {
        apiKey: Deno.env.get('JEV_API_KEY') || Deno.env.get('TYPESAFE_API_KEY') || '', caller: 'jev-validation', budget,
      })
      const verdict = fieldEvidenceVerdict(fixture.candidate, response)
      results.push({ fixture: fixture.name, expected: fixture.expected, verdict, matches: verdict === fixture.expected, response })
    }
    return jsonResponse({ success: true, source_writes: 0, question_version: EVIDENCE_QUESTION_VERSION, results }, 200, req)
  } catch (error) {
    return jsonResponse({ success: false, source_writes: 0, results, error: error instanceof JevBudgetDeferred ? 'budget_deferred' : 'validation_failed' }, error instanceof JevBudgetDeferred ? 429 : 503, req)
  }
})
