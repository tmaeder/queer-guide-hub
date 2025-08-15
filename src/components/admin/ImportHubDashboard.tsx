import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useImportHub, ImportJob } from '@/hooks/useImportHub';
import { 
  Upload, Database, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, 
  Clock, RefreshCw, Eye, Download, Trash2, X, Play, Pause, Settings,
  FileText, Filter, Search, BarChart3, Activity, Zap, Package, Users
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImportJobCreator } from './ImportJobCreator';
import { ValidationReport } from './ValidationReport';
import { ImportFilters } from './ImportFilters';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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

  // Filter jobs based on search and status
  const filteredJobs = jobs.filter(job => {
    const matchesSearch = !searchQuery || 
      job.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.file_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.id.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Get active jobs for the active tab
  const activeJobs = filteredJobs.filter(job => 
    ['pending', 'validating', 'processing'].includes(job.status)
  );

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Enhanced Header */}
      <div className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Title Section */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="p-3 bg-gradient-to-br from-primary to-primary/80 rounded-xl shadow-lg">
                  <Database className="h-8 w-8 text-primary-foreground" />
                </div>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-success rounded-full border-2 border-background animate-pulse" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  Import Hub
                </h1>
                <p className="text-muted-foreground text-lg">
                  Enterprise-grade data import with AI-powered validation
                </p>
              </div>
            </div>
            
            {/* Statistics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-success" />
                    <span className="text-2xl font-bold text-success">{statistics.completed_jobs}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Completed Jobs</p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20">
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <span className="text-2xl font-bold text-destructive">{statistics.failed_jobs}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Failed Jobs</p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Clock className="h-5 w-5 text-warning" />
                    <span className="text-2xl font-bold text-warning">{statistics.pending_jobs}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Pending Jobs</p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Package className="h-5 w-5 text-primary" />
                    <span className="text-2xl font-bold text-primary">{statistics.total_records_processed.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Records Processed</p>
                </CardContent>
              </Card>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={togglePolling}
                className="gap-2 bg-background/50 backdrop-blur-sm"
              >
                {isPolling ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isPolling ? 'Pause' : 'Resume'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  refreshJobs();
                  refreshStatistics();
                }}
                disabled={loading}
                className="gap-2 bg-background/50 backdrop-blur-sm"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-6">
        {/* Search and Filter Bar */}
        <Card className="mb-6 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search jobs by type, filename, or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-background/50"
                />
              </div>
              <div className="flex gap-2">
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
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-card/50 backdrop-blur-sm">
            <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-background">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="active" className="gap-2 data-[state=active]:bg-background">
              <Activity className="h-4 w-4" />
              Active ({activeJobs.length})
            </TabsTrigger>
            <TabsTrigger value="create" className="gap-2 data-[state=active]:bg-background">
              <Zap className="h-4 w-4" />
              Create Import
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2 data-[state=active]:bg-background">
              <FileText className="h-4 w-4" />
              History ({filteredJobs.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Performance Metrics */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card className="bg-gradient-to-br from-success/5 to-transparent border-success/20">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                      <p className="text-3xl font-bold text-success">
                        {statistics.total_jobs > 0 
                          ? Math.round((statistics.completed_jobs / statistics.total_jobs) * 100)
                          : 0}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {statistics.completed_jobs} successful imports
                      </p>
                    </div>
                    <div className="p-3 rounded-full bg-success/10">
                      <TrendingUp className="h-6 w-6 text-success" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Records</p>
                      <p className="text-3xl font-bold text-primary">
                        {(statistics.total_records_processed / 1000).toFixed(1)}K
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {statistics.total_records_processed.toLocaleString()} processed
                      </p>
                    </div>
                    <div className="p-3 rounded-full bg-primary/10">
                      <Database className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-warning/5 to-transparent border-warning/20">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Avg Processing Time</p>
                      <p className="text-3xl font-bold text-warning">
                        {statistics.total_jobs > 0 ? '2.3' : '0'}m
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Per 1000 records
                      </p>
                    </div>
                    <div className="p-3 rounded-full bg-warning/10">
                      <Clock className="h-6 w-6 text-warning" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-destructive/5 to-transparent border-destructive/20">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Error Rate</p>
                      <p className="text-3xl font-bold text-destructive">
                        {statistics.total_records_processed > 0 
                          ? Math.round((statistics.total_failed_records / statistics.total_records_processed) * 100)
                          : 0}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {statistics.total_failed_records.toLocaleString()} failed
                      </p>
                    </div>
                    <div className="p-3 rounded-full bg-destructive/10">
                      <TrendingDown className="h-6 w-6 text-destructive" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Import Quality Overview */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Import Quality Analysis
                  </CardTitle>
                  <CardDescription>Quality metrics for recent imports</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Data Validation</span>
                      <div className="flex items-center gap-2">
                        <Progress value={92} className="w-20 h-2" />
                        <span className="text-sm font-medium">92%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Duplicate Detection</span>
                      <div className="flex items-center gap-2">
                        <Progress value={88} className="w-20 h-2" />
                        <span className="text-sm font-medium">88%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Processing Speed</span>
                      <div className="flex items-center gap-2">
                        <Progress value={95} className="w-20 h-2" />
                        <span className="text-sm font-medium">95%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Recent Activity
                  </CardTitle>
                  <CardDescription>Latest import jobs overview</CardDescription>
                </CardHeader>
                <CardContent>
                  {jobs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="font-medium">No import jobs yet</p>
                      <p className="text-sm">Create your first import to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {jobs.slice(0, 5).map((job) => (
                        <div
                          key={job.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => setSelectedJob(job)}
                        >
                          <div className="flex items-center gap-3">
                            {getStatusIcon(job.status)}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{job.type}</span>
                                {getStatusBadge(job.status)}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {job.processed_records}/{job.total_records} records • {new Date(job.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <Progress value={job.progress_percentage} className="w-16 h-2 mb-1" />
                            <span className="text-xs text-muted-foreground">{job.progress_percentage}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="active" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-6">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800">
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
                    <span className="text-2xl font-bold text-blue-600">{activeJobs.length}</span>
                  </div>
                  <p className="text-sm text-blue-600">Active Jobs</p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200 dark:border-purple-800">
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Database className="h-5 w-5 text-purple-600" />
                    <span className="text-2xl font-bold text-purple-600">
                      {activeJobs.reduce((sum, job) => sum + job.total_records, 0).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-purple-600">Records in Queue</p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800">
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    <span className="text-2xl font-bold text-green-600">
                      {activeJobs.reduce((sum, job) => sum + job.processed_records, 0).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-green-600">Records Processed</p>
                </CardContent>
              </Card>
            </div>

            {activeJobs.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
                    <Activity className="h-12 w-12 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No Active Jobs</h3>
                  <p className="text-muted-foreground mb-4">
                    All import jobs have completed. Start a new import to see active jobs here.
                  </p>
                  <Button onClick={() => setActiveTab('create')} className="gap-2">
                    <Upload className="h-4 w-4" />
                    Create New Import
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {activeJobs.map((job) => (
                  <Card key={job.id} className="bg-card/50 backdrop-blur-sm">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(job.status)}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-lg">{job.type}</span>
                              {getStatusBadge(job.status)}
                              {job.source_type && (
                                <Badge variant="outline" className="text-xs">
                                  {job.source_type}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {getPhaseDescription(job.phase)}
                            </p>
                            {job.file_name && (
                              <p className="text-xs text-muted-foreground">
                                File: {job.file_name}
                              </p>
                            )}
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
                          {['pending', 'validating', 'processing'].includes(job.status) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => cancelImportJob(job.id)}
                              className="gap-2 text-destructive hover:text-destructive"
                            >
                              <X className="h-4 w-4" />
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {/* Enhanced Progress Display */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">Overall Progress</span>
                          <span className="font-bold">{job.progress_percentage}%</span>
                        </div>
                        <Progress value={job.progress_percentage} className="h-3" />
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                          <div className="text-center">
                            <div className="text-lg font-bold text-primary">{job.total_records}</div>
                            <div className="text-xs text-muted-foreground">Total Records</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-bold text-blue-600">{job.processed_records}</div>
                            <div className="text-xs text-muted-foreground">Processed</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-bold text-success">{job.successful_records}</div>
                            <div className="text-xs text-muted-foreground">Successful</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-bold text-destructive">{job.failed_records}</div>
                            <div className="text-xs text-muted-foreground">Failed</div>
                          </div>
                        </div>
                        
                        {job.duplicate_records > 0 && (
                          <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                              Found {job.duplicate_records} duplicate records using {job.duplicate_strategy} strategy
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="create" className="space-y-6">
            <ImportJobCreator />
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Import History
                    </CardTitle>
                    <CardDescription>Complete history of all import jobs with advanced filtering</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Download className="h-4 w-4" />
                      Export History
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredJobs.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
                      <Search className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No jobs found</h3>
                    <p className="text-muted-foreground mb-4">
                      {searchQuery || statusFilter !== 'all' 
                        ? 'Try adjusting your search criteria or filters'
                        : 'No import jobs have been created yet'
                      }
                    </p>
                    {!searchQuery && statusFilter === 'all' && (
                      <Button onClick={() => setActiveTab('create')} className="gap-2">
                        <Upload className="h-4 w-4" />
                        Create First Import
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredJobs.map((job) => (
                      <Card key={job.id} className="bg-card/30 hover:bg-card/50 transition-colors">
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4">
                              {getStatusIcon(job.status)}
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-semibold text-lg">{job.type}</span>
                                  {getStatusBadge(job.status)}
                                  {job.source_type && (
                                    <Badge variant="outline" className="text-xs">
                                      {job.source_type}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                  <span>Created: {new Date(job.created_at).toLocaleString()}</span>
                                  {job.completed_at && (
                                    <span>Completed: {new Date(job.completed_at).toLocaleString()}</span>
                                  )}
                                  {job.file_name && <span>File: {job.file_name}</span>}
                                  {job.file_size && <span>Size: {formatFileSize(job.file_size)}</span>}
                                </div>
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