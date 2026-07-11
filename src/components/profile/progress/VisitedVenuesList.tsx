import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useVisitedVenues } from '@/hooks/useVenuesV2Data';
import { SectionHeader } from '@/components/ui/SectionHeader';

/** Checked-in venues grouped by city. Moved from VenuesPassport. */
export function VisitedVenuesList() {
  const { t } = useTranslation();
  const { venues, loading } = useVisitedVenues();

  const groupedByCity = useMemo(() => {
    const map = new Map<string, typeof venues>();
    for (const v of venues) {
      const key = v.city ?? 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [venues]);

  return (
    <section aria-labelledby="visited-h">
      <SectionHeader size="section"
        id="visited-h"
        title={t('venues.passport.visited', {
          count: venues.length,
          defaultValue: '{{count}} venues visited',
        })}
        className="mb-4"
      />
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-container" />
          ))}
        </div>
      ) : venues.length === 0 ? (
        <p className="text-muted-foreground">
          {t('venues.passport.empty', 'No check-ins yet. Visit a venue to start your passport.')}
        </p>
      ) : (
        <div className="space-y-8">
          {groupedByCity.map(([city, list]) => (
            <div key={city}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {city} · {list.length}
              </h3>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {list.map((v) => (
                  <li key={v.id} className="border rounded-container overflow-hidden flex">
                    {v.images?.[0] && (
                      <div
                        className="w-20 h-20 shrink-0 bg-muted bg-cover bg-center"
                        style={{ backgroundImage: `url(${v.images[0]})` }}
                        aria-hidden
                      />
                    )}
                    <div className="p-4 min-w-0">
                      <LocalizedLink
                        to={`/venues/${v.slug ?? v.id}`}
                        className="text-sm font-semibold truncate block"
                      >
                        {v.name}
                      </LocalizedLink>
                      <p className="text-xs text-muted-foreground truncate">
                        {[v.city, v.country].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
