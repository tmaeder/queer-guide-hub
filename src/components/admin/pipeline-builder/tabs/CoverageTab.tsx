import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Map, RefreshCw, Hotel, Bed } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface CoverageRow {
  id: number;
  source_slug: string;
  city_id: string | null;
  accommodation_type: string | null;
  expected_count: number | null;
  actual_count: number;
  last_run_at: string | null;
  last_success_at: string | null;
  success_ratio: number | null;
  is_enabled: boolean;
}

interface HotelStats {
  source: string;
  accommodation_type: string;
  staged: number;
  validated: number;
  unique_items: number;
  duplicates: number;
  committed: number;
  rejected: number;
  pending_review: number;
  day: string;
}

const cellStyle: React.CSSProperties = { padding: '8px 12px', fontSize: 13, verticalAlign: 'top' };

export default function CoverageTab() {
  const qc = useQueryClient();

  const { data: coverage = [], isLoading: covLoading } = useQuery<CoverageRow[]>({
    queryKey: ['source-coverage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('source_coverage_targets')
        .select('*')
        .order('source_slug')
        .limit(500);
      if (error) throw error;
      return (data ?? []) as CoverageRow[];
    },
    refetchInterval: 60000,
  });

  const { data: hotelStats = [] } = useQuery<HotelStats[]>({
    queryKey: ['hotel-ingest-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hotel_ingest_stats').select('*');
      if (error) throw error;
      return (data ?? []) as HotelStats[];
    },
    refetchInterval: 60000,
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('refresh_source_coverage');
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['source-coverage'] }),
  });

  const bySource = useMemo(() => {
    const m = new Map<string, HotelStats>();
    for (const r of hotelStats) {
      const k = r.source;
      const prev = m.get(k);
      if (!prev) m.set(k, { ...r });
      else m.set(k, {
        ...prev,
        staged:        prev.staged + r.staged,
        validated:     prev.validated + r.validated,
        unique_items:  prev.unique_items + r.unique_items,
        duplicates:    prev.duplicates + r.duplicates,
        committed:     prev.committed + r.committed,
        rejected:      prev.rejected + r.rejected,
        pending_review: prev.pending_review + r.pending_review,
      });
    }
    return [...m.values()].sort((a, b) => b.committed - a.committed);
  }, [hotelStats]);

  const sloPill = (s: HotelStats) => {
    const total = s.staged || 1;
    const success = s.committed / total;
    const dupeRatio = s.duplicates / total;
    const colour =
      success >= 0.7 && dupeRatio < 0.5 ? ['#dcfce7', '#15803d']
      : success >= 0.4                  ? ['#fef9c3', '#a16207']
      : ['#fee2e2', '#b91c1c'];
    return (
      <span style={{ background: colour[0], color: colour[1], padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500 }}>
        {(success * 100).toFixed(0)}% commit
      </span>
    );
  };

  const ratioBar = (actual: number, expected: number | null) => {
    if (!expected || expected <= 0) return <span style={{ color: '#9ca3af' }}>—</span>;
    const pct = Math.min(1, actual / expected);
    const fg = pct >= 0.8 ? '#22c55e' : pct >= 0.4 ? '#f59e0b' : '#ef4444';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 80, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct * 100}%`, height: '100%', background: fg }} />
        </div>
        <span style={{ fontSize: 11, color: '#6b7280' }}>{actual}/{expected}</span>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Map style={{ width: 16, height: 16, color: '#6366f1' }} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>Source Coverage & SLOs</span>
        <div style={{ flex: 1 }} />
        <button
          disabled={refresh.isPending}
          onClick={() => refresh.mutate()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', fontSize: 12, fontWeight: 500,
            background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
          }}
        ><RefreshCw style={{ width: 14, height: 14 }} /> Recompute</button>
      </div>

      {/* Per-source rollup */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', fontSize: 12, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Hotel style={{ width: 14, height: 14 }} /> Hotels/B&Bs by source
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr>
              {['Source', 'Staged', 'Validated', 'Unique', 'Dupes', 'Committed', 'Rejected', 'Review', 'SLO'].map(h => (
                <th key={h} style={{ ...cellStyle, fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bySource.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No hotel/B&B ingestion yet</td></tr>
            ) : bySource.map(s => (
              <tr key={s.source} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={cellStyle}>{s.source}</td>
                <td style={cellStyle}>{s.staged}</td>
                <td style={cellStyle}>{s.validated}</td>
                <td style={cellStyle}>{s.unique_items}</td>
                <td style={cellStyle}>{s.duplicates}</td>
                <td style={cellStyle}>{s.committed}</td>
                <td style={cellStyle}>{s.rejected}</td>
                <td style={cellStyle}>{s.pending_review}</td>
                <td style={cellStyle}>{sloPill(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Coverage targets table */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', overflow: 'hidden', maxHeight: 500, overflowY: 'auto' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', fontSize: 12, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Bed style={{ width: 14, height: 14 }} /> Coverage targets ({coverage.length})
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
            <tr>
              {['Source', 'City', 'Type', 'Coverage', 'Last run', 'Enabled'].map(h => (
                <th key={h} style={{ ...cellStyle, fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {covLoading ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Loading…</td></tr>
            ) : coverage.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No targets configured</td></tr>
            ) : coverage.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={cellStyle}>{r.source_slug}</td>
                <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#6b7280' }}>{r.city_id?.slice(0, 8) ?? '—'}</td>
                <td style={cellStyle}>{r.accommodation_type ?? '—'}</td>
                <td style={cellStyle}>{ratioBar(r.actual_count, r.expected_count)}</td>
                <td style={{ ...cellStyle, color: '#6b7280', fontSize: 12 }}>{r.last_run_at ? new Date(r.last_run_at).toLocaleString() : '—'}</td>
                <td style={cellStyle}>{r.is_enabled ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
