/**
 * Moderator-tier cockpit widgets: automation control (inline run/dry-run/toggle),
 * moderation flags, duplicate clusters, refresh-due worklists.
 */

import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Play,
  FlaskConical,
  Loader2,
  CheckCircle2,
  XCircle,
  CopyCheck,
  RefreshCw,
} from 'lucide-react';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { Switch } from '@/components/ui/switch';
import { useAdminCounts } from '@/hooks/useAdminCounts';
import { useReviewSummaryQuery } from '@/hooks/useAdminCockpit';
import { useAutomationActions } from '@/hooks/useAutomationActions';
import { useBackfillActions } from '@/hooks/useBackfillActions';
import { useAutomationList, type AutomationRow } from '@/hooks/useCockpitWidgetData';
import { adminLink } from '@/config/adminLinks';
import { FreshnessIndicator } from '../FreshnessIndicator';
import { BigStat, StatRow, DrillButton, WidgetLoading } from './shared';
import type { WidgetRenderContext } from '../types';

function AutomationItem({ a }: { a: AutomationRow }) {
  const { run, dryRun, setEnabled } = useAutomationActions();
  const busy = run.isPending || dryRun.isPending || setEnabled.isPending;
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm truncate">
          {a.last_run_status === 'success' && <CheckCircle2 size={12} className="text-muted-foreground shrink-0" aria-hidden />}
          {a.last_run_status === 'error' && <XCircle size={12} className="text-destructive shrink-0" aria-hidden />}
          <span className="truncate">{a.name}</span>
        </div>
        {a.last_run_at && (
          <div className="text-3xs text-muted-foreground">
            ran {formatDistanceToNow(new Date(a.last_run_at), { addSuffix: true })}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          aria-label={`Dry-run ${a.name}`}
          disabled={busy}
          onClick={() => dryRun.mutate(a.slug)}
          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <FlaskConical size={14} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Run ${a.name}`}
          disabled={busy}
          onClick={() => run.mutate(a.slug)}
          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {run.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />}
        </button>
        <Switch
          checked={a.enabled}
          disabled={busy}
          onCheckedChange={(next) => setEnabled.mutate({ slug: a.slug, enabled: next })}
          aria-label={`${a.enabled ? 'Disable' : 'Enable'} ${a.name}`}
        />
      </div>
    </div>
  );
}

export function AutomationControlBody({ openDrillDown }: WidgetRenderContext) {
  const q = useAutomationList();
  const list = q.data;
  if (!list) return <WidgetLoading />;

  const enabled = list.filter((a) => a.enabled).length;
  const failing = list.filter((a) => a.last_run_status === 'error').length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between">
        <div className="flex gap-6">
          <BigStat value={enabled} caption="enabled" />
          <BigStat value={failing} caption="failing" alert={failing > 0} />
        </div>
        <FreshnessIndicator dataUpdatedAt={q.dataUpdatedAt} isFetching={q.isFetching} intervalMs={30_000} />
      </div>
      <div className="flex flex-col divide-y divide-border">
        {list.slice(0, 3).map((a) => (
          <AutomationItem key={a.slug} a={a} />
        ))}
      </div>
      <DrillButton
        label={`All ${list.length} automations`}
        onClick={() =>
          openDrillDown({
            title: 'Automations',
            description: 'Run, dry-run, or toggle any automation.',
            render: () => (
              <div className="flex flex-col divide-y divide-border">
                {list.map((a) => (
                  <AutomationItem key={a.slug} a={a} />
                ))}
              </div>
            ),
          })
        }
      />
    </div>
  );
}

export function ModerationFlagsBody() {
  const navigate = useNavigate();
  const q = useReviewSummaryQuery();
  if (!q.data) return <WidgetLoading rows={1} />;
  return (
    <div className="flex flex-col gap-2">
      <BigStat value={q.data.moderation.toLocaleString()} caption="open moderation flags" alert={q.data.moderation > 0} />
      <DrillButton label="Resolve flags" onClick={() => navigate(adminLink.review('moderation'))} />
    </div>
  );
}

export function DuplicateClustersBody() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CopyCheck size={16} aria-hidden />
        Reversible merge review for near-duplicate entities.
      </div>
      <DrillButton label="Review duplicates" onClick={() => navigate(adminLink.duplicates())} />
    </div>
  );
}

interface DueRow {
  id?: string;
  name?: string;
  title?: string;
  city_name?: string;
}

function useRefreshDue() {
  return useQuery({
    queryKey: ['cockpit', 'refresh-due'],
    queryFn: async () => {
      const [cities, news, venues] = await Promise.all([
        untypedRpc<DueRow[]>('cities_due_for_refresh', { limit: 50 }),
        untypedRpc<DueRow[]>('news_due_for_refresh', { limit: 50 }),
        untypedRpc<DueRow[]>('venues_due_for_amenity_backfill', { limit: 50 }),
      ]);
      return {
        cities: (cities.data ?? []).length,
        news: (news.data ?? []).length,
        venues: (venues.data ?? []).length,
      };
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

const QUALITY_GATES = [
  { key: 'quality_city', label: 'Cities' },
  { key: 'quality_venue', label: 'Venues' },
  { key: 'quality_personality', label: 'Personalities' },
  { key: 'quality_marketplace', label: 'Marketplace' },
  { key: 'quality_village', label: 'Villages' },
  { key: 'quality_existence', label: 'Liveness' },
  { key: 'quality_editorial', label: 'Editorial drafts' },
] as const;

export function QualityGatesBody() {
  const navigate = useNavigate();
  const q = useAdminCounts();
  const counts = q.data;
  if (!counts) return <WidgetLoading rows={2} />;

  const total = QUALITY_GATES.reduce((sum, g) => sum + (counts[g.key] ?? 0), 0);
  const nonEmpty = QUALITY_GATES.filter((g) => (counts[g.key] ?? 0) > 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between">
        <BigStat value={total.toLocaleString()} caption="pending in quality gates" alert={total > 50} />
        <FreshnessIndicator dataUpdatedAt={q.dataUpdatedAt} isFetching={q.isFetching} intervalMs={60_000} />
      </div>
      <div className="flex flex-col divide-y divide-border">
        {nonEmpty.slice(0, 4).map((g) => (
          <StatRow key={g.key} label={g.label} value={counts[g.key] ?? 0} onClick={() => navigate('/admin/quality')} />
        ))}
      </div>
      <DrillButton label="Open Quality hub" onClick={() => navigate('/admin/quality')} />
    </div>
  );
}

export function RefreshDueBody() {
  const q = useRefreshDue();
  const { runBackfill } = useBackfillActions();
  const due = q.data;
  if (!due) return <WidgetLoading />;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-medium uppercase tracking-label text-muted-foreground">
          Due for refresh
        </span>
        <FreshnessIndicator dataUpdatedAt={q.dataUpdatedAt} isFetching={q.isFetching} intervalMs={300_000} />
      </div>
      <div className="flex flex-col divide-y divide-border">
        <StatRow label="Cities (safety)" value={`${due.cities}+`} />
        <StatRow label="Venues (amenities)" value={`${due.venues}+`} />
        <StatRow label="News" value={`${due.news}+`} />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={runBackfill.isPending}
          onClick={() => runBackfill.mutate('city_safety_backfill')}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw size={12} className={runBackfill.isPending ? 'animate-spin' : undefined} aria-hidden />
          City safety
        </button>
        <button
          type="button"
          disabled={runBackfill.isPending}
          onClick={() => runBackfill.mutate('amenity_truth_backfill')}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw size={12} aria-hidden />
          Amenities
        </button>
      </div>
    </div>
  );
}
