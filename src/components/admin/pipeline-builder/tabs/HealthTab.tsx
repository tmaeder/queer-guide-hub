import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Shield, Zap, Server, Package, GitBranch, Workflow } from 'lucide-react';
import { useCircuitBreakers, useStagingStats, usePipelineDefinitionsList } from '../hooks/usePipelineHistory';
import { untypedFrom, untypedSupabase } from '@/integrations/supabase/untyped';

const DuplicatesPanel = lazy(() => import('@/components/admin/import-hub/DuplicatesPanel').then(m => ({ default: m.DuplicatesPanel })));

const cbClass: Record<string, string> = {
  closed: 'bg-green-100 text-green-700',
  open: 'bg-red-100 text-red-700',
  half_open: 'bg-yellow-100 text-yellow-700',
};

const dispositionColors: Record<string, string> = {
  pending: 'bg-muted-foreground',
  committed: 'bg-green-500',
  rejected: 'bg-destructive',
  skipped: 'bg-amber-500',
  failed: 'bg-destructive',
};

function SectionCard({ icon: Icon, title, extra, children }: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-md bg-background overflow-hidden">
      <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        <span>{title}</span>
        {extra}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function HealthTab() {
  const { data: circuitBreakers = [] } = useCircuitBreakers();
  const { data: stagingStats = [] } = useStagingStats();
  const { data: pipelineDefs = [] } = usePipelineDefinitionsList();
  const navigate = useNavigate();

  const { data: workflowDefs = [] } = useQuery({
    queryKey: ['workflow-definitions-list'],
    queryFn: async () => {
      const { data, error } = await untypedFrom('workflow_definitions')
        .select('id, name, display_name, edge_function, schedule, is_enabled, queue_name')
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: queueMetrics = [] } = useQuery({
    queryKey: ['queue-metrics'],
    queryFn: async () => {
      const { data, error } = await untypedSupabase.rpc('pgmq_metrics_all');
      if (error) throw error;
      return (data || []) as Array<Record<string, unknown>>;
    },
    refetchInterval: 30_000,
  });

  const totalStaging = stagingStats.reduce((sum, s) => sum + s.count, 0);
  const openCircuits = circuitBreakers.filter(cb => cb.state === 'open').length;

  const { data: geoHealth } = useQuery({
    queryKey: ['geo-health'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [
        citiesNoCoords, citiesNoCountry, citiesDupes,
        countriesNoCode, countriesDupes,
        geoMergeCandidates,
      ] = await Promise.all([
        untypedFrom('cities').select('id', { count: 'exact', head: true }).is('latitude', null).is('duplicate_of_id', null),
        untypedFrom('cities').select('id', { count: 'exact', head: true }).is('country_id', null),
        untypedFrom('cities').select('id', { count: 'exact', head: true }).not('duplicate_of_id', 'is', null),
        untypedFrom('countries').select('id', { count: 'exact', head: true }).is('code', null).is('duplicate_of_id', null),
        untypedFrom('countries').select('id', { count: 'exact', head: true }).not('duplicate_of_id', 'is', null),
        untypedFrom('ingestion_staging').select('id', { count: 'exact', head: true })
          .in('target_table', ['cities', 'countries'])
          .eq('dedup_status', 'merge_candidate')
          .eq('review_status', 'pending_review'),
      ]);
      return {
        cities_no_coords:     citiesNoCoords.count ?? 0,
        cities_no_country:    citiesNoCountry.count ?? 0,
        cities_duplicates:    citiesDupes.count ?? 0,
        countries_no_code:    countriesNoCode.count ?? 0,
        countries_duplicates: countriesDupes.count ?? 0,
        geo_merge_candidates: geoMergeCandidates.count ?? 0,
      };
    },
  });

  const { data: deadLetter = [] } = useQuery({
    queryKey: ['ingestion-dead-letter'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await untypedFrom('ingestion_events')
        .select('stage, new_status, payload')
        .in('new_status', ['rejected', 'failed', 'error'])
        .gte('created_at', since)
        .limit(2000);
      const groups: Record<string, { stage: string; errorClass: string; count: number; sample: string }> = {};
      for (const r of (data ?? []) as Array<{ stage: string; new_status: string; payload: Record<string, unknown> | null }>) {
        const errMsg = String((r.payload as Record<string, unknown>)?.error ?? (r.payload as Record<string, unknown>)?.crash ?? r.new_status);
        const errorClass = errMsg.split(':')[0].slice(0, 60);
        const k = `${r.stage}::${errorClass}`;
        if (!groups[k]) groups[k] = { stage: r.stage, errorClass, count: 0, sample: errMsg.slice(0, 200) };
        groups[k].count++;
      }
      return Object.values(groups).sort((a, b) => b.count - a.count).slice(0, 10);
    },
  });

  const { data: enrichSummary = [] } = useQuery({
    queryKey: ['enrichment-audit-summary'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await untypedFrom('enrichment_audit')
        .select('stage, status').gte('created_at', since).limit(5000);
      const counts: Record<string, { success: number; partial: number; failed: number }> = {};
      for (const r of (data ?? []) as Array<{ stage: string; status: string }>) {
        if (!counts[r.stage]) counts[r.stage] = { success: 0, partial: 0, failed: 0 };
        const k = r.status as 'success' | 'partial' | 'failed';
        if (k in counts[r.stage]) counts[r.stage][k]++;
      }
      return Object.entries(counts).map(([stage, c]) => ({ stage, ...c }));
    },
  });

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-5">
        {/* Dead-letter cluster */}
        <SectionCard
          icon={Zap}
          title="Dead-letter — top failure clusters"
          extra={
            <>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">last 24h</Badge>
              {deadLetter.length === 0 && <span className="text-[11px] font-normal text-muted-foreground">(no failures)</span>}
            </>
          }
        >
          {deadLetter.length > 0 && (
            <div className="grid grid-cols-[120px_1fr_80px] gap-x-3 gap-y-1 text-xs">
              <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Stage</div>
              <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Error class</div>
              <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] text-right">Count</div>
              {deadLetter.map((g, i) => (
                <div key={i} className="contents">
                  <div className="font-mono text-[11px] py-1 border-t border-border/40">{g.stage}</div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="py-1 border-t border-border/40 truncate cursor-help">{g.errorClass}</div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs max-w-[400px] whitespace-pre-wrap">{g.sample}</TooltipContent>
                  </Tooltip>
                  <div className={`py-1 border-t border-border/40 text-right font-mono font-semibold ${g.count > 10 ? 'text-destructive' : ''}`}>
                    {g.count}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Enrichment audit */}
        {enrichSummary.length > 0 && (
          <SectionCard title="Enrichment outcomes" extra={<Badge variant="outline" className="text-[10px] px-1.5 py-0">last 24h</Badge>}>
            <div className="grid grid-cols-[1fr_80px_80px_80px] gap-x-3 gap-y-1 text-xs">
              <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Stage</div>
              <div className="font-semibold text-green-700 uppercase tracking-wider text-[10px] text-right">Success</div>
              <div className="font-semibold text-amber-700 uppercase tracking-wider text-[10px] text-right">Partial</div>
              <div className="font-semibold text-destructive uppercase tracking-wider text-[10px] text-right">Failed</div>
              {enrichSummary.map((s, i) => (
                <div key={i} className="contents">
                  <div className="font-mono py-1 border-t border-border/40">{s.stage}</div>
                  <div className="py-1 border-t border-border/40 text-right tabular-nums">{s.success}</div>
                  <div className={`py-1 border-t border-border/40 text-right tabular-nums ${s.partial > 0 ? 'text-amber-700' : ''}`}>{s.partial}</div>
                  <div className={`py-1 border-t border-border/40 text-right tabular-nums ${s.failed > 0 ? 'text-destructive font-semibold' : ''}`}>{s.failed}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Circuit Breakers */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4" />
            <span className="text-sm font-semibold">API Circuit Breakers</span>
            {openCircuits > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-50 text-red-700 border-red-200">{openCircuits} open</Badge>
            )}
          </div>
          {circuitBreakers.length === 0 ? (
            <div className="border border-border rounded-md bg-background p-4 text-center text-xs text-muted-foreground">
              No circuit breakers configured
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {circuitBreakers.map(cb => (
                <div key={cb.id} className="border border-border rounded-md bg-background p-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-medium text-sm truncate">{cb.api_name}</span>
                    <span className={`text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${cbClass[cb.state] || 'bg-muted'}`}>
                      {cb.state === 'half_open' ? 'half' : cb.state}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                    <div>
                      Fails: <span className={`font-mono ${cb.failure_count > 0 ? 'text-destructive font-semibold' : ''}`}>
                        {cb.failure_count}/{cb.threshold}
                      </span>
                    </div>
                    <div>OK: <span className="font-mono">{cb.success_count}</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Geo Health */}
        <SectionCard
          title="Geo Health — Cities & Countries"
          extra={
            (geoHealth?.geo_merge_candidates ?? 0) > 0
              ? <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30">{geoHealth?.geo_merge_candidates} merge candidates</Badge>
              : undefined
          }
        >
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5">
            {[
              { label: 'Cities · no coords',     value: geoHealth?.cities_no_coords },
              { label: 'Cities · no country',    value: geoHealth?.cities_no_country },
              { label: 'Cities · duplicates',    value: geoHealth?.cities_duplicates },
              { label: 'Countries · no ISO',     value: geoHealth?.countries_no_code },
              { label: 'Countries · duplicates', value: geoHealth?.countries_duplicates },
              { label: 'Merge candidates',       value: geoHealth?.geo_merge_candidates },
            ].map(({ label, value }) => (
              <div key={label} className="border border-border rounded-md p-3">
                <div className={`text-2xl font-bold tabular-nums ${(value ?? 0) > 0 ? 'text-primary' : 'text-green-600'}`}>
                  {value ?? '–'}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">{label}</div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Queues + Staging side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SectionCard icon={Server} title="Queue Depths">
            {queueMetrics.length === 0 ? (
              <p className="text-xs text-muted-foreground">No queue data</p>
            ) : (
              <div className="flex flex-col">
                {queueMetrics.map(q => (
                  <div key={q.queue_name as string} className="flex justify-between items-center py-1.5 border-b border-border/40 last:border-0">
                    <span className="text-sm font-mono">{q.queue_name as string}</span>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>
                        Depth:{' '}
                        <strong className={(q.queue_length as number) > 0 ? 'text-amber-600' : 'text-green-600'}>
                          {q.queue_length as number}
                        </strong>
                      </span>
                      <span>Total: <span className="tabular-nums">{q.total_messages as number}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            icon={Package}
            title="Staging"
            extra={<Badge variant="outline" className="text-[10px] px-1.5 py-0">{totalStaging.toLocaleString()} items</Badge>}
          >
            {stagingStats.length === 0 ? (
              <p className="text-xs text-muted-foreground">No staging items</p>
            ) : (
              <>
                <div className="flex h-5 rounded-full overflow-hidden mb-3 gap-[1px] bg-muted">
                  {stagingStats.map(s => (
                    <Tooltip key={s.status}>
                      <TooltipTrigger asChild>
                        <div
                          className={dispositionColors[s.status] || 'bg-muted-foreground'}
                          style={{ width: `${(s.count / totalStaging) * 100}%` }}
                        />
                      </TooltipTrigger>
                      <TooltipContent className="text-xs capitalize">{s.status}: {s.count.toLocaleString()}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(100px,1fr))] gap-2">
                  {stagingStats.map(s => (
                    <div key={s.status} className="text-center p-2 border border-border rounded-md">
                      <div className="text-lg font-bold tabular-nums">{s.count.toLocaleString()}</div>
                      <div className="text-[10px] text-muted-foreground capitalize mt-0.5">{s.status}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </SectionCard>
        </div>

        {/* Duplicates */}
        <Suspense fallback={<div className="p-4"><Skeleton className="h-32 w-full" /></div>}>
          <DuplicatesPanel />
        </Suspense>

        {/* Definitions */}
        <div className="border border-border rounded-md bg-background overflow-hidden">
          <div className="px-4 py-2 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">All Definitions</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate('/admin/pipelines')}>
              <Zap className="h-3.5 w-3.5 mr-1.5" /> Open Builder
            </Button>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0">
                <tr className="border-b border-border">
                  {['Name', 'Type', 'Schedule', 'Enabled'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pipelineDefs?.map((def: Record<string, unknown>) => (
                  <tr key={def.id as string} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-medium">{(def.display_name || def.name) as string}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                        <GitBranch className="h-2.5 w-2.5" /> pipeline
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{(def.schedule as string) || 'Manual'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        def.is_enabled ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
                      }`}>
                        {def.is_enabled ? 'ON' : 'OFF'}
                      </span>
                    </td>
                  </tr>
                ))}
                {workflowDefs?.map((def: Record<string, unknown>) => (
                  <tr key={def.id as string} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-medium">{(def.display_name || def.name) as string}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                        <Workflow className="h-2.5 w-2.5" /> workflow
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{(def.schedule as string) || 'Manual'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        def.is_enabled ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
                      }`}>
                        {def.is_enabled ? 'ON' : 'OFF'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
