import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { listFromIn } from '@/hooks/usePageFetchers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { GitMerge, ChevronDown, ChevronUp } from 'lucide-react';

// Surfaces near-duplicate tags found by find_unified_tag_duplicates() (pg_trgm).
// Admin picks the canonical, merge_unified_tag() rewrites all referencing rows
// (venues/news_articles/personalities), marks duplicate as 'merged'.

interface DupRow {
  tag_a_id: string; tag_a_slug: string;
  tag_b_id: string; tag_b_slug: string;
  similarity: number;
}

interface TagMeta { id: string; slug: string; name: string; usage_count: number | null }

export function TagMergeCandidates() {
  const [open, setOpen] = useState(false);
  const [threshold, setThreshold] = useState(0.6);
  const queryClient = useQueryClient();

  const { data: dups, isLoading } = useQuery({
    queryKey: ['unified-tag-duplicates', threshold],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('find_unified_tag_duplicates', {
        p_threshold: threshold,
        p_limit: 100,
      });
      if (error) throw error;
      return (data ?? []) as DupRow[];
    },
  });

  // Pull usage_count for both sides so admins know which to keep
  const ids = (dups ?? []).flatMap(d => [d.tag_a_id, d.tag_b_id]);
  const { data: tagMeta } = useQuery({
    queryKey: ['unified-tags-meta', ids.sort().join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const data = await listFromIn<TagMeta>('unified_tags', 'id, slug, name, usage_count', 'id', ids);
      const map: Record<string, TagMeta> = {};
      for (const t of data) map[t.id] = t;
      return map;
    },
  });

  const merge = useMutation({
    mutationFn: async ({ canonicalId, duplicateId }: { canonicalId: string; duplicateId: string }) => {
      const { error } = await supabase.rpc('merge_unified_tag', {
        p_canonical_id: canonicalId,
        p_duplicate_id: duplicateId,
        p_actor: 'admin-ui',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Tag merged');
      queryClient.invalidateQueries({ queryKey: ['unified-tag-duplicates'] });
      queryClient.invalidateQueries({ queryKey: ['centralized-tags'] });
    },
    onError: (e: Error) => toast.error(`Merge failed: ${e.message}`),
  });

  return (
    <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 8, marginBottom: 16, background: 'hsl(var(--background))' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 12, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
      >
        <GitMerge style={{ width: 16, height: 16 }} />
        Tag merge candidates
        {dups && dups.length > 0 && (
          <Badge variant="outline" style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--foreground) / 0.7)', borderColor: 'hsl(var(--muted))' }}>
            {dups.length} pending
          </Badge>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'hsl(var(--muted-foreground))', fontWeight: 400 }}>
          {open && (
            <>
              <span>Threshold:</span>
              <input
                type="number" step="0.05" min="0.3" max="0.95" value={threshold}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setThreshold(Number(e.target.value))}
                style={{ width: 60, padding: '2px 6px', border: '1px solid hsl(var(--border))', borderRadius: 4, fontSize: 12 }}
              />
            </>
          )}
          {open ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
        </span>
      </button>

      {open && (
        <div style={{ padding: 12, borderTop: '1px solid hsl(var(--border))' }}>
          {isLoading && <div style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>Finding candidates…</div>}
          {!isLoading && (!dups || dups.length === 0) && (
            <div style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>No candidates above threshold {threshold}.</div>
          )}
          {!isLoading && dups && dups.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px 200px', gap: 8, fontSize: 13 }}>
              <div style={{ fontWeight: 600, fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>Tag A (usage)</div>
              <div style={{ fontWeight: 600, fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>Tag B (usage)</div>
              <div style={{ fontWeight: 600, fontSize: 11, color: 'hsl(var(--muted-foreground))', textAlign: 'right' }}>Sim</div>
              <div style={{ fontWeight: 600, fontSize: 11, color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>Action</div>
              {dups.map((d, i) => {
                const a = tagMeta?.[d.tag_a_id];
                const b = tagMeta?.[d.tag_b_id];
                const aUsage = a?.usage_count ?? 0;
                const bUsage = b?.usage_count ?? 0;
                const aWins = aUsage >= bUsage;
                return (
                  <div key={i} style={{ display: 'contents' }}>
                    <div>
                      <code style={{ background: aWins ? 'hsl(var(--muted))' : 'hsl(var(--muted))', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{d.tag_a_slug}</code>
                      <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11, marginLeft: 4 }}>{aUsage}</span>
                    </div>
                    <div>
                      <code style={{ background: !aWins ? 'hsl(var(--muted))' : 'hsl(var(--muted))', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{d.tag_b_slug}</code>
                      <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11, marginLeft: 4 }}>{bUsage}</span>
                    </div>
                    <div style={{ textAlign: 'right', color: 'hsl(var(--muted-foreground))', fontFamily: 'monospace', fontSize: 11 }}>
                      {(d.similarity * 100).toFixed(0)}%
                    </div>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <Button
                        size="sm" variant="outline"
                        disabled={merge.isPending}
                        onClick={() => merge.mutate({ canonicalId: d.tag_a_id, duplicateId: d.tag_b_id })}
                        title={`Keep ${d.tag_a_slug}, merge ${d.tag_b_slug} into it`}
                      >
                        ← keep A
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        disabled={merge.isPending}
                        onClick={() => merge.mutate({ canonicalId: d.tag_b_id, duplicateId: d.tag_a_id })}
                        title={`Keep ${d.tag_b_slug}, merge ${d.tag_a_slug} into it`}
                      >
                        keep B →
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TagMergeCandidates;
