import { ArrowRight, Heart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useAuth } from '@/hooks/useAuth';
import { useFavoriteCounts } from '@/hooks/useFavoriteCounts';

/** Saved-item counts per content type on the profile Travel tab. Links into /favorites. */
export function FavoritesSummaryCard() {
  const { user } = useAuth();
  const { data: counts = [] } = useFavoriteCounts(user?.id);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Heart size={16} aria-hidden />
          Saved
        </CardTitle>
        <LocalizedLink
          to="/hub/saved"
          className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
        >
          All saved
          <ArrowRight size={14} aria-hidden />
        </LocalizedLink>
      </CardHeader>
      <CardContent>
        {counts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing saved yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {counts.map(({ label, count }) => (
              <span
                key={label}
                className="rounded-badge border border-border bg-muted/30 px-2 py-0.5 text-13 tabular-nums"
              >
                {count} {label}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
