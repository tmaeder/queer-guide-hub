/**
 * AdminReview — Unified review & moderation dashboard.
 * Accepts ?tab= query param to deep-link to a specific tab.
 */

import { Suspense, lazy, useMemo } from 'react';
import { useSearchParams } from 'react-router';
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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useReviewCounts, type ReviewCounts } from '@/hooks/useReviewCounts';
import { useReviewBulkActions, type BulkActionType } from '@/hooks/useReviewBulkActions';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { fetchNewsQualityReviewCount, fetchEntityLinkReviewCount } from '@/hooks/usePageFetchers';

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
        <div className="flex items-center justify-center gap-2 mb-1">
          <Icon style={{ height: 20, width: 20, color }} />
          <span className="text-2xl font-bold">{count.toLocaleString()}</span>
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

const Loading = () => (
  <div className="flex justify-center py-12">
    <Loader2 className="h-7 w-7 animate-spin" aria-label="Loading" />
  </div>
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
  variant: 'default' | 'outline';
  tone?: 'success' | 'destructive';
}> = [
  { action: 'approve', label: 'Approve All', icon: CheckCheck, variant: 'default', tone: 'success' },
  { action: 'approve_confident', label: 'Approve High-Confidence', icon: Sparkles, variant: 'outline', color: '#0ea5e9' },
  { action: 'enrich', label: 'Apply Enrichments', icon: Zap, variant: 'outline', color: 'hsl(var(--foreground))' },
  { action: 'dedup', label: 'Resolve Duplicates', icon: Inbox, variant: 'outline', color: '#ea580c' },
  { action: 'dismiss_low', label: 'Dismiss Low-Severity', icon: VolumeX, variant: 'outline', color: '#a855f7' },
  { action: 'reject_stale', label: 'Reject Stale', icon: Clock, variant: 'outline', color: 'hsl(var(--muted-foreground))' },
  { action: 'reject_all', label: 'Reject All', icon: XCircle, variant: 'outline', tone: 'destructive' },
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
    queryFn: fetchNewsQualityReviewCount,
    refetchInterval: 60_000,
  });

  const { data: entityReviewCount = 0 } = useQuery({
    queryKey: ['entity-link-review-count'],
    queryFn: fetchEntityLinkReviewCount,
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
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Shield style={{ height: 24, width: 24, color: '#f59e0b' }} />
            <h5 className="text-xl font-bold">Review & Moderation</h5>
          </div>
          <p className="text-sm text-muted-foreground">
            {c.total > 0
              ? `${c.total.toLocaleString()} item${c.total !== 1 ? 's' : ''} need${c.total === 1 ? 's' : ''} attention`
              : 'All caught up!'}
          </p>
        </div>
        {c.total > 0 && (
          <div className="flex gap-2 flex-wrap">
            {BULK_BUTTONS.map(({ action, label, icon: BtnIcon, color, variant, tone }) => (
              <Button
                key={action}
                size="sm"
                variant={
                  tone === 'destructive'
                    ? 'destructive'
                    : variant === 'default'
                      ? 'default'
                      : 'outline'
                }
                onClick={() => openBulkDialog(action)}
                style={{
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  ...(color && !tone ? { borderColor: color, color } : {}),
                  ...(tone === 'success' ? { backgroundColor: '#16a34a', color: '#fff' } : {}),
                }}
              >
                <BtnIcon size={15} style={{ marginRight: 6 }} />
                {label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Bulk Action Confirmation Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={(o) => !o && closeBulkDialog()}>
        <DialogContent className="sm:max-w-lg">
          {bulkAction && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  {(() => {
                    const Info = bulkActionLabels[bulkAction].icon;
                    return <Info size={20} style={{ color: bulkActionLabels[bulkAction].color }} />;
                  })()}
                  {bulkActionLabels[bulkAction].title}
                </DialogTitle>
              </DialogHeader>
              <div>
                {!bulkResult ? (
                  <>
                    <Alert
                      variant={
                        (bulkActionLabels[bulkAction].severity ?? 'warning') === 'error'
                          ? 'destructive'
                          : 'default'
                      }
                      className="mb-4"
                    >
                      <AlertDescription>{bulkActionLabels[bulkAction].desc}</AlertDescription>
                    </Alert>
                    {bulkRunning && (
                      <div className="mt-4">
                        <div className="h-1.5 w-full bg-muted overflow-hidden rounded-full">
                          <div
                            className="h-full bg-primary animate-pulse"
                            style={{ width: '50%' }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 block text-center">
                          Processing...
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <Alert
                    variant={bulkResult.failed === 0 ? 'default' : 'destructive'}
                    className="mt-2"
                  >
                    <AlertDescription>
                      {bulkResult.success} items processed successfully.
                      {bulkResult.failed > 0 && ` ${bulkResult.failed} failed.`}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              <DialogFooter>
                {!bulkResult ? (
                  <>
                    <Button variant="ghost" onClick={closeBulkDialog} disabled={bulkRunning}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleBulkExecute}
                      disabled={bulkRunning}
                      variant={bulkAction === 'reject_all' ? 'destructive' : 'default'}
                      style={{ fontWeight: 600 }}
                    >
                      {bulkRunning && (
                        <Loader2 size={14} style={{ marginRight: 6 }} className="animate-spin" />
                      )}
                      {bulkRunning ? 'Processing...' : 'Confirm'}
                    </Button>
                  </>
                ) : (
                  <Button onClick={closeBulkDialog}>Done</Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-9 gap-4 mb-6">
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
          color="hsl(var(--foreground))"
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
          color="hsl(var(--foreground))"
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
      </div>

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
    </div>
  );
}
