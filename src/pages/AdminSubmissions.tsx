import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { AdminDataTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/integrations/api/client';
import { submissionRegistry } from '@/config/submissionRegistry';
import { contentTypeRegistry } from '@/config/contentTypeRegistry';
import { FieldRenderer } from '@/components/cms/fields/FieldRenderer';
import { CheckCircle, XCircle, Eye, ArrowLeft, ThumbsUp, ThumbsDown } from 'lucide-react';

interface SubmissionRow {
  id: string;
  content_type: string;
  status: string;
  data: Record<string, unknown>;
  submitted_by: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  promoted_to_id: string | null;
  promoted_to_table: string | null;
}

const statusConfig: Record<
  string,
  { label: string; color: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  pending: { label: 'Pending', color: '#f59e0b', variant: 'outline' },
  approved: { label: 'Approved', color: '#22c55e', variant: 'default' },
  rejected: { label: 'Rejected', color: '#ef4444', variant: 'destructive' },
  merged: { label: 'Merged', color: '#6366f1', variant: 'secondary' },
};

const contentTypeOptions = Object.values(submissionRegistry).map((cfg) => ({
  label: cfg.label,
  value: cfg.id,
}));

const columnHelper = createColumnHelper<SubmissionRow>();

const getTitle = (s: SubmissionRow) => {
  const config = submissionRegistry[s.content_type];
  return String(s.data?.[config?.titleField || 'name'] || 'Untitled');
};

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export default function AdminSubmissions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const doRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin-table', 'community_submissions'] });
  }, [queryClient]);

  const handleApprove = async (submission: SubmissionRow) => {
    setActionLoading(true);
    try {
      const config = submissionRegistry[submission.content_type];
      if (!config) throw new Error(`Unknown content type: ${submission.content_type}`);

      const cleanData: Record<string, unknown> = { ...config.defaults };
      for (const [key, val] of Object.entries(submission.data)) {
        if (val !== '' && val !== undefined && val !== null) cleanData[key] = val;
      }
      if ('featured' in cleanData === false) cleanData.featured = false;

      const { data: promoted, error: insertError } = await supabase
        .from(config.targetTable as any)
        .insert(cleanData)
        .select('id')
        .single();
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from('community_submissions' as any)
        .update({
          status: 'approved',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          reviewer_notes: reviewerNotes || null,
          promoted_to_id: promoted.id,
          promoted_to_table: config.targetTable,
        })
        .eq('id', submission.id);
      if (updateError) throw updateError;

      toast({
        title: 'Submission approved',
        description: `${config.label} has been added to the database.`,
      });
      setDialogOpen(false);
      setSelectedSubmission(null);
      setReviewerNotes('');
      doRefresh();
    } catch (err: any) {
      toast({ title: 'Approval failed', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (submission: SubmissionRow) => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('community_submissions' as any)
        .update({
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          reviewer_notes: reviewerNotes || null,
        })
        .eq('id', submission.id);
      if (error) throw error;

      toast({ title: 'Submission rejected' });
      setDialogOpen(false);
      setSelectedSubmission(null);
      setReviewerNotes('');
      doRefresh();
    } catch (err: any) {
      toast({ title: 'Rejection failed', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'title',
        header: 'Title',
        cell: (info) => {
          const row = info.row.original;
          const config = submissionRegistry[row.content_type];
          const Icon = config?.icon;
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {Icon && (
                <Icon style={{ width: 16, height: 16, color: config?.color, flexShrink: 0 }} />
              )}
              <Box sx={{ fontWeight: 500 }}>{getTitle(row)}</Box>
            </Box>
          );
        },
        meta: { hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('content_type', {
        header: 'Type',
        cell: (info) => {
          const config = submissionRegistry[info.getValue()];
          return <Badge variant="secondary">{config?.label || info.getValue()}</Badge>;
        },
        meta: { serverSortable: true, groupable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => {
          const sc = statusConfig[info.getValue()] || statusConfig.pending;
          return (
            <Badge
              variant={sc.variant}
              style={{ backgroundColor: sc.variant === 'outline' ? undefined : sc.color }}
            >
              {sc.label}
            </Badge>
          );
        },
        meta: { serverSortable: true, groupable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('submitted_at', {
        header: 'Submitted',
        cell: (info) => formatDate(info.getValue()),
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('reviewed_at', {
        header: 'Reviewed',
        cell: (info) => {
          const val = info.getValue();
          return val ? formatDate(val) : '-';
        },
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
    ],
    [],
  );

  const tableConfig: AdminTableConfig<SubmissionRow> = useMemo(
    () => ({
      tableName: 'community_submissions',
      select:
        'id,content_type,status,data,submitted_by,submitted_at,reviewed_by,reviewed_at,reviewer_notes,promoted_to_id,promoted_to_table',
      columns,
      defaultSort: { column: 'submitted_at', direction: 'desc' as const },
      defaultPageSize: 25,
      enableSelection: true,
      enableSearch: false,
      entityFilters: [
        {
          key: 'status',
          label: 'Status',
          type: 'select' as const,
          column: 'status',
          options: [
            { label: 'Pending', value: 'pending' },
            { label: 'Approved', value: 'approved' },
            { label: 'Rejected', value: 'rejected' },
            { label: 'Merged', value: 'merged' },
          ],
        },
        {
          key: 'content_type',
          label: 'Type',
          type: 'select' as const,
          column: 'content_type',
          options: contentTypeOptions,
        },
      ],
      bulkEditFields: [
        {
          key: 'status',
          label: 'Status',
          type: 'select' as const,
          column: 'status',
          options: [
            { label: 'Pending', value: 'pending' },
            { label: 'Approved', value: 'approved' },
            { label: 'Rejected', value: 'rejected' },
          ],
        },
      ],
      rowActions: [
        {
          key: 'review',
          label: 'View / Review',
          icon: Eye,
          onClick: (row) => {
            setSelectedSubmission(row);
            setReviewerNotes(row.reviewer_notes || '');
            setDialogOpen(true);
          },
        },
        {
          key: 'approve',
          label: 'Quick Approve',
          icon: CheckCircle,
          visible: (row) => row.status === 'pending',
          onClick: (row) => handleApprove(row),
        },
        {
          key: 'reject',
          label: 'Quick Reject',
          icon: XCircle,
          variant: 'destructive' as const,
          visible: (row) => row.status === 'pending',
          onClick: (row) => handleReject(row),
        },
      ],
    }),
    [columns],
  );

  return (
    <Box
      sx={{ maxWidth: 'lg', mx: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <ArrowLeft style={{ height: 16, width: 16 }} /> Back to Admin
        </Button>
        <div>
          <Typography variant="h4" component="h1" sx={{ fontSize: '1.875rem', fontWeight: 700 }}>
            Community Submissions
          </Typography>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Review and manage community-submitted content
          </p>
        </div>
      </Box>

      <AdminDataTable config={tableConfig} />

      {/* Detail / Review Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent style={{ maxWidth: 640, maxHeight: '85vh', overflowY: 'auto' }}>
          {selectedSubmission && (
            <>
              <DialogHeader>
                <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {(() => {
                    const Icon = submissionRegistry[selectedSubmission.content_type]?.icon;
                    return Icon ? (
                      <Icon
                        style={{
                          width: 20,
                          height: 20,
                          color: submissionRegistry[selectedSubmission.content_type]?.color,
                        }}
                      />
                    ) : null;
                  })()}
                  {getTitle(selectedSubmission)}
                </DialogTitle>
              </DialogHeader>

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <Badge variant={statusConfig[selectedSubmission.status]?.variant || 'outline'}>
                  {statusConfig[selectedSubmission.status]?.label || selectedSubmission.status}
                </Badge>
                <Badge variant="secondary">
                  {submissionRegistry[selectedSubmission.content_type]?.label ||
                    selectedSubmission.content_type}
                </Badge>
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  Submitted {formatDate(selectedSubmission.submitted_at)}
                </Typography>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
                {(() => {
                  const config = submissionRegistry[selectedSubmission.content_type];
                  const contentConfig = config ? contentTypeRegistry[config.contentType] : null;
                  if (!config || !contentConfig) return null;
                  const allFieldNames = config.steps.flatMap((s) => s.fields);
                  return allFieldNames.map((fieldName) => {
                    const fieldConfig = contentConfig.fields.find((f) => f.name === fieldName);
                    if (!fieldConfig) return null;
                    const value = selectedSubmission.data?.[fieldName];
                    if (value === undefined || value === null || value === '') return null;
                    return (
                      <Box
                        key={fieldName}
                        sx={{ gridColumn: fieldConfig.colSpan === 2 ? '1 / -1' : undefined }}
                      >
                        <FieldRenderer
                          field={{ ...fieldConfig, readOnly: true, hidden: false }}
                          value={value}
                          onChange={() => {}}
                          disabled
                        />
                      </Box>
                    );
                  });
                })()}
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  Reviewer Notes
                </Typography>
                <Textarea
                  placeholder="Add notes about this submission (optional)..."
                  value={reviewerNotes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setReviewerNotes(e.target.value)
                  }
                  style={{ minHeight: 60 }}
                />
              </Box>

              {selectedSubmission.status === 'pending' && (
                <DialogFooter>
                  <Box
                    sx={{ display: 'flex', gap: 1.5, width: '100%', justifyContent: 'flex-end' }}
                  >
                    <Button
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      disabled={actionLoading}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => handleReject(selectedSubmission)}
                      disabled={actionLoading}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <ThumbsDown style={{ width: 14, height: 14 }} /> Reject
                    </Button>
                    <Button
                      onClick={() => handleApprove(selectedSubmission)}
                      disabled={actionLoading}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: '#22c55e',
                        color: '#fff',
                      }}
                    >
                      <ThumbsUp style={{ width: 14, height: 14 }} />{' '}
                      {actionLoading ? 'Processing...' : 'Approve & Publish'}
                    </Button>
                  </Box>
                </DialogFooter>
              )}

              {selectedSubmission.status !== 'pending' && selectedSubmission.reviewed_at && (
                <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1, mt: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Reviewed on {formatDate(selectedSubmission.reviewed_at)}
                    {selectedSubmission.reviewer_notes && (
                      <>
                        <br />
                        <strong>Notes:</strong> {selectedSubmission.reviewer_notes}
                      </>
                    )}
                    {selectedSubmission.promoted_to_id && (
                      <>
                        <br />
                        Promoted to <code>{selectedSubmission.promoted_to_table}</code> (
                        {selectedSubmission.promoted_to_id})
                      </>
                    )}
                  </Typography>
                </Box>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
