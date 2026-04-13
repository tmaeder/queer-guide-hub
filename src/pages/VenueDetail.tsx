import { useParams, Link } from 'react-router';
import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
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
  Navigation2,
  RefreshCw,
  MoreVertical,
  Share2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FavoriteButton } from '@/components/ui/favorite-button';
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
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MuiMenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';

type Venue = Database['public']['Tables']['venues']['Row'];
type VenueReview = Database['public']['Tables']['venue_reviews']['Row'] & {
  profiles: { display_name: string; avatar_url: string | null } | null;
};

type VenueWithRelations = Venue & {
  cities?: { id: string; name: string; slug?: string } | null;
  countries?: {
    id: string;
    name: string;
    slug?: string;
    equality_score: number | null;
    lgbti_criminalization: Record<string, unknown> | null;
  } | null;
};

export default function VenueDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [venue, setVenue] = useState<VenueWithRelations | null>(null);
  const [reviews, setReviews] = useState<VenueReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [checkinRefresh, setCheckinRefresh] = useState(0);
  const [addToTripOpen, setAddToTripOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const { data: tripStatus } = useEntityTripStatus('venue', venue?.id);
  const { events } = useEvents();

  const venueEvents = events.filter((event) => event.venue_id === venue?.id);

  const fetchVenue = async () => {
    if (!slug) return;
    try {
      setLoading(true);
      setFetchError(false);

      const selectFields = '*, cities:city_id(id, slug, name), countries:country_id(id, slug, name, equality_score, lgbti_criminalization)';
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
        .select('*, profiles:user_id (display_name, avatar_url)')
        .eq('venue_id', venueData.id)
        .order('created_at', { ascending: false });

      if (reviewsError) throw reviewsError;
      setReviews(reviewsData || []);
    } catch (_error) {
      setFetchError(true);
      toast({ title: 'Error', description: 'Failed to load venue details.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVenue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Loading state
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Box
          sx={{
            '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        >
          <Box sx={{ height: 20, bgcolor: 'action.hover', borderRadius: 1, width: '30%', mb: 2 }} />
          <Box sx={{ height: 120, bgcolor: 'action.hover', borderRadius: 2, mb: 2 }} />
          <Box sx={{ height: 28, bgcolor: 'action.hover', borderRadius: 1, width: '50%', mb: 1.5 }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 2.5 }}>
            <Box sx={{ height: 200, bgcolor: 'action.hover', borderRadius: 2 }} />
            <Box sx={{ height: 160, bgcolor: 'action.hover', borderRadius: 2 }} />
          </Box>
        </Box>
      </Container>
    );
  }

  // Error state
  if (fetchError && !venue) {
    return (
      <Container maxWidth="lg" sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Failed to Load</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Could not load venue details. Check your connection and try again.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
          <Button onClick={() => fetchVenue()}>
            <RefreshCw style={{ width: 16, height: 16, marginRight: 8 }} />
            Try Again
          </Button>
          <Link to="/venues">
            <Button variant="outline">
              <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
              Back to Venues
            </Button>
          </Link>
        </Box>
      </Container>
    );
  }

  // Not found
  if (!venue) {
    return (
      <Container maxWidth="lg" sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Venue Not Found</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>The venue you're looking for doesn't exist.</Typography>
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
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  const getPriceRange = (range: number | null) => (range ? '$'.repeat(range) : '');

  const formatHours = (hours: Record<string, unknown>) => {
    if (!hours || typeof hours !== 'object') return null;
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map((day, i) => (
      <Box key={day} sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>{dayNames[i]}</Typography>
        <Typography variant="body2" color="text.secondary">{(hours[day] as string) || 'Closed'}</Typography>
      </Box>
    ));
  };

  const heroImage = venue.images?.[0] || null;
  const cityName = venue.cities?.name || venue.city;
  const countryName = venue.countries?.name || venue.country;
  const cityLink = venue.cities?.id ? `/city/${venue.cities.slug || venue.cities.id}` : null;
  const countryLink = venue.countries?.id ? `/country/${venue.countries.slug || venue.countries.id}` : null;
  const hasCoords = typeof venue.latitude === 'number' && typeof venue.longitude === 'number';
  const directionsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`
    : null;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 3 } }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5, flexWrap: 'wrap' }}>
        <Link to="/venues" style={{ display: 'inline-flex', alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
          <ArrowLeft style={{ width: 14, height: 14, marginRight: 4 }} />
          <Typography variant="caption" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>Venues</Typography>
        </Link>
        {countryName && (
          <>
            <ChevronRight style={{ width: 12, height: 12, color: '#9ca3af' }} />
            {countryLink ? (
              <Link to={countryLink} style={{ textDecoration: 'none' }}>
                <Typography variant="caption" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>{countryName}</Typography>
              </Link>
            ) : (
              <Typography variant="caption" color="text.secondary">{countryName}</Typography>
            )}
          </>
        )}
        {cityName && (
          <>
            <ChevronRight style={{ width: 12, height: 12, color: '#9ca3af' }} />
            {cityLink ? (
              <Link to={cityLink} style={{ textDecoration: 'none' }}>
                <Typography variant="caption" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>{cityName}</Typography>
              </Link>
            ) : (
              <Typography variant="caption" color="text.secondary">{cityName}</Typography>
            )}
          </>
        )}
      </Box>

      {/* Hero Image */}
      {heroImage && (
        <Box
          sx={{
            width: '100%',
            height: { xs: 120, md: 140 },
            borderRadius: 2,
            overflow: 'hidden',
            mb: 2,
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

      {/* Safety Alert */}
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
          gap: 1.5,
          mb: 2.5,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
            {venue.logo_url && (
              <Box
                component="img"
                src={venue.logo_url}
                alt=""
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '8px',
                  objectFit: 'contain',
                  border: '1px solid',
                  borderColor: 'divider',
                  p: '2px',
                  flexShrink: 0,
                }}
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{venue.name}</Typography>
            {venue.category && (
              <Badge variant="secondary" sx={{ fontSize: '0.7rem', textTransform: 'capitalize' }}>
                {venue.category}
              </Badge>
            )}
            {venue.verified && <Badge variant="secondary">Verified</Badge>}
            {venue.price_range ? (
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                {getPriceRange(venue.price_range)}
              </Typography>
            ) : null}
            {averageRating > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <Star style={{ width: 14, height: 14, fill: '#f59e0b', color: '#f59e0b' }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {averageRating.toFixed(1)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ({reviews.length})
                </Typography>
              </Box>
            )}
            {venue.countries?.equality_score != null && (
              <EqualityScoreBadge score={venue.countries.equality_score} size="sm" />
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <MapPin style={{ width: 13, height: 13, color: '#9ca3af', flexShrink: 0 }} />
            <Typography variant="body2" color="text.secondary">
              {cityLink ? (
                <Link to={cityLink} style={{ color: 'inherit', textDecoration: 'none' }}>
                  <Typography component="span" variant="body2" sx={{ '&:hover': { color: 'primary.main' } }}>{cityName}</Typography>
                </Link>
              ) : cityName}
              {countryName && (
                <>
                  {', '}
                  {countryLink ? (
                    <Link to={countryLink} style={{ color: 'inherit', textDecoration: 'none' }}>
                      <Typography component="span" variant="body2" sx={{ '&:hover': { color: 'primary.main' } }}>{countryName}</Typography>
                    </Link>
                  ) : countryName}
                </>
              )}
            </Typography>
          </Box>
        </Box>

        {/* Actions: primary visible, secondary in overflow */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          <FavoriteButton itemId={venue.id} type="venue" size="md" />
          <VenueCheckInButton
            venueId={venue.id}
            venueName={venue.name}
            venueLatitude={venue.latitude}
            venueLongitude={venue.longitude}
            onCheckInSuccess={() => setCheckinRefresh((prev) => prev + 1)}
          />
          {directionsUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                <Navigation2 style={{ width: 14, height: 14, marginRight: 6 }} />
                Directions
              </a>
            </Button>
          )}
          {tripStatus?.isInTrip && (
            <Badge variant="secondary" sx={{ fontSize: '0.7rem' }}>
              In {tripStatus.count} trip{tripStatus.count !== 1 ? 's' : ''}
            </Badge>
          )}
          <IconButton
            size="small"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}
          >
            <MoreVertical style={{ width: 16, height: 16 }} />
          </IconButton>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
          >
            <MuiMenuItem onClick={() => { setMenuAnchor(null); setAddToTripOpen(true); }}>
              <ListItemIcon><Luggage style={{ width: 16, height: 16 }} /></ListItemIcon>
              <ListItemText>Add to Trip</ListItemText>
            </MuiMenuItem>
            {venue.phone && (
              <MuiMenuItem onClick={() => { setMenuAnchor(null); window.open(`tel:${venue.phone}`); }}>
                <ListItemIcon><Phone style={{ width: 16, height: 16 }} /></ListItemIcon>
                <ListItemText>Call</ListItemText>
              </MuiMenuItem>
            )}
            {venue.website && (
              <MuiMenuItem onClick={() => { setMenuAnchor(null); window.open(venue.website!, '_blank'); }}>
                <ListItemIcon><Globe style={{ width: 16, height: 16 }} /></ListItemIcon>
                <ListItemText>Website</ListItemText>
              </MuiMenuItem>
            )}
            {venue.instagram && (
              <MuiMenuItem onClick={() => { setMenuAnchor(null); window.open(`https://instagram.com/${venue.instagram}`, '_blank'); }}>
                <ListItemIcon><Instagram style={{ width: 16, height: 16 }} /></ListItemIcon>
                <ListItemText>@{venue.instagram}</ListItemText>
              </MuiMenuItem>
            )}
            <MuiMenuItem onClick={() => { setMenuAnchor(null); navigator.clipboard.writeText(`${window.location.origin}/venues/${venue.slug}`); toast({ title: 'Link copied' }); }}>
              <ListItemIcon><Share2 style={{ width: 16, height: 16 }} /></ListItemIcon>
              <ListItemText>Share</ListItemText>
            </MuiMenuItem>
          </Menu>
          <AdminEditButton
            contentType="venues"
            contentId={venue.id}
            contentName={venue.name}
            currentData={venue as Record<string, unknown>}
            onSaved={() => window.location.reload()}
          />
        </Box>
      </Box>

      {/* Main Content — no tabs, single scroll */}
      <ScrollReveal direction="up">
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' },
            gap: 2.5,
          }}
        >
          {/* Left Column */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Description */}
            {venue.description && (
              <Card>
                <CardHeader><CardTitle>About</CardTitle></CardHeader>
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
                <CardHeader><CardTitle>Amenities</CardTitle></CardHeader>
                <CardContent>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 1 }}>
                    {venue.amenities.map((amenity, i) => (
                      <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 0.75, borderRadius: 1 }}>
                        {amenity === 'wifi' && <Wifi style={{ width: 15, height: 15 }} />}
                        {amenity === 'parking' && <Car style={{ width: 15, height: 15 }} />}
                        {amenity === 'wheelchair-accessible' && <Accessibility style={{ width: 15, height: 15 }} />}
                        {!['wifi', 'parking', 'wheelchair-accessible'].includes(amenity) && (
                          <Box sx={{ width: 15, height: 15, borderRadius: '50%', bgcolor: 'action.disabled', flexShrink: 0 }} />
                        )}
                        <Typography variant="body2" sx={{ textTransform: 'capitalize', fontSize: '0.8rem' }}>
                          {amenity.replace(/-/g, ' ')}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* Check-ins (mobile) */}
            <Box sx={{ display: { xs: 'block', lg: 'none' } }}>
              <VenueRecentCheckins venueId={venue.id} refreshTrigger={checkinRefresh} />
            </Box>
          </Box>

          {/* Right Column (Sidebar) */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Map */}
            {hasCoords && (
              <ErrorBoundary section="venue-map" fallback={null}>
                <Card>
                  <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                    <EntityMap
                      center={[Number(venue.longitude), Number(venue.latitude)]}
                      zoom={15}
                      height={180}
                      markers={[{
                        id: venue.id,
                        lat: Number(venue.latitude),
                        lng: Number(venue.longitude),
                        name: venue.name ?? 'Venue',
                        type: 'venues',
                        primary: true,
                      }]}
                    />
                  </CardContent>
                </Card>
              </ErrorBoundary>
            )}

            {/* Check-ins (desktop) */}
            <Box sx={{ display: { xs: 'none', lg: 'block' } }}>
              <VenueRecentCheckins venueId={venue.id} refreshTrigger={checkinRefresh} />
            </Box>

            {/* Contact & Hours — merged */}
            <Card>
              <CardHeader><CardTitle>Contact & Hours</CardTitle></CardHeader>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {/* Address */}
                {venue.address && (
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <MapPin style={{ width: 15, height: 15, color: 'hsl(var(--muted-foreground))', flexShrink: 0, marginTop: 2 }} />
                    <Typography variant="body2">
                      {venue.address}{venue.postal_code ? `, ${venue.postal_code}` : ''}
                    </Typography>
                  </Box>
                )}

                {/* Quick contact icons */}
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {venue.phone && (
                    <IconButton size="small" component="a" href={`tel:${venue.phone}`} sx={{ border: 1, borderColor: 'divider' }}>
                      <Phone style={{ width: 15, height: 15 }} />
                    </IconButton>
                  )}
                  {venue.email && (
                    <IconButton size="small" component="a" href={`mailto:${venue.email}`} sx={{ border: 1, borderColor: 'divider' }}>
                      <Mail style={{ width: 15, height: 15 }} />
                    </IconButton>
                  )}
                  {venue.website && (
                    <IconButton size="small" component="a" href={venue.website} target="_blank" rel="noopener noreferrer" sx={{ border: 1, borderColor: 'divider' }}>
                      <Globe style={{ width: 15, height: 15 }} />
                    </IconButton>
                  )}
                  {venue.instagram && (
                    <IconButton size="small" component="a" href={`https://instagram.com/${venue.instagram}`} target="_blank" rel="noopener noreferrer" sx={{ border: 1, borderColor: 'divider' }}>
                      <Instagram style={{ width: 15, height: 15 }} />
                    </IconButton>
                  )}
                </Box>

                {/* Hours */}
                {venue.hours && (
                  <>
                    <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5, mt: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                        <Clock style={{ width: 14, height: 14 }} />
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Hours</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {formatHours(venue.hours)}
                      </Box>
                    </Box>
                  </>
                )}
              </CardContent>
            </Card>
          </Box>
        </Box>
      </ScrollReveal>

      {/* Photos Section (below main grid, if images exist) */}
      {venue.images && venue.images.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            Photos ({venue.images.length})
          </Typography>
          <StaggerGrid
            sx={{
              gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
              gap: 1.5,
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
                  alt={`${venue.name} - ${index + 1}`}
                  sx={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    cursor: 'pointer',
                    transition: 'transform 200ms',
                    '&:hover': { transform: 'scale(1.03)' },
                  }}
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    (e.target as HTMLImageElement).src = '/placeholder.svg';
                  }}
                  onClick={() => window.open(imageUrl, '_blank')}
                />
              </Box>
            ))}
          </StaggerGrid>
        </Box>
      )}

      {/* Events Section */}
      {venueEvents.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            Events ({venueEvents.length})
          </Typography>
          <VenueEvents
            venueId={venue.id}
            venueName={venue.name}
            events={venueEvents}
            compact={false}
          />
        </Box>
      )}

      {/* Reviews Section */}
      <Box sx={{ mt: 4, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          Reviews ({reviews.length})
        </Typography>
        {reviews.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {reviews.map((review) => (
              <Card key={review.id}>
                <CardContent sx={{ pt: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          bgcolor: 'action.hover',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                        }}
                      >
                        {review.profiles?.display_name?.[0]?.toUpperCase() || 'U'}
                      </Box>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                          {review.profiles?.display_name || 'Anonymous'}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              style={{
                                width: 12,
                                height: 12,
                                fill: i < review.rating ? '#f59e0b' : 'none',
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
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{review.title}</Typography>
                  )}
                  {review.content && (
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>{review.content}</Typography>
                  )}
                </CardContent>
              </Card>
            ))}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No reviews yet. Be the first to leave a review!
          </Typography>
        )}
      </Box>

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
