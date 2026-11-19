import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { result, safeError, WEEKLY_PIPELINE } from './contracts.ts'
import type { SourceJob, SourceResult } from './contracts.ts'

interface Pipeline { id: string; name: string; is_enabled: boolean; nodes: Array<{ type?: string }> }
interface Transport { url: string; serviceKey: string; internalSecret?: string }

function isPreview(context: unknown): boolean {
  if (!context || typeof context !== 'object') return false
  const value = context as Record<string, unknown>
  return value.dry_run === true || value.scope === 'canary' || value.source_scope === 'canary' ||
    value.lavenderatlas_cities !== undefined
}

/** Source-specific pipelines own their own leases, cursors and review gates. */
export async function delegateToSourcePipeline(
  client: SupabaseClient, job: SourceJob, source: Record<string, unknown>, endpoint: string,
  context: Record<string, unknown>, transport: Transport, secrets: string[], fetcher: typeof fetch,
): Promise<SourceResult | null> {
  if (job.child_run_id) {
    const { data: child, error } = await client.from('pipeline_runs')
      .select('id,pipeline_name,status,error_message,items_failed,context').eq('id', job.child_run_id).maybeSingle()
    if (error) throw Error('Could not inspect the source pipeline')
    if (!child || child.pipeline_name !== job.child_pipeline || child.id === job.run_id)
      return result('failed', 'The source pipeline run is unavailable or has changed identity')
    if (child.status === 'paused' || child.status === 'cancelled')
      return { ...result('skipped', `Source pipeline is ${child.status}`), child_run_id: child.id, child_pipeline: child.pipeline_name }
    if (isPreview(child.context)) return result('failed', 'A preview or limited source run cannot verify a full import')
    const waiting = { ...result('succeeded'), waiting: true, child_run_id: child.id, child_pipeline: child.pipeline_name }
    if (child.status === 'queued' || child.status === 'running') return waiting
    if (child.pipeline_name === 'gayout-weekly-sync' && String(child.error_message).includes('E_GAYOUT_PROVIDER_QUOTA'))
      return { ...result('blocked', 'The configured Firecrawl account has no available credits. Refill that account or replace FIRECRAWL_API_KEY with a funded account key.'),
        required_settings: ['FIRECRAWL_API_KEY'], child_run_id: child.id, child_pipeline: child.pipeline_name }
    if (child.pipeline_name === 'gayout-weekly-sync' && /E_GAYOUT_EXTRACT_(?:AUTH|CONFIG)/.test(String(child.error_message)))
      return { ...result('blocked', safeError(child.error_message, secrets)), required_settings: ['EXTRACT_WORKER_URL', 'EXTRACT_WORKER_SECRET'],
        child_run_id: child.id, child_pipeline: child.pipeline_name }
    if (child.status !== 'completed' || child.items_failed > 0 || child.error_message)
      return { ...result('failed', safeError(child.error_message ?? 'Source pipeline did not complete successfully', secrets)), child_run_id: child.id, child_pipeline: child.pipeline_name }
    const { count, error: countError } = await client.from('ingestion_staging')
      .select('id', { count: 'exact', head: true }).eq('pipeline_run_id', child.id)
    if (countError) throw Error('Could not verify source pipeline staging totals')
    return { ...result('succeeded', 'Source pipeline completed; its run contains detailed processing totals'),
      staged: count ?? 0, child_run_id: child.id, child_pipeline: child.pipeline_name }
  }

  const config = source.config && typeof source.config === 'object' ? source.config as Record<string, unknown> : {}
  const configured = config.pipeline
  if (configured != null && (typeof configured !== 'string' || !/^[a-z][a-z0-9-]{0,100}$/.test(configured)))
    return { ...result('blocked', 'The configured source pipeline name is invalid'), required_settings: ['ingestion_sources.config.pipeline'] }
  const slug = String(source.slug ?? '')
  const candidates = configured ? [configured] : [`${slug}-weekly-sync`, `${slug}-weekly`, `${slug}-catalogue-sync`]
  const { data, error } = await client.from('pipeline_definitions').select('id,name,is_enabled,nodes').in('name', candidates)
  if (error) throw Error('Could not resolve the source pipeline')
  const pipelines = data as Pipeline[] | null
  const pipeline = candidates.map(name => pipelines?.find(item => item.name === name)).find(Boolean)
  if (!pipeline) return configured
    ? { ...result('blocked', 'The configured source pipeline is not registered'), required_settings: ['ingestion_sources.config.pipeline'] }
    : null
  if (pipeline.name === WEEKLY_PIPELINE) return result('blocked', 'A source pipeline cannot refer to the weekly parent')
  if (!pipeline.is_enabled) return result('skipped', 'Source pipeline is disabled')
  let matches = pipeline.nodes.some(node => node.type === endpoint)
  if (!matches) {
    const { data: types, error: typeError } = await client.from('pipeline_node_types').select('slug')
      .eq('edge_function', endpoint).eq('category', 'source')
    if (typeError) throw Error('Could not verify source pipeline routing')
    matches = pipeline.nodes.some(node => types?.some(type => type.slug === node.type))
  }
  if (!matches) return { ...result('blocked', 'The configured pipeline does not contain this source adapter'), required_settings: ['ingestion_sources.config.pipeline'] }
  if (context.dry_run === true) return result('skipped', `Dry run: source pipeline ${pipeline.name} would be started`)

  const { data: active, error: activeError } = await client.from('pipeline_runs').select('id,status,context')
    .eq('pipeline_id', pipeline.id).in('status', ['queued', 'running', 'paused']).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (activeError) throw Error('Could not check the active source pipeline')
  if (active?.status === 'paused') return result('skipped', 'Source pipeline is paused')
  if (active && isPreview(active.context)) return {
    ...result('failed', 'A source preview is active; wait for it to finish before a real import'), retryable: true,
  }
  if (active) return { ...result('succeeded'), waiting: true, child_run_id: active.id, child_pipeline: pipeline.name }
  const { data: recent, error: recentError } = await client.from('pipeline_runs').select('id,completed_at,context')
    .eq('pipeline_id', pipeline.id).eq('status', 'completed').eq('items_failed', 0).is('error_message', null)
    .gte('completed_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
    .order('completed_at', { ascending: false }).limit(1).maybeSingle()
  if (recentError) throw Error('Could not verify the source pipeline refresh interval')
  if (recent && !isPreview(recent.context)) return { ...result('skipped', 'Source pipeline already completed within the weekly interval'),
    child_run_id: recent.id, child_pipeline: pipeline.name }
  if (pipeline.name === 'prideplaces-weekly-sync') {
    const { data: pump, error: pumpError } = await client.from('admin_automations')
      .select('enabled,lifecycle_state').eq('slug', 'prideplaces_scan_continue').maybeSingle()
    if (pumpError) throw Error('Could not verify source continuation scheduling')
    if (!pump?.enabled || pump.lifecycle_state !== 'active') return {
      ...result('blocked', 'Enable the source continuation automation before starting its full scan'),
      required_settings: ['admin_automations.prideplaces_scan_continue.enabled'],
    }
  }
  const childContext = { dry_run: false, triggered_by: 'weekly-parent', weekly_parent_run_id: job.run_id, weekly_parent_job_id: job.id }
  // These importers own transactional starters and their own durable recovery.
  const starter = pipeline.name === 'outxout-catalogue-sync'
    ? { name: 'outxout_open_run', args: { p_trigger: 'weekly-parent', p_run_id: null, p_scope: 'catalogue' } }
    : pipeline.name === 'lavenderatlas-weekly-sync'
    ? { name: 'start_lavenderatlas_pipeline', args: { p_pipeline: pipeline.id, p_context: childContext } }
    : pipeline.name === 'prideplaces-weekly-sync'
    ? { name: 'prideplaces_start_scan', args: { p_force: false } }
    : pipeline.name === 'gayout-weekly-sync'
    ? { name: 'start_gayout_weekly_sync', args: { p_context: childContext } } : null
  if (starter) {
    const { data: started, error: startError } = await client.rpc(starter.name, starter.args)
    if (startError) throw Error('Could not start the source pipeline')
    const childId = typeof started === 'string' ? started : started?.pipeline_run_id
    if (!/^[0-9a-f-]{36}$/i.test(childId ?? '') || childId === job.run_id)
      return result('failed', 'Source starter returned an invalid run identity')
    return { ...result('succeeded'), waiting: true, child_run_id: childId, child_pipeline: pipeline.name }
  }
  const response = await fetcher(`${transport.url}/functions/v1/pipeline-executor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${transport.serviceKey}`, apikey: transport.serviceKey,
      ...(transport.internalSecret ? { 'X-Internal-Secret': transport.internalSecret } : {}) },
    body: JSON.stringify({ action: 'start', pipeline_id: pipeline.id, pipeline_name: pipeline.name,
      context: childContext }),
    signal: AbortSignal.timeout(20_000),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.success === false || !/^[0-9a-f-]{36}$/i.test(body?.pipeline_run_id ?? ''))
    return { ...result('failed', safeError(body?.error ?? `Could not start source pipeline (HTTP ${response.status})`, secrets)), retryable: response.status >= 500 }
  if (body.pipeline_run_id === job.run_id) return result('blocked', 'Source pipeline returned the parent run')
  return { ...result('succeeded'), waiting: true, child_run_id: body.pipeline_run_id, child_pipeline: pipeline.name }
}
