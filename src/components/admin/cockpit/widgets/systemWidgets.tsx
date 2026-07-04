/**
 * Admin-tier cockpit widgets: system health, import status, pipeline errors,
 * release gates. Health/ops surfaces with drill-down into error + gate detail.
 */

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, AlertTriangle, AlertCircle, ShieldCheck } from 'lucide-react';
import { untypedRpc } from '@/integrations/supabase/untyped';
import {
  useSystemHealthQuery,
  useImportSummaryQuery,
} from '@/hooks/useAdminCockpit';
import { usePipelineErrors } from '@/hooks/useCockpitWidgetData';
import { Badge } from '@/components/ui/badge';
import { FreshnessIndicator } from '../FreshnessIndicator';
import { BigStat, MetricTiles, StatRow, DrillButton, WidgetLoading } from './shared';
import type { WidgetRenderContext } from '../types';

export function SystemHealthBody() {
  const q = useSystemHealthQuery();
  const s = q.data;
  if (!s) return <WidgetLoading rows={2} />;

  const StatusIcon =
    s.status === 'healthy' ? CheckCircle2 : s.status === 'degraded' ? AlertTriangle : AlertCircle;
  const label =
    s.status === 'healthy' ? 'Operational' : s.status === 'degraded' ? 'Degraded' : 'Issues';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <StatusIcon size={16} className={s.status === 'error' ? 'text-destructive' : 'text-muted-foreground'} aria-hidden />
          {label}
        </span>
        <FreshnessIndicator dataUpdatedAt={q.dataUpdatedAt} isFetching={q.isFetching} intervalMs={30_000} />
      </div>
      <MetricTiles
        metrics={[
          { label: 'DB latency', value: `${s.dbLatencyMs}ms`, alert: s.dbLatencyMs > 500 },
          { label: 'Errors', value: s.recentErrors, alert: s.recentErrors > 0 },
        ]}
      />
    </div>
  );
}

export function ImportStatusBody() {
  const q = useImportSummaryQuery();
  const i = q.data;
  if (!i) return <WidgetLoading rows={2} />;
  return (
    <div className="flex flex-col gap-3">
      <MetricTiles
        metrics={[
          { label: 'Active', value: i.activeJobs },
          { label: 'Completed', value: i.completedToday },
          { label: 'Failed', value: i.failedToday, alert: i.failedToday > 0 },
          { label: 'Error rate', value: `${i.errorRate}%`, alert: i.errorRate > 10 },
        ]}
      />
    </div>
  );
}

export function PipelineErrorsBody({ openDrillDown }: WidgetRenderContext) {
  const q = usePipelineErrors();
  const rows = q.data;
  if (!rows) return <WidgetLoading rows={2} />;

  const total24h = rows.reduce((s, r) => s + (r.errors_24h ?? 0), 0);
  const top = [...rows].sort((a, b) => (b.errors_24h ?? 0) - (a.errors_24h ?? 0)).slice(0, 3);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between">
        <BigStat value={total24h.toLocaleString()} caption="pipeline errors · 24h" alert={total24h > 0} />
        <FreshnessIndicator dataUpdatedAt={q.dataUpdatedAt} isFetching={q.isFetching} intervalMs={60_000} />
      </div>
      <div className="flex flex-col divide-y divide-border">
        {top.map((r, i) => (
          <StatRow
            key={r.function_name ?? `err-${i}`}
            label={r.function_name ?? 'unknown'}
            value={(r.errors_24h ?? 0).toLocaleString()}
            alert={(r.errors_24h ?? 0) > 0}
          />
        ))}
        {top.length === 0 && <div className="py-1 text-sm text-muted-foreground">No errors.</div>}
      </div>
      {rows.length > 3 && (
        <DrillButton
          label="All functions"
          onClick={() =>
            openDrillDown({
              title: 'Pipeline errors',
              description: 'Error counts by function (last 24h).',
              render: () => (
                <div className="flex flex-col divide-y divide-border">
                  {rows.map((r, i) => (
                    <StatRow
                      key={r.function_name ?? `err-${i}`}
                      label={r.function_name ?? 'unknown'}
                      value={(r.errors_24h ?? 0).toLocaleString()}
                      alert={(r.errors_24h ?? 0) > 0}
                    />
                  ))}
                </div>
              ),
            })
          }
        />
      )}
    </div>
  );
}

interface GateRow {
  check?: string;
  label?: string;
  name?: string;
  severity?: string;
  status?: string;
  ok?: boolean;
  count?: number;
  detail?: string;
}

export function ReleaseGatesBody({ openDrillDown }: WidgetRenderContext) {
  const q = useQuery({
    queryKey: ['cockpit', 'release-gates'],
    queryFn: async (): Promise<GateRow[]> => {
      const { data, error } = await untypedRpc<GateRow[]>('release_gate_checks');
      if (error) throw error;
      if (Array.isArray(data)) return data;
      return [];
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  const gates = q.data;
  if (!gates) return <WidgetLoading rows={2} />;

  const failing = gates.filter((g) => g.ok === false || g.status === 'fail' || (g.count ?? 0) > 0);
  const clear = failing.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck size={16} className={clear ? 'text-muted-foreground' : 'text-destructive'} aria-hidden />
          {clear ? 'All gates clear' : `${failing.length} gate(s) failing`}
        </span>
        <FreshnessIndicator dataUpdatedAt={q.dataUpdatedAt} isFetching={q.isFetching} intervalMs={300_000} />
      </div>
      <div className="flex flex-wrap gap-1">
        {gates.slice(0, 6).map((g, i) => {
          const name = g.label ?? g.check ?? g.name ?? `gate ${i + 1}`;
          const bad = g.ok === false || g.status === 'fail' || (g.count ?? 0) > 0;
          return (
            <Badge key={name + i} variant={bad ? 'destructive' : 'secondary'} className="rounded-badge text-2xs">
              {name}
            </Badge>
          );
        })}
      </div>
      {gates.length > 0 && (
        <DrillButton
          label="Gate detail"
          onClick={() =>
            openDrillDown({
              title: 'Release gates',
              description: 'Safety + integrity checks for deploy confidence.',
              render: () => (
                <div className="flex flex-col divide-y divide-border">
                  {gates.map((g, i) => {
                    const name = g.label ?? g.check ?? g.name ?? `gate ${i + 1}`;
                    const bad = g.ok === false || g.status === 'fail' || (g.count ?? 0) > 0;
                    return (
                      <StatRow
                        key={name + i}
                        label={name}
                        value={bad ? (g.detail ?? `${g.count ?? 'fail'}`) : 'ok'}
                        alert={bad}
                      />
                    );
                  })}
                </div>
              ),
            })
          }
        />
      )}
    </div>
  );
}
