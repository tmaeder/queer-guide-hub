import { useTranslation } from 'react-i18next';
import { Calendar, MapPin } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useTrips } from '@/hooks/useTrips';
import { useAuth } from '@/hooks/useAuth';
import { resolveTripTitle } from '@/components/trips/tripTitle';

export function ResumeTripStrip() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: trips, isLoading } = useTrips();

  if (!user || isLoading) return null;

  const active = (trips ?? [])
    .filter((trip) => trip.status === 'planning' || trip.status === 'active')
    .slice(0, 6);

  if (active.length === 0) return null;

  return (
    <section className="border border-border bg-background p-4 mb-8 rounded">
      <h2 className="text-sm font-bold tracking-tight mb-3">
        {t('pages.travel.resume.title', 'Continue planning')}
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {active.map((trip) => {
          const title = resolveTripTitle(
            { title: trip.title, primary_city_name: trip.primary_city_name ?? null },
            t,
          );
          return (
            <LocalizedLink
              key={trip.id}
              to={`/trips/${trip.id}`}
              className="shrink-0 border border-border bg-background p-3 hover:bg-muted transition-colors"
              style={{ width: 240, textDecoration: 'none' }}
            >
              <div className="font-semibold text-sm truncate">{title}</div>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                {trip.start_date && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={12} />
                    {new Date(trip.start_date).toLocaleDateString()}
                  </span>
                )}
                {trip.primary_city_name && (
                  <span className="inline-flex items-center gap-1 truncate">
                    <MapPin size={12} />
                    {trip.primary_city_name}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {t('pages.travel.resume.placeCount', '{{count}} places', {
                  count: trip.place_count,
                })}
              </div>
            </LocalizedLink>
          );
        })}
      </div>
    </section>
  );
}
