import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X, ExternalLink, ShieldAlert, Lock, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { usePersonalityReviewQueue } from '@/hooks/usePersonalityReviewQueue';

const FIELD_LABEL: Record<string, string> = {
  lgbti_connection: 'LGBTQ+ connection',
  lgbti_details: 'LGBTQ+ details',
  verification_status: 'Verification status',
};

/**
 * The Personality Truth Engine human gate. Two surfaces:
 *  1. personality_review_queue — LLM-proposed identity fields with citations.
 *  2. Adult-cohort consent candidates — never auto-published; an admin confirms
 *     consent for each before it goes public.
 */
export function PersonalityReviewQueue() {
  const { queue, consent, decide, publishWithConsent } = usePersonalityReviewQueue();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id);
    try {
      await decide.mutateAsync({ id, action });
      toast.success(action === 'approve' ? 'Approved — value applied' : 'Rejected');
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const publish = async (id: string, name: string) => {
    if (!window.confirm(`Publish "${name}" publicly? This is an adult-cohort profile — confirm you have verified consent and that public listing is appropriate.`)) return;
    setBusy(id);
    try {
      await publishWithConsent.mutateAsync(id);
      toast.success('Published with consent');
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const rows = queue.data ?? [];
  const candidates = consent.data ?? [];

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-title">
            <ShieldAlert size={16} />
            Review queue — identity fields
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-13 text-muted-foreground">
            LGBTQ+ connection and details proposed by enrichment. Nothing here is applied until an admin approves.
          </p>
          {queue.isLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
          {!queue.isLoading && rows.length === 0 && <p className="text-13 text-muted-foreground">No items awaiting review.</p>}
          {rows.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-element border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.personalities?.name ?? 'Unknown'}</span>
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
              <div className="text-body">{String(r.proposed_value?.value ?? '')}</div>
              {r.proposed_value?.rationale && <p className="text-13 text-muted-foreground">{r.proposed_value.rationale}</p>}
              {(r.citations ?? []).length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-element bg-muted/40 p-3">
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-title">
            <Lock size={16} />
            Adult cohort — consent-gated publishing
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-13 text-muted-foreground">
            High-relevance adult-cohort profiles with a bio and image. These never auto-publish — confirm consent and
            appropriateness before listing each one publicly.
          </p>
          {consent.isLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
          {!consent.isLoading && candidates.length === 0 && <p className="text-13 text-muted-foreground">No candidates.</p>}
          {candidates.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-4 rounded-element border p-3">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{c.name}</span>
                <span className="text-13 text-muted-foreground">
                  {c.lgbti_connection_source ?? '—'}
                  {c.lgbti_relevance_score != null && ` · rel ${Math.round(c.lgbti_relevance_score * 100)}%`}
                </span>
              </div>
              <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => publish(c.id, c.name)}>
                <Globe size={14} className="mr-1" /> Publish with consent
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
