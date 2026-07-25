import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { GitMerge, Undo2, Check, X, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';

// Governed merge-review cockpit for the P1 taxonomy engine. Replaces the retired
// TagMergeCandidates (which drove the lossy merge_unified_tag). Reads via the
// admin-gated tag_merge_queue()/tag_merge_recent() RPCs (RLS locked down on the
// base tables); writes via approve_tag_merge/reject_tag_merge/unmerge_tag_concept.

interface QueueRow {
  review_id: string;
  similarity: number;
  lexical_variant: boolean;
  created_at: string;
  canonical_id: string;
  canonical_name: string;
  canonical_slug: string;
  canonical_usage: number;
  canonical_category: string | null;
  duplicate_id: string;
  duplicate_name: string;
  duplicate_slug: string;
  duplicate_usage: number;
  duplicate_category: string | null;
}

interface RecentRow {
  audit_id: string;
  canonical_slug: string;
  duplicate_slug: string;
  actor: string;
  source: string;
  created_at: string;
}

export function TagMergeReviewQueue() {
  const [queueOpen, setQueueOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [keepDistinct, setKeepDistinct] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();

  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ['tag-merge-queue'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('tag_merge_queue', { p_limit: 200 });
      if (error) throw error;
      return (data ?? []) as QueueRow[];
    },
  });

  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: ['tag-merge-recent'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('tag_merge_recent', { p_limit: 20 });
      if (error) throw error;
      return (data ?? []) as RecentRow[];
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['tag-merge-queue'] });
    queryClient.invalidateQueries({ queryKey: ['tag-merge-recent'] });
  };

  const approve = useMutation({
    mutationFn: async (row: QueueRow) => {
      const { error } = await supabase.rpc('approve_tag_merge', { p_review_id: row.review_id });
      if (error) throw error;
    },
    onSuccess: (_data, row) => {
      toast.success(`Merged ${row.duplicate_slug} → ${row.canonical_slug}`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async (row: QueueRow) => {
      const { error } = await supabase.rpc('reject_tag_merge', {
        p_review_id: row.review_id,
        p_add_exclusion: !!keepDistinct[row.review_id],
      });
      if (error) throw error;
    },
    onSuccess: (_data, row) => {
      toast.success(`Rejected ${row.duplicate_slug} / ${row.canonical_slug}`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unmerge = useMutation({
    mutationFn: async (row: RecentRow) => {
      const { error } = await supabase.rpc('unmerge_tag_concept', { p_audit_id: row.audit_id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Unmerged');
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendingCount = queue?.length ?? 0;

  return (
    <div className="mb-6 flex flex-col gap-4">
      <div className="rounded-element border border-border">
        <button
          type="button"
          onClick={() => setQueueOpen((v) => !v)}
          className="flex w-full items-center gap-2 p-4 text-left text-sm font-semibold"
        >
          <GitMerge size={16} />
          Merge review queue
          <Badge variant="soft">{pendingCount} pending</Badge>
          <span className="ml-auto text-muted-foreground">
            {queueOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>

        {queueOpen && (
          <div className="flex flex-col gap-2 border-t border-border p-4">
            {queueLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
            {!queueLoading && pendingCount === 0 && (
              <p className="text-13 text-muted-foreground">No pending merge proposals.</p>
            )}
            {!queueLoading &&
              (queue ?? []).map((row) => {
                const isApproving =
                  approve.isPending && approve.variables?.review_id === row.review_id;
                const isRejecting =
                  reject.isPending && reject.variables?.review_id === row.review_id;
                const rowBusy = isApproving || isRejecting;
                return (
                  <div
                    key={row.review_id}
                    className="flex flex-col gap-2 rounded-element border border-border bg-muted/40 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex flex-1 flex-wrap items-center gap-2 text-13">
                      <span className="font-semibold">{row.duplicate_name}</span>
                      <code className="rounded-badge bg-muted px-2 py-0.5 text-xs2">
                        {row.duplicate_slug}
                      </code>
                      <span className="text-muted-foreground">({row.duplicate_usage})</span>
                      <ArrowRight size={14} className="text-muted-foreground" />
                      <span className="font-semibold">{row.canonical_name}</span>
                      <code className="rounded-badge bg-muted px-2 py-0.5 text-xs2">
                        {row.canonical_slug}
                      </code>
                      <span className="text-muted-foreground">({row.canonical_usage})</span>
                      <Badge variant="outline">{(row.similarity * 100).toFixed(0)}%</Badge>
                      {row.lexical_variant && <Badge variant="soft">lexical variant</Badge>}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-4">
                      <label
                        htmlFor={`keep-distinct-${row.review_id}`}
                        className="flex items-center gap-2 text-13 text-muted-foreground"
                      >
                        <Checkbox
                          id={`keep-distinct-${row.review_id}`}
                          checked={!!keepDistinct[row.review_id]}
                          onCheckedChange={(checked) =>
                            setKeepDistinct((m) => ({ ...m, [row.review_id]: checked === true }))
                          }
                        />
                        Keep distinct permanently
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={rowBusy}
                        onClick={() => reject.mutate(row)}
                      >
                        <X size={14} />
                        Reject
                      </Button>
                      <Button size="sm" disabled={rowBusy} onClick={() => approve.mutate(row)}>
                        <Check size={14} />
                        Approve
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <div className="rounded-element border border-border">
        <button
          type="button"
          onClick={() => setRecentOpen((v) => !v)}
          className="flex w-full items-center gap-2 p-4 text-left text-sm font-semibold"
        >
          <Undo2 size={16} />
          Recently merged
          <span className="ml-auto text-muted-foreground">
            {recentOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>

        {recentOpen && (
          <div className="flex flex-col gap-2 border-t border-border p-4">
            {recentLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
            {!recentLoading && (recent ?? []).length === 0 && (
              <p className="text-13 text-muted-foreground">No recent merges.</p>
            )}
            {!recentLoading &&
              (recent ?? []).map((row) => {
                const isUndoing =
                  unmerge.isPending && unmerge.variables?.audit_id === row.audit_id;
                return (
                  <div
                    key={row.audit_id}
                    className="flex flex-col gap-2 rounded-element border border-border bg-muted/40 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex flex-1 flex-wrap items-center gap-2 text-13">
                      <code className="rounded-badge bg-muted px-2 py-0.5 text-xs2">
                        {row.duplicate_slug}
                      </code>
                      <ArrowRight size={14} className="text-muted-foreground" />
                      <code className="rounded-badge bg-muted px-2 py-0.5 text-xs2">
                        {row.canonical_slug}
                      </code>
                      <span className="text-muted-foreground">
                        {row.actor} · {row.source}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isUndoing}
                      onClick={() => unmerge.mutate(row)}
                    >
                      <Undo2 size={14} />
                      Undo
                    </Button>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

export default TagMergeReviewQueue;
