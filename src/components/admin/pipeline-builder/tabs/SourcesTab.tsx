import { lazy, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { Power, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { brandColors } from '@/theme/muiTheme';

const WebScrapersPanel = lazy(() => import('@/components/admin/WebScrapersPanel').then(m => ({ default: m.WebScrapersPanel })));
const IngestionSourcesManager = lazy(() => import('@/components/admin/IngestionSourcesManager').then(m => ({ default: m.IngestionSourcesManager })));
const NewsSourcesManager = lazy(() => import('@/components/admin/NewsSourcesManager').then(m => ({ default: m.NewsSourcesManager })));
const ApiKeysManager = lazy(() => import('@/components/admin/ApiKeysManager').then(m => ({ default: m.ApiKeysManager })));

const panelFallback = <div style={{ padding: 24, color: '#9ca3af', fontSize: 13 }}>Loading…</div>;

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

export default function SourcesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: sources, isLoading } = useQuery({
    queryKey: ['scrape-sources'],
    queryFn: async () => {
      const { data, error } = await untypedFrom('scrape_sources')
        .select('*')
        .order('priority', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as ScrapeSource[];
    },
    refetchInterval: 30_000,
  });

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await untypedFrom('scrape_sources').update({ is_enabled: enabled }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scrape-sources'] }),
    onError: (e: Error) => toast({ title: 'Toggle failed', description: e.message, variant: 'destructive' }),
  });

  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: '#6b7280', fontSize: 12 };
  const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' };

  const statusFor = (s: ScrapeSource) => {
    if (!s.is_enabled) return { icon: Power, color: '#6b7280', label: 'disabled' };
    if (s.consecutive_failures >= 3) return { icon: AlertTriangle, color: '#b91c1c', label: `${s.consecutive_failures} failures` };
    if (!s.last_success_at) return { icon: Clock, color: '#6b7280', label: 'never run' };
    const hrs = (Date.now() - new Date(s.last_success_at).getTime()) / 3_600_000;
    if (hrs > 48) return { icon: AlertTriangle, color: '#f59e0b', label: `stale ${Math.round(hrs)}h` };
    return { icon: CheckCircle, color: '#15803d', label: 'healthy' };
  };

  const fmtTime = (iso: string | null) => iso ? new Date(iso).toLocaleString() : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Ingest Sources</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {sources?.length ?? 0} total · {sources?.filter(s => s.is_enabled).length ?? 0} enabled
          </div>
        </div>
        <div style={{ maxHeight: 600, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                <th style={th}>Source</th>
                <th style={th}>Target</th>
                <th style={th}>Health</th>
                <th style={th}>Last success</th>
                <th style={th}>Last run</th>
                <th style={th}>Runs / Items</th>
                <th style={th}>Schedule</th>
                <th style={th}>Kill switch</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Loading...</td></tr>
              ) : !sources?.length ? (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No sources configured</td></tr>
              ) : sources.map(s => {
                const st = statusFor(s);
                const StIcon = st.icon;
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.slug}</div>
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#f3f4f6', color: '#374151' }}>
                        {s.target_table ?? '—'}
                      </span>
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: st.color, fontSize: 12 }}>
                        <StIcon style={{ width: 13, height: 13 }} />
                        {st.label}
                      </div>
                      {s.last_error && (
                        <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 3, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.last_error}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, fontSize: 11, color: '#6b7280' }}>{fmtTime(s.last_success_at)}</td>
                    <td style={{ ...td, fontSize: 11, color: '#6b7280' }}>{fmtTime(s.last_run_at)}</td>
                    <td style={{ ...td, fontSize: 12, color: '#6b7280' }}>
                      {s.total_runs} / {s.total_items_fetched}
                    </td>
                    <td style={{ ...td, fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                      {s.schedule_cron ?? '—'}
                    </td>
                    <td style={td}>
                      <button
                        onClick={() => toggle.mutate({ id: s.id, enabled: !s.is_enabled })}
                        disabled={toggle.isPending}
                        style={{
                          padding: '4px 10px', fontSize: 12, fontWeight: 500,
                          border: 'none', borderRadius: 4, cursor: 'pointer',
                          background: s.is_enabled ? '#fee2e2' : brandColors.main,
                          color: s.is_enabled ? '#b91c1c' : '#fff',
                        }}
                      >
                        {s.is_enabled ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Suspense fallback={panelFallback}><WebScrapersPanel /></Suspense>
      <Suspense fallback={panelFallback}><IngestionSourcesManager /></Suspense>
      <Suspense fallback={panelFallback}><NewsSourcesManager /></Suspense>
      <Suspense fallback={panelFallback}><ApiKeysManager /></Suspense>
    </div>
  );
}
