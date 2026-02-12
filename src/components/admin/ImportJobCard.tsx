import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
      <Card sx={{ '&:hover': { opacity: 0.9 }, transition: 'all 0.2s', cursor: 'pointer' }}>
        <CardContent sx={{ p: 2 }} onClick={() => onViewDetails(job.id)}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'primary.light' }}>
                <JobTypeIcon style={{ width: 16, height: 16, color: 'var(--primary)' }} />
              </Box>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{job.type}</Typography>
                  <ImportStatusBadge status={job.status} size="sm" />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {job.processed_records}/{job.total_records} • {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Progress value={job.progress_percentage} sx={{ width: 64, height: 8 }} />
              <Typography variant="body2" sx={{ fontWeight: 500, width: 40, textAlign: 'right' }}>{job.progress_percentage}%</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ '&:hover': { opacity: 0.9 }, transition: 'all 0.3s', bgcolor: 'background.paper' }}>
      <CardContent sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'primary.light' }}>
              <JobTypeIcon style={{ width: 24, height: 24, color: 'var(--primary)' }} />
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <Typography variant="h6">{job.type}</Typography>
                <ImportStatusBadge status={job.status} />
                {job.source_type && (
                  <Badge variant="outline" sx={{ fontSize: '0.75rem' }}>
                    {job.source_type}
                  </Badge>
                )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Clock style={{ width: 12, height: 12 }} />
                  <Typography variant="body2" color="text.secondary">Created {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}</Typography>
                </Box>
                {job.file_name && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <FileText style={{ width: 12, height: 12 }} />
                    <Typography variant="body2" color="text.secondary">{job.file_name}</Typography>
                  </Box>
                )}
                {job.file_size && (
                  <Typography variant="body2" color="text.secondary">{formatFileSize(job.file_size)}</Typography>
                )}
              </Box>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewDetails(job.id)}
              sx={{ gap: 1 }}
            >
              <Eye style={{ width: 16, height: 16 }} />
              Details
            </Button>
            {canExport && onExport && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onExport(job)}
                sx={{ gap: 1 }}
              >
                <Download style={{ width: 16, height: 16 }} />
                Export
              </Button>
            )}
            {canCancel && onCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCancel(job.id)}
                sx={{ gap: 1, color: 'error.main', '&:hover': { color: 'error.main' } }}
              >
                <X style={{ width: 16, height: 16 }} />
                Cancel
              </Button>
            )}
          </Box>
        </Box>

        {/* Progress Section */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>Progress</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{job.progress_percentage}%</Typography>
          </Box>
          <Progress value={job.progress_percentage} sx={{ height: 8 }} />

          {/* Statistics Grid */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 2, pt: 2 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'primary.main' }}>{job.total_records.toLocaleString()}</Typography>
              <Typography variant="caption" color="text.secondary">Total</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{job.processed_records.toLocaleString()}</Typography>
              <Typography variant="caption" color="text.secondary">Processed</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'success.main' }}>{job.successful_records.toLocaleString()}</Typography>
              <Typography variant="caption" color="text.secondary">Success</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'error.main' }}>{job.failed_records.toLocaleString()}</Typography>
              <Typography variant="caption" color="text.secondary">Failed</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'warning.main' }}>{job.duplicate_records.toLocaleString()}</Typography>
              <Typography variant="caption" color="text.secondary">Duplicates</Typography>
            </Box>
          </Box>

          {/* Configuration */}
          {(job.duplicate_strategy || job.unique_key_fields?.length) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pt: 1.5 }}>
              {job.duplicate_strategy && (
                <Badge variant="outline" sx={{ gap: 0.5 }}>
                  <Settings style={{ width: 12, height: 12 }} />
                  {job.duplicate_strategy.replace('_', ' ')}
                </Badge>
              )}
              {job.unique_key_fields?.length && (
                <Badge variant="outline" sx={{ gap: 0.5 }}>
                  <Database style={{ width: 12, height: 12 }} />
                  {job.unique_key_fields.length} key field(s)
                </Badge>
              )}
            </Box>
          )}

          {/* Warnings/Info */}
          {job.status === 'failed' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, bgcolor: 'error.light', borderRadius: 2 }}>
              <AlertTriangle style={{ width: 16, height: 16, color: 'var(--destructive)' }} />
              <Typography variant="body2" color="error.main">
                Import failed. Check the validation report for details.
              </Typography>
            </Box>
          )}

          {job.duplicate_records > 0 && job.status === 'completed' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, bgcolor: 'warning.light', borderRadius: 2 }}>
              <Info style={{ width: 16, height: 16, color: 'var(--warning)' }} />
              <Typography variant="body2" color="warning.main">
                {job.duplicate_records} duplicate records were handled using {job.duplicate_strategy} strategy.
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};
