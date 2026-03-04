import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { useImportHub, ImportJob } from '@/hooks/useImportHub';
import {
  Upload,
  Database,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Eye,
  Download,
  X,
  Play,
  Pause,
  FileText,
  Search,
  BarChart3,
  Activity,
  Zap,
  Package,
  MapPin,
  Rss,
  Key,
  Inbox,
  GitMerge,
  Settings,
  ArrowRight,
  Shield,
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useReviewCounts } from '@/hooks/useReviewCounts';

export const ImportHubDashboard = () => {
  const navigate = useNavigate();
  const {
    jobs,
    statistics,
    loading,
    isPolling,
    cancelImportJob,
    togglePolling,
    refreshJobs: loadJobs,
    refreshStatistics: loadStatistics,
  } = useImportHub();
  const { data: reviewCounts } = useReviewCounts();

  const [showValidation, setShowValidation] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
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

    const blob = new Blob([JSON.stringify(reportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-report-${job.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filter jobs based on search and status (memoized)
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

  // Get active jobs for the active tab
  const activeJobs = useMemo(
    () =>
      filteredJobs.filter((job) => ['pending', 'validating', 'processing'].includes(job.status)),
    [filteredJobs],
  );

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', px: 2, py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Box sx={{ p: 1.5, bgcolor: 'primary.main', borderRadius: 1.5 }}>
            <Database style={{ height: 32, width: 32, color: 'var(--primary-foreground)' }} />
          </Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: 'var(--foreground)' }}>
              Import Hub
            </Typography>
            <Typography sx={{ color: 'var(--muted-foreground)' }}>
              Enterprise-grade data import with AI-powered validation
            </Typography>
          </Box>
        </Box>

        {/* Statistics Grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(5, 1fr)' },
            gap: 2,
            mb: 3,
          }}
        >
          <Card>
            <CardContent sx={{ p: 2, textAlign: 'center' }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  mb: 1,
                }}
              >
                <CheckCircle style={{ height: 20, width: 20, color: '#16a34a' }} />
                <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {statistics?.completed_jobs || 0}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                Completed Jobs
              </Typography>
            </CardContent>
          </Card>

          <Card>
            <CardContent sx={{ p: 2, textAlign: 'center' }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  mb: 1,
                }}
              >
                <AlertTriangle style={{ height: 20, width: 20, color: '#dc2626' }} />
                <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {statistics?.failed_jobs || 0}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                Failed Jobs
              </Typography>
            </CardContent>
          </Card>

          <Card>
            <CardContent sx={{ p: 2, textAlign: 'center' }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  mb: 1,
                }}
              >
                <Clock style={{ height: 20, width: 20, color: '#ca8a04' }} />
                <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {statistics?.pending_jobs || 0}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                Pending Jobs
              </Typography>
            </CardContent>
          </Card>

          <Card>
            <CardContent sx={{ p: 2, textAlign: 'center' }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  mb: 1,
                }}
              >
                <Package style={{ height: 20, width: 20, color: '#2563eb' }} />
                <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {statistics?.total_records_processed?.toLocaleString() || 0}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                Records Processed
              </Typography>
            </CardContent>
          </Card>

          <Card
            onClick={() => navigate('/admin/review')}
            style={{
              cursor: 'pointer',
              borderColor: '#ea580c',
              borderWidth: 2,
              transition: 'box-shadow 0.15s',
            }}
          >
            <CardContent sx={{ p: 2, textAlign: 'center' }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  mb: 1,
                }}
              >
                <Inbox style={{ height: 20, width: 20, color: '#ea580c' }} />
                <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {reviewCounts?.staging ?? statistics?.items_pending_review ?? 0}
                </Typography>
              </Box>
              <Box
                sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}
              >
                <Typography variant="caption" sx={{ color: '#ea580c', fontWeight: 600 }}>
                  Review Queue
                </Typography>
                <ArrowRight style={{ height: 12, width: 12, color: '#ea580c' }} />
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            variant="outline"
            size="sm"
            onClick={togglePolling}
            style={{ display: 'flex', gap: 8 }}
          >
            {isPolling ? (
              <Pause style={{ height: 16, width: 16 }} />
            ) : (
              <Play style={{ height: 16, width: 16 }} />
            )}
            {isPolling ? 'Pause' : 'Resume'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadJobs();
              loadStatistics();
            }}
            disabled={loading}
            style={{ display: 'flex', gap: 8 }}
          >
            <RefreshCw
              style={{
                height: 16,
                width: 16,
                ...(loading ? { animation: 'spin 1s linear infinite' } : {}),
              }}
            />
            Refresh
          </Button>
        </Box>
      </Box>
      {/* Search and Filter Bar */}
      <Card style={{ marginBottom: 24, backgroundColor: 'var(--card)' }}>
        <CardContent sx={{ p: 2 }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 2,
              alignItems: 'center',
            }}
          >
            <Box sx={{ position: 'relative', flex: 1 }}>
              <Search
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  height: 16,
                  width: 16,
                  color: 'var(--muted-foreground)',
                }}
                aria-hidden="true"
              />
              <Input
                placeholder="Search jobs by type, filename, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 40, backgroundColor: 'var(--background)' }}
                aria-label="Search import jobs"
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('all')}
              >
                All
              </Button>
              <Button
                variant={statusFilter === 'pending' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('pending')}
              >
                Pending
              </Button>
              <Button
                variant={statusFilter === 'processing' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('processing')}
              >
                Processing
              </Button>
              <Button
                variant={statusFilter === 'completed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('completed')}
              >
                Completed
              </Button>
              <Button
                variant={statusFilter === 'failed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('failed')}
              >
                Failed
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
      >
        <TabsList style={{ backgroundColor: 'var(--card)' }}>
          <TabsTrigger value="overview">Analytics</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicates</TabsTrigger>
          <TabsTrigger value="create">Create Import</TabsTrigger>
          <TabsTrigger value="venues">Venues</TabsTrigger>
          <TabsTrigger value="news">News Sources</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="active">Active ({activeJobs.length})</TabsTrigger>
          <TabsTrigger value="history">History ({filteredJobs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity style={{ height: 20, width: 20 }} />
                Recent Activity
              </CardTitle>
              <CardDescription>Latest import jobs overview</CardDescription>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4, color: 'var(--muted-foreground)' }}>
                  <Package style={{ height: 48, width: 48, margin: '0 auto 16px', opacity: 0.5 }} />
                  <Typography sx={{ fontWeight: 500 }}>No import jobs yet</Typography>
                  <Typography variant="body2">Create your first import to get started</Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {jobs.slice(0, 5).map((job) => (
                    <Box
                      key={job.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        p: 1.5,
                        bgcolor: 'var(--card)',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        '&:hover': { bgcolor: 'var(--muted)' },
                      }}
                      onClick={() => setShowValidation(job.id)}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        {getStatusIcon(job.status)}
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography
                              component="span"
                              sx={{ fontWeight: 500, fontSize: '0.875rem' }}
                            >
                              {job.type}
                            </Typography>
                            {getStatusBadge(job.status)}
                          </Box>
                          <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                            {job.processed_records || 0}/{job.total_records || 0} records •{' '}
                            {new Date(job.created_at).toLocaleDateString()}
                          </Typography>
                        </Box>
                      </Box>

                      <Box sx={{ textAlign: 'right' }}>
                        <Progress
                          value={Math.min(100, Math.max(0, job.progress_percentage || 0))}
                          style={{ width: 64, height: 8, marginBottom: 4 }}
                        />
                        <Typography
                          component="span"
                          variant="caption"
                          sx={{ color: 'var(--muted-foreground)' }}
                        >
                          {Math.min(100, Math.max(0, job.progress_percentage || 0))}%
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <IngestionSourcesManager />
        </TabsContent>

        <TabsContent value="pipeline" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <PipelineMonitor />
        </TabsContent>

        <TabsContent
          value="duplicates"
          style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
        >
          <DuplicatesPanel />
        </TabsContent>

        <TabsContent value="venues" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <VenueImportQuickActions />
        </TabsContent>

        <TabsContent value="news" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <NewsSourcesManager />
        </TabsContent>

        <TabsContent value="api-keys" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <ApiKeysManager />
        </TabsContent>

        <TabsContent value="active" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {activeJobs.length === 0 ? (
            <Card>
              <CardContent sx={{ p: 6, textAlign: 'center' }}>
                <Box
                  sx={{
                    mx: 'auto',
                    width: 96,
                    height: 96,
                    bgcolor: 'var(--muted)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mb: 2,
                  }}
                >
                  <Activity style={{ height: 48, width: 48, color: 'var(--muted-foreground)' }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                  No Active Jobs
                </Typography>
                <Typography sx={{ color: 'var(--muted-foreground)', mb: 2 }}>
                  All import jobs have completed. Start a new import to see active jobs here.
                </Typography>
                <Button onClick={() => setActiveTab('create')} style={{ display: 'flex', gap: 8 }}>
                  <Upload style={{ height: 16, width: 16 }} />
                  Create New Import
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {activeJobs.map((job) => (
                <Card key={job.id} style={{ backgroundColor: 'var(--card)' }}>
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
                            <Typography
                              component="span"
                              sx={{ fontWeight: 600, fontSize: '1.125rem' }}
                            >
                              {job.type}
                            </Typography>
                            {getStatusBadge(job.status)}
                          </Box>
                          {job.file_name && (
                            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                              File: {job.file_name}
                            </Typography>
                          )}
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowValidation(job.id)}
                          style={{ display: 'flex', gap: 8 }}
                        >
                          <Eye style={{ height: 16, width: 16 }} />
                          Details
                        </Button>
                        {['pending', 'validating', 'processing'].includes(job.status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => cancelImportJob(job.id)}
                            style={{ display: 'flex', gap: 8, color: 'var(--destructive)' }}
                          >
                            <X style={{ height: 16, width: 16 }} />
                            Cancel
                          </Button>
                        )}
                      </Box>
                    </Box>

                    {/* Progress Display */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '0.875rem',
                        }}
                      >
                        <Typography component="span" sx={{ fontWeight: 500 }}>
                          Overall Progress
                        </Typography>
                        <Typography component="span" sx={{ fontWeight: 700 }}>
                          {Math.min(100, Math.max(0, job.progress_percentage || 0))}%
                        </Typography>
                      </Box>
                      <Progress
                        value={Math.min(100, Math.max(0, job.progress_percentage || 0))}
                        style={{ height: 12 }}
                      />

                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
                          gap: 2,
                          pt: 2,
                        }}
                      >
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography
                            sx={{ fontSize: '1.125rem', fontWeight: 700, color: 'primary.main' }}
                          >
                            {job.total_records}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                            Total Records
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography
                            sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#2563eb' }}
                          >
                            {job.processed_records}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                            Processed
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography
                            sx={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--success)' }}
                          >
                            {job.successful_records}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                            Successful
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography
                            sx={{
                              fontSize: '1.125rem',
                              fontWeight: 700,
                              color: 'var(--destructive)',
                            }}
                          >
                            {job.failed_records}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                            Failed
                          </Typography>
                        </Box>
                      </Box>

                      {job.duplicate_records > 0 && (
                        <Alert>
                          <AlertTriangle style={{ height: 16, width: 16 }} />
                          <AlertDescription>
                            Found {job.duplicate_records} duplicate records using{' '}
                            {job.duplicate_strategy} strategy
                          </AlertDescription>
                        </Alert>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </TabsContent>

        <TabsContent value="create" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <ImportJobCreator />
        </TabsContent>

        <TabsContent value="history" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card>
            <CardHeader>
              <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText style={{ height: 20, width: 20 }} />
                Import History
              </CardTitle>
              <CardDescription>Complete history of all import jobs</CardDescription>
            </CardHeader>
            <CardContent>
              {filteredJobs.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <Box
                    sx={{
                      mx: 'auto',
                      width: 96,
                      height: 96,
                      bgcolor: 'var(--muted)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mb: 2,
                    }}
                  >
                    <Search style={{ height: 48, width: 48, color: 'var(--muted-foreground)' }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                    No jobs found
                  </Typography>
                  <Typography sx={{ color: 'var(--muted-foreground)', mb: 2 }}>
                    {searchQuery || statusFilter !== 'all'
                      ? 'Try adjusting your search criteria or filters'
                      : 'No import jobs have been created yet'}
                  </Typography>
                  {!searchQuery && statusFilter === 'all' && (
                    <Button
                      onClick={() => setActiveTab('create')}
                      style={{ display: 'flex', gap: 8 }}
                    >
                      <Upload style={{ height: 16, width: 16 }} />
                      Create First Import
                    </Button>
                  )}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {filteredJobs.map((job) => (
                    <Card
                      key={job.id}
                      style={{
                        backgroundColor: 'var(--card)',
                        transition: 'background-color 0.2s',
                      }}
                    >
                      <CardContent sx={{ p: 3 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            mb: 2,
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            {getStatusIcon(job.status)}
                            <Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                <Typography
                                  component="span"
                                  sx={{ fontWeight: 600, fontSize: '1.125rem' }}
                                >
                                  {job.type}
                                </Typography>
                                {getStatusBadge(job.status)}
                                {job.source_type && (
                                  <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                                    {job.source_type}
                                  </Badge>
                                )}
                              </Box>
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 2,
                                  fontSize: '0.875rem',
                                  color: 'var(--muted-foreground)',
                                }}
                              >
                                <Typography component="span" variant="body2" color="text.secondary">
                                  Created: {new Date(job.created_at).toLocaleString()}
                                </Typography>
                                {job.completed_at && (
                                  <Typography
                                    component="span"
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    Completed: {new Date(job.completed_at).toLocaleString()}
                                  </Typography>
                                )}
                                {job.file_name && (
                                  <Typography
                                    component="span"
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    File: {job.file_name}
                                  </Typography>
                                )}
                                {job.file_size && (
                                  <Typography
                                    component="span"
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    Size: {formatFileSize(job.file_size)}
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                          </Box>

                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowValidation(job.id)}
                              style={{ display: 'flex', gap: 8 }}
                            >
                              <Eye style={{ height: 16, width: 16 }} />
                              View Report
                            </Button>
                            {job.status === 'completed' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => exportValidationReport(job)}
                                style={{ display: 'flex', gap: 8 }}
                              >
                                <Download style={{ height: 16, width: 16 }} />
                                Export
                              </Button>
                            )}
                          </Box>
                        </Box>

                        {/* Statistics Grid */}
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' },
                            gap: 2,
                            pt: 2,
                            textAlign: 'center',
                          }}
                        >
                          <Box>
                            <Typography
                              sx={{ fontSize: '1.125rem', fontWeight: 700, color: 'primary.main' }}
                            >
                              {job.total_records}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                              Total
                            </Typography>
                          </Box>
                          <Box>
                            <Typography
                              sx={{
                                fontSize: '1.125rem',
                                fontWeight: 700,
                                color: 'var(--success)',
                              }}
                            >
                              {job.successful_records}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                              Success
                            </Typography>
                          </Box>
                          <Box>
                            <Typography
                              sx={{
                                fontSize: '1.125rem',
                                fontWeight: 700,
                                color: 'var(--destructive)',
                              }}
                            >
                              {job.failed_records}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                              Failed
                            </Typography>
                          </Box>
                          <Box>
                            <Typography
                              sx={{
                                fontSize: '1.125rem',
                                fontWeight: 700,
                                color: 'var(--warning)',
                              }}
                            >
                              {job.duplicate_records}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                              Duplicates
                            </Typography>
                          </Box>
                          <Box>
                            <Typography sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                              {job.duplicate_strategy || 'N/A'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                              Strategy
                            </Typography>
                          </Box>
                          <Box>
                            <Typography sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                              {job.progress_percentage}%
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                              Progress
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Validation Report Modal */}
      {showValidation && (
        <ValidationReport jobId={showValidation} onClose={() => setShowValidation(null)} />
      )}
    </Box>
  );
};
