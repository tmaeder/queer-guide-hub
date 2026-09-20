import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { untypedRpc } from '@/integrations/supabase/untyped';

interface RestorationCandidate {
  total_count: number;
  tag_id: string;
  slug: string;
  name: string;
  publication_role: 'article' | 'utility';
  entity_kind: string;
  category: string | null;
  description: string | null;
  previous_reason: string | null;
  usage: number;
  priority: number;
}

type RestorationDecision = 'article' | 'utility' | 'retire';

/** Reviews bulk-deprecation reversals one at a time; candidates stay non-public until decided. */
export function TagRestorationQueue() {
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [saving, setSaving] = useState(false);
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['tag-restoration-review-queue', offset],
    queryFn: async () => {
      const { data: rows, error: rpcError } = await untypedRpc<RestorationCandidate[]>(
        'tag_restoration_review_queue',
        { p_limit: 1, p_offset: offset },
      );
      if (rpcError) throw rpcError;
      return rows ?? [];
    },
  });
  const item = data[0] ?? null;
  const total = item?.total_count ?? 0;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draft = item ? (drafts[item.tag_id] ?? item.description ?? '') : '';

  const decide = async (decision: RestorationDecision) => {
    if (!item) return;
    setSaving(true);
    const { error: rpcError } = await untypedRpc('review_tag_restoration', {
      p_tag_id: item.tag_id,
      p_decision: decision,
      p_description: decision === 'article' ? draft : null,
    });
    setSaving(false);
    if (rpcError) {
      toast.error(rpcError.message);
      return;
    }
    toast.success(
      decision === 'article'
        ? `Approved “${item.name}” as an article`
        : decision === 'utility'
          ? `Kept “${item.name}” as utility vocabulary`
          : `Retired “${item.name}” after review`,
    );
    setDrafts((current) => {
      const next = { ...current };
      delete next[item.tag_id];
      return next;
    });
    // The reviewed row disappears from the queue, so keep the same offset unless
    // it was the last row. This prevents silently skipping the following item.
    if (offset >= total - 1) setOffset(Math.max(0, offset - 1));
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tag-restoration-review-queue'] }),
      queryClient.invalidateQueries({ queryKey: ['tag-editorial-queue'] }),
      queryClient.invalidateQueries({ queryKey: ['tag-quality-scorecard-v2'] }),
      queryClient.invalidateQueries({ queryKey: ['centralized-tags'] }),
    ]);
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-4 text-title">
          <span className="flex items-center gap-2">
            <History size={16} /> Deprecated-tag restoration
          </span>
          <Badge variant="outline">{total.toLocaleString()} awaiting review</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-13 text-muted-foreground">Loading restoration queue…</p>}
        {error && (
          <p className="text-13 text-destructive">Could not load restoration candidates.</p>
        )}
        {!isLoading && !error && !item && (
          <p className="text-13 text-muted-foreground">No bulk-deprecation decisions remain.</p>
        )}
        {item && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{item.name}</strong>
              <Badge variant="secondary">suggested {item.publication_role}</Badge>
              <Badge variant="outline">{item.entity_kind}</Badge>
              {item.category && <Badge variant="outline">{item.category}</Badge>}
              <span className="text-13 text-muted-foreground">{item.usage} uses</span>
            </div>
            <p className="rounded-element bg-muted/40 p-4 text-13 text-muted-foreground">
              Previously removed as: {item.previous_reason ?? 'no reason recorded'}. This entry is
              active for tagging but remains excluded from glossary pages and search until this
              review is saved.
            </p>
            <Textarea
              aria-label={`Canonical description for ${item.name}`}
              value={draft}
              onChange={(event) =>
                setDrafts((current) => ({ ...current, [item.tag_id]: event.target.value }))
              }
              rows={5}
              placeholder="Write a concise, sense-specific definition before approving an article…"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={saving || draft.trim().length < 30}
                onClick={() => decide('article')}
              >
                Approve article
              </Button>
              <Button variant="outline" disabled={saving} onClick={() => decide('utility')}>
                Keep as utility
              </Button>
              <Button variant="destructive" disabled={saving} onClick={() => decide('retire')}>
                Retire after review
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0 || saving}
                onClick={() => setOffset((value) => Math.max(0, value - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <span className="text-13 tabular-nums text-muted-foreground">
                {offset + 1} of {total}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + 1 >= total || saving}
                onClick={() => setOffset((value) => value + 1)}
              >
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
