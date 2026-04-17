import { useState, useMemo } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import {
  History, Save, Play, User, Clock, Search, Filter, CheckCircle2, XCircle, Loader2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { untypedFrom } from '@/integrations/supabase/untyped';

/**
 * Unified audit trail combining:
 *   - pipeline_definition_versions (save events — who edited which pipeline)
 *   - pipeline_runs (execution events — triggered by whom, what outcome)
 * Sorted in reverse chronological order with filter + search.
 */

interface VersionEvent {
  id: string;
  kind: 'save';
  timestamp: string;
  pipeline_id: string;
  pipeline_name: string;
  version: number;
  actor_id: string | null;
  nodes_count: number;
  edges_count: number;
}

interface RunEvent {
  id: string;
  kind: 'run';
  timestamp: string;
  pipeline_id: string;
  pipeline_name: string;
  status: string;
  items_succeeded: number | null;
  items_total: number | null;
  triggered_by: string | null;
  duration_ms: number | null;
  pipeline_version: number | null;
  error_message: string | null;
}

type AuditEvent = VersionEvent | RunEvent;

type KindFilter = 'all' | 'save' | 'run';

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

export default function AuditTab() {
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');

  const { data: versions = [] } = useQuery({
    queryKey: ['audit-versions'],
    queryFn: async () => {
      const { data, error } = await untypedFrom('pipeline_definition_versions')
        .select('id, pipeline_id, name, display_name, version, saved_by, saved_at, nodes, edges')
        .order('saved_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        kind: 'save' as const,
        timestamp: r.saved_at as string,
        pipeline_id: r.pipeline_id as string,
        pipeline_name: (r.display_name || r.name) as string,
        version: r.version as number,
        actor_id: r.saved_by as string | null,
        nodes_count: Array.isArray(r.nodes) ? r.nodes.length : 0,
        edges_count: Array.isArray(r.edges) ? r.edges.length : 0,
      })) as VersionEvent[];
    },
    refetchInterval: 30_000,
  });

  const { data: runs = [] } = useQuery({
    queryKey: ['audit-runs'],
    queryFn: async () => {
      const { data, error } = await untypedFrom('pipeline_runs')
        .select('id, pipeline_id, pipeline_name, status, items_succeeded, items_total, triggered_by, duration_ms, pipeline_version, error_message, started_at, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        kind: 'run' as const,
        timestamp: (r.started_at || r.created_at) as string,
        pipeline_id: r.pipeline_id as string,
        pipeline_name: r.pipeline_name as string,
        status: r.status as string,
        items_succeeded: r.items_succeeded as number | null,
        items_total: r.items_total as number | null,
        triggered_by: r.triggered_by as string | null,
        duration_ms: r.duration_ms as number | null,
        pipeline_version: r.pipeline_version as number | null,
        error_message: r.error_message as string | null,
      })) as RunEvent[];
    },
    refetchInterval: 15_000,
  });

  const events: AuditEvent[] = useMemo(() => {
    const combined: AuditEvent[] = [...versions, ...runs];
    combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return combined;
  }, [versions, runs]);

  const filtered = useMemo(() => {
    return events.filter(e => {
      if (kindFilter !== 'all' && e.kind !== kindFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!e.pipeline_name?.toLowerCase().includes(q)
            && !(e.kind === 'run' ? (e.triggered_by || '') : '').toLowerCase().includes(q)
            && !(e.kind === 'run' && (e.error_message || '').toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [events, kindFilter, search]);

  const counts = {
    all: events.length,
    save: versions.length,
    run: runs.length,
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Audit Trail</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{events.length} events</Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
            <Save className="h-2.5 w-2.5" /> {counts.save} saves
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
            <Play className="h-2.5 w-2.5" /> {counts.run} runs
          </Badge>

          <div className="relative flex-1 max-w-xs ml-2">
            <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pipeline, actor, error..."
              className="h-7 pl-6 text-xs"
            />
          </div>

          <div className="flex gap-1">
            {(['all', 'save', 'run'] as const).map(f => (
              <button
                key={f}
                onClick={() => setKindFilter(f)}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                  kindFilter === f
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:bg-accent'
                }`}
              >{f}</button>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="border border-border rounded-md bg-background overflow-hidden">
          <div className="max-h-[650px] overflow-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-xs">
                <Filter className="h-5 w-5 inline mb-1 opacity-40" />
                <div>{events.length === 0 ? 'No audit events yet' : 'No events match filters'}</div>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {filtered.map(e => {
                  if (e.kind === 'save') {
                    return (
                      <div key={`save-${e.id}`} className="p-3 flex items-start gap-3 hover:bg-muted/30 transition-colors">
                        <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
                          <Save className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium truncate">{e.pipeline_name}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">v{e.version}</Badge>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                            <span>{e.nodes_count} nodes · {e.edges_count} edges</span>
                            {e.actor_id && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-1 cursor-help">
                                    <User className="h-2.5 w-2.5" />
                                    <span className="font-mono">{e.actor_id.slice(0, 8)}</span>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs font-mono">{e.actor_id}</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap cursor-help">
                              <Clock className="h-2.5 w-2.5 inline mr-1" />
                              {formatDistanceToNow(new Date(e.timestamp), { addSuffix: true })}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs font-mono">
                            {format(new Date(e.timestamp), 'PPpp')}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    );
                  } else {
                    const StatusIcon = e.status === 'completed' ? CheckCircle2
                                      : e.status === 'failed' ? XCircle
                                      : Loader2;
                    const statusColorClass = e.status === 'completed' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                                            : e.status === 'failed' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                                            : e.status === 'running' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                                            : 'bg-muted text-muted-foreground';
                    return (
                      <div key={`run-${e.id}`} className="p-3 flex items-start gap-3 hover:bg-muted/30 transition-colors">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${statusColorClass}`}>
                          <StatusIcon className={`h-3.5 w-3.5 ${e.status === 'running' ? 'animate-spin' : ''}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium truncate">{e.pipeline_name}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                              <Play className="h-2.5 w-2.5" />
                              {e.status}
                            </Badge>
                            {e.pipeline_version != null && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">v{e.pipeline_version}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                            <span>
                              <span className="text-green-700 dark:text-green-300 font-semibold">{e.items_succeeded ?? 0}</span>
                              <span> / {e.items_total ?? 0}</span>
                            </span>
                            <span className="font-mono">{formatDuration(e.duration_ms)}</span>
                            {e.triggered_by && (
                              <span className="flex items-center gap-1">
                                <User className="h-2.5 w-2.5" />
                                <span className="font-mono">{e.triggered_by}</span>
                              </span>
                            )}
                            {e.error_message && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-destructive truncate max-w-[320px] cursor-help">{e.error_message}</span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs max-w-[480px] whitespace-pre-wrap">{e.error_message}</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap cursor-help">
                              <Clock className="h-2.5 w-2.5 inline mr-1" />
                              {formatDistanceToNow(new Date(e.timestamp), { addSuffix: true })}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs font-mono">
                            {format(new Date(e.timestamp), 'PPpp')}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    );
                  }
                })}
              </div>
            )}
          </div>
          {filtered.length > 0 && (
            <div className="px-3 py-1.5 border-t border-border text-[11px] text-muted-foreground">
              Showing {filtered.length} of {events.length} events
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
