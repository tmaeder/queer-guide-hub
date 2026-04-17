import { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { Terminal, X, Pause, Play, ChevronDown, AlertCircle, CheckCircle2, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { supabase } from '@/integrations/supabase/client';

interface LogEvent {
  id: string;
  created_at: string;
  staging_id: string | null;
  stage: string;
  new_status: string;
  actor: string | null;
  payload: Record<string, unknown> | null;
}

interface LogStreamDrawerProps {
  pipelineRunId: string | null;
  onClose: () => void;
}

const stageColor: Record<string, string> = {
  normalize: 'text-blue-600 dark:text-blue-400',
  validate: 'text-amber-600 dark:text-amber-400',
  deduplicate: 'text-violet-600 dark:text-violet-400',
  quality_score: 'text-cyan-600 dark:text-cyan-400',
  review_gate: 'text-orange-600 dark:text-orange-400',
  commit: 'text-green-600 dark:text-green-400',
  enrich: 'text-indigo-600 dark:text-indigo-400',
};

const statusIcon: Record<string, React.ReactNode> = {
  committed: <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />,
  rejected: <AlertCircle className="h-3 w-3 text-destructive" />,
  failed: <AlertCircle className="h-3 w-3 text-destructive" />,
  error: <AlertCircle className="h-3 w-3 text-destructive" />,
  approved: <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />,
};

/**
 * Live log stream for the currently-running pipeline run.
 * Polls ingestion_events every 2s, auto-scrolls unless paused.
 */
export default function LogStreamDrawer({ pipelineRunId, onClose }: LogStreamDrawerProps) {
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<'all' | 'errors'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: events = [] } = useQuery({
    queryKey: ['log-stream', pipelineRunId],
    queryFn: async () => {
      if (!pipelineRunId) return [];
      // Find staging rows tied to this run first
      const { data: staging } = await untypedFrom('ingestion_staging')
        .select('id')
        .eq('pipeline_run_id', pipelineRunId)
        .limit(1000);
      const stagingIds = (staging || []).map((r: Record<string, unknown>) => r.id as string);
      if (stagingIds.length === 0) return [];

      const { data, error } = await untypedFrom('ingestion_events')
        .select('id, created_at, staging_id, stage, new_status, actor, payload')
        .in('staging_id', stagingIds)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown as LogEvent[];
    },
    enabled: !!pipelineRunId && !paused,
    refetchInterval: paused ? false : 2_000,
  });

  // Realtime subscription on ingestion_events (optional extra signal)
  useEffect(() => {
    if (!pipelineRunId || paused) return;
    const channel = supabase
      .channel(`log-stream-${pipelineRunId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ingestion_events' },
        () => {
          // Let the query refetch pick it up — just nudge the cache
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [pipelineRunId, paused]);

  // Auto-scroll to bottom on new events, unless paused
  useEffect(() => {
    if (paused || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events, paused]);

  const filtered = filter === 'errors'
    ? events.filter(e => ['rejected', 'failed', 'error'].includes(e.new_status))
    : events;

  const errorCount = events.filter(e => ['rejected', 'failed', 'error'].includes(e.new_status)).length;

  if (!pipelineRunId) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-popover border-t border-border shadow-2xl max-h-[50vh] flex flex-col animate-in slide-in-from-bottom-4 duration-150">
      <div className="px-4 py-2 border-b border-border flex items-center gap-2 bg-muted/30">
        <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold">Run log stream</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{pipelineRunId.slice(0, 8)}</Badge>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{events.length} events</Badge>
        {errorCount > 0 && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900">
            {errorCount} errors
          </Badge>
        )}

        <div className="flex-1" />

        <div className="flex gap-1">
          <button
            onClick={() => setFilter('all')}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
              filter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-accent'
            }`}
          >All</button>
          <button
            onClick={() => setFilter('errors')}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
              filter === 'errors' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-accent'
            }`}
          >Errors</button>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setPaused(p => !p)}>
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">{paused ? 'Resume' : 'Pause'} auto-refresh</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
              if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }}>
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Scroll to latest</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Close</TooltipContent>
        </Tooltip>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto font-mono text-[11px] bg-background">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            <Filter className="h-4 w-4 inline mr-1" />
            {paused ? 'Paused · ' : ''}
            {events.length === 0 ? 'Waiting for events...' : 'No events match filter'}
          </div>
        ) : (
          <div className="p-2">
            {filtered.slice().reverse().map(e => {
              const stageClass = stageColor[e.stage] || 'text-muted-foreground';
              const isError = ['rejected', 'failed', 'error'].includes(e.new_status);
              const errorMsg = (e.payload as Record<string, unknown>)?.error
                || (e.payload as Record<string, unknown>)?.crash;
              return (
                <div key={e.id} className={`flex items-start gap-2 py-0.5 px-2 rounded hover:bg-muted/30 ${isError ? 'bg-red-50/30 dark:bg-red-950/20' : ''}`}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-muted-foreground text-[10px] whitespace-nowrap cursor-help">
                        {formatDistanceToNow(new Date(e.created_at), { addSuffix: false })}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs font-mono">{format(new Date(e.created_at), 'HH:mm:ss.SSS')}</TooltipContent>
                  </Tooltip>
                  <span className={`${stageClass} font-semibold whitespace-nowrap min-w-[90px]`}>{e.stage}</span>
                  <span className="flex items-center gap-1 min-w-[80px] whitespace-nowrap">
                    {statusIcon[e.new_status]}
                    <span className={isError ? 'text-destructive' : ''}>{e.new_status}</span>
                  </span>
                  {e.staging_id && (
                    <span className="text-muted-foreground text-[10px]">{e.staging_id.slice(0, 8)}</span>
                  )}
                  {typeof errorMsg === 'string' && (
                    <span className="text-destructive truncate flex-1" title={errorMsg}>{errorMsg}</span>
                  )}
                  {e.actor && (
                    <span className="text-muted-foreground text-[10px] ml-auto">{e.actor}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
