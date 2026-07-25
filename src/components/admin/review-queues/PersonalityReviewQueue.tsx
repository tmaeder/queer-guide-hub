import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, Globe } from 'lucide-react';
import { toast } from 'sonner';
import {
  usePersonalityReviewQueue,
  type PersonalityReviewRow,
} from '@/hooks/usePersonalityReviewQueue';
import { EntityReviewQueue } from './EntityReviewQueue';

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

  const publish = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Publish "${name}" publicly? This is an adult-cohort profile — confirm you have verified consent and that public listing is appropriate.`,
      )
    )
      return;
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

  const candidates = consent.data ?? [];

  return (
    <>
      <EntityReviewQueue<PersonalityReviewRow>
        title="Review queue — identity fields"
        description="LGBTQ+ connection and details proposed by enrichment. Nothing here is applied until an admin approves."
        rows={queue.data}
        isLoading={queue.isLoading}
        entityName={(r) => r.personalities?.name ?? 'Unknown'}
        fieldLabel={(r) => FIELD_LABEL[r.field] ?? r.field}
        renderBody={(r) => <div className="text-body">{String(r.proposed_value?.value ?? '')}</div>}
        rationale={(r) => r.proposed_value?.rationale}
        decideSuccess={(action) => (action === 'approve' ? 'Approved — value applied' : 'Rejected')}
        onDecide={(r, action) => decide.mutateAsync({ id: r.id, action })}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-title">
            <Lock size={16} />
            Adult cohort — consent-gated publishing
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-13 text-muted-foreground">
            High-relevance adult-cohort profiles with a bio and image. These never auto-publish —
            confirm consent and appropriateness before listing each one publicly.
          </p>
          {consent.isLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
          {!consent.isLoading && candidates.length === 0 && (
            <p className="text-13 text-muted-foreground">No candidates.</p>
          )}
          {candidates.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 rounded-element border p-4"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{c.name}</span>
                <span className="text-13 text-muted-foreground">
                  {c.lgbti_connection_source ?? '—'}
                  {c.lgbti_relevance_score != null &&
                    ` · rel ${Math.round(c.lgbti_relevance_score * 100)}%`}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === c.id}
                onClick={() => publish(c.id, c.name)}
              >
                <Globe size={14} className="mr-1" /> Publish with consent
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
