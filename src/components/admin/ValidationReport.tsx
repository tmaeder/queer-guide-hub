import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useImportHub, ImportJob, ValidationResult } from '@/hooks/useImportHub';
import {
  CheckCircle, AlertTriangle, XCircle, Download,
  AlertCircle, TrendingUp, TrendingDown, Clock
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ValidationReportProps {
  jobId: string;
  onClose: () => void;
}

export const ValidationReport = ({ jobId, onClose }: ValidationReportProps) => {
  const { jobs, getValidationResults } = useImportHub();
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [loading, setLoading] = useState(true);

  const job = jobs.find(j => j.id === jobId);

  useEffect(() => {
    const loadValidationResults = async () => {
      setLoading(true);
      try {
        const results = await getValidationResults(jobId);
        setValidationResults(results);
      } catch (error) {
        console.error('Failed to load validation results:', error);
      } finally {
        setLoading(false);
      }
    };

    loadValidationResults();
  }, [jobId, getValidationResults]);

  if (!job) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Job Not Found</DialogTitle>
          </DialogHeader>
          <p>The requested import job could not be found.</p>
        </DialogContent>
      </Dialog>
    );
  }

  const getStatusIcon = (status: ImportJob['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle style={{ height: 20, width: 20, color: 'var(--success)' }} />;
      case 'failed':
        return <XCircle style={{ height: 20, width: 20, color: 'var(--destructive)' }} />;
      case 'processing':
      case 'validating':
        return <Clock style={{ height: 20, width: 20, color: 'var(--primary)', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />;
      case 'cancelled':
        return <XCircle style={{ height: 20, width: 20, color: 'var(--muted-foreground)' }} />;
      default:
        return <AlertCircle style={{ height: 20, width: 20, color: 'var(--warning)' }} />;
    }
  };

  const exportReport = () => {
    const reportData = {
      job_summary: {
        id: job.id,
        type: job.type,
        status: job.status,
        created_at: job.created_at,
        completed_at: job.completed_at,
        file_name: job.file_name,
        file_size: job.file_size
      },
      statistics: {
        total_records: job.total_records,
        valid_records: job.valid_records,
        invalid_records: job.invalid_records,
        processed_records: job.processed_records,
        successful_records: job.successful_records,
        failed_records: job.failed_records,
        duplicate_records: job.duplicate_records,
        progress_percentage: job.progress_percentage
      },
      configuration: {
        duplicate_strategy: job.duplicate_strategy,
        unique_key_fields: job.unique_key_fields,
        validation_rules: job.validation_rules,
        filters: job.filters
      },
      validation_report: job.validation_report,
      error_report: job.error_report,
      import_summary: job.import_summary,
      validation_results: validationResults
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `validation-report-${job.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportErrorsCSV = () => {
    const errorResults = validationResults.filter(r => !r.is_valid);
    if (errorResults.length === 0) return;

    const headers = ['Record Index', 'Errors', 'Warnings', 'Data'];
    const rows = errorResults.map(result => [
      result.record_index,
      result.validation_errors.join('; '),
      result.validation_warnings.join('; '),
      JSON.stringify(result.record_data)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `validation-errors-${job.id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const successRate = job.total_records > 0 ? (job.successful_records / job.total_records) * 100 : 0;
  const errorRate = job.total_records > 0 ? (job.failed_records / job.total_records) * 100 : 0;
  const duplicateRate = job.total_records > 0 ? (job.duplicate_records / job.total_records) * 100 : 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent style={{ maxWidth: 896, maxHeight: '90vh', overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {getStatusIcon(job.status)}
            Import Job Report - {job.type}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          {/* Job Overview */}
          <Card>
            <CardHeader>
              <CardTitle style={{ fontSize: '1.125rem' }}>Job Overview</CardTitle>
              <CardDescription>Basic information about this import job</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>Status</Label>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusIcon(job.status)}
                    <Badge variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                      {job.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label>Type</Label>
                  <p className="font-medium">{job.type}</p>
                </div>
                <div>
                  <Label>Source</Label>
                  <p className="font-medium">{job.source_type}</p>
                </div>
                <div>
                  <Label>Strategy</Label>
                  <p className="font-medium">{job.duplicate_strategy}</p>
                </div>
                {job.file_name && (
                  <div>
                    <Label>File</Label>
                    <p className="font-medium text-sm">{job.file_name}</p>
                  </div>
                )}
                <div>
                  <Label>Created</Label>
                  <p className="font-medium text-sm">{new Date(job.created_at).toLocaleString()}</p>
                </div>
                {job.completed_at && (
                  <div>
                    <Label>Completed</Label>
                    <p className="font-medium text-sm">{new Date(job.completed_at).toLocaleString()}</p>
                  </div>
                )}
                <div>
                  <Label>Progress</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={job.progress_percentage} style={{ flex: 1, height: 8 }} />
                    <span className="text-sm font-medium">{job.progress_percentage}%</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Statistics */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-element" style={{ backgroundColor: 'rgba(var(--success-rgb, 34, 197, 94), 0.1)' }}>
                    <TrendingUp style={{ height: 16, width: 16, color: 'var(--success)' }} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Success Rate</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--success)' }}>{successRate.toFixed(1)}%</p>
                    <span className="text-xs text-muted-foreground">{job.successful_records} / {job.total_records}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-element" style={{ backgroundColor: 'rgba(var(--destructive-rgb, 239, 68, 68), 0.1)' }}>
                    <TrendingDown style={{ height: 16, width: 16, color: 'var(--destructive)' }} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Error Rate</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--destructive)' }}>{errorRate.toFixed(1)}%</p>
                    <span className="text-xs text-muted-foreground">{job.failed_records} failed</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-element" style={{ backgroundColor: 'rgba(var(--warning-rgb, 234, 179, 8), 0.1)' }}>
                    <AlertTriangle style={{ height: 16, width: 16, color: 'var(--warning)' }} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Duplicates</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--warning)' }}>{duplicateRate.toFixed(1)}%</p>
                    <span className="text-xs text-muted-foreground">{job.duplicate_records} duplicates</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Reports */}
          <Tabs defaultValue="summary" style={{ width: '100%' }}>
            <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="validation">Validation</TabsTrigger>
              <TabsTrigger value="errors">Errors</TabsTrigger>
              <TabsTrigger value="configuration">Configuration</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Import Summary</CardTitle>
                  <CardDescription>Overview of the import process results</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-4 border border-border rounded-element">
                        <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{job.total_records}</p>
                        <p className="text-sm text-muted-foreground">Total Records</p>
                      </div>
                      <div className="text-center p-4 border border-border rounded-element" style={{ backgroundColor: 'rgba(var(--success-rgb, 34, 197, 94), 0.05)' }}>
                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>{job.successful_records}</p>
                        <p className="text-sm text-muted-foreground">Successful</p>
                      </div>
                      <div className="text-center p-4 border border-border rounded-element" style={{ backgroundColor: 'rgba(var(--destructive-rgb, 239, 68, 68), 0.05)' }}>
                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--destructive)' }}>{job.failed_records}</p>
                        <p className="text-sm text-muted-foreground">Failed</p>
                      </div>
                      <div className="text-center p-4 border border-border rounded-element" style={{ backgroundColor: 'rgba(var(--warning-rgb, 234, 179, 8), 0.05)' }}>
                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning)' }}>{job.duplicate_records}</p>
                        <p className="text-sm text-muted-foreground">Duplicates</p>
                      </div>
                    </div>

                    {job.import_summary && Object.keys(job.import_summary).length > 0 && (
                      <div>
                        <p className="font-medium mb-2">Import Details</p>
                        <pre className="text-sm bg-muted p-3 rounded-element overflow-auto">
                          {JSON.stringify(job.import_summary, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="validation" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Validation Report</CardTitle>
                  <CardDescription>Data validation results and statistics</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-center py-8">
                      <div className="rounded-element bg-primary mx-auto mb-4" style={{ animation: 'spin 1s linear infinite', height: 32, width: 32 }} />
                      <p>Loading validation results...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-4 rounded-element" style={{ backgroundColor: 'rgba(var(--success-rgb, 34, 197, 94), 0.05)' }}>
                          <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--success)' }}>{job.valid_records}</p>
                          <p className="text-sm text-muted-foreground">Valid Records</p>
                        </div>
                        <div className="text-center p-4 rounded-element" style={{ backgroundColor: 'rgba(var(--destructive-rgb, 239, 68, 68), 0.05)' }}>
                          <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--destructive)' }}>{job.invalid_records}</p>
                          <p className="text-sm text-muted-foreground">Invalid Records</p>
                        </div>
                        <div className="text-center p-4 rounded-element">
                          <p style={{ fontSize: '1.25rem', fontWeight: 700 }}>{validationResults.length}</p>
                          <p className="text-sm text-muted-foreground">Validation Details</p>
                        </div>
                      </div>

                      {job.validation_report && Object.keys(job.validation_report).length > 0 && (
                        <div>
                          <p className="font-medium mb-2">Validation Summary</p>
                          <pre className="text-sm bg-muted p-3 rounded-element overflow-auto" style={{ maxHeight: 160 }}>
                            {JSON.stringify(job.validation_report, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="errors" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Error Details</CardTitle>
                      <CardDescription>Detailed error information for failed records</CardDescription>
                    </div>
                    {validationResults.some(r => !r.is_valid) && (
                      <Button variant="outline" onClick={exportErrorsCSV} className="flex gap-2">
                        <Download style={{ height: 16, width: 16 }} />
                        Export Errors CSV
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {validationResults.filter(r => !r.is_valid).length === 0 ? (
                    <Alert>
                      <CheckCircle style={{ height: 16, width: 16 }} />
                      <AlertDescription>
                        No validation errors found. All records passed validation successfully.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: 384 }}>
                      {validationResults
                        .filter(r => !r.is_valid)
                        .slice(0, 20)
                        .map((result, index) => (
                          <div key={index} className="rounded-element p-3">
                            <div className="flex items-center justify-between mb-2">
                              <Badge variant="destructive">Record {result.record_index}</Badge>
                              <p className="text-sm text-muted-foreground">
                                {result.validation_errors.length} error(s), {result.validation_warnings.length} warning(s)
                              </p>
                            </div>

                            {result.validation_errors.length > 0 && (
                              <div className="mb-2">
                                <p className="text-sm font-medium mb-1" style={{ color: 'var(--destructive)' }}>Errors:</p>
                                <ul className="text-sm" style={{ color: 'var(--destructive)', listStyle: 'disc', listStylePosition: 'inside' }}>
                                  {result.validation_errors.map((error, idx) => (
                                    <li key={idx}>{error}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {result.validation_warnings.length > 0 && (
                              <div className="mb-2">
                                <p className="text-sm font-medium mb-1" style={{ color: 'var(--warning)' }}>Warnings:</p>
                                <ul className="text-sm" style={{ color: 'var(--warning)', listStyle: 'disc', listStylePosition: 'inside' }}>
                                  {result.validation_warnings.map((warning, idx) => (
                                    <li key={idx}>{warning}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            <details style={{ marginTop: 8 }}>
                              <summary style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', cursor: 'pointer' }}>View record data</summary>
                              <pre className="text-xs bg-muted p-2 mt-1 rounded-element overflow-x-auto">
                                {JSON.stringify(result.record_data, null, 2)}
                              </pre>
                            </details>
                          </div>
                        ))}
                    </div>
                  )}

                  {job.error_report && Object.keys(job.error_report).length > 0 && (
                    <div className="mt-6">
                      <p className="font-medium mb-2">Error Summary</p>
                      <div className="p-3 rounded-element" style={{ backgroundColor: 'rgba(var(--destructive-rgb, 239, 68, 68), 0.05)' }}>
                        <pre className="text-sm bg-muted p-3 rounded-element overflow-auto">
                          {JSON.stringify(job.error_report, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="configuration" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Job Configuration</CardTitle>
                  <CardDescription>Import settings and validation rules</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-4">
                    {job.validation_rules && Object.keys(job.validation_rules).length > 0 && (
                      <div>
                        <p className="font-medium mb-2">Validation Rules</p>
                        <pre className="text-sm bg-muted p-3 rounded-element overflow-auto">
                          {JSON.stringify(job.validation_rules, null, 2)}
                        </pre>
                      </div>
                    )}

                    {job.filters && Object.keys(job.filters).length > 0 && (
                      <div>
                        <p className="font-medium mb-2">Applied Filters</p>
                        <pre className="text-sm bg-muted p-3 rounded-element overflow-auto">
                          {JSON.stringify(job.filters, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button onClick={exportReport} variant="outline" className="flex gap-2">
              <Download style={{ height: 16, width: 16 }} />
              Export Full Report
            </Button>
            <Button onClick={onClose} style={{ flex: 1 }}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="text-sm font-medium text-muted-foreground">{children}</label>
);
