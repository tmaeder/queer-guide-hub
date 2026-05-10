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
  entity_a_name: string | null;
  entity_b_name: string | null;
  match_method: string;
  confidence: number;
  decision: string;
  incoming_source_name: string | null;
  incoming_source_id: string | null;
  created_at: string;
}

const ENTITY_TABLE_MAP: Record<string, { table: string; nameCol: string }> = {
  venue: { table: 'venues', nameCol: 'name' },
  venues: { table: 'venues', nameCol: 'name' },
  event: { table: 'events', nameCol: 'title' },
  events: { table: 'events', nameCol: 'title' },
  place: { table: 'cities', nameCol: 'name' },
  city: { table: 'cities', nameCol: 'name' },
  cities: { table: 'cities', nameCol: 'name' },
  country: { table: 'countries', nameCol: 'name' },
  countries: { table: 'countries', nameCol: 'name' },
  stay: { table: 'venues', nameCol: 'name' },
  personality: { table: 'personalities', nameCol: 'name' },
  personalities: { table: 'personalities', nameCol: 'name' },
};

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
  const rows = (data ?? []) as DedupDecisionRow[];

  const idsByTable = new Map<string, Set<string>>();
  for (const r of rows) {
    const mapping = ENTITY_TABLE_MAP[r.entity_type];
    if (!mapping) continue;
    let ids = idsByTable.get(mapping.table);
    if (!ids) { ids = new Set(); idsByTable.set(mapping.table, ids); }
    if (r.entity_a_id) ids.add(r.entity_a_id);
    if (r.entity_b_id) ids.add(r.entity_b_id);
  }

  const nameMap = new Map<string, string>();
  await Promise.all(
    [...idsByTable.entries()].map(async ([table, ids]) => {
      const mapping = Object.values(ENTITY_TABLE_MAP).find((m) => m.table === table);
      if (!mapping || ids.size === 0) return;
      const col = mapping.nameCol;
      const { data: entities } = await supabase
        .from(table)
        .select(`id, ${col}`)
        .in('id', [...ids]);
      for (const e of entities ?? []) {
        nameMap.set(e.id, (e as Record<string, unknown>)[col] as string);
      }
    }),
  );

  for (const r of rows) {
    if (r.entity_a_id) r.entity_a_name = nameMap.get(r.entity_a_id) ?? null;
    if (r.entity_b_id) r.entity_b_name = nameMap.get(r.entity_b_id) ?? null;
  }

  return rows;
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

// GeoReviewTab — uses resolve_geo_merge_candidate RPC for proper audit trail,
// review_queue updates, and commit logic
export async function resolveGeoMergeCandidate(
  stagingId: string,
  decision: 'merge' | 'not_duplicate',
): Promise<void> {
  const { error } = await supabase.rpc('resolve_geo_merge_candidate', {
    p_staging_id: stagingId,
    p_decision: decision,
    p_actor: 'admin-ui',
  });
  if (error) throw error;
}
