import { MapPin } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { UpcomingTrip } from '@/hooks/useUpcomingTrips';

function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return '✈';
  return String.fromCodePoint(
    ...code.toUpperCase().split('').map((c) => 0x1f1e0 + c.charCodeAt(0) - 65),
  );
}

interface TripRailCardProps {
  trip: UpcomingTrip;
  nudgeCount?: number;
}

export function TripRailCard({ trip, nudgeCount = 0 }: TripRailCardProps) {
  const navigate = useNavigate();
  const flag = countryFlag(trip.primary_country_code);
  const countdown =
    trip.daysUntilStart === 0
      ? 'Today'
      : trip.daysUntilStart === 1
        ? 'Tomorrow'
        : `In ${trip.daysUntilStart} days`;

  return (
    <button
      type="button"
      onClick={() => navigate(`/me/trips/${trip.id}`)}
      className="w-full text-left border-b px-4 py-2 hover:bg-muted/50 transition-colors flex items-center gap-2"
    >
      {trip.cover_image_url ? (
        <img
          src={trip.cover_image_url}
          alt=""
          className="rounded-element object-cover shrink-0"
          style={{ width: 44, height: 44 }}
        />
      ) : (
        <div
          className="rounded-element bg-muted flex items-center justify-center shrink-0 text-2xl"
          style={{ width: 44, height: 44 }}
        >
          {flag}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm truncate">{trip.title}</p>
          {nudgeCount > 0 && (
            <span className="shrink-0 rounded-badge bg-foreground text-background text-2xs px-1.5 py-0.5 font-medium">
              {nudgeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {trip.primary_city_name && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground truncate">
              <MapPin size={10} />
              {trip.primary_city_name}
            </span>
          )}
          <span className="text-xs text-muted-foreground shrink-0">· {countdown}</span>
        </div>
      </div>
    </button>
  );
}
