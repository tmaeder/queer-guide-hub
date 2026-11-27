import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { adapterName, adapterResult, batchSize, requiredSetting, result, safeError, secretValues } from './contracts.ts'
import type { SourceJob, SourceResult } from './contracts.ts'
import { delegateToSourcePipeline } from './delegate.ts'

type Settings = { url: string; serviceKey: string; internalSecret?: string; getEnv: (name: string) => string | undefined }

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw Error('Empty adapter response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 1_000_000) throw Error('Adapter response exceeded the result limit')
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try { return JSON.parse(new TextDecoder().decode(bytes)) }
  catch { throw Error('Adapter returned a non-JSON response') }
}

/** Each invocation handles exactly one registry identity. Configuration stays server-side. */
export async function dispatchSource(
  client: SupabaseClient,
  job: SourceJob,
  context: Record<string, unknown>,
  settings: Settings,
  fetcher: typeof fetch = fetch,
): Promise<SourceResult> {
  const { data: source, error } = await client.from(job.registry).select('*').eq('id', job.source_id).maybeSingle()
  if (error) throw Error('Could not load the registered source')
  if (!source) return result('skipped', 'Source registration was removed')
  const isFeed = job.registry === 'news_sources'
  if ((isFeed ? source.is_active : source.is_enabled) !== true)
    return result('skipped', 'Source is disabled')
  if (isFeed && source.auto_paused === true) return result('skipped', 'Source is paused')
  if (isFeed && source.backoff_until && Date.parse(source.backoff_until) > Date.now())
    return result('skipped', 'Source backoff is active')

  const rawConfig = source.config
  const config: Record<string, unknown> = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig) ? rawConfig : {}
  const secrets = [settings.serviceKey, settings.internalSecret ?? '', ...secretValues(config)]
  let endpoint: string
  const payload: Record<string, unknown> = {
    ...config,
    batch_size: batchSize(context.batch_size),
    dry_run: context.dry_run === true,
    pipeline_run_id: job.run_id,
    node_id: job.id,
  }
  if (isFeed) {
    endpoint = 'source-rss-news'
    Object.assign(payload, { source_ids: [job.source_id], max_feeds_per_run: 1, maxArticles: 50, sinceHours: 168 })
  } else if (job.registry === 'scrape_sources') {
    endpoint = 'scrape-web-sources'
    payload.source_id = job.source_id
  } else {
    const adapter = adapterName(source)
    if (!adapter || ['get-wikipedia-info', 'get-pexels-images'].includes(adapter)) {
      return { ...result('blocked', 'Configure a scheduled import adapter; this registration has no supported bulk adapter'), required_settings: ['ingestion_sources.edge_function'] }
    }
    endpoint = adapter
    if (endpoint === 'source-rss-news') return result('skipped', 'Feed registrations are synced individually')
    if (endpoint === 'scrape-web-sources') {
      const { data: scraper, error: lookupError } = await client.from('scrape_sources')
        .select('id,is_enabled').eq('slug', source.slug).maybeSingle()
      if (lookupError) throw Error('Could not resolve the scraper registration')
      if (!scraper) return result('blocked', 'Register this source in Scrapers before scheduling it')
      // The planner normally records this as an alias. Never use an import UUID
      // as a scraper UUID, or fall back to an unscoped scheduled scrape.
      return result('skipped', 'Canonical scraper registration is covered by this run')
    }
    const key = requiredSetting(source.requires_api_key)
    if (key && !['source-foursquare-free', 'source-awin', 'source-weekly-enrichment'].includes(endpoint)) {
      const secret = settings.getEnv(key)
      if (!secret && !job.child_run_id) return { ...result('blocked', `Missing required setting: ${key}`), required_settings: [key] }
      if (secret) secrets.push(secret)
    }
    const dailyLimit = Number(source.rate_limit_per_day)
    const reset = Date.parse(source.last_rate_reset_at ?? '')
    if (dailyLimit > 0 && Number(source.requests_today) >= dailyLimit &&
      Number.isFinite(reset) && new Date(reset).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10))
      return result('skipped', 'Source daily rate limit is reached')
    const delegated = await delegateToSourcePipeline(client, job, source, endpoint, context, settings, secrets, fetcher)
    if (delegated) return delegated
    payload.source_id = job.source_id
    if (endpoint === 'source-osm-venue' || endpoint === 'source-rest-countries') payload.batch_size = 500
  }

  try {
    const response = await fetcher(`${settings.url}/functions/v1/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.serviceKey}`,
        apikey: settings.serviceKey,
        ...(settings.internalSecret ? { 'X-Internal-Secret': settings.internalSecret } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(115_000),
    })
    const outcome = adapterResult(response.status, await boundedJson(response), secrets)
    if (context.dry_run === true) outcome.staged = 0
    // The feed adapter records individual feed failures but can return an empty
    // aggregate HTTP 200. Resolve the selected identity's actual result too.
    if (isFeed && outcome.outcome === 'succeeded') {
      const { data: state, error: stateError } = await client.from('news_sources')
        .select('last_error').eq('id', job.source_id).single()
      if (stateError) throw Error('Could not verify the selected feed outcome')
      if (state?.last_error) return {
        ...outcome, outcome: 'failed', reason: safeError(state.last_error, secrets),
        retryable: /429|\b5\d\d\b|timeout|timed out|abort|temporar|network|fetch failed/i.test(state.last_error),
      }
    }
    if (outcome.outcome === 'failed' && /missing|required|not configured|unconfigured/i.test(outcome.reason ?? '')) {
      outcome.outcome = 'blocked'
      outcome.retryable = false
    }
    return outcome
  } catch (error) {
    return { ...result('failed', safeError((error as Error).message, secrets)), retryable: true }
  }
}
