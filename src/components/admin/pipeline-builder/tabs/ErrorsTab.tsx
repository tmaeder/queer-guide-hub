import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { AlertTriangle, AlertCircle, Info, Bug } from 'lucide-react';

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

const sevColor: Record<string, { bg: string; fg: string; Icon: typeof AlertTriangle }> = {
  fatal: { bg: '#fee2e2', fg: '#b91c1c', Icon: AlertCircle },
  error: { bg: '#fed7aa', fg: '#c2410c', Icon: AlertTriangle },
  warn:  { bg: '#fef9c3', fg: '#a16207', Icon: Bug },
  info:  { bg: '#dbeafe', fg: '#1d4ed8', Icon: Info },
};

export default function ErrorsTab() {
  const [selected, setSelected] = useState<ErrorRow | null>(null);
  const [minSeverity, setMinSeverity] = useState<'warn' | 'error' | 'fatal'>('error');

  const { data: summary } = useQuery({
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

  const { data: errors, isLoading } = useQuery({
    queryKey: ['pipeline-errors', minSeverity],
    queryFn: async () => {
      const sevs = minSeverity === 'fatal' ? ['fatal']
                 : minSeverity === 'error' ? ['error','fatal']
                 : ['warn','error','fatal'];
      const { data, error } = await untypedFrom('pipeline_errors')
        .select('*')
        .in('severity', sevs)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as ErrorRow[];
    },
    refetchInterval: 30_000,
  });

  const cardStyle: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', background: '#fff' };
  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: '#6b7280', fontSize: 12 };
  const td: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'top', fontSize: 13 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary cards grouped by function */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {(summary || []).map(s => {
          const sc = sevColor[s.severity] ?? sevColor.info;
          const SIcon = sc.Icon;
          return (
            <div key={`${s.function_name}-${s.severity}`} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <SIcon style={{ width: 14, height: 14, color: sc.fg }} />
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#374151' }}>{s.function_name}</span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: sc.bg, color: sc.fg, marginLeft: 'auto' }}>
                  {s.severity}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                <div><strong>{s.last_1h}</strong> <span style={{ color: '#9ca3af' }}>/ 1h</span></div>
                <div><strong>{s.last_24h}</strong> <span style={{ color: '#9ca3af' }}>/ 24h</span></div>
                <div><strong>{s.last_7d}</strong> <span style={{ color: '#9ca3af' }}>/ 7d</span></div>
              </div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
                last: {s.last_seen_at ? new Date(s.last_seen_at).toLocaleString() : '—'}
              </div>
            </div>
          );
        })}
        {(!summary || summary.length === 0) && (
          <div style={{ ...cardStyle, gridColumn: '1 / -1', color: '#9ca3af', textAlign: 'center' }}>
            No errors in the last 7 days
          </div>
        )}
      </div>

      {/* Filter + recent error table */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Recent errors</span>
          <div style={{ flex: 1 }} />
          {(['fatal','error','warn'] as const).map(s => (
            <button
              key={s}
              onClick={() => setMinSeverity(s)}
              style={{
                padding: '4px 10px', fontSize: 12,
                background: minSeverity === s ? '#6366f1' : '#fff',
                color: minSeverity === s ? '#fff' : '#374151',
                border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer',
              }}
            >{s}+</button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', minHeight: 300 }}>
          <div style={{ maxHeight: 480, overflowY: 'auto', borderRight: '1px solid #f3f4f6' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#fafafa', position: 'sticky', top: 0 }}>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <th style={th}>When</th>
                  <th style={th}>Function</th>
                  <th style={th}>Severity</th>
                  <th style={th}>Message</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Loading...</td></tr>
                ) : !errors?.length ? (
                  <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No errors</td></tr>
                ) : errors.map(e => {
                  const sc = sevColor[e.severity] ?? sevColor.info;
                  return (
                    <tr
                      key={e.id}
                      onClick={() => setSelected(e)}
                      style={{ cursor: 'pointer', borderBottom: '1px solid #f9fafb', background: selected?.id === e.id ? '#f3f4f6' : 'transparent' }}
                    >
                      <td style={{ ...td, color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{e.function_name}</td>
                      <td style={td}>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: sc.bg, color: sc.fg }}>{e.severity}</span>
                      </td>
                      <td style={{ ...td, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.message}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 14, maxHeight: 480, overflowY: 'auto' }}>
            {!selected ? (
              <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40, fontSize: 13 }}>Click a row to inspect</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 }}>Message</div>
                  <div style={{ fontSize: 13, wordBreak: 'break-word' }}>{selected.message}</div>
                </div>
                {selected.context && (
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 }}>Context</div>
                    <pre style={{ fontSize: 11, background: '#f9fafb', padding: 8, borderRadius: 4, overflow: 'auto' }}>
{JSON.stringify(selected.context, null, 2)}
                    </pre>
                  </div>
                )}
                {selected.stack && (
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 }}>Stack</div>
                    <pre style={{ fontSize: 10, background: '#f9fafb', padding: 8, borderRadius: 4, overflow: 'auto', maxHeight: 240 }}>
{selected.stack}
                    </pre>
                  </div>
                )}
                {selected.pipeline_run_id && (
                  <div style={{ fontSize: 11, color: '#6b7280' }}>
                    pipeline_run: <code>{selected.pipeline_run_id}</code>
                  </div>
                )}
                {selected.staging_id && (
                  <div style={{ fontSize: 11, color: '#6b7280' }}>
                    staging: <code>{selected.staging_id}</code>
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
