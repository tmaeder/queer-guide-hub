import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X, ExternalLink, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useVillageReviewQueue } from '@/hooks/useVillageReviewQueue';

const FIELD_LABEL: Record<string, string> = {
  history: 'History (queer rewrite)',
  description: 'Description',
  editorial_hook: 'Editorial hook',
  notable_landmarks: 'Notable landmarks',
};

function renderValue(field: string, value: unknown) {
  if (field === 'notable_landmarks' && Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((v, i) => (
          <Badge key={i} variant="secondary" className="font-normal">{String(v)}</Badge>
        ))}
      </div>
    );
  }
  return <p className="whitespace-pre-wrap text-body">{String(value ?? '')}</p>;
}

/**
 * The Village Truth Engine review gate. Open village_review_queue items — LLM
 * rewrites of history/description/editorial_hook and landmark proposals, each
 * grounded in the village's own Wikipedia page + the venues we list there.
 * Nothing here reaches a public village page until an admin approves.
 */
export function VillageReviewQueue() {
  const { data: rows, isLoading, decide } = useVillageReviewQueue();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id);
    try {
      await decide.mutateAsync({ id, action });
      toast.success(action === 'approve' ? 'Approved — value published' : 'Rejected');
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <ShieldAlert size={16} />
          Review queue — LLM content rewrites
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-13 text-muted-foreground">
          Every rewrite is grounded in the village's own sources and overwrites existing content, so it lands
          here for a human. Empty landmark lists may auto-fill at high confidence; nothing else publishes unreviewed.
        </p>
        {isLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
        {!isLoading && (!rows || rows.length === 0) && (
          <p className="text-13 text-muted-foreground">No items awaiting review.</p>
        )}
        {rows?.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 rounded-element border p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.queer_villages?.name ?? 'Unknown village'}</span>
                <Badge variant="outline" className="font-normal">{FIELD_LABEL[r.field] ?? r.field}</Badge>
                {r.confidence != null && (
                  <span className="text-13 text-muted-foreground tabular-nums">conf {Math.round(r.confidence * 100)}%</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r.id, 'reject')}>
                  <X size={14} className="mr-1" /> Reject
                </Button>
                <Button size="sm" disabled={busy === r.id} onClick={() => act(r.id, 'approve')}>
                  <Check size={14} className="mr-1" /> Approve
                </Button>
              </div>
            </div>

            <div>{renderValue(r.field, r.proposed_value?.value)}</div>

            {(r.citations ?? []).length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-element bg-muted/40 p-2">
                <span className="text-13 font-medium">Citations</span>
                {(r.citations ?? []).map((c, i) => (
                  <div key={i} className="text-13 text-muted-foreground">
                    {c.quote && <span>“{c.quote}” </span>}
                    {c.url && (
                      <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
                        source <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
