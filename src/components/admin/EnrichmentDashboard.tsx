import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  XCircle,
  Clock,
  Sparkles,
  Building,
  Calendar,
  Users,
  Newspaper,
  GitMerge,
  BarChart3,
  Inbox,
  Check,
  X,
} from 'lucide-react';
import {
  useEnrichmentDashboard,
  useEnrichmentFailures,
  useRetryEnrichment,
  useResolveReviewItem,
  type EnrichmentDashboardData,
  type ReviewQueueItem,
  type QualityDistribution,
} from '@/hooks/useEnrichmentDashboard';
import { brandColors } from '@/theme/muiTheme';

// Lightweight alpha helper
function alphaHex(color: string, a: number): string {
  if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return `color-mix(in srgb, ${color} ${a * 100}%, transparent)`;
}

// ── Helper ──────────────────────────────────────────────────────────────

const ENTITY_META: Record<string, { label: string; icon: typeof Building; color: string }> = {
  venues: { label: 'Venues', icon: Building, color: brandColors.main },
  events: { label: 'Events', icon: Calendar, color: '#ec4899' },
  personalities: { label: 'Personalities', icon: Users, color: '#f59e0b' },
  news_articles: { label: 'News', icon: Newspaper, color: '#3b82f6' },
};

const STEP_LABELS: Record<string, string> = {
  geo_link: 'Geo Link',
  embedding: 'Embedding',
  ensure_links: 'Links',
  dedupe_check: 'Dedupe',
  quality_score: 'Quality Score',
};

const REVIEW_TYPE_META: Record<string, { label: string; color: string; icon: typeof GitMerge }> = {
  duplicate: { label: 'Duplicate', color: '#f59e0b', icon: GitMerge },
  low_quality: { label: 'Low Quality', color: '#ef4444', icon: AlertCircle },
  anomaly: { label: 'Anomaly', color: brandColors.main, icon: AlertTriangle },
  stale: { label: 'Stale', color: '#6b7280', icon: Clock },
  broken_source: { label: 'Broken Source', color: '#ea580c', icon: XCircle },
};

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const cardCls = 'border border-border rounded-lg bg-background p-5';

// ── Pipeline Health Card ────────────────────────────────────────────────

function PipelineHealthCard({ data }: { data: EnrichmentDashboardData }) {
  const { health } = data;
  const { last24h } = health;
  const successRate = last24h.total > 0 ? Math.round((last24h.done / last24h.total) * 100) : 100;
  const statusColor = successRate >= 95 ? '#10b981' : successRate >= 80 ? '#f59e0b' : '#ef4444';

  return (
    <div className={cardCls}>
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ background: alphaHex('#10b981', 0.1) }}
        >
          <Activity size={15} style={{ color: '#10b981' }} />
        </div>
        <h3 className="text-sm font-semibold">Pipeline Health (24h)</h3>
        {health.queueDepth > 0 && (
          <Badge
            className="ml-auto h-5 text-[0.7rem] font-semibold"
            style={{ background: alphaHex('#3b82f6', 0.12), color: '#3b82f6' }}
          >
            {health.queueDepth} queued
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <MetricBox label="Total" value={last24h.total.toLocaleString()} color="#3b82f6" />
        <MetricBox label="Done" value={last24h.done.toLocaleString()} color="#10b981" />
        <MetricBox
          label="Failed"
          value={last24h.failed.toLocaleString()}
          color={last24h.failed > 0 ? '#ef4444' : '#10b981'}
        />
        <MetricBox label="Success Rate" value={`${successRate}%`} color={statusColor} />
      </div>

      {Object.keys(health.avgDurationMs).length > 0 && (
        <>
          <div className="text-xs font-semibold text-muted-foreground mb-2 block">
            Avg Duration by Step
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(health.avgDurationMs).map(([step, ms]) => (
              <span
                key={step}
                className="inline-flex items-center rounded border px-2 h-[22px] text-[0.7rem]"
                style={{
                  borderColor: health.failuresByStep[step]
                    ? alphaHex('#ef4444', 0.4)
                    : 'hsl(var(--border))',
                  color: health.failuresByStep[step] ? '#ef4444' : 'hsl(var(--muted-foreground))',
                }}
              >
                {`${STEP_LABELS[step] ?? step}: ${formatMs(ms)}`}
              </span>
            ))}
          </div>
        </>
      )}

      {Object.keys(health.failuresByStep).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(health.failuresByStep).map(([step, count]) => (
            <span
              key={step}
              className="inline-flex items-center gap-1 rounded px-2 h-[22px] text-[0.7rem]"
              style={{ background: alphaHex('#ef4444', 0.08), color: '#ef4444' }}
            >
              <AlertCircle size={12} />
              {`${STEP_LABELS[step] ?? step}: ${count} failures`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="p-3 rounded-md text-center"
      style={{ background: alphaHex(color, 0.06) }}
    >
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-base font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

// ── Quality Distribution Card ───────────────────────────────────────────

function QualityDistributionCard({ quality }: { quality: QualityDistribution[] }) {
  return (
    <div className={cardCls}>
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ background: alphaHex('#3b82f6', 0.1) }}
        >
          <BarChart3 size={15} style={{ color: '#3b82f6' }} />
        </div>
        <h3 className="text-sm font-semibold">Quality Scores</h3>
      </div>

      <div className="flex flex-col gap-4">
        {quality.map((q) => {
          const meta = ENTITY_META[q.entityType];
          if (!meta) return null;
          const Icon = meta.icon;
          const excellentPct = q.total > 0 ? (q.excellent / q.total) * 100 : 0;
          const goodPct = q.total > 0 ? (q.good / q.total) * 100 : 0;
          const attentionPct = q.total > 0 ? (q.needsAttention / q.total) * 100 : 0;

          return (
            <div key={q.entityType}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Icon size={14} style={{ color: meta.color }} />
                  <span className="text-sm font-semibold">{meta.label}</span>
                </div>
                <span className="text-xs font-semibold text-muted-foreground">
                  avg {q.avgScore}
                </span>
              </div>

              <div
                className="flex h-2 rounded-full overflow-hidden"
                style={{ background: alphaHex('#64748b', 0.1) }}
              >
                {excellentPct > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div style={{ width: `${excellentPct}%`, background: '#10b981' }} />
                    </TooltipTrigger>
                    <TooltipContent>{`Excellent (>=80): ${q.excellent}`}</TooltipContent>
                  </Tooltip>
                )}
                {goodPct > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div style={{ width: `${goodPct}%`, background: '#f59e0b' }} />
                    </TooltipTrigger>
                    <TooltipContent>{`Good (40-79): ${q.good}`}</TooltipContent>
                  </Tooltip>
                )}
                {attentionPct > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div style={{ width: `${attentionPct}%`, background: '#ef4444' }} />
                    </TooltipTrigger>
                    <TooltipContent>{`Needs Attention (<40): ${q.needsAttention}`}</TooltipContent>
                  </Tooltip>
                )}
              </div>

              <div className="flex gap-4 mt-1">
                <span className="text-xs font-medium" style={{ color: '#10b981' }}>
                  {q.excellent.toLocaleString()} excellent
                </span>
                <span className="text-xs font-medium" style={{ color: '#f59e0b' }}>
                  {q.good.toLocaleString()} good
                </span>
                {q.needsAttention > 0 && (
                  <span className="text-xs font-medium" style={{ color: '#ef4444' }}>
                    {q.needsAttention.toLocaleString()} attention
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-4 mt-4 pt-3 border-t border-border">
        <div className="flex items-center gap-1">
          <div
            className="rounded-full"
            style={{ width: 8, height: 8, background: '#10b981' }}
          />
          <span className="text-xs text-muted-foreground">Excellent (80+)</span>
        </div>
        <div className="flex items-center gap-1">
          <div
            className="rounded-full"
            style={{ width: 8, height: 8, background: '#f59e0b' }}
          />
          <span className="text-xs text-muted-foreground">Good (40-79)</span>
        </div>
        <div className="flex items-center gap-1">
          <div
            className="rounded-full"
            style={{ width: 8, height: 8, background: '#ef4444' }}
          />
          <span className="text-xs text-muted-foreground">Needs Attention (&lt;40)</span>
        </div>
      </div>
    </div>
  );
}

// ── Needs Attention Summary ─────────────────────────────────────────────

function NeedsAttentionCard({ data }: { data: EnrichmentDashboardData }) {
  const { needsAttention } = data;

  return (
    <div className={cardCls}>
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ background: alphaHex('#ef4444', 0.1) }}
        >
          <AlertTriangle size={15} style={{ color: '#ef4444' }} />
        </div>
        <h3 className="text-sm font-semibold">Needs Attention</h3>
        {needsAttention.total > 0 && (
          <Badge
            className="ml-auto h-5 text-[0.7rem] font-bold"
            style={{ background: alphaHex('#ef4444', 0.12), color: '#ef4444' }}
          >
            {needsAttention.total}
          </Badge>
        )}
      </div>

      {needsAttention.total === 0 ? (
        <div
          className="flex items-center gap-2 p-4 rounded-md"
          style={{ background: alphaHex('#10b981', 0.06) }}
        >
          <CheckCircle2 size={16} style={{ color: '#10b981' }} />
          <span className="text-sm font-medium" style={{ color: '#10b981' }}>
            All content is above quality threshold
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {(['venues', 'events', 'personalities', 'news_articles'] as const).map((type) => {
            const meta = ENTITY_META[type];
            const count = needsAttention[type];
            const Icon = meta.icon;
            return (
              <div
                key={type}
                className="p-3 rounded-md text-center"
                style={{
                  background:
                    count > 0 ? alphaHex('#ef4444', 0.06) : alphaHex('#10b981', 0.04),
                }}
              >
                <Icon
                  size={16}
                  style={{
                    color: count > 0 ? '#ef4444' : meta.color,
                    marginBottom: 4,
                    margin: '0 auto 4px',
                  }}
                />
                <div
                  className="text-base font-bold"
                  style={{ color: count > 0 ? '#ef4444' : '#10b981' }}
                >
                  {count}
                </div>
                <div className="text-xs font-medium text-muted-foreground">{meta.label}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Review Queue Card ───────────────────────────────────────────────────

function ReviewQueueCard({ items }: { items: ReviewQueueItem[] }) {
  const resolve = useResolveReviewItem();
  const [confirmItem, setConfirmItem] = useState<{
    item: ReviewQueueItem;
    action: 'resolved' | 'dismissed';
  } | null>(null);

  const handleResolve = () => {
    if (!confirmItem) return;
    resolve.mutate(
      { id: confirmItem.item.id, resolution: confirmItem.action },
      { onSettled: () => setConfirmItem(null) },
    );
  };

  return (
    <div className={cardCls}>
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ background: alphaHex('#f59e0b', 0.1) }}
        >
          <Inbox size={15} style={{ color: '#f59e0b' }} />
        </div>
        <h3 className="text-sm font-semibold">Review Queue</h3>
        <Badge
          className="ml-auto h-5 text-[0.7rem] font-semibold"
          style={{
            background: items.length > 0 ? alphaHex('#f59e0b', 0.12) : alphaHex('#10b981', 0.12),
            color: items.length > 0 ? '#f59e0b' : '#10b981',
          }}
        >
          {items.length} pending
        </Badge>
      </div>

      {items.length === 0 ? (
        <div
          className="flex items-center gap-2 p-4 rounded-md"
          style={{ background: alphaHex('#10b981', 0.06) }}
        >
          <CheckCircle2 size={16} style={{ color: '#10b981' }} />
          <span className="text-sm font-medium" style={{ color: '#10b981' }}>
            No items pending review
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1 overflow-auto" style={{ maxHeight: 400 }}>
          {items.map((item) => {
            const typeMeta = REVIEW_TYPE_META[item.review_type] ?? REVIEW_TYPE_META.anomaly;
            const entityMeta = ENTITY_META[item.entity_type];
            const TypeIcon = typeMeta.icon;
            const details = item.details as Record<string, unknown>;

            return (
              <div
                key={item.id}
                className="flex items-center justify-between px-3 py-2 rounded hover:bg-muted"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <TypeIcon size={14} style={{ color: typeMeta.color, flexShrink: 0 }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-flex items-center rounded px-1.5 h-[18px] text-[0.6rem] font-semibold"
                        style={{
                          background: alphaHex(typeMeta.color, 0.1),
                          color: typeMeta.color,
                        }}
                      >
                        {typeMeta.label}
                      </span>
                      <span className="inline-flex items-center rounded border px-1.5 h-[18px] text-[0.6rem]">
                        {entityMeta?.label ?? item.entity_type}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground block mt-0.5 truncate">
                      {(details.candidate_name as string)
                        ? `Similar to: ${details.candidate_name as string} (${Math.round(((details.similarity_score as number) ?? 0) * 100)}%)`
                        : (details.reason as string) ?? item.entity_id.slice(0, 8)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-1 flex-shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setConfirmItem({ item, action: 'resolved' })}
                        style={{ color: '#10b981' }}
                      >
                        <Check size={14} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Resolve</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setConfirmItem({ item, action: 'dismissed' })}
                        style={{ color: '#6b7280' }}
                      >
                        <X size={14} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Dismiss</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!confirmItem} onOpenChange={(open) => !open && setConfirmItem(null)}>
        <DialogContent className="max-w-xs">
          {confirmItem && (
            <>
              <DialogHeader>
                <DialogTitle className="font-bold">
                  {confirmItem.action === 'resolved' ? 'Resolve' : 'Dismiss'} Review Item?
                </DialogTitle>
                <DialogDescription>
                  {confirmItem.action === 'resolved'
                    ? 'This marks the item as reviewed and resolved.'
                    : 'This dismisses the item without action.'}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirmItem(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleResolve}
                  disabled={resolve.isPending}
                  variant={confirmItem.action === 'resolved' ? 'default' : 'secondary'}
                >
                  {confirmItem.action === 'resolved' ? 'Resolve' : 'Dismiss'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Failed Enrichments Card ─────────────────────────────────────────────

function FailedEnrichmentsCard() {
  const { data: failures, isLoading } = useEnrichmentFailures();
  const retry = useRetryEnrichment();

  if (isLoading) {
    return <Skeleton className="rounded-lg" style={{ height: 200 }} />;
  }

  const items = failures ?? [];

  return (
    <div className={cardCls}>
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ background: alphaHex('#ef4444', 0.1) }}
        >
          <XCircle size={15} style={{ color: '#ef4444' }} />
        </div>
        <h3 className="text-sm font-semibold">Failed Enrichments (7d)</h3>
        <Badge
          className="ml-auto h-5 text-[0.7rem] font-semibold"
          style={{
            background: items.length > 0 ? alphaHex('#ef4444', 0.12) : alphaHex('#10b981', 0.12),
            color: items.length > 0 ? '#ef4444' : '#10b981',
          }}
        >
          {items.length}
        </Badge>
      </div>

      {items.length === 0 ? (
        <div
          className="flex items-center gap-2 p-4 rounded-md"
          style={{ background: alphaHex('#10b981', 0.06) }}
        >
          <CheckCircle2 size={16} style={{ color: '#10b981' }} />
          <span className="text-sm font-medium" style={{ color: '#10b981' }}>
            No failed enrichments
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1 overflow-auto" style={{ maxHeight: 300 }}>
          {items.map((item) => {
            const entityMeta = ENTITY_META[item.entity_type];
            const EntityIcon = entityMeta?.icon ?? Building;
            return (
              <div
                key={`${item.entity_type}-${item.entity_id}`}
                className="flex items-center justify-between px-3 py-2 rounded hover:bg-muted"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <EntityIcon
                    size={14}
                    style={{ color: entityMeta?.color ?? '#6b7280', flexShrink: 0 }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center rounded border px-1.5 h-[18px] text-[0.6rem]">
                        {entityMeta?.label ?? item.entity_type}
                      </span>
                      {item.failed_steps?.map((step) => (
                        <span
                          key={step}
                          className="inline-flex items-center rounded px-1.5 h-[18px] text-[0.6rem] font-semibold"
                          style={{ background: alphaHex('#ef4444', 0.1), color: '#ef4444' }}
                        >
                          {STEP_LABELS[step] ?? step}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground block mt-0.5 truncate">
                      {item.entity_id.slice(0, 8)}... | score: {item.quality_score ?? 'n/a'}
                    </p>
                  </div>
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() =>
                        retry.mutate({ entityType: item.entity_type, entityId: item.entity_id })
                      }
                      disabled={retry.isPending}
                      style={{ color: '#3b82f6' }}
                    >
                      <RefreshCw size={14} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Retry failed steps</TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>
      )}

      {items.length > 5 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            items.forEach((item) =>
              retry.mutate({ entityType: item.entity_type, entityId: item.entity_id }),
            )
          }
          disabled={retry.isPending}
          className="mt-3 font-semibold"
        >
          <RefreshCw size={14} className="mr-1.5" />
          Retry All ({items.length})
        </Button>
      )}
    </div>
  );
}

// ── Loading Skeleton ────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="rounded-lg" style={{ height: 200 }} />
        ))}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

export function EnrichmentDashboard() {
  const { data, isLoading, refetch } = useEnrichmentDashboard();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Sparkles size={24} style={{ color: '#0891b2' }} />
          <h1 className="text-xl font-bold">Enrichment Pipeline</h1>
        </div>
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

      {isLoading || !data ? (
        <DashboardSkeleton />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <PipelineHealthCard data={data} />
            </div>
            <NeedsAttentionCard data={data} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <QualityDistributionCard quality={data.quality} />
            <ReviewQueueCard items={data.reviewQueue} />
          </div>

          <FailedEnrichmentsCard />
        </div>
      )}
    </div>
  );
}
