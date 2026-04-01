import React, { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useImportHub, PipelineJob } from '@/hooks/useImportHub';
import {
  RefreshCw, Activity, CheckCircle, AlertTriangle, Clock,
  ArrowRight, Zap, Eye, Brain, GitMerge, Sparkles, Database, DollarSign
} from 'lucide-react';

const PIPELINE_STAGES = [
  { key: 'fetching', label: 'Fetching', icon: Zap, color: '#2563eb' },
  { key: 'ai_validation', label: 'AI Validation', icon: Brain, color: '#DB2777' },
  { key: 'dedup', label: 'Deduplication', icon: GitMerge, color: '#ca8a04' },
  { key: 'enrichment', label: 'Enrichment', icon: Sparkles, color: '#0891b2' },
  { key: 'review', label: 'Review', icon: Eye, color: '#ea580c' },
  { key: 'committing', label: 'Committing', icon: Database, color: '#16a34a' },
  { key: 'completed', label: 'Complete', icon: CheckCircle, color: '#16a34a' },
];

function getStageIndex(stage: string): number {
  return PIPELINE_STAGES.findIndex(s => s.key === stage);
}

function getStageProgress(stage: string): number {
  const idx = getStageIndex(stage);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / PIPELINE_STAGES.length) * 100);
}

export const PipelineMonitor = () => {
  const { fetchPipelineJobs } = useImportHub();

  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPipelineJobs();
      setJobs(data);
    } finally {
      setLoading(false);
    }
  }, [fetchPipelineJobs]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadJobs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadJobs]);

  const totalCost = jobs.reduce((sum, j) => sum + (j.ai_cost_usd || 0), 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        <Card>
          <CardContent sx={{ p: 2, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}>
              <Activity style={{ height: 20, width: 20, color: '#2563eb' }} />
              <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{jobs.length}</Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>Active Pipelines</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}>
              <CheckCircle style={{ height: 20, width: 20, color: '#16a34a' }} />
              <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                {jobs.reduce((sum, j) => sum + (j.items_committed || 0), 0)}
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>Items Committed</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}>
              <AlertTriangle style={{ height: 20, width: 20, color: '#ca8a04' }} />
              <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                {jobs.reduce((sum, j) => sum + (j.items_needs_review || 0), 0)}
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>Needs Review</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}>
              <DollarSign style={{ height: 20, width: 20, color: '#DB2777' }} />
              <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>${totalCost.toFixed(4)}</Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>AI Cost (USD)</Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Controls */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button
          variant={autoRefresh ? 'default' : 'outline'}
          size="sm"
          onClick={() => setAutoRefresh(!autoRefresh)}
          style={{ display: 'flex', gap: 8 }}
        >
          <RefreshCw style={{ height: 16, width: 16, ...(autoRefresh ? { animation: 'spin 2s linear infinite' } : {}) }} />
          {autoRefresh ? 'Auto-refresh On' : 'Auto-refresh Off'}
        </Button>
        <Button variant="outline" size="sm" onClick={loadJobs} disabled={loading} style={{ display: 'flex', gap: 8 }}>
          <RefreshCw style={{ height: 16, width: 16 }} />
          Refresh
        </Button>
      </Box>

      {/* Pipeline Jobs */}
      {jobs.length === 0 ? (
        <Card>
          <CardContent sx={{ p: 6, textAlign: 'center' }}>
            <Box sx={{ mx: 'auto', width: 96, height: 96, bgcolor: 'var(--muted)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
              <Activity style={{ height: 48, width: 48, color: 'var(--muted-foreground)' }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>No Active Pipelines</Typography>
            <Typography sx={{ color: 'var(--muted-foreground)' }}>
              Pipeline jobs appear here when data is being processed through the ingestion stages.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {jobs.map((job) => {
            const currentStageIdx = getStageIndex(job.pipeline_stage);
            const progress = getStageProgress(job.pipeline_stage);
            const totalProcessed = (job.items_ai_approved || 0) + (job.items_ai_rejected || 0) + (job.items_needs_review || 0);

            return (
              <Card key={job.id} style={{ backgroundColor: 'var(--card)' }}>
                <CardContent sx={{ p: 3 }}>
                  {/* Job Header */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <RefreshCw style={{ height: 18, width: 18, color: 'var(--primary)', animation: 'spin 2s linear infinite' }} />
                      <Typography sx={{ fontWeight: 600, fontSize: '1.1rem' }}>{job.type}</Typography>
                      <Badge variant="secondary">{job.source_type}</Badge>
                      <Badge variant="outline">{job.pipeline_stage}</Badge>
                    </Box>
                    <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                      Started {new Date(job.created_at).toLocaleString()}
                    </Typography>
                  </Box>

                  {/* Stage Visualization */}
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>Pipeline Progress</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{progress}%</Typography>
                    </Box>
                    <Progress value={progress} style={{ height: 8, marginBottom: 12 }} />

                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      {PIPELINE_STAGES.slice(0, -1).map((stage, idx) => {
                        const StageIcon = stage.icon;
                        const isActive = idx === currentStageIdx;
                        const isComplete = idx < currentStageIdx;
                        const isPending = idx > currentStageIdx;

                        return (
                          <React.Fragment key={stage.key}>
                            <Box sx={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
                              opacity: isPending ? 0.3 : 1,
                            }}>
                              <Box sx={{
                                p: 0.75, borderRadius: '50%',
                                bgcolor: isActive ? `${stage.color}20` : isComplete ? `${stage.color}10` : 'var(--muted)',
                                border: isActive ? `2px solid ${stage.color}` : '2px solid transparent',
                              }}>
                                <StageIcon style={{
                                  height: 16, width: 16,
                                  color: isComplete || isActive ? stage.color : 'var(--muted-foreground)',
                                  ...(isActive ? { animation: 'pulse 2s ease-in-out infinite' } : {}),
                                }} />
                              </Box>
                              <Typography sx={{
                                fontSize: '0.65rem',
                                fontWeight: isActive ? 700 : 400,
                                color: isActive ? stage.color : 'var(--muted-foreground)',
                              }}>
                                {stage.label}
                              </Typography>
                            </Box>
                            {idx < PIPELINE_STAGES.length - 2 && (
                              <ArrowRight style={{
                                height: 12, width: 12,
                                color: isComplete ? '#16a34a' : 'var(--muted-foreground)',
                                opacity: isPending ? 0.3 : 0.6,
                              }} />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </Box>
                  </Box>

                  {/* Item Counts */}
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, textAlign: 'center', pt: 1, borderTop: '1px solid var(--border)' }}>
                    <Box>
                      <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#2563eb' }}>{job.items_fetched || 0}</Typography>
                      <Typography sx={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>Fetched</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#16a34a' }}>{job.items_ai_approved || 0}</Typography>
                      <Typography sx={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>AI Approved</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#dc2626' }}>{job.items_ai_rejected || 0}</Typography>
                      <Typography sx={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>AI Rejected</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#ca8a04' }}>{job.items_needs_review || 0}</Typography>
                      <Typography sx={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>Needs Review</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#0891b2' }}>{job.items_deduplicated || 0}</Typography>
                      <Typography sx={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>Deduped</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#16a34a' }}>{job.items_committed || 0}</Typography>
                      <Typography sx={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>Committed</Typography>
                    </Box>
                  </Box>

                  {/* AI Cost */}
                  {(job.ai_cost_usd || 0) > 0 && (
                    <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                      <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                        AI Cost: ${(job.ai_cost_usd || 0).toFixed(4)}
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
