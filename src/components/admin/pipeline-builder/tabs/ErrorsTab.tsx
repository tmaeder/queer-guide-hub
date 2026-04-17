import { useState, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { AlertTriangle, AlertCircle, Info, Bug, Search, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface ErrorRow {
  id: number;
  function_name: string;
  severity: 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  context: Record<string, unknown> | null;
  pipeline_run_id: string | null;
  staging_id: string | null;
  stack: string | null;
  created_at: string;
}

interface SummaryRow {
  function_name: string;
  severity: string;
  last_1h: number;
  last_24h: number;
  last_7d: number;
  last_seen_at: string | null;
}

type Severity = 'fatal' | 'error' | 'warn' | 'info';

const sevConfig: Record<Severity, { icon: React.ComponentType<{ className?: string }>; className: string; badgeClass: string }> = {
  fatal: { icon: AlertCircle,    className: 'text-red-700 dark:text-red-300',    badgeClass: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900' },
  error: { icon: AlertTriangle,  className: 'text-orange-600 dark:text-orange-400', badgeClass: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200' },
  warn:  { icon: Bug,            className: 'text-yellow-600 dark:text-yellow-400', badgeClass: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-900' },
  info:  { icon: Info,           className: 'text-blue-600 dark:text-blue-400',   badgeClass: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900' },
};

export default function ErrorsTab() {
  const [selected, setSelected] = useState<ErrorRow | null>(null);
  const [minSeverity, setMinSeverity] = useState<'warn' | 'error' | 'fatal'>('error');
  const [search, setSearch] = useState('');

  const { data: summary = [] } = useQuery({
    queryKey: ['pipeline-error-summary'],
    queryFn: async () => {
      const { data, error } = await untypedFrom('pipeline_error_summary')
        .select('*')
        .order('last_seen_at', { ascending: false });
      if (error) throw error;
      return (data || []) as SummaryRow[];
    },
    refetchInterval: 30_000,
  });

  const { data: errors = [], isLoading } = useQuery({
    queryKey: ['pipeline-errors', minSeverity],
    queryFn: async () => {
      const sevs = minSeverity === 'fatal' ? ['fatal']
                 : minSeverity === 'error' ? ['error', 'fatal']
                 : ['warn', 'error', 'fatal'];
      const { data, error } = await untypedFrom('pipeline_errors')
        .select('*')
        .in('severity', sevs)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as ErrorRow[];
    },
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    if (!search) return errors;
    const q = search.toLowerCase();
    return errors.filter(e =>
      e.message.toLowerCase().includes(q)
      || e.function_name.toLowerCase().includes(q)
    );
  }, [errors, search]);

  return (
    <div className="flex flex-col gap-4">
      {/* Summary cards grouped by function */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Error rate by function (last 7 days)
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
          {summary.length === 0 ? (
            <div className="col-span-full border border-border rounded-md bg-background p-6 text-center text-sm">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 inline mr-1" />
              <span className="text-green-600 dark:text-green-400 font-medium">No errors in the last 7 days</span>
            </div>
          ) : summary.map(s => {
            const sc = sevConfig[s.severity as Severity] ?? sevConfig.info;
            const SIcon = sc.icon;
            return (
              <div key={`${s.function_name}-${s.severity}`} className="border border-border rounded-md bg-background px-3 py-2.5 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <SIcon className={`h-3.5 w-3.5 ${sc.className}`} />
                  <span className="text-[11px] font-mono truncate flex-1" title={s.function_name}>
                    {s.function_name}
                  </span>
                  <Badge variant="outline" className={`text-[9px] px-1 py-0 ${sc.badgeClass}`}>
                    {s.severity}
                  </Badge>
                </div>
                <div className="flex gap-3 text-xs tabular-nums">
                  <div><strong>{s.last_1h}</strong> <span className="text-muted-foreground">/ 1h</span></div>
                  <div><strong>{s.last_24h}</strong> <span className="text-muted-foreground">/ 24h</span></div>
                  <div><strong>{s.last_7d}</strong> <span className="text-muted-foreground">/ 7d</span></div>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  last: {s.last_seen_at ? formatDistanceToNow(new Date(s.last_seen_at), { addSuffix: true }) : '—'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter + recent error table */}
      <div className="border border-border rounded-md bg-background overflow-hidden">
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">Recent errors</span>

          <div className="relative flex-1 max-w-xs ml-2">
            <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages..."
              className="h-7 pl-6 text-xs"
            />
          </div>

          <div className="flex-1" />

          <div className="flex gap-1">
            {(['fatal', 'error', 'warn'] as const).map(s => (
              <button
                key={s}
                onClick={() => setMinSeverity(s)}
                className={`text-[11px] px-2.5 py-1 rounded border transition-colors ${
                  minSeverity === s
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:bg-accent'
                }`}
              >{s}+</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] min-h-[300px]">
          <div className="max-h-[480px] overflow-auto border-r border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0">
                <tr className="border-b border-border">
                  {['When', 'Function', 'Severity', 'Message'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground text-xs">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground text-xs">
                    {errors.length === 0 ? 'No errors' : 'No errors match search'}
                  </td></tr>
                ) : filtered.map(e => {
                  const sc = sevConfig[e.severity as Severity] ?? sevConfig.info;
                  return (
                    <tr
                      key={e.id}
                      onClick={() => setSelected(e)}
                      className={`border-b border-border/40 cursor-pointer transition-colors ${
                        selected?.id === e.id ? 'bg-primary/10' : 'hover:bg-muted/30'
                      }`}
                    >
                      <td className="px-3 py-2 text-muted-foreground text-[11px] whitespace-nowrap align-top"
                          title={new Date(e.created_at).toISOString()}>
                        {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] align-top truncate max-w-[160px]"
                          title={e.function_name}>
                        {e.function_name}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${sc.badgeClass}`}>
                          {e.severity}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 align-top max-w-[400px] truncate text-xs">
                        {e.message}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Detail pane */}
          <div className="p-4 max-h-[480px] overflow-y-auto">
            {!selected ? (
              <div className="text-muted-foreground text-center py-10 text-sm">
                Click a row to inspect
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Message</div>
                  <div className="text-sm break-words font-mono">{selected.message}</div>
                </div>
                {selected.context && (
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Context</div>
                    <pre className="text-[11px] bg-muted/40 p-2 rounded-md overflow-auto">
                      {JSON.stringify(selected.context, null, 2)}
                    </pre>
                  </div>
                )}
                {selected.stack && (
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Stack</div>
                    <pre className="text-[10px] bg-muted/40 p-2 rounded-md overflow-auto max-h-60 whitespace-pre-wrap">
                      {selected.stack}
                    </pre>
                  </div>
                )}
                {(selected.pipeline_run_id || selected.staging_id) && (
                  <div className="border-t border-border pt-2 space-y-1 text-[11px] text-muted-foreground">
                    {selected.pipeline_run_id && (
                      <div>
                        pipeline_run: <code className="bg-muted/60 px-1 rounded">{selected.pipeline_run_id}</code>
                      </div>
                    )}
                    {selected.staging_id && (
                      <div>
                        staging: <code className="bg-muted/60 px-1 rounded">{selected.staging_id}</code>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
