import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

export type PipelineStage = 'fetching' | 'ai_validation' | 'dedup' | 'enrichment' | 'review' | 'committing' | 'completed' | 'failed'

export async function updateJobStage(
  supabase: SupabaseClient,
  jobId: string,
  stage: PipelineStage,
  updates: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await supabase
    .from('import_jobs_enhanced')
    .update({
      pipeline_stage: stage,
      status: stage === 'completed' ? 'completed' : stage === 'failed' ? 'failed' : 'processing',
      updated_at: new Date().toISOString(),
      ...(stage === 'completed' ? { completed_at: new Date().toISOString() } : {}),
      ...updates,
    })
    .eq('id', jobId)

  if (error) {
    console.error(`Failed to update job ${jobId} to stage ${stage}:`, error)
  }
}

export async function writeStagingBatch(
  supabase: SupabaseClient,
  jobId: string,
  sourceType: string,
  targetTable: string,
  items: Array<{ raw_data: Record<string, unknown>; normalized_data?: Record<string, unknown> }>
): Promise<number> {
  if (items.length === 0) return 0

  const rows = items.map(item => ({
    job_id: jobId,
    source_type: sourceType,
    target_table: targetTable,
    raw_data: item.raw_data,
    normalized_data: item.normalized_data || null,
  }))

  const { error } = await supabase.from('ingestion_staging').insert(rows)
  if (error) {
    if (error.code === '23505') return  // items already in staging, skip
    throw new Error(`Staging write failed: ${error.message}`)
  }

  // Update job items_fetched counter
  await supabase.rpc('increment_job_counter', { job_id: jobId, counter_name: 'items_fetched', amount: rows.length })
    .then(() => {})
    .catch(() => {
      // Fallback: direct update if RPC doesn't exist yet
      supabase.from('import_jobs_enhanced')
        .select('items_fetched')
        .eq('id', jobId)
        .single()
        .then(({ data }) => {
          if (data) {
            supabase.from('import_jobs_enhanced')
              .update({ items_fetched: (data.items_fetched || 0) + rows.length })
              .eq('id', jobId)
          }
        })
    })

  return rows.length
}

// Load a batch of staging items for a specific pipeline stage
export async function loadStagingBatch(
  supabase: SupabaseClient,
  jobId: string,
  stage: 'ai_validation' | 'dedup' | 'enrichment' | 'commit',
  limit = 20
): Promise<Array<Record<string, unknown>>> {
  let query = supabase
    .from('ingestion_staging')
    .select('*')
    .eq('job_id', jobId)
    .limit(limit)
    .order('created_at', { ascending: true })

  switch (stage) {
    case 'ai_validation':
      query = query.eq('ai_validation_status', 'pending')
      break
    case 'dedup':
      query = query
        .eq('ai_validation_status', 'approved')
        .eq('dedup_status', 'pending')
      break
    case 'enrichment':
      query = query
        .in('dedup_status', ['unique'])
        .eq('enrichment_status', 'pending')
        .eq('disposition', 'pending')
      break
    case 'commit':
      query = query
        .eq('disposition', 'pending')
        .in('dedup_status', ['unique'])
        .in('review_status', ['auto', 'approved'])
      break
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to load staging batch for ${stage}: ${error.message}`)
  }

  return data || []
}

// Re-invoke a function for chunked processing (next batch)
export async function continueProcessing(
  supabase: SupabaseClient,
  functionName: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    // Use supabase.functions.invoke which handles auth automatically
    await supabase.functions.invoke(functionName, { body: payload })
  } catch (error) {
    console.error(`Failed to continue processing via ${functionName}:`, error)
  }
}

// Create a new ingestion job
export async function createIngestionJob(
  supabase: SupabaseClient,
  params: {
    userId: string
    sourceId?: string
    sourceType: string
    type: string
    config?: Record<string, unknown>
  }
): Promise<string> {
  const { data, error } = await supabase
    .from('import_jobs_enhanced')
    .insert({
      user_id: params.userId,
      source_id: params.sourceId || null,
      source_type: params.sourceType,
      type: params.type,
      status: 'processing',
      pipeline_stage: 'fetching',
      import_summary: params.config || {},
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create ingestion job: ${error?.message || 'no data returned'}`)
  }

  return data.id
}

// Update staging item after AI validation
export async function updateStagingAI(
  supabase: SupabaseClient,
  stagingId: string,
  result: {
    status: 'approved' | 'rejected' | 'needs_review'
    confidence: number
    validationResult: Record<string, unknown>
  }
): Promise<void> {
  const updates: Record<string, unknown> = {
    ai_validation_status: result.status,
    ai_confidence_score: result.confidence,
    ai_validation_result: result.validationResult,
    ai_validated_at: new Date().toISOString(),
  }

  // Items that need review go to the review queue
  if (result.status === 'needs_review') {
    updates.review_status = 'pending_review'
  }

  // Rejected items get final disposition
  if (result.status === 'rejected') {
    updates.disposition = 'rejected'
  }

  const { error } = await supabase
    .from('ingestion_staging')
    .update(updates)
    .eq('id', stagingId)

  if (error) {
    console.error(`Failed to update staging AI for ${stagingId}:`, error)
  }
}

// Update staging item after deduplication
export async function updateStagingDedup(
  supabase: SupabaseClient,
  stagingId: string,
  result: {
    status: 'unique' | 'duplicate' | 'merge_candidate'
    matchId?: string
    matchTable?: string
    matchScore?: number
    details: Record<string, unknown>
  }
): Promise<void> {
  const updates: Record<string, unknown> = {
    dedup_status: result.status,
    dedup_match_id: result.matchId || null,
    dedup_match_table: result.matchTable || null,
    dedup_match_score: result.matchScore || null,
    dedup_details: result.details,
  }

  // Duplicates get skipped
  if (result.status === 'duplicate') {
    updates.disposition = 'skipped'
  }

  // Merge candidates need review
  if (result.status === 'merge_candidate') {
    updates.review_status = 'pending_review'
  }

  const { error } = await supabase
    .from('ingestion_staging')
    .update(updates)
    .eq('id', stagingId)

  if (error) {
    console.error(`Failed to update staging dedup for ${stagingId}:`, error)
  }
}
