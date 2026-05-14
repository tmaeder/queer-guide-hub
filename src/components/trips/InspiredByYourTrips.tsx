import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useDiscoverableTrips } from '@/hooks/useDiscoverableTrips';
import { PublicTripCard } from '@/components/trips/PublicTripCard';
import { Button } from '@/components/ui/button';
import type { Trip } from '@/hooks/useTrips';

interface Props {
  ownTrips: Trip[];
}

/**
 * Bottom-of-page rail on `/trips` showing public trips that share a
 * destination with one of the user's own trips. Best-effort matching
 * via `primary_city_id` — falls back to "any public trip" if no overlap.
 * Hidden entirely if Discover returns nothing.
 */
export function InspiredByYourTrips({ ownTrips }: Props) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { data: publicTrips, isLoading } = useDiscoverableTrips();

  const matches = useMemo(() => {
    if (!publicTrips?.length) return [];
    const ownCityIds = new Set(
      ownTrips.map((t) => t.primary_city_id).filter((id): id is string => !!id),
    );
    const ownTripIds = new Set(ownTrips.map((t) => t.id));
    const sameCity = publicTrips.filter(
      (p) =>
        !ownTripIds.has(p.id) &&
        p.primary_city_id &&
        ownCityIds.has(p.primary_city_id),
    );
    if (sameCity.length >= 3) return sameCity.slice(0, 3);
    const fillers = publicTrips
      .filter((p) => !ownTripIds.has(p.id) && !sameCity.some((s) => s.id === p.id))
      .slice(0, 3 - sameCity.length);
    return [...sameCity, ...fillers].slice(0, 3);
  }, [publicTrips, ownTrips]);

  if (isLoading || matches.length === 0) return null;

  return (
    <section className="mt-12 pt-10 border-t border-border">
      <div className="flex items-end justify-between gap-3 mb-4">
        <div>
          <div className="inline-flex items-center gap-2 mb-1">
            <Sparkles style={{ width: 16, height: 16 }} />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('trips.inspired.eyebrow', 'Inspired by your trips')}
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">
            {t('trips.inspired.title', 'Public trips you might like')}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/trips/discover')}
        >
          {t('trips.inspired.cta', 'See all')}
          <ArrowRight style={{ width: 14, height: 14, marginLeft: 4 }} />
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {matches.map((trip) => (
          <PublicTripCard key={trip.id} trip={trip} />
        ))}
      </div>
    </section>
  );
}
