import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, Star, MapPin, Phone, Globe, Instagram, Mail, Clock, Wifi, Car, Accessibility } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { VenueEvents } from '@/components/venues/VenueEvents';
import { VenueCheckInButton } from '@/components/venues/VenueCheckInButton';
import { VenueRecentCheckins } from '@/components/venues/VenueRecentCheckins';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

type Venue = Database['public']['Tables']['venues']['Row'];
type VenueReview = Database['public']['Tables']['venue_reviews']['Row'] & {
  profiles: { display_name: string; avatar_url: string | null } | null;
};

export default function VenueDetail() {
  const { id } = useParams<{ id: string }>();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [reviews, setReviews] = useState<VenueReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkinRefresh, setCheckinRefresh] = useState(0);
  const { events } = useEvents();

  const venueEvents = events.filter(event => event.venue_id === id);

  useEffect(() => {
    if (!id) return;

    const fetchVenue = async () => {
      try {
        setLoading(true);

        // Fetch venue details
        const { data: venueData, error: venueError } = await supabase
          .from('venues')
          .select('*')
          .eq('id', id)
          .single();

        if (venueError) throw venueError;
        setVenue(venueData);

        // Fetch reviews with user profiles
        const { data: reviewsData, error: reviewsError } = await supabase
          .from('venue_reviews')
          .select(`
            *,
            profiles:user_id (
              display_name,
              avatar_url
            )
          `)
          .eq('venue_id', id)
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
  }, [id]);

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } }, animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
          <Box sx={{ height: 32, bgcolor: 'action.hover', borderRadius: 1, width: '33%', mb: 3 }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 4 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{ height: 256, bgcolor: 'action.hover', borderRadius: 1 }} />
              <Box sx={{ height: 192, bgcolor: 'action.hover', borderRadius: 1 }} />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{ height: 128, bgcolor: 'action.hover', borderRadius: 1 }} />
              <Box sx={{ height: 192, bgcolor: 'action.hover', borderRadius: 1 }} />
            </Box>
          </Box>
        </Box>
      </Container>
    );
  }

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
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;

  const getPriceRange = (range: number | null) => {
    if (!range) return '';
    return '$'.repeat(range);
  };

  const formatHours = (hours: any) => {
    if (!hours || typeof hours !== 'object') return 'Hours not available';

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return days.map((day, index) => (
      <Box key={day} sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>{dayNames[index]}</Typography>
        <Typography variant="body2" color="text.secondary">
          {hours[day] || 'Closed'}
        </Typography>
      </Box>
    ));
  };

  return (
    <Box sx={{ width: '100%', px: 2, py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Link to="/venues" style={{ display: 'inline-flex', alignItems: 'center', color: 'inherit', textDecoration: 'none', marginBottom: 16 }}>
          <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
          <Typography variant="body2" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>Back to Venues</Typography>
        </Link>

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { md: 'flex-start' }, justifyContent: { md: 'space-between' }, gap: 2 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>{venue.name}</Typography>
              {venue.verified && (
                <Badge variant="secondary">Verified</Badge>
              )}
              {venue.featured && (
                <Badge style={{ backgroundColor: 'rgba(var(--accent), 0.1)', color: 'var(--accent)' }}>Featured</Badge>
              )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <MapPin style={{ width: 16, height: 16 }} />
                <Typography variant="body2" color="text.secondary">{venue.address}, {venue.city}, {venue.state} {venue.postal_code}</Typography>
              </Box>
              {venue.price_range && (
                <Typography variant="body2" sx={{ fontWeight: 500, color: 'accent' }}>
                  {getPriceRange(venue.price_range)}
                </Typography>
              )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Badge variant="secondary">
                {venue.category}
              </Badge>
              {averageRating > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Star style={{ width: 16, height: 16, fill: 'currentColor', color: 'var(--accent)' }} />
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{averageRating.toFixed(1)}</Typography>
                  <Typography variant="body2" color="text.secondary">({reviews.length} reviews)</Typography>
                </Box>
              )}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <VenueCheckInButton
              venueId={venue.id}
              venueName={venue.name}
              venueLatitude={venue.latitude}
              venueLongitude={venue.longitude}
              onCheckInSuccess={() => setCheckinRefresh(prev => prev + 1)}
            />
            {venue.phone && (
              <Button variant="outline" size="sm">
                <Phone style={{ width: 16, height: 16, marginRight: 8 }} />
                Call
              </Button>
            )}
            {venue.website && (
              <Button variant="outline" size="sm">
                <Globe style={{ width: 16, height: 16, marginRight: 8 }} />
                Website
              </Button>
            )}
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 4 }}>
        {/* Main Content */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Description */}
          {venue.description && (
            <Card>
              <CardHeader>
                <CardTitle>About</CardTitle>
              </CardHeader>
              <CardContent>
                <Typography color="text.secondary">{venue.description}</Typography>
              </CardContent>
            </Card>
          )}

          {/* Venue Images */}
          {venue.images && venue.images.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Photos</CardTitle>
              </CardHeader>
              <CardContent>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>
                  {venue.images.map((imageUrl, index) => (
                    <Box key={index} sx={{ aspectRatio: '1/1', borderRadius: 2, overflow: 'hidden', bgcolor: 'action.hover' }}>
                      <Box
                        component="img"
                        src={imageUrl}
                        alt={`${venue.name} - Image ${index + 1}`}
                        sx={{ width: '100%', height: '100%', objectFit: 'cover', '&:hover': { transform: 'scale(1.05)' }, transition: 'transform 300ms', cursor: 'pointer' }}
                        onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                          const target = e.target as HTMLImageElement;
                          target.src = '/placeholder.svg';
                        }}
                        onClick={() => {
                          window.open(imageUrl, '_blank');
                        }}
                      />
                    </Box>
                  ))}
                </Box>
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
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 1.5 }}>
                  {venue.amenities.map((amenity, index) => (
                    <Box
                      component="button"
                      key={index}
                      sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' }, transition: 'background-color 200ms', cursor: 'pointer', border: 'none', background: 'none', textAlign: 'left' }}
                      onClick={() => {
                        navigator.clipboard.writeText(amenity);
                      }}
                      title={`Click to copy "${amenity}" to clipboard`}
                    >
                      {amenity === 'wifi' && <Wifi style={{ width: 16, height: 16, color: 'var(--primary)' }} />}
                      {amenity === 'parking' && <Car style={{ width: 16, height: 16, color: 'var(--primary)' }} />}
                      {amenity === 'wheelchair-accessible' && <Accessibility style={{ width: 16, height: 16, color: 'var(--primary)' }} />}
                      <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{amenity.replace('-', ' ')}</Typography>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Events */}
          {venueEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Events</CardTitle>
              </CardHeader>
              <CardContent>
                <VenueEvents
                  venueId={venue.id}
                  venueName={venue.name}
                  events={venueEvents}
                  compact={false}
                />
              </CardContent>
            </Card>
          )}

          {/* Reviews */}
          <Card>
            <CardHeader>
              <CardTitle>Reviews ({reviews.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {reviews.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {reviews.slice(0, 5).map((review) => (
                    <Box key={review.id} sx={{ borderBottom: 1, borderColor: 'divider', pb: 2, '&:last-child': { borderBottom: 0 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{ width: 32, height: 32, bgcolor: 'action.hover', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {review.profiles?.display_name?.[0] || 'U'}
                          </Box>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>{review.profiles?.display_name || 'Anonymous'}</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  style={{
                                    width: 12,
                                    height: 12,
                                    fill: i < review.rating ? 'currentColor' : 'none',
                                    color: i < review.rating ? 'var(--accent)' : 'var(--muted)',
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
                        <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>{review.title}</Typography>
                      )}
                      {review.content && (
                        <Typography variant="body2" color="text.secondary">{review.content}</Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>No reviews yet</Typography>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* Sidebar */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Recent Check-ins */}
          <VenueRecentCheckins
            venueId={venue.id}
            refreshTrigger={checkinRefresh}
          />

          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {venue.phone && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Phone style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
                  <Typography variant="body2">{venue.phone}</Typography>
                </Box>
              )}
              {venue.email && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Mail style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
                  <Typography variant="body2">{venue.email}</Typography>
                </Box>
              )}
              {venue.website && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Globe style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
                  <Typography
                    component="a"
                    href={venue.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="body2"
                    color="primary"
                    sx={{ '&:hover': { textDecoration: 'underline' } }}
                  >
                    Website
                  </Typography>
                </Box>
              )}
              {venue.instagram && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Instagram style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
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
                    <Badge key={index} variant="outline" style={{ fontSize: '0.75rem' }}>
                      {tag}
                    </Badge>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}
        </Box>
      </Box>
    </Box>
  );
}
