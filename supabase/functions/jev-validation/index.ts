import { corsResponse, errorResponse, getServiceClient, jsonResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { callJev, createJevBudget, JevBudgetDeferred } from '../_shared/jev-client.ts'
import { prepareValidationCase } from './prepare.ts'

/** Approved $5 lifetime validation; fixed fixtures only, never claims or source writes. */
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
  if (!Array.isArray(names) || names.length < 1 || names.length > 4 || new Set(names).size !== names.length || names.some(n => typeof n !== 'string')) return errorResponse('Provide one to four unique fixture names', 400, req)
  if (body.execute !== undefined && typeof body.execute !== 'boolean') return errorResponse('execute must be boolean', 400, req)
  const prepared = (names as string[]).map(prepareValidationCase)
  if (prepared.some(fixture => fixture === null)) return errorResponse('Unknown validation fixture', 400, req)
  const versions = [...new Set(prepared.map(fixture => fixture!.questionVersion))]
  if (body.execute !== true) return jsonResponse({ source_writes: 0, inference_calls: 0, question_versions: versions, fixtures: prepared.map(fixture => ({ name: fixture!.name, question_version: fixture!.questionVersion, kind: fixture!.kind, expected: fixture!.expected, request: fixture!.request })) }, 200, req)
  const results: Record<string, unknown>[] = []
  try {
    const budget = createJevBudget(db, 'validation-2026-10-29')
    for (const fixture of prepared) {
      if (!fixture) throw new Error('Unknown validation fixture')
      const response = await callJev(fixture.request, {
        apiKey: Deno.env.get('JEV_API_KEY') || Deno.env.get('TYPESAFE_API_KEY') || '', caller: 'jev-validation', budget,
      })
      results.push({ fixture: fixture.name, question_version: fixture.questionVersion, kind: fixture.kind, expected: fixture.expected, ...fixture.judge(response), response })
    }
    return jsonResponse({ success: true, source_writes: 0, question_versions: versions, results }, 200, req)
  } catch (error) {
    return jsonResponse({ success: false, source_writes: 0, results, error: error instanceof JevBudgetDeferred ? 'budget_deferred' : 'validation_failed' }, error instanceof JevBudgetDeferred ? 429 : 503, req)
  }
})
