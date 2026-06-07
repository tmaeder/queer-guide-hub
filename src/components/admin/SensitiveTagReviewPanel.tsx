import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert } from 'lucide-react';
import { useSensitiveTagReview } from '@/hooks/useSensitiveTagReview';

/**
 * Review queue for sensitive/adult tags held out of the search index by the SEO
 * sensitivity gate. An admin approves each (releasing it to index) or marks it
 * reviewed without indexing. Closes the outing/mislabel-risk loop.
 */
export function SensitiveTagReviewPanel() {
  const { data, isLoading, approve } = useSensitiveTagReview(50);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (isLoading || !data || data.length === 0) return null;

  const act = async (id: string, index: boolean) => {
    setBusyId(id);
    try {
      await approve.mutateAsync({ id, index });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <ShieldAlert size={16} style={{ color: 'hsl(var(--destructive))' }} />
          Sensitive tags awaiting review
        </CardTitle>
        <p className="text-13 text-muted-foreground">
          Held out of the search index until reviewed. Showing the {data.length} most-used.
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
                {t.is_adult && <Badge variant="outline" className="font-normal">adult</Badge>}
                {t.is_sensitive && !t.is_adult && (
                  <Badge variant="outline" className="font-normal">sensitive</Badge>
                )}
                {t.category && (
                  <span className="text-13 text-muted-foreground truncate">{t.category}</span>
                )}
                <span className="text-13 text-muted-foreground tabular-nums">· {t.usage_count ?? 0} used</span>
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
                onClick={() => act(t.id, false)}
              >
                Reviewed, keep hidden
              </Button>
              <Button size="sm" disabled={busyId === t.id} onClick={() => act(t.id, true)}>
                Approve &amp; index
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
