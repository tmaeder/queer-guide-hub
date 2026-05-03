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
import { brandColors } from '@/theme/muiTheme';

// Lightweight alpha helper for hex colors
function alphaHex(color: string, a: number): string {
  // Accept #rrggbb only; otherwise wrap as rgba via CSS color-mix fallback
  if (color.startsWith('#') && (color.length === 7)) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return `color-mix(in srgb, ${color} ${a * 100}%, transparent)`;
}

// ── Quadrant Card ──────────────────────────────────────────────────

function QuadrantCard({
  title,
  icon: Icon,
  color,
  children,
  action,
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  children: React.ReactNode;
  action?: { label: string; route: string };
}) {
  const navigate = useNavigate();
  return (
    <div className="border border-border rounded-lg bg-background p-5 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{ background: alphaHex(color, 0.1) }}
          >
            <Icon size={15} style={{ color }} />
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
  const statusColors = { healthy: '#10b981', degraded: '#f59e0b', error: '#ef4444' };
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
    <QuadrantCard title="System Status" icon={Activity} color="#10b981">
      <div className="flex items-center gap-3 mb-2">
        <StatusIcon size={20} style={{ color: statusColors[system.status] }} />
        <span
          className="text-sm font-semibold"
          style={{ color: statusColors[system.status] }}
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
      className="p-3 rounded-md text-center"
      style={{
        background: good ? alphaHex('#10b981', 0.06) : alphaHex('#f59e0b', 0.06),
      }}
    >
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className="text-base font-bold"
        style={{ color: good ? '#10b981' : '#f59e0b' }}
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
    { label: 'Staging', count: review.staging, color: '#ea580c', icon: Inbox, tab: 'staging' },
    {
      label: 'Moderation',
      count: review.moderation,
      color: '#f59e0b',
      icon: Flag,
      tab: 'moderation',
    },
    {
      label: 'Automation',
      count: review.automation,
      color: brandColors.main,
      icon: Bot,
      tab: 'automation',
    },
    {
      label: 'Content',
      count: review.cmsReview,
      color: '#3b82f6',
      icon: FileCheck,
      tab: 'content',
    },
    { label: 'Tags', count: review.tagSuggestions, color: '#a855f7', icon: Tag, tab: 'tags' },
  ];

  return (
    <QuadrantCard
      title="Review Queue"
      icon={ClipboardCheck}
      color="#f59e0b"
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
              <q.icon size={14} style={{ color: q.color }} />
              <span className="text-sm font-medium">{q.label}</span>
            </div>
            <Badge
              variant="secondary"
              className="h-5 text-[0.7rem] font-bold"
              style={
                q.count > 0
                  ? { background: alphaHex(q.color, 0.12), color: q.color }
                  : undefined
              }
            >
              {q.count > 0 ? q.count.toLocaleString() : '0'}
            </Badge>
          </div>
        ))}
      </div>
      {review.total > 0 && (
        <div className="text-xs font-semibold mt-1" style={{ color: '#f59e0b' }}>
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
      color="#10b981"
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
  const scoreColor =
    quality.overallScore >= 90 ? '#10b981' : quality.overallScore >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <QuadrantCard
      title="Quality Index"
      icon={ShieldCheck}
      color="#3b82f6"
      action={{ label: 'Details', route: '/admin/imports/enrichment' }}
    >
      <div className="text-center py-2">
        <div
          className="text-5xl font-extrabold leading-none"
          style={{ color: scoreColor }}
        >
          {quality.overallScore}%
        </div>
        <div className="text-xs font-medium text-muted-foreground mt-1">
          Overall Quality Score
        </div>
      </div>
      <div
        className="rounded-full overflow-hidden"
        style={{ height: 6, background: alphaHex(scoreColor, 0.12) }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${quality.overallScore}%`, background: scoreColor }}
        />
      </div>
      <div className="flex justify-center gap-6 mt-2">
        <div className="flex items-center gap-1">
          <AlertTriangle size={12} style={{ color: '#f59e0b' }} />
          <span className="text-xs font-medium">{quality.warnings} warnings</span>
        </div>
        <div className="flex items-center gap-1">
          <AlertCircle size={12} style={{ color: '#ef4444' }} />
          <span className="text-xs font-medium">{quality.critical} critical</span>
        </div>
      </div>
    </QuadrantCard>
  );
}

// ── Content Stats Grid ──────────────────────────────────────────────

const contentStatItems = [
  {
    key: 'venues',
    label: 'Venues',
    icon: Building,
    color: brandColors.main,
    route: '/admin/content/venues',
  },
  {
    key: 'events',
    label: 'Events',
    icon: Calendar,
    color: '#ec4899',
    route: '/admin/content/events',
  },
  {
    key: 'personalities',
    label: 'Personalities',
    icon: Users,
    color: '#f59e0b',
    route: '/admin/content/personalities',
  },
  {
    key: 'news',
    label: 'News',
    icon: Newspaper,
    color: '#3b82f6',
    route: '/admin/content/news_articles',
  },
  {
    key: 'cities',
    label: 'Cities',
    icon: MapPin,
    color: '#10b981',
    route: '/admin/content/cities',
  },
  {
    key: 'countries',
    label: 'Countries',
    icon: Globe,
    color: '#6366f1',
    route: '/admin/content/countries',
  },
  { key: 'hotels', label: 'Hotels', icon: Hotel, color: '#0ea5e9', route: '/admin/content/hotels' },
  {
    key: 'villages',
    label: 'Villages',
    icon: Home,
    color: '#d946ef',
    route: '/admin/content/queer_villages',
  },
  {
    key: 'marketplace',
    label: 'Marketplace',
    icon: ShoppingBag,
    color: '#f97316',
    route: '/admin/content/marketplace_listings',
  },
  {
    key: 'groups',
    label: 'Groups',
    icon: UsersRound,
    color: '#a855f7',
    route: '/admin/content/community_groups',
  },
  { key: 'tags', label: 'Tags', icon: Tag, color: '#14b8a6', route: '/admin/content/unified_tags' },
  {
    key: 'pages',
    label: 'Pages',
    icon: FileText,
    color: 'hsl(var(--muted-foreground))',
    route: '/admin/content/cms_pages',
  },
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
        {contentStatItems.map(({ key, label, icon: Icon, color, route }) => (
          <div
            key={key}
            onClick={() => navigate(route)}
            className="flex flex-col items-center gap-1 p-3 rounded-md cursor-pointer transition-all hover:-translate-y-px"
            style={
              {
                ['--hover-bg' as string]: alphaHex(color, 0.06),
              } as React.CSSProperties
            }
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLDivElement).style.background = alphaHex(color, 0.06))
            }
            onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = '')}
          >
            <Icon size={18} style={{ color }} />
            <div className="text-lg font-bold leading-none">
              {(stats[key as keyof typeof stats] ?? 0).toLocaleString()}
            </div>
            <div
              className="font-medium text-muted-foreground"
              style={{ fontSize: '0.65rem' }}
            >
              {label}
            </div>
          </div>
        ))}
      </StaggerGrid>
    </div>
  );
}

// ── Quick Actions ───────────────────────────────────────────────────

function QuickActionsBar() {
  const navigate = useNavigate();
  const actions = [
    { label: 'New Content', icon: Plus, route: '/admin/content', color: brandColors.main },
    { label: 'Import Data', icon: Download, route: '/admin/imports', color: '#10b981' },
    { label: 'Review Queue', icon: ClipboardCheck, route: '/admin/review', color: '#f59e0b' },
    { label: 'Automation', icon: Zap, route: '/admin/automation', color: '#f59e0b' },
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
          style={{
            borderColor: alphaHex(a.color, 0.3),
            color: a.color,
          }}
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
          <LayoutDashboard size={24} style={{ color: brandColors.main }} />
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
