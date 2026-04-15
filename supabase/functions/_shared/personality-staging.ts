// ============================================================
// Personality staging helper
// Pushes raw personality payloads into ingestion_staging so they
// flow through the bulletproof pipeline (normalize → validate →
// dedup → quality → review-gate → commit).
// ============================================================

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

export interface RawPersonality {
  name: string
  description?: string
  bio?: string
  birth_date?: string | null
  death_date?: string | null
  is_living?: boolean
  profession?: string
  nationality?: string
  birth_place?: string
  image_url?: string
  website_url?: string
  pronouns?: string
  verification_status?: string
  visibility?: string
  is_featured?: boolean
  fields?: string[]
  wikidata_qid?: string
  external_ids?: Record<string, string>
  lgbti_connection?: string
  lgbti_details?: string
  top_book?: string
  next_concerts?: unknown[]
  social_links?: Record<string, string>
  [k: string]: unknown
}

export interface StageResult {
  staging_id: string
  idempotency_key: string
  inserted: boolean
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function normKey(name: string): string {
  return name.toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ').trim()
}

export async function stagePersonality(
  supabase: SupabaseClient,
  raw: RawPersonality,
  opts: {
    source_name: string
    source_type?: string
    source_entity_id?: string | null
    pipeline_run_id?: string | null
    actor?: string
  },
): Promise<StageResult> {
  const qid = raw.wikidata_qid?.match(/Q\d+/)?.[0] ?? null
  const keyBasis = qid
    ? `${opts.source_name}:${qid}`
    : `${opts.source_name}:${normKey(raw.name)}:${raw.birth_date ?? ''}`
  const idempotencyKey = await sha256Hex(keyBasis)
  const payloadHash    = await sha256Hex(JSON.stringify(raw))

  // Try to update existing staging row (idempotent re-ingest) first
  const { data: existing } = await supabase.from('ingestion_staging')
    .select('id').eq('idempotency_key', idempotencyKey).maybeSingle()

  if (existing?.id) {
    await supabase.from('ingestion_staging').update({
      raw_data: raw,
      payload_hash: payloadHash,
      updated_at: new Date().toISOString(),
      // Reset pipeline state so updated row flows through again
      normalized_data: null,
      ai_validation_status: 'pending',
      dedup_status: 'pending',
      enrichment_status: 'pending',
      review_status: 'auto',
      disposition: 'pending',
    }).eq('id', existing.id)
    return { staging_id: existing.id, idempotency_key: idempotencyKey, inserted: false }
  }

  const { data, error } = await supabase.from('ingestion_staging').insert({
    raw_data: raw,
    target_table: 'personalities',
    entity_type: 'personality',
    source_type: opts.source_type ?? 'api',
    source_name: opts.source_name,
    source_entity_id: opts.source_entity_id ?? qid ?? null,
    payload_hash: payloadHash,
    idempotency_key: idempotencyKey,
    pipeline_run_id: opts.pipeline_run_id ?? null,
    ai_validation_status: 'pending',
    dedup_status: 'pending',
    enrichment_status: 'pending',
    review_status: 'auto',
    disposition: 'pending',
  }).select('id').single()

  if (error) throw new Error(`stage personality: ${error.message}`)
  return { staging_id: data.id, idempotency_key: idempotencyKey, inserted: true }
}

/** Kick off the personality pipeline for a batch of newly-staged rows. */
export async function triggerPersonalityPipeline(
  supabase: SupabaseClient,
  ctx: { triggered_by: string; batch_size?: number; dry_run?: boolean } = { triggered_by: 'manual' },
): Promise<{ pipeline_run_id: string | null; error?: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const res = await fetch(`${supabaseUrl}/functions/v1/pipeline-executor`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      action: 'start',
      pipeline_name: 'personality-ingestion',
      triggered_by: ctx.triggered_by,
      batch_size: ctx.batch_size ?? 50,
      dry_run: ctx.dry_run ?? false,
    }),
  })
  const json = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok) return { pipeline_run_id: null, error: (json.error as string) || `HTTP ${res.status}` }
  return { pipeline_run_id: (json.pipeline_run_id as string) ?? null }
}
