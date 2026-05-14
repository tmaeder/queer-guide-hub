import { MapPin, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Card, CardImage, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { DiscoverableTrip } from '@/hooks/useDiscoverableTrips';
import { resolveTripTitle } from '@/components/trips/tripTitle';

interface Props {
  trip: DiscoverableTrip;
}

/**
 * Compact card for the public discovery feed. Differs from `TripCard`
 * (which is owner-focused with menus + delete) by stripping all
 * mutation surfaces and surfacing what a stranger needs to decide
 * whether the trip is worth reading: cover, title, dates, owner,
 * cities visited, place count.
 */
export function PublicTripCard({ trip }: Props) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const title = resolveTripTitle(
    { title: trip.title, primary_city_name: trip.cities[0] ?? null },
    t,
  );

  const dateRange = (() => {
    if (!trip.start_date || !trip.end_date) return null;
    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
      return `${format(start, 'MMM d')}–${format(end, 'd, yyyy')}`;
    }
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  })();

  const onOpen = () => navigate(`/trips/${trip.id}`);

  return (
    <Card
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      className="cursor-pointer transition-[transform,opacity] duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
    >
      {trip.cover_image_url && (
        <CardImage src={trip.cover_image_url} alt={title} height={160} />
      )}
      <CardContent>
        <h6 className="font-bold mb-0.5 truncate text-lg">{title}</h6>

        {trip.description && (
          <p
            className="text-muted-foreground mb-2 overflow-hidden"
            style={{
              fontSize: 13,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {trip.description}
          </p>
        )}

        <div className="flex flex-col gap-1 mt-2">
          {dateRange && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar size={12} />
              <span className="text-xs">{dateRange}</span>
            </div>
          )}
          {trip.cities.length > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin size={12} />
              <span className="text-xs truncate">
                {trip.cities.slice(0, 4).join(', ')}
                {trip.cities.length > 4 && ` +${trip.cities.length - 4}`}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
          <Avatar style={{ width: 22, height: 22 }}>
            <AvatarImage
              src={trip.owner?.avatar_url ?? undefined}
              alt={trip.owner?.display_name ?? ''}
            />
            <AvatarFallback style={{ fontSize: 11 }}>
              {(trip.owner?.display_name ?? '?').slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground flex-1 truncate">
            {trip.owner?.display_name ?? t('trips.discover.anonymous', 'A QG traveler')}
          </span>
          <span className="text-xs text-muted-foreground">
            {t('trips.discover.placeCount', {
              count: trip.place_count,
              defaultValue: '{{count}} places',
            })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
