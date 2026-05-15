/**
 * AdminDashboard — Unified Cockpit.
 * Static Bento Grid: 12-col layout, zero motion, hairline cell separation.
 * Cluster 3 refactor (Cockpit) — see docs / plan refactoring-fr-cluster-3.
 */

import { useNavigate } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { BentoGrid, BentoCell } from '@/components/ui/bento-grid';
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

// ── Cell heading helper ─────────────────────────────────────────────

function CellTitle({
  icon: Icon,
  label,
  action,
}: {
  icon: React.ElementType;
  label: string;
  action?: { label: string; route: string };
}) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-muted-foreground" aria-hidden />
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </h3>
      </div>
      {action && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(action.route)}
          className="h-6 px-1 text-xs font-medium rounded-element"
        >
          {action.label}
          <ArrowRight size={12} className="ml-1" />
        </Button>
      )}
    </div>
  );
}

function Metric({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="p-2 bg-muted">
      <div className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`text-base font-bold leading-none mt-1 ${ok ? '' : 'text-destructive'}`}>
        {value}
      </div>
    </div>
  );
}

// ── System Status ───────────────────────────────────────────────────

function SystemStatusCell({ data }: { data: CockpitData }) {
  const { system } = data;
  const statusLabels = {
    healthy: 'All Systems Operational',
    degraded: 'Degraded Performance',
    error: 'System Issues',
  } as const;
  const StatusIcon =
    system.status === 'healthy'
      ? CheckCircle2
      : system.status === 'degraded'
        ? AlertTriangle
        : AlertCircle;

  return (
    <BentoCell span={3} title={<CellTitle icon={Activity} label="System Status" />}>
      <div className="flex items-center gap-2 mb-3">
        <StatusIcon size={16} className="text-muted-foreground" aria-hidden />
        <span className="text-sm font-semibold">{statusLabels[system.status]}</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border">
        <Metric label="DB Latency" value={`${system.dbLatencyMs}ms`} ok={system.dbLatencyMs < 200} />
        <Metric label="Errors" value={system.recentErrors.toString()} ok={system.recentErrors === 0} />
      </div>
    </BentoCell>
  );
}

// ── Review Queue ────────────────────────────────────────────────────

function ReviewQueueCell({ data }: { data: CockpitData }) {
  const navigate = useNavigate();
  const { review } = data;
  const queues = [
    { label: 'Staging', count: review.staging, icon: Inbox, tab: 'staging' },
    { label: 'Moderation', count: review.moderation, icon: Flag, tab: 'moderation' },
    { label: 'Automation', count: review.automation, icon: Bot, tab: 'automation' },
    { label: 'Content', count: review.cmsReview, icon: FileCheck, tab: 'content' },
    { label: 'Tags', count: review.tagSuggestions, icon: Tag, tab: 'tags' },
  ];

  return (
    <BentoCell
      span={3}
      title={
        <CellTitle
          icon={ClipboardCheck}
          label="Review Queue"
          action={{ label: 'All Reviews', route: '/admin/review' }}
        />
      }
    >
      <div className="flex flex-col">
        {queues.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => navigate(`/admin/review?tab=${q.tab}`)}
            className="flex items-center justify-between px-2 py-1 text-left hover:bg-muted/50"
          >
            <span className="flex items-center gap-2">
              <q.icon size={13} className="text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">{q.label}</span>
            </span>
            <Badge variant="secondary" className="h-5 text-[0.7rem] font-bold rounded-element">
              {q.count.toLocaleString()}
            </Badge>
          </button>
        ))}
      </div>
      {review.total > 0 && (
        <div className="text-[0.7rem] font-semibold mt-2 text-muted-foreground">
          {review.total.toLocaleString()} total items
        </div>
      )}
    </BentoCell>
  );
}

// ── Import Status ───────────────────────────────────────────────────

function ImportStatusCell({ data }: { data: CockpitData }) {
  const { imports } = data;
  return (
    <BentoCell
      span={3}
      title={
        <CellTitle
          icon={Download}
          label="Import Status"
          action={{ label: 'Imports', route: '/admin/imports' }}
        />
      }
    >
      <div className="grid grid-cols-2 gap-px bg-border">
        <Metric label="Active Jobs" value={imports.activeJobs.toString()} ok={imports.activeJobs < 5} />
        <Metric label="Completed" value={imports.completedToday.toString()} ok />
        <Metric label="Failed" value={imports.failedToday.toString()} ok={imports.failedToday === 0} />
        <Metric label="Error Rate" value={`${imports.errorRate}%`} ok={imports.errorRate < 10} />
      </div>
    </BentoCell>
  );
}

// ── Quality Index ───────────────────────────────────────────────────

function QualityCell({ data }: { data: CockpitData }) {
  const { quality } = data;
  return (
    <BentoCell
      span={3}
      title={
        <CellTitle
          icon={ShieldCheck}
          label="Quality Index"
          action={{ label: 'Details', route: '/admin/imports/enrichment' }}
        />
      }
    >
      <div className="text-center py-1">
        <div className="text-4xl font-extrabold leading-none">{quality.overallScore}%</div>
        <div className="text-[0.7rem] font-medium text-muted-foreground mt-1">Overall Score</div>
      </div>
      <div className="bg-muted mt-2" style={{ height: 4 }}>
        <div className="h-full bg-foreground" style={{ width: `${quality.overallScore}%` }} />
      </div>
      <div className="flex justify-center gap-4 mt-2">
        <span className="flex items-center gap-1">
          <AlertTriangle size={11} className="text-muted-foreground" aria-hidden />
          <span className="text-[0.7rem] font-medium">{quality.warnings} warn</span>
        </span>
        <span className="flex items-center gap-1">
          <AlertCircle size={11} className="text-muted-foreground" aria-hidden />
          <span className="text-[0.7rem] font-medium">{quality.critical} critical</span>
        </span>
      </div>
    </BentoCell>
  );
}

// ── Content Overview ────────────────────────────────────────────────

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

function ContentOverviewCell({ stats }: { stats: CockpitData['stats'] }) {
  const navigate = useNavigate();
  const total = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <BentoCell
      span={12}
      title={
        <div className="flex items-center justify-between w-full">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Content Overview
          </h3>
          <span className="text-[0.7rem] text-muted-foreground">
            {total.toLocaleString()} total items
          </span>
        </div>
      }
    >
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-px bg-border">
        {contentStatItems.map(({ key, label, icon: Icon, route }) => (
          <button
            key={key}
            type="button"
            onClick={() => navigate(route)}
            className="flex flex-col items-center gap-1 p-3 bg-background hover:bg-muted/30 text-center"
          >
            <Icon size={16} className="text-muted-foreground" aria-hidden />
            <div className="text-base font-bold leading-none">
              {(stats[key as keyof typeof stats] ?? 0).toLocaleString()}
            </div>
            <div className="font-medium text-muted-foreground text-[0.65rem]">{label}</div>
          </button>
        ))}
      </div>
    </BentoCell>
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
          className="hidden sm:inline-flex normal-case font-medium rounded-element"
        >
          <a.icon size={14} className="mr-1.5" aria-hidden />
          {a.label}
        </Button>
      ))}
    </div>
  );
}

function CockpitSkeleton() {
  return (
    <div className="grid grid-cols-12 gap-px bg-border">
      {[3, 3, 3, 3, 12].map((span, i) => (
        <Skeleton
          key={i}
          className="rounded-none"
          style={{ gridColumn: `span ${span} / span ${span}`, height: span === 12 ? 160 : 200 }}
        />
      ))}
    </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export default function AdminDashboard() {
  const { data, isLoading, refetch } = useAdminCockpit();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <LayoutDashboard size={22} className="text-muted-foreground" aria-hidden />
          <h1 className="text-lg font-bold">Cockpit</h1>
        </div>
        <div className="flex items-center gap-2">
          <QuickActionsBar />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-element"
                onClick={() => refetch()}
                aria-label="Refresh"
              >
                <RefreshCw size={15} aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {isLoading || !data ? (
        <CockpitSkeleton />
      ) : (
        <BentoGrid>
          <SystemStatusCell data={data} />
          <ReviewQueueCell data={data} />
          <ImportStatusCell data={data} />
          <QualityCell data={data} />
          <ContentOverviewCell stats={data.stats} />
        </BentoGrid>
      )}
    </div>
  );
}
