// search-intelligence
// Admin-gated router for search-intelligence operations: AI suggestions,
// search-visibility scoring (per-entity + batch + worst-scored leaderboard),
// search-query analytics, the search synonyms editor, and an install/health
// rollup. (Topic-cluster CRUD was retired in P3.)
// Holds SUPABASE_SERVICE_ROLE_KEY; never returns it.
//
// The Meilisearch index-management routes (indexes, settings versioning,
// synonyms, reindex, search-debug, consistency-check, drift reconcile) were
// removed in the Meili → Postgres search decommission. Search is served from
// the Postgres search_documents engine; nothing here talks to Meili anymore.

import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
  requireAdmin,
} from '../_shared/supabase-client.ts'
import { applySuggestion } from '../_shared/ai-suggestions.ts'

interface RouteContext {
  req: Request
  url: URL
  pathParts: string[]
  actorId: string
  service: ReturnType<typeof getServiceClient>
}

type Handler = (ctx: RouteContext) => Promise<Response>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  try {
    const url = new URL(req.url)
    // Strip the function-name prefix so we can route on the rest.
    const path = url.pathname.replace(/^\/+/, '').replace(/^functions\/v1\//, '')
    const parts = path.split('/').filter(Boolean)
    if (parts[0] === 'search-intelligence') parts.shift()

    // Public health check (no auth) so monitoring can poll cheaply.
    if (req.method === 'GET' && parts[0] === 'health' && parts.length === 1) {
      return jsonResponse({ ok: true }, 200, req)
    }

    const service = getServiceClient()

    const auth = await requireAdmin(req, service)
    if (auth instanceof Response) return auth
    const actorId = auth.userId

    const ctx: RouteContext = {
      req,
      url,
      pathParts: parts,
      actorId,
      service,
    }

    const handler = pickRoute(req.method, parts)
    if (!handler) return errorResponse('Not found', 404, req)
    return await handler(ctx)
  } catch (err) {
    console.error('search-intelligence error', err)
    const msg = err instanceof Error ? err.message : 'unknown error'
    return errorResponse(msg, 500, req)
  }
})

function pickRoute(method: string, parts: string[]): Handler | null {
  // /audit
  if (method === 'GET' && parts[0] === 'audit' && parts.length === 1) return listAudit
  // /visibility/worst — leaderboard; /visibility/batch — trigger a scoring run
  if (parts[0] === 'visibility' && parts.length === 2) {
    if (method === 'GET' && parts[1] === 'worst') return visibilityWorst
    if (method === 'POST' && parts[1] === 'batch') return visibilityBatch
  }
  // /visibility/:type/:id (GET, recompute via POST)
  if (parts[0] === 'visibility' && parts.length === 3) {
    if (method === 'GET') return getVisibility
    if (method === 'POST') return recomputeVisibility
  }
  if (
    method === 'POST' &&
    parts[0] === 'visibility' &&
    parts.length === 4 &&
    parts[3] === 'recompute'
  ) {
    return recomputeVisibility
  }
  // /setup-status — admin-only health/readiness rollup
  if (method === 'GET' && parts[0] === 'setup-status' && parts.length === 1) {
    return setupStatus
  }
  // /suggestions
  if (parts[0] === 'suggestions' && parts.length === 1) {
    if (method === 'GET') return listSuggestions
    if (method === 'POST') return createSuggestion
  }
  if (parts[0] === 'suggestions' && parts.length === 2) {
    if (method === 'PATCH') return updateSuggestion
  }
  // /analytics/* — read-only search-query analytics
  if (method === 'GET' && parts[0] === 'analytics' && parts.length === 2) {
    if (parts[1] === 'summary') return analyticsSummary
    if (parts[1] === 'top-queries') return analyticsTopQueries
    if (parts[1] === 'zero-results') return analyticsZeroResults
  }
  // /synonyms — editor for search_synonyms
  if (parts[0] === 'synonyms' && parts.length === 1) {
    if (method === 'GET') return listSynonyms
    if (method === 'POST') return createSynonym
  }
  if (parts[0] === 'synonyms' && parts.length === 2 && parts[1] === 'counts') {
    if (method === 'GET') return synonymsCounts
  }
  if (parts[0] === 'synonyms' && parts.length === 2 && parts[1] !== 'counts') {
    if (method === 'PATCH') return updateSynonym
    if (method === 'DELETE') return archiveSynonym
  }
  return null
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function recordAudit(
  ctx: RouteContext,
  action: string,
  resourceType: string,
  resourceId: string | null,
  before: unknown = null,
  after: unknown = null,
  metadata: Record<string, unknown> = {},
) {
  // Best-effort. Never block the caller on an audit failure.
  try {
    await ctx.service.from('search_audit_log').insert({
      actor_id: ctx.actorId === 'service-role' ? null : ctx.actorId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      before_state: before,
      after_state: after,
      metadata,
    })
  } catch (err) {
    console.warn('audit insert failed', err)
  }
}

async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    return {} as T
  }
}

// ── rate limit ───────────────────────────────────────────────────────────────
// Applied to mutation handlers only. Service role tokens bypass — internal
// workflow-dispatcher calls are trusted.
//
// Implementation: counts mutation rows the actor has produced in
// search_audit_log within the last 60 seconds. Mutation actions follow a
// predictable naming convention (resource.verb), so the prefix list below is
// the source of truth.

const RATE_LIMIT_PER_MINUTE = 60
const MUTATION_ACTION_PREFIXES = [
  'visibility.recompute',
  'visibility.batch',
  'synonym.',
] as const

async function checkRateLimit(ctx: RouteContext): Promise<Response | null> {
  // Service role + missing actor are not rate-limited.
  if (ctx.actorId === 'service-role') return null
  const since = new Date(Date.now() - 60_000).toISOString()
  // Match any of our mutation action prefixes via OR.
  const orFilter = MUTATION_ACTION_PREFIXES
    .map((p) => `action.like.${p}*`)
    .join(',')
  const { count, error } = await ctx.service
    .from('search_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('actor_id', ctx.actorId)
    .gte('created_at', since)
    .or(orFilter)
  if (error) {
    // Don't block on a counter failure; log and allow.
    console.warn('rate limit check failed; allowing request', error)
    return null
  }
  if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return jsonResponse(
      {
        success: false,
        error: `Rate limit: max ${RATE_LIMIT_PER_MINUTE} mutation(s) per minute per actor`,
        code: 'rate_limited',
      },
      429,
      ctx.req,
    )
  }
  return null
}

// ── handlers ─────────────────────────────────────────────────────────────────

async function listAudit(ctx: RouteContext): Promise<Response> {
  const limit = Math.min(Number(ctx.url.searchParams.get('limit') ?? '100'), 500)
  const actor = ctx.url.searchParams.get('actor')
  const action = ctx.url.searchParams.get('action')
  const resource = ctx.url.searchParams.get('resource')
  let q = ctx.service
    .from('search_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (actor) q = q.eq('actor_id', actor)
  if (action) q = q.eq('action', action)
  if (resource) q = q.eq('resource_type', resource)
  const { data, error } = await q
  if (error) return errorResponse(error.message, 500, ctx.req)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

// ── analytics (read-only over search_queries) ────────────────────────────────

function analyticsSince(ctx: RouteContext): string {
  // ?since accepts an ISO timestamp or a window shorthand (24h | 7d | 30d).
  const raw = ctx.url.searchParams.get('since') ?? '7d'
  const m = raw.match(/^(\d+)([hd])$/)
  if (m) {
    const hours = m[2] === 'h' ? Number(m[1]) : Number(m[1]) * 24
    return new Date(Date.now() - hours * 3600_000).toISOString()
  }
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed)
    ? new Date(Date.now() - 7 * 24 * 3600_000).toISOString()
    : new Date(parsed).toISOString()
}

async function analyticsSummary(ctx: RouteContext): Promise<Response> {
  const { data, error } = await ctx.service.rpc('search_analytics_summary', {
    p_since: analyticsSince(ctx),
  })
  if (error) return errorResponse(error.message, 500, ctx.req)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

async function analyticsTopQueries(ctx: RouteContext): Promise<Response> {
  const limit = Math.min(Number(ctx.url.searchParams.get('limit') ?? '50'), 200)
  const { data, error } = await ctx.service.rpc('search_analytics_top_queries', {
    p_since: analyticsSince(ctx),
    p_limit: limit,
  })
  if (error) return errorResponse(error.message, 500, ctx.req)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

async function analyticsZeroResults(ctx: RouteContext): Promise<Response> {
  const limit = Math.min(Number(ctx.url.searchParams.get('limit') ?? '50'), 200)
  const { data, error } = await ctx.service.rpc('search_analytics_zero_results', {
    p_since: analyticsSince(ctx),
    p_limit: limit,
  })
  if (error) return errorResponse(error.message, 500, ctx.req)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

// ── synonyms editor (search_synonyms) ────────────────────────────────────────

async function listSynonyms(ctx: RouteContext): Promise<Response> {
  const p = ctx.url.searchParams
  const { data, error } = await ctx.service.rpc('admin_synonyms_list', {
    p_q: p.get('q') || null,
    p_status: p.get('status') || null,
    p_locale: p.get('locale') || null,
    p_limit: Math.min(Number(p.get('limit') ?? '50'), 200),
    p_offset: Math.max(Number(p.get('offset') ?? '0'), 0),
  })
  if (error) return errorResponse(error.message, 500, ctx.req)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

async function synonymsCounts(ctx: RouteContext): Promise<Response> {
  const { data, error } = await ctx.service.rpc('admin_synonyms_counts')
  if (error) return errorResponse(error.message, 500, ctx.req)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

function normalizeTermArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => (typeof x === 'string' ? x.trim().toLowerCase() : ''))
    .filter(Boolean)
}

async function createSynonym(ctx: RouteContext): Promise<Response> {
  const rl = await checkRateLimit(ctx)
  if (rl) return rl
  const body = await readJson<{
    terms?: unknown
    replacements?: unknown
    is_one_way?: boolean
    locale?: string
    indexes?: unknown
    notes?: string
    status?: string
  }>(ctx.req)
  const terms = normalizeTermArray(body.terms)
  const replacements = normalizeTermArray(body.replacements)
  if (terms.length === 0 || replacements.length === 0) {
    return errorResponse('terms and replacements are both required', 400, ctx.req)
  }
  const status = body.status === 'active' ? 'active' : 'approved'
  const insert = {
    terms,
    replacements,
    is_one_way: body.is_one_way ?? true,
    locale: (body.locale || '*').trim(),
    indexes: normalizeTermArray(body.indexes),
    notes: body.notes?.trim() || null,
    status,
    source: 'manual',
    created_by: ctx.actorId === 'service-role' ? null : ctx.actorId,
    approved_at: status === 'active' ? new Date().toISOString() : null,
    approved_by: status === 'active' && ctx.actorId !== 'service-role' ? ctx.actorId : null,
  }
  const { data, error } = await ctx.service
    .from('search_synonyms')
    .insert(insert)
    .select()
    .single()
  if (error) return errorResponse(error.message, 500, ctx.req)
  await recordAudit(ctx, 'synonym.create', 'synonym', data.id, null, data)
  return jsonResponse({ success: true, data }, 201, ctx.req)
}

async function updateSynonym(ctx: RouteContext): Promise<Response> {
  const rl = await checkRateLimit(ctx)
  if (rl) return rl
  const id = ctx.pathParts[1]
  if (!id) return errorResponse('id required', 400, ctx.req)
  const body = await readJson<Record<string, unknown>>(ctx.req)

  const update: Record<string, unknown> = {}
  if ('terms' in body) update.terms = normalizeTermArray(body.terms)
  if ('replacements' in body) update.replacements = normalizeTermArray(body.replacements)
  if ('is_one_way' in body) update.is_one_way = Boolean(body.is_one_way)
  if ('locale' in body) update.locale = String(body.locale || '*').trim()
  if ('indexes' in body) update.indexes = normalizeTermArray(body.indexes)
  if ('notes' in body) update.notes = (body.notes as string)?.trim() || null
  if ('status' in body) {
    const next = String(body.status)
    const allowed = ['active', 'approved', 'pending', 'archived']
    if (!allowed.includes(next)) return errorResponse('invalid status', 400, ctx.req)
    update.status = next
    if (next === 'active') {
      update.approved_at = new Date().toISOString()
      update.approved_by = ctx.actorId === 'service-role' ? null : ctx.actorId
      update.archived_at = null
    }
    if (next === 'archived') update.archived_at = new Date().toISOString()
  }
  if (Object.keys(update).length === 0) {
    return errorResponse('no updatable fields provided', 400, ctx.req)
  }

  const { data: before } = await ctx.service
    .from('search_synonyms')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  const { data, error } = await ctx.service
    .from('search_synonyms')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) return errorResponse(error.message, 500, ctx.req)
  await recordAudit(ctx, 'synonym.update', 'synonym', id, before, data)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

async function archiveSynonym(ctx: RouteContext): Promise<Response> {
  const rl = await checkRateLimit(ctx)
  if (rl) return rl
  const id = ctx.pathParts[1]
  if (!id) return errorResponse('id required', 400, ctx.req)
  const { data: before } = await ctx.service
    .from('search_synonyms')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  const { data, error } = await ctx.service
    .from('search_synonyms')
    .update({ status: 'archived', archived_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return errorResponse(error.message, 500, ctx.req)
  await recordAudit(ctx, 'synonym.archive', 'synonym', id, before, data)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

async function visibilityWorst(ctx: RouteContext): Promise<Response> {
  const entityType = ctx.url.searchParams.get('entity_type')
  const limit = Math.min(Number(ctx.url.searchParams.get('limit') ?? '50'), 200)
  const { data, error } = await ctx.service.rpc('search_visibility_worst', {
    p_entity_type: entityType || null,
    p_limit: limit,
  })
  if (error) return errorResponse(error.message, 500, ctx.req)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

async function visibilityBatch(ctx: RouteContext): Promise<Response> {
  const rl = await checkRateLimit(ctx)
  if (rl) return rl
  const body = await readJson<{ limit?: number }>(ctx.req)
  const limit = Math.min(Math.max(Number(body.limit ?? 2000), 1), 5000)
  const { data, error } = await ctx.service.rpc('run_visibility_score_batch', { p_limit: limit })
  if (error) return errorResponse(error.message, 500, ctx.req)
  await recordAudit(ctx, 'visibility.batch', 'visibility', null, null, data)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

async function getVisibility(ctx: RouteContext): Promise<Response> {
  const [, entityType, entityId] = ctx.pathParts
  if (!entityType || !entityId) return errorResponse('entity_type and id required', 400, ctx.req)
  const { data, error } = await ctx.service
    .from('search_visibility_scores')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle()
  if (error) return errorResponse(error.message, 500, ctx.req)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

async function recomputeVisibility(ctx: RouteContext): Promise<Response> {
  const rl = await checkRateLimit(ctx)
  if (rl) return rl
  const [, entityType, entityId] = ctx.pathParts
  if (!entityType || !entityId) return errorResponse('entity_type and id required', 400, ctx.req)
  const { data: rpcResult, error: rpcErr } = await ctx.service.rpc('compute_visibility_score', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  })
  if (rpcErr) return errorResponse(rpcErr.message, 500, ctx.req)
  const result = rpcResult as {
    score: number
    breakdown: unknown
    suggestions: string[]
    computed_at: string
  }
  const upsert = {
    entity_type: entityType,
    entity_id: entityId,
    score: result.score,
    breakdown: result.breakdown,
    suggestions: result.suggestions ?? [],
    computed_at: result.computed_at,
  }
  const { data, error } = await ctx.service
    .from('search_visibility_scores')
    .upsert(upsert, { onConflict: 'entity_type,entity_id' })
    .select()
    .single()
  if (error) return errorResponse(error.message, 500, ctx.req)
  await recordAudit(ctx, 'visibility.recompute', entityType, entityId, null, data)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

// ── ai_suggestions ──────────────────────────────────────────────────────────

async function listSuggestions(ctx: RouteContext): Promise<Response> {
  const status = ctx.url.searchParams.get('status')
  const type = ctx.url.searchParams.get('type')
  const entityType = ctx.url.searchParams.get('entity_type')
  const limit = Math.min(Number(ctx.url.searchParams.get('limit') ?? '100'), 500)
  let q = ctx.service
    .from('ai_suggestions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status) q = q.eq('status', status)
  if (type) q = q.eq('suggestion_type', type)
  if (entityType) q = q.eq('entity_type', entityType)
  const { data, error } = await q
  if (error) return errorResponse(error.message, 500, ctx.req)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

async function createSuggestion(ctx: RouteContext): Promise<Response> {
  const rl = await checkRateLimit(ctx)
  if (rl) return rl
  const body = await readJson<{
    suggestion_type: string
    entity_type?: string | null
    entity_id?: string | null
    locale?: string | null
    proposed_value: unknown
    current_value?: unknown
    source?: string
    source_model?: string
    source_run_id?: string
    confidence?: number
    expires_at?: string
  }>(ctx.req)
  if (!body.suggestion_type || body.proposed_value == null) {
    return errorResponse('suggestion_type and proposed_value required', 400, ctx.req)
  }
  const insert = {
    suggestion_type: body.suggestion_type,
    entity_type: body.entity_type ?? null,
    entity_id: body.entity_id ?? null,
    locale: body.locale ?? null,
    proposed_value: body.proposed_value,
    current_value: body.current_value ?? null,
    source: body.source ?? 'editor',
    source_model: body.source_model ?? null,
    source_run_id: body.source_run_id ?? null,
    confidence: body.confidence ?? null,
    expires_at: body.expires_at ?? null,
    status: 'pending' as const,
  }
  const { data, error } = await ctx.service
    .from('ai_suggestions')
    .insert(insert)
    .select()
    .single()
  if (error) return errorResponse(error.message, 500, ctx.req)
  await recordAudit(ctx, 'suggestion.create', 'suggestion', data.id, null, data)
  return jsonResponse({ success: true, data }, 201, ctx.req)
}

async function updateSuggestion(ctx: RouteContext): Promise<Response> {
  const rl = await checkRateLimit(ctx)
  if (rl) return rl
  const id = ctx.pathParts[1]
  if (!id) return errorResponse('id required', 400, ctx.req)
  const body = await readJson<{
    status?: 'pending' | 'approved' | 'applied' | 'rejected' | 'superseded' | 'expired'
    proposed_value?: unknown
    review_notes?: string
  }>(ctx.req)
  if (!body.status && body.proposed_value == null && body.review_notes == null) {
    return errorResponse('no updatable fields', 400, ctx.req)
  }

  const { data: before } = await ctx.service
    .from('ai_suggestions')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!before) return errorResponse('suggestion not found', 404, ctx.req)

  const update: Record<string, unknown> = {}
  if (body.status) update.status = body.status
  if (body.proposed_value != null) update.proposed_value = body.proposed_value
  if (body.review_notes != null) update.review_notes = body.review_notes
  if (body.status === 'approved' || body.status === 'applied') {
    update.reviewer_id = ctx.actorId === 'service-role' ? null : ctx.actorId
    update.approved_at = new Date().toISOString()
  }
  if (body.status === 'rejected') {
    update.reviewer_id = ctx.actorId === 'service-role' ? null : ctx.actorId
    update.rejected_at = new Date().toISOString()
  }

  // Auto-apply on approve (Q3 recommendation): if approve succeeds, attempt to
  // apply the suggestion. On apply failure, keep status=approved + log error
  // in review_notes (the row stays in the queue for retry).
  let applyError: string | null = null
  let applied = false
  if (body.status === 'approved') {
    try {
      applied = await applySuggestion(ctx.service, {
        ...before,
        proposed_value: body.proposed_value ?? before.proposed_value,
      })
    } catch (e) {
      applyError = e instanceof Error ? e.message : 'unknown apply error'
    }
    if (applied) {
      update.status = 'applied'
      update.applied_at = new Date().toISOString()
    } else if (applyError) {
      update.review_notes = `auto-apply failed: ${applyError}` +
        (body.review_notes ? `\n${body.review_notes}` : '')
    }
  }

  const { data, error } = await ctx.service
    .from('ai_suggestions')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) return errorResponse(error.message, 500, ctx.req)
  await recordAudit(ctx, 'suggestion.update', 'suggestion', id, before, data, {
    auto_applied: applied,
    apply_error: applyError,
  })
  return jsonResponse({ success: true, data, auto_applied: applied, apply_error: applyError }, 200, ctx.req)
}

// ── /setup-status ───────────────────────────────────────────────────────────
//
// Read-only rollup of install state. Calls verify_search_intelligence_install()
// (DB function from 20260429250000), then layers on a couple of runtime probes
// the SQL function can't see (env vars on the function).
//
// Returns:
//   {
//     summary: { ok, warn, fail, na },
//     checks:  [{ category, name, status, detail }, ...],
//     runtime: { function_env: { ... } }
//   }

async function setupStatus(ctx: RouteContext): Promise<Response> {
  // 1. DB-side checks via the verify function.
  const { data: rows, error } = await ctx.service.rpc('verify_search_intelligence_install')
  if (error) {
    return errorResponse(`verify_search_intelligence_install failed: ${error.message}`, 500, ctx.req)
  }
  type Row = { category: string; name: string; status: string; detail: string }
  const checks = (rows ?? []) as Row[]

  // 2. Runtime probes the SQL function can't see.
  const runtime = {
    function_env: {
      SEARCH_INTELLIGENCE_WEBHOOK_SECRET: Boolean(
        Deno.env.get('SEARCH_INTELLIGENCE_WEBHOOK_SECRET'),
      ),
      WEBHOOK_SECRET: Boolean(Deno.env.get('WEBHOOK_SECRET')),
      SUPABASE_URL: Boolean(Deno.env.get('SUPABASE_URL')),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),
    },
  }

  // Inject runtime checks as virtual rows so the UI can render uniformly.
  if (
    !runtime.function_env.SEARCH_INTELLIGENCE_WEBHOOK_SECRET &&
    !runtime.function_env.WEBHOOK_SECRET
  ) {
    checks.push({
      category: 'env',
      name: 'SEARCH_INTELLIGENCE_WEBHOOK_SECRET on function',
      status: 'fail',
      detail: 'set on the deployed function (Supabase Functions dashboard)',
    })
  } else {
    checks.push({
      category: 'env',
      name: 'SEARCH_INTELLIGENCE_WEBHOOK_SECRET on function',
      status: 'ok',
      detail: 'set',
    })
  }

  const summary = {
    ok: checks.filter((c) => c.status === 'ok').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
    na: checks.filter((c) => c.status === 'na').length,
  }

  return jsonResponse({ success: true, data: { summary, checks, runtime } }, 200, ctx.req)
}
