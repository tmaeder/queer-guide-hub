import { useImperativeHandle, forwardRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Box, Typography } from "@mui/material";
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
          return <CheckCircle style={{ height: 16, width: 16, color: 'var(--foreground)' }} />;
        case 'failed':
          return <AlertCircle style={{ height: 16, width: 16, color: 'var(--destructive)' }} />;
        case 'running':
          return <RefreshCw style={{ height: 16, width: 16, color: 'var(--foreground)', animation: 'spin 1s linear infinite' }} />;
        case 'paused':
          return <Pause style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />;
        case 'cancelled':
          return <X style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />;
        default:
          return <Clock style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />;
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
        case 'completed': return 'var(--foreground)';
        case 'failed': return 'var(--destructive)';
        case 'running': return 'var(--foreground)';
        case 'paused': return 'var(--muted-foreground)';
        case 'cancelled': return 'var(--muted-foreground)';
        default: return 'var(--muted-foreground)';
      }
    };

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Enhanced Statistics Cards */}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' } }}>
          <Card>
            <CardContent style={{ padding: 16 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'var(--muted)' }}>
                  <Users style={{ height: 16, width: 16, color: 'var(--foreground)' }} />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>Total Jobs</Typography>
                  <Typography sx={{ fontSize: '1.25rem', fontWeight: 700 }}>{stats.totalJobs}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent style={{ padding: 16 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'var(--muted)' }}>
                  <TrendingUp style={{ height: 16, width: 16, color: 'var(--foreground)' }} />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>Successful Items</Typography>
                  <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--foreground)' }}>{stats.totalSuccessfulItems}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent style={{ padding: 16 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'var(--muted)' }}>
                  <TrendingDown style={{ height: 16, width: 16, color: 'var(--destructive)' }} />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>Failed Items</Typography>
                  <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--destructive)' }}>{stats.totalFailedItems}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent style={{ padding: 16 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'var(--muted)' }}>
                  <AlertCircle style={{ height: 16, width: 16, color: 'var(--warning)' }} />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>Duplicates</Typography>
                  <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--warning)' }}>{stats.totalDuplicateItems}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>

        <Card>
          <CardHeader>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RefreshCw style={{ height: 20, width: 20 }} />
                  Background Import Jobs
                </CardTitle>
                <CardDescription>
                  Reliable, batched imports with duplicate detection and error handling
                </CardDescription>
                <Box sx={{ display: 'flex', gap: 2, mt: 1, fontSize: '0.875rem' }}>
                  <Box component="span" sx={{ color: 'var(--foreground)' }}>
                    Completed: <Box component="span" sx={{ fontWeight: 500 }}>{stats.completedJobs}</Box>
                  </Box>
                  <Box component="span" sx={{ color: 'var(--destructive)' }}>
                    Failed: <Box component="span" sx={{ fontWeight: 500 }}>{stats.failedJobs}</Box>
                  </Box>
                  <Box component="span" sx={{ color: 'var(--foreground)' }}>
                    Running: <Box component="span" sx={{ fontWeight: 500 }}>{stats.runningJobs}</Box>
                  </Box>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cleanupOldJobs}
                  disabled={loading}
                >
                  <Trash2 style={{ height: 16, width: 16 }} />
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
                  <RefreshCw style={{ height: 16, width: 16, ...(loading ? { animation: 'spin 1s linear infinite' } : {}) }} />
                </Button>
              </Box>
            </Box>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4, color: 'var(--muted-foreground)' }}>
                <Typography>No background jobs found. Start an import to see jobs here.</Typography>
                <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
                  Supported types: {supportedTypes.slice(0, 5).join(', ')} and {supportedTypes.length - 5} more...
                </Typography>
              </Box>
            ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {jobs.map(job => (
                <Box key={job.id} sx={{ borderRadius: 2, p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, bgcolor: 'color-mix(in srgb, var(--muted) 30%, transparent)' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      {getStatusIcon(job.status)}
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box component="span" sx={{ fontWeight: 500 }}>{job.type}</Box>
                          {getStatusBadge(job.status)}
                        </Box>
                        <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>{job.message}</Typography>
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {job.status === 'running' && (
                        <Button variant="outline" size="sm" onClick={() => pauseJob(job.id)}>
                          <Pause style={{ height: 16, width: 16 }} />
                        </Button>
                      )}
                      {job.status === 'paused' && (
                        <Button variant="outline" size="sm" onClick={() => resumeJob(job.id)}>
                          <Play style={{ height: 16, width: 16 }} />
                        </Button>
                      )}
                      {job.status === 'failed' && job.retryCount < job.maxRetries && (
                        <Button variant="outline" size="sm" onClick={() => retryJob(job.id)}>
                          <RefreshCw style={{ height: 16, width: 16 }} />
                          Retry ({job.retryCount}/{job.maxRetries})
                        </Button>
                      )}
                      {['running', 'queued', 'paused'].includes(job.status) && (
                        <Button variant="outline" size="sm" onClick={() => cancelJob(job.id)}>
                          <X style={{ height: 16, width: 16 }} />
                        </Button>
                      )}
                    </Box>
                  </Box>

                  {/* Progress bars */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span>Overall Progress</span>
                      <Box component="span" sx={{ color: getStatusColor(job.status) }}>
                        {job.processedItems}/{job.totalItems} items
                      </Box>
                    </Box>
                    <Progress value={job.progress} style={{ height: 8 }} />

                    {job.totalBatches > 1 && (
                      <>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                          <span>Batch Progress</span>
                          <span>{job.currentBatch}/{job.totalBatches} batches</span>
                        </Box>
                        <Progress
                          value={(job.currentBatch / job.totalBatches) * 100}
                          style={{ height: 4 }}
                        />
                      </>
                    )}
                  </Box>

                  {/* Error details */}
                  {job.errorDetails && (
                    <Box sx={{ fontSize: '0.875rem', color: 'var(--destructive)', bgcolor: 'color-mix(in srgb, var(--destructive) 10%, transparent)', p: 1.5, borderRadius: 2 }}>
                      <strong>Error:</strong> {job.errorDetails}
                      {job.retryCount > 0 && (
                        <Box sx={{ mt: 0.5 }}>
                          <strong>Retry attempts:</strong> {job.retryCount}/{job.maxRetries}
                        </Box>
                      )}
                    </Box>
                  )}

                  {/* Timestamps */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--muted-foreground)', pt: 1 }}>
                    <span>Started: {job.createdAt.toLocaleString()}</span>
                    <span>Updated: {job.updatedAt.toLocaleString()}</span>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
});

BackgroundImportManager.displayName = "BackgroundImportManager";

export default BackgroundImportManager;
