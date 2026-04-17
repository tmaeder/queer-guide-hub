import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Job Overview */}
          <Card>
            <CardHeader>
              <CardTitle style={{ fontSize: '1.125rem' }}>Job Overview</CardTitle>
              <CardDescription>Basic information about this import job</CardDescription>
            </CardHeader>
            <CardContent>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                <Box>
                  <Label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--muted-foreground)' }}>Status</Label>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    {getStatusIcon(job.status)}
                    <Badge variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                      {job.status}
                    </Badge>
                  </Box>
                </Box>
                <Box>
                  <Label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--muted-foreground)' }}>Type</Label>
                  <Typography sx={{ fontWeight: 500 }}>{job.type}</Typography>
                </Box>
                <Box>
                  <Label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--muted-foreground)' }}>Source</Label>
                  <Typography sx={{ fontWeight: 500 }}>{job.source_type}</Typography>
                </Box>
                <Box>
                  <Label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--muted-foreground)' }}>Strategy</Label>
                  <Typography sx={{ fontWeight: 500 }}>{job.duplicate_strategy}</Typography>
                </Box>
                {job.file_name && (
                  <Box>
                    <Label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--muted-foreground)' }}>File</Label>
                    <Typography sx={{ fontWeight: 500, fontSize: '0.875rem' }}>{job.file_name}</Typography>
                  </Box>
                )}
                <Box>
                  <Label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--muted-foreground)' }}>Created</Label>
                  <Typography sx={{ fontWeight: 500, fontSize: '0.875rem' }}>{new Date(job.created_at).toLocaleString()}</Typography>
                </Box>
                {job.completed_at && (
                  <Box>
                    <Label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--muted-foreground)' }}>Completed</Label>
                    <Typography sx={{ fontWeight: 500, fontSize: '0.875rem' }}>{new Date(job.completed_at).toLocaleString()}</Typography>
                  </Box>
                )}
                <Box>
                  <Label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--muted-foreground)' }}>Progress</Label>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Progress value={job.progress_percentage} style={{ flex: 1, height: 8 }} />
                    <Typography component="span" variant="body2" sx={{ fontWeight: 500 }}>{job.progress_percentage}%</Typography>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Statistics */}
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { md: 'repeat(3, 1fr)' } }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(var(--success-rgb, 34, 197, 94), 0.1)' }}>
                    <TrendingUp style={{ height: 16, width: 16, color: 'var(--success)' }} />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>Success Rate</Typography>
                    <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--success)' }}>{successRate.toFixed(1)}%</Typography>
                    <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>{job.successful_records} / {job.total_records}</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(var(--destructive-rgb, 239, 68, 68), 0.1)' }}>
                    <TrendingDown style={{ height: 16, width: 16, color: 'var(--destructive)' }} />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>Error Rate</Typography>
                    <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--destructive)' }}>{errorRate.toFixed(1)}%</Typography>
                    <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>{job.failed_records} failed</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(var(--warning-rgb, 234, 179, 8), 0.1)' }}>
                    <AlertTriangle style={{ height: 16, width: 16, color: 'var(--warning)' }} />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>Duplicates</Typography>
                    <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--warning)' }}>{duplicateRate.toFixed(1)}%</Typography>
                    <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>{job.duplicate_records} duplicates</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Box>

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
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                      <Box sx={{ textAlign: 'center', p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                        <Typography sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{job.total_records}</Typography>
                        <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>Total Records</Typography>
                      </Box>
                      <Box sx={{ textAlign: 'center', p: 2, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'rgba(var(--success-rgb, 34, 197, 94), 0.05)' }}>
                        <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>{job.successful_records}</Typography>
                        <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>Successful</Typography>
                      </Box>
                      <Box sx={{ textAlign: 'center', p: 2, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'rgba(var(--destructive-rgb, 239, 68, 68), 0.05)' }}>
                        <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--destructive)' }}>{job.failed_records}</Typography>
                        <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>Failed</Typography>
                      </Box>
                      <Box sx={{ textAlign: 'center', p: 2, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'rgba(var(--warning-rgb, 234, 179, 8), 0.05)' }}>
                        <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning)' }}>{job.duplicate_records}</Typography>
                        <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>Duplicates</Typography>
                      </Box>
                    </Box>

                    {job.import_summary && Object.keys(job.import_summary).length > 0 && (
                      <Box>
                        <Typography sx={{ fontWeight: 500, mb: 1 }}>Import Details</Typography>
                        <Box component="pre" sx={{ fontSize: '0.875rem', bgcolor: 'var(--muted)', p: 1.5, borderRadius: 2, overflow: 'auto' }}>
                          {JSON.stringify(job.import_summary, null, 2)}
                        </Box>
                      </Box>
                    )}
                  </Box>
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
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                      <Box sx={{ animation: 'spin 1s linear infinite', borderRadius: 2, height: 32, width: 32, bgcolor: 'primary.main', mx: 'auto', mb: 2 }} />
                      <Typography>Loading validation results...</Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                        <Box sx={{ textAlign: 'center', p: 2, borderRadius: 2, bgcolor: 'rgba(var(--success-rgb, 34, 197, 94), 0.05)' }}>
                          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--success)' }}>{job.valid_records}</Typography>
                          <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>Valid Records</Typography>
                        </Box>
                        <Box sx={{ textAlign: 'center', p: 2, borderRadius: 2, bgcolor: 'rgba(var(--destructive-rgb, 239, 68, 68), 0.05)' }}>
                          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--destructive)' }}>{job.invalid_records}</Typography>
                          <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>Invalid Records</Typography>
                        </Box>
                        <Box sx={{ textAlign: 'center', p: 2, borderRadius: 2 }}>
                          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700 }}>{validationResults.length}</Typography>
                          <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>Validation Details</Typography>
                        </Box>
                      </Box>

                      {job.validation_report && Object.keys(job.validation_report).length > 0 && (
                        <Box>
                          <Typography sx={{ fontWeight: 500, mb: 1 }}>Validation Summary</Typography>
                          <Box component="pre" sx={{ fontSize: '0.875rem', bgcolor: 'var(--muted)', p: 1.5, borderRadius: 2, overflow: 'auto', maxHeight: 160 }}>
                            {JSON.stringify(job.validation_report, null, 2)}
                          </Box>
                        </Box>
                      )}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="errors" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card>
                <CardHeader>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <CardTitle>Error Details</CardTitle>
                      <CardDescription>Detailed error information for failed records</CardDescription>
                    </Box>
                    {validationResults.some(r => !r.is_valid) && (
                      <Button variant="outline" onClick={exportErrorsCSV} style={{ display: 'flex', gap: 8 }}>
                        <Download style={{ height: 16, width: 16 }} />
                        Export Errors CSV
                      </Button>
                    )}
                  </Box>
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
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 384, overflowY: 'auto' }}>
                      {validationResults
                        .filter(r => !r.is_valid)
                        .slice(0, 20) // Show first 20 errors
                        .map((result, index) => (
                          <Box key={index} sx={{ borderRadius: 2, p: 1.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                              <Badge variant="destructive">Record {result.record_index}</Badge>
                              <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
                                {result.validation_errors.length} error(s), {result.validation_warnings.length} warning(s)
                              </Typography>
                            </Box>

                            {result.validation_errors.length > 0 && (
                              <Box sx={{ mb: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 500, color: 'var(--destructive)', mb: 0.5 }}>Errors:</Typography>
                                <Box component="ul" sx={{ fontSize: '0.875rem', color: 'var(--destructive)', listStyle: 'disc', listStylePosition: 'inside' }}>
                                  {result.validation_errors.map((error, idx) => (
                                    <li key={idx}>{error}</li>
                                  ))}
                                </Box>
                              </Box>
                            )}

                            {result.validation_warnings.length > 0 && (
                              <Box sx={{ mb: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 500, color: 'var(--warning)', mb: 0.5 }}>Warnings:</Typography>
                                <Box component="ul" sx={{ fontSize: '0.875rem', color: 'var(--warning)', listStyle: 'disc', listStylePosition: 'inside' }}>
                                  {result.validation_warnings.map((warning, idx) => (
                                    <li key={idx}>{warning}</li>
                                  ))}
                                </Box>
                              </Box>
                            )}

                            <details style={{ marginTop: 8 }}>
                              <summary style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', cursor: 'pointer' }}>View record data</summary>
                              <Box component="pre" sx={{ fontSize: '0.75rem', bgcolor: 'var(--muted)', p: 1, mt: 0.5, borderRadius: 2, overflowX: 'auto' }}>
                                {JSON.stringify(result.record_data, null, 2)}
                              </Box>
                            </details>
                          </Box>
                        ))}
                    </Box>
                  )}

                  {job.error_report && Object.keys(job.error_report).length > 0 && (
                    <Box sx={{ mt: 3 }}>
                      <Typography sx={{ fontWeight: 500, mb: 1 }}>Error Summary</Typography>
                      <Box sx={{ bgcolor: 'rgba(var(--destructive-rgb, 239, 68, 68), 0.05)', p: 1.5, borderRadius: 2 }}>
                        <Box component="pre" sx={{ fontSize: '0.875rem', bgcolor: 'var(--muted)', p: 1.5, borderRadius: 2, overflow: 'auto' }}>
                          {JSON.stringify(job.error_report, null, 2)}
                        </Box>
                      </Box>
                    </Box>
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
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {job.validation_rules && Object.keys(job.validation_rules).length > 0 && (
                      <Box>
                        <Typography sx={{ fontWeight: 500, mb: 1 }}>Validation Rules</Typography>
                        <Box component="pre" sx={{ fontSize: '0.875rem', bgcolor: 'var(--muted)', p: 1.5, borderRadius: 2, overflow: 'auto' }}>
                          {JSON.stringify(job.validation_rules, null, 2)}
                        </Box>
                      </Box>
                    )}

                    {job.filters && Object.keys(job.filters).length > 0 && (
                      <Box>
                        <Typography sx={{ fontWeight: 500, mb: 1 }}>Applied Filters</Typography>
                        <Box component="pre" sx={{ fontSize: '0.875rem', bgcolor: 'var(--muted)', p: 1.5, borderRadius: 2, overflow: 'auto' }}>
                          {JSON.stringify(job.filters, null, 2)}
                        </Box>
                      </Box>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 1.5, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Button onClick={exportReport} variant="outline" style={{ display: 'flex', gap: 8 }}>
              <Download style={{ height: 16, width: 16 }} />
              Export Full Report
            </Button>
            <Button onClick={onClose} style={{ flex: 1 }}>
              Close
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

const Label = ({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <label style={{ fontSize: '0.875rem', fontWeight: 500, ...style }}>{children}</label>
);
