// search-intelligence
// Admin-gated router for search-intelligence operations: topic clusters, AI
// suggestions, search-visibility scoring, search-query analytics, and an
// install/health rollup.
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
  // /clusters
  if (parts[0] === 'clusters' && parts.length === 1) {
    if (method === 'GET') return listClusters
    if (method === 'POST') return createCluster
  }
  if (parts[0] === 'clusters' && parts.length === 2) {
    if (method === 'GET') return getCluster
    if (method === 'PATCH') return updateCluster
    if (method === 'DELETE') return archiveCluster
  }
  // /clusters/:id/tags  (link / unlink)
  if (parts[0] === 'clusters' && parts[2] === 'tags' && parts.length === 3) {
    if (method === 'POST') return linkClusterTag
  }
  if (parts[0] === 'clusters' && parts[2] === 'tags' && parts.length === 4) {
    if (method === 'DELETE') return unlinkClusterTag
  }
  // /audit
  if (method === 'GET' && parts[0] === 'audit' && parts.length === 1) return listAudit
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

// ── topic_clusters CRUD ──────────────────────────────────────────────────────

async function listClusters(ctx: RouteContext): Promise<Response> {
  const status = ctx.url.searchParams.get('status')
  const limit = Math.min(Number(ctx.url.searchParams.get('limit') ?? '100'), 500)
  let q = ctx.service
    .from('topic_clusters')
    .select(
      'id, slug, name, description, parent_cluster_id, is_featured, status, starts_at, ends_at, cover_image_url, cover_image_alt, metadata, created_at, updated_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status) q = q.eq('status', status)
  const { data: clusters, error } = await q
  if (error) return errorResponse(error.message, 500, ctx.req)

  // Attach tag counts in one query.
  const { data: tagCounts } = await ctx.service
    .from('topic_cluster_tags')
    .select('cluster_id')
  const counts = new Map<string, number>()
  for (const r of tagCounts ?? []) {
    const id = (r as { cluster_id: string }).cluster_id
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const enriched = (clusters ?? []).map((c: { id: string }) => ({
    ...c,
    tag_count: counts.get(c.id) ?? 0,
  }))
  return jsonResponse({ success: true, data: enriched }, 200, ctx.req)
}

async function getCluster(ctx: RouteContext): Promise<Response> {
  const id = ctx.pathParts[1]
  if (!id) return errorResponse('id required', 400, ctx.req)
  const { data: cluster, error } = await ctx.service
    .from('topic_clusters')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) return errorResponse(error.message, 500, ctx.req)
  if (!cluster) return errorResponse('not found', 404, ctx.req)
  // Tags + entity counts
  const { data: tags } = await ctx.service
    .from('topic_cluster_tags')
    .select('tag_id, weight, added_at, unified_tags(id, name, slug)')
    .eq('cluster_id', id)
  const { data: entityCounts } = await ctx.service
    .from('cluster_entity_counts')
    .select('entity_type, entity_count')
    .eq('cluster_id', id)
  return jsonResponse(
    { success: true, data: { cluster, tags: tags ?? [], entity_counts: entityCounts ?? [] } },
    200,
    ctx.req,
  )
}

async function createCluster(ctx: RouteContext): Promise<Response> {
  const rl = await checkRateLimit(ctx)
  if (rl) return rl
  const body = await readJson<{
    slug: string
    name: string
    description?: string
    parent_cluster_id?: string | null
    is_featured?: boolean
    starts_at?: string | null
    ends_at?: string | null
    cover_image_url?: string | null
    cover_image_alt?: string | null
    metadata?: Record<string, unknown>
  }>(ctx.req)
  if (!body.slug || !body.name) {
    return errorResponse('slug and name required', 400, ctx.req)
  }
  const insert = {
    slug: body.slug.toLowerCase().trim(),
    name: body.name.trim(),
    description: body.description ?? null,
    parent_cluster_id: body.parent_cluster_id ?? null,
    is_featured: Boolean(body.is_featured),
    starts_at: body.starts_at ?? null,
    ends_at: body.ends_at ?? null,
    cover_image_url: body.cover_image_url ?? null,
    cover_image_alt: body.cover_image_alt ?? null,
    metadata: body.metadata ?? {},
    curator_user_id: ctx.actorId === 'service-role' ? null : ctx.actorId,
    status: 'active' as const,
  }
  const { data, error } = await ctx.service
    .from('topic_clusters')
    .insert(insert)
    .select()
    .single()
  if (error) return errorResponse(error.message, 500, ctx.req)
  await recordAudit(ctx, 'cluster.create', 'cluster', data.id, null, data)
  return jsonResponse({ success: true, data }, 201, ctx.req)
}

async function updateCluster(ctx: RouteContext): Promise<Response> {
  const rl = await checkRateLimit(ctx)
  if (rl) return rl
  const id = ctx.pathParts[1]
  if (!id) return errorResponse('id required', 400, ctx.req)
  const body = await readJson<Record<string, unknown>>(ctx.req)
  const allowed = [
    'slug',
    'name',
    'description',
    'parent_cluster_id',
    'is_featured',
    'status',
    'starts_at',
    'ends_at',
    'cover_image_url',
    'cover_image_alt',
    'metadata',
  ] as const
  const update: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) update[k] = body[k]
  }
  if (typeof update.status === 'string' && !['draft', 'active', 'archived'].includes(update.status)) {
    return errorResponse('invalid status', 400, ctx.req)
  }
  if (Object.keys(update).length === 0) {
    return errorResponse('no updatable fields provided', 400, ctx.req)
  }
  const { data: before } = await ctx.service
    .from('topic_clusters')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  const { data, error } = await ctx.service
    .from('topic_clusters')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) return errorResponse(error.message, 500, ctx.req)
  await recordAudit(ctx, 'cluster.update', 'cluster', id, before, data)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

async function archiveCluster(ctx: RouteContext): Promise<Response> {
  const rl = await checkRateLimit(ctx)
  if (rl) return rl
  const id = ctx.pathParts[1]
  if (!id) return errorResponse('id required', 400, ctx.req)
  const { data: before } = await ctx.service
    .from('topic_clusters')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  const { data, error } = await ctx.service
    .from('topic_clusters')
    .update({ status: 'archived' })
    .eq('id', id)
    .select()
    .single()
  if (error) return errorResponse(error.message, 500, ctx.req)
  await recordAudit(ctx, 'cluster.archive', 'cluster', id, before, data)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

async function linkClusterTag(ctx: RouteContext): Promise<Response> {
  const rl = await checkRateLimit(ctx)
  if (rl) return rl
  const clusterId = ctx.pathParts[1]
  if (!clusterId) return errorResponse('cluster id required', 400, ctx.req)
  const body = await readJson<{ tag_id: string; weight?: number }>(ctx.req)
  if (!body.tag_id) return errorResponse('tag_id required', 400, ctx.req)
  const insert = {
    cluster_id: clusterId,
    tag_id: body.tag_id,
    weight: body.weight ?? 1.0,
    added_by: ctx.actorId === 'service-role' ? null : ctx.actorId,
  }
  const { data, error } = await ctx.service
    .from('topic_cluster_tags')
    .upsert(insert, { onConflict: 'cluster_id,tag_id' })
    .select()
    .single()
  if (error) return errorResponse(error.message, 500, ctx.req)
  await recordAudit(ctx, 'cluster.tag.link', 'cluster', clusterId, null, data)
  return jsonResponse({ success: true, data }, 201, ctx.req)
}

async function unlinkClusterTag(ctx: RouteContext): Promise<Response> {
  const rl = await checkRateLimit(ctx)
  if (rl) return rl
  const clusterId = ctx.pathParts[1]
  const tagId = ctx.pathParts[3]
  if (!clusterId || !tagId) return errorResponse('cluster id and tag id required', 400, ctx.req)
  const { error } = await ctx.service
    .from('topic_cluster_tags')
    .delete()
    .eq('cluster_id', clusterId)
    .eq('tag_id', tagId)
  if (error) return errorResponse(error.message, 500, ctx.req)
  await recordAudit(ctx, 'cluster.tag.unlink', 'cluster', clusterId, { tag_id: tagId }, null)
  return jsonResponse({ success: true, data: { cluster_id: clusterId, tag_id: tagId } }, 200, ctx.req)
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
