import { useParams, Link } from 'react-router';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
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
  ChevronRight,
  Luggage,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { VenueEvents } from '@/components/venues/VenueEvents';
import { VenueCheckInButton } from '@/components/venues/VenueCheckInButton';
import { VenueRecentCheckins } from '@/components/venues/VenueRecentCheckins';
import { useEvents } from '@/hooks/useEvents';
import { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import EqualityScoreBadge from '@/components/country/EqualityScoreBadge';
import { EntityMap } from '@/components/map/EntityMap';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import Chip from '@mui/material/Chip';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';

type Venue = Database['public']['Tables']['venues']['Row'];
type VenueReview = Database['public']['Tables']['venue_reviews']['Row'] & {
  profiles: { display_name: string; avatar_url: string | null } | null;
};

type VenueWithRelations = Venue & {
  cities?: { id: string; name: string } | null;
  countries?: {
    id: string;
    name: string;
    equality_score: number | null;
    lgbti_criminalization: Record<string, any> | null;
  } | null;
};

export default function VenueDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [venue, setVenue] = useState<VenueWithRelations | null>(null);
  const [reviews, setReviews] = useState<VenueReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkinRefresh, setCheckinRefresh] = useState(0);
  const [addToTripOpen, setAddToTripOpen] = useState(false);
  const { data: tripStatus } = useEntityTripStatus('venue', venue?.id);
  const { events } = useEvents();

  const venueEvents = events.filter((event) => event.venue_id === venue?.id);

  useEffect(() => {
    if (!slug) return;

    const fetchVenue = async () => {
      try {
        setLoading(true);

        // Try slug first, fall back to ID for backwards compatibility
        const selectFields = '*, cities:city_id(id, name), countries:country_id(id, name, equality_score, lgbti_criminalization)';
        let { data: venueData, error: venueError } = await supabase
          .from('venues')
          .select(selectFields)
          .eq('slug', slug)
          .single();

        if (venueError && /uuid|invalid|no rows/i.test(venueError.message || '')) {
          const fallback = await supabase.from('venues').select(selectFields).eq('id', slug).single();
          venueData = fallback.data;
          venueError = fallback.error;
        }

        if (venueError) throw venueError;
        setVenue(venueData);

        const { data: reviewsData, error: reviewsError } = await supabase
          .from('venue_reviews')
          .select(
            `
            *,
            profiles:user_id (
              display_name,
              avatar_url
            )
          `,
          )
          .eq('venue_id', venueData.id)
          .order('created_at', { ascending: false });

        if (reviewsError) throw reviewsError;
        setReviews(reviewsData || []);
      } catch (error) {
        console.error('Error fetching venue:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchVenue();
  }, [slug]);

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box
          sx={{
            '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        >
          <Box sx={{ height: 24, bgcolor: 'action.hover', borderRadius: 1, width: '40%', mb: 2 }} />
          <Box sx={{ height: 192, bgcolor: 'action.hover', borderRadius: 3, mb: 3 }} />
          <Box sx={{ height: 32, bgcolor: 'action.hover', borderRadius: 1, width: '60%', mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
            {[1, 2, 3, 4].map((i) => (
              <Box
                key={i}
                sx={{ height: 32, width: 80, bgcolor: 'action.hover', borderRadius: 4 }}
              />
            ))}
          </Box>
          <Box sx={{ height: 40, bgcolor: 'action.hover', borderRadius: 1, mb: 3 }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 4 }}>
            <Box sx={{ height: 256, bgcolor: 'action.hover', borderRadius: 2 }} />
            <Box sx={{ height: 192, bgcolor: 'action.hover', borderRadius: 2 }} />
          </Box>
        </Box>
      </Container>
    );
  }

  if (!venue) {
    return (
      <Container maxWidth="lg" sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          Venue Not Found
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          The venue you're looking for doesn't exist.
        </Typography>
        <Link to="/venues">
          <Button>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back to Venues
          </Button>
        </Link>
      </Container>
    );
  }

  const averageRating = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;

  const getPriceRange = (range: number | null) => {
    if (!range) return '';
    return '$'.repeat(range);
  };

  const formatHours = (hours: any) => {
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
          {hours[day] || 'Closed'}
        </Typography>
      </Box>
    ));
  };

  const heroImage = venue.images && venue.images.length > 0 ? venue.images[0] : null;
  const remainingImages =
    venue.images && venue.images.length > 1 ? venue.images.slice(1) : venue.images || [];

  const cityName = venue.cities?.name || venue.city;
  const countryName = venue.countries?.name || venue.country;
  const cityLink = venue.cities?.id ? `/city/${venue.cities.id}` : null;
  const countryLink = venue.countries?.id ? `/country/${venue.countries.id}` : null;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2, flexWrap: 'wrap' }}>
        <Link
          to="/venues"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            color: 'inherit',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft style={{ width: 14, height: 14, marginRight: 4 }} />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ '&:hover': { color: 'primary.main' } }}
          >
            Venues
          </Typography>
        </Link>
        {countryName && (
          <>
            <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
            {countryLink ? (
              <Link to={countryLink} style={{ textDecoration: 'none' }}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ '&:hover': { color: 'primary.main' } }}
                >
                  {countryName}
                </Typography>
              </Link>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {countryName}
              </Typography>
            )}
          </>
        )}
        {cityName && (
          <>
            <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
            {cityLink ? (
              <Link to={cityLink} style={{ textDecoration: 'none' }}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ '&:hover': { color: 'primary.main' } }}
                >
                  {cityName}
                </Typography>
              </Link>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {cityName}
              </Typography>
            )}
          </>
        )}
        <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {venue.name}
        </Typography>
      </Box>

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
                  border: '1px solid',
                  borderColor: 'divider',
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
            {venue.verified && <Badge variant="secondary">Verified</Badge>}
            {venue.featured && <Badge>Featured</Badge>}
            {venue.countries?.equality_score != null && (
              <EqualityScoreBadge score={venue.countries.equality_score} size="sm" />
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            <MapPin style={{ width: 14, height: 14, color: '#9ca3af', flexShrink: 0 }} />
            <Typography variant="body2" color="text.secondary">
              {cityLink ? (
                <Link to={cityLink} style={{ color: 'inherit', textDecoration: 'none' }}>
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{ '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}
                  >
                    {cityName}
                  </Typography>
                </Link>
              ) : (
                cityName
              )}
              {countryName && (
                <>
                  {', '}
                  {countryLink ? (
                    <Link to={countryLink} style={{ color: 'inherit', textDecoration: 'none' }}>
                      <Typography
                        component="span"
                        variant="body2"
                        sx={{ '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}
                      >
                        {countryName}
                      </Typography>
                    </Link>
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
          <Button variant="outline" size="sm" onClick={() => setAddToTripOpen(true)}>
            <Luggage style={{ width: 14, height: 14, marginRight: 6 }} />
            Add to Trip
          </Button>
          {tripStatus?.isInTrip && (
            <Badge variant="secondary" sx={{ fontSize: '0.75rem' }}>
              In {tripStatus.count} trip{tripStatus.count !== 1 ? 's' : ''}
            </Badge>
          )}
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
            onCheckInSuccess={() => setCheckinRefresh((prev) => prev + 1)}
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
            label={`${averageRating.toFixed(1)} (${reviews.length} review${reviews.length !== 1 ? 's' : ''})`}
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

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {(remainingImages.length > 0 || heroImage) && (
            <TabsTrigger value="photos">
              Photos {venue.images && venue.images.length > 0 ? `(${venue.images.length})` : ''}
            </TabsTrigger>
          )}
          {venueEvents.length > 0 && (
            <TabsTrigger value="events">Events ({venueEvents.length})</TabsTrigger>
          )}
          <TabsTrigger value="reviews">Reviews ({reviews.length})</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
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
                    <CardTitle>About</CardTitle>
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
                    <CardTitle>Amenities</CardTitle>
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
                  <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
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
                  <CardTitle>Contact</CardTitle>
                </CardHeader>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {venue.address && (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                      <MapPin
                        style={{
                          width: 16,
                          height: 16,
                          color: '#999999',
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      />
                      <Typography variant="body2">
                        {venue.address}
                        {venue.postal_code ? `, ${venue.postal_code}` : ''}
                      </Typography>
                    </Box>
                  )}
                  {venue.phone && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Phone style={{ width: 16, height: 16, color: '#999999' }} />
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
                      <Mail style={{ width: 16, height: 16, color: '#999999' }} />
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
                      <Globe style={{ width: 16, height: 16, color: '#999999' }} />
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
                      <Instagram style={{ width: 16, height: 16, color: '#999999' }} />
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
                  <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {formatHours(venue.hours)}
                  </CardContent>
                </Card>
              )}

              {/* Tags */}
              {venue.tags && venue.tags.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Tags</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {venue.tags.map((tag, index) => (
                        <Chip key={index} label={tag} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Box>
          </Box>
          </ScrollReveal>
        </TabsContent>

        {/* Photos Tab */}
        <TabsContent value="photos">
          {venue.images && venue.images.length > 0 ? (
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
          ) : (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography color="text.secondary">No photos available</Typography>
            </Box>
          )}
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events">
          {venueEvents.length > 0 ? (
            <Box sx={{ mt: 1 }}>
              <VenueEvents
                venueId={venue.id}
                venueName={venue.name}
                events={venueEvents}
                compact={false}
              />
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography color="text.secondary">No upcoming events at this venue</Typography>
            </Box>
          )}
        </TabsContent>

        {/* Reviews Tab */}
        <TabsContent value="reviews">
          {reviews.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              {reviews.map((review) => (
                <Card key={review.id}>
                  <CardContent sx={{ pt: 2.5 }}>
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
          ) : (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography color="text.secondary">
                No reviews yet. Be the first to leave a review!
              </Typography>
            </Box>
          )}
        </TabsContent>
      </Tabs>

      <AddToTripDialog
        open={addToTripOpen}
        onClose={() => setAddToTripOpen(false)}
        entity={{
          type: 'venue',
          id: venue.id,
          name: venue.name,
          latitude: venue.latitude,
          longitude: venue.longitude,
          city_id: venue.city_id,
          country_id: venue.country_id,
          address: venue.address,
          category: venue.category,
        }}
      />
    </Container>
  );
}
