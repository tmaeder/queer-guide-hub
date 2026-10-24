import { filterFoursquareDiscoveries } from '../_shared/foursquare-discovery-filter.ts'
import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, AdapterConfig } from '../_shared/source-adapter.ts'
import {
  writeToStaging,
  MissingCredentialsError,
  InvalidCredentialsError,
  skippedResponse,
} from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { reserveFoursquareApiCalls, type FoursquareBudgetVerdict } from '../_shared/foursquare-budget.ts'
import {
  FOURSQUARE_API_VERSION,
  buildFoursquareSearchUrl,
  classifyFoursquareCategories,
  foursquarePlaceId,
  normalizeFoursquarePlace,
  normalizeFoursquareAggregateStats,
  orderFoursquareDeltas,
  queerDiscoveryEvidence,
  type FoursquareDeltaRecord,
  type FoursquarePlace,
} from '../_shared/foursquare.ts'

// Two deliberately separate modes:
//   api — Pro-only data, hard-capped below the free monthly allowance
//   os  — free Apache-2.0 snapshot/category/delta batches from Places Portal

const SEARCH_TERMS = ['gay bar', 'lgbtq', 'pride', 'queer', 'drag', 'leather bar']
const HOTEL_TERMS = ['gay friendly hotel', 'lgbtq hotel', 'gay bed and breakfast', 'gay guesthouse', 'gay resort']

const DEFAULT_CITIES = [
  'New York, NY', 'San Francisco, CA', 'Los Angeles, CA', 'Chicago, IL',
  'London, UK', 'Berlin, Germany', 'Amsterdam, Netherlands', 'Paris, France',
  'Barcelona, Spain', 'Sydney, Australia', 'Toronto, Canada', 'Bangkok, Thailand',
  'Tel Aviv, Israel', 'Buenos Aires, Argentina', 'Mexico City, Mexico',
  'Sao Paulo, Brazil', 'Madrid, Spain', 'Lisbon, Portugal', 'Montreal, Canada', 'Miami, FL',
]

class FoursquareBudgetError extends Error {
  constructor(readonly verdict: FoursquareBudgetVerdict) {
    super(verdict.reason ?? 'foursquare_api_budget_exhausted')
    this.name = 'FoursquareBudgetError'
  }
}

class FoursquareRateLimitError extends Error {
  constructor() {
    super('Foursquare provider quota exhausted')
    this.name = 'FoursquareRateLimitError'
  }
}

const apiAdapter: SourceAdapter = {
  name: 'foursquare',
  entityType: 'venue',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const apiKey = config.apiKey || Deno.env.get('FOURSQUARE_API_KEY')
    if (!apiKey) throw new MissingCredentialsError('FOURSQUARE_API_KEY')

    const supabase = getServiceClient()
    const cities = (config.filters?.cities as string[]) || getCityForHour()
    const limit = Math.max(1, Math.min(config.batchSize || 20, 50))
    const radius = Number(config.filters?.radius || 30_000)
    // The hotel DAG runs HOTEL_TERMS separately. `all` here would double-spend
    // enough calls to exceed the zero-cost allowance.
    const mode = (config.filters?.mode as string) || 'venues'
    const customTerms = config.filters?.terms as string[] | undefined
    const terms = customTerms?.length
      ? customTerms
      : mode === 'hotels' ? HOTEL_TERMS
      : mode === 'all' ? [...SEARCH_TERMS, ...HOTEL_TERMS]
      : SEARCH_TERMS
    const allItems: RawItem[] = []
    let attempts = 0
    let failures = 0

    outer:
    for (const city of cities) {
      for (const term of terms) {
        const budget = await reserveFoursquareApiCalls(supabase, `search:${mode}`, 1)
        if (!budget.allowed) {
          if (attempts === 0) throw new FoursquareBudgetError(budget)
          console.warn(`Foursquare free-tier budget stopped ${mode} search after ${attempts} calls`)
          break outer
        }

        try {
          attempts++
          const url = buildFoursquareSearchUrl({ query: term, near: city, radius, limit })
          const result = await withCircuitBreaker(supabase, 'foursquare', async () => {
            const response = await fetch(url, {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'X-Places-Api-Version': FOURSQUARE_API_VERSION,
                Accept: 'application/json',
              },
            })
            if (response.status === 401 || response.status === 403) {
              return { authFailed: response.status }
            }
            if (response.status === 429) return { rateLimited: true }
            if (!response.ok) throw new Error(`Foursquare API ${response.status}`)
            const body = await response.json()
            return Array.isArray(body.results) ? body.results : []
          })

          if (!Array.isArray(result) && result?.authFailed) {
            throw new InvalidCredentialsError('FOURSQUARE_API_KEY', result.authFailed)
          }
          if (!Array.isArray(result) && result?.rateLimited) throw new FoursquareRateLimitError()

          for (const value of result as FoursquarePlace[]) {
            const id = foursquarePlaceId(value)
            if (!id) continue
            allItems.push({
              sourceId: id,
              data: {
                ...value,
                _search_city: city,
                _search_term: term,
                _is_accommodation: HOTEL_TERMS.includes(term),
              },
            })
          }
          await new Promise((resolve) => setTimeout(resolve, 200))
        } catch (error) {
          if (error instanceof InvalidCredentialsError || error instanceof FoursquareRateLimitError) throw error
          failures++
          console.error(`Foursquare error for "${term}" in ${city}:`, (error as Error).message)
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    if (attempts > 0 && failures === attempts && allItems.length === 0) {
      throw new Error(`Foursquare: all ${attempts} requests failed, 0 items fetched`)
    }

    const seen = new Set<string>()
    return allItems.filter((item) => {
      if (seen.has(item.sourceId)) return false
      seen.add(item.sourceId)
      return true
    })
  },

  normalize: (raw) => normalizeFoursquarePlace(raw, 'foursquare'),
  getSourceId: (raw) => raw.sourceId,
}

const osAdapter: SourceAdapter = {
  name: 'foursquare_os',
  entityType: 'venue',
  async fetch(): Promise<RawItem[]> {
    throw new Error('foursquare_os accepts bounded records supplied by the sync CLI')
  },
  normalize: (raw) => normalizeFoursquarePlace(raw, 'foursquare_os'),
  getSourceId: (raw) => raw.sourceId,
}

function getCityForHour(): string[] {
  return [DEFAULT_CITIES[new Date().getUTCHours() % DEFAULT_CITIES.length]]
}

async function setSyncState(
  stream: 'categories' | 'snapshot' | 'delta',
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await getServiceClient().from('foursquare_sync_state').upsert({
    stream_key: stream,
    ...values,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'stream_key' })
  if (error) throw new Error(`Foursquare sync state: ${error.message}`)
}

function boundedRecords(body: Record<string, unknown>, max = 500): Record<string, unknown>[] {
  if (!Array.isArray(body.records)) throw new Error('records must be an array')
  if (body.records.length > max) throw new Error(`records exceeds maximum batch size ${max}`)
  return body.records.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
}

async function processCategories(
  body: Record<string, unknown>,
  dryRun: boolean,
): Promise<Record<string, unknown>> {
  const records = boundedRecords(body, 1_000)
  const releaseId = String(body.release_id ?? '') || null
  const rows = records.flatMap((record) => {
    const categoryId = String(record.category_id ?? '').trim()
    if (!categoryId) return []
    const label = String(record.category_label ?? record.category_name ?? '').trim()
    const decision = classifyFoursquareCategories({ fsq_category_labels: label ? [label] : [] })
    const queerEvidence = queerDiscoveryEvidence({ fsq_category_labels: label ? [label] : [] })
    const hierarchy = Object.fromEntries(
      Object.entries(record).filter(([key]) => /^level[1-6]_category_(id|name)$/.test(key)),
    )
    return [{
      category_id: categoryId,
      category_level: Number(record.category_level) || null,
      category_name: record.category_name || null,
      category_label: record.category_label || null,
      hierarchy,
      venue_category: decision.venueCategory === 'other' ? null : decision.venueCategory,
      accommodation_type: decision.accommodationType ?? null,
      // A generic bar/hotel/etc. category is useful taxonomy, not LGBTQ+
      // relevance. Only an explicitly queer category may seed discovery.
      discovery_eligible: queerEvidence.length > 0,
      source_release_id: releaseId,
      updated_at: new Date().toISOString(),
    }]
  })

  if (!dryRun && rows.length) {
    const { error } = await getServiceClient().from('foursquare_categories').upsert(rows, { onConflict: 'category_id' })
    if (error) throw new Error(`Foursquare categories: ${error.message}`)
  }
  return { records: records.length, valid: rows.length, release_id: releaseId }
}

async function existingFoursquareIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const supabase = getServiceClient()
  const [sources, venues] = await Promise.all([
    supabase.from('venue_sources').select('source_entity_id')
      .in('source_slug', ['foursquare', 'foursquare_os']).in('source_entity_id', ids),
    supabase.from('venues').select('foursquare_id').in('foursquare_id', ids),
  ])
  if (sources.error) throw new Error(`Foursquare identity lookup: ${sources.error.message}`)
  if (venues.error) throw new Error(`Foursquare venue lookup: ${venues.error.message}`)
  return new Set([
    ...(sources.data ?? []).map((row) => row.source_entity_id as string),
    ...(venues.data ?? []).map((row) => row.foursquare_id as string),
  ].filter(Boolean))
}

async function existingEditorialReviewIds(
  sourceName: 'foursquare' | 'foursquare_os',
  ids: string[],
): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const { data, error } = await getServiceClient().from('ingestion_staging')
    .select('source_entity_id')
    .eq('source_name', sourceName)
    .in('source_entity_id', ids)
    .eq('normalized_data->metadata->>requires_editorial_review', 'true')
  if (error) throw new Error(`Foursquare editorial identity lookup: ${error.message}`)
  return new Set((data ?? []).map((row) => row.source_entity_id as string).filter(Boolean))
}

interface PreparedOsBatch {
  rawItems: RawItem[]
  autoMatches: Map<string, { venueId: string; confidence: number; reasons: string[] }>
  editorialReviewIds: string[]
  skippedIrrelevant: number
  discoveryCandidates: number
  existingIdentities: number
}

async function prepareOsPlaces(
  records: Record<string, unknown>[],
  releaseId: string | null,
): Promise<PreparedOsBatch> {
  const places = records.flatMap((record) => {
    const place = record as FoursquarePlace
    const id = foursquarePlaceId(place)
    return id ? [{ id, place }] : []
  })
  const existing = await existingFoursquareIds(places.map((row) => row.id))
  const existingReview = await existingEditorialReviewIds('foursquare_os', places.map((row) => row.id))
  const autoMatches = new Map<string, { venueId: string; confidence: number; reasons: string[] }>()
  const editorialReviewIds: string[] = []
  const rawItems: RawItem[] = []
  let skippedIrrelevant = 0
  let discoveryCandidates = 0
  let existingIdentities = 0

  for (const { id, place } of places) {
    const matchTarget = typeof place._match_target_id === 'string' ? place._match_target_id : ''
    const matchConfidence = Number(place._match_confidence ?? 0)
    const evidence = queerDiscoveryEvidence(place)
    let requiresEditorialReview = false
    if (existingReview.has(id)) {
      discoveryCandidates++
      requiresEditorialReview = true
      editorialReviewIds.push(id)
    } else if (existing.has(id)) existingIdentities++
    else if (matchTarget && matchConfidence >= 0.95) {
      autoMatches.set(id, {
        venueId: matchTarget,
        confidence: Math.min(matchConfidence, 1),
        reasons: Array.isArray(place._match_reasons)
          ? (place._match_reasons as unknown[]).map(String)
          : ['os_sync_cli'],
      })
    } else if (evidence.length) {
      discoveryCandidates++
      requiresEditorialReview = true
      editorialReviewIds.push(id)
    }
    else {
      skippedIrrelevant++
      continue
    }

    rawItems.push({
      sourceId: id,
      data: { ...place, _source_release_id: releaseId, _requires_editorial_review: requiresEditorialReview },
    })
  }
  return { rawItems, autoMatches, editorialReviewIds, skippedIrrelevant, discoveryCandidates, existingIdentities }
}

async function enforceEditorialReview(
  sourceName: 'foursquare' | 'foursquare_os',
  sourceIds: string[],
): Promise<number> {
  if (!sourceIds.length) return 0
  const supabase = getServiceClient()
  const { data: rows, error: loadError } = await supabase.from('ingestion_staging')
    .select('id,source_entity_id')
    .eq('source_name', sourceName)
    .in('source_entity_id', sourceIds)
    .eq('disposition', 'pending')
  if (loadError) throw new Error(`Foursquare editorial gate lookup: ${loadError.message}`)
  if (!rows?.length) return 0

  const ids = rows.map((row) => row.id as string)
  const { error: updateError } = await supabase.from('ingestion_staging').update({
    ai_validation_status: 'needs_review',
    review_status: 'pending_review',
    review_notes: 'Foursquare-only discovery requires independent editorial corroboration',
    updated_at: new Date().toISOString(),
  }).in('id', ids)
  if (updateError) throw new Error(`Foursquare editorial gate update: ${updateError.message}`)

  const { data: queued, error: queueLoadError } = await supabase.from('review_queue')
    .select('entity_id')
    .eq('entity_type', 'ingestion_staging')
    .eq('status', 'pending')
    .in('entity_id', ids)
  if (queueLoadError) throw new Error(`Foursquare editorial queue lookup: ${queueLoadError.message}`)
  const alreadyQueued = new Set((queued ?? []).map((row) => row.entity_id as string))
  const queueRows = rows.filter((row) => !alreadyQueued.has(row.id as string)).map((row) => ({
    entity_type: 'ingestion_staging',
    entity_id: row.id,
    review_type: 'foursquare_independent_corroboration',
    status: 'pending',
    details: {
      source: sourceName,
      source_entity_id: row.source_entity_id,
      reason: 'Provider taxonomy may seed discovery but cannot establish publication eligibility',
    },
  }))
  if (queueRows.length) {
    const { error: queueError } = await supabase.from('review_queue').insert(queueRows)
    if (queueError) throw new Error(`Foursquare editorial queue insert: ${queueError.message}`)
  }
  return rows.length
}

async function markAutoMatches(
  matches: Map<string, { venueId: string; confidence: number; reasons: string[] }>,
): Promise<number> {
  const supabase = getServiceClient()
  let marked = 0
  for (const [sourceId, match] of matches) {
    const { error } = await supabase.from('ingestion_staging').update({
      dedup_status: 'duplicate',
      dedup_match_id: match.venueId,
      dedup_match_table: 'venues',
      dedup_match_score: match.confidence,
      dedup_details: {
        source: 'foursquare_os_cli_match',
        reasons: match.reasons,
        fsq_place_id: sourceId,
      },
      updated_at: new Date().toISOString(),
    }).eq('source_name', 'foursquare_os').eq('source_entity_id', sourceId)
      .eq('disposition', 'pending')
    if (error) throw new Error(`Foursquare auto-match ${sourceId}: ${error.message}`)
    marked++
  }
  return marked
}

async function signalRemovedPlaces(ids: string[], releaseId: string | null): Promise<number> {
  if (!ids.length) return 0
  const supabase = getServiceClient()
  const { data: sources, error } = await supabase.from('venue_sources')
    .select('venue_id,source_entity_id')
    .in('source_slug', ['foursquare', 'foursquare_os'])
    .in('source_entity_id', ids)
  if (error) throw new Error(`Foursquare remove lookup: ${error.message}`)
  const unique = new Map((sources ?? []).map((row) => [row.venue_id as string, row.source_entity_id as string]))
  if (!unique.size) return 0
  const venueIds = [...unique.keys()]
  const update = await supabase.from('venues').update({ needs_attention: true }).in('id', venueIds)
  if (update.error) throw new Error(`Foursquare remove signal: ${update.error.message}`)
  const audit = await supabase.from('venue_consensus_audit').insert(venueIds.map((venueId) => ({
    venue_id: venueId,
    field: 'foursquare_delta_remove',
    winning_value: null,
    winning_source: 'foursquare_os',
    confidence: 0.55,
    conflicting_sources: ['foursquare_os'],
    action: 'triage',
    details: {
      fsq_place_id: unique.get(venueId),
      source_release_id: releaseId,
      note: 'FSQ removal is negative evidence only; never an automatic closure or deletion',
    },
  })))
  if (audit.error) throw new Error(`Foursquare remove audit: ${audit.error.message}`)
  return venueIds.length
}

async function processPlaces(
  body: Record<string, unknown>,
  stream: 'snapshot' | 'delta',
  dryRun: boolean,
): Promise<Record<string, unknown>> {
  const releaseId = String(body.release_id ?? '') || null
  const input = boundedRecords(body)
  let placeRecords = input
  let redirects = 0
  let removedSignals = 0

  if (stream === 'delta') {
    const deltas = orderFoursquareDeltas(input as unknown as FoursquareDeltaRecord[])
    const mergeRows = deltas.filter((row) => row.action === 'merge' && row.redirect).map((row) => ({
      old_place_id: row.fsq_place_id,
      new_place_id: row.redirect as string,
      source_release_id: releaseId,
      payload: row,
      observed_at: new Date().toISOString(),
    }))
    if (!dryRun && mergeRows.length) {
      const { error } = await getServiceClient().from('foursquare_place_redirects')
        .upsert(mergeRows, { onConflict: 'old_place_id' })
      if (error) throw new Error(`Foursquare redirects: ${error.message}`)
    }
    redirects = mergeRows.length
    const removed = deltas.filter((row) => row.action === 'remove').map((row) => row.fsq_place_id)
    if (!dryRun) removedSignals = await signalRemovedPlaces(removed, releaseId)
    placeRecords = deltas.flatMap((row) => row.place
      ? [{ ...row.place, fsq_place_id: row.redirect ?? row.fsq_place_id }]
      : [])
  }

  const prepared = await prepareOsPlaces(placeRecords, releaseId)
  const config: AdapterConfig = {
    batchSize: prepared.rawItems.length,
    dryRun,
    pipelineRunId: typeof body.pipeline_run_id === 'string' ? body.pipeline_run_id : undefined,
    nodeId: typeof body.node_id === 'string' ? body.node_id : undefined,
  }
  const written = dryRun ? 0 : await writeToStaging(getServiceClient(), osAdapter, prepared.rawItems, {
    ...config,
    targetTable: 'venues',
    refresh: true,
    refreshTerminalDispositions: ['committed', 'inserted', 'updated', 'rejected'],
    sourceType: 'foursquare-os',
  })
  const marked = dryRun ? 0 : await markAutoMatches(prepared.autoMatches)
  const reviewGated = dryRun ? 0 : await enforceEditorialReview('foursquare_os', prepared.editorialReviewIds)
  return {
    records: input.length,
    eligible: prepared.rawItems.length,
    written,
    auto_matches: prepared.autoMatches.size,
    auto_matches_marked: marked,
    review_gated: reviewGated,
    existing_identities: prepared.existingIdentities,
    discovery_candidates: prepared.discoveryCandidates,
    skipped_irrelevant: prepared.skippedIrrelevant,
    redirects,
    removed_signals: removedSignals,
    release_id: releaseId,
  }
}

async function handleOs(body: Record<string, unknown>, req: Request): Promise<Response> {
  const stream = String(body.stream ?? 'snapshot') as 'categories' | 'snapshot' | 'delta'
  if (!['categories', 'snapshot', 'delta'].includes(stream)) {
    return errorResponse('stream must be categories, snapshot, or delta', 400, req)
  }
  // Writes require an explicit false; omitted/invalid values remain previews.
  const dryRun = body.dry_run !== false
  if (body.finalize === true) {
    const stats = {
      ...normalizeFoursquareAggregateStats(body.aggregate_stats),
      release_id: String(body.release_id ?? '') || null,
    }
    if (!dryRun) {
      await setSyncState(stream, {
        status: 'succeeded',
        source_release_id: body.release_id ?? null,
        cursor: body.cursor ?? {},
        stats,
        last_success_at: new Date().toISOString(),
        last_error: null,
      })
    }
    return jsonResponse({ success: true, source: 'foursquare_os', stream, dry_run: dryRun, finalized: true, ...stats }, 200, req)
  }
  if (!dryRun) {
    await setSyncState(stream, {
      status: 'running',
      source_release_id: body.release_id ?? null,
      last_started_at: new Date().toISOString(),
      last_error: null,
    })
  }
  try {
    const stats = stream === 'categories'
      ? await processCategories(body, dryRun)
      : await processPlaces(body, stream, dryRun)
    if (!dryRun) await setSyncState(stream, {
      status: 'succeeded',
      source_release_id: body.release_id ?? null,
      cursor: body.cursor ?? {},
      stats,
      last_success_at: new Date().toISOString(),
      last_error: null,
    })
    return jsonResponse({ success: true, source: 'foursquare_os', stream, dry_run: dryRun, ...stats }, 200, req)
  } catch (error) {
    if (!dryRun) await setSyncState(stream, {
      status: 'failed',
      last_error: (error as Error).message.slice(0, 1_000),
    })
    throw error
  }
}

Deno.serve(withErrorReporting('source-foursquare', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const auth = await requireInternalOrAdmin(req, getServiceClient())
  if (auth instanceof Response) return auth

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    if (body.source === 'os' || body.source === 'foursquare_os' || body.stream) {
      return await handleOs(body, req)
    }

    const supabase = getServiceClient()
    const mode = typeof body.mode === 'string' ? body.mode : 'venues'
    if (body.dry_run === true) {
      const customTerms = Array.isArray(body.terms) ? body.terms : null
      const terms = customTerms?.length ? customTerms
        : mode === 'hotels' ? HOTEL_TERMS
        : mode === 'all' ? [...SEARCH_TERMS, ...HOTEL_TERMS]
        : SEARCH_TERMS
      const cities = Array.isArray(body.cities) && body.cities.length ? body.cities : getCityForHour()
      const budget = await reserveFoursquareApiCalls(supabase, `search:${mode}`, 0)
      return jsonResponse({
        success: true,
        dry_run: true,
        source: 'foursquare',
        planned_calls: terms.length * cities.length,
        terms,
        cities,
        budget,
        items: 0,
      }, 200, req)
    }

    const config: AdapterConfig = {
      batchSize: Number(body.limit || body.batch_size || 20),
      filters: { cities: body.cities, mode, terms: body.terms, radius: body.radius },
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : Deno.env.get('FOURSQUARE_API_KEY'),
      pipelineRunId: typeof body.pipeline_run_id === 'string' ? body.pipeline_run_id : undefined,
      nodeId: typeof body.node_id === 'string' ? body.node_id : undefined,
    }
    const fetchedItems = await apiAdapter.fetch(config)
    const existing = await existingFoursquareIds(fetchedItems.map((item) => item.sourceId))
    const rawItems = filterFoursquareDiscoveries(fetchedItems, existing)
    const existingReview = await existingEditorialReviewIds('foursquare', rawItems.map((item) => item.sourceId))
    const reviewIds = rawItems.filter((item) => existingReview.has(item.sourceId) || !existing.has(item.sourceId))
      .map((item) => item.sourceId)
    const guardedItems = rawItems.map((item) => ({
      ...item,
      data: {
        ...item.data,
        _requires_editorial_review: existingReview.has(item.sourceId) || !existing.has(item.sourceId),
      },
    }))
    const written = await writeToStaging(supabase, apiAdapter, guardedItems, {
      ...config,
      targetTable: 'venues',
      refresh: true,
      refreshTerminalDispositions: ['committed', 'inserted', 'updated', 'rejected'],
      sourceType: typeof body.sourceType === 'string' ? body.sourceType : undefined,
    })
    const reviewGated = await enforceEditorialReview('foursquare', reviewIds)
    return jsonResponse({
      success: true,
      source: 'foursquare',
      items: written,
      items_total: rawItems.length,
      items_processed: written,
      items_succeeded: written,
      items_failed: 0,
      review_gated: reviewGated,
      skipped_irrelevant: fetchedItems.length - rawItems.length,
    }, 200, req)
  } catch (error) {
    if (error instanceof MissingCredentialsError) {
      return jsonResponse(skippedResponse('missing_credentials', error.missing), 200, req)
    }
    if (error instanceof InvalidCredentialsError) {
      return jsonResponse(skippedResponse('invalid_credentials', error.missing), 200, req)
    }
    if (error instanceof FoursquareBudgetError) {
      return jsonResponse({
        ...skippedResponse(error.verdict.reason ?? 'free_tier_exhausted', []),
        budget: error.verdict,
      }, 200, req)
    }
    if (error instanceof FoursquareRateLimitError) {
      return jsonResponse(skippedResponse('provider_quota_exhausted', []), 200, req)
    }
    console.error('source-foursquare error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
