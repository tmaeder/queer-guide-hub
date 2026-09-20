import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { untypedRpc } from '@/integrations/supabase/untyped';

interface EntityCandidate {
  tag_id: string;
  tag_slug: string;
  tag_name: string;
  entity_kind: string;
  usage: number;
  candidate_type: string;
  candidate_id: string;
  candidate_slug: string;
  evidence: Record<string, unknown>;
  priority: number;
}

/** Serial, review-gated resolution of exact-slug cross-type collisions. */
export function TagEntityAuditQueue() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['tag-entity-audit-queue'],
    queryFn: async () => {
      const { data: rows, error: rpcError } = await untypedRpc<EntityCandidate[]>(
        'tag_entity_audit_queue',
        { p_limit: 100 },
      );
      if (rpcError) throw rpcError;
      return rows ?? [];
    },
  });
  const item = data[0];

  const decide = async (sameEntity: boolean) => {
    if (!item) return;
    setSaving(true);
    const { error: rpcError } = await untypedRpc('review_tag_entity_candidate', {
      p_tag_id: item.tag_id,
      p_candidate_type: item.candidate_type,
      p_candidate_id: item.candidate_id,
      p_is_same_entity: sameEntity,
    });
    setSaving(false);
    if (rpcError) {
      toast.error(rpcError.message);
      return;
    }
    toast.success(
      sameEntity
        ? `Moved “${item.tag_name}” to its canonical ${item.candidate_type}`
        : `Recorded “${item.tag_name}” as a homonym`,
    );
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tag-entity-audit-queue'] }),
      queryClient.invalidateQueries({ queryKey: ['tag-quality-scorecard-v2'] }),
      queryClient.invalidateQueries({ queryKey: ['centralized-tags'] }),
    ]);
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-4 text-title">
          <span className="flex items-center gap-2">
            <ArrowRightLeft size={16} /> Tag/entity separation
          </span>
          <Badge variant="outline">{data.length.toLocaleString()} candidates shown</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading && <p className="text-13 text-muted-foreground">Checking entity collisions…</p>}
        {error && <p className="text-13 text-destructive">Could not load entity candidates.</p>}
        {!isLoading && !error && !item && (
          <p className="text-13 text-muted-foreground">No unreviewed exact-slug collisions.</p>
        )}
        {item && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <strong>{item.tag_name}</strong>
              <Badge variant="secondary">tag · {item.entity_kind}</Badge>
              <span aria-hidden="true">→</span>
              <Badge variant="outline">
                {item.candidate_type} · {item.candidate_slug}
              </Badge>
              <span className="text-13 text-muted-foreground">{item.usage} uses</span>
            </div>
            <p className="rounded-element bg-muted/40 p-4 text-13 text-muted-foreground">
              Matching slugs are not proof of identity. Confirm only when both records describe the
              same real-world entity; otherwise preserve the glossary sense as a homonym.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={saving} onClick={() => decide(true)}>
                Same entity — convert
              </Button>
              <Button variant="outline" disabled={saving} onClick={() => decide(false)}>
                Different meaning — keep tag
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
