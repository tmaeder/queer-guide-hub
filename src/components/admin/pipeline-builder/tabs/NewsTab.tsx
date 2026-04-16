import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { Newspaper, AlertCircle } from 'lucide-react';

// News pipeline observability — sources health, staging, dedup audit.
// Mirrors the hardened news-ingestion DAG.

export default function NewsTab() {
  const { data: sources } = useQuery({
    queryKey: ['news-sources-health'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await untypedFrom('news_sources')
        .select('id, name, source_type, status, consecutive_failures, auto_paused, backoff_until, last_fetched_at, last_successful_fetch, reliability_score, avg_articles_per_fetch')
        .order('status', { ascending: false })
        .order('consecutive_failures', { ascending: false })
        .limit(100);
      return (data ?? []) as Array<Record<string, unknown>>;
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
      for (const r of (data ?? []) as Array<{ match_strategy: string; match_decision: string }>) {
        const k = `${r.match_strategy}:${r.match_decision}`;
        counts[k] = (counts[k] || 0) + 1;
      }
      return counts;
    },
  });

  const cardBorder: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', padding: 16 };
  const sectionTitle: React.CSSProperties = { fontWeight: 600, fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 };

  const paused = (sources ?? []).filter(s => s.auto_paused).length;
  const errored = (sources ?? []).filter(s => s.status === 'error' && !s.auto_paused).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Staging stats */}
      <div style={cardBorder}>
        <div style={sectionTitle}><Newspaper style={{ width: 16, height: 16 }} /> News staging (disposition)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="Pending" value={staging?.pending ?? 0} />
          <Stat label="Committed" value={staging?.committed ?? 0} color="#16a34a" />
          <Stat label="Rejected" value={staging?.rejected ?? 0} color={staging?.rejected ? '#b91c1c' : undefined} />
        </div>
      </div>

      {/* Dedup audit */}
      <div style={cardBorder}>
        <div style={sectionTitle}>Dedup decisions (24h)</div>
        {dedupAudit && Object.keys(dedupAudit).length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 6, fontSize: 13 }}>
            {Object.entries(dedupAudit).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => {
              const [strategy, decision] = k.split(':');
              return (
                <div key={k} style={{ display: 'contents' }}>
                  <div>{strategy} → {decision}</div>
                  <div style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{v}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#9ca3af' }}>No dedup decisions in the last 24h.</div>
        )}
      </div>

      {/* Sources */}
      <div style={cardBorder}>
        <div style={sectionTitle}>
          <AlertCircle style={{ width: 16, height: 16 }} />
          News sources
          {paused > 0 && <span style={{ fontSize: 12, color: '#b91c1c', fontWeight: 400 }}>({paused} auto-paused)</span>}
          {errored > 0 && <span style={{ fontSize: 12, color: '#a16207', fontWeight: 400 }}>({errored} errored)</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 80px', gap: 6, fontSize: 12 }}>
          <div style={{ fontWeight: 600, color: '#6b7280' }}>Source</div>
          <div style={{ fontWeight: 600, color: '#6b7280' }}>Status</div>
          <div style={{ fontWeight: 600, color: '#6b7280', textAlign: 'right' }}>Fails</div>
          <div style={{ fontWeight: 600, color: '#6b7280', textAlign: 'right' }}>Reliability</div>
          <div style={{ fontWeight: 600, color: '#6b7280', textAlign: 'right' }}>Avg/fetch</div>
          {(sources ?? []).map((s) => (
            <div key={String(s.id)} style={{ display: 'contents' }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(s.name)}>
                {String(s.name)}
                {s.auto_paused && <span style={{ marginLeft: 6, color: '#b91c1c', fontSize: 10 }}>paused</span>}
              </div>
              <div style={{ color: s.status === 'active' ? '#16a34a' : s.status === 'paused' ? '#b91c1c' : '#a16207' }}>{String(s.status ?? '-')}</div>
              <div style={{ textAlign: 'right', color: (s.consecutive_failures as number) > 0 ? '#b91c1c' : '#6b7280', fontFamily: 'monospace' }}>{String(s.consecutive_failures ?? 0)}</div>
              <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>{((s.reliability_score as number | null) ?? 0).toFixed(2)}</div>
              <div style={{ textAlign: 'right', fontFamily: 'monospace', color: '#6b7280' }}>{((s.avg_articles_per_fetch as number | null) ?? 0).toFixed(1)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? '#111827' }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{label}</div>
    </div>
  );
}
