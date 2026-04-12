import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ImportJob {
  id: string;
  user_id: string;
  type: string;
  source_type: 'csv' | 'api' | 'web_scraping' | 'file_upload';
  duplicate_strategy: 'skip' | 'overwrite' | 'create_new';
  unique_key_fields: string[];
  validation_rules: Record<string, unknown>;
  filters: Record<string, unknown>;
  status: 'pending' | 'validating' | 'processing' | 'completed' | 'failed' | 'cancelled';
  phase: 'queued' | 'pre_validation' | 'processing' | 'post_validation' | 'cleanup';
  progress_percentage: number;
  total_records: number;
  valid_records: number;
  invalid_records: number;
  processed_records: number;
  successful_records: number;
  failed_records: number;
  duplicate_records: number;
  source_data?: unknown;
  validation_report: Record<string, unknown>;
  error_report: Record<string, unknown>;
  import_summary: Record<string, unknown>;
  file_name?: string;
  file_size?: number;
  file_hash?: string;
  api_endpoint?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  updated_at: string;
}

export interface ImportStatistics {
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  pending_jobs: number;
  total_records_processed: number;
  total_successful_records: number;
  total_failed_records: number;
  total_duplicate_records: number;
  last_import_date?: string;
  items_pending_review?: number;
}

export interface IngestionSource {
  id: string;
  name: string;
  slug: string;
  source_type: 'api' | 'scraper' | 'csv' | 'rss';
  target_table: string;
  edge_function: string;
  config: Record<string, unknown>;
  schedule: string | null;
  is_enabled: boolean;
  requires_api_key: string | null;
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  requests_today: number;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  total_items_fetched: number;
  total_items_approved: number;
  created_at: string;
  updated_at: string;
}

export interface StagingItem {
  id: string;
  job_id: string;
  source_type: string;
  target_table: string;
  raw_data: Record<string, unknown>;
  normalized_data: Record<string, unknown> | null;
  ai_validation_status: string;
  ai_confidence_score: number | null;
  ai_validation_result: Record<string, unknown>;
  dedup_status: string;
  dedup_match_id: string | null;
  dedup_match_score: number | null;
  dedup_details: Record<string, unknown>;
  review_status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  disposition: string;
  created_at: string;
}

export interface PipelineJob {
  id: string;
  type: string;
  source_type: string;
  status: string;
  pipeline_stage: string;
  items_fetched: number;
  items_ai_approved: number;
  items_ai_rejected: number;
  items_needs_review: number;
  items_deduplicated: number;
  items_committed: number;
  ai_cost_usd: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ValidationResult {
  record_index: number;
  record_data: unknown;
  is_valid: boolean;
  validation_errors: string[];
  validation_warnings: string[];
}

export const useImportHub = () => {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [statistics, setStatistics] = useState<ImportStatistics>({
    total_jobs: 0,
    completed_jobs: 0,
    failed_jobs: 0,
    pending_jobs: 0,
    total_records_processed: 0,
    total_successful_records: 0,
    total_failed_records: 0,
    total_duplicate_records: 0
  });
  const [loading, setLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(true);
  const { toast } = useToast();

  // Load import jobs
  const loadJobs = useCallback(async () => {
    if (!isPolling) return;
    
    try {
      const { data, error } = await supabase
        .from('import_jobs_enhanced')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      setJobs((data || []) as ImportJob[]);
    } catch (error) {
      console.error('Failed to load import jobs:', error);
      toast({
        title: 'Error Loading Jobs',
        description: 'Failed to load import jobs',
        variant: 'destructive'
      });
    }
  }, [isPolling, toast]);

  // Load statistics
  const loadStatistics = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_import_statistics');

      if (error) throw error;

      // Map RPC response fields to our interface fields
      const raw = data as Record<string, unknown> || {};
      setStatistics({
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
      });
    } catch (error) {
      console.error('Failed to load statistics:', error);
      // Set default statistics on error
      setStatistics({
        total_jobs: 0,
        completed_jobs: 0,
        failed_jobs: 0,
        pending_jobs: 0,
        total_records_processed: 0,
        total_successful_records: 0,
        total_failed_records: 0,
        total_duplicate_records: 0
      });
    }
  }, []);

  // Create import job
  const createImportJob = useCallback(async (
    type: string,
    sourceType: ImportJob['source_type'],
    config: {
      duplicateStrategy?: ImportJob['duplicate_strategy'];
      uniqueKeyFields?: string[];
      validationRules?: Record<string, unknown>;
      filters?: Record<string, unknown>;
      sourceData?: unknown;
      fileName?: string;
      fileSize?: number;
      apiEndpoint?: string;
      venueImportConfig?: Record<string, unknown>;
    } = {}
  ): Promise<string> => {
    setLoading(true);
    try {
      // Handle venue API imports specially
      if (type.startsWith('venues-') && !type.endsWith('-csv') && config.venueImportConfig) {
        const provider = type.replace('venues-', '');
        const functionName = `import-${provider}-venues`;
        const { _data, error } = await supabase.functions.invoke(functionName, {
          body: { config: config.venueImportConfig }
        });
        
        if (error) throw error;
        toast({
          title: 'Import Started',
          description: `${provider} venue import has been initiated`,
        });
        await loadJobs();
        await loadStatistics();
        return 'venue-import-completed';
      }
      // Generate file hash if source data is provided
      let fileHash: string | undefined;
      if (config.sourceData && typeof config.sourceData === 'string') {
        const encoder = new TextEncoder();
        const data = encoder.encode(config.sourceData);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        fileHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      
      if (!userId) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('import_jobs_enhanced')
        .insert({
          user_id: userId,
          type,
          source_type: sourceType,
          duplicate_strategy: config.duplicateStrategy || 'skip',
          unique_key_fields: config.uniqueKeyFields || [],
          validation_rules: config.validationRules || {},
          filters: config.filters || {},
          source_data: config.sourceData,
          file_name: config.fileName,
          file_size: config.fileSize,
          file_hash: fileHash,
          api_endpoint: config.apiEndpoint,
          user_agent: navigator.userAgent,
          ip_address: null // Will be set by server-side trigger
        })
        .select()
        .single();

      if (error) throw error;

      // Log audit event
      await supabase
        .from('import_audit_log')
        .insert({
          import_job_id: data.id,
          user_id: userId,
          action: 'job_created',
          details: {
            type,
            source_type: sourceType,
            duplicate_strategy: config.duplicateStrategy,
            timestamp: new Date().toISOString()
          }
        });

      toast({
        title: 'Import Job Created',
        description: `Import job has been created and queued for processing.`
      });

      await loadJobs();
      await loadStatistics();
      
      return data.id;
    } catch (error) {
      console.error('Failed to create import job:', error);
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Failed to create import job',
        variant: 'destructive'
      });
      throw error;
    } finally {
      setLoading(false);
    }
  }, [loadJobs, loadStatistics, toast]);

  // Validate import data
  const validateImportData = useCallback(async (jobId: string): Promise<unknown> => {
    try {
      const { data, error } = await supabase.rpc('validate_import_data', {
        data: { job_id: jobId, validation_rules: {} }
      });

      if (error) throw error;

      await loadJobs();
      return data;
    } catch (error) {
      console.error('Failed to validate import data:', error);
      toast({
        title: 'Validation Failed',
        description: error instanceof Error ? error.message : 'Failed to validate import data',
        variant: 'destructive'
      });
      throw error;
    }
  }, [loadJobs, toast]);

  // Get validation results for a job
  const getValidationResults = useCallback(async (jobId: string): Promise<ValidationResult[]> => {
    try {
      const { data, error } = await supabase
        .from('import_validation_results')
        .select('*')
        .eq('import_job_id', jobId)
        .order('record_index');

      if (error) throw error;

      return (data || []).map(item => ({
        ...item,
        validation_errors: Array.isArray(item.validation_errors) ? item.validation_errors : [],
        validation_warnings: Array.isArray(item.validation_warnings) ? item.validation_warnings : []
      })) as ValidationResult[];
    } catch (error) {
      console.error('Failed to get validation results:', error);
      return [];
    }
  }, []);

  // Cancel import job
  const cancelImportJob = useCallback(async (jobId: string) => {
    try {
      const { error } = await supabase
        .from('import_jobs_enhanced')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      if (error) throw error;

      // Log audit event
      await supabase
        .from('import_audit_log')
        .insert({
          import_job_id: jobId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          action: 'job_cancelled',
          details: { timestamp: new Date().toISOString() }
        });

      toast({
        title: 'Job Cancelled',
        description: 'Import job has been cancelled.'
      });

      await loadJobs();
      await loadStatistics();
    } catch (error) {
      console.error('Failed to cancel import job:', error);
      toast({
        title: 'Cancel Failed',
        description: 'Failed to cancel import job',
        variant: 'destructive'
      });
    }
  }, [loadJobs, loadStatistics, toast]);

  // Parse a single CSV line handling quoted fields (commas inside quotes)
  const parseCSVLine = useCallback((line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'; // escaped quote
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }, []);

  // Parse CSV data for preview
  const parseCSVPreview = useCallback((csvData: string, maxRows: number = 10) => {
    const lines = csvData.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = parseCSVLine(lines[0]);
    const rows = lines.slice(1, maxRows + 1).map(line => {
      const values = parseCSVLine(line);
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row;
    });

    return { headers, rows };
  }, [parseCSVLine]);

  // Toggle polling
  const togglePolling = useCallback(() => {
    setIsPolling(!isPolling);
  }, [isPolling]);

  // Initial load
  useEffect(() => {
    loadJobs();
    loadStatistics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh polling
  useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(() => {
      loadJobs();
      loadStatistics();
    }, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPolling]);

  // ========== Ingestion Sources ==========
  const fetchSources = useCallback(async (): Promise<IngestionSource[]> => {
    try {
      const { data, error } = await supabase
        .from('ingestion_sources')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data || []) as IngestionSource[];
    } catch (error) {
      console.error('Failed to fetch ingestion sources:', error);
      return [];
    }
  }, []);

  const toggleSource = useCallback(async (sourceId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('ingestion_sources')
        .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
        .eq('id', sourceId);
      if (error) throw error;
      toast({
        title: enabled ? 'Source Enabled' : 'Source Disabled',
        description: `Source has been ${enabled ? 'enabled' : 'disabled'}.`,
      });
    } catch (error) {
      console.error('Failed to toggle source:', error);
      toast({ title: 'Error', description: 'Failed to update source', variant: 'destructive' });
    }
  }, [toast]);

  const triggerSource = useCallback(async (source: IngestionSource) => {
    try {
      const { _data, error } = await supabase.functions.invoke(source.edge_function, {
        body: {}
      });
      if (error) throw error;
      toast({
        title: 'Source Triggered',
        description: `${source.name} import has been started.`,
      });
      await loadJobs();
    } catch (error) {
      console.error('Failed to trigger source:', error);
      toast({ title: 'Trigger Failed', description: `Failed to trigger ${source.name}`, variant: 'destructive' });
    }
  }, [toast, loadJobs]);

  // ========== Review Queue ==========
  const fetchReviewQueue = useCallback(async (filters?: {
    target_table?: string;
    source_type?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: StagingItem[]; total: number }> => {
    try {
      const { data, error } = await supabase.functions.invoke('ingestion-review-api', {
        body: {
          action: 'list',
          filters: {
            target_table: filters?.target_table,
            source_type: filters?.source_type,
          },
          page: filters?.page || 1,
          limit: filters?.limit || 20,
        }
      });
      if (error) throw error;
      return { items: data?.items || [], total: data?.total || 0 };
    } catch (error) {
      console.error('Failed to fetch review queue:', error);
      return { items: [], total: 0 };
    }
  }, []);

  const fetchReviewStats = useCallback(async (): Promise<Record<string, unknown>> => {
    try {
      const { data, error } = await supabase.functions.invoke('ingestion-review-api', {
        body: { action: 'stats' }
      });
      if (error) throw error;
      return data?.stats || {};
    } catch (error) {
      console.error('Failed to fetch review stats:', error);
      return {};
    }
  }, []);

  const approveItem = useCallback(async (stagingId: string, notes?: string) => {
    try {
      const { error } = await supabase.functions.invoke('ingestion-review-api', {
        body: { action: 'approve', staging_id: stagingId, notes }
      });
      if (error) throw error;
      toast({ title: 'Item Approved', description: 'Item has been approved and will be committed.' });
    } catch (error) {
      console.error('Failed to approve item:', error);
      toast({ title: 'Approval Failed', description: 'Failed to approve item', variant: 'destructive' });
    }
  }, [toast]);

  const rejectItem = useCallback(async (stagingId: string, notes?: string) => {
    try {
      const { error } = await supabase.functions.invoke('ingestion-review-api', {
        body: { action: 'reject', staging_id: stagingId, notes }
      });
      if (error) throw error;
      toast({ title: 'Item Rejected', description: 'Item has been rejected.' });
    } catch (error) {
      console.error('Failed to reject item:', error);
      toast({ title: 'Rejection Failed', description: 'Failed to reject item', variant: 'destructive' });
    }
  }, [toast]);

  const bulkApprove = useCallback(async (stagingIds: string[]) => {
    try {
      const { error } = await supabase.functions.invoke('ingestion-review-api', {
        body: { action: 'bulk_approve', staging_ids: stagingIds }
      });
      if (error) throw error;
      toast({ title: 'Bulk Approved', description: `${stagingIds.length} items approved.` });
    } catch (error) {
      console.error('Failed to bulk approve:', error);
      toast({ title: 'Bulk Approval Failed', description: 'Failed to approve items', variant: 'destructive' });
    }
  }, [toast]);

  const bulkReject = useCallback(async (stagingIds: string[]) => {
    try {
      const { error } = await supabase.functions.invoke('ingestion-review-api', {
        body: { action: 'bulk_reject', staging_ids: stagingIds }
      });
      if (error) throw error;
      toast({ title: 'Bulk Rejected', description: `${stagingIds.length} items rejected.` });
    } catch (error) {
      console.error('Failed to bulk reject:', error);
      toast({ title: 'Bulk Rejection Failed', description: 'Failed to reject items', variant: 'destructive' });
    }
  }, [toast]);

  // ========== Pipeline Monitor ==========
  const fetchPipelineJobs = useCallback(async (): Promise<PipelineJob[]> => {
    try {
      const { data, error } = await supabase
        .from('import_jobs_enhanced')
        .select('id, type, source_type, status, pipeline_stage, items_fetched, items_ai_approved, items_ai_rejected, items_needs_review, items_deduplicated, items_committed, ai_cost_usd, created_at, updated_at, completed_at')
        .in('status', ['processing', 'pending'])
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as PipelineJob[];
    } catch (error) {
      console.error('Failed to fetch pipeline jobs:', error);
      return [];
    }
  }, []);

  // Get venue import stats by data source
  const getVenueImportStats = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('data_source')
        .in('data_source', ['foursquare', 'google_places', 'tomtom', 'tripadvisor']);

      if (error) throw error;

      const stats = (data || []).reduce((acc: Record<string, number>, venue: { data_source?: string }) => {
        if (venue.data_source) {
          acc[venue.data_source] = (acc[venue.data_source] || 0) + 1;
        }
        return acc;
      }, {});

      return stats;
    } catch (error) {
      console.error('Error fetching venue import stats:', error);
      return {};
    }
  }, []);

  return {
    jobs,
    statistics,
    loading,
    isPolling,

    // Actions
    createImportJob,
    validateImportData,
    getValidationResults,
    cancelImportJob,
    parseCSVPreview,
    togglePolling,
    refreshJobs: loadJobs,
    refreshStatistics: loadStatistics,
    getVenueImportStats,

    // Ingestion Sources
    fetchSources,
    toggleSource,
    triggerSource,

    // Review Queue
    fetchReviewQueue,
    fetchReviewStats,
    approveItem,
    rejectItem,
    bulkApprove,
    bulkReject,

    // Pipeline Monitor
    fetchPipelineJobs,
  };
};