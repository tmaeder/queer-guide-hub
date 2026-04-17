import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Merge, Trash2, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Pending dedupe decisions review tab.
 *
 * Surfaces rows from scraper_dedupe_decisions where decision = 'pending'
 * so an admin can accept (merge), reject (skip), or defer. Pulls incoming
 * source identity + confidence so the reviewer has enough context to decide.
 */

interface DedupRow {
  id: string;
  entity_type: string;
  entity_a_id: string | null;
  entity_b_id: string | null;
  match_method: string;
  confidence: number;
  decision: string;
  incoming_source_name: string | null;
  incoming_source_id: string | null;
  created_at: string;
}

const cellStyle: React.CSSProperties = { padding: '8px 12px', fontSize: 13, verticalAlign: 'top' };

export default function DedupDecisionsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [entityFilter, setEntityFilter] = useState<string>('all');

  const { data: rows = [], isLoading } = useQuery<DedupRow[]>({
    queryKey: ['dedup-decisions', entityFilter],
    queryFn: async () => {
      let q = supabase
        .from('scraper_dedupe_decisions')
        .select('*')
        .eq('decision', 'pending')
        .order('confidence', { ascending: false })
        .limit(200);
      if (entityFilter !== 'all') q = q.eq('entity_type', entityFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DedupRow[];
    },
    refetchInterval: 60_000,
  });

  const resolve = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: 'merge' | 'skip' }) => {
      const { error } = await supabase
        .from('scraper_dedupe_decisions')
        .update({ decision })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dedup-decisions'] }),
    onError: (e: Error) =>
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const autoResolve = useMutation({
    mutationFn: async () => {
      // Auto-demote low-confidence stale decisions to 'skip' via the server-side
      // helper. Mirrors scraper's resolvePendingDedupeDecisions().
      const { data, error } = await supabase.rpc('scraper_resolve_pending', {
        p_older_than_days: 30,
        p_confidence_floor: 0.75,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast({ title: `Auto-resolved ${n} decisions` });
      qc.invalidateQueries({ queryKey: ['dedup-decisions'] });
    },
    onError: (e: Error) =>
      toast({ title: 'Auto-resolve failed', description: e.message, variant: 'destructive' }),
  });

  const counts = useMemo(() => {
    const by: Record<string, number> = { all: rows.length };
    for (const r of rows) by[r.entity_type] = (by[r.entity_type] ?? 0) + 1;
    return by;
  }, [rows]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Pending dedupe decisions</h2>
        <span style={{ color: '#9ca3af', fontSize: 13 }}>{counts.all} pending</span>
        <button
          onClick={() => autoResolve.mutate()}
          disabled={autoResolve.isPending}
          style={{
            marginLeft: 'auto',
            padding: '6px 12px',
            fontSize: 12,
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            cursor: 'pointer',
          }}
        >
          {autoResolve.isPending ? 'Running…' : 'Auto-resolve < 0.75 older than 30d'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['all', 'venue', 'event', 'place', 'stay'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setEntityFilter(t)}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              background: entityFilter === t ? '#111827' : 'transparent',
              color: entityFilter === t ? '#fff' : '#374151',
              border: '1px solid #d1d5db',
              cursor: 'pointer',
            }}
          >
            {t} {counts[t] ? `(${counts[t]})` : ''}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ color: '#9ca3af' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={16} /> No pending decisions — queue is clean.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
              <th style={cellStyle}>Type</th>
              <th style={cellStyle}>Method</th>
              <th style={cellStyle}>Confidence</th>
              <th style={cellStyle}>Canonical ID</th>
              <th style={cellStyle}>Incoming</th>
              <th style={cellStyle}>Created</th>
              <th style={cellStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={cellStyle}>{r.entity_type}</td>
                <td style={cellStyle}>{r.match_method}</td>
                <td style={cellStyle}>
                  <span
                    style={{
                      color: r.confidence >= 0.85 ? '#059669' : r.confidence >= 0.75 ? '#d97706' : '#6b7280',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {r.confidence.toFixed(3)}
                  </span>
                </td>
                <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: 11 }}>
                  {r.entity_a_id?.slice(0, 8) ?? '—'}
                </td>
                <td style={{ ...cellStyle, fontSize: 11 }}>
                  {r.incoming_source_name}/{r.incoming_source_id}
                </td>
                <td style={cellStyle}>{new Date(r.created_at).toLocaleString()}</td>
                <td style={cellStyle}>
                  <button
                    onClick={() => resolve.mutate({ id: r.id, decision: 'merge' })}
                    disabled={resolve.isPending}
                    style={{ marginRight: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}
                  >
                    <Merge size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    merge
                  </button>
                  <button
                    onClick={() => resolve.mutate({ id: r.id, decision: 'skip' })}
                    disabled={resolve.isPending}
                    style={{ padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}
                  >
                    <Trash2 size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    skip
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
