import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { useImportHub, ImportJob } from '@/hooks/useImportHub';
import { 
  Upload, Database, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, 
  Clock, RefreshCw, Eye, Download, X, Play, Pause,
  FileText, Search, BarChart3, Activity, Zap, Package, MapPin, Rss, Key
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImportJobCreator } from './ImportJobCreator';
import { ValidationReport } from './ValidationReport';
import { VenueImportQuickActions } from './VenueImportQuickActions';
import { NewsSourcesManager } from './NewsSourcesManager';
import { ApiKeysManager } from './ApiKeysManager';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const ImportHubDashboard = () => {
  const {
    jobs,
    statistics,
    loading,
    isPolling,
    cancelImportJob,
    togglePolling,
    refreshJobs: loadJobs,
    refreshStatistics: loadStatistics
  } = useImportHub();

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
    <div className="w-full min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card sticky top-0 z-40">
        <div className="container mx-auto p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Title Section */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="p-3 bg-primary">
                  <Database className="h-8 w-8 text-primary-foreground" />
                </div>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-success" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-foreground">
                  Import Hub
                </h1>
                <p className="text-muted-foreground text-lg">
                  Enterprise-grade data import with AI-powered validation
                </p>
              </div>
            </div>
            
            {/* Statistics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-success">
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-success-foreground" />
                    <span className="text-2xl font-bold text-success-foreground">{statistics?.completed_jobs || 0}</span>
                  </div>
                  <p className="text-xs text-success-foreground">Completed Jobs</p>
                </CardContent>
              </Card>
              
              <Card className="bg-destructive">
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <AlertTriangle className="h-5 w-5 text-destructive-foreground" />
                    <span className="text-2xl font-bold text-destructive-foreground">{statistics?.failed_jobs || 0}</span>
                  </div>
                  <p className="text-xs text-destructive-foreground">Failed Jobs</p>
                </CardContent>
              </Card>
              
              <Card className="bg-warning">
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Clock className="h-5 w-5 text-warning-foreground" />
                    <span className="text-2xl font-bold text-warning-foreground">{statistics?.pending_jobs || 0}</span>
                  </div>
                  <p className="text-xs text-warning-foreground">Pending Jobs</p>
                </CardContent>
              </Card>
              
              <Card className="bg-primary">
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Package className="h-5 w-5 text-primary-foreground" />
                    <span className="text-2xl font-bold text-primary-foreground">{statistics?.total_records_processed?.toLocaleString() || 0}</span>
                  </div>
                  <p className="text-xs text-primary-foreground">Records Processed</p>
                </CardContent>
              </Card>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={togglePolling}
                className="gap-2"
              >
                {isPolling ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
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
        {/* Search and Filter Bar */}
        <Card className="mb-6 bg-card">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search jobs by type, filename, or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-background"
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
          <TabsList className="grid w-full grid-cols-7 bg-card">
            <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-background">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="venues" className="gap-2 data-[state=active]:bg-background">
              <MapPin className="h-4 w-4" />
              Venues
            </TabsTrigger>
            <TabsTrigger value="news" className="gap-2 data-[state=active]:bg-background">
              <Rss className="h-4 w-4" />
              News Sources
            </TabsTrigger>
            <TabsTrigger value="api-keys" className="gap-2 data-[state=active]:bg-background">
              <Key className="h-4 w-4" />
              API Keys
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
            {/* Recent Activity */}
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
                        className="flex items-center justify-between p-3 bg-card hover:bg-muted cursor-pointer transition-colors"
                        onClick={() => setShowValidation(job.id)}
                      >
                        <div className="flex items-center gap-3">
                          {getStatusIcon(job.status)}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{job.type}</span>
                              {getStatusBadge(job.status)}
                            </div>
                             <p className="text-xs text-muted-foreground">
                               {job.processed_records || 0}/{job.total_records || 0} records • {new Date(job.created_at).toLocaleDateString()}
                             </p>
                          </div>
                        </div>
                        
                         <div className="text-right">
                           <Progress value={job.progress_percentage || 0} className="w-16 h-2 mb-1" />
                           <span className="text-xs text-muted-foreground">{job.progress_percentage || 0}%</span>
                         </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="venues" className="space-y-6">
            <VenueImportQuickActions />
          </TabsContent>

          <TabsContent value="news" className="space-y-6">
            <NewsSourcesManager />
          </TabsContent>

          <TabsContent value="api-keys" className="space-y-6">
            <ApiKeysManager />
          </TabsContent>

          <TabsContent value="active" className="space-y-6">
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
                   <Card key={job.id} className="bg-card">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(job.status)}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-lg">{job.type}</span>
                              {getStatusBadge(job.status)}
                            </div>
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
                      
                      {/* Progress Display */}
                      <div className="space-y-4">
                         <div className="flex items-center justify-between text-sm">
                           <span className="font-medium">Overall Progress</span>
                           <span className="font-bold">{job.progress_percentage || 0}%</span>
                         </div>
                         <Progress value={job.progress_percentage || 0} className="h-3" />
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
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
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Import History
                </CardTitle>
                <CardDescription>Complete history of all import jobs</CardDescription>
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
                      <Card key={job.id} className="bg-card hover:bg-muted transition-colors">
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
                            
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowValidation(job.id)}
                                className="gap-2"
                              >
                                <Eye className="h-4 w-4" />
                                View Report
                              </Button>
                              {job.status === 'completed' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => exportValidationReport(job)}
                                  className="gap-2"
                                >
                                  <Download className="h-4 w-4" />
                                  Export
                                </Button>
                              )}
                            </div>
                          </div>
                          
                           {/* Statistics Grid */}
                           <div className="grid grid-cols-3 md:grid-cols-6 gap-4 pt-4 text-center">
                            <div>
                              <div className="text-lg font-bold text-primary">{job.total_records}</div>
                              <div className="text-xs text-muted-foreground">Total</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-success">{job.successful_records}</div>
                              <div className="text-xs text-muted-foreground">Success</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-destructive">{job.failed_records}</div>
                              <div className="text-xs text-muted-foreground">Failed</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-warning">{job.duplicate_records}</div>
                              <div className="text-xs text-muted-foreground">Duplicates</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold">{job.duplicate_strategy || 'N/A'}</div>
                              <div className="text-xs text-muted-foreground">Strategy</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold">{job.progress_percentage}%</div>
                              <div className="text-xs text-muted-foreground">Progress</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
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