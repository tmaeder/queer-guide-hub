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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
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
    return (
      <Typography variant="body2" color="text.secondary">
        Hours not available
      </Typography>
    );
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map((day, index) => (
    <Box key={day} sx={{ display: 'flex', justifyContent: 'space-between' }}>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {dayNames[index]}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {(hours[day] as string) || 'Closed'}
      </Typography>
    </Box>
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
        <Box
          sx={{
            width: '100%',
            height: { xs: 160, md: 192 },
            borderRadius: 3,
            overflow: 'hidden',
            mb: 3,
            position: 'relative',
          }}
        >
          <Box
            component="img"
            src={heroImage}
            alt={venue.name}
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </Box>
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
        <Box
          sx={{
            mb: 3,
            px: 2,
            py: 1.5,
            bgcolor: 'error.main',
            color: 'error.contrastText',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Permanently closed
            {' · '}
            {new Date(venue.closed_at).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Typography>
        </Box>
      )}

      {/* Title Row */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { md: 'flex-start' },
          justifyContent: { md: 'space-between' },
          gap: 2,
          mb: 2,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
            {venue.logo_url && (
              <Box
                component="img"
                src={venue.logo_url}
                alt=""
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '10px',
                  objectFit: 'contain',
                  p: '3px',
                  flexShrink: 0,
                }}
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {venue.name}
            </Typography>
            {venue.verified && (
              <Badge variant="secondary">{t('pages.venueDetail.verified', 'Verified')}</Badge>
            )}
            {venue.is_featured && <Badge>Featured</Badge>}
            {venue.countries?.equality_score != null && (
              <EqualityScoreBadge score={venue.countries.equality_score} size="sm" />
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            <MapPin
              style={{
                width: 14,
                height: 14,
                color: 'hsl(var(--muted-foreground))',
                flexShrink: 0,
              }}
            />
            <Typography variant="body2" color="text.secondary">
              {cityLink ? (
                <LocalizedLink to={cityLink} style={{ color: 'inherit', textDecoration: 'none' }}>
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{ '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}
                  >
                    {cityName}
                  </Typography>
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
                      <Typography
                        component="span"
                        variant="body2"
                        sx={{ '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}
                      >
                        {countryName}
                      </Typography>
                    </LocalizedLink>
                  ) : (
                    countryName
                  )}
                </>
              )}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(venue.website!, '_blank')}
            >
              <Globe style={{ width: 16, height: 16, marginRight: 8 }} />
              Website
            </Button>
          )}
        </Box>
      </Box>

      {/* Stat Chips */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
        {venue.category && <Chip label={venue.category} size="small" />}
        {cityName && (
          <Chip
            icon={<MapPin style={{ width: 14, height: 14 }} />}
            label={`${cityName}${countryName ? `, ${countryName}` : ''}`}
            size="small"
            variant="outlined"
          />
        )}
        {venue.price_range && (
          <Chip label={getPriceRange(venue.price_range)} size="small" variant="outlined" />
        )}
        {averageRating > 0 && (
          <Chip
            icon={<Star style={{ width: 14, height: 14, fill: 'currentColor' }} />}
            label={`${averageRating.toFixed(1)} (${reviewCount} review${reviewCount !== 1 ? 's' : ''})`}
            size="small"
            variant="outlined"
          />
        )}
        {venue.amenities?.map((amenity) => (
          <Chip
            key={amenity}
            label={amenity.replace('-', ' ')}
            size="small"
            variant="outlined"
            sx={{ textTransform: 'capitalize' }}
          />
        ))}
      </Box>
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
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' },
          gap: 3,
          mt: 1,
        }}
      >
        {/* Main Content */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Description */}
          {venue.description && (
            <Card>
              <CardHeader>
                <CardTitle>{t('pages.venueDetail.about', 'About')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Typography color="text.secondary" sx={{ lineHeight: 1.7 }}>
                  {venue.description}
                </Typography>
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
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr' },
                    gap: 1.5,
                  }}
                >
                  {venue.amenities.map((amenity, index) => (
                    <Box
                      key={index}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        p: 1,
                        borderRadius: 1,
                      }}
                    >
                      {amenity === 'wifi' && <Wifi style={{ width: 16, height: 16 }} />}
                      {amenity === 'parking' && <Car style={{ width: 16, height: 16 }} />}
                      {amenity === 'wheelchair-accessible' && (
                        <Accessibility style={{ width: 16, height: 16 }} />
                      )}
                      {!['wifi', 'parking', 'wheelchair-accessible'].includes(amenity) && (
                        <Box
                          sx={{
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            bgcolor: 'action.disabled',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                        {amenity.replace('-', ' ')}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Recent Check-ins (mobile only, shown inline) */}
          <Box sx={{ display: { xs: 'block', lg: 'none' } }}>
            <VenueRecentCheckins venueId={venue.id} refreshTrigger={checkinRefresh} />
          </Box>
        </Box>

        {/* Sidebar */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
          <Box sx={{ display: { xs: 'none', lg: 'block' } }}>
            <VenueRecentCheckins venueId={venue.id} refreshTrigger={checkinRefresh} />
          </Box>

          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle>{t('pages.venueDetail.contact', 'Contact')}</CardTitle>
            </CardHeader>
            <CardContent>
              {venue.address && (
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <MapPin
                    style={{
                      width: 16,
                      height: 16,
                      color: 'hsl(var(--muted-foreground))',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  />
                  <Box>
                    <Typography variant="body2">
                      {venue.address}
                      {venue.postal_code ? `, ${venue.postal_code}` : ''}
                    </Typography>
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
                  </Box>
                </Box>
              )}
              {venue.phone && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Phone
                    style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }}
                  />
                  <Typography
                    component="a"
                    href={`tel:${venue.phone}`}
                    variant="body2"
                    color="primary"
                    sx={{ '&:hover': { textDecoration: 'underline' } }}
                  >
                    {venue.phone}
                  </Typography>
                </Box>
              )}
              {venue.email && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Mail style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
                  <Typography
                    component="a"
                    href={`mailto:${venue.email}`}
                    variant="body2"
                    color="primary"
                    sx={{ '&:hover': { textDecoration: 'underline' } }}
                  >
                    {venue.email}
                  </Typography>
                </Box>
              )}
              {venue.website && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Globe
                    style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }}
                  />
                  <Typography
                    component="a"
                    href={venue.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="body2"
                    color="primary"
                    sx={{
                      '&:hover': { textDecoration: 'underline' },
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {venue.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </Typography>
                </Box>
              )}
              {venue.instagram && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Instagram
                    style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }}
                  />
                  <Typography
                    component="a"
                    href={`https://instagram.com/${venue.instagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="body2"
                    color="primary"
                    sx={{ '&:hover': { textDecoration: 'underline' } }}
                  >
                    @{venue.instagram}
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Hours */}
          {venue.hours && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Clock style={{ width: 16, height: 16 }} />
                    Hours
                  </Box>
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
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {venue.tags.map((tag, index) => (
                    <Chip
                      key={index}
                      label={tag}
                      size="small"
                      variant="outlined"
                      onClick={() => navigate(`/resources/${encodeURIComponent(tag)}`)}
                      sx={{ cursor: 'pointer' }}
                    />
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}
        </Box>
      </Box>
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
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">
          {t('pages.venueDetail.noPhotos', 'No photos available')}
        </Typography>
      </Box>
    );
  }
  return (
    <StaggerGrid
      sx={{
        gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
        gap: 2,
        mt: 1,
      }}
    >
      {venue.images.map((imageUrl, index) => (
        <Box
          key={index}
          sx={{
            aspectRatio: '1/1',
            borderRadius: 2,
            overflow: 'hidden',
            bgcolor: 'action.hover',
          }}
        >
          <Box
            component="img"
            src={imageUrl}
            alt={`${venue.name} - Image ${index + 1}`}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              '&:hover': { transform: 'scale(1.05)' },
              transition: 'transform 300ms',
              cursor: 'pointer',
            }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).src = '/placeholder.svg';
            }}
            onClick={() => window.open(imageUrl, '_blank')}
          />
        </Box>
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
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">
          {t('pages.venueDetail.noEvents', 'No upcoming events at this venue')}
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ mt: 1 }}>
      <VenueEvents
        venueId={venue.id}
        venueName={venue.name}
        events={venueEvents as Parameters<typeof VenueEvents>[0]['events']}
        compact={false}
      />
    </Box>
  );
}

interface VenueReviewsProps {
  reviews: VenueReview[];
}

export function VenueReviewsTab({ reviews }: VenueReviewsProps) {
  if (reviews.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">
          No reviews yet. Be the first to leave a review!
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
      {reviews.map((review) => (
        <Card key={review.id}>
          <CardContent>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                mb: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    bgcolor: 'action.hover',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                  }}
                >
                  {review.profiles?.display_name?.[0]?.toUpperCase() || 'U'}
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {review.profiles?.display_name || 'Anonymous'}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        style={{
                          width: 13,
                          height: 13,
                          fill: i < review.rating ? 'currentColor' : 'none',
                          // TODO(polish): no token match — star rating amber/gray
                          color: i < review.rating ? '#f59e0b' : '#d1d5db',
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {new Date(review.created_at).toLocaleDateString()}
              </Typography>
            </Box>
            {review.title && (
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                {review.title}
              </Typography>
            )}
            {review.content && (
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                {review.content}
              </Typography>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
