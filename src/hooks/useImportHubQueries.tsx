import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { StagingItem } from '@/hooks/useImportHub';

// ==================== Types ====================

export interface StagingPageResult {
  items: StagingItem[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface StagingFilters {
  target_table?: string | null;
  review_status?: string | null;
  dedup_status?: string | null;
  search?: string | null;
}

export interface StagingSort {
  field: string;
  dir: 'asc' | 'desc';
}

export interface DuplicatePair {
  id: string;
  entity_type: string;
  entity_a_id: string;
  entity_b_id: string;
  match_method: string;
  confidence: number;
  decision: string;
  created_at: string;
}

export interface BatchDedupResult {
  processed: number;
  duplicates_found: number;
  merge_candidates_found: number;
  skipped: number;
}

export interface ScanDedupResult {
  entity_type: string;
  scanned: number;
  duplicates_found: number;
  threshold: number;
}

export interface MergeResult {
  success: boolean;
  entity_type: string;
  keep_id: string;
  keep_name: string;
  remove_id: string;
  remove_name: string;
  fk_updates: number;
  error?: string;
}

// ==================== Staging Items (Server-Side Paginated) ====================

export function useStagingItems(
  filters: StagingFilters = {},
  page: number = 1,
  perPage: number = 50,
  sort: StagingSort = { field: 'created_at', dir: 'desc' },
) {
  return useQuery({
    queryKey: ['staging-items', filters, page, perPage, sort],
    queryFn: async (): Promise<StagingPageResult> => {
      const { data, error } = await supabase.rpc('get_staging_page', {
        p_target_table: filters.target_table || null,
        p_review_status: filters.review_status || null,
        p_dedup_status: filters.dedup_status || null,
        p_search: filters.search || null,
        p_page: page,
        p_per_page: perPage,
        p_sort_field: sort.field,
        p_sort_dir: sort.dir,
      } as Record<string, unknown>);

      if (error) {
        console.error('Failed to fetch staging page:', error);
        return { items: [], total: 0, page: 1, per_page: perPage, total_pages: 0 };
      }

      const result = data as unknown as StagingPageResult;
      return {
        items: result?.items || [],
        total: result?.total || 0,
        page: result?.page || 1,
        per_page: result?.per_page || perPage,
        total_pages: result?.total_pages || 0,
      };
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

// ==================== Duplicate Pairs ====================

export function useDuplicatePairs(entityType: string | null) {
  return useQuery({
    queryKey: ['duplicate-pairs', entityType],
    queryFn: async (): Promise<DuplicatePair[]> => {
      let query = supabase
        .from('scraper_dedupe_decisions')
        .select('*')
        .eq('decision', 'pending')
        .order('confidence', { ascending: false })
        .limit(200);

      if (entityType && entityType !== 'all') {
        query = query.eq('entity_type', entityType);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Failed to fetch duplicate pairs:', error);
        return [];
      }
      return (data || []) as DuplicatePair[];
    },
    enabled: entityType === 'all' || !!entityType,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

// ==================== Entity Lookup ====================

export function useEntityById(entityType: string | null, entityId: string | null) {
  return useQuery({
    queryKey: ['entity', entityType, entityId],
    queryFn: async (): Promise<Record<string, unknown> | null> => {
      if (!entityType || !entityId) return null;

      const { data, error } = await supabase
        .from(entityType as 'venues')
        .select('*')
        .eq('id', entityId)
        .single();

      if (error) {
        console.error(`Failed to fetch ${entityType} ${entityId}:`, error);
        return null;
      }
      return data as Record<string, unknown>;
    },
    enabled: !!entityType && !!entityId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

// ==================== Import Statistics ====================

export function useImportStatistics() {
  return useQuery({
    queryKey: ['import-statistics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_import_statistics');
      if (error) {
        console.error('Failed to fetch import stats:', error);
        return null;
      }
      const raw = (data as Record<string, unknown>) || {};
      return {
        total_jobs: raw.total_imports || 0,
        completed_jobs: raw.successful_imports || 0,
        failed_jobs: raw.failed_imports || 0,
        pending_jobs: raw.pending_imports || 0,
        total_records_processed: raw.total_records_processed || 0,
        total_successful_records: raw.total_successful_records || 0,
        total_failed_records: raw.total_failed_records || 0,
        total_duplicate_records: raw.total_duplicate_records || 0,
        items_pending_review: raw.items_pending_review || 0,
        last_import_date: raw.last_import_date || undefined,
      };
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchInterval: 60_000,
  });
}

// ==================== Import Jobs (Paginated) ====================

export function useImportJobs(
  page: number = 1,
  status: string | null = null,
  perPage: number = 20,
) {
  return useQuery({
    queryKey: ['import-jobs', page, status, perPage],
    queryFn: async () => {
      let query = supabase
        .from('import_jobs_enhanced')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * perPage, page * perPage - 1);

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query;
      if (error) {
        console.error('Failed to fetch import jobs:', error);
        return { jobs: [], total: 0 };
      }
      return { jobs: data || [], total: count || 0 };
    },
    staleTime: 10_000,
    gcTime: 60_000,
    refetchInterval: 10_000,
  });
}

// ==================== Mutations ====================

export function useBatchFindDuplicates() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { targetTable?: string; batchLimit?: number }) => {
      const { data, error } = await supabase.rpc('batch_find_duplicates', {
        p_target_table: params.targetTable || null,
        p_batch_limit: params.batchLimit || 100,
      } as Record<string, unknown>);
      if (error) throw error;
      return data as unknown as BatchDedupResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['staging-items'] });
      toast({
        title: 'Duplicate Scan Complete',
        description: `Processed ${data.processed} items: ${data.duplicates_found} duplicates, ${data.merge_candidates_found} candidates`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Scan Failed', description: error.message, variant: 'destructive' });
    },
  });
}

export function useScanTableDuplicates() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { entityType: string; threshold?: number; limit?: number }) => {
      const { data, error } = await supabase.rpc('scan_table_duplicates', {
        p_entity_type: params.entityType,
        p_threshold: params.threshold || 0.7,
        p_limit: params.limit || 200,
      } as Record<string, unknown>);
      if (error) throw error;
      return data as unknown as ScanDedupResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['duplicate-pairs'] });
      toast({
        title: 'Table Scan Complete',
        description: `Scanned ${data.scanned} ${data.entity_type}: found ${data.duplicates_found} duplicate pairs`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Scan Failed', description: error.message, variant: 'destructive' });
    },
  });
}

export function useMergeEntities() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      entityType: string;
      keepId: string;
      removeId: string;
      mergedData?: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase.rpc('merge_entities', {
        p_entity_type: params.entityType,
        p_keep_id: params.keepId,
        p_remove_id: params.removeId,
        p_merged_data: params.mergedData || null,
      } as Record<string, unknown>);
      if (error) throw error;
      const result = data as unknown as MergeResult;
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['duplicate-pairs'] });
      queryClient.invalidateQueries({ queryKey: ['entity'] });
      queryClient.invalidateQueries({ queryKey: ['staging-items'] });
      queryClient.invalidateQueries({ queryKey: ['import-statistics'] });
      toast({
        title: 'Records Merged',
        description: `Kept "${data.keep_name}", removed "${data.remove_name}" (${data.fk_updates} references updated)`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Merge Failed', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDismissDuplicate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (decisionId: string) => {
      const { error } = await supabase
        .from('scraper_dedupe_decisions')
        .update({ decision: 'not_duplicate' })
        .eq('id', decisionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['duplicate-pairs'] });
    },
  });
}

export function useStagingAction() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      action: 'approve' | 'reject' | 'bulk_approve' | 'bulk_reject' | 'merge';
      stagingId?: string;
      stagingIds?: string[];
      targetVenueId?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('ingestion-review-api', {
        body: {
          action: params.action,
          staging_id: params.stagingId,
          staging_ids: params.stagingIds,
          target_venue_id: params.targetVenueId,
          notes: params.notes,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['staging-items'] });
      queryClient.invalidateQueries({ queryKey: ['import-statistics'] });
      const count = variables.stagingIds?.length || 1;
      const action = variables.action === 'merge'
        ? 'merged'
        : variables.action.includes('approve') ? 'approved' : 'rejected';
      toast({
        title: `${count} item${count > 1 ? 's' : ''} ${action}`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Action Failed', description: error.message, variant: 'destructive' });
    },
  });
}

// ==================== Merge History ====================

export function useMergeHistory(limit: number = 50) {
  return useQuery({
    queryKey: ['merge-history', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('import_audit_log')
        .select('*')
        .eq('action', 'entity_merged')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Failed to fetch merge history:', error);
        return [];
      }
      return data || [];
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}
