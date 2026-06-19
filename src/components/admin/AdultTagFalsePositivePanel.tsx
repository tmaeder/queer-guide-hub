import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Flag } from 'lucide-react';
import { useAdultTagReview } from '@/hooks/useAdultTagReview';

/**
 * Review queue for is_adult tags the sensitivity backfill over-flagged. Civic/
 * generic names ("Freedom Of Speech", "Music", "Prison") float to the top, but
 * the kink vocabulary is euphemistic — so an operator confirms each. "Not adult"
 * clears the flag and restores SEO indexing (reversible); "Adult, keep hidden"
 * just records the verdict so it drops off the queue.
 */
export function AdultTagFalsePositivePanel() {
  const { data, isLoading, clear, keepFlagged } = useAdultTagReview(200);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (isLoading || !data || data.length === 0) return null;

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await fn();
    } finally {
      setBusyId(null);
    }
  };

  const civicCount = data.filter((t) => t.likely_false_positive).length;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <Flag size={16} />
          Adult flag review
        </CardTitle>
        <p className="text-13 text-muted-foreground">
          {data.length} tags flagged adult and held from the search index.{' '}
          {civicCount} have no obvious adult/kink signal (shown first) — confirm
          each before clearing. Clearing is reversible.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {data.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between gap-4 rounded-element border bg-muted/40 px-4 py-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{t.name}</span>
                {t.likely_false_positive && (
                  <Badge variant="secondary" className="font-normal">likely civic</Badge>
                )}
                {t.category && (
                  <span className="text-13 text-muted-foreground truncate">{t.category}</span>
                )}
                {t.sensitive_topics && t.sensitive_topics.length > 0 && (
                  <span className="text-13 text-muted-foreground truncate">
                    {t.sensitive_topics.join(', ')}
                  </span>
                )}
                <span className="text-13 text-muted-foreground tabular-nums">
                  · {t.usage_count ?? 0} used
                </span>
              </div>
              {t.description && (
                <p className="text-13 text-muted-foreground truncate">{t.description}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === t.id}
                onClick={() => run(t.id, () => keepFlagged.mutateAsync(t.id))}
              >
                Adult, keep hidden
              </Button>
              <Button
                size="sm"
                disabled={busyId === t.id}
                onClick={() =>
                  run(t.id, () => clear.mutateAsync({ id: t.id, reason: 'admin: not adult' }))
                }
              >
                Not adult
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
