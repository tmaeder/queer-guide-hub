import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, Trash2, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { untypedFrom } from '@/integrations/supabase/untyped';

interface DlqRow {
  id: number;
  staging_id: string | null;
  source_slug: string | null;
  stage: string;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  status: string;
  next_retry_at: string;
  last_attempt_at: string | null;
  created_at: string;
}

interface SummaryRow {
  source_slug: string | null;
  stage: string;
  status: string;
  items: number;
  next_retry: string | null;
  last_attempt: string | null;
}

const cellStyle: React.CSSProperties = { padding: '8px 12px', fontSize: 13, verticalAlign: 'top' };
const statusColor: Record<string, [string, string]> = {
  pending:          ['#fef9c3', '#a16207'],
  retrying:         ['#dbeafe', '#1d4ed8'],
  permanent_failed: ['#fee2e2', '#b91c1c'],
  resolved:         ['#dcfce7', '#15803d'],
};

export default function DLQTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<'pending' | 'permanent_failed' | 'all'>('pending');

  const { data: summary = [] } = useQuery<SummaryRow[]>({
    queryKey: ['dlq-summary'],
    queryFn: async () => {
      const { data, error } = await untypedFrom('dlq_summary').select('*');
      if (error) {
        console.warn('dlq_summary view unavailable, falling back to empty:', error.message);
        return [];
      }
      return (data ?? []) as SummaryRow[];
    },
    refetchInterval: 15000,
  });

  const { data: rows = [], isLoading } = useQuery<DlqRow[]>({
    queryKey: ['dlq-rows', filter],
    queryFn: async () => {
      let q = supabase.from('ingestion_dlq').select('*').order('next_retry_at', { ascending: true }).limit(200);
      if (filter !== 'all') q = q.eq('status', filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DlqRow[];
    },
    refetchInterval: 15000,
  });

  const triggerConsumer = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('pipeline-dlq-consumer', { body: { limit: 50 } });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dlq-rows'] }),
    onError: (e: Error) => toast({ title: 'DLQ consumer failed', description: e.message, variant: 'destructive' }),
  });

  const retryNow = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('ingestion_dlq').update({
        status: 'pending', next_retry_at: new Date().toISOString(), locked_until: null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dlq-rows'] }),
    onError: (e: Error) => toast({ title: 'Retry failed', description: e.message, variant: 'destructive' }),
  });

  const resolveItem = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.rpc('dlq_resolve', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dlq-rows'] }),
    onError: (e: Error) => toast({ title: 'Resolve failed', description: e.message, variant: 'destructive' }),
  });

  const totals = summary.reduce(
    (acc, r) => {
      acc.total += r.items;
      if (r.status === 'pending')          acc.pending += r.items;
      if (r.status === 'permanent_failed') acc.failed  += r.items;
      return acc;
    }, { total: 0, pending: 0, failed: 0 },
  );

  const filterBtn = (key: typeof filter, label: string) => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      style={{
        padding: '6px 12px', fontSize: 12, fontWeight: filter === key ? 600 : 400,
        background: filter === key ? '#6366f1' : '#fff', color: filter === key ? '#fff' : '#374151',
        border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer',
      }}
    >{label}</button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertTriangle style={{ width: 16, height: 16, color: '#f59e0b' }} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>Dead Letter Queue</span>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>
          {totals.total} total · {totals.pending} pending · {totals.failed} permanent
        </span>
        <div style={{ flex: 1 }} />
        {filterBtn('pending', 'Pending')}
        {filterBtn('permanent_failed', 'Permanent fail')}
        {filterBtn('all', 'All')}
        <button
          disabled={triggerConsumer.isPending}
          onClick={() => triggerConsumer.mutate()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', fontSize: 12, fontWeight: 500,
            background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
          }}
        ><Play style={{ width: 14, height: 14 }} /> Run consumer now</button>
      </div>

      {/* Summary by source × stage */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', fontSize: 12, fontWeight: 600, color: '#374151' }}>
          By source × stage
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr>
              {['Source', 'Stage', 'Status', 'Items', 'Next retry'].map(h => (
                <th key={h} style={{ ...cellStyle, fontWeight: 500, color: '#6b7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>DLQ is empty</td></tr>
            ) : summary.map((r, i) => {
              const [bg, fg] = statusColor[r.status] ?? ['#f3f4f6', '#374151'];
              return (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={cellStyle}>{r.source_slug ?? '—'}</td>
                  <td style={cellStyle}>{r.stage}</td>
                  <td style={cellStyle}><span style={{ background: bg, color: fg, padding: '2px 8px', borderRadius: 999, fontSize: 11 }}>{r.status}</span></td>
                  <td style={cellStyle}>{r.items}</td>
                  <td style={{ ...cellStyle, color: '#6b7280', fontSize: 12 }}>{r.next_retry ? new Date(r.next_retry).toLocaleString() : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Item drilldown */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', overflow: 'hidden', maxHeight: 500, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
            <tr>
              {['Stage', 'Source', 'Error', 'Attempts', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ ...cellStyle, fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Nothing in queue</td></tr>
            ) : rows.map(r => {
              const [bg, fg] = statusColor[r.status] ?? ['#f3f4f6', '#374151'];
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={cellStyle}>{r.stage}</td>
                  <td style={cellStyle}>{r.source_slug ?? '—'}</td>
                  <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#b91c1c', maxWidth: 360, wordBreak: 'break-word' }}>
                    {r.error_code ? <strong>{r.error_code}: </strong> : null}
                    {r.error_message?.slice(0, 220) ?? '—'}
                  </td>
                  <td style={cellStyle}>{r.attempts}/{r.max_attempts}</td>
                  <td style={cellStyle}><span style={{ background: bg, color: fg, padding: '2px 8px', borderRadius: 999, fontSize: 11 }}>{r.status}</span></td>
                  <td style={cellStyle}>
                    <button onClick={() => retryNow.mutate(r.id)} title="Retry now"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6366f1', padding: 4 }}>
                      <RefreshCw style={{ width: 14, height: 14 }} />
                    </button>
                    <button onClick={() => resolveItem.mutate(r.id)} title="Mark resolved"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4 }}>
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
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
