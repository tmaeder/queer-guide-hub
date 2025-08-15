import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ImportJob } from '@/hooks/useImportHub';
import { ImportStatusBadge } from './ImportStatusBadge';
import { 
  Eye, Download, X, Clock, FileText, Database, 
  AlertTriangle, Info, Calendar, Settings, Users
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ImportJobCardProps {
  job: ImportJob;
  onViewDetails: (jobId: string) => void;
  onCancel?: (jobId: string) => void;
  onExport?: (job: ImportJob) => void;
  compact?: boolean;
}

export const ImportJobCard = ({ 
  job, 
  onViewDetails, 
  onCancel, 
  onExport, 
  compact = false 
}: ImportJobCardProps) => {
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
  };

  const getJobTypeIcon = (type: string) => {
    if (type.includes('venue')) return Database;
    if (type.includes('event')) return Calendar;
    if (type.includes('personality')) return Users;
    if (type.includes('tag')) return Settings;
    return FileText;
  };

  const JobTypeIcon = getJobTypeIcon(job.type);
  const canCancel = ['pending', 'validating', 'processing'].includes(job.status);
  const canExport = job.status === 'completed';

  if (compact) {
    return (
      <Card className="hover:shadow-md transition-all duration-200 cursor-pointer border-l-4 border-l-primary/20 hover:border-l-primary">
        <CardContent className="p-4" onClick={() => onViewDetails(job.id)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <JobTypeIcon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{job.type}</span>
                  <ImportStatusBadge status={job.status} size="sm" />
                </div>
                <div className="text-sm text-muted-foreground">
                  {job.processed_records}/{job.total_records} • {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Progress value={job.progress_percentage} className="w-16 h-2" />
              <span className="text-sm font-medium w-10 text-right">{job.progress_percentage}%</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-card to-card/50">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5">
              <JobTypeIcon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-xl font-semibold">{job.type}</h3>
                <ImportStatusBadge status={job.status} />
                {job.source_type && (
                  <Badge variant="outline" className="text-xs">
                    {job.source_type}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>Created {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}</span>
                </div>
                {job.file_name && (
                  <div className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    <span>{job.file_name}</span>
                  </div>
                )}
                {job.file_size && (
                  <span>{formatFileSize(job.file_size)}</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewDetails(job.id)}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              Details
            </Button>
            {canExport && onExport && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onExport(job)}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
            )}
            {canCancel && onCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCancel(job.id)}
                className="gap-2 text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        </div>

        {/* Progress Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Progress</span>
            <span className="font-bold">{job.progress_percentage}%</span>
          </div>
          <Progress value={job.progress_percentage} className="h-2" />
          
          {/* Statistics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t">
            <div className="text-center">
              <div className="text-lg font-bold text-primary">{job.total_records.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">{job.processed_records.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Processed</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-success">{job.successful_records.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Success</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-destructive">{job.failed_records.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-warning">{job.duplicate_records.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Duplicates</div>
            </div>
          </div>

          {/* Configuration */}
          {(job.duplicate_strategy || job.unique_key_fields?.length) && (
            <div className="flex items-center gap-3 pt-3 border-t text-sm">
              {job.duplicate_strategy && (
                <Badge variant="outline" className="gap-1">
                  <Settings className="h-3 w-3" />
                  {job.duplicate_strategy.replace('_', ' ')}
                </Badge>
              )}
              {job.unique_key_fields?.length && (
                <Badge variant="outline" className="gap-1">
                  <Database className="h-3 w-3" />
                  {job.unique_key_fields.length} key field(s)
                </Badge>
              )}
            </div>
          )}

          {/* Warnings/Info */}
          {job.status === 'failed' && (
            <div className="flex items-center gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-destructive">
                Import failed. Check the validation report for details.
              </span>
            </div>
          )}
          
          {job.duplicate_records > 0 && job.status === 'completed' && (
            <div className="flex items-center gap-2 p-3 bg-warning/5 border border-warning/20 rounded-lg">
              <Info className="h-4 w-4 text-warning" />
              <span className="text-sm text-warning">
                {job.duplicate_records} duplicate records were handled using {job.duplicate_strategy} strategy.
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};