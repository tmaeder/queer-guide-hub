/**
 * AdminDashboard — Unified Cockpit Dashboard.
 * Four-quadrant layout: System Status, Review Queue, Import Status, Quality Index.
 * Plus content stats grid and quick actions.
 */

import { useNavigate } from 'react-router';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  LayoutDashboard,
  Activity,
  ClipboardCheck,
  Download,
  ShieldCheck,
  Building,
  Calendar,
  Users,
  Newspaper,
  MapPin,
  Globe,
  Hotel,
  Home,
  ShoppingBag,
  UsersRound,
  Tag,
  FileText,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Plus,
  ArrowRight,
  Inbox,
  Flag,
  Bot,
  FileCheck,
  Zap,
} from 'lucide-react';
import { useAdminCockpit } from '@/hooks/useAdminCockpit';
import type { CockpitData } from '@/hooks/useAdminCockpit';


// ── Quadrant Card ──────────────────────────────────────────────────

function QuadrantCard({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  action?: { label: string; route: string };
}) {
  const navigate = useNavigate();
  return (
    <div className="border border-border rounded-lg bg-background p-5 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center bg-muted text-muted-foreground"
          >
            <Icon size={15} />
          </div>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {action && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(action.route)}
            className="text-xs font-medium normal-case"
          >
            {action.label}
            <ArrowRight size={14} className="ml-1" />
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}

// ── System Status ───────────────────────────────────────────────────

function SystemStatus({ data }: { data: CockpitData }) {
  const { system } = data;
  const statusLabels = {
    healthy: 'All Systems Operational',
    degraded: 'Degraded Performance',
    error: 'System Issues',
  };
  const StatusIcon =
    system.status === 'healthy'
      ? CheckCircle2
      : system.status === 'degraded'
        ? AlertTriangle
        : AlertCircle;

  return (
    <QuadrantCard title="System Status" icon={Activity}>
      <div className="flex items-center gap-3 mb-2">
        <StatusIcon size={20} className="text-muted-foreground" />
        <span
          className="text-sm font-semibold"
        >
          {statusLabels[system.status]}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MetricBox
          label="DB Latency"
          value={`${system.dbLatencyMs}ms`}
          good={system.dbLatencyMs < 200}
        />
        <MetricBox
          label="Errors"
          value={system.recentErrors.toString()}
          good={system.recentErrors === 0}
        />
      </div>
    </QuadrantCard>
  );
}

function MetricBox({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div
      className="p-3 rounded-md text-center bg-muted"
    >
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={`text-base font-bold ${good ? '' : 'text-destructive'}`}
      >
        {value}
      </div>
    </div>
  );
}

// ── Review Queue ────────────────────────────────────────────────────

function ReviewQueueWidget({ data }: { data: CockpitData }) {
  const navigate = useNavigate();
  const { review } = data;
  const queues = [
    { label: 'Staging', count: review.staging, icon: Inbox, tab: 'staging' },
    {
      label: 'Moderation',
      count: review.moderation,
      icon: Flag,
      tab: 'moderation',
    },
    {
      label: 'Automation',
      count: review.automation,
      icon: Bot,
      tab: 'automation',
    },
    {
      label: 'Content',
      count: review.cmsReview,
      icon: FileCheck,
      tab: 'content',
    },
    { label: 'Tags', count: review.tagSuggestions, icon: Tag, tab: 'tags' },
  ];

  return (
    <QuadrantCard
      title="Review Queue"
      icon={ClipboardCheck}
     
      action={{ label: 'All Reviews', route: '/admin/review' }}
    >
      <div className="flex flex-col gap-1.5">
        {queues.map((q) => (
          <div
            key={q.label}
            onClick={() => navigate(`/admin/review?tab=${q.tab}`)}
            className="flex items-center justify-between px-3 py-1.5 rounded cursor-pointer transition-colors hover:bg-muted"
          >
            <div className="flex items-center gap-2">
              <q.icon size={14} className="text-muted-foreground" />
              <span className="text-sm font-medium">{q.label}</span>
            </div>
            <Badge
              variant="secondary"
              className="h-5 text-[0.7rem] font-bold"
            >
              {q.count > 0 ? q.count.toLocaleString() : '0'}
            </Badge>
          </div>
        ))}
      </div>
      {review.total > 0 && (
        <div className="text-xs font-semibold mt-1 text-muted-foreground">
          {review.total.toLocaleString()} total items need attention
        </div>
      )}
    </QuadrantCard>
  );
}

// ── Import Status ───────────────────────────────────────────────────

function ImportStatus({ data }: { data: CockpitData }) {
  const { imports } = data;

  return (
    <QuadrantCard
      title="Import Status"
      icon={Download}
     
      action={{ label: 'Imports', route: '/admin/imports' }}
    >
      <div className="grid grid-cols-2 gap-3">
        <MetricBox
          label="Active Jobs"
          value={imports.activeJobs.toString()}
          good={imports.activeJobs < 5}
        />
        <MetricBox label="Completed Today" value={imports.completedToday.toString()} good={true} />
        <MetricBox
          label="Failed Today"
          value={imports.failedToday.toString()}
          good={imports.failedToday === 0}
        />
        <MetricBox
          label="Error Rate"
          value={`${imports.errorRate}%`}
          good={imports.errorRate < 10}
        />
      </div>
    </QuadrantCard>
  );
}

// ── Quality Index ───────────────────────────────────────────────────

function QualityWidget({ data }: { data: CockpitData }) {
  const { quality } = data;

  return (
    <QuadrantCard
      title="Quality Index"
      icon={ShieldCheck}
     
      action={{ label: 'Details', route: '/admin/imports/enrichment' }}
    >
      <div className="text-center py-2">
        <div
          className="text-5xl font-extrabold leading-none"
        >
          {quality.overallScore}%
        </div>
        <div className="text-xs font-medium text-muted-foreground mt-1">
          Overall Quality Score
        </div>
      </div>
      <div
        className="rounded-full overflow-hidden bg-muted"
        style={{ height: 6 }}
      >
        <div
          className="h-full rounded-full transition-all bg-foreground"
          style={{ width: `${quality.overallScore}%` }}
        />
      </div>
      <div className="flex justify-center gap-6 mt-2">
        <div className="flex items-center gap-1">
          <AlertTriangle size={12} className="text-muted-foreground" />
          <span className="text-xs font-medium">{quality.warnings} warnings</span>
        </div>
        <div className="flex items-center gap-1">
          <AlertCircle size={12} className="text-muted-foreground" />
          <span className="text-xs font-medium">{quality.critical} critical</span>
        </div>
      </div>
    </QuadrantCard>
  );
}

// ── Content Stats Grid ──────────────────────────────────────────────

const contentStatItems = [
  { key: 'venues', label: 'Venues', icon: Building, route: '/admin/content/venues' },
  { key: 'events', label: 'Events', icon: Calendar, route: '/admin/content/events' },
  { key: 'personalities', label: 'Personalities', icon: Users, route: '/admin/content/personalities' },
  { key: 'news', label: 'News', icon: Newspaper, route: '/admin/content/news_articles' },
  { key: 'cities', label: 'Cities', icon: MapPin, route: '/admin/content/cities' },
  { key: 'countries', label: 'Countries', icon: Globe, route: '/admin/content/countries' },
  { key: 'hotels', label: 'Hotels', icon: Hotel, route: '/admin/content/hotels' },
  { key: 'villages', label: 'Villages', icon: Home, route: '/admin/content/queer_villages' },
  { key: 'marketplace', label: 'Marketplace', icon: ShoppingBag, route: '/admin/content/marketplace_listings' },
  { key: 'groups', label: 'Groups', icon: UsersRound, route: '/admin/content/community_groups' },
  { key: 'tags', label: 'Tags', icon: Tag, route: '/admin/content/unified_tags' },
  { key: 'pages', label: 'Pages', icon: FileText, route: '/admin/content/cms_pages' },
] as const;

function ContentStatsGrid({ stats }: { stats: CockpitData['stats'] }) {
  const navigate = useNavigate();

  return (
    <div className="border border-border rounded-lg bg-background p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Content Overview</h3>
        <span className="text-xs text-muted-foreground">
          {Object.values(stats)
            .reduce((a, b) => a + b, 0)
            .toLocaleString()}{' '}
          total items
        </span>
      </div>
      <StaggerGrid
        stagger={0.04}
        className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3"
      >
        {contentStatItems.map(({ key, label, icon: Icon, route }) => (
          <button
            key={key}
            type="button"
            onClick={() => navigate(route)}
            className="flex flex-col items-center gap-1 p-3 rounded-md cursor-pointer transition-all hover:-translate-y-px hover:bg-muted"
          >
            <Icon size={18} className="text-muted-foreground" />
            <div className="text-lg font-bold leading-none">
              {(stats[key as keyof typeof stats] ?? 0).toLocaleString()}
            </div>
            <div
              className="font-medium text-muted-foreground"
              style={{ fontSize: '0.65rem' }}
            >
              {label}
            </div>
          </button>
        ))}
      </StaggerGrid>
    </div>
  );
}

// ── Quick Actions ───────────────────────────────────────────────────

function QuickActionsBar() {
  const navigate = useNavigate();
  const actions = [
    { label: 'New Content', icon: Plus, route: '/admin/content' },
    { label: 'Import Data', icon: Download, route: '/admin/imports' },
    { label: 'Review Queue', icon: ClipboardCheck, route: '/admin/review' },
    { label: 'Automation', icon: Zap, route: '/admin/automation' },
  ];

  return (
    <div className="flex gap-2 flex-wrap">
      {actions.map((a) => (
        <Button
          key={a.label}
          variant="outline"
          size="sm"
          onClick={() => navigate(a.route)}
          className="hidden sm:inline-flex normal-case font-medium"
        >
          <a.icon size={15} className="mr-1.5" />
          {a.label}
        </Button>
      ))}
    </div>
  );
}

// ── Loading Skeleton ────────────────────────────────────────────────

function CockpitSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="rounded-lg" style={{ height: 220 }} />
        ))}
      </div>
      <Skeleton className="rounded-lg" style={{ height: 160 }} />
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export default function AdminDashboard() {
  const { data, isLoading, refetch } = useAdminCockpit();

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <LayoutDashboard size={24} className="text-muted-foreground" />
          <h1 className="text-xl font-bold">Cockpit</h1>
        </div>
        <div className="flex items-center gap-2">
          <QuickActionsBar />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => refetch()}
              >
                <RefreshCw size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {isLoading || !data ? (
        <CockpitSkeleton />
      ) : (
        <div className="flex flex-col gap-5">
          {/* Four quadrants */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SystemStatus data={data} />
            <ReviewQueueWidget data={data} />
            <ImportStatus data={data} />
            <QualityWidget data={data} />
          </div>

          {/* Content stats */}
          <ContentStatsGrid stats={data.stats} />
        </div>
      )}
    </div>
  );
}
