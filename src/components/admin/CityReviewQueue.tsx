import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X, ExternalLink, Star, ShieldAlert, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useCityReviewQueue, isCriminalizingTier } from '@/hooks/useCityReviewQueue';

const FIELD_LABEL: Record<string, string> = {
  lgbt_friendly_rating: 'LGBTQ+ friendly rating',
  safety_notes: 'Safety notes',
  editorial_hook: 'Editorial hook',
};

const TIER_LABEL: Record<string, string> = { low: 'Low risk', moderate: 'Moderate', high: 'Criminalized', critical: 'Critical' };

function renderValue(field: string, value: unknown) {
  if (field === 'lgbt_friendly_rating') {
    const n = Number(value);
    return (
      <span className="inline-flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} size={14} className={i < n ? 'fill-foreground text-foreground' : 'text-muted-foreground'} />
        ))}
        <span className="ml-1 tabular-nums text-13 text-muted-foreground">{n}/5</span>
      </span>
    );
  }
  return <span className="text-body">{String(value ?? '')}</span>;
}

/**
 * The City Truth Engine safety gate. Open city_review_queue items
 * (lgbt_friendly_rating / safety_notes / editorial_hook proposed by the LLM)
 * with their citations. Nothing here is public until an admin approves.
 */
export function CityReviewQueue() {
  const { data: rows, isLoading, decide, batchApproveSafe } = useCityReviewQueue();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, action: 'approve' | 'reject', tier?: string) => {
    // Approving safety content for a criminalizing destination requires explicit confirmation.
    let confirm = false;
    if (action === 'approve' && isCriminalizingTier(tier)) {
      if (!window.confirm('This is a criminalizing destination. Publishing a safety note here is sensitive — confirm you have reviewed it for outing/safety risk?')) return;
      confirm = true;
    }
    setBusy(id);
    try {
      await decide.mutateAsync({ id, action, confirm });
      toast.success(action === 'approve' ? 'Approved — value published' : 'Rejected');
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const safeCount = (rows ?? []).filter((r) => r.field === 'safety_notes' && r.proposed_value?.risk_tier === 'low').length;

  const runBatch = async () => {
    try {
      const n = await batchApproveSafe.mutateAsync();
      toast.success(`Batch approved ${n} safe-tier safety note${n === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-title">
          <span className="flex items-center gap-2">
            <ShieldAlert size={16} />
            Review queue — safety-sensitive fields
          </span>
          {safeCount > 0 && (
            <Button size="sm" variant="outline" disabled={batchApproveSafe.isPending} onClick={runBatch}>
              <Check size={14} className="mr-1" /> Approve {safeCount} safe-tier
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-13 text-muted-foreground">
          Ratings and hooks are LLM-proposed; safety notes are composed from country legal status + city
          LGBTQ+ density. Low-risk destinations auto-publish — only criminalizing or moderate ones land here.
        </p>
        {isLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
        {!isLoading && (!rows || rows.length === 0) && (
          <p className="text-13 text-muted-foreground">No items awaiting review.</p>
        )}
        {rows?.map((r) => (
          <div key={r.id} className="flex flex-col gap-3 rounded-element border p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.cities?.name ?? 'Unknown city'}</span>
                <Badge variant="outline" className="font-normal">{FIELD_LABEL[r.field] ?? r.field}</Badge>
                {r.proposed_value?.risk_tier && (
                  <Badge variant={isCriminalizingTier(r.proposed_value.risk_tier) ? 'destructive' : 'secondary'} className="font-normal">
                    {isCriminalizingTier(r.proposed_value.risk_tier) && <Lock size={11} className="mr-1" />}
                    {TIER_LABEL[r.proposed_value.risk_tier] ?? r.proposed_value.risk_tier}
                  </Badge>
                )}
                {r.confidence != null && (
                  <span className="text-13 text-muted-foreground tabular-nums">conf {Math.round(r.confidence * 100)}%</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r.id, 'reject', r.proposed_value?.risk_tier)}>
                  <X size={14} className="mr-1" /> Reject
                </Button>
                <Button size="sm" disabled={busy === r.id} onClick={() => act(r.id, 'approve', r.proposed_value?.risk_tier)}>
                  <Check size={14} className="mr-1" /> Approve
                </Button>
              </div>
            </div>

            <div>{renderValue(r.field, r.proposed_value?.value)}</div>
            {r.proposed_value?.rationale && (
              <p className="text-13 text-muted-foreground">{r.proposed_value.rationale}</p>
            )}

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
  );
}
