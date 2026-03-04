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

import { Suspense, lazy, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { Inbox, Flag, FileCheck, Tag, Shield, GitMerge, Zap } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { useReviewCounts } from '@/hooks/useReviewCounts';

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
        cursor: onClick ? 'pointer' : 'default',
        borderColor: active ? color : undefined,
        borderWidth: active ? 2 : 1,
        transition: 'border-color 0.15s',
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

export default function AdminReview() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = isValidTab(tabParam) ? tabParam : 'staging';

  const { data: counts } = useReviewCounts();
  const c = counts ?? {
    staging: 0,
    cmsReview: 0,
    moderation: 0,
    tagSuggestions: 0,
    duplicates: 0,
    automation: 0,
    total: 0,
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
      <Box sx={{ mb: 3 }}>
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList style={{ backgroundColor: 'var(--card)', marginBottom: 16 }}>
          <TabsTrigger value="staging">Import Staging{tabBadge(c.staging)}</TabsTrigger>
          <TabsTrigger value="moderation">Moderation{tabBadge(c.moderation)}</TabsTrigger>
          <TabsTrigger value="content">Content Workflow{tabBadge(c.cmsReview)}</TabsTrigger>
          <TabsTrigger value="tags">Tag Suggestions{tabBadge(c.tagSuggestions)}</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicates{tabBadge(c.duplicates ?? 0)}</TabsTrigger>
          <TabsTrigger value="automation">Automation{tabBadge(c.automation)}</TabsTrigger>
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
            <AutomationReviewTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </Box>
  );
}
