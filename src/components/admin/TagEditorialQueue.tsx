import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { toast } from 'sonner';

interface EditorialQueueItem {
  total_count: number;
  tag_id: string;
  slug: string;
  name: string;
  publication_role: 'article' | 'utility' | 'entity_redirect';
  category: string | null;
  description: string | null;
  short_description: string | null;
  long_description: string | null;
  usage: number;
  risk: 'high' | 'medium' | 'normal';
  issue_code: string;
  evidence: Record<string, unknown>;
  priority: number;
}

const PAGE_SIZE = 20;

const ISSUE_LABELS: Record<string, string> = {
  article_missing_description: 'Missing canonical summary',
  article_missing_primary_category: 'Missing primary category',
  article_unreviewed_prose: 'Prose needs review',
  high_risk_missing_source: 'High-risk entry needs a public source',
  article_ontology_unreviewed: 'Ontology decision needed',
  article_localisation_unreviewed: 'Localisation decision needed',
  utility_indexable: 'Utility tag is indexable',
  redirect_indexable: 'Entity redirect is indexable',
};

function ProseReviewEditor({ item }: { item: EditorialQueueItem }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(item.description ?? item.short_description ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await untypedRpc('review_tag_description', {
      p_tag_id: item.tag_id,
      p_description: draft,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Reviewed “${item.name}”`);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tag-editorial-queue'] }),
      queryClient.invalidateQueries({ queryKey: ['tag-quality-scorecard-v2'] }),
      queryClient.invalidateQueries({ queryKey: ['centralized-tags'] }),
    ]);
  };

  return (
    <>
      <Textarea
        aria-label={`Reviewed description for ${item.name}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={5}
        placeholder="Write a concise, sense-specific definition…"
      />
      {item.short_description && !item.description && (
        <p className="text-13 text-muted-foreground">
          The textarea contains the legacy short summary as a candidate. Review and rewrite it
          before publishing.
        </p>
      )}
      <Button onClick={save} disabled={saving || draft.trim().length < 30}>
        {saving ? 'Saving…' : 'Save reviewed entry'}
      </Button>
    </>
  );
}

function OntologyReviewEditor({ item }: { item: EditorialQueueItem }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const decide = async (decision: 'reviewed' | 'none_applicable') => {
    setSaving(true);
    const { error } = await untypedRpc('review_tag_ontology', {
      p_tag_id: item.tag_id,
      p_decision: decision,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Recorded ontology decision for “${item.name}”`);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tag-editorial-queue'] }),
      queryClient.invalidateQueries({ queryKey: ['tag-quality-scorecard-v2'] }),
    ]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={saving} onClick={() => decide('reviewed')}>
        Approved links reviewed
      </Button>
      <Button variant="outline" disabled={saving} onClick={() => decide('none_applicable')}>
        None applicable
      </Button>
    </div>
  );
}

/** A deliberately serial review surface: one editorial decision, one save. */
export function TagEditorialQueue() {
  const [current, setCurrent] = useState(0);
  const page = Math.floor(current / PAGE_SIZE);
  const selected = current % PAGE_SIZE;
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['tag-editorial-queue', page],
    queryFn: async () => {
      const { data: rows, error: rpcError } = await untypedRpc<EditorialQueueItem[]>(
        'tag_editorial_queue',
        { p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE, p_issue_code: null },
      );
      if (rpcError) throw rpcError;
      return rows ?? [];
    },
  });
  const item = data[selected] ?? null;
  const total = data[0]?.total_count ?? 0;
  const canReviewProse =
    item?.issue_code === 'article_missing_description' ||
    item?.issue_code === 'article_unreviewed_prose';

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-4 text-title">
          <span className="flex items-center gap-2">
            <AlertTriangle size={16} /> Editorial queue
          </span>
          <Badge variant="outline">{total.toLocaleString()} open</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-13 text-muted-foreground">Loading review queue…</p>}
        {error && <p className="text-13 text-destructive">Could not load the editorial queue.</p>}
        {!isLoading && !error && !item && (
          <p className="text-13 text-muted-foreground">No unresolved glossary issues.</p>
        )}
        {item && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{item.name}</strong>
              <Badge variant="outline">{item.publication_role}</Badge>
              <Badge variant={item.risk === 'high' ? 'destructive' : 'secondary'}>
                {item.risk} risk
              </Badge>
              <span className="text-13 text-muted-foreground">
                {ISSUE_LABELS[item.issue_code] ?? item.issue_code} · {item.usage} uses
              </span>
            </div>

            {canReviewProse ? (
              <ProseReviewEditor key={`${item.tag_id}:${item.issue_code}`} item={item} />
            ) : item.issue_code === 'article_ontology_unreviewed' ? (
              <OntologyReviewEditor key={`${item.tag_id}:${item.issue_code}`} item={item} />
            ) : (
              <p className="rounded-element bg-muted/40 p-4 text-13 text-muted-foreground">
                This item needs a taxonomy, source, ontology, or publication-role decision. Open the
                tag in the table below; it cannot be cleared by publishing prose.
              </p>
            )}

            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={current === 0}
                onClick={() => setCurrent((value) => Math.max(0, value - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <span className="text-13 tabular-nums text-muted-foreground">
                {current + 1} of {total}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={current + 1 >= total}
                onClick={() => setCurrent((value) => value + 1)}
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
