import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { GitMerge, MapPin } from 'lucide-react';

// Geo review — surfaces city / country staging rows flagged as merge_candidate
// so admins can decide target_merge_id.

interface StagingRow {
  id: string;
  target_table: string;
  normalized_data: Record<string, unknown> | null;
  dedup_match_id: string | null;
  dedup_match_score: number | null;
  dedup_details: Record<string, unknown> | null;
  created_at: string;
}

export default function GeoReviewTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: mergeCandidates, isLoading } = useQuery({
    queryKey: ['geo-merge-candidates'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const sb = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
      const { data } = await sb.from('ingestion_staging')
        .select('id, target_table, normalized_data, dedup_match_id, dedup_match_score, dedup_details, created_at')
        .in('target_table', ['cities', 'countries'])
        .eq('dedup_status', 'merge_candidate')
        .eq('review_status', 'pending_review')
        .order('created_at', { ascending: false })
        .limit(50);
      return (data ?? []) as StagingRow[];
    },
  });

  const approve = useMutation({
    mutationFn: async (stagingId: string) => {
      const { error } = await supabase.from('ingestion_staging')
        .update({ review_status: 'approved', disposition: 'pending', updated_at: new Date().toISOString() })
        .eq('id', stagingId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Approved — will merge on next commit cycle' });
      queryClient.invalidateQueries({ queryKey: ['geo-merge-candidates'] });
    },
    onError: (e: Error) => toast({ title: 'Approve failed', description: e.message, variant: 'destructive' }),
  });

  const reject = useMutation({
    mutationFn: async (stagingId: string) => {
      const { error } = await supabase.from('ingestion_staging')
        .update({ review_status: 'rejected', disposition: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', stagingId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Rejected' });
      queryClient.invalidateQueries({ queryKey: ['geo-merge-candidates'] });
    },
    onError: (e: Error) => toast({ title: 'Reject failed', description: e.message, variant: 'destructive' }),
  });

  const cardBorder: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', padding: 16 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={cardBorder}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <GitMerge style={{ width: 16, height: 16 }} />
          Geo merge candidates
          <Badge variant="outline" style={{ fontSize: 11 }}>{mergeCandidates?.length ?? 0}</Badge>
        </div>

        {isLoading && <div style={{ fontSize: 13, color: '#9ca3af' }}>Loading…</div>}

        {!isLoading && (mergeCandidates?.length ?? 0) === 0 && (
          <div style={{ fontSize: 13, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 6 }}>
            <MapPin style={{ width: 14, height: 14 }} />
            No geo rows awaiting merge review.
          </div>
        )}

        {(mergeCandidates?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mergeCandidates!.map((row) => {
              const n = (row.normalized_data ?? {}) as Record<string, unknown>;
              const loc = (n.location ?? {}) as Record<string, unknown>;
              const details = (row.dedup_details ?? {}) as Record<string, unknown>;
              const matchType = (details.match_type as string) ?? '-';
              return (
                <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 200px', gap: 8, fontSize: 13, padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>
                      {row.target_table} — {String(n.name ?? '(unnamed)')}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      {String(loc.country ?? loc.country_code ?? '')} {loc.lat != null && loc.lng != null ? `· ${Number(loc.lat).toFixed(2)}, ${Number(loc.lng).toFixed(2)}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>
                      match → {matchType} {row.dedup_match_id ? `· ${String(row.dedup_match_id).slice(0, 8)}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                    {row.dedup_match_score != null ? `${(row.dedup_match_score * 100).toFixed(0)}%` : '-'}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>
                    {new Date(row.created_at).toLocaleString()}
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Button size="sm" variant="outline" disabled={approve.isPending} onClick={() => approve.mutate(row.id)}>
                      Merge
                    </Button>
                    <Button size="sm" variant="ghost" disabled={reject.isPending} onClick={() => reject.mutate(row.id)}>
                      Reject
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
