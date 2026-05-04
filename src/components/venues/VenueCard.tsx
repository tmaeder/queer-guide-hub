import { Card, CardImage } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { Luggage } from 'lucide-react';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';

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

  const venueImage = venue?.images?.[0] ?? venue?.logo_url ?? null;

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

              {/* Favorite — top right */}
              <div
                className="absolute top-1 right-1"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <FavoriteButton itemId={venue.id} type="venue" />
              </div>

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
                  className="absolute bottom-2 right-2 w-7 h-7 rounded-md bg-background object-contain shadow p-0.5"
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
            </div>

            <div className="p-3">
              <p className="font-semibold leading-tight overflow-hidden text-ellipsis whitespace-nowrap">
                {venue.name}
              </p>
              <div className="flex items-center gap-1.5 mt-1 text-muted-foreground">
                <MapPin style={{ width: 13, height: 13, flexShrink: 0 }} />
                <p className="text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                  {[venue.city, venue.state].filter(Boolean).join(', ')}
                </p>
              </div>
            </div>
          </Card>
        </LocalizedLink>
      )}
    </Skeleton>
  );
}
