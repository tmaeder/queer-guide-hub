import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { useImportHub, ImportJob } from '@/hooks/useImportHub';
import {
  Upload,
  Database,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Eye,
  Download,
  X,
  FileText,
  Search,
  Activity,
  Package,
  Inbox,
  ArrowRight,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImportJobCreator } from './ImportJobCreator';
import { ValidationReport } from './ValidationReport';
import { VenueImportQuickActions } from './VenueImportQuickActions';
import { NewsSourcesManager } from './NewsSourcesManager';
import { ApiKeysManager } from './ApiKeysManager';
import { DuplicatesPanel } from './import-hub/DuplicatesPanel';
import { IngestionSourcesManager } from './IngestionSourcesManager';
import { PipelineMonitor } from './PipelineMonitor';
import { WebScrapersPanel } from './WebScrapersPanel';
import { ScrapeSourcesDashboard } from './ScrapeSourcesDashboard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useReviewCounts } from '@/hooks/useReviewCounts';

export const ImportHubDashboard = () => {
  const navigate = useNavigate();
  const {
    jobs,
    statistics,
    loading,
    cancelImportJob,
    refreshJobs: loadJobs,
    refreshStatistics: loadStatistics,
  } = useImportHub();
  const { data: reviewCounts } = useReviewCounts();

  const [showValidation, setShowValidation] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('jobs');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const getStatusIcon = (status: ImportJob['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle style={{ height: 16, width: 16, color: 'var(--success)' }} />;
      case 'failed':
        return <AlertTriangle style={{ height: 16, width: 16, color: 'var(--destructive)' }} />;
      case 'processing':
      case 'validating':
        return (
          <RefreshCw
            style={{
              height: 16,
              width: 16,
              color: 'var(--primary)',
              animation: 'spin 1s linear infinite',
            }}
          />
        );
      case 'cancelled':
        return <X style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />;
      default:
        return <Clock style={{ height: 16, width: 16, color: 'var(--warning)' }} />;
    }
  };

  const getStatusBadge = (status: ImportJob['status']) => {
    const variants = {
      completed: 'default',
      failed: 'destructive',
      processing: 'secondary',
      validating: 'secondary',
      cancelled: 'outline',
      pending: 'outline',
    } as const;
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
  };

  const exportValidationReport = (job: ImportJob) => {
    const reportData = {
      job_id: job.id,
      type: job.type,
      status: job.status,
      validation_report: job.validation_report,
      error_report: job.error_report,
      statistics: {
        total_records: job.total_records,
        valid_records: job.valid_records,
        invalid_records: job.invalid_records,
        successful_records: job.successful_records,
        failed_records: job.failed_records,
        duplicate_records: job.duplicate_records,
      },
      created_at: job.created_at,
      completed_at: job.completed_at,
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-report-${job.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredJobs = useMemo(
    () =>
      jobs.filter((job) => {
        const matchesSearch =
          !searchQuery ||
          job.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
          job.file_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          job.id.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [jobs, searchQuery, statusFilter],
  );

  const activeJobs = useMemo(
    () => jobs.filter((job) => ['pending', 'validating', 'processing'].includes(job.status)),
    [jobs],
  );

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', px: 2, py: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ p: 1, bgcolor: 'primary.main', borderRadius: 1 }}>
            <Database style={{ height: 24, width: 24, color: 'var(--primary-foreground)' }} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Data Hub
          </Typography>
        </Box>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            loadJobs();
            loadStatistics();
          }}
          disabled={loading}
          style={{ display: 'flex', gap: 6 }}
        >
          <RefreshCw
            style={{
              height: 14,
              width: 14,
              ...(loading ? { animation: 'spin 1s linear infinite' } : {}),
            }}
          />
          Refresh
        </Button>
      </Box>

      {/* Stats row */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
          gap: 1.5,
          mb: 3,
        }}
      >
        <Card>
          <CardContent sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CheckCircle style={{ height: 18, width: 18, color: '#16a34a', flexShrink: 0 }} />
            <Box>
              <Typography sx={{ fontWeight: 700, lineHeight: 1 }}>
                {statistics?.completed_jobs ?? 0}
              </Typography>
              <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                Completed
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <AlertTriangle style={{ height: 18, width: 18, color: '#dc2626', flexShrink: 0 }} />
            <Box>
              <Typography sx={{ fontWeight: 700, lineHeight: 1 }}>
                {statistics?.failed_jobs ?? 0}
              </Typography>
              <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                Failed
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Package style={{ height: 18, width: 18, color: '#2563eb', flexShrink: 0 }} />
            <Box>
              <Typography sx={{ fontWeight: 700, lineHeight: 1 }}>
                {statistics?.total_records_processed?.toLocaleString() ?? 0}
              </Typography>
              <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                Records
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <Card
          onClick={() => navigate('/admin/review')}
          style={{
            cursor: 'pointer',
            borderColor: '#ea580c',
            borderWidth: 2,
          }}
        >
          <CardContent sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Inbox style={{ height: 18, width: 18, color: '#ea580c', flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, lineHeight: 1, color: '#ea580c' }}>
                {reviewCounts?.staging ?? statistics?.items_pending_review ?? 0}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" sx={{ color: '#ea580c', fontWeight: 600 }}>
                  Review Queue
                </Typography>
                <ArrowRight style={{ height: 10, width: 10, color: '#ea580c' }} />
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList style={{ backgroundColor: 'var(--card)', marginBottom: 24 }}>
          <TabsTrigger value="jobs">
            Jobs {activeJobs.length > 0 && `(${activeJobs.length} active)`}
          </TabsTrigger>
          <TabsTrigger value="create">New Import</TabsTrigger>
          <TabsTrigger value="scraping">Scraping</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>

        {/* ── Jobs: active + history ── */}
        <TabsContent value="jobs" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Active jobs banner */}
          {activeJobs.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 600,
                  color: 'var(--muted-foreground)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontSize: '0.75rem',
                }}
              >
                Active — {activeJobs.length} running
              </Typography>
              {activeJobs.map((job) => (
                <Card key={job.id}>
                  <CardContent sx={{ p: 3 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mb: 2,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        {getStatusIcon(job.status)}
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography component="span" sx={{ fontWeight: 600 }}>
                              {job.type}
                            </Typography>
                            {getStatusBadge(job.status)}
                          </Box>
                          {job.file_name && (
                            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                              {job.file_name}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowValidation(job.id)}
                          style={{ display: 'flex', gap: 6 }}
                        >
                          <Eye style={{ height: 14, width: 14 }} /> Details
                        </Button>
                        {['pending', 'validating', 'processing'].includes(job.status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => cancelImportJob(job.id)}
                            style={{ display: 'flex', gap: 6, color: 'var(--destructive)' }}
                          >
                            <X style={{ height: 14, width: 14 }} /> Cancel
                          </Button>
                        )}
                      </Box>
                    </Box>

                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mb: 1,
                        fontSize: '0.875rem',
                      }}
                    >
                      <Typography component="span" sx={{ fontWeight: 500 }}>
                        {job.processed_records ?? 0} / {job.total_records ?? 0} records
                      </Typography>
                      <Typography component="span" sx={{ fontWeight: 700 }}>
                        {Math.min(100, Math.max(0, job.progress_percentage || 0))}%
                      </Typography>
                    </Box>
                    <Progress
                      value={Math.min(100, Math.max(0, job.progress_percentage || 0))}
                      style={{ height: 8 }}
                    />

                    {job.duplicate_records > 0 && (
                      <Alert style={{ marginTop: 12 }}>
                        <AlertTriangle style={{ height: 14, width: 14 }} />
                        <AlertDescription>
                          {job.duplicate_records} duplicates — strategy: {job.duplicate_strategy}
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}

          {/* Search + filter */}
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <Box sx={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  height: 14,
                  width: 14,
                  color: 'var(--muted-foreground)',
                }}
                aria-hidden="true"
              />
              <Input
                placeholder="Search by type, filename, or ID…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 34 }}
                aria-label="Search import jobs"
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {(['all', 'pending', 'processing', 'completed', 'failed'] as const).map((s) => (
                <Button
                  key={s}
                  variant={statusFilter === s ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(s)}
                >
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </Button>
              ))}
            </Box>
          </Box>

          {/* History list */}
          {filteredJobs.length === 0 ? (
            <Card>
              <CardContent sx={{ p: 6, textAlign: 'center' }}>
                <Package style={{ height: 40, width: 40, margin: '0 auto 12px', opacity: 0.4 }} />
                <Typography sx={{ fontWeight: 500, mb: 0.5 }}>
                  {searchQuery || statusFilter !== 'all' ? 'No matching jobs' : 'No imports yet'}
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--muted-foreground)', mb: 2 }}>
                  {searchQuery || statusFilter !== 'all'
                    ? 'Try adjusting your search or filter'
                    : 'Create your first import to get started'}
                </Typography>
                {!searchQuery && statusFilter === 'all' && (
                  <Button
                    onClick={() => setActiveTab('create')}
                    style={{ display: 'flex', gap: 6 }}
                  >
                    <Upload style={{ height: 14, width: 14 }} /> New Import
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {filteredJobs.map((job) => (
                <Card key={job.id}>
                  <CardContent sx={{ p: 3 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        {getStatusIcon(job.status)}
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                            <Typography component="span" sx={{ fontWeight: 600 }}>
                              {job.type}
                            </Typography>
                            {getStatusBadge(job.status)}
                            {job.source_type && (
                              <Badge variant="outline" style={{ fontSize: '0.7rem' }}>
                                {job.source_type}
                              </Badge>
                            )}
                          </Box>
                          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                              {new Date(job.created_at).toLocaleString()}
                            </Typography>
                            {job.file_name && (
                              <Typography
                                variant="caption"
                                sx={{ color: 'var(--muted-foreground)' }}
                              >
                                {job.file_name}
                                {job.file_size ? ` (${formatFileSize(job.file_size)})` : ''}
                              </Typography>
                            )}
                            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                              {job.successful_records ?? 0}/{job.total_records ?? 0} ok
                              {job.failed_records > 0 && ` · ${job.failed_records} failed`}
                              {job.duplicate_records > 0 && ` · ${job.duplicate_records} dupes`}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowValidation(job.id)}
                          style={{ display: 'flex', gap: 6 }}
                        >
                          <Eye style={{ height: 14, width: 14 }} /> Report
                        </Button>
                        {job.status === 'completed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => exportValidationReport(job)}
                            style={{ display: 'flex', gap: 6 }}
                          >
                            <Download style={{ height: 14, width: 14 }} />
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </TabsContent>

        {/* ── New Import ── */}
        <TabsContent value="create">
          <ImportJobCreator />
        </TabsContent>

        {/* ── Scraping: Node.js scrapers + DB-based scrape sources ── */}
        <TabsContent value="scraping" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <WebScrapersPanel />
          <ScrapeSourcesDashboard />
        </TabsContent>

        {/* ── Sources: ingestion sources + venues + news + API keys ── */}
        <TabsContent value="sources" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <IngestionSourcesManager />
          <VenueImportQuickActions />
          <NewsSourcesManager />
          <ApiKeysManager />
        </TabsContent>

        {/* ── Tools: pipeline + duplicates ── */}
        <TabsContent value="tools" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <PipelineMonitor />
          <DuplicatesPanel />
        </TabsContent>
      </Tabs>

      {showValidation && (
        <ValidationReport jobId={showValidation} onClose={() => setShowValidation(null)} />
      )}
    </Box>
  );
};
