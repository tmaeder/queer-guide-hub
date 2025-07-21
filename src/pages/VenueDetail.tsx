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
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="h-64 bg-muted rounded"></div>
              <div className="h-48 bg-muted rounded"></div>
            </div>
            <div className="space-y-6">
              <div className="h-32 bg-muted rounded"></div>
              <div className="h-48 bg-muted rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Venue Not Found</h1>
        <p className="text-muted-foreground mb-6">The venue you're looking for doesn't exist.</p>
        <Link to="/venues">
          <Button>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Venues
          </Button>
        </Link>
      </div>
    );
  }

  const averageRating = reviews.length 
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;

  const getPriceRange = (range: number | null) => {
    if (!range) return '';
    return '$'.repeat(range);
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      bar: 'bg-primary/10 text-primary',
      restaurant: 'bg-accent/10 text-accent',
      cafe: 'bg-secondary/10 text-secondary',
      club: 'bg-destructive/10 text-destructive',
      hotel: 'bg-muted-foreground/10 text-muted-foreground',
    };
    return colors[category] || 'bg-muted/10 text-muted-foreground';
  };

  const formatHours = (hours: any) => {
    if (!hours || typeof hours !== 'object') return 'Hours not available';
    
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    
    return days.map((day, index) => (
      <div key={day} className="flex justify-between text-sm">
        <span className="font-medium">{dayNames[index]}</span>
        <span className="text-muted-foreground">
          {hours[day] || 'Closed'}
        </span>
      </div>
    ));
  };

  return (
    <div className="w-full px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link to="/venues" className="inline-flex items-center text-muted-foreground hover:text-primary mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Venues
        </Link>
        
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{venue.name}</h1>
              {venue.verified && (
                <Badge variant="secondary">Verified</Badge>
              )}
              {venue.featured && (
                <Badge className="bg-accent/10 text-accent">Featured</Badge>
              )}
            </div>
            
            <div className="flex items-center gap-4 text-muted-foreground mb-3">
              <div className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                <span>{venue.address}, {venue.city}, {venue.state} {venue.postal_code}</span>
              </div>
              {venue.price_range && (
                <span className="font-medium text-accent">
                  {getPriceRange(venue.price_range)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Badge className={getCategoryColor(venue.category)}>
                {venue.category}
              </Badge>
              {averageRating > 0 && (
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-current text-accent" />
                  <span className="font-medium">{averageRating.toFixed(1)}</span>
                  <span className="text-muted-foreground">({reviews.length} reviews)</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <VenueCheckInButton
              venueId={venue.id}
              venueName={venue.name}
              venueLatitude={venue.latitude}
              venueLongitude={venue.longitude}
              onCheckInSuccess={() => setCheckinRefresh(prev => prev + 1)}
            />
            {venue.phone && (
              <Button variant="outline" size="sm">
                <Phone className="h-4 w-4 mr-2" />
                Call
              </Button>
            )}
            {venue.website && (
              <Button variant="outline" size="sm">
                <Globe className="h-4 w-4 mr-2" />
                Website
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          {venue.description && (
            <Card>
              <CardHeader>
                <CardTitle>About</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{venue.description}</p>
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {venue.images.map((imageUrl, index) => (
                    <div key={index} className="aspect-square rounded-lg overflow-hidden bg-muted">
                      <img
                        src={imageUrl}
                        alt={`${venue.name} - Image ${index + 1}`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300 cursor-pointer"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = '/placeholder.svg';
                        }}
                        onClick={() => {
                          // Open image in new tab for full view
                          window.open(imageUrl, '_blank');
                        }}
                      />
                    </div>
                  ))}
                </div>
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
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {venue.amenities.map((amenity, index) => (
                    <button 
                      key={index} 
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => {
                        navigator.clipboard.writeText(amenity);
                        // You could add a toast notification here
                      }}
                      title={`Click to copy "${amenity}" to clipboard`}
                    >
                      {amenity === 'wifi' && <Wifi className="h-4 w-4 text-primary" />}
                      {amenity === 'parking' && <Car className="h-4 w-4 text-primary" />}
                      {amenity === 'wheelchair-accessible' && <Accessibility className="h-4 w-4 text-primary" />}
                      <span className="text-sm capitalize">{amenity.replace('-', ' ')}</span>
                    </button>
                  ))}
                </div>
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
                <div className="space-y-4">
                  {reviews.slice(0, 5).map((review) => (
                    <div key={review.id} className="border-b pb-4 last:border-b-0">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                            {review.profiles?.display_name?.[0] || 'U'}
                          </div>
                          <div>
                            <p className="font-medium">{review.profiles?.display_name || 'Anonymous'}</p>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  className={`h-3 w-3 ${
                                    i < review.rating ? 'fill-current text-accent' : 'text-muted'
                                  }`}
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
                        <h4 className="font-medium mb-1">{review.title}</h4>
                      )}
                      {review.content && (
                        <p className="text-sm text-muted-foreground">{review.content}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">No reviews yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
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
            <CardContent className="space-y-3">
              {venue.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{venue.phone}</span>
                </div>
              )}
              {venue.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{venue.email}</span>
                </div>
              )}
              {venue.website && (
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <a href={venue.website} target="_blank" rel="noopener noreferrer" 
                     className="text-sm text-primary hover:underline">
                    Website
                  </a>
                </div>
              )}
              {venue.instagram && (
                <div className="flex items-center gap-3">
                  <Instagram className="h-4 w-4 text-muted-foreground" />
                  <a href={`https://instagram.com/${venue.instagram}`} target="_blank" rel="noopener noreferrer"
                     className="text-sm text-primary hover:underline">
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
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Hours
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
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
                <div className="flex flex-wrap gap-2">
                  {venue.tags.map((tag, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}