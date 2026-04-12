import { useState } from 'react';
import {
  Play, CheckCircle, XCircle, BarChart3, Database,
} from 'lucide-react';
import { useUnifiedMonitor, type UnifiedRun } from '../hooks/useUnifiedMonitor';
import { useStagingStats } from '../hooks/usePipelineHistory';
import { brandColors } from '@/theme/muiTheme';

const statusBadgeStyle: Record<string, React.CSSProperties> = {
  running: { background: '#dbeafe', color: '#1d4ed8' },
  completed: { background: '#dcfce7', color: '#15803d' },
  failed: { background: '#fee2e2', color: '#b91c1c' },
  dead_letter: { background: '#fee2e2', color: '#b91c1c' },
  queued: { background: '#f3f4f6', color: '#374151' },
  cancelled: { background: '#fef9c3', color: '#a16207' },
};

export default function MonitorTab() {
  const { allRuns, stats, isLoading } = useUnifiedMonitor();
  const { data: stagingStats } = useStagingStats();
  const [selectedRun, setSelectedRun] = useState<UnifiedRun | null>(null);

  const totalStaging = stagingStats?.reduce((sum, s) => sum + s.count, 0) || 0;

  const cardStyle: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px', background: '#fff' };
  const iconRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
  const bigNum: React.CSSProperties = { fontSize: 22, fontWeight: 700 };
  const label: React.CSSProperties = { fontSize: 11, color: '#9ca3af', marginTop: 3 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <div style={cardStyle}>
          <div style={iconRow}><Play style={{ width: 15, height: 15, color: '#3b82f6' }} /><span style={bigNum}>{stats.running}</span></div>
          <p style={label}>Running</p>
        </div>
        <div style={cardStyle}>
          <div style={iconRow}><CheckCircle style={{ width: 15, height: 15, color: '#22c55e' }} /><span style={bigNum}>{stats.completed}</span></div>
          <p style={label}>Completed</p>
        </div>
        <div style={cardStyle}>
          <div style={iconRow}><XCircle style={{ width: 15, height: 15, color: '#ef4444' }} /><span style={bigNum}>{stats.failed}</span></div>
          <p style={label}>Failed</p>
        </div>
        <div style={cardStyle}>
          <div style={iconRow}><Database style={{ width: 15, height: 15, color: '#6366f1' }} /><span style={bigNum}>{totalStaging}</span></div>
          <p style={label}>Staging Items</p>
        </div>
        <div style={cardStyle}>
          <div style={iconRow}><BarChart3 style={{ width: 15, height: 15, color: '#f59e0b' }} /><span style={bigNum}>{stats.total}</span></div>
          <p style={label}>Total Runs</p>
        </div>
      </div>

      {/* Runs table + detail panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {/* Runs table */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', fontWeight: 600, fontSize: 14 }}>
            Recent Runs
          </div>
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {['Name', 'Type', 'Status', 'Items', 'Duration', 'Started'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: '#6b7280', fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Loading...</td></tr>
                ) : allRuns.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No runs yet</td></tr>
                ) : allRuns.map(run => (
                  <tr
                    key={run.id}
                    onClick={() => setSelectedRun(run)}
                    style={{ borderBottom: '1px solid #f9fafb', cursor: 'pointer', background: selectedRun?.id === run.id ? '#f3f4f6' : 'transparent' }}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{run.name}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: run.type === 'pipeline' ? '#fdf2f8' : '#e0f2fe', color: run.type === 'pipeline' ? brandColors.main : '#0369a1' }}>
                        {run.type}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, ...(statusBadgeStyle[run.status] || {}) }}>
                        {run.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {run.items_succeeded}/{run.items_processed}
                      {run.items_failed > 0 && <span style={{ color: '#ef4444', marginLeft: 4 }}>({run.items_failed})</span>}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>
                      {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : run.status === 'running' ? '...' : '-'}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>
                      {run.started_at ? new Date(run.started_at).toLocaleTimeString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail panel */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', fontWeight: 600, fontSize: 14 }}>
            {selectedRun ? 'Run Details' : 'Select a run'}
          </div>
          <div style={{ padding: 12, maxHeight: 460, overflowY: 'auto' }}>
            {selectedRun ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  <strong>{selectedRun.name}</strong> ({selectedRun.type})
                </div>
                {selectedRun.error_message && (
                  <div style={{ border: '1px solid #fecaca', borderRadius: 6, padding: 8, background: '#fef2f2', fontSize: 12, color: '#b91c1c' }}>
                    {selectedRun.error_message}
                  </div>
                )}
                {selectedRun.node_states && Object.entries(selectedRun.node_states as Record<string, Record<string, unknown>>).map(([nodeId, state]) => (
                  <div key={nodeId} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{nodeId}</span>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, ...(statusBadgeStyle[state.status as string] || {}) }}>
                        {state.status as string}
                      </span>
                    </div>
                    {(state.items_out as number) > 0 && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Items: {state.items_out as number}</div>}
                    {state.error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{state.error as string}</div>}
                  </div>
                ))}
                {selectedRun.output_result && (
                  <pre style={{ fontSize: 10, background: '#f9fafb', padding: 8, borderRadius: 6, overflow: 'auto', maxHeight: 200 }}>
                    {JSON.stringify(selectedRun.output_result, null, 2)}
                  </pre>
                )}
              </div>
            ) : (
              <p style={{ color: '#9ca3af', fontSize: 13 }}>Click a run to view details</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
