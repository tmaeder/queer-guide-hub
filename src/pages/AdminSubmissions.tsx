import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
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
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  insertEntityFromSubmission,
  updateCommunitySubmission,
  insertCommunitySubmissionAudit,
} from '@/hooks/usePageFetchers';
import { submissionRegistry } from '@/config/submissionRegistry';
import { contentTypeRegistry } from '@/config/contentTypeRegistry';
import { FieldRenderer } from '@/components/cms/fields/FieldRenderer';
import { SubmissionMediaSection } from '@/components/admin/SubmissionMediaSection';
import { SubmissionsKanban } from '@/components/admin/SubmissionsKanban';
import { MergeDuplicatesDialog } from '@/components/admin/MergeDuplicatesDialog';
import { ActivityLog } from '@/components/admin/feedback/ActivityLog';
import { useFeedbackAudit } from '@/hooks/useFeedbackAudit';
import { useFeedbackAdmins, buildAdminMap } from '@/hooks/useFeedbackAdmins';
import { CheckCircle, XCircle, Eye, ArrowLeft, ThumbsUp, ThumbsDown, LayoutGrid, Table as TableIcon, GitMerge } from 'lucide-react';

interface SubmissionRow {
  id: string;
  content_type: string;
  status: string;
  feedback_status: string;
  data: Record<string, unknown>;
  submitted_by: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  promoted_to_id: string | null;
  promoted_to_table: string | null;
  // Social-ingestion media-aware columns (nullable on legacy rows).
  platform: string | null;
  media_processing_status: string | null;
  media_urls: string[] | null;
  queer_relevance_score: number | null;
  confidence_score: number | null;
  safety_flags: Array<{ type: string; severity: string; reason?: string }> | null;
  raw_text: string | null;
  ocr_text: string | null;
  vision_summary: string | null;
  transcript_text: string | null;
}

const PLATFORM_OPTIONS = [
  { label: 'Telegram', value: 'telegram' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'X / Twitter', value: 'x' },
  { label: 'Bluesky', value: 'bluesky' },
  { label: 'WhatsApp', value: 'whatsapp' },
  { label: 'FetLife', value: 'fetlife' },
  { label: 'Signal', value: 'signal' },
  { label: 'Email', value: 'email' },
  { label: 'Manual', value: 'manual' },
  { label: 'Admin', value: 'admin' },
  { label: 'Flyer', value: 'flyer' },
];

const feedbackStatusOptions = [
  { value: 'new', label: 'New', color: '#f59e0b' },
  { value: 'under_review', label: 'Under Review', color: '#3b82f6' },
  { value: 'planned', label: 'Planned', color: '#8b5cf6' },
  { value: 'in_progress', label: 'In Progress', color: '#f97316' },
  { value: 'done', label: 'Done', color: '#22c55e' },
];

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

/**
 * supabase-js / PostgREST errors are plain `{ message, code, details, hint }`
 * objects, not Error instances. The default `err instanceof Error` fallback
 * therefore swallowed every PostgREST failure into a generic toast. Pull the
 * message out of whatever shape we got.
 */
function errorMessage(err: unknown, fallback = 'Unknown error'): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const r = err as { message?: unknown; details?: unknown; hint?: unknown };
    if (typeof r.message === 'string' && r.message) return r.message;
    if (typeof r.details === 'string' && r.details) return r.details;
    if (typeof r.hint === 'string' && r.hint) return r.hint;
  }
  if (typeof err === 'string') return err;
  return fallback;
}

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

/** Embeddable content for use as a tab inside AdminReview */
export function AdminSubmissionsContent() {
  return <SubmissionsCore />;
}

export default function AdminSubmissions() {
  const navigate = useNavigate();
  return (
    <div className="max-w-screen-lg mx-auto p-6 flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <ArrowLeft style={{ height: 16, width: 16 }} /> Back to Admin
        </Button>
        <div>
          <h4 className="text-xl font-bold">
            Community Submissions
          </h4>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Review and manage community-submitted content
          </p>
        </div>
      </div>
      <SubmissionsCore />
    </div>
  );
}

interface ReputationRow { user_id: string; approved: number; rejected: number }

function useReputation() {
  return useQuery<Record<string, ReputationRow>>({
    queryKey: ['user-submission-reputation'],
    queryFn: async () => {
      const { data, error } = await untypedFrom('user_submission_reputation')
        .select('user_id,approved,rejected');
      if (error) throw error;
      const map: Record<string, ReputationRow> = {};
      for (const r of (data ?? []) as ReputationRow[]) map[r.user_id] = r;
      return map;
    },
    staleTime: 60_000,
  });
}

function SubmissionsCore() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: reputation = {} } = useReputation();

  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [mergeOpen, setMergeOpen] = useState(false);

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

      const { data: promoted, error: insertError } = await insertEntityFromSubmission(
        config.targetTable,
        cleanData,
      );
      if (insertError) throw insertError;
      if (!promoted) throw new Error('Insert returned no row');

      const oldStatus = submission.status;
      const { error: updateError } = await updateCommunitySubmission(submission.id, {
        status: 'approved',
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        reviewer_notes: reviewerNotes || null,
        promoted_to_id: promoted.id,
        promoted_to_table: config.targetTable,
      });
      if (updateError) throw updateError;

      // Audit trail — append-only, RLS-gated to admins/mods.
      if (oldStatus !== 'approved' && user?.id) {
        const auditRows = [
          { submission_id: submission.id, actor_id: user.id, field: 'status',
            old_value: oldStatus as unknown, new_value: 'approved' as unknown },
          { submission_id: submission.id, actor_id: user.id, field: 'promoted_to',
            old_value: null,
            new_value: { id: promoted.id, table: config.targetTable } as unknown },
        ];
        if (reviewerNotes) {
          auditRows.push({ submission_id: submission.id, actor_id: user.id,
            field: 'review_note', old_value: null, new_value: reviewerNotes as unknown });
        }
        const { error: auditErr } = await insertCommunitySubmissionAudit(auditRows);
        if (auditErr) console.error('Audit write failed:', auditErr.message);
      }

      toast({
        title: 'Submission approved',
        description: `${config.label} has been added to the database.`,
      });
      setDialogOpen(false);
      setSelectedSubmission(null);
      setReviewerNotes('');
      doRefresh();
    } catch (_err: unknown) {
      toast.error(`Approval failed: ${errorMessage}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (submission: SubmissionRow) => {
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('submission-action', {
        body: {
          submission_id: submission.id,
          action: 'reject',
          reason: reviewerNotes || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // submission-action handles status + audit; sync reviewer_notes/by separately
      // since it doesn't expose those columns.
      await updateCommunitySubmission(submission.id, {
        reviewed_by: user?.id,
        reviewer_notes: reviewerNotes || null,
      });

      toast.success('Submission rejected');
      setDialogOpen(false);
      setSelectedSubmission(null);
      setReviewerNotes('');
      doRefresh();
    } catch (_err: unknown) {
      toast.error(`Rejection failed: ${errorMessage}`);
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
            <div className="flex items-center gap-2">
              {Icon && (
                <Icon style={{ width: 16, height: 16, color: config?.color, flexShrink: 0 }} />
              )}
              <div className="font-medium">{getTitle(row)}</div>
            </div>
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
      columnHelper.accessor('platform', {
        header: 'Platform',
        cell: (info) => {
          const v = info.getValue();
          if (!v) return <span style={{ color: 'var(--muted-foreground)' }}>—</span>;
          return <Badge variant="outline">{v}</Badge>;
        },
        meta: { serverSortable: true, groupable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('feedback_status', {
        header: 'Board Status',
        cell: (info) => {
          const row = info.row.original;
          if (row.content_type !== 'feedback') return '-';
          const opt = feedbackStatusOptions.find((o) => o.value === info.getValue());
          return opt ? (
            <Badge variant="secondary" style={{ backgroundColor: opt.color, color: '#fff' }}>
              {opt.label}
            </Badge>
          ) : (
            info.getValue() || '-'
          );
        },
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('submitted_at', {
        header: 'Submitted',
        cell: (info) => formatDate(info.getValue()),
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('submitted_by', {
        id: 'submitter',
        header: 'Submitter',
        cell: (info) => {
          const uid = info.getValue();
          if (!uid) return '—';
          const r = reputation[uid];
          if (!r) return <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{uid.slice(0, 6)}…</span>;
          return (
            <div className="flex items-center gap-2 text-xs">
              <span style={{ fontFamily: 'monospace' }}>{uid.slice(0, 6)}…</span>
              <Badge variant="default" style={{ background: '#d1fadf', color: '#198754' }}>✓ {r.approved}</Badge>
              {r.rejected > 0 && (
                <Badge variant="destructive">✗ {r.rejected}</Badge>
              )}
            </div>
          );
        },
        meta: { hideable: true } satisfies AdminColumnMeta,
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
    [reputation],
  );

  const tableConfig: AdminTableConfig<SubmissionRow> = useMemo(
    () => ({
      tableName: 'community_submissions',
      select:
        'id,content_type,status,feedback_status,data,submitted_by,submitted_at,reviewed_by,reviewed_at,reviewer_notes,promoted_to_id,promoted_to_table,platform,media_processing_status,media_urls,queer_relevance_score,confidence_score,safety_flags,raw_text,ocr_text,vision_summary,transcript_text',
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
        {
          key: 'platform',
          label: 'Platform',
          type: 'select' as const,
          column: 'platform',
          options: PLATFORM_OPTIONS,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleApprove/handleReject are stable, adding would defeat memoization
    [columns],
  );

  const openReview = useCallback((row: SubmissionRow) => {
    setSelectedSubmission(row);
    setReviewerNotes(row.reviewer_notes || '');
    setDialogOpen(true);
  }, []);

  return (
    <>
      <div className="flex justify-end mb-3 gap-1">
        <Button
          variant={view === 'table' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setView('table')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <TableIcon style={{ width: 14, height: 14 }} /> Table
        </Button>
        <Button
          variant={view === 'kanban' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setView('kanban')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <LayoutGrid style={{ width: 14, height: 14 }} /> Kanban
        </Button>
      </div>

      {view === 'table' ? (
        <AdminDataTable config={tableConfig} />
      ) : (
        <SubmissionsKanban onCardClick={openReview} />
      )}

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

              <div className="flex gap-2 flex-wrap mb-4">
                <Badge variant={statusConfig[selectedSubmission.status]?.variant || 'outline'}>
                  {statusConfig[selectedSubmission.status]?.label || selectedSubmission.status}
                </Badge>
                <Badge variant="secondary">
                  {submissionRegistry[selectedSubmission.content_type]?.label ||
                    selectedSubmission.content_type}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  Submitted {formatDate(selectedSubmission.submitted_at)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
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
                      <div key={fieldName} className={fieldConfig.colSpan === 2 ? "col-span-full" : undefined}>
                        <FieldRenderer
                          field={{ ...fieldConfig, readOnly: true, hidden: false }}
                          value={value}
                          onChange={() => {}}
                          disabled
                        />
                      </div>
                    );
                  });
                })()}
              </div>

              <SubmissionActivityPanel submissionId={selectedSubmission.id} />

              <SubmissionMediaSection
                platform={selectedSubmission.platform}
                mediaProcessingStatus={selectedSubmission.media_processing_status}
                mediaUrls={selectedSubmission.media_urls}
                queerRelevanceScore={selectedSubmission.queer_relevance_score}
                confidenceScore={selectedSubmission.confidence_score}
                safetyFlags={selectedSubmission.safety_flags}
                rawText={selectedSubmission.raw_text}
                ocrText={selectedSubmission.ocr_text}
                visionSummary={selectedSubmission.vision_summary}
                transcriptText={selectedSubmission.transcript_text}
              />

              {/* Feedback board status selector */}
              {selectedSubmission.content_type === 'feedback' && (
                <div className="mb-4">
                  <p className="text-sm font-medium">
                    Board Status
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {feedbackStatusOptions.map((opt) => (
                      <Badge
                        key={opt.value}
                        variant={selectedSubmission.feedback_status === opt.value ? 'default' : 'outline'}
                        style={{
                          cursor: 'pointer',
                          ...(selectedSubmission.feedback_status === opt.value
                            ? { backgroundColor: opt.color, color: '#fff' }
                            : {}),
                        }}
                        onClick={async () => {
                          const { error } = await updateCommunitySubmission(selectedSubmission.id, {
                            feedback_status: opt.value,
                          });
                          if (!error) {
                            setSelectedSubmission({ ...selectedSubmission, feedback_status: opt.value });
                            doRefresh();
                            toast({ title: `Status updated to "${opt.label}"` });
                          }
                        }}
                      >
                        {opt.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-4">
                <p className="text-sm font-medium">
                  Reviewer Notes
                </p>
                <Textarea
                  placeholder="Add notes about this submission (optional)..."
                  value={reviewerNotes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setReviewerNotes(e.target.value)
                  }
                  style={{ minHeight: 60 }}
                />
              </div>

              {selectedSubmission.status === 'pending' && (
                <DialogFooter>
                  <div className="flex gap-3 w-full justify-end">
                    <Button
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      disabled={actionLoading}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setMergeOpen(true)}
                      disabled={actionLoading}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <GitMerge style={{ width: 14, height: 14 }} /> Merge…
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
                  </div>
                </DialogFooter>
              )}

              {selectedSubmission.status !== 'pending' && selectedSubmission.reviewed_at && (
                <div className="p-4 bg-muted rounded mt-2">
                  <p className="text-sm text-muted-foreground">
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
                  </p>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {selectedSubmission && (
        <MergeDuplicatesDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          submissionId={selectedSubmission.id}
          contentType={selectedSubmission.content_type}
          currentDuplicateOf={null}
          onMerged={() => {
            setMergeOpen(false);
            setDialogOpen(false);
            doRefresh();
          }}
        />
      )}
    </>
  );
}

function SubmissionActivityPanel({ submissionId }: { submissionId: string }) {
  const { data: entries } = useFeedbackAudit(submissionId);
  const { data: admins = [] } = useFeedbackAdmins();
  const adminById = useMemo(() => buildAdminMap(admins), [admins]);
  if (!entries || entries.length === 0) return null;
  return (
    <div className="mb-6 border-t border-border pt-4">
      <ActivityLog entries={entries} adminById={adminById} />
    </div>
  );
}
