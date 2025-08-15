import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useImportHub, ImportJob, ValidationResult } from '@/hooks/useImportHub';
import { 
  CheckCircle, AlertTriangle, XCircle, Download, FileText, 
  AlertCircle, Info, TrendingUp, TrendingDown, Clock
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
        return <CheckCircle className="h-5 w-5 text-success" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'processing':
      case 'validating':
        return <Clock className="h-5 w-5 text-primary animate-pulse" />;
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-muted-foreground" />;
      default:
        return <AlertCircle className="h-5 w-5 text-warning" />;
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getStatusIcon(job.status)}
            Import Job Report - {job.type}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Job Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Job Overview</CardTitle>
              <CardDescription>Basic information about this import job</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusIcon(job.status)}
                    <Badge variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                      {job.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Type</Label>
                  <p className="font-medium">{job.type}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Source</Label>
                  <p className="font-medium">{job.source_type}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Strategy</Label>
                  <p className="font-medium">{job.duplicate_strategy}</p>
                </div>
                {job.file_name && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">File</Label>
                    <p className="font-medium text-sm">{job.file_name}</p>
                  </div>
                )}
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Created</Label>
                  <p className="font-medium text-sm">{new Date(job.created_at).toLocaleString()}</p>
                </div>
                {job.completed_at && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Completed</Label>
                    <p className="font-medium text-sm">{new Date(job.completed_at).toLocaleString()}</p>
                  </div>
                )}
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Progress</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={job.progress_percentage} className="flex-1 h-2" />
                    <span className="text-sm font-medium">{job.progress_percentage}%</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Statistics */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-success/10">
                    <TrendingUp className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Success Rate</p>
                    <p className="text-xl font-bold text-success">{successRate.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">{job.successful_records} / {job.total_records}</p>
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
                    <p className="text-sm text-muted-foreground">Error Rate</p>
                    <p className="text-xl font-bold text-destructive">{errorRate.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">{job.failed_records} failed</p>
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
                    <p className="text-sm text-muted-foreground">Duplicates</p>
                    <p className="text-xl font-bold text-warning">{duplicateRate.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">{job.duplicate_records} duplicates</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Reports */}
          <Tabs defaultValue="summary" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="validation">Validation</TabsTrigger>
              <TabsTrigger value="errors">Errors</TabsTrigger>
              <TabsTrigger value="configuration">Configuration</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Import Summary</CardTitle>
                  <CardDescription>Overview of the import process results</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold">{job.total_records}</div>
                        <div className="text-sm text-muted-foreground">Total Records</div>
                      </div>
                      <div className="text-center p-4 border rounded-lg bg-success/5">
                        <div className="text-2xl font-bold text-success">{job.successful_records}</div>
                        <div className="text-sm text-muted-foreground">Successful</div>
                      </div>
                      <div className="text-center p-4 border rounded-lg bg-destructive/5">
                        <div className="text-2xl font-bold text-destructive">{job.failed_records}</div>
                        <div className="text-sm text-muted-foreground">Failed</div>
                      </div>
                      <div className="text-center p-4 border rounded-lg bg-warning/5">
                        <div className="text-2xl font-bold text-warning">{job.duplicate_records}</div>
                        <div className="text-sm text-muted-foreground">Duplicates</div>
                      </div>
                    </div>

                    {job.import_summary && Object.keys(job.import_summary).length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Import Details</h4>
                        <pre className="text-sm bg-muted p-3 rounded-md overflow-auto">
                          {JSON.stringify(job.import_summary, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="validation" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Validation Report</CardTitle>
                  <CardDescription>Data validation results and statistics</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
                      <p>Loading validation results...</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-4 border rounded-lg bg-success/5">
                          <div className="text-xl font-bold text-success">{job.valid_records}</div>
                          <div className="text-sm text-muted-foreground">Valid Records</div>
                        </div>
                        <div className="text-center p-4 border rounded-lg bg-destructive/5">
                          <div className="text-xl font-bold text-destructive">{job.invalid_records}</div>
                          <div className="text-sm text-muted-foreground">Invalid Records</div>
                        </div>
                        <div className="text-center p-4 border rounded-lg">
                          <div className="text-xl font-bold">{validationResults.length}</div>
                          <div className="text-sm text-muted-foreground">Validation Details</div>
                        </div>
                      </div>

                      {job.validation_report && Object.keys(job.validation_report).length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2">Validation Summary</h4>
                          <pre className="text-sm bg-muted p-3 rounded-md overflow-auto max-h-40">
                            {JSON.stringify(job.validation_report, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="errors" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Error Details</CardTitle>
                      <CardDescription>Detailed error information for failed records</CardDescription>
                    </div>
                    {validationResults.some(r => !r.is_valid) && (
                      <Button variant="outline" onClick={exportErrorsCSV} className="gap-2">
                        <Download className="h-4 w-4" />
                        Export Errors CSV
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {validationResults.filter(r => !r.is_valid).length === 0 ? (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        No validation errors found. All records passed validation successfully.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {validationResults
                        .filter(r => !r.is_valid)
                        .slice(0, 20) // Show first 20 errors
                        .map((result, index) => (
                          <div key={index} className="border rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <Badge variant="destructive">Record {result.record_index}</Badge>
                              <div className="text-sm text-muted-foreground">
                                {result.validation_errors.length} error(s), {result.validation_warnings.length} warning(s)
                              </div>
                            </div>
                            
                            {result.validation_errors.length > 0 && (
                              <div className="mb-2">
                                <h5 className="text-sm font-medium text-destructive mb-1">Errors:</h5>
                                <ul className="text-sm text-destructive list-disc list-inside">
                                  {result.validation_errors.map((error, idx) => (
                                    <li key={idx}>{error}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {result.validation_warnings.length > 0 && (
                              <div className="mb-2">
                                <h5 className="text-sm font-medium text-warning mb-1">Warnings:</h5>
                                <ul className="text-sm text-warning list-disc list-inside">
                                  {result.validation_warnings.map((warning, idx) => (
                                    <li key={idx}>{warning}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            <details className="mt-2">
                              <summary className="text-sm font-medium cursor-pointer">Record Data</summary>
                              <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                                {JSON.stringify(result.record_data, null, 2)}
                              </pre>
                            </details>
                          </div>
                        ))}
                      
                      {validationResults.filter(r => !r.is_valid).length > 20 && (
                        <Alert>
                          <Info className="h-4 w-4" />
                          <AlertDescription>
                            Showing first 20 errors. Export the full error report for complete details.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="configuration" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Import Configuration</CardTitle>
                  <CardDescription>Settings and parameters used for this import</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Duplicate Strategy</h4>
                      <Badge variant="outline">{job.duplicate_strategy}</Badge>
                    </div>

                    {job.unique_key_fields.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Unique Key Fields</h4>
                        <div className="flex flex-wrap gap-2">
                          {job.unique_key_fields.map((field, index) => (
                            <Badge key={index} variant="secondary">{field}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {Object.keys(job.validation_rules).length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Validation Rules</h4>
                        <pre className="text-sm bg-muted p-3 rounded-md overflow-auto">
                          {JSON.stringify(job.validation_rules, null, 2)}
                        </pre>
                      </div>
                    )}

                    {Object.keys(job.filters).length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Applied Filters</h4>
                        <pre className="text-sm bg-muted p-3 rounded-md overflow-auto">
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
          <div className="flex gap-3 pt-4 border-t">
            <Button onClick={exportReport} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Export Full Report
            </Button>
            <Button onClick={onClose} className="flex-1">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Label = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <label className={`text-sm font-medium ${className}`}>{children}</label>
);