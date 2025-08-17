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
  validation_rules: Record<string, any>;
  filters: Record<string, any>;
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
  source_data?: any;
  validation_report: Record<string, any>;
  error_report: Record<string, any>;
  import_summary: Record<string, any>;
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
}

export interface ValidationResult {
  record_index: number;
  record_data: any;
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
      
      // Safely handle the RPC response
      const statsData = data as unknown as ImportStatistics;
      setStatistics(statsData || {
        total_jobs: 0,
        completed_jobs: 0,
        failed_jobs: 0,
        pending_jobs: 0,
        total_records_processed: 0,
        total_successful_records: 0,
        total_failed_records: 0,
        total_duplicate_records: 0
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
      validationRules?: Record<string, any>;
      filters?: Record<string, any>;
      sourceData?: any;
      fileName?: string;
      fileSize?: number;
      apiEndpoint?: string;
      venueImportConfig?: any;
    } = {}
  ): Promise<string> => {
    setLoading(true);
    try {
      // Handle venue API imports specially
      if (type.startsWith('venues-') && !type.endsWith('-csv') && config.venueImportConfig) {
        const { supabase } = await import('@/integrations/supabase/client');
        const provider = type.replace('venues-', '');
        const functionName = `import-${provider}-venues`;
        const { data, error } = await supabase.functions.invoke(functionName, {
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
          user_id: (await supabase.auth.getUser()).data.user?.id,
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
  const validateImportData = useCallback(async (jobId: string): Promise<any> => {
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

  // Parse CSV data for preview
  const parseCSVPreview = useCallback((csvData: string, maxRows: number = 10) => {
    const lines = csvData.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
    const rows = lines.slice(1, maxRows + 1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/['"]/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row;
    });

    return { headers, rows };
  }, []);

  // Toggle polling
  const togglePolling = useCallback(() => {
    setIsPolling(!isPolling);
  }, [isPolling]);

  // Auto-refresh
  useEffect(() => {
    loadJobs();
    loadStatistics();
    
    if (isPolling) {
      const interval = setInterval(() => {
        loadJobs();
        loadStatistics();
      }, 5000); // Poll every 5 seconds
      return () => clearInterval(interval);
    }
  }, [loadJobs, loadStatistics, isPolling]);

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
    getVenueImportStats
  };
};

const getVenueImportStats = async () => {
  try {
    const { data, error } = await supabase
      .from('venues')
      .select('data_source')
      .in('data_source', ['foursquare', 'google_places', 'tomtom', 'tripadvisor']);

    if (error) throw error;

    const stats = data.reduce((acc, venue) => {
      acc[venue.data_source] = (acc[venue.data_source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return stats;
  } catch (error) {
    console.error('Error fetching venue import stats:', error);
    return {};
  }
};