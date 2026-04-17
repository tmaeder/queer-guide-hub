import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Scraper-health tab: field coverage by source + orphan mapping counts.
 *
 * Reads the `scraper_ingest_coverage` view (% of entities with geo, phone,
 * website, images, tags, address, description per run) and the
 * `scraper_reconcile_orphans()` function (entity_map rows whose canonical
 * row has been deleted). Lets admins prune orphans in place.
 */

interface CoverageRow {
  source_name: string;
  entity_type: string;
  started_at: string;
  entities_parsed: number;
  pct_geo: number | null;
  pct_phone: number | null;
  pct_website: number | null;
  pct_images: number | null;
  pct_tags: number | null;
  pct_address: number | null;
  pct_description: number | null;
}

interface OrphanRow {
  entity_type: string;
  orphan_count: number;
}

interface QualityRow {
  entity_type: string;
  source_name: string;
  n: number;
  score_min: number;
  score_p25: number;
  score_p50: number;
  score_p75: number;
  score_max: number;
  score_avg: number;
}

const cell: React.CSSProperties = { padding: '6px 10px', fontSize: 12, verticalAlign: 'top' };
const head: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  color: '#6b7280',
  background: '#f9fafb',
  textAlign: 'left',
};

function pctCell(v: number | null) {
  if (v == null) return '—';
  const color = v >= 80 ? '#059669' : v >= 50 ? '#d97706' : '#dc2626';
  return <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>{v.toFixed(1)}%</span>;
}

export default function ScraperHealthTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: coverage = [], isLoading: covLoading } = useQuery<CoverageRow[]>({
    queryKey: ['scraper-coverage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scraper_ingest_coverage')
        .select('*')
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CoverageRow[];
    },
    refetchInterval: 120_000,
  });

  const { data: orphans = [] } = useQuery<OrphanRow[]>({
    queryKey: ['scraper-orphans'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('scraper_reconcile_orphans');
      if (error) throw error;
      return (data ?? []) as OrphanRow[];
    },
    refetchInterval: 5 * 60_000,
  });

  const { data: quality = [] } = useQuery<QualityRow[]>({
    queryKey: ['pipeline-quality-dist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_quality_distribution')
        .select('*')
        .limit(200);
      if (error) throw error;
      return (data ?? []) as QualityRow[];
    },
    refetchInterval: 5 * 60_000,
  });

  const prune = useMutation({
    mutationFn: async (entityType: string) => {
      const { data, error } = await supabase.rpc('scraper_prune_orphan_mappings', {
        p_entity_type: entityType,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n, entityType) => {
      toast({ title: `Pruned ${n} orphan ${entityType} mappings` });
      qc.invalidateQueries({ queryKey: ['scraper-orphans'] });
    },
    onError: (e: Error) =>
      toast({ title: 'Prune failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <div style={{ padding: 16 }}>
      {/* Orphans */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
          <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Orphan mappings
        </h2>
        {orphans.every((r) => r.orphan_count === 0) ? (
          <div style={{ color: '#059669', fontSize: 13 }}>No orphans — entity_map is clean.</div>
        ) : (
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={head}>Entity type</th>
                <th style={head}>Orphans</th>
                <th style={head}>Action</th>
              </tr>
            </thead>
            <tbody>
              {orphans.map((o) => (
                <tr key={o.entity_type} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={cell}>{o.entity_type}</td>
                  <td style={{ ...cell, color: o.orphan_count > 0 ? '#dc2626' : '#6b7280' }}>
                    {o.orphan_count}
                  </td>
                  <td style={cell}>
                    {o.orphan_count > 0 && (
                      <button
                        onClick={() => prune.mutate(o.entity_type)}
                        disabled={prune.isPending}
                        style={{ padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}
                      >
                        <Trash2 size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                        prune
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Field coverage */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
          <RefreshCw size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Field coverage per recent run
        </h2>
        {covLoading ? (
          <div style={{ color: '#9ca3af', fontSize: 13 }}>Loading…</div>
        ) : coverage.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: 13 }}>No completed runs yet.</div>
        ) : (
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={head}>Source</th>
                <th style={head}>Type</th>
                <th style={head}>Parsed</th>
                <th style={head}>Started</th>
                <th style={head}>Geo</th>
                <th style={head}>Phone</th>
                <th style={head}>Website</th>
                <th style={head}>Images</th>
                <th style={head}>Tags</th>
                <th style={head}>Address</th>
                <th style={head}>Desc</th>
              </tr>
            </thead>
            <tbody>
              {coverage.map((c, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={cell}>{c.source_name}</td>
                  <td style={cell}>{c.entity_type}</td>
                  <td style={cell}>{c.entities_parsed}</td>
                  <td style={cell}>{new Date(c.started_at).toLocaleString()}</td>
                  <td style={cell}>{pctCell(c.pct_geo)}</td>
                  <td style={cell}>{pctCell(c.pct_phone)}</td>
                  <td style={cell}>{pctCell(c.pct_website)}</td>
                  <td style={cell}>{pctCell(c.pct_images)}</td>
                  <td style={cell}>{pctCell(c.pct_tags)}</td>
                  <td style={cell}>{pctCell(c.pct_address)}</td>
                  <td style={cell}>{pctCell(c.pct_description)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Quality score distribution */}
      <section>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
          Quality score distribution (30-day, per source × type)
        </h2>
        {quality.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: 13 }}>No scored items yet.</div>
        ) : (
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={head}>Entity</th>
                <th style={head}>Source</th>
                <th style={head}>N</th>
                <th style={head}>min</th>
                <th style={head}>p25</th>
                <th style={head}>p50</th>
                <th style={head}>p75</th>
                <th style={head}>max</th>
                <th style={head}>avg</th>
              </tr>
            </thead>
            <tbody>
              {quality.map((q, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={cell}>{q.entity_type}</td>
                  <td style={cell}>{q.source_name}</td>
                  <td style={cell}>{q.n}</td>
                  <td style={cell}>{q.score_min}</td>
                  <td style={cell}>{q.score_p25}</td>
                  <td style={{ ...cell, fontWeight: 600 }}>{q.score_p50}</td>
                  <td style={cell}>{q.score_p75}</td>
                  <td style={cell}>{q.score_max}</td>
                  <td style={cell}>{q.score_avg.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
