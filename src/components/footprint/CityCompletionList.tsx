import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';

export interface CityCompletionRow {
  city_id: string;
  city_name: string;
  city_slug: string | null;
  visited: number;
  total_venues: number;
}

export function CityCompletionList({ rows }: { rows: CityCompletionRow[] }) {
  const qualifying = rows.filter((r) => r.visited >= 3);
  if (qualifying.length === 0) return null;

  return (
    <div className="space-y-4" data-testid="footprint-city-completion">
      {qualifying.map((r) => {
        const pct = r.total_venues > 0 ? Math.min(100, Math.round((r.visited / r.total_venues) * 100)) : 0;
        const href = `/trips?cityId=${encodeURIComponent(r.city_id)}&cityName=${encodeURIComponent(
          r.city_name,
        )}`;
        return (
          <div key={r.city_id} className="border border-border p-3">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              {r.city_slug ? (
                <LocalizedLink to={`/places/${r.city_slug}`} className="font-medium">
                  {r.city_name}
                </LocalizedLink>
              ) : (
                <span className="font-medium">{r.city_name}</span>
              )}
              <span className="text-xs text-muted-foreground">
                {r.visited} of {r.total_venues} venues visited
              </span>
            </div>
            <div className="h-1 mt-2 bg-foreground/10 overflow-hidden">
              <div className="h-full bg-foreground" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-3">
              <Button asChild size="sm" variant="outline">
                <LocalizedLink to={href}>Plan a return</LocalizedLink>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
