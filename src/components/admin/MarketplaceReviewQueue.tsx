import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useMarketplaceReviewQueue } from '@/hooks/useMarketplaceReviewQueue';
import { departmentLabel, departmentOf } from '@/lib/marketplaceTaxonomy';

function prettify(slug: string | null | undefined): string {
  return (slug ?? '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The marketplace tag engine safety gate. A re-categorisation that would LOWER a
 * product's content rating (e.g. a latex "Kleid" leaving fetish_wear for apparel)
 * is never applied until an admin approves here — wrong-SFW is the harmful
 * direction in a default-SFW shop.
 */
export function MarketplaceReviewQueue() {
  const { data: rows, isLoading, decide } = useMarketplaceReviewQueue();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id);
    try {
      await decide.mutateAsync({ id, action });
      toast.success(action === 'approve' ? 'Approved — re-categorised' : 'Rejected — category kept');
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
          Review queue — rating downgrades
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-13 text-muted-foreground">
          Proposed re-categorisations that would lower a product's content rating. Never applied until approved here.
        </p>
        {isLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
        {!isLoading && (!rows || rows.length === 0) && (
          <p className="text-13 text-muted-foreground">No items awaiting review.</p>
        )}
        {rows?.map((r) => {
          const l = r.marketplace_listings;
          const proposed = r.proposed_value?.subcategory ?? '';
          return (
            <div key={r.id} className="flex flex-col gap-2 rounded-element border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{l?.title ?? 'Unknown listing'}</span>
                  {r.model && <Badge variant="outline" className="font-normal">{r.model}</Badge>}
                  {r.confidence != null && (
                    <span className="text-13 text-muted-foreground tabular-nums">conf {Math.round(r.confidence * 100)}%</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r.id, 'reject')}>
                    <X size={14} className="mr-1" /> Keep current
                  </Button>
                  <Button size="sm" disabled={busy === r.id} onClick={() => act(r.id, 'approve')}>
                    <Check size={14} className="mr-1" /> Approve change
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-13">
                <Badge variant="secondary" className="font-normal">
                  {prettify(l?.subcategory_slug)} · {l?.content_rating ?? '?'}
                </Badge>
                <span className="text-muted-foreground">→</span>
                <Badge variant="outline" className="font-normal">
                  {proposed} ({departmentLabel(departmentOf(proposed.toLowerCase().replace(/[\s-]+/g, '_')))})
                </Badge>
              </div>

              {r.proposed_value?.rationale && (
                <p className="text-13 text-muted-foreground">{r.proposed_value.rationale}</p>
              )}

              {(r.citations ?? []).length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-element bg-muted/40 p-2">
                  <span className="text-13 font-medium">Citations</span>
                  {(r.citations ?? []).map((c, i) => (
                    <div key={i} className="text-13 text-muted-foreground">
                      {c.quote && <span>“{c.quote}”</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
