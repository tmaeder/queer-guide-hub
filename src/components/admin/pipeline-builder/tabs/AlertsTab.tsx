import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCircle, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Alert {
  id: number;
  alert_kind: string;
  severity: 'info' | 'warn' | 'error';
  source_slug: string | null;
  detail: Record<string, unknown>;
  fingerprint: string;
  acked_at: string | null;
  created_at: string;
}

const cellStyle: React.CSSProperties = { padding: '8px 12px', fontSize: 13, verticalAlign: 'top' };
const sevColor: Record<string, [string, string]> = {
  info:  ['#dbeafe', '#1d4ed8'],
  warn:  ['#fef9c3', '#a16207'],
  error: ['#fee2e2', '#b91c1c'],
};

const KIND_LABEL: Record<string, string> = {
  coverage_gap:          'Coverage gap',
  dedup_precision_drift: 'Dedup precision drift',
  dlq_backlog:           'DLQ backlog',
};

export default function AlertsTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const { data: alerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: ['data-ops-alerts', filter],
    queryFn: async () => {
      let q = supabase.from('data_ops_alerts').select('*').order('created_at', { ascending: false }).limit(200);
      if (filter === 'open') q = q.is('acked_at', null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Alert[];
    },
    refetchInterval: 30000,
  });

  const ack = useMutation({
    mutationFn: async (id: number) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from('data_ops_alerts').update({
        acked_at: new Date().toISOString(),
        acked_by: u.user?.id ?? null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['data-ops-alerts'] }),
  });

  const generateNow = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('generate_data_ops_alerts');
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['data-ops-alerts'] }),
  });

  const counts = {
    open:  alerts.filter(a => !a.acked_at).length,
    error: alerts.filter(a => !a.acked_at && a.severity === 'error').length,
    warn:  alerts.filter(a => !a.acked_at && a.severity === 'warn').length,
  };

  const filterBtn = (key: typeof filter, label: string, n?: number) => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      style={{
        padding: '6px 12px', fontSize: 12, fontWeight: filter === key ? 600 : 400,
        background: filter === key ? '#6366f1' : '#fff', color: filter === key ? '#fff' : '#374151',
        border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer',
      }}
    >{label}{n != null ? ` (${n})` : ''}</button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Bell style={{ width: 16, height: 16, color: '#f59e0b' }} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>Data Ops Alerts</span>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>
          {counts.open} open ({counts.error} error · {counts.warn} warn)
        </span>
        <div style={{ flex: 1 }} />
        {filterBtn('open', 'Open', counts.open)}
        {filterBtn('all',  'All')}
        <button
          disabled={generateNow.isPending}
          onClick={() => generateNow.mutate()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', fontSize: 12, fontWeight: 500,
            background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
          }}
        ><Play style={{ width: 14, height: 14 }} /> Re-scan</button>
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', overflow: 'hidden', maxHeight: 600, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
            <tr>
              {['Kind', 'Severity', 'Source', 'Detail', 'Created', 'Action'].map(h => (
                <th key={h} style={{ ...cellStyle, fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Loading…</td></tr>
            ) : alerts.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#22c55e' }}>All clear ✓</td></tr>
            ) : alerts.map(a => {
              const [bg, fg] = sevColor[a.severity] ?? ['#f3f4f6', '#374151'];
              return (
                <tr key={a.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: a.acked_at ? 0.55 : 1 }}>
                  <td style={cellStyle}>{KIND_LABEL[a.alert_kind] ?? a.alert_kind}</td>
                  <td style={cellStyle}><span style={{ background: bg, color: fg, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500 }}>{a.severity}</span></td>
                  <td style={cellStyle}>{a.source_slug ?? '—'}</td>
                  <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#374151', maxWidth: 380, wordBreak: 'break-word' }}>
                    {Object.entries(a.detail).map(([k, v]) =>
                      <span key={k} style={{ marginRight: 10 }}><b>{k}:</b> {String(v)}</span>
                    )}
                  </td>
                  <td style={{ ...cellStyle, color: '#6b7280', fontSize: 12 }}>{new Date(a.created_at).toLocaleString()}</td>
                  <td style={cellStyle}>
                    {a.acked_at
                      ? <span style={{ color: '#22c55e', fontSize: 11 }}>acked</span>
                      : (
                        <button onClick={() => ack.mutate(a.id)} title="Acknowledge"
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6366f1', padding: 4 }}>
                          <CheckCircle style={{ width: 14, height: 14 }} />
                        </button>
                      )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
