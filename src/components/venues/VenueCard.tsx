import { memo } from 'react';
import { Card } from '@/components/ui/card';
import { MapPin, BadgeCheck } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { CardHoverEffect } from '@/components/effects/CardHoverEffect';
import { getRandomFallbackImage } from '@/utils/fallbackImages';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Read venue.hours JSON and return whether the venue appears open right now.
// Supported shapes: { mon: "09:00-17:00", ... } or { mon: [{open:"09:00",close:"17:00"}] }.
function isOpenNow(hours: unknown): boolean | null {
  if (!hours || typeof hours !== 'object') return null;
  const now = new Date();
  const key = WEEKDAYS[now.getDay()];
  const today = (hours as Record<string, unknown>)[key];
  if (!today) return null;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const inRange = (open: string, close: string) => {
    const [oh, om] = open.split(':').map(Number);
    const [ch, cm] = close.split(':').map(Number);
    if (Number.isNaN(oh) || Number.isNaN(om) || Number.isNaN(ch) || Number.isNaN(cm)) return false;
    const o = oh * 60 + om;
    const c = ch * 60 + cm;
    return minutes >= o && minutes <= c;
  };
  if (typeof today === 'string') {
    const m = today.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/);
    if (!m) return null;
    return inRange(m[1], m[2]);
  }
  if (Array.isArray(today)) {
    return today.some((slot) => {
      if (typeof slot !== 'object' || slot === null) return false;
      const s = slot as { open?: string; close?: string };
      return s.open && s.close ? inRange(s.open, s.close) : false;
    });
  }
  return null;
}

type Venue = Database['public']['Tables']['venues']['Row'];
type Event = Database['public']['Tables']['events']['Row'];

interface VenueCardProps {
  venue?: Venue & {
    venue_reviews?: Array<{ rating: number }>;
  };
  loading?: boolean;
  events?: Event[];
  onViewDetails?: (venue: Venue) => void;
  onAmenityClick?: (amenity: string) => void;
  onServiceClick?: (service: string) => void;
  onTagClick?: (tag: string) => void;
}

const VenueCardFixture = () => (
  <Card hoverable className="overflow-hidden">
    <div className="aspect-[16/10] bg-muted" />
    <div className="p-4">
      <p className="text-body-lg font-semibold leading-tight">Sample Venue Name</p>
      <p className="mt-1 text-xs text-muted-foreground">Berlin, Germany</p>
    </div>
  </Card>
);

function VenueCardImpl({ venue, loading = false }: VenueCardProps) {
  const venueImage = venue?.images?.[0] ?? venue?.logo_url ?? null;
  const openNow = venue ? isOpenNow(venue.hours) : null;
  const priceTier =
    typeof venue?.price_range === 'number' && venue.price_range > 0
      ? '$'.repeat(Math.min(4, Math.max(1, venue.price_range)))
      : null;
  const isVerified = venue?.verified === true || venue?.verification_status === 'verified';
  const isClosed = !!venue?.closed_at && new Date(venue.closed_at) <= new Date();
  const topTags = (venue?.tags ?? []).slice(0, 2);
  const locationLabel = venue
    ? [venue.city, venue.state].filter(Boolean).join(', ')
    : '';

  // Single overlay slot — priority order
  const overlay: { label: string; variant: 'closed' | 'open' } | null = isClosed
    ? { label: 'Closed', variant: 'closed' }
    : openNow === true
      ? { label: 'Open now', variant: 'open' }
      : null;

  return (
    <Skeleton
      name="venue-card"
      loading={loading || !venue}
      fixture={<VenueCardFixture />}
      fallback={<PageLoadingState count={1} />}
    >
      {venue && (
        <LocalizedLink
          to={`/venues/${venue.slug}`}
          style={{ color: 'inherit' }}
          className="block no-underline"
        >
          <CardHoverEffect>
            <Card hoverable className="group overflow-hidden">
              <div className="relative aspect-[16/10] overflow-hidden bg-muted rounded-t-container">
                <img
                  src={venueImage ?? getRandomFallbackImage()}
                  alt={venue.name}
                  role="presentation"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover grayscale-[0.15] transition-all duration-500 ease-out group-hover:grayscale-0 group-hover:scale-[1.04]"
                />

                {overlay && (
                  <div
                    className={
                      overlay.variant === 'closed'
                        ? 'absolute top-2 left-2 px-2 py-0.5 rounded-badge text-2xs font-semibold uppercase tracking-wider bg-destructive text-destructive-foreground'
                        : 'absolute top-2 left-2 px-2 py-0.5 rounded-badge text-2xs font-semibold uppercase tracking-wider bg-foreground/80 text-background'
                    }
                  >
                    {overlay.label}
                  </div>
                )}

                <div
                  className="absolute top-1 right-1"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  <FavoriteButton itemId={venue.id} type="venue" size="tap" />
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-baseline gap-2 min-w-0">
                  <p className="text-body-lg font-semibold leading-tight truncate flex-1 min-w-0">
                    {venue.name}
                    {isVerified && (
                      <BadgeCheck
                        aria-label="Verified"
                        size={14}
                        className="inline ml-1 text-foreground/60 align-middle"
                      />
                    )}
                  </p>
                  {priceTier && (
                    <span
                      aria-label={`Price tier ${priceTier}`}
                      className="text-xs font-medium text-muted-foreground tabular-nums shrink-0"
                    >
                      {priceTier}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground truncate">
                  {locationLabel || (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={12} />
                      Location unknown
                    </span>
                  )}
                </p>
                {(() => {
                  const blurb = (venue.description ?? '').split(/(?<=[.!?])\s+/)[0]?.trim();
                  if (!blurb || blurb.length < 12) return null;
                  return (
                    <p className="mt-2 text-13 text-muted-foreground line-clamp-2">
                      {blurb}
                    </p>
                  );
                })()}
                {topTags.length > 0 && (
                  <p className="mt-2 text-2xs text-muted-foreground truncate">
                    {topTags.join(' · ')}
                  </p>
                )}
              </div>
            </Card>
          </CardHoverEffect>
        </LocalizedLink>
      )}
    </Skeleton>
  );
}

export const VenueCard = memo(VenueCardImpl);
