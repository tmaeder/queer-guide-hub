import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useImportHub, ImportJob } from '@/hooks/useImportHub';
import { 
  Upload, Database, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, 
  Clock, RefreshCw, Eye, Download, Trash2, X, Play, Pause, Settings,
  FileText, Filter, Search
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImportJobCreator } from './ImportJobCreator';
import { ValidationReport } from './ValidationReport';
import { ImportFilters } from './ImportFilters';

export const ImportHubDashboard = () => {
  const {
    jobs,
    statistics,
    loading,
    isPolling,
    cancelImportJob,
    togglePolling,
    refreshJobs,
    refreshStatistics
  } = useImportHub();

  const [selectedJob, setSelectedJob] = useState<ImportJob | null>(null);
  const [showValidation, setShowValidation] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const getStatusIcon = (status: ImportJob['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'failed':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'processing':
      case 'validating':
        return <RefreshCw className="h-4 w-4 text-primary animate-spin" />;
      case 'cancelled':
        return <X className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Clock className="h-4 w-4 text-warning" />;
    }
  };

  const getStatusBadge = (status: ImportJob['status']) => {
    const variants = {
      completed: 'default',
      failed: 'destructive',
      processing: 'secondary',
      validating: 'secondary',
      cancelled: 'outline',
      pending: 'outline'
    } as const;
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  const getPhaseDescription = (phase: ImportJob['phase']) => {
    switch (phase) {
      case 'queued': return 'Waiting in queue';
      case 'pre_validation': return 'Validating data structure';
      case 'processing': return 'Importing records';
      case 'post_validation': return 'Verifying results';
      case 'cleanup': return 'Cleaning up resources';
      default: return phase;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
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
        duplicate_records: job.duplicate_records
      },
      created_at: job.created_at,
      completed_at: job.completed_at
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { 
      type: 'application/json' 
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

  return (
    <div className="w-full min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary rounded-lg">
                <Database className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Import Hub</h1>
                <p className="text-muted-foreground">
                  Secure, robust data import with advanced validation and controls
                </p>
              </div>
            </div>
            
            {/* Statistics Cards */}
            <div className="grid grid-cols-4 gap-4 text-center">
              <div className="bg-success/10 p-3 rounded-lg border border-success/20">
                <div className="text-2xl font-bold text-success">{statistics.completed_jobs}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
              <div className="bg-destructive/10 p-3 rounded-lg border border-destructive/20">
                <div className="text-2xl font-bold text-destructive">{statistics.failed_jobs}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
              <div className="bg-warning/10 p-3 rounded-lg border border-warning/20">
                <div className="text-2xl font-bold text-warning">{statistics.pending_jobs}</div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
              <div className="bg-primary/10 p-3 rounded-lg border border-primary/20">
                <div className="text-2xl font-bold text-primary">{statistics.total_jobs}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={togglePolling}
                className="gap-2"
              >
                {isPolling ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isPolling ? 'Pause' : 'Resume'} Auto-refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  refreshJobs();
                  refreshStatistics();
                }}
                disabled={loading}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="active" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Active Jobs
            </TabsTrigger>
            <TabsTrigger value="create" className="gap-2">
              <Upload className="h-4 w-4" />
              Create Import
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <FileText className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Enhanced Statistics */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-success/10">
                      <TrendingUp className="h-4 w-4 text-success" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Success Rate</p>
                      <p className="text-xl font-bold">
                        {statistics.total_jobs > 0 
                          ? Math.round((statistics.completed_jobs / statistics.total_jobs) * 100)
                          : 0}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Database className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Records Processed</p>
                      <p className="text-xl font-bold">{statistics.total_records_processed.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-warning/10">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Duplicates Found</p>
                      <p className="text-xl font-bold">{statistics.total_duplicate_records.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-destructive/10">
                      <TrendingDown className="h-4 w-4 text-destructive" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Failed Records</p>
                      <p className="text-xl font-bold">{statistics.total_failed_records.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Jobs Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest import jobs and their status</CardDescription>
              </CardHeader>
              <CardContent>
                {jobs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No import jobs found</p>
                    <p className="text-sm">Create your first import to get started</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {jobs.slice(0, 5).map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => setSelectedJob(job)}
                      >
                        <div className="flex items-center gap-3">
                          {getStatusIcon(job.status)}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{job.type}</span>
                              {getStatusBadge(job.status)}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {getPhaseDescription(job.phase)}
                            </p>
                          </div>
                        </div>
                        
                        <div className="text-right text-sm">
                          <p className="font-medium">
                            {job.processed_records}/{job.total_records} records
                          </p>
                          <p className="text-muted-foreground">
                            {new Date(job.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="active" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Active Import Jobs</CardTitle>
                <CardDescription>Jobs currently processing or queued</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {jobs.filter(job => ['pending', 'validating', 'processing'].includes(job.status)).map((job) => (
                    <div key={job.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(job.status)}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{job.type}</span>
                              {getStatusBadge(job.status)}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {getPhaseDescription(job.phase)}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowValidation(job.id)}
                            className="gap-2"
                          >
                            <Eye className="h-4 w-4" />
                            View Details
                          </Button>
                          {['pending', 'validating', 'processing'].includes(job.status) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => cancelImportJob(job.id)}
                              className="gap-2"
                            >
                              <X className="h-4 w-4" />
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {/* Progress */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Progress</span>
                          <span>{job.progress_percentage}%</span>
                        </div>
                        <Progress value={job.progress_percentage} className="h-2" />
                        
                        <div className="grid grid-cols-4 gap-4 text-sm text-muted-foreground mt-3">
                          <div>Total: {job.total_records}</div>
                          <div>Processed: {job.processed_records}</div>
                          <div>Success: {job.successful_records}</div>
                          <div>Failed: {job.failed_records}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="create" className="space-y-6">
            <ImportJobCreator />
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Import History</CardTitle>
                    <CardDescription>Complete history of all import jobs</CardDescription>
                  </div>
                  <ImportFilters />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {jobs.map((job) => (
                    <div key={job.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(job.status)}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{job.type}</span>
                              {getStatusBadge(job.status)}
                              {job.source_type && (
                                <Badge variant="outline">{job.source_type}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                              <span>Created: {new Date(job.created_at).toLocaleString()}</span>
                              {job.file_name && <span>File: {job.file_name}</span>}
                              {job.file_size && <span>Size: {formatFileSize(job.file_size)}</span>}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowValidation(job.id)}
                            className="gap-2"
                          >
                            <Eye className="h-4 w-4" />
                            Details
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => exportValidationReport(job)}
                            className="gap-2"
                          >
                            <Download className="h-4 w-4" />
                            Export
                          </Button>
                        </div>
                      </div>
                      
                      {/* Statistics */}
                      <div className="grid grid-cols-6 gap-4 mt-3 text-sm">
                        <div className="text-center">
                          <div className="font-medium">{job.total_records}</div>
                          <div className="text-muted-foreground">Total</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium text-success">{job.successful_records}</div>
                          <div className="text-muted-foreground">Success</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium text-destructive">{job.failed_records}</div>
                          <div className="text-muted-foreground">Failed</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium text-warning">{job.duplicate_records}</div>
                          <div className="text-muted-foreground">Duplicates</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">{job.duplicate_strategy}</div>
                          <div className="text-muted-foreground">Strategy</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">{job.progress_percentage}%</div>
                          <div className="text-muted-foreground">Progress</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Validation Report Modal */}
        {showValidation && (
          <ValidationReport
            jobId={showValidation}
            onClose={() => setShowValidation(null)}
          />
        )}
      </div>
    </div>
  );
};