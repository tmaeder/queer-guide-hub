import { useImperativeHandle, forwardRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useBackgroundImports, BackgroundJob, ImportConfig } from "@/hooks/useBackgroundImports";
import { AdvancedImportDialog } from "./AdvancedImportDialog";
import { RefreshCw, CheckCircle, AlertCircle, Clock, Pause, Play, X, Trash2, Settings, TrendingUp, TrendingDown, Users } from "lucide-react";

interface BackgroundImportManagerProps {
  onJobUpdate?: (job: BackgroundJob) => void;
}

export interface BackgroundImportManagerRef {
  createBackgroundJob: (type: string, data: any, batchSize?: number) => Promise<string>;
}

const BackgroundImportManager = forwardRef<BackgroundImportManagerRef, BackgroundImportManagerProps>(
  ({ onJobUpdate }, ref) => {
    const {
      jobs,
      stats,
      loading,
      isPolling,
      supportedTypes,
      createImportJob,
      retryJob,
      pauseJob,
      resumeJob,
      cancelJob,
      cleanupOldJobs,
      togglePolling,
      refreshJobs
    } = useBackgroundImports();

    // Expose methods to parent component
    useImperativeHandle(ref, () => ({
      createBackgroundJob: createImportJob
    }));

    // Notify parent of job updates
    jobs.forEach(job => onJobUpdate?.(job));

    const getStatusIcon = (status: BackgroundJob['status']) => {
      switch (status) {
        case 'completed':
          return <CheckCircle className="h-4 w-4 text-foreground" />;
        case 'failed':
          return <AlertCircle className="h-4 w-4 text-destructive" />;
        case 'running':
          return <RefreshCw className="h-4 w-4 text-foreground animate-spin" />;
        case 'paused':
          return <Pause className="h-4 w-4 text-muted-foreground" />;
        case 'cancelled':
          return <X className="h-4 w-4 text-muted-foreground" />;
        default:
          return <Clock className="h-4 w-4 text-muted-foreground" />;
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
        case 'completed': return 'text-foreground';
        case 'failed': return 'text-destructive';
        case 'running': return 'text-foreground';
        case 'paused': return 'text-muted-foreground';
        case 'cancelled': return 'text-muted-foreground';
        default: return 'text-muted-foreground';
      }
    };

    return (
      <div className="space-y-6">
        {/* Enhanced Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-muted">
                  <Users className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Jobs</p>
                  <p className="text-xl font-bold">{stats.totalJobs}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-muted">
                  <TrendingUp className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Successful Items</p>
                  <p className="text-xl font-bold text-foreground">{stats.totalSuccessfulItems}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-muted">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Failed Items</p>
                  <p className="text-xl font-bold text-destructive">{stats.totalFailedItems}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-muted">
                  <AlertCircle className="h-4 w-4 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Duplicates</p>
                  <p className="text-xl font-bold text-warning">{stats.totalDuplicateItems}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  Background Import Jobs
                </CardTitle>
                <CardDescription>
                  Reliable, batched imports with duplicate detection and error handling
                </CardDescription>
                <div className="flex gap-4 mt-2 text-sm">
                  <span className="text-foreground">
                    Completed: <span className="font-medium">{stats.completedJobs}</span>
                  </span>
                  <span className="text-destructive">
                    Failed: <span className="font-medium">{stats.failedJobs}</span>
                  </span>
                  <span className="text-foreground">
                    Running: <span className="font-medium">{stats.runningJobs}</span>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cleanupOldJobs}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4" />
                  Cleanup
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={togglePolling}
                >
                  {isPolling ? 'Pause' : 'Resume'} Polling
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={refreshJobs}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No background jobs found. Start an import to see jobs here.</p>
                <p className="text-xs mt-2">
                  Supported types: {supportedTypes.slice(0, 5).join(', ')} and {supportedTypes.length - 5} more...
                </p>
              </div>
            ) : (
            <div className="space-y-4">
              {jobs.map(job => (
                <div key={job.id} className="rounded-lg p-4 space-y-3 bg-muted/30">
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
                          Retry ({job.retryCount}/{job.maxRetries})
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
                    <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                      <strong>Error:</strong> {job.errorDetails}
                      {job.retryCount > 0 && (
                        <div className="mt-1">
                          <strong>Retry attempts:</strong> {job.retryCount}/{job.maxRetries}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Timestamps */}
                  <div className="flex justify-between text-xs text-muted-foreground pt-2">
                    <span>Started: {job.createdAt.toLocaleString()}</span>
                    <span>Updated: {job.updatedAt.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

BackgroundImportManager.displayName = "BackgroundImportManager";

export default BackgroundImportManager;