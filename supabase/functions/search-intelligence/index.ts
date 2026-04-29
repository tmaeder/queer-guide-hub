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
    .select('id, version, channel, comment, created_at, created_by')
    .eq('index_name', name)
    .order('version', { ascending: false })
    .limit(50)
  if (error) return errorResponse(error.message, 500, ctx.req)
  return jsonResponse({ success: true, data }, 200, ctx.req)
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
