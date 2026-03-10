/**
 * AdminReview — Unified review & moderation dashboard.
 * Accepts ?tab= query param to deep-link to a specific tab.
 */

import { Suspense, lazy, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import {
  Inbox,
  Flag,
  FileCheck,
  Tag,
  Shield,
  GitMerge,
  CheckCheck,
  Loader2,
  Zap,
  Clock,
  XCircle,
  Sparkles,
  VolumeX,
} from 'lucide-react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { useReviewCounts, type ReviewCounts } from '@/hooks/useReviewCounts';
import { api } from '@/integrations/api/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// Lazy-load tab contents to keep initial bundle small
const ReviewQueueEnhanced = lazy(() =>
  import('@/components/admin/import-hub/ReviewQueueEnhanced').then((m) => ({
    default: m.ReviewQueueEnhanced,
  })),
);
const ModerationQueue = lazy(() =>
  import('@/components/admin/ModerationQueue').then((m) => ({ default: m.ModerationQueue })),
);
const ReviewQueue = lazy(() =>
  import('@/components/cms/ReviewQueue').then((m) => ({ default: m.ReviewQueue })),
);
const TagSuggestionsQueue = lazy(() =>
  import('@/components/admin/TagSuggestionsQueue').then((m) => ({
    default: m.TagSuggestionsQueue,
  })),
);
const AutoCleanDuplicatesTab = lazy(() =>
  import('@/components/admin/AutoCleanDuplicatesTab').then((m) => ({
    default: m.AutoCleanDuplicatesTab,
  })),
);
const AutomationReviewTab = lazy(() =>
  import('@/components/admin/automation/AutomationReviewTab').then((m) => ({
    default: m.AutomationReviewTab,
  })),
);
const AutoModerationQueue = lazy(() =>
  import('@/components/admin/AutoModerationQueue').then((m) => ({
    default: m.AutoModerationQueue,
  })),
);

const VALID_TABS = [
  'staging',
  'moderation',
  'content',
  'tags',
  'duplicates',
  'automation',
] as const;
type TabId = (typeof VALID_TABS)[number];

function isValidTab(value: string | null): value is TabId {
  return VALID_TABS.includes(value as TabId);
}

interface StatCardProps {
  icon: typeof Inbox;
  label: string;
  count: number;
  color: string;
  active?: boolean;
  onClick?: () => void;
}

function StatCard({ icon: Icon, label, count, color, active, onClick }: StatCardProps) {
  return (
    <Card
      onClick={onClick}
      style={{
        cursor: 'pointer',
        borderColor: active ? color : undefined,
        borderWidth: active ? '1px 1px 3px 1px' : '1px',
        opacity: count === 0 && !active ? 0.45 : 1,
        transition: 'border-color 0.15s, opacity 0.15s',
      }}
    >
      <CardContent sx={{ p: 2, textAlign: 'center', '&:last-child': { pb: 2 } }}>
        <Box
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}
        >
          <Icon style={{ height: 20, width: 20, color }} />
          <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {count.toLocaleString()}
          </Typography>
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {label}
        </Typography>
      </CardContent>
    </Card>
  );
}

const Loading = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
    <CircularProgress size={28} />
  </Box>
);

const TAB_COUNT_KEY: Record<TabId, keyof ReviewCounts> = {
  staging: 'staging',
  moderation: 'moderation',
  content: 'cmsReview',
  tags: 'tagSuggestions',
  duplicates: 'duplicates',
  automation: 'automation',
};

const TAB_PRIORITY: TabId[] = [
  'moderation',
  'staging',
  'content',
  'tags',
  'duplicates',
  'automation',
];

export default function AdminReview() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const { user } = useAuth();

  const { data: counts, refetch: refetchCounts } = useReviewCounts();
  const c = counts ?? {
    staging: 0,
    cmsReview: 0,
    moderation: 0,
    tagSuggestions: 0,
    duplicates: 0,
    automation: 0,
    total: 0,
  };

  // ── Master Bulk Actions ──────────────────────────────────────
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<
    | 'approve'
    | 'enrich'
    | 'dedup'
    | 'reject_stale'
    | 'approve_confident'
    | 'dismiss_low'
    | 'reject_all'
    | null
  >(null);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ success: number; failed: number } | null>(null);

  const openBulkDialog = (action: typeof bulkAction & string) => {
    setBulkAction(action);
    setBulkProgress(0);
    setBulkResult(null);
    setBulkDialogOpen(true);
  };

  const handleBulkExecute = useCallback(async () => {
    if (!bulkAction || !user) return;
    setBulkRunning(true);
    setBulkProgress(0);
    let success = 0;
    let failed = 0;

    try {
      if (bulkAction === 'approve') {
        // Approve all tag suggestions
        const { data: tags } = await api
          .from('tag_suggestions' as any)
          .select('id')
          .eq('status', 'pending')
          .limit(1000);
        const tagIds = (tags ?? []).map((t: any) => t.id);
        if (tagIds.length > 0) {
          const { error } = await api.rpc('approve_tag_suggestions' as any, {
            p_suggestion_ids: tagIds,
            p_reviewer_id: user.id,
          });
          if (!error) success += tagIds.length;
          else failed += tagIds.length;
        }
        setBulkProgress(33);

        // Approve all CMS content in review
        const { data: cmsItems } = await api
          .from('cms_content_metadata' as any)
          .select('id, source_table, source_id')
          .eq('workflow_state', 'review')
          .limit(500);
        for (const item of cmsItems ?? []) {
          const { error } = await api
            .from('cms_content_metadata' as any)
            .update({
              workflow_state: 'published',
              published_at: new Date().toISOString(),
              published_by: user.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);
          if (!error) success++;
          else failed++;
        }
        setBulkProgress(66);

        // Resolve all moderation flags
        const { data: modFlags } = await api
          .from('moderation_flags' as any)
          .select('id')
          .eq('status', 'OPEN')
          .limit(500);
        if ((modFlags ?? []).length > 0) {
          const { error } = await api
            .from('moderation_flags' as any)
            .update({
              status: 'RESOLVED',
              reviewed_by: user.id,
              reviewed_at: new Date().toISOString(),
              resolution_note: 'Bulk approved via Review & Moderation',
            })
            .in(
              'id',
              (modFlags ?? []).map((f: any) => f.id),
            );
          if (!error) success += (modFlags ?? []).length;
          else failed += (modFlags ?? []).length;
        }
        setBulkProgress(100);
      }

      if (bulkAction === 'enrich') {
        // Apply all automation suggestions
        const { data: flags } = await api
          .from('content_flags' as any)
          .select('id, content_type, content_id, suggested_value')
          .eq('status', 'pending')
          .not('suggested_value', 'is', null)
          .limit(500);

        const total = (flags ?? []).length;
        for (let i = 0; i < total; i++) {
          const flag = (flags ?? [])[i];
          const { error: applyError } = await api
            .from(flag.content_type as any)
            .update(flag.suggested_value)
            .eq('id', flag.content_id);

          const { error: flagError } = await api
            .from('content_flags' as any)
            .update({
              status: 'approved',
              reviewed_at: new Date().toISOString(),
              applied_at: new Date().toISOString(),
            })
            .eq('id', flag.id);

          if (!applyError && !flagError) success++;
          else failed++;
          setBulkProgress(Math.round(((i + 1) / total) * 100));
        }
      }

      if (bulkAction === 'dedup') {
        // Approve all staging items with dedup_status = 'unique'
        const { data: uniqueItems } = await api
          .from('ingestion_staging' as any)
          .select('id')
          .eq('review_status', 'pending_review')
          .eq('disposition', 'pending')
          .eq('dedup_status', 'unique')
          .limit(1000);

        if ((uniqueItems ?? []).length > 0) {
          const { error } = await api
            .from('ingestion_staging' as any)
            .update({
              disposition: 'approved',
              review_status: 'approved',
              reviewed_at: new Date().toISOString(),
            })
            .in(
              'id',
              (uniqueItems ?? []).map((i: any) => i.id),
            );
          if (!error) success += (uniqueItems ?? []).length;
          else failed += (uniqueItems ?? []).length;
        }
        setBulkProgress(50);

        // Reject all duplicates
        const { data: dupItems } = await api
          .from('ingestion_staging' as any)
          .select('id')
          .eq('review_status', 'pending_review')
          .eq('disposition', 'pending')
          .eq('dedup_status', 'duplicate')
          .limit(1000);

        if ((dupItems ?? []).length > 0) {
          const { error } = await api
            .from('ingestion_staging' as any)
            .update({
              disposition: 'rejected',
              review_status: 'rejected',
              reviewed_at: new Date().toISOString(),
            })
            .in(
              'id',
              (dupItems ?? []).map((i: any) => i.id),
            );
          if (!error) success += (dupItems ?? []).length;
          else failed += (dupItems ?? []).length;
        }
        setBulkProgress(100);
      }

      if (bulkAction === 'reject_stale') {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        // Reject stale moderation flags
        const { data: staleFlags } = await api
          .from('moderation_flags' as any)
          .select('id')
          .eq('status', 'OPEN')
          .lt('created_at', cutoff)
          .limit(500);
        if ((staleFlags ?? []).length > 0) {
          const { error } = await api
            .from('moderation_flags' as any)
            .update({
              status: 'REJECTED',
              reviewed_by: user.id,
              reviewed_at: new Date().toISOString(),
              resolution_note: 'Auto-rejected: stale (>7 days)',
            })
            .in(
              'id',
              (staleFlags ?? []).map((f: any) => f.id),
            );
          if (!error) success += (staleFlags ?? []).length;
          else failed += (staleFlags ?? []).length;
        }
        setBulkProgress(25);

        // Reject stale tag suggestions
        const { data: staleTags } = await api
          .from('tag_suggestions' as any)
          .select('id')
          .eq('status', 'pending')
          .lt('created_at', cutoff)
          .limit(500);
        if ((staleTags ?? []).length > 0) {
          const { error } = await api
            .from('tag_suggestions' as any)
            .update({
              status: 'rejected',
              reviewed_by: user.id,
              reviewed_at: new Date().toISOString(),
            })
            .in(
              'id',
              (staleTags ?? []).map((t: any) => t.id),
            );
          if (!error) success += (staleTags ?? []).length;
          else failed += (staleTags ?? []).length;
        }
        setBulkProgress(50);

        // Dismiss stale automation flags
        const { data: staleAuto } = await api
          .from('content_flags' as any)
          .select('id')
          .eq('status', 'pending')
          .lt('created_at', cutoff)
          .limit(500);
        if ((staleAuto ?? []).length > 0) {
          const { error } = await api
            .from('content_flags' as any)
            .update({
              status: 'expired',
              reviewed_at: new Date().toISOString(),
            })
            .in(
              'id',
              (staleAuto ?? []).map((f: any) => f.id),
            );
          if (!error) success += (staleAuto ?? []).length;
          else failed += (staleAuto ?? []).length;
        }
        setBulkProgress(75);

        // Reject stale staging items
        const { data: staleStaging } = await api
          .from('ingestion_staging' as any)
          .select('id')
          .eq('review_status', 'pending_review')
          .eq('disposition', 'pending')
          .lt('created_at', cutoff)
          .limit(500);
        if ((staleStaging ?? []).length > 0) {
          const { error } = await api
            .from('ingestion_staging' as any)
            .update({
              disposition: 'rejected',
              review_status: 'rejected',
              reviewed_at: new Date().toISOString(),
            })
            .in(
              'id',
              (staleStaging ?? []).map((s: any) => s.id),
            );
          if (!error) success += (staleStaging ?? []).length;
          else failed += (staleStaging ?? []).length;
        }
        setBulkProgress(100);
      }

      if (bulkAction === 'approve_confident') {
        // Approve high-confidence tag suggestions (>= 0.8)
        const { data: confidentTags } = await api
          .from('tag_suggestions' as any)
          .select('id')
          .eq('status', 'pending')
          .gte('confidence', 0.8)
          .limit(1000);
        if ((confidentTags ?? []).length > 0) {
          const { data: count, error } = await api.rpc('approve_tag_suggestions' as any, {
            p_suggestion_ids: (confidentTags ?? []).map((t: any) => t.id),
            p_reviewer_id: user.id,
          });
          if (!error) success += (confidentTags ?? []).length;
          else failed += (confidentTags ?? []).length;
        }
        setBulkProgress(50);

        // Approve + apply high-confidence automation flags (>= 0.8)
        const { data: confidentFlags } = await api
          .from('content_flags' as any)
          .select('id, content_type, content_id, suggested_value')
          .eq('status', 'pending')
          .gte('confidence', 0.8)
          .not('suggested_value', 'is', null)
          .limit(500);
        const total = (confidentFlags ?? []).length;
        for (let i = 0; i < total; i++) {
          const flag = (confidentFlags ?? [])[i];
          const { error: applyError } = await api
            .from(flag.content_type as any)
            .update(flag.suggested_value)
            .eq('id', flag.content_id);
          const { error: flagError } = await api
            .from('content_flags' as any)
            .update({
              status: 'approved',
              reviewed_at: new Date().toISOString(),
              applied_at: new Date().toISOString(),
            })
            .eq('id', flag.id);
          if (!applyError && !flagError) success++;
          else failed++;
          setBulkProgress(50 + Math.round(((i + 1) / Math.max(total, 1)) * 50));
        }
        if (total === 0) setBulkProgress(100);
      }

      if (bulkAction === 'dismiss_low') {
        // Dismiss all info-severity automation flags
        const { data: infoFlags } = await api
          .from('content_flags' as any)
          .select('id')
          .eq('status', 'pending')
          .eq('severity', 'info')
          .limit(1000);
        if ((infoFlags ?? []).length > 0) {
          const { error } = await api
            .from('content_flags' as any)
            .update({
              status: 'rejected',
              reviewed_at: new Date().toISOString(),
            })
            .in(
              'id',
              (infoFlags ?? []).map((f: any) => f.id),
            );
          if (!error) success += (infoFlags ?? []).length;
          else failed += (infoFlags ?? []).length;
        }
        setBulkProgress(50);

        // Dismiss all warning-severity automation flags
        const { data: warnFlags } = await api
          .from('content_flags' as any)
          .select('id')
          .eq('status', 'pending')
          .eq('severity', 'warning')
          .limit(1000);
        if ((warnFlags ?? []).length > 0) {
          const { error } = await api
            .from('content_flags' as any)
            .update({
              status: 'rejected',
              reviewed_at: new Date().toISOString(),
            })
            .in(
              'id',
              (warnFlags ?? []).map((f: any) => f.id),
            );
          if (!error) success += (warnFlags ?? []).length;
          else failed += (warnFlags ?? []).length;
        }
        setBulkProgress(100);
      }

      if (bulkAction === 'reject_all') {
        // Reject all moderation flags
        const { data: openFlags } = await api
          .from('moderation_flags' as any)
          .select('id')
          .eq('status', 'OPEN')
          .limit(500);
        if ((openFlags ?? []).length > 0) {
          const { error } = await api
            .from('moderation_flags' as any)
            .update({
              status: 'REJECTED',
              reviewed_by: user.id,
              reviewed_at: new Date().toISOString(),
              resolution_note: 'Bulk rejected via Review & Moderation',
            })
            .in(
              'id',
              (openFlags ?? []).map((f: any) => f.id),
            );
          if (!error) success += (openFlags ?? []).length;
          else failed += (openFlags ?? []).length;
        }
        setBulkProgress(20);

        // Reject all tag suggestions
        const { data: pendingTags } = await api
          .from('tag_suggestions' as any)
          .select('id')
          .eq('status', 'pending')
          .limit(1000);
        if ((pendingTags ?? []).length > 0) {
          const { error } = await api
            .from('tag_suggestions' as any)
            .update({
              status: 'rejected',
              reviewed_by: user.id,
              reviewed_at: new Date().toISOString(),
            })
            .in(
              'id',
              (pendingTags ?? []).map((t: any) => t.id),
            );
          if (!error) success += (pendingTags ?? []).length;
          else failed += (pendingTags ?? []).length;
        }
        setBulkProgress(40);

        // Reject CMS review items (back to draft)
        const { data: cmsItems } = await api
          .from('cms_content_metadata' as any)
          .select('id')
          .eq('workflow_state', 'review')
          .limit(500);
        for (const item of cmsItems ?? []) {
          const { error } = await api
            .from('cms_content_metadata' as any)
            .update({
              workflow_state: 'draft',
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);
          if (!error) success++;
          else failed++;
        }
        setBulkProgress(60);

        // Dismiss all automation flags
        const { data: autoFlags } = await api
          .from('content_flags' as any)
          .select('id')
          .eq('status', 'pending')
          .limit(1000);
        if ((autoFlags ?? []).length > 0) {
          const { error } = await api
            .from('content_flags' as any)
            .update({
              status: 'rejected',
              reviewed_at: new Date().toISOString(),
            })
            .in(
              'id',
              (autoFlags ?? []).map((f: any) => f.id),
            );
          if (!error) success += (autoFlags ?? []).length;
          else failed += (autoFlags ?? []).length;
        }
        setBulkProgress(80);

        // Reject all staging items
        const { data: stagingItems } = await api
          .from('ingestion_staging' as any)
          .select('id')
          .eq('review_status', 'pending_review')
          .eq('disposition', 'pending')
          .limit(1000);
        if ((stagingItems ?? []).length > 0) {
          const { error } = await api
            .from('ingestion_staging' as any)
            .update({
              disposition: 'rejected',
              review_status: 'rejected',
              reviewed_at: new Date().toISOString(),
            })
            .in(
              'id',
              (stagingItems ?? []).map((s: any) => s.id),
            );
          if (!error) success += (stagingItems ?? []).length;
          else failed += (stagingItems ?? []).length;
        }
        setBulkProgress(100);
      }
    } catch (err) {
      console.error('Bulk action error:', err);
      failed++;
    }

    setBulkRunning(false);
    setBulkResult({ success, failed });
    refetchCounts();

    if (success > 0 && failed === 0) {
      toast.success(`${success} items processed successfully`);
    } else if (success > 0) {
      toast.warning(`${success} succeeded, ${failed} failed`);
    } else {
      toast.error('Bulk action failed');
    }
  }, [bulkAction, user, refetchCounts]);

  const bulkActionLabels: Record<
    string,
    {
      title: string;
      desc: string;
      icon: typeof Inbox;
      color: string;
      severity?: 'warning' | 'error';
    }
  > = {
    approve: {
      title: 'Approve Everything',
      desc: `This will approve all ${c.tagSuggestions} tag suggestions, publish all ${c.cmsReview} content items in review, and resolve all ${c.moderation} moderation flags.`,
      icon: CheckCheck,
      color: '#10b981',
    },
    enrich: {
      title: 'Apply All Enrichments',
      desc: `This will apply all ${c.automation} pending automation suggestions to their target content. Suggested values will overwrite current values.`,
      icon: Zap,
      color: '#8b5cf6',
    },
    dedup: {
      title: 'Resolve Duplicates',
      desc: `This will auto-approve all unique staging items and auto-reject all confirmed duplicates from the staging queue.`,
      icon: Inbox,
      color: '#ea580c',
    },
    reject_stale: {
      title: 'Reject Stale Items',
      desc: 'This will reject/dismiss all items older than 7 days across moderation flags, tag suggestions, automation flags, and staging items.',
      icon: Clock,
      color: '#6b7280',
    },
    approve_confident: {
      title: 'Approve High-Confidence',
      desc: 'This will approve only tag suggestions and automation flags with confidence >= 80%. Low-confidence items are left for manual review.',
      icon: Sparkles,
      color: '#0ea5e9',
    },
    dismiss_low: {
      title: 'Dismiss Low-Severity',
      desc: 'This will dismiss all info and warning-level automation flags. Error and critical severity flags are kept for manual review.',
      icon: VolumeX,
      color: '#a855f7',
    },
    reject_all: {
      title: 'Reject Everything',
      desc: `This will reject ALL ${c.total} pending items across every queue: moderation flags, tag suggestions, CMS content (back to draft), automation flags, and staging items.`,
      icon: XCircle,
      color: '#ef4444',
      severity: 'error',
    },
  };

  const defaultTab = useMemo(() => {
    if (!counts) return 'staging';
    return TAB_PRIORITY.find((t) => (counts[TAB_COUNT_KEY[t]] ?? 0) > 0) ?? 'staging';
  }, [counts]);

  const activeTab = isValidTab(tabParam) ? tabParam : defaultTab;

  const handleTabChange = (value: string) => {
    if (value === 'staging') {
      searchParams.delete('tab');
    } else {
      searchParams.set('tab', value);
    }
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <Shield style={{ height: 24, width: 24, color: '#f59e0b' }} />
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Review & Moderation
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {c.total > 0
              ? `${c.total.toLocaleString()} item${c.total !== 1 ? 's' : ''} need${c.total === 1 ? 's' : ''} attention`
              : 'All caught up!'}
          </Typography>
        </Box>
        {c.total > 0 && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant="contained"
              color="success"
              onClick={() => openBulkDialog('approve')}
              startIcon={<CheckCheck size={15} />}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
            >
              Approve All
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => openBulkDialog('approve_confident')}
              startIcon={<Sparkles size={15} />}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.8rem',
                borderColor: '#0ea5e9',
                color: '#0ea5e9',
              }}
            >
              Approve High-Confidence
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => openBulkDialog('enrich')}
              startIcon={<Zap size={15} />}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.8rem',
                borderColor: '#8b5cf6',
                color: '#8b5cf6',
              }}
            >
              Apply Enrichments
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => openBulkDialog('dedup')}
              startIcon={<Inbox size={15} />}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.8rem',
                borderColor: '#ea580c',
                color: '#ea580c',
              }}
            >
              Resolve Duplicates
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => openBulkDialog('dismiss_low')}
              startIcon={<VolumeX size={15} />}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.8rem',
                borderColor: '#a855f7',
                color: '#a855f7',
              }}
            >
              Dismiss Low-Severity
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => openBulkDialog('reject_stale')}
              startIcon={<Clock size={15} />}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.8rem',
                borderColor: '#6b7280',
                color: '#6b7280',
              }}
            >
              Reject Stale
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => openBulkDialog('reject_all')}
              startIcon={<XCircle size={15} />}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
            >
              Reject All
            </Button>
          </Box>
        )}
      </Box>

      {/* Bulk Action Confirmation Dialog */}
      <Dialog
        open={bulkDialogOpen}
        onClose={() => !bulkRunning && setBulkDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        {bulkAction && (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700 }}>
              {(() => {
                const Info = bulkActionLabels[bulkAction].icon;
                return <Info size={20} style={{ color: bulkActionLabels[bulkAction].color }} />;
              })()}
              {bulkActionLabels[bulkAction].title}
            </DialogTitle>
            <DialogContent>
              {!bulkResult ? (
                <>
                  <Alert
                    severity={bulkActionLabels[bulkAction].severity ?? 'warning'}
                    sx={{ mb: 2 }}
                  >
                    {bulkActionLabels[bulkAction].desc}
                  </Alert>
                  {bulkRunning && (
                    <Box sx={{ mt: 2 }}>
                      <LinearProgress
                        variant="determinate"
                        value={bulkProgress}
                        sx={{ height: 6, borderRadius: 3 }}
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mt: 0.5, display: 'block', textAlign: 'center' }}
                      >
                        {bulkProgress}% complete...
                      </Typography>
                    </Box>
                  )}
                </>
              ) : (
                <Alert severity={bulkResult.failed === 0 ? 'success' : 'warning'} sx={{ mt: 1 }}>
                  {bulkResult.success} items processed successfully.
                  {bulkResult.failed > 0 && ` ${bulkResult.failed} failed.`}
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              {!bulkResult ? (
                <>
                  <Button
                    onClick={() => setBulkDialogOpen(false)}
                    disabled={bulkRunning}
                    sx={{ textTransform: 'none' }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleBulkExecute}
                    disabled={bulkRunning}
                    startIcon={
                      bulkRunning ? (
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : undefined
                    }
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                    color={
                      bulkAction === 'approve' || bulkAction === 'approve_confident'
                        ? 'success'
                        : bulkAction === 'reject_all'
                          ? 'error'
                          : 'primary'
                    }
                  >
                    {bulkRunning ? 'Processing...' : 'Confirm'}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => setBulkDialogOpen(false)}
                  variant="contained"
                  sx={{ textTransform: 'none' }}
                >
                  Done
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Summary Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(6, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <StatCard
          icon={Inbox}
          label="Import Staging"
          count={c.staging}
          color="#ea580c"
          active={activeTab === 'staging'}
          onClick={() => handleTabChange('staging')}
        />
        <StatCard
          icon={Flag}
          label="Moderation Flags"
          count={c.moderation}
          color="#f59e0b"
          active={activeTab === 'moderation'}
          onClick={() => handleTabChange('moderation')}
        />
        <StatCard
          icon={FileCheck}
          label="Content Review"
          count={c.cmsReview}
          color="#3b82f6"
          active={activeTab === 'content'}
          onClick={() => handleTabChange('content')}
        />
        <StatCard
          icon={Tag}
          label="Tag Suggestions"
          count={c.tagSuggestions}
          color="#8b5cf6"
          active={activeTab === 'tags'}
          onClick={() => handleTabChange('tags')}
        />
        <StatCard
          icon={GitMerge}
          label="Duplicates"
          count={c.duplicates ?? 0}
          color="#10b981"
          active={activeTab === 'duplicates'}
          onClick={() => handleTabChange('duplicates')}
        />
        <StatCard
          icon={Zap}
          label="Automation"
          count={c.automation}
          color="#f97316"
          active={activeTab === 'automation'}
          onClick={() => handleTabChange('automation')}
        />
      </Box>

      {/* Tab content — navigation via stat cards above */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsContent value="staging">
          <Suspense fallback={<Loading />}>
            <ReviewQueueEnhanced />
          </Suspense>
        </TabsContent>

        <TabsContent value="moderation">
          <Suspense fallback={<Loading />}>
            <ModerationQueue />
          </Suspense>
        </TabsContent>

        <TabsContent value="content">
          <Suspense fallback={<Loading />}>
            <ReviewQueue />
          </Suspense>
        </TabsContent>

        <TabsContent value="tags">
          <Suspense fallback={<Loading />}>
            <TagSuggestionsQueue />
          </Suspense>
        </TabsContent>

        <TabsContent value="duplicates">
          <Suspense fallback={<Loading />}>
            <AutoCleanDuplicatesTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="automation">
          <Suspense fallback={<Loading />}>
            <AutoModerationQueue />
            <AutomationReviewTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </Box>
  );
}
