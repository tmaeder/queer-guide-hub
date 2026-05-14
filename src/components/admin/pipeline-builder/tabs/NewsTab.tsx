import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { Newspaper, AlertCircle, GitMerge } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// News pipeline observability — sources health, staging, dedup audit.

function StatBlock({ label, value, variant }: { label: string; value: number; variant?: 'success' | 'warning' | 'destructive' | 'default' }) {
  const colorClass =
    variant === 'success' ? 'text-green-600 dark:text-green-400' :
    variant === 'warning' ? 'text-amber-600 dark:text-amber-400' :
    variant === 'destructive' ? 'text-destructive' :
    'text-foreground';
  return (
    <div className="border border-border rounded-md bg-background p-3">
      <div className={`text-2xl font-bold tabular-nums ${colorClass}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs2 text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

export default function NewsTab() {
  const { data: sources = [] } = useQuery({
    queryKey: ['news-sources-health'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await untypedFrom('news_sources')
        .select('id, name, source_type, status, consecutive_failures, auto_paused, backoff_until, last_fetched_at, last_successful_fetch, reliability_score, avg_articles_per_fetch')
        .order('status', { ascending: false })
        .order('consecutive_failures', { ascending: false })
        .limit(100);
      return (data ?? []) as unknown as Array<Record<string, unknown>>;
    },
  });

  const { data: staging } = useQuery({
    queryKey: ['news-staging-stats'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const [pending, rejected, committed] = await Promise.all([
        untypedFrom('ingestion_staging').select('id', { count: 'exact', head: true }).eq('target_table', 'news_articles').eq('disposition', 'pending'),
        untypedFrom('ingestion_staging').select('id', { count: 'exact', head: true }).eq('target_table', 'news_articles').eq('disposition', 'rejected'),
        untypedFrom('ingestion_staging').select('id', { count: 'exact', head: true }).eq('target_table', 'news_articles').eq('disposition', 'committed'),
      ]);
      return {
        pending: pending.count ?? 0,
        rejected: rejected.count ?? 0,
        committed: committed.count ?? 0,
      };
    },
  });

  const { data: dedupAudit } = useQuery({
    queryKey: ['news-dedup-audit-recent'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await untypedFrom('news_dedup_audit')
        .select('match_strategy, match_decision')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(5000);
      const counts: Record<string, number> = {};
      for (const r of (data ?? []) as unknown as Array<{ match_strategy: string; match_decision: string }>) {
        const k = `${r.match_strategy}:${r.match_decision}`;
        counts[k] = (counts[k] || 0) + 1;
      }
      return counts;
    },
  });

  const paused  = sources.filter(s => s.auto_paused).length;
  const errored = sources.filter(s => s.status === 'error' && !s.auto_paused).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Staging stats */}
      <div className="border border-border rounded-md bg-background overflow-hidden">
        <div className="px-4 py-2 border-b border-border text-xs font-semibold text-muted-foreground flex items-center gap-2">
          <Newspaper className="h-3.5 w-3.5" />
          News staging (disposition)
        </div>
        <div className="grid grid-cols-3 gap-3 p-4">
          <StatBlock label="Pending" value={staging?.pending ?? 0} />
          <StatBlock label="Committed" value={staging?.committed ?? 0} variant="success" />
          <StatBlock label="Rejected" value={staging?.rejected ?? 0} variant={(staging?.rejected ?? 0) > 0 ? 'destructive' : 'default'} />
        </div>
      </div>

      {/* Dedup audit */}
      <div className="border border-border rounded-md bg-background overflow-hidden">
        <div className="px-4 py-2 border-b border-border text-xs font-semibold text-muted-foreground flex items-center gap-2">
          <GitMerge className="h-3.5 w-3.5" />
          Dedup decisions
          <Badge variant="outline" className="text-2xs px-1.5 py-0 ml-1">last 24h</Badge>
        </div>
        <div className="p-4">
          {dedupAudit && Object.keys(dedupAudit).length > 0 ? (
            <div className="grid grid-cols-[1fr_80px] gap-y-1.5 text-sm">
              {Object.entries(dedupAudit).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => {
                const [strategy, decision] = k.split(':');
                return (
                  <div key={k} className="contents">
                    <div className="text-muted-foreground">
                      <span className="font-mono text-xs">{strategy}</span>
                      <span className="text-muted-foreground mx-1">→</span>
                      <span>{decision}</span>
                    </div>
                    <div className="text-right font-mono font-semibold tabular-nums">{v}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-4">No dedup decisions in the last 24h</div>
          )}
        </div>
      </div>

      {/* Sources */}
      <div className="border border-border rounded-md bg-background overflow-hidden">
        <div className="px-4 py-2 border-b border-border text-xs font-semibold text-muted-foreground flex items-center gap-2 flex-wrap">
          <AlertCircle className="h-3.5 w-3.5" />
          News sources
          <Badge variant="outline" className="text-2xs px-1.5 py-0">{sources.length}</Badge>
          {paused > 0 && <Badge variant="outline" className="text-2xs px-1.5 py-0 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900">{paused} auto-paused</Badge>}
          {errored > 0 && <Badge variant="outline" className="text-2xs px-1.5 py-0 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-900">{errored} errored</Badge>}
        </div>
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 sticky top-0">
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider">Source</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider w-[100px]">Status</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider w-[80px]">Fails</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider w-[100px]">Reliability</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider w-[90px]">Avg/fetch</th>
              </tr>
            </thead>
            <tbody>
              {sources.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-xs">No news sources</td></tr>
              ) : sources.map(s => {
                const status = String(s.status ?? '-');
                const failures = Number(s.consecutive_failures ?? 0);
                const reliability = Number(s.reliability_score ?? 0);
                const avg = Number(s.avg_articles_per_fetch ?? 0);
                const statusColor =
                  status === 'active' ? 'text-green-600 dark:text-green-400'
                  : s.auto_paused || status === 'paused' ? 'text-destructive'
                  : 'text-yellow-600 dark:text-yellow-400';
                return (
                  <tr key={String(s.id)} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 truncate max-w-[280px]" title={String(s.name)}>
                      {String(s.name)}
                      {s.auto_paused ? <Badge variant="outline" className="ml-2 text-3xs px-1 py-0 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900">paused</Badge> : null}
                    </td>
                    <td className={`px-3 py-2 text-xs ${statusColor}`}>{status}</td>
                    <td className={`px-3 py-2 text-right font-mono tabular-nums ${failures > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {failures}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{reliability.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{avg.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
