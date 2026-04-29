// search-intelligence
// Admin-gated router for Meilisearch + search-intelligence operations.
// Holds MEILISEARCH_ADMIN_KEY and SUPABASE_SERVICE_ROLE_KEY; never returns either.

import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
  requireAdmin,
} from '../_shared/supabase-client.ts'
import { meili, MeiliError, isConfigured as meiliConfigured } from './meili.ts'
import { validateSynonym, buildMeilisearchSynonymMap, SynonymInput } from './synonyms.ts'

// Indexes the system manages. Kept aligned with meilisearch-sync ALL_TYPES.
const ALL_INDEXES = [
  'venues',
  'events',
  'cities',
  'countries',
  'news',
  'marketplace',
  'personalities',
  'tags',
  'queer_villages',
  'hotels',
  'festivals',
] as const

// Map from Meilisearch index name to the Postgres table that backs it.
// Used for DB-vs-index counts and consistency-check.
const INDEX_TO_TABLE: Record<string, string> = {
  venues: 'venues',
  events: 'events',
  cities: 'cities',
  countries: 'countries',
  news: 'news_articles',
  marketplace: 'marketplace_listings',
  personalities: 'personalities',
  tags: 'unified_tags',
  queer_villages: 'queer_villages',
  hotels: 'hotels',
  festivals: 'events',
}

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
      return jsonResponse({ ok: true, meili_configured: meiliConfigured() }, 200, req)
    }

    const service = getServiceClient()

    // Cron / webhook bypass for /cron/* routes. Matches the meilisearch-sync
    // pattern: pg_cron sets X-Webhook-Secret to the value of WEBHOOK_SECRET.
    // Treated as service-role for audit purposes.
    let actorId: string
    if (parts[0] === 'cron') {
      const provided = req.headers.get('x-webhook-secret') ?? ''
      const expected =
        Deno.env.get('SEARCH_INTELLIGENCE_WEBHOOK_SECRET') ??
        Deno.env.get('WEBHOOK_SECRET') ??
        ''
      if (!expected || provided !== expected) {
        return errorResponse('Invalid webhook secret', 401, req)
      }
      actorId = 'service-role'
    } else {
      const auth = await requireAdmin(req, service)
      if (auth instanceof Response) return auth
      actorId = auth.userId
    }

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
    if (err instanceof MeiliError) {
      return errorResponse(`Meilisearch error: ${err.message}`, 502, req)
    }
    console.error('search-intelligence error', err)
    const msg = err instanceof Error ? err.message : 'unknown error'
    return errorResponse(msg, 500, req)
  }
})

function pickRoute(method: string, parts: string[]): Handler | null {
  // /indexes
  if (method === 'GET' && parts[0] === 'indexes' && parts.length === 1) return listIndexes
  // /indexes/:name/stats
  if (method === 'GET' && parts[0] === 'indexes' && parts[2] === 'stats') return indexStats
  // /indexes/:name/settings (GET, PATCH)
  if (
    parts[0] === 'indexes' &&
    parts[2] === 'settings' &&
    parts.length === 3
  ) {
    if (method === 'GET') return getIndexSettings
    if (method === 'PATCH') return patchIndexSettings
  }
  // /indexes/:name/settings/versions
  if (
    method === 'GET' &&
    parts[0] === 'indexes' &&
    parts[2] === 'settings' &&
    parts[3] === 'versions'
  ) {
    return listSettingsVersions
  }
  // /indexes/:name/settings/rollback
  if (
    method === 'POST' &&
    parts[0] === 'indexes' &&
    parts[2] === 'settings' &&
    parts[3] === 'rollback'
  ) {
    return rollbackIndexSettings
  }
  // /search-debug
  if (method === 'POST' && parts[0] === 'search-debug') return searchDebug
  // /synonyms
  if (parts[0] === 'synonyms' && parts.length === 1) {
    if (method === 'GET') return listSynonyms
    if (method === 'POST') return createSynonym
  }
  if (parts[0] === 'synonyms' && parts.length === 2) {
    if (method === 'PATCH') return updateSynonym
    if (method === 'DELETE') return archiveSynonym
  }
  // /synonyms/sync
  if (method === 'POST' && parts[0] === 'synonyms' && parts[1] === 'sync') {
    return syncSynonyms
  }
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
  // /clusters/:id/tags  (link)
  if (parts[0] === 'clusters' && parts[2] === 'tags' && parts.length === 3) {
    if (method === 'POST') return linkClusterTag
  }
  if (parts[0] === 'clusters' && parts[2] === 'tags' && parts.length === 4) {
    if (method === 'DELETE') return unlinkClusterTag
  }
  // /reindex
  if (method === 'POST' && parts[0] === 'reindex' && parts.length === 1) return startReindex
  if (method === 'GET' && parts[0] === 'reindex' && parts.length === 1) return listReindex
  if (method === 'GET' && parts[0] === 'reindex' && parts.length === 2) return getReindex
  // /tasks/:uid
  if (method === 'GET' && parts[0] === 'tasks' && parts.length === 2) return getTask
  // /audit
  if (method === 'GET' && parts[0] === 'audit' && parts.length === 1) return listAudit
  // /consistency-check
  if (method === 'POST' && parts[0] === 'consistency-check') return consistencyCheck
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
  // /cron/reconcile (webhook-secret only, see Deno.serve gate above)
  if (method === 'POST' && parts[0] === 'cron' && parts[1] === 'reconcile') {
    return cronReconcile
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
// Applied to mutation handlers only (writes to DB or Meilisearch). Service
// role tokens bypass — internal cron / workflow-dispatcher calls are trusted.
//
// Implementation: counts mutation rows the actor has produced in
// search_audit_log within the last 60 seconds. Mutation actions follow a
// predictable naming convention (resource.verb where verb in
// {create,update,archive,sync,start,fail,complete,rollback,recompute}), so
// the prefix list below is the source of truth.

const RATE_LIMIT_PER_MINUTE = 60
const MUTATION_ACTION_PREFIXES = [
  'synonym.',
  'synonyms.',
  'settings.',
  'reindex.start',
  'reindex.complete',
  'reindex.fail',
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

async function listIndexes(ctx: RouteContext): Promise<Response> {
  let meiliIndexes: Array<{ uid: string; primaryKey?: string }> = []
  if (meiliConfigured()) {
    const r = (await meili.listIndexes()) as { results?: typeof meiliIndexes }
    meiliIndexes = r.results ?? []
  }
  // DB row counts
  const counts: Record<string, number | null> = {}
  for (const name of ALL_INDEXES) {
    const table = INDEX_TO_TABLE[name]
    if (!table) {
      counts[name] = null
      continue
    }
    const { count, error } = await ctx.service
      .from(table)
      .select('id', { count: 'exact', head: true })
    counts[name] = error ? null : (count ?? 0)
  }
  return jsonResponse(
    {
      success: true,
      data: {
        managed: ALL_INDEXES,
        meili: meiliIndexes,
        db_counts: counts,
      },
    },
    200,
    ctx.req,
  )
}

async function indexStats(ctx: RouteContext): Promise<Response> {
  const name = ctx.pathParts[1]
  if (!name) return errorResponse('index name required', 400, ctx.req)
  const stats = await meili.indexStats(name)
  return jsonResponse({ success: true, data: stats }, 200, ctx.req)
}

async function getIndexSettings(ctx: RouteContext): Promise<Response> {
  const name = ctx.pathParts[1]
  if (!name) return errorResponse('index name required', 400, ctx.req)
  const source = ctx.url.searchParams.get('source') ?? 'applied'
  if (source === 'applied') {
    const settings = await meili.indexSettings(name)
    return jsonResponse({ success: true, data: { source, settings } }, 200, ctx.req)
  }
  // desired: latest active version
  const { data, error } = await ctx.service
    .from('search_settings_versions')
    .select('id, version, settings, comment, created_at, created_by')
    .eq('index_name', name)
    .eq('channel', 'active')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return errorResponse(error.message, 500, ctx.req)
  return jsonResponse(
    { success: true, data: { source, settings: data?.settings ?? null, version: data } },
    200,
    ctx.req,
  )
}

async function patchIndexSettings(ctx: RouteContext): Promise<Response> {
  const rl = await checkRateLimit(ctx)
  if (rl) return rl
  const name = ctx.pathParts[1]
  if (!name) return errorResponse('index name required', 400, ctx.req)
  const body = await readJson<{
    settings: Record<string, unknown>
    comment?: string
    apply?: boolean
  }>(ctx.req)
  if (!body.settings || typeof body.settings !== 'object') {
    return errorResponse('settings object required', 400, ctx.req)
  }
  // next version number
  const { data: latest } = await ctx.service
    .from('search_settings_versions')
    .select('version')
    .eq('index_name', name)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextVersion = (latest?.version ?? 0) + 1
  const insert = {
    index_name: name,
    version: nextVersion,
    channel: 'active' as const,
    settings: body.settings,
    comment: body.comment ?? null,
    created_by: ctx.actorId === 'service-role' ? null : ctx.actorId,
  }
  const { data, error } = await ctx.service
    .from('search_settings_versions')
    .insert(insert)
    .select()
    .single()
  if (error) return errorResponse(error.message, 500, ctx.req)

  let applyResult: unknown = null
  if (body.apply) {
    applyResult = await meili.patchIndexSettings(name, body.settings)
  }
  await recordAudit(ctx, 'settings.update', 'index', name, latest, data, {
    applied: Boolean(body.apply),
  })
  return jsonResponse(
    { success: true, data: { version: data, applied: applyResult } },
    200,
    ctx.req,
  )
}

async function listSettingsVersions(ctx: RouteContext): Promise<Response> {
  const name = ctx.pathParts[1]
  if (!name) return errorResponse('index name required', 400, ctx.req)
  const { data, error } = await ctx.service
    .from('search_settings_versions')
    .select('id, version, channel, comment, settings, created_at, created_by')
    .eq('index_name', name)
    .order('version', { ascending: false })
    .limit(50)
  if (error) return errorResponse(error.message, 500, ctx.req)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

async function rollbackIndexSettings(ctx: RouteContext): Promise<Response> {
  const name = ctx.pathParts[1]
  if (!name) return errorResponse('index name required', 400, ctx.req)
  const body = await readJson<{ version: number; apply?: boolean; confirm?: boolean }>(ctx.req)
  if (!Number.isFinite(body.version)) {
    return errorResponse('version (numeric) required', 400, ctx.req)
  }
  if (!body.confirm) {
    return errorResponse('confirm: true required for rollback', 400, ctx.req)
  }
  // Look up the target version
  const { data: target, error: tErr } = await ctx.service
    .from('search_settings_versions')
    .select('id, version, settings, comment')
    .eq('index_name', name)
    .eq('version', body.version)
    .maybeSingle()
  if (tErr) return errorResponse(tErr.message, 500, ctx.req)
  if (!target) return errorResponse(`version ${body.version} not found`, 404, ctx.req)
  // Find next version number
  const { data: latest } = await ctx.service
    .from('search_settings_versions')
    .select('version')
    .eq('index_name', name)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextVersion = (latest?.version ?? 0) + 1
  // Insert as new version (so history is preserved)
  const { data: inserted, error: insErr } = await ctx.service
    .from('search_settings_versions')
    .insert({
      index_name: name,
      version: nextVersion,
      channel: 'active' as const,
      settings: target.settings,
      comment: `rollback to v${target.version}${target.comment ? `: ${target.comment}` : ''}`,
      created_by: ctx.actorId === 'service-role' ? null : ctx.actorId,
    })
    .select()
    .single()
  if (insErr) return errorResponse(insErr.message, 500, ctx.req)
  let applyResult: unknown = null
  if (body.apply) {
    applyResult = await meili.patchIndexSettings(name, target.settings as Record<string, unknown>)
  }
  await recordAudit(ctx, 'settings.rollback', 'index', name, target, inserted, {
    rolled_back_to_version: target.version,
    new_version: nextVersion,
    applied: Boolean(body.apply),
  })
  return jsonResponse(
    { success: true, data: { version: inserted, applied: applyResult } },
    200,
    ctx.req,
  )
}

async function searchDebug(ctx: RouteContext): Promise<Response> {
  const body = await readJson<{
    index: string
    query: string
    filter?: string
    limit?: number
    showRankingScore?: boolean
    showRankingScoreDetails?: boolean
    matchingStrategy?: 'all' | 'last' | 'frequency'
    attributesToHighlight?: string[]
    sort?: string[]
  }>(ctx.req)
  if (!body.index || typeof body.query !== 'string') {
    return errorResponse('index and query required', 400, ctx.req)
  }
  const meiliBody: Record<string, unknown> = {
    q: body.query,
    limit: body.limit ?? 20,
    showRankingScore: body.showRankingScore ?? true,
    showRankingScoreDetails: body.showRankingScoreDetails ?? false,
  }
  if (body.filter) meiliBody.filter = body.filter
  if (body.matchingStrategy) meiliBody.matchingStrategy = body.matchingStrategy
  if (body.attributesToHighlight) meiliBody.attributesToHighlight = body.attributesToHighlight
  if (body.sort) meiliBody.sort = body.sort
  const t0 = Date.now()
  const raw = (await meili.search(body.index, meiliBody)) as {
    hits?: Array<Record<string, unknown>>
    estimatedTotalHits?: number
    processingTimeMs?: number
  }
  const duration = Date.now() - t0
  const hits = raw.hits ?? []
  const summary = {
    hits: hits.length,
    estimatedTotal: raw.estimatedTotalHits ?? null,
    processingTimeMs: raw.processingTimeMs ?? null,
    roundTripMs: duration,
    topMatches: hits.slice(0, 5).map((h) => ({
      id: h.id ?? null,
      title: h.title ?? null,
      score: (h._rankingScore as number | undefined) ?? null,
    })),
  }
  await recordAudit(ctx, 'debug.query', 'index', body.index, null, null, {
    query: body.query,
    filter: body.filter ?? null,
  })
  return jsonResponse({ success: true, data: { raw, summary } }, 200, ctx.req)
}

async function listSynonyms(ctx: RouteContext): Promise<Response> {
  const status = ctx.url.searchParams.get('status')
  const locale = ctx.url.searchParams.get('locale')
  const limit = Math.min(Number(ctx.url.searchParams.get('limit') ?? '100'), 500)
  let q = ctx.service
    .from('search_synonyms')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status) q = q.eq('status', status)
  if (locale) q = q.eq('locale', locale)
  const { data, error } = await q
  if (error) return errorResponse(error.message, 500, ctx.req)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

async function createSynonym(ctx: RouteContext): Promise<Response> {
  const rl = await checkRateLimit(ctx)
  if (rl) return rl
  const body = await readJson<Partial<SynonymInput>>(ctx.req)
  const v = validateSynonym(body)
  if (!v.ok || !v.cleaned) {
    return errorResponse(`validation: ${v.errors.join('; ')}`, 400, ctx.req)
  }
  const insert = {
    ...v.cleaned,
    status: 'pending' as const,
    created_by: ctx.actorId === 'service-role' ? null : ctx.actorId,
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
  const body = await readJson<Partial<SynonymInput> & { status?: string }>(ctx.req)
  const update: Record<string, unknown> = {}
  if (body.status) {
    if (!['pending', 'approved', 'active', 'rejected', 'archived'].includes(body.status)) {
      return errorResponse('invalid status', 400, ctx.req)
    }
    update.status = body.status
    if (body.status === 'active' || body.status === 'approved') {
      update.approved_by = ctx.actorId === 'service-role' ? null : ctx.actorId
      update.approved_at = new Date().toISOString()
    }
    if (body.status === 'archived') {
      update.archived_at = new Date().toISOString()
    }
  }
  if (body.terms || body.replacements) {
    const v = validateSynonym({ ...(body as Partial<SynonymInput>) })
    if (!v.ok || !v.cleaned) {
      return errorResponse(`validation: ${v.errors.join('; ')}`, 400, ctx.req)
    }
    Object.assign(update, v.cleaned)
  }
  if (body.notes != null) update.notes = body.notes
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

async function syncSynonyms(ctx: RouteContext): Promise<Response> {
  const rl = await checkRateLimit(ctx)
  if (rl) return rl
  const body = await readJson<{ indexes?: string[]; apply?: boolean }>(ctx.req)
  const targetIndexes = body.indexes && body.indexes.length > 0 ? body.indexes : [...ALL_INDEXES]
  const { data: rows, error } = await ctx.service
    .from('search_synonyms')
    .select('terms, replacements, is_one_way, indexes, locale, status')
    .eq('status', 'active')
  if (error) return errorResponse(error.message, 500, ctx.req)
  const result: Record<string, { count: number; applied: boolean; error?: string }> = {}
  for (const idx of targetIndexes) {
    try {
      const map = buildMeilisearchSynonymMap(rows ?? [], idx, null)
      let applied = false
      if (body.apply && meiliConfigured()) {
        await meili.patchIndexSettings(idx, { synonyms: map })
        applied = true
      }
      result[idx] = { count: Object.keys(map).length, applied }
    } catch (err) {
      result[idx] = {
        count: 0,
        applied: false,
        error: err instanceof Error ? err.message : 'unknown',
      }
    }
  }
  await recordAudit(ctx, 'synonyms.sync', 'index', null, null, result, {
    indexes: targetIndexes,
    applied: Boolean(body.apply),
  })
  return jsonResponse({ success: true, data: result }, 200, ctx.req)
}

async function startReindex(ctx: RouteContext): Promise<Response> {
  const rl = await checkRateLimit(ctx)
  if (rl) return rl
  const body = await readJson<{
    index: string
    scope?: Record<string, unknown>
    confirm?: boolean
    async?: boolean
  }>(ctx.req)
  if (!body.index) return errorResponse('index required', 400, ctx.req)
  if (!body.confirm) {
    return errorResponse('confirm: true required for destructive operation', 400, ctx.req)
  }
  if (!ALL_INDEXES.includes(body.index as (typeof ALL_INDEXES)[number])) {
    return errorResponse(`unknown index: ${body.index}`, 400, ctx.req)
  }
  const startedAt = new Date().toISOString()
  const { data: job, error } = await ctx.service
    .from('search_reindex_jobs')
    .insert({
      index_name: body.index,
      scope: body.scope ?? { full: true },
      status: 'running',
      started_at: startedAt,
      triggered_by: ctx.actorId === 'service-role' ? null : ctx.actorId,
    })
    .select()
    .single()
  if (error) return errorResponse(error.message, 500, ctx.req)
  await recordAudit(ctx, 'reindex.start', 'reindex_job', job.id, null, job)

  // Drive the existing meilisearch-sync edge function. Synchronous: small
  // indexes return in seconds, large ones may approach the function timeout.
  // For very large reindexes, pass async=true to get a job row and poll.
  if (body.async) {
    return jsonResponse({ success: true, data: { jobId: job.id, status: 'running' } }, 202, ctx.req)
  }

  const finalJob = await driveSyncTypeAndUpdate(ctx, job.id, body.index)
  return jsonResponse({ success: true, data: finalJob }, 200, ctx.req)
}

async function driveSyncTypeAndUpdate(
  ctx: RouteContext,
  jobId: string,
  indexName: string,
): Promise<unknown> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return await failJob(ctx, jobId, ['SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing'])
  }
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/meilisearch-sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'sync-type', type: indexName }),
    })
    const text = await res.text()
    let parsed: unknown = text
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      // leave as raw text
    }
    if (!res.ok) {
      return await failJob(ctx, jobId, [
        `meilisearch-sync ${res.status}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`,
      ])
    }
    const body = parsed as { success?: boolean; count?: number; error?: string }
    if (body.error || body.success === false) {
      return await failJob(ctx, jobId, [body.error ?? 'meilisearch-sync reported failure'])
    }
    const total = typeof body.count === 'number' ? body.count : 0
    const finishedAt = new Date().toISOString()
    const { data: updated } = await ctx.service
      .from('search_reindex_jobs')
      .update({
        status: 'completed',
        total,
        processed: total,
        finished_at: finishedAt,
      })
      .eq('id', jobId)
      .select()
      .single()
    await recordAudit(ctx, 'reindex.complete', 'reindex_job', jobId, null, updated, {
      processed: total,
    })
    return updated
  } catch (err) {
    return await failJob(ctx, jobId, [err instanceof Error ? err.message : 'unknown error'])
  }
}

async function failJob(
  ctx: RouteContext,
  jobId: string,
  errors: string[],
): Promise<unknown> {
  const finishedAt = new Date().toISOString()
  const { data } = await ctx.service
    .from('search_reindex_jobs')
    .update({
      status: 'failed',
      errors,
      finished_at: finishedAt,
    })
    .eq('id', jobId)
    .select()
    .single()
  await recordAudit(ctx, 'reindex.fail', 'reindex_job', jobId, null, data, { errors })
  return data
}

async function getReindex(ctx: RouteContext): Promise<Response> {
  const id = ctx.pathParts[1]
  if (!id) return errorResponse('id required', 400, ctx.req)
  const { data, error } = await ctx.service
    .from('search_reindex_jobs')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) return errorResponse(error.message, 500, ctx.req)
  if (!data) return errorResponse('not found', 404, ctx.req)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

async function listReindex(ctx: RouteContext): Promise<Response> {
  const limit = Math.min(Number(ctx.url.searchParams.get('limit') ?? '50'), 200)
  const indexFilter = ctx.url.searchParams.get('index')
  const statusFilter = ctx.url.searchParams.get('status')
  let q = ctx.service
    .from('search_reindex_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (indexFilter) q = q.eq('index_name', indexFilter)
  if (statusFilter) q = q.eq('status', statusFilter)
  const { data, error } = await q
  if (error) return errorResponse(error.message, 500, ctx.req)
  return jsonResponse({ success: true, data }, 200, ctx.req)
}

async function getTask(ctx: RouteContext): Promise<Response> {
  const uid = Number(ctx.pathParts[1])
  if (!Number.isFinite(uid)) return errorResponse('task uid must be numeric', 400, ctx.req)
  const task = await meili.task(uid)
  return jsonResponse({ success: true, data: task }, 200, ctx.req)
}

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

async function consistencyCheck(ctx: RouteContext): Promise<Response> {
  const body = await readJson<{ type: string; limit?: number }>(ctx.req)
  if (!body.type) return errorResponse('type required', 400, ctx.req)
  const table = INDEX_TO_TABLE[body.type]
  if (!table) return errorResponse(`unknown type: ${body.type}`, 400, ctx.req)
  // DB ids
  const { data: rows, error: dbErr, count } = await ctx.service
    .from(table)
    .select('id', { count: 'exact' })
    .limit(body.limit ?? 5000)
  if (dbErr) return errorResponse(dbErr.message, 500, ctx.req)
  const dbIds = new Set((rows ?? []).map((r) => String((r as { id: unknown }).id)))
  // Meili ids
  const meiliIds = new Set<string>()
  if (meiliConfigured()) {
    let offset = 0
    const page = 1000
    for (let i = 0; i < 50; i++) {
      const r = (await meili.listDocuments(body.type, page, offset)) as {
        results?: Array<{ id: unknown }>
        total?: number
      }
      const docs = r.results ?? []
      for (const d of docs) meiliIds.add(String(d.id))
      if (docs.length < page) break
      offset += page
    }
  }
  const missingInMeili: string[] = []
  for (const id of dbIds) if (!meiliIds.has(id)) missingInMeili.push(id)
  const orphansInMeili: string[] = []
  for (const id of meiliIds) if (!dbIds.has(id)) orphansInMeili.push(id)
  const result = {
    type: body.type,
    db_rows: count ?? dbIds.size,
    meili_docs: meiliIds.size,
    missing_in_meili: missingInMeili.slice(0, 100),
    orphans_in_meili: orphansInMeili.slice(0, 100),
    truncated:
      missingInMeili.length > 100 || orphansInMeili.length > 100,
  }
  await recordAudit(ctx, 'consistency.check', 'index', body.type, null, result)
  return jsonResponse({ success: true, data: result }, 200, ctx.req)
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

// ── cron handlers ────────────────────────────────────────────────────────────

/**
 * Daily settings drift reconcile. For each managed index:
 *   1. Read latest desired settings from search_settings_versions.
 *   2. Read applied settings from Meilisearch.
 *   3. Compare the keys we manage (synonyms, ranking, filterable, sortable,
 *      searchable, displayedAttributes, stopWords, typoTolerance).
 *   4. Write one audit row per index with `drift.scan` action and a
 *      drift summary in metadata.
 *
 * Webhook-secret authenticated only (see Deno.serve guard). Returns a per-index
 * summary so monitoring can alert on totals. Best-effort: a per-index error
 * is recorded in metadata but doesn't fail the whole run.
 */
async function cronReconcile(ctx: RouteContext): Promise<Response> {
  if (!meiliConfigured()) {
    return errorResponse('Meilisearch not configured', 503, ctx.req)
  }
  const monitored = [
    'searchableAttributes',
    'filterableAttributes',
    'sortableAttributes',
    'displayedAttributes',
    'rankingRules',
    'stopWords',
    'synonyms',
    'typoTolerance',
  ] as const

  const result: Record<
    string,
    { drifted_keys: string[]; has_drift: boolean; desired_version: number | null; error?: string }
  > = {}

  for (const indexName of ALL_INDEXES) {
    try {
      const { data: latest } = await ctx.service
        .from('search_settings_versions')
        .select('version, settings')
        .eq('index_name', indexName)
        .eq('channel', 'active')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!latest) {
        // No desired version on file. Not drift; just unanchored.
        result[indexName] = {
          drifted_keys: [],
          has_drift: false,
          desired_version: null,
        }
        continue
      }
      const desired = latest.settings as Record<string, unknown>

      let applied: Record<string, unknown>
      try {
        applied = (await meili.indexSettings(indexName)) as Record<string, unknown>
      } catch (err) {
        // Missing index in Meili counts as drift but we record the cause.
        result[indexName] = {
          drifted_keys: [...monitored],
          has_drift: true,
          desired_version: latest.version,
          error: err instanceof Error ? err.message : 'meili read failed',
        }
        continue
      }

      const driftedKeys: string[] = []
      for (const k of monitored) {
        if (!shallowEqualSetting(k, applied[k], desired[k])) {
          driftedKeys.push(k)
        }
      }

      result[indexName] = {
        drifted_keys: driftedKeys,
        has_drift: driftedKeys.length > 0,
        desired_version: latest.version,
      }
    } catch (err) {
      result[indexName] = {
        drifted_keys: [],
        has_drift: false,
        desired_version: null,
        error: err instanceof Error ? err.message : 'unknown error',
      }
    }
  }

  // Record per-index audit rows so the Audit tab shows drift history.
  for (const [name, summary] of Object.entries(result)) {
    await recordAudit(
      ctx,
      'drift.scan',
      'index',
      name,
      null,
      summary,
      { source: 'cron.reconcile' },
    )
  }

  // Summary audit row (one per cron run).
  const driftCount = Object.values(result).filter((r) => r.has_drift).length
  await recordAudit(
    ctx,
    'cron.reconcile.complete',
    'cron',
    null,
    null,
    { drift_count: driftCount, total: Object.keys(result).length },
    { source: 'cron.reconcile' },
  )

  return jsonResponse(
    {
      success: true,
      data: { drift_count: driftCount, results: result },
    },
    200,
    ctx.req,
  )
}

/**
 * Setting-aware shallow equality. rankingRules is order-sensitive; arrays of
 * attributes are treated as sets; objects (synonyms, typoTolerance) compare
 * via JSON serialisation. Mirrors src/lib/settingsDiff.ts but Deno-side and
 * returns boolean only (no per-element diff).
 */
function shallowEqualSetting(key: string, a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  if (key === 'rankingRules') {
    if (!Array.isArray(a) || !Array.isArray(b)) return false
    if (a.length !== b.length) return false
    return a.every((x, i) => x === b[i])
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    const setA = new Set(a.map((x) => JSON.stringify(x)))
    return b.every((x) => setA.has(JSON.stringify(x)))
  }
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
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
      applied = await applySuggestion(ctx, {
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

/**
 * Apply a suggestion's proposed_value to the live system. Handles the common
 * cases (tag assignment, synonym creation); others raise so the caller marks
 * status=approved with the error in review_notes for manual follow-up.
 */
async function applySuggestion(
  ctx: RouteContext,
  s: {
    suggestion_type: string
    entity_type: string | null
    entity_id: string | null
    locale: string | null
    proposed_value: Record<string, unknown> | unknown
  },
): Promise<boolean> {
  const v = s.proposed_value as Record<string, unknown>
  switch (s.suggestion_type) {
    case 'tag': {
      if (!s.entity_type || !s.entity_id || !v?.tag_id) {
        throw new Error('tag suggestion needs entity_type, entity_id, proposed_value.tag_id')
      }
      const { error } = await ctx.service
        .from('unified_tag_assignments')
        .upsert(
          { entity_type: s.entity_type, entity_id: s.entity_id, tag_id: v.tag_id },
          { onConflict: 'entity_type,entity_id,tag_id' },
        )
      if (error) throw new Error(error.message)
      return true
    }
    case 'synonym': {
      const terms = v?.terms as string[] | undefined
      const replacements = v?.replacements as string[] | undefined
      if (!terms || !replacements) {
        throw new Error('synonym suggestion needs terms[] and replacements[]')
      }
      const { error } = await ctx.service.from('search_synonyms').insert({
        terms,
        replacements,
        is_one_way: Boolean(v?.is_one_way),
        locale: s.locale ?? '*',
        indexes: (v?.indexes as string[]) ?? [],
        status: 'active',
        source: 'ai-suggested',
      })
      if (error) throw new Error(error.message)
      return true
    }
    case 'cluster_membership': {
      if (!v?.cluster_id || !v?.tag_id) {
        throw new Error('cluster_membership needs proposed_value.cluster_id and tag_id')
      }
      const { error } = await ctx.service
        .from('topic_cluster_tags')
        .upsert(
          { cluster_id: v.cluster_id, tag_id: v.tag_id },
          { onConflict: 'cluster_id,tag_id' },
        )
      if (error) throw new Error(error.message)
      return true
    }
    default:
      // Other types (alt_text, description, title, image_replacement,
      // translation, other) require entity-specific writes that are out of
      // scope for the auto-apply MVP. Caller marks status=approved with
      // review_notes='manual apply required'.
      return false
  }
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
// (DB function from 20260429250000), then layers on a few runtime probes the
// SQL function can't see (Meili reachability, env vars on the function).
//
// Returns:
//   {
//     summary: { ok, warn, fail },
//     checks:  [{ category, name, status, detail }, ...],
//     runtime: { meili_configured, function_env: { ... } }
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
    meili_configured: meiliConfigured(),
    function_env: {
      SEARCH_INTELLIGENCE_WEBHOOK_SECRET: Boolean(
        Deno.env.get('SEARCH_INTELLIGENCE_WEBHOOK_SECRET'),
      ),
      WEBHOOK_SECRET: Boolean(Deno.env.get('WEBHOOK_SECRET')),
      MEILISEARCH_URL: Boolean(Deno.env.get('MEILISEARCH_URL')),
      MEILISEARCH_ADMIN_KEY: Boolean(Deno.env.get('MEILISEARCH_ADMIN_KEY')),
      SUPABASE_URL: Boolean(Deno.env.get('SUPABASE_URL')),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),
    },
  }

  // Inject runtime checks as virtual rows so the UI can render uniformly.
  if (!runtime.meili_configured) {
    checks.push({
      category: 'env',
      name: 'meili reachable from edge function',
      status: 'fail',
      detail: 'MEILISEARCH_URL or MEILISEARCH_ADMIN_KEY missing',
    })
  } else {
    checks.push({
      category: 'env',
      name: 'meili reachable from edge function',
      status: 'ok',
      detail: 'configured',
    })
  }

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
