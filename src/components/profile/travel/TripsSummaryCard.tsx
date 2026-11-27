import { useState } from 'react';
import { ArrowRight, ChevronRight, Luggage } from '@/components/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useTrips } from '@/hooks/useTrips';

/** Next/recent trips strip on the profile Travel tab. Links into /trips. */
export function TripsSummaryCard() {
  const { data: trips = [] } = useTrips();
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const dated = trips.filter((t) => t.status !== 'archived');
  // Upcoming first (soonest on top), then the most recent past trips.
  const upcoming = dated
    .filter((t) => (t.start_date ?? '') >= today)
    .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''));
  const past = dated
    .filter((t) => !((t.start_date ?? '') >= today))
    .sort((a, b) =>
      (b.start_date ?? b.created_at ?? '').localeCompare(a.start_date ?? a.created_at ?? ''),
    );
  const visible = [...upcoming, ...past].slice(0, 3);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Luggage size={16} aria-hidden />
          Trips
        </CardTitle>
        <LocalizedLink
          to="/hub/plans"
          className="no-underline inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
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
            {visible.map((t) => {
              const d = t.start_date ? new Date(t.start_date) : null;
              const isPast = !((t.start_date ?? '') >= today);
              return (
                <li key={t.id}>
                  <LocalizedLink
                    to={`/trips/${t.id}`}
                    className="no-underline group flex items-center gap-4 rounded-element p-2 transition-colors hover:bg-muted"
                  >
                    <span
                      className={`flex size-12 shrink-0 flex-col items-center justify-center rounded-element leading-none ${
                        isPast ? 'bg-muted text-muted-foreground' : 'bg-foreground text-background'
                      }`}
                    >
                      {d ? (
                        <>
                          <span className="text-title font-bold">{d.getDate()}</span>
                          <span className="text-2xs uppercase tracking-wide">
                            {d.toLocaleDateString(undefined, { month: 'short' })}
                          </span>
                        </>
                      ) : (
                        <Luggage size={18} aria-hidden />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-15 font-bold">{t.title}</span>
                      <span className="truncate text-13 text-muted-foreground">
                        {[
                          t.primary_city_name,
                          d?.toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          }),
                          isPast && d ? 'Past' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <ChevronRight
                      size={16}
                      aria-hidden
                      className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    />
                  </LocalizedLink>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
