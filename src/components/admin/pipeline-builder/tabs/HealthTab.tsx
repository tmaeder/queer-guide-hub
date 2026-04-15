import { Button } from '@/components/ui/button';
import { Shield, Zap } from 'lucide-react';
import { useCircuitBreakers, useStagingStats, usePipelineDefinitionsList } from '../hooks/usePipelineHistory';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router';
import { brandColors } from '@/theme/muiTheme';

const cbColors: Record<string, React.CSSProperties> = {
  closed: { background: '#dcfce7', color: '#15803d' },
  open: { background: '#fee2e2', color: '#b91c1c' },
  half_open: { background: '#fef9c3', color: '#a16207' },
};

const dispositionColors: Record<string, string> = {
  pending: '#9ca3af', committed: '#22c55e', rejected: '#ef4444', skipped: '#f59e0b',
};

export default function HealthTab() {
  const { data: circuitBreakers } = useCircuitBreakers();
  const { data: stagingStats } = useStagingStats();
  const { data: pipelineDefs } = usePipelineDefinitionsList();
  const navigate = useNavigate();

  // Workflow definitions
  const { data: workflowDefs } = useQuery({
    queryKey: ['workflow-definitions-list'],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from>; rpc: typeof supabase.rpc })
        .from('workflow_definitions')
        .select('id, name, display_name, edge_function, schedule, is_enabled, queue_name')
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Queue metrics
  const { data: queueMetrics } = useQuery({
    queryKey: ['queue-metrics'],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from>; rpc: typeof supabase.rpc }).rpc('pgmq_metrics_all');
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  const totalStaging = stagingStats?.reduce((sum, s) => sum + s.count, 0) || 0;
  const openCircuits = circuitBreakers?.filter(cb => cb.state === 'open').length || 0;

  // Geo health: counts of anomalies/duplicates/orphans in cities + countries.
  const { data: geoHealth } = useQuery({
    queryKey: ['geo-health'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const sb = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
      const [
        citiesNoCoords, citiesNoCountry, citiesDupes,
        countriesNoCode, countriesDupes,
        geoMergeCandidates,
      ] = await Promise.all([
        sb.from('cities').select('id', { count: 'exact', head: true }).is('latitude', null).is('duplicate_of_id', null),
        sb.from('cities').select('id', { count: 'exact', head: true }).is('country_id', null),
        sb.from('cities').select('id', { count: 'exact', head: true }).not('duplicate_of_id', 'is', null),
        sb.from('countries').select('id', { count: 'exact', head: true }).is('code', null).is('duplicate_of_id', null),
        sb.from('countries').select('id', { count: 'exact', head: true }).not('duplicate_of_id', 'is', null),
        sb.from('ingestion_staging').select('id', { count: 'exact', head: true })
          .in('target_table', ['cities','countries'])
          .eq('dedup_status', 'merge_candidate')
          .eq('review_status', 'pending_review'),
      ]);
      return {
        cities_no_coords:     citiesNoCoords.count ?? 0,
        cities_no_country:    citiesNoCountry.count ?? 0,
        cities_duplicates:    citiesDupes.count ?? 0,
        countries_no_code:    countriesNoCode.count ?? 0,
        countries_duplicates: countriesDupes.count ?? 0,
        geo_merge_candidates: geoMergeCandidates.count ?? 0,
      };
    },
  });

  const sectionTitle: React.CSSProperties = { fontWeight: 600, fontSize: 15, marginBottom: 12 };
  const cardBorder: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', padding: 16 };

  // Dead-letter cluster: top failure groups by stage + error class.
  // Surfaces commit/dedup/enrich failures from ingestion_events so admins can
  // see the most common failure mode at a glance.
  const { data: deadLetter } = useQuery({
    queryKey: ['ingestion-dead-letter'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const sb = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await sb.from('ingestion_events')
        .select('stage, new_status, payload')
        .in('new_status', ['rejected', 'failed', 'error'])
        .gte('created_at', since)
        .limit(2000);
      const groups: Record<string, { stage: string; errorClass: string; count: number; sample: string }> = {};
      for (const r of (data ?? []) as Array<{ stage: string; new_status: string; payload: Record<string, unknown> | null }>) {
        const errMsg = String((r.payload as Record<string, unknown>)?.error ?? (r.payload as Record<string, unknown>)?.crash ?? r.new_status);
        const errorClass = errMsg.split(':')[0].slice(0, 60);
        const k = `${r.stage}::${errorClass}`;
        if (!groups[k]) groups[k] = { stage: r.stage, errorClass, count: 0, sample: errMsg.slice(0, 200) };
        groups[k].count++;
      }
      return Object.values(groups).sort((a, b) => b.count - a.count).slice(0, 10);
    },
  });

  // Enrichment audit summary — partial/failed counts in the last 24h
  const { data: enrichSummary } = useQuery({
    queryKey: ['enrichment-audit-summary'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const sb = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await sb.from('enrichment_audit')
        .select('stage, status').gte('created_at', since).limit(5000);
      const counts: Record<string, { success: number; partial: number; failed: number }> = {};
      for (const r of (data ?? []) as Array<{ stage: string; status: string }>) {
        if (!counts[r.stage]) counts[r.stage] = { success: 0, partial: 0, failed: 0 };
        const k = r.status as 'success' | 'partial' | 'failed';
        if (k in counts[r.stage]) counts[r.stage][k]++;
      }
      return Object.entries(counts).map(([stage, c]) => ({ stage, ...c }));
    },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Dead-letter cluster */}
      <div style={cardBorder}>
        <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap style={{ width: 16, height: 16 }} />
          Dead-letter — top failure clusters (24h)
          {(deadLetter?.length ?? 0) === 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>(no failures)</span>}
        </div>
        {(deadLetter?.length ?? 0) > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px', gap: 6, fontSize: 12, marginTop: 8 }}>
            <div style={{ fontWeight: 600, color: '#6b7280' }}>Stage</div>
            <div style={{ fontWeight: 600, color: '#6b7280' }}>Error class</div>
            <div style={{ fontWeight: 600, color: '#6b7280', textAlign: 'right' }}>Count</div>
            {deadLetter?.map((g, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <div>{g.stage}</div>
                <div title={g.sample} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.errorClass}</div>
                <div style={{ textAlign: 'right', color: g.count > 10 ? brandColors.main : undefined, fontWeight: 600 }}>{g.count}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Enrichment audit summary */}
      {(enrichSummary?.length ?? 0) > 0 && (
        <div style={cardBorder}>
          <div style={sectionTitle}>Enrichment outcomes (24h)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px', gap: 6, fontSize: 12, marginTop: 8 }}>
            <div style={{ fontWeight: 600, color: '#6b7280' }}>Stage</div>
            <div style={{ fontWeight: 600, color: '#16a34a', textAlign: 'right' }}>Success</div>
            <div style={{ fontWeight: 600, color: '#a16207', textAlign: 'right' }}>Partial</div>
            <div style={{ fontWeight: 600, color: '#b91c1c', textAlign: 'right' }}>Failed</div>
            {enrichSummary?.map((s, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <div>{s.stage}</div>
                <div style={{ textAlign: 'right' }}>{s.success}</div>
                <div style={{ textAlign: 'right', color: s.partial > 0 ? '#a16207' : undefined }}>{s.partial}</div>
                <div style={{ textAlign: 'right', color: s.failed > 0 ? '#b91c1c' : undefined, fontWeight: s.failed > 0 ? 600 : undefined }}>{s.failed}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Circuit Breakers */}
      <div>
        <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield style={{ width: 16, height: 16 }} />
          API Circuit Breakers
          {openCircuits > 0 && <span style={{ fontSize: 12, color: '#ef4444' }}>({openCircuits} open)</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {circuitBreakers?.map(cb => (
            <div key={cb.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{cb.api_name}</span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, ...(cbColors[cb.state] || {}) }}>
                  {cb.state === 'half_open' ? 'HALF OPEN' : cb.state.toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 6, fontSize: 11, color: '#6b7280' }}>
                <div>Fails: <span style={{ color: cb.failure_count > 0 ? '#ef4444' : undefined, fontWeight: cb.failure_count > 0 ? 600 : undefined }}>{cb.failure_count}/{cb.threshold}</span></div>
                <div>OK: {cb.success_count}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Geo Health — cities + countries anomalies */}
      <div style={cardBorder}>
        <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
          Geo Health — Cities & Countries
          {(geoHealth?.geo_merge_candidates ?? 0) > 0 && (
            <span style={{ fontSize: 12, color: brandColors.main }}>
              ({geoHealth?.geo_merge_candidates} merge candidates pending)
            </span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
          {[
            { label: 'Cities · no coords',     value: geoHealth?.cities_no_coords,     warn: 0 },
            { label: 'Cities · no country',    value: geoHealth?.cities_no_country,    warn: 0 },
            { label: 'Cities · duplicates',    value: geoHealth?.cities_duplicates,    warn: 0 },
            { label: 'Countries · no ISO',     value: geoHealth?.countries_no_code,    warn: 0 },
            { label: 'Countries · duplicates', value: geoHealth?.countries_duplicates, warn: 0 },
            { label: 'Merge candidates',       value: geoHealth?.geo_merge_candidates, warn: 0 },
          ].map(({ label, value, warn }) => (
            <div key={label} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: (value ?? 0) > warn ? brandColors.main : '#22c55e' }}>
                {value ?? '–'}
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Queue Depths + Staging Stats side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Queue Depths */}
        <div style={cardBorder}>
          <div style={sectionTitle}>Queue Depths</div>
          {queueMetrics && queueMetrics.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(queueMetrics as Array<Record<string, unknown>>).map((q) => (
                <div key={q.queue_name as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <span style={{ fontSize: 13 }}>{q.queue_name as string}</span>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#6b7280' }}>
                    <span>Depth: <strong style={{ color: (q.queue_length as number) > 0 ? '#f59e0b' : '#22c55e' }}>{q.queue_length as number}</strong></span>
                    <span>Total: {q.total_messages as number}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#9ca3af', fontSize: 13 }}>No queue data</p>
          )}
        </div>

        {/* Staging Stats */}
        <div style={cardBorder}>
          <div style={sectionTitle}>Staging ({totalStaging} items)</div>
          {stagingStats && stagingStats.length > 0 ? (
            <>
              <div style={{ display: 'flex', gap: 2, height: 20, borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
                {stagingStats.map(s => (
                  <div key={s.status} style={{ background: dispositionColors[s.status] || '#d1d5db', width: `${(s.count / totalStaging) * 100}%` }} title={`${s.status}: ${s.count}`} />
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
                {stagingStats.map(s => (
                  <div key={s.status} style={{ textAlign: 'center', padding: 8, border: '1px solid #f3f4f6', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{s.count.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'capitalize' }}>{s.status}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ color: '#9ca3af', fontSize: 13 }}>No staging items</p>
          )}
        </div>
      </div>

      {/* Definitions */}
      <div style={cardBorder}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={sectionTitle}>All Definitions</div>
          <Button size="sm" onClick={() => navigate('/admin/pipelines')}>
            <Zap style={{ width: 14, height: 14, marginRight: 4 }} /> Open Builder
          </Button>
        </div>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                {['Name', 'Type', 'Schedule', 'Enabled'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: '#6b7280', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Pipeline definitions */}
              {pipelineDefs?.map((def: Record<string, unknown>) => (
                <tr key={def.id as string} style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>{(def.display_name || def.name) as string}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fdf2f8', color: brandColors.main }}>pipeline</span>
                  </td>
                  <td style={{ padding: '8px 12px', color: '#6b7280' }}>{(def.schedule as string) || 'Manual'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: def.is_enabled ? '#dcfce7' : '#f3f4f6', color: def.is_enabled ? '#15803d' : '#9ca3af' }}>
                      {def.is_enabled ? 'ON' : 'OFF'}
                    </span>
                  </td>
                </tr>
              ))}
              {/* Workflow definitions */}
              {workflowDefs?.map((def: Record<string, unknown>) => (
                <tr key={def.id as string} style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>{(def.display_name || def.name) as string}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#e0f2fe', color: '#0369a1' }}>workflow</span>
                  </td>
                  <td style={{ padding: '8px 12px', color: '#6b7280' }}>{(def.schedule as string) || 'Manual'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: def.is_enabled ? '#dcfce7' : '#f3f4f6', color: def.is_enabled ? '#15803d' : '#9ca3af' }}>
                      {def.is_enabled ? 'ON' : 'OFF'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
