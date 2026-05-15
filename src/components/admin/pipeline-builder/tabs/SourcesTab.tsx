import { lazy, Suspense, useState, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { Power, AlertTriangle, CheckCircle, Clock, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

const WebScrapersPanel = lazy(() => import('@/components/admin/WebScrapersPanel').then(m => ({ default: m.WebScrapersPanel })));
const IngestionSourcesManager = lazy(() => import('@/components/admin/IngestionSourcesManager').then(m => ({ default: m.IngestionSourcesManager })));
const NewsSourcesManager = lazy(() => import('@/components/admin/NewsSourcesManager').then(m => ({ default: m.NewsSourcesManager })));
const ApiKeysManager = lazy(() => import('@/components/admin/ApiKeysManager').then(m => ({ default: m.ApiKeysManager })));

const panelFallback = (
  <div className="p-4 space-y-2">
    <Skeleton className="h-6 w-48" />
    <Skeleton className="h-32 w-full" />
  </div>
);

interface ScrapeSource {
  id: string;
  slug: string;
  name: string;
  url: string | null;
  target_table: string | null;
  content_type: string | null;
  schedule_cron: string | null;
  is_enabled: boolean;
  priority: number;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  total_runs: number;
  total_items_fetched: number;
  consecutive_failures: number;
}

type StatusKey = 'healthy' | 'stale' | 'failing' | 'disabled' | 'never';
type HealthFilter = 'all' | StatusKey;

function statusFor(s: ScrapeSource): { key: StatusKey; icon: React.ComponentType<{ className?: string }>; className: string; label: string } {
  if (!s.is_enabled) return { key: 'disabled', icon: Power, className: 'text-muted-foreground', label: 'disabled' };
  if (s.consecutive_failures >= 3) return { key: 'failing', icon: AlertTriangle, className: 'text-destructive', label: `${s.consecutive_failures} failures` };
  if (!s.last_success_at) return { key: 'never', icon: Clock, className: 'text-muted-foreground', label: 'never run' };
  const hrs = (Date.now() - new Date(s.last_success_at).getTime()) / 3_600_000;
  if (hrs > 48) return { key: 'stale', icon: AlertTriangle, className: 'text-amber-600 dark:text-amber-400', label: `stale ${Math.round(hrs)}h` };
  return { key: 'healthy', icon: CheckCircle, className: 'text-green-600 dark:text-green-400', label: 'healthy' };
}

export default function SourcesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<HealthFilter>('all');

  const { data: sources, isLoading } = useQuery({
    queryKey: ['scrape-sources'],
    queryFn: async () => {
      const { data, error } = await untypedFrom('scrape_sources')
        .select('*')
        .order('priority', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ScrapeSource[];
    },
    refetchInterval: 30_000,
  });

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await untypedFrom('scrape_sources').update({ is_enabled: enabled }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scrape-sources'] }),
    onError: (e: Error) => toast.error(`Toggle failed: ${e.message}`),
  });

  const bulkToggle = useMutation({
    mutationFn: async ({ ids, enabled }: { ids: string[]; enabled: boolean }) => {
      const { error } = await untypedFrom('scrape_sources').update({ is_enabled: enabled }).in('id', ids);
      if (error) throw error;
    },
    onSuccess: (_, { ids, enabled }) => {
      qc.invalidateQueries({ queryKey: ['scrape-sources'] });
      toast.success(`${enabled ? 'Enabled' : 'Disabled'} ${ids.length} sources`);
    },
    onError: (e: Error) => toast.error(`Bulk toggle failed: ${e.message}`),
  });

  const { filtered, counts } = useMemo(() => {
    const counts = { all: 0, healthy: 0, stale: 0, failing: 0, disabled: 0, never: 0 };
    const result: Array<ScrapeSource & { _status: ReturnType<typeof statusFor> }> = [];
    for (const s of sources || []) {
      const st = statusFor(s);
      counts.all++;
      counts[st.key]++;
      if (filter !== 'all' && st.key !== filter) continue;
      if (search) {
        const q = search.toLowerCase();
        if (!s.name.toLowerCase().includes(q)
            && !s.slug.toLowerCase().includes(q)
            && !(s.target_table || '').toLowerCase().includes(q)) continue;
      }
      result.push({ ...s, _status: st });
    }
    return { filtered: result, counts };
  }, [sources, search, filter]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-4">
        <div className="border border-border rounded-element bg-background overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 flex-wrap">
            <div className="font-semibold text-sm">Ingest Sources</div>
            <Badge variant="outline" className="text-2xs px-1.5 py-0">
              {counts.all} total · {(counts.healthy)} healthy
            </Badge>

            <div className="relative flex-1 max-w-xs ml-2">
              <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, slug, or target..."
                className="h-7 pl-6 text-xs"
              />
            </div>

            <div className="flex gap-1 flex-wrap">
              {(['all', 'healthy', 'stale', 'failing', 'disabled', 'never'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-2xs px-2 py-0.5 rounded border transition-colors ${
                    filter === f
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-accent'
                  }`}
                >
                  {f}{counts[f] > 0 && <span className="ml-1 opacity-70">{counts[f]}</span>}
                </button>
              ))}
            </div>

            {filter !== 'all' && filtered.length > 1 && (
              <div className="ml-auto flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => bulkToggle.mutate({ ids: filtered.map(s => s.id), enabled: true })}
                  disabled={bulkToggle.isPending}
                >
                  Enable all ({filtered.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    if (window.confirm(`Disable ${filtered.length} sources?`)) {
                      bulkToggle.mutate({ ids: filtered.map(s => s.id), enabled: false });
                    }
                  }}
                  disabled={bulkToggle.isPending}
                >
                  Disable all
                </Button>
              </div>
            )}
          </div>

          <div className="max-h-[600px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0 z-10">
                <tr className="border-b border-border">
                  {['Source', 'Target', 'Health', 'Last success', 'Last run', 'Runs / Items', 'Schedule', ''].map((h, i) => (
                    <th key={i} className="text-left px-3 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground text-xs">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground text-xs">
                    {counts.all === 0 ? 'No sources configured' : 'No sources match filters'}
                  </td></tr>
                ) : filtered.map(s => {
                  const StIcon = s._status.icon;
                  return (
                    <tr key={s.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 align-top">
                        <div className="font-medium truncate max-w-[240px]" title={s.name}>{s.name}</div>
                        <div className="text-xs2 text-muted-foreground font-mono truncate max-w-[240px]">{s.slug}</div>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {s.target_table ? (
                          <Badge variant="outline" className="text-2xs px-1.5 py-0 font-mono">{s.target_table}</Badge>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className={`flex items-center gap-1.5 text-xs ${s._status.className}`}>
                          <StIcon className="h-3 w-3" />
                          {s._status.label}
                        </div>
                        {s.last_error && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="text-2xs text-destructive mt-1 truncate max-w-[280px] cursor-help">
                                {s.last_error}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs max-w-[400px] whitespace-pre-wrap">
                              {s.last_error}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top text-xs2 text-muted-foreground"
                          title={s.last_success_at ? new Date(s.last_success_at).toISOString() : ''}>
                        {s.last_success_at ? formatDistanceToNow(new Date(s.last_success_at), { addSuffix: true }) : '—'}
                      </td>
                      <td className="px-3 py-2.5 align-top text-xs2 text-muted-foreground"
                          title={s.last_run_at ? new Date(s.last_run_at).toISOString() : ''}>
                        {s.last_run_at ? formatDistanceToNow(new Date(s.last_run_at), { addSuffix: true }) : '—'}
                      </td>
                      <td className="px-3 py-2.5 align-top text-xs tabular-nums">
                        <span className="text-foreground">{s.total_runs}</span>
                        <span className="text-muted-foreground"> / </span>
                        <span className="text-muted-foreground">{s.total_items_fetched}</span>
                      </td>
                      <td className="px-3 py-2.5 align-top text-xs2 text-muted-foreground font-mono">
                        {s.schedule_cron ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <Button
                          size="sm"
                          variant={s.is_enabled ? 'outline' : 'default'}
                          className="h-7 text-xs"
                          onClick={() => toggle.mutate({ id: s.id, enabled: !s.is_enabled })}
                          disabled={toggle.isPending}
                        >
                          {s.is_enabled ? 'Disable' : 'Enable'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!isLoading && (
            <div className="px-3 py-1.5 border-t border-border text-xs2 text-muted-foreground">
              Showing {filtered.length} of {counts.all} sources
            </div>
          )}
        </div>

        <Suspense fallback={panelFallback}><WebScrapersPanel /></Suspense>
        <Suspense fallback={panelFallback}><IngestionSourcesManager /></Suspense>
        <Suspense fallback={panelFallback}><NewsSourcesManager /></Suspense>
        <Suspense fallback={panelFallback}><ApiKeysManager /></Suspense>
      </div>
    </TooltipProvider>
  );
}
