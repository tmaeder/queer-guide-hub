import type { ReactNode } from 'react';
import { Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TripWithDetails } from '@/hooks/useTrips';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { resolveTripTitle } from './tripTitle';

interface Props {
  trip: TripWithDetails;
  dateRange: string | null;
  statusLabel: string;
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * Fallback gradient used when no cover image is set. Stable per trip via a
 * hash of the id so returning to a trip always shows the same gradient.
 */
function gradientForTrip(tripId: string): string {
  const palettes = [
    ['#7C3AED', 'hsl(var(--foreground))'],
    ['#F59E0B', '#EF4444'],
    ['#06B6D4', '#3B82F6'],
    ['#10B981', '#6366F1'],
    ['#EC4899', '#8B5CF6'],
    ['#0EA5E9', '#22C55E'],
  ];
  let hash = 0;
  for (let i = 0; i < tripId.length; i += 1) {
    hash = (hash * 31 + tripId.charCodeAt(i)) >>> 0;
  }
  const [a, b] = palettes[hash % palettes.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export function TripCoverBand({
  trip,
  dateRange,
  statusLabel,
  actions,
  children,
}: Props) {
  const { t } = useTranslation();
  const displayTitle = resolveTripTitle(trip, t);

  const coverImage = trip.cover_image_url;
  const fallbackGradient = gradientForTrip(trip.id);

  const visibleMembers = trip.trip_members.slice(0, 4);
  const overflow = trip.trip_members.length - visibleMembers.length;

  return (
    <div
      className="relative rounded-container overflow-hidden mb-6 min-h-[180px] md:min-h-[220px] flex items-end bg-cover bg-center"
      style={{
        background: coverImage ? undefined : fallbackGradient,
        backgroundImage: coverImage ? `url(${coverImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Dark gradient overlay for legibility */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/15 to-black/65 dark:from-black/35 dark:to-black/[0.78]"
      />

      <div className="relative z-[1] w-full px-5 py-5 md:px-8 md:py-6 flex items-end justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          {/* Status pill */}
          <div className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-white/20 text-white text-[0.7rem] font-bold uppercase tracking-wider mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            {statusLabel}
          </div>

          <h3
            className="text-white text-3xl md:text-4xl font-extrabold leading-tight tracking-tight"
            style={{ textShadow: '0 2px 16px rgba(0,0,0,0.35)' }}
          >
            {displayTitle}
          </h3>

          {dateRange && (
            <div className="inline-flex items-center gap-1.5 mt-2 text-white/90">
              <Calendar style={{ width: 15, height: 15 }} />
              <p className="text-sm">{dateRange}</p>
            </div>
          )}

          {trip.description && (
            <p
              className="text-white/80 mt-1.5 max-w-[640px] text-sm overflow-hidden"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {trip.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          {trip.trip_members.length > 0 && (
            <div className="flex -space-x-2">
              {visibleMembers.map((m) => (
                <Avatar
                  key={m.id}
                  className="h-8 w-8 border-2 border-white/60 text-[0.8rem]"
                >
                  {m.profiles?.avatar_url && (
                    <AvatarImage
                      src={m.profiles.avatar_url}
                      alt={m.profiles?.display_name || 'Member'}
                    />
                  )}
                  <AvatarFallback className="text-[0.8rem]">
                    {(m.profiles?.display_name || 'U')[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
              {overflow > 0 && (
                <Avatar className="h-8 w-8 border-2 border-white/60 bg-muted">
                  <AvatarFallback className="text-[0.8rem]">+{overflow}</AvatarFallback>
                </Avatar>
              )}
            </div>
          )}
          {children}
          {actions}
        </div>
      </div>
    </div>
  );
}
