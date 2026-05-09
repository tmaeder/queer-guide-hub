import {
  Star,
  MapPin,
  Phone,
  Globe,
  Instagram,
  Mail,
  Clock,
  Wifi,
  Car,
  Accessibility,
  Luggage,
  Navigation2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { VenueEvents } from '@/components/venues/VenueEvents';
import { VenueCheckInButton } from '@/components/venues/VenueCheckInButton';
import { VenueRecentCheckins } from '@/components/venues/VenueRecentCheckins';
import EqualityScoreBadge from '@/components/country/EqualityScoreBadge';
import { EntityMap } from '@/components/map/EntityMap';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { SocialSignalBadges } from '@/components/trips/SocialSignalBadges';
import type { useVenueSocialSignals } from '@/hooks/useVenueSocialSignals';
import type { Database } from '@/integrations/supabase/types';
import { fetchVenueWithReviews } from '@/hooks/usePageFetchers';

type Venue = Database['public']['Tables']['venues']['Row'];
export type VenueReview = Database['public']['Tables']['venue_reviews']['Row'] & {
  profiles: { display_name: string; avatar_url: string | null } | null;
};

export type VenueWithRelations = Venue & {
  cities?: { id: string; slug?: string; name: string } | null;
  countries?: {
    id: string;
    slug?: string;
    name: string;
    equality_score: number | null;
    lgbti_criminalization: Record<string, unknown> | null;
  } | null;
};

export type SocialSignals = ReturnType<typeof useVenueSocialSignals>['data'];

export const VENUE_SELECT_FIELDS =
  '*, cities:city_id(id, slug, name), countries:country_id(id, slug, name, equality_score, lgbti_criminalization)';

export interface FetchVenueResult {
  venue: VenueWithRelations | null;
  reviews: VenueReview[];
  redirectTo?: string;
  notFound?: boolean;
}

export async function fetchVenue(slug: string): Promise<FetchVenueResult> {
  return fetchVenueWithReviews<VenueWithRelations, VenueReview>(slug, VENUE_SELECT_FIELDS);
}

export function getPriceRange(range: number | null) {
  if (!range) return '';
  return '$'.repeat(range);
}

export function formatHours(hours: Record<string, unknown>) {
  if (!hours || typeof hours !== 'object')
    return <p className="text-sm text-muted-foreground">Hours not available</p>;
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map((day, index) => (
    <div key={day} className="flex justify-between">
      <span className="text-sm font-medium">{dayNames[index]}</span>
      <span className="text-sm text-muted-foreground">{(hours[day] as string) || 'Closed'}</span>
    </div>
  ));
}

interface VenueHeroProps {
  venue: VenueWithRelations;
  cityName: string | null;
  countryName: string | null;
  cityLink: string | null;
  countryLink: string | null;
  heroImage: string | null;
  averageRating: number;
  reviewCount: number;
  tripCount?: number;
  isInTrip?: boolean;
  socialSignal: NonNullable<SocialSignals> extends Map<string, infer V> ? V | undefined : undefined;
  onAddToTrip: () => void;
  onCheckInSuccess: () => void;
  t: (key: string, fallback?: string) => string;
}

export function VenueHero({
  venue,
  cityName,
  countryName,
  cityLink,
  countryLink,
  heroImage,
  averageRating,
  reviewCount,
  tripCount,
  isInTrip,
  socialSignal,
  onAddToTrip,
  onCheckInSuccess,
  t,
}: VenueHeroProps) {
  return (
    <>
      {/* Hero Image */}
      {heroImage && (
        <div className="w-full h-40 md:h-48 rounded-2xl overflow-hidden mb-6 relative">
          <img
            src={heroImage}
            alt={venue.name}
            className="w-full h-full object-cover"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Safety Alert Banner */}
      {venue.countries?.lgbti_criminalization && (
        <SafetyAlertBanner
          criminalization={venue.countries.lgbti_criminalization}
          countryName={venue.countries.name}
        />
      )}

      {/* Permanently Closed Banner */}
      {venue.closed_at && new Date(venue.closed_at) <= new Date() && (
        <div className="mb-6 px-4 py-3 bg-destructive text-destructive-foreground flex items-center gap-2">
          <p className="text-sm font-semibold">
            Permanently closed
            {' · '}
            {new Date(venue.closed_at).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
      )}

      {/* Title Row */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            {venue.logo_url && (
              <img
                src={venue.logo_url}
                alt=""
                className="object-contain flex-shrink-0"
                style={{ width: 40, height: 40, borderRadius: '10px', padding: '3px' }}
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <h1 className="text-2xl font-bold">{venue.name}</h1>
            {venue.verified && (
              <Badge variant="secondary">{t('pages.venueDetail.verified', 'Verified')}</Badge>
            )}
            {venue.is_featured && <Badge>Featured</Badge>}
            {venue.countries?.equality_score != null && (
              <EqualityScoreBadge score={venue.countries.equality_score} size="sm" />
            )}
          </div>
          <div className="flex items-center gap-1 mb-2">
            <MapPin
              style={{
                width: 14,
                height: 14,
                color: 'hsl(var(--muted-foreground))',
                flexShrink: 0,
              }}
            />
            <span className="text-sm text-muted-foreground">
              {cityLink ? (
                <LocalizedLink to={cityLink} style={{ color: 'inherit', textDecoration: 'none' }}>
                  <span className="text-sm hover:text-primary hover:underline">{cityName}</span>
                </LocalizedLink>
              ) : (
                cityName
              )}
              {countryName && (
                <>
                  {', '}
                  {countryLink ? (
                    <LocalizedLink
                      to={countryLink}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      <span className="text-sm hover:text-primary hover:underline">
                        {countryName}
                      </span>
                    </LocalizedLink>
                  ) : (
                    countryName
                  )}
                </>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <FavoriteButton itemId={venue.id} type="venue" size="md" />
          <Button variant="outline" size="sm" onClick={onAddToTrip}>
            <Luggage style={{ width: 14, height: 14, marginRight: 6 }} />
            Add to Trip
          </Button>
          {isInTrip && (
            <Badge variant="secondary">
              In {tripCount} trip{tripCount !== 1 ? 's' : ''}
            </Badge>
          )}
          <SocialSignalBadges signal={socialSignal} tripUsageThreshold={1} />
          <ReportButton contentType="venues" contentId={venue.id} contentName={venue.name} />
          <AdminEditButton
            contentType="venues"
            contentId={venue.id}
            contentName={venue.name}
            currentData={venue as Record<string, unknown>}
            onSaved={() => window.location.reload()}
          />
          <VenueCheckInButton
            venueId={venue.id}
            venueName={venue.name}
            venueLatitude={venue.latitude}
            venueLongitude={venue.longitude}
            onCheckInSuccess={onCheckInSuccess}
          />
          {venue.phone && (
            <Button variant="outline" size="sm" onClick={() => window.open(`tel:${venue.phone}`)}>
              <Phone style={{ width: 16, height: 16, marginRight: 8 }} />
              Call
            </Button>
          )}
          {venue.website && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={venue.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                <Globe style={{ width: 16, height: 16, marginRight: 8 }} />
                Website
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Stat Chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {venue.category && <Badge>{venue.category}</Badge>}
        {cityName && (
          <Badge variant="outline" className="gap-1">
            <MapPin style={{ width: 14, height: 14 }} />
            {cityName}{countryName ? `, ${countryName}` : ''}
          </Badge>
        )}
        {venue.price_range && (
          <Badge variant="outline">{getPriceRange(venue.price_range)}</Badge>
        )}
        {averageRating > 0 && (
          <Badge variant="outline" className="gap-1">
            <Star style={{ width: 14, height: 14, fill: 'currentColor' }} />
            {averageRating.toFixed(1)} ({reviewCount} review{reviewCount !== 1 ? 's' : ''})
          </Badge>
        )}
        {venue.amenities?.map((amenity) => (
          <Badge key={amenity} variant="outline" className="capitalize">
            {amenity.replace('-', ' ')}
          </Badge>
        ))}
      </div>
    </>
  );
}

interface VenueOverviewProps {
  venue: VenueWithRelations;
  checkinRefresh: number;
  navigate: (path: string) => void;
  t: (key: string, fallback?: string) => string;
}

export function VenueOverview({ venue, checkinRefresh, navigate, t }: VenueOverviewProps) {
  return (
    <ScrollReveal direction="up">
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 mt-2">
        {/* Main Content */}
        <div className="flex flex-col gap-6">
          {/* Description */}
          {venue.description && (
            <Card>
              <CardHeader>
                <CardTitle>{t('pages.venueDetail.about', 'About')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground" style={{ lineHeight: 1.7 }}>
                  {venue.description}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Amenities */}
          {venue.amenities && venue.amenities.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('pages.venueDetail.amenities', 'Amenities')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {venue.amenities.map((amenity, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 rounded">
                      {amenity === 'wifi' && <Wifi style={{ width: 16, height: 16 }} />}
                      {amenity === 'parking' && <Car style={{ width: 16, height: 16 }} />}
                      {amenity === 'wheelchair-accessible' && (
                        <Accessibility style={{ width: 16, height: 16 }} />
                      )}
                      {!['wifi', 'parking', 'wheelchair-accessible'].includes(amenity) && (
                        <div
                          className="rounded-full bg-muted flex-shrink-0"
                          style={{ width: 16, height: 16 }}
                        />
                      )}
                      <span className="text-sm capitalize">{amenity.replace('-', ' ')}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Check-ins (mobile only, shown inline) */}
          <div className="block lg:hidden">
            <VenueRecentCheckins venueId={venue.id} refreshTrigger={checkinRefresh} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6">
          {/* Location Map */}
          {typeof venue.latitude === 'number' && typeof venue.longitude === 'number' && (
            <Card>
              <CardContent>
                <EntityMap
                  center={[Number(venue.longitude), Number(venue.latitude)]}
                  zoom={15}
                  height={200}
                  markers={[
                    {
                      id: venue.id,
                      lat: Number(venue.latitude),
                      lng: Number(venue.longitude),
                      name: venue.name ?? 'Venue',
                      type: 'venues',
                      primary: true,
                    },
                  ]}
                />
              </CardContent>
            </Card>
          )}

          {/* Recent Check-ins (desktop only) */}
          <div className="hidden lg:block">
            <VenueRecentCheckins venueId={venue.id} refreshTrigger={checkinRefresh} />
          </div>

          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle>{t('pages.venueDetail.contact', 'Contact')}</CardTitle>
            </CardHeader>
            <CardContent>
              {venue.address && (
                <div className="flex items-start gap-3">
                  <MapPin
                    style={{
                      width: 16,
                      height: 16,
                      color: 'hsl(var(--muted-foreground))',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  />
                  <div>
                    <p className="text-sm">
                      {venue.address}
                      {venue.postal_code ? `, ${venue.postal_code}` : ''}
                    </p>
                    {typeof venue.latitude === 'number' &&
                      typeof venue.longitude === 'number' && (
                        <Button variant="outline" size="sm" asChild style={{ marginTop: 8 }}>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Navigation2 style={{ width: 14, height: 14, marginRight: 6 }} />
                            Directions
                          </a>
                        </Button>
                      )}
                  </div>
                </div>
              )}
              {venue.phone && (
                <div className="flex items-center gap-3">
                  <Phone style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
                  <a
                    href={`tel:${venue.phone}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {venue.phone}
                  </a>
                </div>
              )}
              {venue.email && (
                <div className="flex items-center gap-3">
                  <Mail style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
                  <a
                    href={`mailto:${venue.email}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {venue.email}
                  </a>
                </div>
              )}
              {venue.website && (
                <div className="flex items-center gap-3">
                  <Globe style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
                  <a
                    href={venue.website}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-sm text-primary hover:underline overflow-hidden text-ellipsis whitespace-nowrap"
                  >
                    {venue.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                </div>
              )}
              {venue.instagram && (
                <div className="flex items-center gap-3">
                  <Instagram
                    style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }}
                  />
                  <a
                    href={`https://instagram.com/${venue.instagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    @{venue.instagram}
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Hours */}
          {venue.hours && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <div className="flex items-center gap-2">
                    <Clock style={{ width: 16, height: 16 }} />
                    Hours
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>{formatHours(venue.hours as Record<string, unknown>)}</CardContent>
            </Card>
          )}

          {/* Tags */}
          {venue.tags && venue.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('pages.venueDetail.tags', 'Tags')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {venue.tags.map((tag, index) => (
                    <Badge
                      key={index}
                      variant="outline"
                      className="cursor-pointer"
                      onClick={() => navigate(`/resources/${encodeURIComponent(tag)}`)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ScrollReveal>
  );
}

interface VenuePhotosProps {
  venue: VenueWithRelations;
  t: (key: string, fallback?: string) => string;
}

export function VenuePhotos({ venue, t }: VenuePhotosProps) {
  if (!venue.images || venue.images.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          {t('pages.venueDetail.noPhotos', 'No photos available')}
        </p>
      </div>
    );
  }
  return (
    <StaggerGrid className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-2">
      {venue.images.map((imageUrl, index) => (
        <div
          key={index}
          className="aspect-square rounded-lg overflow-hidden bg-muted"
        >
          <img
            src={imageUrl}
            alt={`${venue.name} - Image ${index + 1}`}
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300 cursor-pointer"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).src = '/placeholder.svg';
            }}
            onClick={() => window.open(imageUrl, '_blank')}
          />
        </div>
      ))}
    </StaggerGrid>
  );
}

interface VenueEventsTabProps {
  venue: VenueWithRelations;
  venueEvents: Array<{ id: string; venue_id?: string | null }>;
  t: (key: string, fallback?: string) => string;
}

export function VenueEventsTab({ venue, venueEvents, t }: VenueEventsTabProps) {
  if (venueEvents.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          {t('pages.venueDetail.noEvents', 'No upcoming events at this venue')}
        </p>
      </div>
    );
  }
  return (
    <div className="mt-2">
      <VenueEvents
        venueId={venue.id}
        venueName={venue.name}
        events={venueEvents as Parameters<typeof VenueEvents>[0]['events']}
        compact={false}
      />
    </div>
  );
}

interface VenueReviewsProps {
  reviews: VenueReview[];
}

export function VenueReviewsTab({ reviews }: VenueReviewsProps) {
  if (reviews.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No reviews yet. Be the first to leave a review!
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 mt-2">
      {reviews.map((review) => (
        <Card key={review.id}>
          <CardContent>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <div
                  className="bg-muted rounded-full flex items-center justify-center font-semibold text-sm"
                  style={{ width: 36, height: 36 }}
                >
                  {review.profiles?.display_name?.[0]?.toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {review.profiles?.display_name || 'Anonymous'}
                  </p>
                  <div className="flex items-center" style={{ gap: 1 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        style={{
                          width: 13,
                          height: 13,
                          fill: i < review.rating ? 'currentColor' : 'none',
                          // TODO(polish): no token match — star rating amber/gray
                          color: i < review.rating ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(review.created_at).toLocaleDateString()}
              </span>
            </div>
            {review.title && (
              <p className="text-sm font-semibold mb-1">{review.title}</p>
            )}
            {review.content && (
              <p className="text-sm text-muted-foreground" style={{ lineHeight: 1.6 }}>
                {review.content}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
