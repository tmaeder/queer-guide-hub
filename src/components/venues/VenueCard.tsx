import { Card, CardImage } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, BadgeCheck, Share2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { Luggage } from 'lucide-react';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';
import { CardHoverEffect } from '@/components/effects/CardHoverEffect';
import { useToast } from '@/hooks/use-toast';
import { isSupportedLocale, DEFAULT_LOCALE } from '@/i18n/languages';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Compact relative-time formatter — uses Intl when available.
function relativeUpdated(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  const day = 86_400_000;
  const days = Math.round(diffMs / day);
  if (days < 1) return 'today';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(days / 365);
  return `${years}y ago`;
}

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
    if (
      Number.isNaN(oh) ||
      Number.isNaN(om) ||
      Number.isNaN(ch) ||
      Number.isNaN(cm)
    )
      return false;
    const o = oh * 60 + om;
    const c = ch * 60 + cm;
    // Same-day window. Cross-midnight intentionally ignored — needs more data.
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

const categoryLabel = (cat: string) =>
  cat.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

interface VenueCardProps {
  venue?: Venue & {
    venue_reviews?: Array<{
      rating: number;
    }>;
  };
  loading?: boolean;
  events?: Event[];
  onViewDetails?: (venue: Venue) => void;
  onAmenityClick?: (amenity: string) => void;
  onServiceClick?: (service: string) => void;
  onTagClick?: (tag: string) => void;
}

const VenueCardFixture = () => (
  <Card hoverable style={{ overflow: 'hidden' }}>
    <CardImage src="" alt="Venue" fallbackIcon={MapPin} />
    <div className="p-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-base font-semibold leading-tight">Sample Venue Name</p>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin style={{ width: 14, height: 14, flexShrink: 0 }} />
          <p className="text-sm">Berlin, Germany</p>
        </div>
      </div>
    </div>
  </Card>
);

export function VenueCard({
  venue,
  loading = false,
}: VenueCardProps) {
  const { data: tripStatus } = useEntityTripStatus('venue', venue?.id);
  const { toast } = useToast();

  const venueImage = venue?.images?.[0] ?? venue?.logo_url ?? null;
  const openNow = venue ? isOpenNow(venue.hours) : null;
  const priceTier =
    typeof venue?.price_range === 'number' && venue.price_range > 0
      ? '$'.repeat(Math.min(4, Math.max(1, venue.price_range)))
      : null;
  const isVerified = venue?.verified === true || venue?.verification_status === 'verified';
  const topTags = (venue?.tags ?? []).slice(0, 2);
  const updatedLabel = relativeUpdated(venue?.updated_at);

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!venue) return;
    // Preserve the current locale prefix in the shared URL so the recipient
    // lands on the same language. Default locale ('en') has no prefix.
    const firstSeg = window.location.pathname.split('/')[1] ?? '';
    const prefix =
      firstSeg && isSupportedLocale(firstSeg) && firstSeg !== DEFAULT_LOCALE
        ? `/${firstSeg}`
        : '';
    const url = `${window.location.origin}${prefix}/venues/${venue.slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: venue.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied', description: url });
    } catch {
      // User cancelled or clipboard blocked — silent.
    }
  };

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
          style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
        >
          <CardHoverEffect>
          <Card hoverable style={{ overflow: 'hidden' }}>
            <div className="relative">
              <CardImage
                src={venueImage}
                alt={venue.name}
                fallbackIcon={MapPin}
                height={160}
              />

              {/* Category label — top left */}
              {venue.category && (
                <div
                  className="absolute top-2 left-2 px-2 py-0.5 rounded font-bold uppercase backdrop-blur-sm"
                  style={{
                    backgroundColor: 'hsl(var(--foreground) / 0.6)',
                    color: 'hsl(var(--background))',
                    fontSize: '0.65rem',
                    letterSpacing: '0.05em',
                  }}
                >
                  {categoryLabel(venue.category)}
                </div>
              )}

              {/* Favorite + share — top right */}
              <div
                className="absolute top-1 right-1 flex items-center gap-0.5"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <button
                  type="button"
                  onClick={handleShare}
                  aria-label={`Share ${venue.name}`}
                  className="h-9 w-9 rounded-full inline-flex items-center justify-center bg-background/70 backdrop-blur-sm hover:bg-background"
                >
                  <Share2 style={{ width: 16, height: 16 }} aria-hidden="true" />
                </button>
                <FavoriteButton itemId={venue.id} type="venue" />
              </div>

              {/* Open-now badge — bottom right */}
              {openNow === true && (
                <div className="absolute bottom-2 right-2">
                  <Badge className="font-bold text-[0.6rem] h-5 px-1.5">Open now</Badge>
                </div>
              )}

              {/* Closed badge */}
              {venue.closed_at && new Date(venue.closed_at) <= new Date() && (
                <div className="absolute top-2 right-11">
                  <Badge variant="destructive" className="font-bold text-[0.65rem] h-5">Closed</Badge>
                </div>
              )}

              {/* Trip badge */}
              {tripStatus?.isInTrip && (
                <div
                  className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold bg-primary text-primary-foreground"
                  style={{ fontSize: '0.7rem' }}
                >
                  <Luggage style={{ width: 12, height: 12 }} />
                  In trip
                </div>
              )}

              {/* Logo overlay */}
              {venue.logo_url && (
                <img
                  src={venue.logo_url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute bottom-2 right-2 w-7 h-7 rounded-element bg-background object-contain shadow p-0.5"
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
            </div>

            <div className="p-3">
              <div className="flex items-center gap-1 min-w-0">
                <p className="font-semibold leading-tight overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0">
                  {venue.name}
                </p>
                {isVerified && (
                  <BadgeCheck
                    aria-label="Verified"
                    style={{ width: 14, height: 14, flexShrink: 0 }}
                    className="text-foreground/70"
                  />
                )}
                {priceTier && (
                  <span
                    aria-label={`Price tier ${priceTier}`}
                    className="text-xs font-medium text-muted-foreground tabular-nums"
                  >
                    {priceTier}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-muted-foreground">
                <MapPin style={{ width: 13, height: 13, flexShrink: 0 }} />
                <p className="text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                  {[venue.city, venue.state].filter(Boolean).join(', ')}
                </p>
              </div>
              {topTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {topTags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[0.65rem] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {updatedLabel && (
                <p className="mt-2 text-[0.65rem] text-muted-foreground">Updated {updatedLabel}</p>
              )}
            </div>
          </Card>
          </CardHoverEffect>
        </LocalizedLink>
      )}
    </Skeleton>
  );
}
