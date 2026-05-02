import { supabase } from '@/integrations/supabase/client';

// AlertsTab
export interface DataOpsAlert {
  id: number;
  alert_kind: string;
  severity: 'info' | 'warn' | 'error';
  source_slug: string | null;
  detail: Record<string, unknown>;
  fingerprint: string;
  acked_at: string | null;
  created_at: string;
}

export async function fetchDataOpsAlerts(filter: 'open' | 'all'): Promise<DataOpsAlert[]> {
  let q = supabase
    .from('data_ops_alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (filter === 'open') q = q.is('acked_at', null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DataOpsAlert[];
}

export async function ackDataOpsAlert(id: number, ackedBy: string | null): Promise<void> {
  const { error } = await supabase
    .from('data_ops_alerts')
    .update({ acked_at: new Date().toISOString(), acked_by: ackedBy })
    .eq('id', id);
  if (error) throw error;
}

// CoverageTab
export interface CoverageTargetRow {
  id: number;
  source_slug: string;
  city_id: string | null;
  accommodation_type: string | null;
  expected_count: number | null;
  actual_count: number;
  last_run_at: string | null;
  last_success_at: string | null;
  success_ratio: number | null;
  is_enabled: boolean;
}

export interface HotelIngestStats {
  source: string;
  accommodation_type: string;
  staged: number;
  validated: number;
  unique_items: number;
  duplicates: number;
  committed: number;
  rejected: number;
  pending_review: number;
  day: string;
}

export async function fetchSourceCoverageTargets(): Promise<CoverageTargetRow[]> {
  const { data, error } = await supabase
    .from('source_coverage_targets')
    .select('*')
    .order('source_slug')
    .limit(500);
  if (error) throw error;
  return (data ?? []) as CoverageTargetRow[];
}

export async function fetchHotelIngestStats(): Promise<HotelIngestStats[]> {
  const { data, error } = await supabase.from('hotel_ingest_stats').select('*');
  if (error) throw error;
  return (data ?? []) as HotelIngestStats[];
}

// DLQTab
export interface DlqRow {
  id: number;
  staging_id: string | null;
  source_slug: string | null;
  stage: string;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  status: string;
  next_retry_at: string;
  last_attempt_at: string | null;
  created_at: string;
}

export async function fetchDlqRows(
  filter: 'pending' | 'permanent_failed' | 'all',
): Promise<DlqRow[]> {
  let q = supabase
    .from('ingestion_dlq')
    .select('*')
    .order('next_retry_at', { ascending: true })
    .limit(200);
  if (filter !== 'all') q = q.eq('status', filter);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DlqRow[];
}

export async function retryDlqItem(id: number): Promise<void> {
  const { error } = await supabase
    .from('ingestion_dlq')
    .update({
      status: 'pending',
      next_retry_at: new Date().toISOString(),
      locked_until: null,
    })
    .eq('id', id);
  if (error) throw error;
}

// DedupDecisionsTab
export interface DedupDecisionRow {
  id: string;
  entity_type: string;
  entity_a_id: string | null;
  entity_b_id: string | null;
  match_method: string;
  confidence: number;
  decision: string;
  incoming_source_name: string | null;
  incoming_source_id: string | null;
  created_at: string;
}

export async function fetchPendingDedupDecisions(
  entityFilter: string,
): Promise<DedupDecisionRow[]> {
  let q = supabase
    .from('scraper_dedupe_decisions')
    .select('*')
    .eq('decision', 'pending')
    .order('confidence', { ascending: false })
    .limit(200);
  if (entityFilter !== 'all') q = q.eq('entity_type', entityFilter);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DedupDecisionRow[];
}

export async function setDedupDecision(
  id: string,
  decision: 'merge' | 'skip',
): Promise<void> {
  const { error } = await supabase
    .from('scraper_dedupe_decisions')
    .update({ decision })
    .eq('id', id);
  if (error) throw error;
}

// GeoReviewTab
export async function approveIngestionStaging(stagingId: string): Promise<void> {
  const { error } = await supabase
    .from('ingestion_staging')
    .update({
      review_status: 'approved',
      disposition: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', stagingId);
  if (error) throw error;
}

export async function rejectIngestionStaging(stagingId: string): Promise<void> {
  const { error } = await supabase
    .from('ingestion_staging')
    .update({
      review_status: 'rejected',
      disposition: 'rejected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', stagingId);
  if (error) throw error;
}
