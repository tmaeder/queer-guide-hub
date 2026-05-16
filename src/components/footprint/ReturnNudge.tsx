import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { FootprintReturnNudge } from '@/hooks/useFootprintStats';

export function ReturnNudge({ nudge }: { nudge: FootprintReturnNudge }) {
  if (nudge.new_venues <= 0) return null;
  const href = `/trips?cityId=${encodeURIComponent(nudge.city_id)}&cityName=${encodeURIComponent(
    nudge.city_name,
  )}`;
  return (
    <Card data-testid="footprint-return-nudge">
      <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-medium">{nudge.city_name}</div>
          <div className="text-sm text-muted-foreground">
            {nudge.new_venues} new {nudge.new_venues === 1 ? 'venue' : 'venues'} added since your last visit.
          </div>
        </div>
        <Button asChild size="sm" variant="outline">
          <LocalizedLink to={href}>Plan a return</LocalizedLink>
        </Button>
      </CardContent>
    </Card>
  );
}
