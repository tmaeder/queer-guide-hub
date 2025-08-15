import { useState, useEffect, useImperativeHandle, forwardRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, CheckCircle, AlertCircle, Clock, Pause, Play, X } from "lucide-react";

interface BackgroundJob {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentBatch: number;
  totalBatches: number;
  processedItems: number;
  totalItems: number;
  message: string;
  errorDetails?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
}

interface BackgroundImportManagerProps {
  onJobUpdate?: (job: BackgroundJob) => void;
}

export interface BackgroundImportManagerRef {
  createBackgroundJob: (type: string, data: any, batchSize?: number) => Promise<string>;
}

const BackgroundImportManager = forwardRef<BackgroundImportManagerRef, BackgroundImportManagerProps>(
  ({ onJobUpdate }, ref) => {
    const [jobs, setJobs] = useState<BackgroundJob[]>([]);
    const [isPolling, setIsPolling] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
      loadJobs();
      const interval = setInterval(loadJobs, 2000);
      return () => clearInterval(interval);
    }, []);

    const loadJobs = async () => {
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
          message: job.message,
          errorDetails: job.error_details,
          retryCount: job.retry_count,
          maxRetries: job.max_retries,
          createdAt: new Date(job.created_at),
          updatedAt: new Date(job.updated_at)
        })) || [];
        
        setJobs(mappedJobs);
        
        // Notify parent of job updates
        mappedJobs.forEach(job => onJobUpdate?.(job));
        
      } catch (error) {
        console.error('Failed to load jobs:', error);
      }
    };

    const createBackgroundJob = async (
      type: string, 
      data: any, 
      batchSize: number = 5 // Default batch size of 5
    ): Promise<string> => {
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
          description: `Background import job ${type} has been queued and will process in batches of ${batchSize} items.`
        });
        
        loadJobs();
        return jobId;
      } catch (error) {
        console.error('Failed to create background job:', error);
        throw error;
      }
    };

    const retryJob = async (jobId: string) => {
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
        
        loadJobs();
      } catch (error) {
        console.error('Failed to retry job:', error);
        toast({
          title: "Retry Failed",
          description: "Failed to retry the job.",
          variant: "destructive"
        });
      }
    };

    const pauseJob = async (jobId: string) => {
      try {
        const { error } = await supabase.functions.invoke('background-import-manager', {
          body: {
            action: 'pause',
            jobId
          }
        });

        if (error) throw error;
        loadJobs();
      } catch (error) {
        console.error('Failed to pause job:', error);
      }
    };

    const resumeJob = async (jobId: string) => {
      try {
        const { error } = await supabase.functions.invoke('background-import-manager', {
          body: {
            action: 'resume',
            jobId
          }
        });

        if (error) throw error;
        loadJobs();
      } catch (error) {
        console.error('Failed to resume job:', error);
      }
    };

    const cancelJob = async (jobId: string) => {
      try {
        const { error } = await supabase.functions.invoke('background-import-manager', {
          body: {
            action: 'cancel',
            jobId
          }
        });

        if (error) throw error;
        loadJobs();
      } catch (error) {
        console.error('Failed to cancel job:', error);
      }
    };

    // Expose methods to parent component
    useImperativeHandle(ref, () => ({
      createBackgroundJob
    }));

    const getStatusIcon = (status: BackgroundJob['status']) => {
      switch (status) {
        case 'completed':
          return <CheckCircle className="h-4 w-4 text-green-600" />;
        case 'failed':
          return <AlertCircle className="h-4 w-4 text-red-600" />;
        case 'running':
          return <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />;
        case 'paused':
          return <Pause className="h-4 w-4 text-orange-600" />;
        case 'cancelled':
          return <X className="h-4 w-4 text-gray-600" />;
        default:
          return <Clock className="h-4 w-4 text-yellow-600" />;
      }
    };

    const getStatusBadge = (status: BackgroundJob['status']) => {
      const variants = {
        completed: 'default',
        failed: 'destructive',
        running: 'secondary',
        paused: 'outline',
        cancelled: 'secondary',
        queued: 'outline'
      } as const;
      return <Badge variant={variants[status]}>{status}</Badge>;
    };

    const getStatusColor = (status: BackgroundJob['status']) => {
      switch (status) {
        case 'completed': return 'text-green-600';
        case 'failed': return 'text-red-600';
        case 'running': return 'text-blue-600';
        case 'paused': return 'text-orange-600';
        case 'cancelled': return 'text-gray-600';
        default: return 'text-yellow-600';
      }
    };

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Background Import Jobs
              </CardTitle>
              <CardDescription>
                Reliable, batched imports running in the background (batch size: 5 items)
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPolling(!isPolling)}
              >
                {isPolling ? 'Pause' : 'Resume'} Polling
              </Button>
              <Button variant="outline" size="sm" onClick={loadJobs}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No background jobs found. Start an import to see jobs here.
            </div>
          ) : (
            <div className="space-y-4">
              {jobs.map(job => (
                <div key={job.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(job.status)}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{job.type}</span>
                          {getStatusBadge(job.status)}
                        </div>
                        <p className="text-sm text-muted-foreground">{job.message}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {job.status === 'running' && (
                        <Button variant="outline" size="sm" onClick={() => pauseJob(job.id)}>
                          <Pause className="h-4 w-4" />
                        </Button>
                      )}
                      {job.status === 'paused' && (
                        <Button variant="outline" size="sm" onClick={() => resumeJob(job.id)}>
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      {job.status === 'failed' && job.retryCount < job.maxRetries && (
                        <Button variant="outline" size="sm" onClick={() => retryJob(job.id)}>
                          <RefreshCw className="h-4 w-4" />
                          Retry
                        </Button>
                      )}
                      {['running', 'queued', 'paused'].includes(job.status) && (
                        <Button variant="outline" size="sm" onClick={() => cancelJob(job.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* Progress bars */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Overall Progress</span>
                      <span className={getStatusColor(job.status)}>
                        {job.processedItems}/{job.totalItems} items
                      </span>
                    </div>
                    <Progress value={job.progress} className="h-2" />
                    
                    {job.totalBatches > 1 && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span>Batch Progress</span>
                          <span>{job.currentBatch}/{job.totalBatches} batches</span>
                        </div>
                        <Progress 
                          value={(job.currentBatch / job.totalBatches) * 100} 
                          className="h-1" 
                        />
                      </>
                    )}
                  </div>
                  
                  {/* Error details */}
                  {job.errorDetails && (
                    <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                      <strong>Error:</strong> {job.errorDetails}
                      {job.retryCount > 0 && (
                        <div className="mt-1">
                          <strong>Retry attempts:</strong> {job.retryCount}/{job.maxRetries}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Timestamps */}
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Started: {job.createdAt.toLocaleString()}</span>
                    <span>Updated: {job.updatedAt.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

BackgroundImportManager.displayName = "BackgroundImportManager";

export default BackgroundImportManager;