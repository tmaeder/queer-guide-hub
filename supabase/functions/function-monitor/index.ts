import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { jsonResponse, errorResponse, corsResponse, requireAdmin, getServiceClient } from '../_shared/supabase-client.ts'

// Complete registry of deployed edge functions and their metadata.
// category: 'workflow' = registered in workflow_definitions,
//           'api' = called by frontend via functions.invoke(),
//           'webhook' = called via URL/external trigger,
//           'internal' = called only by other functions.
const FUNCTION_REGISTRY: FunctionMeta[] = [
  // ── Workflow-registered (cron + manual) ──
  { name: 'fetch-news', category: 'workflow', description: 'Fetch news from RSS/API sources', envVars: ['NEWS_API_KEY'] },
  { name: 'import-foursquare-venues', category: 'workflow', description: 'Import venues from Foursquare Places API', envVars: ['FOURSQUARE_API_KEY'] },
  { name: 'import-ilga-data', category: 'workflow', description: 'Import LGBTQ rights data for countries', envVars: [] },
  { name: 'geo-link-content', category: 'workflow', description: 'Geo-link content to cities/countries', envVars: [] },
  { name: 'validate-links', category: 'workflow', description: 'HTTP validation of content URLs', envVars: [] },
  { name: 'populate-embeddings', category: 'workflow', description: 'Generate vector embeddings via CF Workers AI', envVars: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'] },
  { name: 'auto-tag-content', category: 'workflow', description: 'AI-powered content auto-tagging', envVars: ['OPENAI_API_KEY'] },
  { name: 'import-airports-data', category: 'workflow', description: 'Seed airports from Travelpayouts', envVars: [] },
  { name: 'scrape-gaycities-events', category: 'workflow', description: 'Scrape events from gaytravel4u.com', envVars: [] },
  { name: 'bulk-scrape-events', category: 'workflow', description: 'Multi-source event scraping', envVars: [] },
  { name: 'background-import-manager', category: 'workflow', description: 'Central import orchestrator', envVars: [] },
  { name: 'optimize-images-batch', category: 'workflow', description: 'Image compression and resize', envVars: [] },
  { name: 'send-bulk-email', category: 'workflow', description: 'Templated bulk email via Resend', envVars: ['RESEND_API_KEY'] },
  { name: 'send-group-notifications', category: 'workflow', description: 'Group activity notifications', envVars: ['RESEND_API_KEY'] },
  { name: 'generate-sitemap', category: 'workflow', description: 'Generate sitemap.xml', envVars: [] },
  { name: 'ingestion-pipeline', category: 'workflow', description: 'Multi-stage import pipeline', envVars: [] },
  { name: 'workflow-dispatcher', category: 'workflow', description: 'pgmq-based job dispatcher', envVars: [] },

  // ── API functions (invoked from frontend) ──
  { name: 'bulk-create-ai-tags', category: 'api', description: 'Batch AI tag creation', envVars: ['OPENAI_API_KEY'] },
  { name: 'bulk-create-personalities', category: 'api', description: 'Batch personality creation', envVars: [] },
  { name: 'calendar-export', category: 'api', description: 'Export events as iCal', envVars: [] },
  { name: 'calendar-token', category: 'api', description: 'Generate calendar feed token', envVars: [] },
  { name: 'categorize-tags', category: 'api', description: 'AI tag categorization', envVars: ['OPENAI_API_KEY'] },
  { name: 'cloudflare-api', category: 'api', description: 'Cloudflare API proxy', envVars: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'] },
  { name: 'enrich-venue', category: 'api', description: 'Venue data enrichment', envVars: [] },
  { name: 'fetch-city-images', category: 'api', description: 'Fetch city hero images', envVars: ['PEXELS_API_KEY'] },
  { name: 'fetch-personality-data', category: 'api', description: 'Fetch personality data from Wikidata', envVars: [] },
  { name: 'fetch-wikipedia-data', category: 'api', description: 'Fetch Wikipedia extracts', envVars: [] },
  { name: 'get-api-key', category: 'api', description: 'Retrieve API key for client', envVars: [] },
  { name: 'get-current-weather', category: 'api', description: 'Current weather data', envVars: ['OPENWEATHERMAP_API_KEY'] },
  { name: 'get-pexels-images', category: 'api', description: 'Search Pexels stock photos', envVars: ['PEXELS_API_KEY'] },
  { name: 'get-refuge-restrooms', category: 'api', description: 'Query Refuge Restrooms API', envVars: [] },
  { name: 'get-turnstile-config', category: 'api', description: 'Cloudflare Turnstile config', envVars: ['TURNSTILE_SITE_KEY'] },
  { name: 'get-weather-forecast', category: 'api', description: 'Weather forecast data', envVars: ['OPENWEATHERMAP_API_KEY'] },
  { name: 'import-eventbrite-events', category: 'api', description: 'Import events from Eventbrite', envVars: ['EVENTBRITE_API_KEY'] },
  { name: 'import-ticketmaster-events', category: 'api', description: 'Import events from Ticketmaster', envVars: ['TICKETMASTER_API_KEY'] },
  { name: 'import-google-places-venues', category: 'api', description: 'Import venues from Google Places', envVars: ['GOOGLE_MAPS_API_KEY'] },
  { name: 'import-tripadvisor-venues', category: 'api', description: 'Import venues from TripAdvisor', envVars: ['TRIPADVISOR_API_KEY'] },
  { name: 'import-tomtom-venues', category: 'api', description: 'Import venues from TomTom', envVars: ['TOMTOM_API_KEY'] },
  { name: 'ingestion-review-api', category: 'api', description: 'Ingestion review management', envVars: [] },
  { name: 'link-locations', category: 'api', description: 'Link content to locations', envVars: [] },
  { name: 'manage-api-keys', category: 'api', description: 'API key management', envVars: [] },
  { name: 'mapbox-geocoding', category: 'api', description: 'Mapbox geocoding proxy', envVars: ['MAPBOX_ACCESS_TOKEN'] },
  { name: 'populate-optimization-status', category: 'api', description: 'Track media optimization status', envVars: [] },
  { name: 'process-audio', category: 'api', description: 'Audio file processing', envVars: [] },
  { name: 'process-video', category: 'api', description: 'Video file processing', envVars: [] },
  { name: 'reimport-personality-images', category: 'api', description: 'Re-import personality images', envVars: [] },
  { name: 'resolve-or-create-city', category: 'api', description: 'Resolve or create city record', envVars: [] },
  { name: 'resolve-origin-airport', category: 'api', description: 'Resolve nearest airport', envVars: [] },
  { name: 'scan-links', category: 'api', description: 'Scan content for URLs', envVars: [] },
  { name: 'scan-project-images', category: 'api', description: 'Scan storage for images', envVars: [] },
  { name: 'scrape-spartacus', category: 'api', description: 'Scrape Spartacus travel data', envVars: [] },
  { name: 'secure-passkey-operations', category: 'api', description: 'WebAuthn passkey operations', envVars: [] },
  { name: 'send-templated-email', category: 'api', description: 'Send single templated email', envVars: ['RESEND_API_KEY'] },
  { name: 'store-tag-images', category: 'api', description: 'Store tag images to storage', envVars: [] },
  { name: 'travel-deals', category: 'api', description: 'Travel deal aggregation', envVars: [] },
  { name: 'umami-analytics', category: 'api', description: 'Privacy-friendly analytics tracking', envVars: [] },
  { name: 'umami-dashboard', category: 'api', description: 'Analytics dashboard data', envVars: [] },
  { name: 'update-musician-concerts', category: 'api', description: 'Update musician concert data', envVars: [] },
  { name: 'verify-turnstile', category: 'api', description: 'Verify Turnstile CAPTCHA', envVars: ['TURNSTILE_SECRET_KEY'] },

  // ── Webhook / URL-triggered ──
  { name: 'calendar-feed', category: 'webhook', description: 'iCal feed served via URL', envVars: [] },
  { name: 'redirect-handler', category: 'webhook', description: 'URL redirect handler', envVars: [] },
  { name: 'chatgpt-oauth', category: 'webhook', description: 'ChatGPT OAuth flow', envVars: ['CHATGPT_CLIENT_ID', 'CHATGPT_CLIENT_SECRET'] },

  // ── CSV/file import functions ──
  { name: 'import-adult-models-csv', category: 'api', description: 'Import adult models from CSV', envVars: [] },
  { name: 'import-awin-products', category: 'api', description: 'Import affiliate products from Awin', envVars: ['AWIN_API_KEY'] },
  { name: 'import-city-data', category: 'api', description: 'Import city reference data', envVars: [] },
  { name: 'import-country-data', category: 'api', description: 'Import country reference data', envVars: [] },
  { name: 'import-events-csv', category: 'api', description: 'Import events from CSV', envVars: [] },
  { name: 'import-personalities-csv', category: 'api', description: 'Import personalities from CSV', envVars: [] },
  { name: 'import-refuge-restrooms', category: 'api', description: 'Import Refuge Restrooms data', envVars: [] },
  { name: 'import-tags-csv', category: 'api', description: 'Import tags from CSV', envVars: [] },
  { name: 'import-venues-csv', category: 'api', description: 'Import venues from CSV', envVars: [] },

  // ── This function ──
  { name: 'function-monitor', category: 'api', description: 'Function monitoring and management', envVars: [] },
]

interface FunctionMeta {
  name: string
  category: 'workflow' | 'api' | 'webhook' | 'internal'
  description: string
  envVars: string[]
}

interface HealthIssue {
  function_name: string
  severity: 'critical' | 'warning' | 'info'
  message: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()

  try {
    const authResult = await requireAdmin(req, supabase)
    if (authResult instanceof Response) return authResult

    let action = 'status'
    let payload: Record<string, unknown> = {}

    if (req.method === 'GET') {
      const url = new URL(req.url)
      action = url.searchParams.get('action') || 'status'
    } else {
      try {
        payload = await req.json()
        action = (payload.action as string) || 'status'
      } catch {
        // empty body = default action
      }
    }

    switch (action) {
      case 'status':
        return await handleStatus(supabase, req)
      case 'health':
        return await handleHealth(supabase, req)
      case 'registry':
        return await handleRegistry(supabase, req)
      case 'stats':
        return await handleStats(supabase, payload, req)
      case 'errors':
        return await handleErrors(supabase, payload, req)
      case 'invoke':
        return await handleInvoke(supabase, payload, req)
      default:
        return errorResponse(`Unknown action: ${action}`, 400, req)
    }
  } catch (error) {
    console.error('function-monitor error:', error)
    return errorResponse('Internal server error', 500, req)
  }
})

// ─── STATUS: System overview ────────────────────────────────────────────────

async function handleStatus(
  supabase: SupabaseClient,
  req: Request
): Promise<Response> {
  const startTime = Date.now()

  const [
    dbHealth,
    workflowCounts,
    queueMetrics,
    recentErrors,
    envHealth,
  ] = await Promise.all([
    checkDbConnectivity(supabase),
    getWorkflowCounts(supabase),
    getQueueMetrics(supabase),
    getRecentErrorCount(supabase),
    checkEnvVars(),
  ])

  const totalFunctions = FUNCTION_REGISTRY.length
  const workflowFunctions = FUNCTION_REGISTRY.filter(f => f.category === 'workflow').length
  const apiFunctions = FUNCTION_REGISTRY.filter(f => f.category === 'api').length
  const webhookFunctions = FUNCTION_REGISTRY.filter(f => f.category === 'webhook').length

  const overallStatus = dbHealth.connected
    ? (recentErrors.error_rate_pct > 25 || envHealth.missing_critical > 0 ? 'degraded' : 'healthy')
    : 'unhealthy'

  return jsonResponse({
    success: true,
    status: overallStatus,
    functions: {
      total: totalFunctions,
      workflow: workflowFunctions,
      api: apiFunctions,
      webhook: webhookFunctions,
    },
    database: dbHealth,
    queues: queueMetrics,
    workflows_24h: workflowCounts,
    errors_24h: recentErrors,
    env_vars: envHealth,
    check_duration_ms: Date.now() - startTime,
    checked_at: new Date().toISOString(),
  }, 200, req)
}

// ─── HEALTH: Detailed health checks ─────────────────────────────────────────

async function handleHealth(
  supabase: SupabaseClient,
  req: Request
): Promise<Response> {
  const issues: HealthIssue[] = []

  // 1. Database connectivity
  const dbHealth = await checkDbConnectivity(supabase)
  if (!dbHealth.connected) {
    issues.push({ function_name: '*', severity: 'critical', message: 'Database is unreachable' })
  } else if (dbHealth.latency_ms > 500) {
    issues.push({ function_name: '*', severity: 'warning', message: `High DB latency: ${dbHealth.latency_ms}ms` })
  }

  // 2. Missing environment variables
  const envResults = checkEnvVarsDetailed()
  for (const { function_name, missing } of envResults) {
    if (missing.length > 0) {
      issues.push({
        function_name,
        severity: 'warning',
        message: `Missing env vars: ${missing.join(', ')}`,
      })
    }
  }

  // 3. Workflow definitions health
  const { data: definitions } = await supabase
    .from('workflow_definitions')
    .select('name, schedule, is_enabled')
    .eq('is_enabled', true)

  // 4. Scheduled workflows that haven't run in 25h
  for (const def of definitions || []) {
    if (!def.schedule) continue
    const { count } = await supabase
      .from('workflow_runs')
      .select('*', { count: 'exact', head: true })
      .eq('workflow_name', def.name)
      .in('status', ['completed', 'running'])
      .gte('created_at', new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString())

    if (!count || count === 0) {
      issues.push({
        function_name: def.name,
        severity: 'warning',
        message: `Scheduled workflow (${def.schedule}) has not run successfully in 25h`,
      })
    }
  }

  // 5. Dead letter queue depth
  const { data: dlqMetrics } = await supabase.rpc('pgmq_metrics', { p_queue: 'dead_letter' })
  const dlqDepth = dlqMetrics?.[0]?.queue_length || 0
  if (dlqDepth > 0) {
    issues.push({
      function_name: 'workflow-dispatcher',
      severity: dlqDepth > 10 ? 'critical' : 'warning',
      message: `Dead letter queue has ${dlqDepth} message${dlqDepth !== 1 ? 's' : ''}`,
    })
  }

  // 6. High failure rate per workflow (last 24h)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recentRuns } = await supabase
    .from('workflow_runs')
    .select('workflow_name, status')
    .gte('created_at', since)

  const perWorkflow: Record<string, { total: number; failed: number }> = {}
  for (const run of recentRuns || []) {
    if (!perWorkflow[run.workflow_name]) {
      perWorkflow[run.workflow_name] = { total: 0, failed: 0 }
    }
    perWorkflow[run.workflow_name].total++
    if (run.status === 'failed' || run.status === 'dead_letter') {
      perWorkflow[run.workflow_name].failed++
    }
  }
  for (const [name, counts] of Object.entries(perWorkflow)) {
    if (counts.total >= 3 && counts.failed / counts.total > 0.5) {
      issues.push({
        function_name: name,
        severity: 'critical',
        message: `High failure rate: ${counts.failed}/${counts.total} runs failed (${Math.round(counts.failed / counts.total * 100)}%)`,
      })
    }
  }

  // 7. Functions not in workflow_definitions
  const registeredWorkflowNames = new Set((definitions || []).map(d => d.name))
  const expectedWorkflows = FUNCTION_REGISTRY.filter(f => f.category === 'workflow')
  for (const fn of expectedWorkflows) {
    if (!registeredWorkflowNames.has(fn.name) && fn.name !== 'workflow-dispatcher') {
      issues.push({
        function_name: fn.name,
        severity: 'info',
        message: 'Workflow function not found in workflow_definitions table',
      })
    }
  }

  const critical = issues.filter(i => i.severity === 'critical').length
  const warnings = issues.filter(i => i.severity === 'warning').length

  return jsonResponse({
    success: true,
    healthy: critical === 0,
    summary: {
      critical,
      warnings,
      info: issues.filter(i => i.severity === 'info').length,
    },
    issues,
    checked_at: new Date().toISOString(),
  }, 200, req)
}

// ─── REGISTRY: Function catalog with workflow status ────────────────────────

async function handleRegistry(
  supabase: SupabaseClient,
  req: Request
): Promise<Response> {
  // Get workflow definitions to enrich registry entries
  const { data: definitions } = await supabase
    .from('workflow_definitions')
    .select('name, display_name, schedule, is_enabled, queue_name, max_retries, max_concurrency, timeout_seconds, priority, tags')

  const defMap = new Map(
    (definitions || []).map(d => [d.name, d])
  )

  const registry = FUNCTION_REGISTRY.map(fn => {
    const def = defMap.get(fn.name)
    const envStatus = fn.envVars.map(v => ({
      name: v,
      set: !!Deno.env.get(v),
    }))

    return {
      name: fn.name,
      category: fn.category,
      description: fn.description,
      env_vars: envStatus,
      env_ready: envStatus.every(e => e.set),
      workflow: def ? {
        display_name: def.display_name,
        schedule: def.schedule,
        is_enabled: def.is_enabled,
        queue_name: def.queue_name,
        max_retries: def.max_retries,
        max_concurrency: def.max_concurrency,
        timeout_seconds: def.timeout_seconds,
        priority: def.priority,
        tags: def.tags,
      } : null,
    }
  })

  return jsonResponse({
    success: true,
    total: registry.length,
    by_category: {
      workflow: registry.filter(r => r.category === 'workflow').length,
      api: registry.filter(r => r.category === 'api').length,
      webhook: registry.filter(r => r.category === 'webhook').length,
    },
    functions: registry,
    generated_at: new Date().toISOString(),
  }, 200, req)
}

// ─── STATS: Per-function execution statistics ───────────────────────────────

async function handleStats(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  req: Request
): Promise<Response> {
  const hours = typeof payload.hours === 'number' ? Math.min(payload.hours, 168) : 24
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  const { data: runs, error } = await supabase
    .from('workflow_runs')
    .select('workflow_name, status, duration_ms, items_total, items_processed, items_succeeded, items_failed, created_at')
    .gte('created_at', since)

  if (error) return errorResponse(`Failed to fetch runs: ${error.message}`, 500, req)

  const stats: Record<string, {
    total: number
    completed: number
    failed: number
    dead_letter: number
    cancelled: number
    running: number
    avg_duration_ms: number | null
    min_duration_ms: number | null
    max_duration_ms: number | null
    total_items_processed: number
    total_items_failed: number
    last_run: string | null
  }> = {}

  for (const run of runs || []) {
    if (!stats[run.workflow_name]) {
      stats[run.workflow_name] = {
        total: 0, completed: 0, failed: 0, dead_letter: 0,
        cancelled: 0, running: 0,
        avg_duration_ms: null, min_duration_ms: null, max_duration_ms: null,
        total_items_processed: 0, total_items_failed: 0,
        last_run: null,
      }
    }
    const s = stats[run.workflow_name]
    s.total++

    switch (run.status) {
      case 'completed': s.completed++; break
      case 'failed': s.failed++; break
      case 'dead_letter': s.dead_letter++; break
      case 'cancelled': s.cancelled++; break
      case 'running': s.running++; break
    }

    if (run.duration_ms != null) {
      const durations = [s.min_duration_ms, s.max_duration_ms, run.duration_ms].filter((d): d is number => d != null)
      s.min_duration_ms = Math.min(...durations)
      s.max_duration_ms = Math.max(...durations)
      // Running average
      const completedCount = s.completed + s.failed + s.dead_letter
      s.avg_duration_ms = s.avg_duration_ms != null
        ? Math.round((s.avg_duration_ms * (completedCount - 1) + run.duration_ms) / completedCount)
        : run.duration_ms
    }

    s.total_items_processed += run.items_processed || 0
    s.total_items_failed += run.items_failed || 0

    if (!s.last_run || run.created_at > s.last_run) {
      s.last_run = run.created_at
    }
  }

  // Sort by total runs descending
  const sorted = Object.entries(stats)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([name, s]) => ({ workflow_name: name, ...s, success_rate_pct: s.total > 0 ? Math.round(s.completed / s.total * 100) : null }))

  return jsonResponse({
    success: true,
    period_hours: hours,
    since,
    total_runs: (runs || []).length,
    workflows: sorted,
    generated_at: new Date().toISOString(),
  }, 200, req)
}

// ─── ERRORS: Recent errors across all functions ─────────────────────────────

async function handleErrors(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  req: Request
): Promise<Response> {
  const limit = typeof payload.limit === 'number' ? Math.min(payload.limit, 100) : 50
  const hours = typeof payload.hours === 'number' ? Math.min(payload.hours, 168) : 24
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  const { data: errors, error } = await supabase
    .from('workflow_runs')
    .select('id, workflow_name, status, error_message, error_details, attempt, max_attempts, created_at, completed_at, duration_ms')
    .in('status', ['failed', 'dead_letter'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return errorResponse(`Failed to fetch errors: ${error.message}`, 500, req)

  // Group by error message for pattern detection
  const patterns: Record<string, { count: number; workflows: Set<string>; first_seen: string; last_seen: string }> = {}
  for (const e of errors || []) {
    const key = e.error_message || 'Unknown error'
    if (!patterns[key]) {
      patterns[key] = { count: 0, workflows: new Set(), first_seen: e.created_at, last_seen: e.created_at }
    }
    patterns[key].count++
    patterns[key].workflows.add(e.workflow_name)
    if (e.created_at < patterns[key].first_seen) patterns[key].first_seen = e.created_at
    if (e.created_at > patterns[key].last_seen) patterns[key].last_seen = e.created_at
  }

  const errorPatterns = Object.entries(patterns)
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([message, p]) => ({
      message,
      count: p.count,
      workflows: [...p.workflows],
      first_seen: p.first_seen,
      last_seen: p.last_seen,
    }))

  return jsonResponse({
    success: true,
    period_hours: hours,
    total_errors: (errors || []).length,
    error_patterns: errorPatterns,
    recent_errors: (errors || []).map(e => ({
      id: e.id,
      workflow_name: e.workflow_name,
      status: e.status,
      error_message: e.error_message,
      attempt: e.attempt,
      max_attempts: e.max_attempts,
      created_at: e.created_at,
      duration_ms: e.duration_ms,
    })),
    generated_at: new Date().toISOString(),
  }, 200, req)
}

// ─── INVOKE: Test-invoke a function ─────────────────────────────────────────

async function handleInvoke(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  req: Request
): Promise<Response> {
  const functionName = payload.function_name as string
  if (!functionName) return errorResponse('Missing "function_name" parameter', 400, req)

  const registered = FUNCTION_REGISTRY.find(f => f.name === functionName)
  if (!registered) return errorResponse(`Unknown function: ${functionName}`, 404, req)

  // Don't allow invoking the monitor itself to avoid recursion
  if (functionName === 'function-monitor') {
    return errorResponse('Cannot invoke function-monitor from itself', 400, req)
  }

  const functionPayload = (payload.payload as Record<string, unknown>) || {}
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const startTime = Date.now()
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30_000)

    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify(functionPayload),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const duration = Date.now() - startTime
    const body = await response.text()

    let parsed: unknown = null
    try { parsed = JSON.parse(body) } catch { parsed = body.slice(0, 2000) }

    return jsonResponse({
      success: response.ok,
      function_name: functionName,
      http_status: response.status,
      duration_ms: duration,
      response: parsed,
      invoked_at: new Date().toISOString(),
    }, 200, req)
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMsg = (error as Error).name === 'AbortError'
      ? 'Timeout after 30s'
      : (error as Error).message

    return jsonResponse({
      success: false,
      function_name: functionName,
      error: errorMsg,
      duration_ms: duration,
      invoked_at: new Date().toISOString(),
    }, 200, req)
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function checkDbConnectivity(
  supabase: SupabaseClient
): Promise<{ connected: boolean; latency_ms: number }> {
  const start = Date.now()
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1)
    return { connected: !error, latency_ms: Date.now() - start }
  } catch {
    return { connected: false, latency_ms: Date.now() - start }
  }
}

async function getWorkflowCounts(
  supabase: SupabaseClient
): Promise<Record<string, number>> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const statuses = ['completed', 'failed', 'running', 'queued', 'dead_letter', 'cancelled']
  const counts: Record<string, number> = {}

  await Promise.all(statuses.map(async (status) => {
    const { count } = await supabase
      .from('workflow_runs')
      .select('*', { count: 'exact', head: true })
      .eq('status', status)
      .gte('created_at', since)
    counts[status] = count || 0
  }))

  counts.total = Object.values(counts).reduce((a, b) => a + b, 0)
  return counts
}

async function getQueueMetrics(
  supabase: SupabaseClient
): Promise<unknown[]> {
  const { data } = await supabase.rpc('pgmq_metrics_all')
  return data || []
}

async function getRecentErrorCount(
  supabase: SupabaseClient
): Promise<{ error_count: number; total_count: number; error_rate_pct: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [{ count: errorCount }, { count: totalCount }] = await Promise.all([
    supabase
      .from('workflow_runs')
      .select('*', { count: 'exact', head: true })
      .in('status', ['failed', 'dead_letter'])
      .gte('created_at', since),
    supabase
      .from('workflow_runs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since),
  ])

  const total = totalCount || 0
  const errors = errorCount || 0
  return {
    error_count: errors,
    total_count: total,
    error_rate_pct: total > 0 ? Math.round(errors / total * 100) : 0,
  }
}

function checkEnvVars(): { total_checked: number; missing_critical: number; missing_optional: number } {
  const allEnvVars = new Set<string>()
  for (const fn of FUNCTION_REGISTRY) {
    for (const v of fn.envVars) allEnvVars.add(v)
  }

  // Critical env vars that most functions depend on
  const critical = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY']
  let missingCritical = 0
  let missingOptional = 0

  for (const v of critical) {
    if (!Deno.env.get(v)) missingCritical++
  }
  for (const v of allEnvVars) {
    if (!Deno.env.get(v)) missingOptional++
  }

  return {
    total_checked: critical.length + allEnvVars.size,
    missing_critical: missingCritical,
    missing_optional: missingOptional,
  }
}

function checkEnvVarsDetailed(): Array<{ function_name: string; missing: string[] }> {
  const results: Array<{ function_name: string; missing: string[] }> = []
  for (const fn of FUNCTION_REGISTRY) {
    if (fn.envVars.length === 0) continue
    const missing = fn.envVars.filter(v => !Deno.env.get(v))
    if (missing.length > 0) {
      results.push({ function_name: fn.name, missing })
    }
  }
  return results
}
