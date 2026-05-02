import { formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  approveIngestionStaging,
  rejectIngestionStaging,
} from '@/hooks/usePipelineBuilderTabs';
import { GitMerge, MapPin, Check, X, Loader2 } from 'lucide-react';

// Geo review — surfaces city / country staging rows flagged as merge_candidate

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

  const { data: mergeCandidates = [], isLoading } = useQuery({
    queryKey: ['geo-merge-candidates'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await untypedFrom('ingestion_staging')
        .select('id, target_table, normalized_data, dedup_match_id, dedup_match_score, dedup_details, created_at')
        .in('target_table', ['cities', 'countries'])
        .eq('dedup_status', 'merge_candidate')
        .eq('review_status', 'pending_review')
        .order('created_at', { ascending: false })
        .limit(50);
      return (data ?? []) as unknown as StagingRow[];
    },
  });

  const approve = useMutation({
    mutationFn: (stagingId: string) => approveIngestionStaging(stagingId),
    onSuccess: () => {
      toast({ title: 'Approved', description: 'Will merge on next commit cycle' });
      queryClient.invalidateQueries({ queryKey: ['geo-merge-candidates'] });
    },
    onError: (e: Error) => toast({ title: 'Approve failed', description: e.message, variant: 'destructive' }),
  });

  const reject = useMutation({
    mutationFn: (stagingId: string) => rejectIngestionStaging(stagingId),
    onSuccess: () => {
      toast({ title: 'Rejected' });
      queryClient.invalidateQueries({ queryKey: ['geo-merge-candidates'] });
    },
    onError: (e: Error) => toast({ title: 'Reject failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="border border-border rounded-md bg-background overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Geo merge candidates</span>
          <Badge variant="outline" className="text-2xs px-1.5 py-0">
            {mergeCandidates.length}
          </Badge>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-muted-foreground text-xs">Loading…</div>
        ) : mergeCandidates.length === 0 ? (
          <div className="p-8 text-center">
            <MapPin className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No geo rows awaiting merge review</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {mergeCandidates.map((row) => {
              const n = (row.normalized_data ?? {}) as Record<string, unknown>;
              const loc = (n.location ?? {}) as Record<string, unknown>;
              const details = (row.dedup_details ?? {}) as Record<string, unknown>;
              const matchType = (details.match_type as string) ?? '—';
              const score = row.dedup_match_score;
              const scoreClass = score == null ? 'text-muted-foreground'
                : score >= 0.9 ? 'text-green-600 dark:text-green-400'
                : score >= 0.75 ? 'text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground';
              return (
                <div key={row.id} className="p-3 hover:bg-muted/30 transition-colors grid grid-cols-[1fr_80px_120px_auto] gap-3 items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant="outline" className="text-2xs px-1.5 py-0 font-mono">
                        {row.target_table}
                      </Badge>
                      <span className="font-medium truncate">
                        {String(n.name ?? '(unnamed)')}
                      </span>
                    </div>
                    <div className="text-xs2 text-muted-foreground">
                      {String(loc.country ?? loc.country_code ?? '')}
                      {loc.lat != null && loc.lng != null && (
                        <span> · <span className="font-mono">{Number(loc.lat).toFixed(2)}, {Number(loc.lng).toFixed(2)}</span></span>
                      )}
                    </div>
                    <div className="text-xs2 text-muted-foreground">
                      match → <span className="font-mono">{matchType}</span>
                      {row.dedup_match_id && (
                        <span> · <code className="bg-muted px-1 rounded text-2xs">{String(row.dedup_match_id).slice(0, 8)}</code></span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`font-mono text-sm font-semibold tabular-nums ${scoreClass}`}>
                      {score != null ? `${(score * 100).toFixed(0)}%` : '—'}
                    </span>
                    <div className="text-2xs text-muted-foreground">score</div>
                  </div>
                  <div className="text-xs2 text-muted-foreground"
                       title={new Date(row.created_at).toISOString()}>
                    {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                  </div>
                  <div className="flex gap-1.5 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={approve.isPending}
                      onClick={() => approve.mutate(row.id)}
                    >
                      {approve.isPending && approve.variables === row.id
                        ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        : <Check className="h-3 w-3 mr-1" />}
                      Merge
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                      disabled={reject.isPending}
                      onClick={() => reject.mutate(row.id)}
                    >
                      <X className="h-3 w-3 mr-1" />
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
