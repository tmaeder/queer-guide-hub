/**
 * AdminReview — Unified review & moderation dashboard.
 *
 * Consolidates 4 review workflows into one page:
 *   1. Import Staging — AI-validated data pending human review (10K+ items)
 *   2. Moderation — User-reported content flags
 *   3. Content Workflow — CMS editorial review (draft → review → published)
 *   4. Tag Suggestions — Auto-tag and near-duplicate detection results
 *
 * Accepts ?tab= query param to deep-link to a specific tab.
 */

import { Suspense, lazy, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  Inbox, Flag, FileCheck, Tag, Shield, Bot, CheckCheck, Loader2, Zap,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { useReviewCounts } from '@/hooks/useReviewCounts';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// Lazy-load tab contents to keep initial bundle small
const ReviewQueueEnhanced = lazy(() =>
  import('@/components/admin/import-hub/ReviewQueueEnhanced').then(m => ({ default: m.ReviewQueueEnhanced }))
);
const ModerationQueue = lazy(() =>
  import('@/components/admin/ModerationQueue').then(m => ({ default: m.ModerationQueue }))
);
const ReviewQueue = lazy(() =>
  import('@/components/cms/ReviewQueue').then(m => ({ default: m.ReviewQueue }))
);
const TagSuggestionsQueue = lazy(() =>
  import('@/components/admin/TagSuggestionsQueue').then(m => ({ default: m.TagSuggestionsQueue }))
);
const AutoModerationQueue = lazy(() =>
  import('@/components/admin/AutoModerationQueue').then(m => ({ default: m.AutoModerationQueue }))
);

const VALID_TABS = ['staging', 'moderation', 'automation', 'content', 'tags'] as const;
type TabId = typeof VALID_TABS[number];

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
        cursor: onClick ? 'pointer' : 'default',
        borderColor: active ? color : undefined,
        borderWidth: active ? 2 : 1,
        transition: 'border-color 0.15s',
      }}
    >
      <CardContent sx={{ p: 2, textAlign: 'center', '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}>
          <Icon style={{ height: 20, width: 20, color }} />
          <Typography component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {count.toLocaleString()}
          </Typography>
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{label}</Typography>
      </CardContent>
    </Card>
  );
}

const Loading = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
    <CircularProgress size={28} />
  </Box>
);

export default function AdminReview() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = isValidTab(tabParam) ? tabParam : 'staging';
  const { user } = useAuth();

  const { data: counts, refetch: refetchCounts } = useReviewCounts();
  const c = counts ?? { staging: 0, cmsReview: 0, moderation: 0, automation: 0, tagSuggestions: 0, total: 0 };

  // ── Master Bulk Actions ──────────────────────────────────────
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<'approve' | 'enrich' | 'dedup' | null>(null);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ success: number; failed: number } | null>(null);

  const openBulkDialog = (action: 'approve' | 'enrich' | 'dedup') => {
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
        const { data: tags } = await supabase
          .from('tag_suggestions' as any)
          .select('id')
          .eq('status', 'pending')
          .limit(1000);
        const tagIds = (tags ?? []).map((t: any) => t.id);
        if (tagIds.length > 0) {
          const { error } = await supabase.rpc('approve_tag_suggestions' as any, {
            p_suggestion_ids: tagIds,
            p_reviewer_id: user.id,
          });
          if (!error) success += tagIds.length;
          else failed += tagIds.length;
        }
        setBulkProgress(33);

        // Approve all CMS content in review
        const { data: cmsItems } = await supabase
          .from('cms_content_metadata' as any)
          .select('id, source_table, source_id')
          .eq('workflow_state', 'review')
          .limit(500);
        for (const item of cmsItems ?? []) {
          const { error } = await supabase
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
        const { data: modFlags } = await supabase
          .from('moderation_flags' as any)
          .select('id')
          .eq('status', 'OPEN')
          .limit(500);
        if ((modFlags ?? []).length > 0) {
          const { error } = await supabase
            .from('moderation_flags' as any)
            .update({
              status: 'RESOLVED',
              reviewed_by: user.id,
              reviewed_at: new Date().toISOString(),
              resolution_note: 'Bulk approved via Review & Moderation',
            })
            .in('id', (modFlags ?? []).map((f: any) => f.id));
          if (!error) success += (modFlags ?? []).length;
          else failed += (modFlags ?? []).length;
        }
        setBulkProgress(100);
      }

      if (bulkAction === 'enrich') {
        // Apply all automation suggestions
        const { data: flags } = await supabase
          .from('content_flags' as any)
          .select('id, content_type, content_id, suggested_value')
          .eq('status', 'pending')
          .not('suggested_value', 'is', null)
          .limit(500);

        const total = (flags ?? []).length;
        for (let i = 0; i < total; i++) {
          const flag = (flags ?? [])[i];
          // Apply enrichment
          const { error: applyError } = await supabase
            .from(flag.content_type as any)
            .update(flag.suggested_value)
            .eq('id', flag.content_id);

          // Mark flag as applied
          const { error: flagError } = await supabase
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
        const { data: uniqueItems } = await supabase
          .from('ingestion_staging' as any)
          .select('id')
          .eq('review_status', 'pending_review')
          .eq('disposition', 'pending')
          .eq('dedup_status', 'unique')
          .limit(1000);

        if ((uniqueItems ?? []).length > 0) {
          const { error } = await supabase
            .from('ingestion_staging' as any)
            .update({
              disposition: 'approved',
              review_status: 'approved',
              reviewed_at: new Date().toISOString(),
            })
            .in('id', (uniqueItems ?? []).map((i: any) => i.id));
          if (!error) success += (uniqueItems ?? []).length;
          else failed += (uniqueItems ?? []).length;
        }
        setBulkProgress(50);

        // Reject all duplicates
        const { data: dupItems } = await supabase
          .from('ingestion_staging' as any)
          .select('id')
          .eq('review_status', 'pending_review')
          .eq('disposition', 'pending')
          .eq('dedup_status', 'duplicate')
          .limit(1000);

        if ((dupItems ?? []).length > 0) {
          const { error } = await supabase
            .from('ingestion_staging' as any)
            .update({
              disposition: 'rejected',
              review_status: 'rejected',
              reviewed_at: new Date().toISOString(),
            })
            .in('id', (dupItems ?? []).map((i: any) => i.id));
          if (!error) success += (dupItems ?? []).length;
          else failed += (dupItems ?? []).length;
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

  const bulkActionLabels = {
    approve: { title: 'Approve Everything', desc: `This will approve all ${c.tagSuggestions} tag suggestions, publish all ${c.cmsReview} content items in review, and resolve all ${c.moderation} moderation flags.`, icon: CheckCheck, color: '#10b981' },
    enrich: { title: 'Apply All Enrichments', desc: `This will apply all ${c.automation} pending automation suggestions to their target content. Suggested values will overwrite current values.`, icon: Zap, color: '#8b5cf6' },
    dedup: { title: 'Resolve Duplicates', desc: `This will auto-approve all unique staging items and auto-reject all confirmed duplicates from the staging queue.`, icon: Inbox, color: '#ea580c' },
  };

  const handleTabChange = (value: string) => {
    if (value === 'staging') {
      searchParams.delete('tab');
    } else {
      searchParams.set('tab', value);
    }
    setSearchParams(searchParams, { replace: true });
  };

  const tabBadge = (count: number) =>
    count > 0 ? ` (${count > 999 ? `${(count / 1000).toFixed(1)}k` : count})` : '';

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
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
              : 'All caught up!'
            }
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
              onClick={() => openBulkDialog('enrich')}
              startIcon={<Zap size={15} />}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem', borderColor: '#8b5cf6', color: '#8b5cf6' }}
            >
              Apply All Enrichments
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => openBulkDialog('dedup')}
              startIcon={<Inbox size={15} />}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem', borderColor: '#ea580c', color: '#ea580c' }}
            >
              Resolve Duplicates
            </Button>
          </Box>
        )}
      </Box>

      {/* Bulk Action Confirmation Dialog */}
      <Dialog open={bulkDialogOpen} onClose={() => !bulkRunning && setBulkDialogOpen(false)} maxWidth="sm" fullWidth>
        {bulkAction && (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700 }}>
              {(() => { const Info = bulkActionLabels[bulkAction].icon; return <Info size={20} style={{ color: bulkActionLabels[bulkAction].color }} />; })()}
              {bulkActionLabels[bulkAction].title}
            </DialogTitle>
            <DialogContent>
              {!bulkResult ? (
                <>
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    {bulkActionLabels[bulkAction].desc}
                  </Alert>
                  {bulkRunning && (
                    <Box sx={{ mt: 2 }}>
                      <LinearProgress variant="determinate" value={bulkProgress} sx={{ height: 6, borderRadius: 3 }} />
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', textAlign: 'center' }}>
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
                  <Button onClick={() => setBulkDialogOpen(false)} disabled={bulkRunning} sx={{ textTransform: 'none' }}>
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleBulkExecute}
                    disabled={bulkRunning}
                    startIcon={bulkRunning ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : undefined}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                    color={bulkAction === 'approve' ? 'success' : 'primary'}
                  >
                    {bulkRunning ? 'Processing...' : 'Confirm'}
                  </Button>
                </>
              ) : (
                <Button onClick={() => setBulkDialogOpen(false)} variant="contained" sx={{ textTransform: 'none' }}>
                  Done
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Summary Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 2, mb: 3 }}>
        <StatCard icon={Inbox} label="Import Staging" count={c.staging} color="#ea580c" active={activeTab === 'staging'} onClick={() => handleTabChange('staging')} />
        <StatCard icon={Flag} label="Moderation Flags" count={c.moderation} color="#f59e0b" active={activeTab === 'moderation'} onClick={() => handleTabChange('moderation')} />
        <StatCard icon={Bot} label="Automation" count={c.automation} color="#8b5cf6" active={activeTab === 'automation'} onClick={() => handleTabChange('automation')} />
        <StatCard icon={FileCheck} label="Content Review" count={c.cmsReview} color="#3b82f6" active={activeTab === 'content'} onClick={() => handleTabChange('content')} />
        <StatCard icon={Tag} label="Tag Suggestions" count={c.tagSuggestions} color="#a855f7" active={activeTab === 'tags'} onClick={() => handleTabChange('tags')} />
      </Box>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList style={{ backgroundColor: 'var(--card)', marginBottom: 16 }}>
          <TabsTrigger value="staging">Import Staging{tabBadge(c.staging)}</TabsTrigger>
          <TabsTrigger value="moderation">Moderation{tabBadge(c.moderation)}</TabsTrigger>
          <TabsTrigger value="automation">Automation{tabBadge(c.automation)}</TabsTrigger>
          <TabsTrigger value="content">Content Workflow{tabBadge(c.cmsReview)}</TabsTrigger>
          <TabsTrigger value="tags">Tag Suggestions{tabBadge(c.tagSuggestions)}</TabsTrigger>
        </TabsList>

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

        <TabsContent value="automation">
          <Suspense fallback={<Loading />}>
            <AutoModerationQueue />
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
      </Tabs>
    </Box>
  );
}
