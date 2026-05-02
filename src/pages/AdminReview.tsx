/**
 * AdminReview — Unified review & moderation dashboard.
 * Accepts ?tab= query param to deep-link to a specific tab.
 */

import { Suspense, lazy, useMemo } from 'react';
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
import { useReviewBulkActions, type BulkActionType } from '@/hooks/useReviewBulkActions';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
const AdminSubmissionsContent = lazy(() =>
  import('./AdminSubmissions').then((m) => ({
    default: m.AdminSubmissionsContent,
  })),
);
const NewsQualityReviewTab = lazy(() => import('@/components/admin/NewsQualityReviewTab'));
const EntityLinkReviewTab = lazy(() => import('@/components/admin/EntityLinkReviewTab'));

const VALID_TABS = [
  'staging',
  'moderation',
  'submissions',
  'content',
  'tags',
  'duplicates',
  'automation',
  'news-quality',
  'entity-links',
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
      <CardContent>
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
    <CircularProgress size={28} aria-label="Loading" />
  </Box>
);

const TAB_COUNT_KEY: Partial<Record<TabId, keyof ReviewCounts>> = {
  staging: 'staging',
  moderation: 'moderation',
  submissions: 'submissions',
  content: 'cmsReview',
  tags: 'tagSuggestions',
  duplicates: 'duplicates',
  automation: 'automation',
  // 'news-quality' is sourced separately via newsQualityCount
};

const TAB_PRIORITY: TabId[] = [
  'moderation',
  'staging',
  'submissions',
  'content',
  'tags',
  'duplicates',
  'automation',
];

const BULK_BUTTONS: Array<{
  action: BulkActionType;
  label: string;
  icon: typeof Inbox;
  color?: string;
  variant: 'contained' | 'outlined';
  muiColor?: 'success' | 'error';
}> = [
  { action: 'approve', label: 'Approve All', icon: CheckCheck, variant: 'contained', muiColor: 'success' },
  { action: 'approve_confident', label: 'Approve High-Confidence', icon: Sparkles, variant: 'outlined', color: '#0ea5e9' },
  { action: 'enrich', label: 'Apply Enrichments', icon: Zap, variant: 'outlined', color: 'hsl(var(--brand))' },
  { action: 'dedup', label: 'Resolve Duplicates', icon: Inbox, variant: 'outlined', color: '#ea580c' },
  { action: 'dismiss_low', label: 'Dismiss Low-Severity', icon: VolumeX, variant: 'outlined', color: '#a855f7' },
  { action: 'reject_stale', label: 'Reject Stale', icon: Clock, variant: 'outlined', color: 'hsl(var(--muted-foreground))' },
  { action: 'reject_all', label: 'Reject All', icon: XCircle, variant: 'outlined', muiColor: 'error' },
];

export default function AdminReview() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const { user } = useAuth();

  const { data: counts, refetch: refetchCounts } = useReviewCounts();
  const c: ReviewCounts = counts ?? {
    staging: 0,
    cmsReview: 0,
    moderation: 0,
    submissions: 0,
    tagSuggestions: 0,
    duplicates: 0,
    automation: 0,
    feedback: 0,
    total: 0,
  };

  const { data: newsQualityCount = 0 } = useQuery({
    queryKey: ['news-quality-review-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('news_articles')
        .select('id', { count: 'exact', head: true })
        .eq('quality_status', 'review');
      if (error) return 0;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  const { data: entityReviewCount = 0 } = useQuery({
    queryKey: ['entity-link-review-count'],
    queryFn: async () => {
      // entity_link_review isn't in the generated types yet — go through any.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count, error } = await (supabase as any)
        .from('entity_link_review')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) return 0;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  const {
    bulkDialogOpen,
    bulkAction,
    bulkRunning,
    bulkResult,
    bulkActionLabels,
    openBulkDialog,
    closeBulkDialog,
    handleBulkExecute,
  } = useReviewBulkActions(c, user?.id, refetchCounts);

  const defaultTab = useMemo(() => {
    if (!counts) return 'staging';
    return TAB_PRIORITY.find((t) => {
      const key = TAB_COUNT_KEY[t];
      return key ? (counts[key] ?? 0) > 0 : false;
    }) ?? 'staging';
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
            {BULK_BUTTONS.map(({ action, label, icon: BtnIcon, color, variant, muiColor }) => (
              <Button
                key={action}
                size="small"
                variant={variant}
                color={muiColor}
                onClick={() => openBulkDialog(action)}
                startIcon={<BtnIcon size={15} />}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  ...(color && !muiColor ? { borderColor: color, color } : {}),
                }}
              >
                {label}
              </Button>
            ))}
          </Box>
        )}
      </Box>

      {/* Bulk Action Confirmation Dialog */}
      <Dialog open={bulkDialogOpen} onClose={closeBulkDialog} maxWidth="sm" fullWidth>
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
                        variant="indeterminate"
                        sx={{ height: 6, borderRadius: 3 }}
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mt: 0.5, display: 'block', textAlign: 'center' }}
                      >
                        Processing...
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
                    onClick={closeBulkDialog}
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
                  onClick={closeBulkDialog}
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
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(9, 1fr)' },
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
          icon={Inbox}
          label="Submissions"
          count={c.submissions}
          color="#3b82f6"
          active={activeTab === 'submissions'}
          onClick={() => handleTabChange('submissions')}
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
          color="hsl(var(--brand))"
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
        <StatCard
          icon={Sparkles}
          label="News Quality"
          count={newsQualityCount}
          color="hsl(var(--brand))"
          active={activeTab === 'news-quality'}
          onClick={() => handleTabChange('news-quality')}
        />
        <StatCard
          icon={GitMerge}
          label="Entity Links"
          count={entityReviewCount}
          color="#0ea5e9"
          active={activeTab === 'entity-links'}
          onClick={() => handleTabChange('entity-links')}
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

        <TabsContent value="submissions">
          <Suspense fallback={<Loading />}>
            <AdminSubmissionsContent />
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

        <TabsContent value="news-quality">
          <Suspense fallback={<Loading />}>
            <NewsQualityReviewTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="entity-links">
          <Suspense fallback={<Loading />}>
            <EntityLinkReviewTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </Box>
  );
}
