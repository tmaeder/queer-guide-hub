import { ArrowRight, Luggage } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useTrips } from '@/hooks/useTrips';

/** Next/recent trips strip on the profile Travel tab. Links into /trips. */
export function TripsSummaryCard() {
  const { data: trips = [] } = useTrips();
  const visible = trips
    .filter((t) => t.status !== 'archived')
    .sort((a, b) => (b.start_date ?? b.created_at ?? '').localeCompare(a.start_date ?? a.created_at ?? ''))
    .slice(0, 3);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Luggage size={16} aria-hidden />
          Trips
        </CardTitle>
        <LocalizedLink
          to="/me/trips"
          className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
        >
          All trips
          <ArrowRight size={14} aria-hidden />
        </LocalizedLink>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trips yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((t) => (
              <li key={t.id}>
                <LocalizedLink
                  to={`/trips/${t.id}`}
                  className="flex items-baseline justify-between gap-4 rounded-element px-2 py-1.5 hover:bg-muted/30 transition-colors"
                >
                  <span className="text-sm font-medium truncate">{t.title}</span>
                  <span className="text-13 text-muted-foreground shrink-0">
                    {t.primary_city_name ?? t.status}
                    {t.start_date && ` · ${new Date(t.start_date).toLocaleDateString()}`}
                  </span>
                </LocalizedLink>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
