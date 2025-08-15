import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface BackgroundJob {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentBatch: number;
  totalBatches: number;
  processedItems: number;
  totalItems: number;
  successfulItems: number;
  failedItems: number;
  duplicateItems: number;
  message: string;
  errorDetails?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
  importConfig?: ImportConfig;
}

export interface ImportConfig {
  duplicateStrategy: 'skip' | 'update' | 'fail' | 'create_new';
  errorStrategy: 'continue' | 'stop' | 'retry_batch';
  validation: {
    strict: boolean;
    required_fields: string[];
    custom_validations: Record<string, any>;
  };
  filters: {
    location?: string;
    date_range?: { start: string; end: string };
    keywords?: string[];
    categories?: string[];
    limit?: number;
    offset?: number;
  };
  advanced: {
    enable_geocoding: boolean;
    enable_image_processing: boolean;
    enable_ai_enhancement: boolean;
    concurrent_limit: number;
    timeout_seconds: number;
  };
}

export interface ImportStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  runningJobs: number;
  totalProcessedItems: number;
  totalSuccessfulItems: number;
  totalFailedItems: number;
  totalDuplicateItems: number;
  lastImportDate?: Date;
}

const SUPPORTED_IMPORT_TYPES = [
  // Personality imports
  'personalities-bulk',
  'reimport-personality-images', 
  'import-personalities-csv',
  'import-adult-models-csv',
  
  // Event imports
  'events-csv',
  'import-eventbrite-events',
  'import-ticketmaster-events',
  'bulk-scrape-events',
  
  // Venue imports
  'venues-csv',
  'import-foursquare-venues',
  'import-tripadvisor-venues',
  'import-google-places-venues',
  'import-tomtom-venues',
  
  // Restroom imports
  'import-refuge-restrooms',
  
  // Tag and category imports
  'tags-csv',
  'categorize-tags',
  'bulk-create-ai-tags',
  
  // Data imports
  'import-city-data',
  'import-country-data',
  'import-ilga-data',
  'link-locations',
  
  // News and content
  'fetch-news',
  'fetch-personality-data',
  'fetch-wikipedia-data',
  
  // Marketplace
  'import-awin-products'
];

export const useBackgroundImports = () => {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [stats, setStats] = useState<ImportStats>({
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    runningJobs: 0,
    totalProcessedItems: 0,
    totalSuccessfulItems: 0,
    totalFailedItems: 0,
    totalDuplicateItems: 0
  });
  const [loading, setLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(true);
  const { toast } = useToast();

  // Load jobs from database
  const loadJobs = useCallback(async () => {
    if (!isPolling) return;
    
    try {
      const { data, error } = await supabase
        .from('import_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      
      const mappedJobs: BackgroundJob[] = data?.map((job: any) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        currentBatch: job.current_batch,
        totalBatches: job.total_batches,
        processedItems: job.processed_items,
        totalItems: job.total_items,
        successfulItems: job.successful_items || 0,
        failedItems: job.failed_items || 0,
        duplicateItems: job.duplicate_items || 0,
        message: job.message,
        errorDetails: job.error_details,
        retryCount: job.retry_count,
        maxRetries: job.max_retries,
        createdAt: new Date(job.created_at),
        updatedAt: new Date(job.updated_at),
        importConfig: job.import_config
      })) || [];
      
      setJobs(mappedJobs);
      
      // Calculate stats
      const newStats: ImportStats = {
        totalJobs: mappedJobs.length,
        completedJobs: mappedJobs.filter(j => j.status === 'completed').length,
        failedJobs: mappedJobs.filter(j => j.status === 'failed').length,
        runningJobs: mappedJobs.filter(j => ['running', 'queued'].includes(j.status)).length,
        totalProcessedItems: mappedJobs.reduce((sum, job) => sum + job.processedItems, 0),
        totalSuccessfulItems: mappedJobs.reduce((sum, job) => sum + job.successfulItems, 0),
        totalFailedItems: mappedJobs.reduce((sum, job) => sum + job.failedItems, 0),
        totalDuplicateItems: mappedJobs.reduce((sum, job) => sum + job.duplicateItems, 0),
        lastImportDate: mappedJobs.length > 0 ? mappedJobs[0].createdAt : undefined
      };
      setStats(newStats);
      
    } catch (error) {
      console.error('Failed to load jobs:', error);
      toast({
        title: "Error Loading Jobs",
        description: "Failed to load background import jobs",
        variant: "destructive"
      });
    }
  }, [isPolling, toast]);

  // Create a new background import job
  const createImportJob = useCallback(async (
    type: string,
    data: any,
    batchSize: number = 5
  ): Promise<string> => {
    if (!SUPPORTED_IMPORT_TYPES.includes(type)) {
      throw new Error(`Unsupported import type: ${type}`);
    }

    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('background-import-manager', {
        body: {
          action: 'create',
          type,
          data,
          batchSize
        }
      });

      if (error) throw error;
      
      const jobId = result.jobId;
      
      toast({
        title: "Import Job Created",
        description: `Background import job for ${type} has been queued with ${result.totalItems} items in ${result.totalBatches} batches.`
      });
      
      // Refresh jobs list
      await loadJobs();
      
      return jobId;
    } catch (error) {
      console.error('Failed to create import job:', error);
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Failed to create import job",
        variant: "destructive"
      });
      throw error;
    } finally {
      setLoading(false);
    }
  }, [loadJobs, toast]);

  // Create advanced import job with configuration
  const createAdvancedImportJob = useCallback(async (
    type: string,
    data: any,
    importConfig: ImportConfig,
    batchSize: number = 5
  ): Promise<string> => {
    if (!SUPPORTED_IMPORT_TYPES.includes(type)) {
      throw new Error(`Unsupported import type: ${type}`);
    }

    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('background-import-manager', {
        body: {
          action: 'create',
          type,
          data,
          batchSize,
          importConfig
        }
      });

      if (error) throw error;
      
      const jobId = result.jobId;
      
      toast({
        title: "Advanced Import Job Created",
        description: `Advanced import job for ${type} created with ${importConfig.duplicateStrategy} duplicate strategy and ${Object.keys(importConfig.filters || {}).length} filters applied.`
      });
      
      // Refresh jobs list
      await loadJobs();
      
      return jobId;
    } catch (error) {
      console.error('Failed to create advanced import job:', error);
      toast({
        title: "Advanced Import Failed",
        description: error instanceof Error ? error.message : "Failed to create advanced import job",
        variant: "destructive"
      });
      throw error;
    } finally {
      setLoading(false);
    }
  }, [loadJobs, toast]);

  // Retry a failed job
  const retryJob = useCallback(async (jobId: string) => {
    try {
      const { error } = await supabase.functions.invoke('background-import-manager', {
        body: {
          action: 'retry',
          jobId
        }
      });

      if (error) throw error;
      
      toast({
        title: "Job Retry Initiated",
        description: "The job has been queued for retry."
      });
      
      await loadJobs();
    } catch (error) {
      console.error('Failed to retry job:', error);
      toast({
        title: "Retry Failed",
        description: "Failed to retry the job.",
        variant: "destructive"
      });
    }
  }, [loadJobs, toast]);

  // Pause a running job
  const pauseJob = useCallback(async (jobId: string) => {
    try {
      const { error } = await supabase.functions.invoke('background-import-manager', {
        body: {
          action: 'pause',
          jobId
        }
      });

      if (error) throw error;
      await loadJobs();
    } catch (error) {
      console.error('Failed to pause job:', error);
      toast({
        title: "Pause Failed",
        description: "Failed to pause the job.",
        variant: "destructive"
      });
    }
  }, [loadJobs, toast]);

  // Resume a paused job
  const resumeJob = useCallback(async (jobId: string) => {
    try {
      const { error } = await supabase.functions.invoke('background-import-manager', {
        body: {
          action: 'resume',
          jobId
        }
      });

      if (error) throw error;
      await loadJobs();
    } catch (error) {
      console.error('Failed to resume job:', error);
      toast({
        title: "Resume Failed",
        description: "Failed to resume the job.",
        variant: "destructive"
      });
    }
  }, [loadJobs, toast]);

  // Cancel a job
  const cancelJob = useCallback(async (jobId: string) => {
    try {
      const { error } = await supabase.functions.invoke('background-import-manager', {
        body: {
          action: 'cancel',
          jobId
        }
      });

      if (error) throw error;
      await loadJobs();
    } catch (error) {
      console.error('Failed to cancel job:', error);
      toast({
        title: "Cancel Failed",
        description: "Failed to cancel the job.",
        variant: "destructive"
      });
    }
  }, [loadJobs, toast]);

  // Clean up old jobs
  const cleanupOldJobs = useCallback(async () => {
    try {
      const { error } = await supabase.functions.invoke('background-import-manager', {
        body: {
          action: 'cleanup'
        }
      });

      if (error) throw error;
      
      toast({
        title: "Cleanup Complete",
        description: "Old completed and failed jobs have been cleaned up."
      });
      
      await loadJobs();
    } catch (error) {
      console.error('Failed to cleanup jobs:', error);
      toast({
        title: "Cleanup Failed",
        description: "Failed to cleanup old jobs.",
        variant: "destructive"
      });
    }
  }, [loadJobs, toast]);

  // Toggle polling
  const togglePolling = useCallback(() => {
    setIsPolling(!isPolling);
  }, [isPolling]);

  // Auto-refresh jobs
  useEffect(() => {
    loadJobs();
    
    if (isPolling) {
      const interval = setInterval(loadJobs, 3000); // Poll every 3 seconds
      return () => clearInterval(interval);
    }
  }, [loadJobs, isPolling]);

  return {
    jobs,
    stats,
    loading,
    isPolling,
    supportedTypes: SUPPORTED_IMPORT_TYPES,
    
    // Actions
    createImportJob,
    createAdvancedImportJob,
    retryJob,
    pauseJob,
    resumeJob,
    cancelJob,
    cleanupOldJobs,
    togglePolling,
    refreshJobs: loadJobs
  };
};