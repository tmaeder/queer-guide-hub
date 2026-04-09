import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import {
  MapPin,
  Globe,
  Landmark,
  Building,
  Calendar,
  ExternalLink,
  Heart,
  Image as ImageIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { PageLoading } from '@/components/ui/loading';
import { useToast } from '@/hooks/use-toast';
import { useFavorites } from '@/hooks/useFavorites';
import { supabase } from '@/integrations/supabase/client';
import { VenueCard } from '@/components/venues/VenueCard';
import { EventCard } from '@/components/events/EventCard';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { EntityMap } from '@/components/map/EntityMap';

type VillageWithRelations = {
  id: string;
  name: string;
  slug: string;
  city_id: string;
  country_id: string;
  description: string | null;
  history: string | null;
  image_url: string | null;
  images: string[] | null;
  latitude: number | null;
  longitude: number | null;
  boundaries: any | null;
  notable_landmarks: string[] | null;
  tags: string[] | null;
  website: string | null;
  featured: boolean | null;
  created_at: string;
  updated_at: string;
  cities: { id: string; name: string } | null;
  countries: { id: string; name: string; flag_emoji?: string } | null;
};

export default function QueerVillageDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const { toggleFavorite, isFavorited } = useFavorites('queer_village');
  const [village, setVillage] = useState<VillageWithRelations | null>(null);
  const [loading, setLoading] = useState(true);

  const cityName = village?.cities?.name;
  const { venues, loading: venuesLoading, fetchVenues } = useVenues(false);
  const { events, loading: eventsLoading, fetchEvents } = useEvents(false);

  useEffect(() => {
    fetchVenues({ city: cityName, limit: 8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityName]);

  useEffect(() => {
    fetchEvents({ city: cityName, limit: 8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityName]);

  useEffect(() => {
    if (slug) fetchVillage();
  }, [slug]);

  const fetchVillage = async () => {
    try {
      const { data, error } = await supabase
        .from('queer_villages')
        .select('*, cities:city_id(id, slug, name), countries:country_id(id, slug, name, flag_emoji)')
        .eq('slug', slug)
        .single();
      if (error) throw error;
      setVillage(data);
    } catch (err) {
      console.error('Error fetching village:', err);
      toast({
        title: 'Error',
        description: 'Failed to load village details',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFavoriteToggle = async () => {
    if (!village) return;
    try {
      await toggleFavorite(village.id);
      toast({
        title: isFavorited(village.id) ? 'Removed from favorites' : 'Added to favorites',
        description: `${village.name} ${isFavorited(village.id) ? 'removed from' : 'added to'} your favorites`,
      });
    } catch {
      toast({ title: 'Error', description: 'Failed to update favorites', variant: 'destructive' });
    }
  };

  if (loading) return <PageLoading text="Loading village details..." />;

  if (!village) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Box sx={{ maxWidth: 1200, mx: 'auto', px: 2, py: 4, textAlign: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
            Village Not Found
          </Typography>
          <Typography sx={{ color: 'text.secondary', mb: 3 }}>
            The queer village you're looking for doesn't exist.
          </Typography>
          <Link to="/villages" style={{ color: 'inherit', fontWeight: 500 }}>
            ← Back to Villages
          </Link>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1152, mx: 'auto', px: 2, py: 3 }}>
      {/* Breadcrumb */}
      <Box
        component="nav"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          fontSize: '0.875rem',
          color: 'text.secondary',
          mb: 2,
          flexWrap: 'wrap',
        }}
      >
        <Link to="/villages" style={{ color: 'inherit', textDecoration: 'none' }}>
          ← Villages
        </Link>
        <span>/</span>
        {village.countries && (
          <>
            <Link
              to={`/country/${village.countries.slug || village.countries.id}`}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {village.countries.name}
            </Link>
            <span>/</span>
          </>
        )}
        {village.cities && (
          <>
            <Link
              to={`/city/${village.cities.slug || village.cities.id}`}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {village.cities.name}
            </Link>
            <span>/</span>
          </>
        )}
        <Box component="span" sx={{ color: 'text.primary', fontWeight: 500 }}>
          {village.name}
        </Box>
      </Box>

      {/* Hero Image */}
      {village.image_url && (
        <Box
          sx={{
            position: 'relative',
            height: { xs: 200, md: 280 },
            borderRadius: 2,
            overflow: 'hidden',
            mb: 3,
          }}
        >
          <Box
            component="img"
            src={village.image_url}
            alt={village.name}
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          {village.featured && (
            <Badge
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                backgroundColor: 'hsl(var(--primary))',
                color: 'white',
              }}
            >
              Featured
            </Badge>
          )}
        </Box>
      )}

      {/* Title Row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          mb: 1,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography
            variant="h3"
            sx={{
              fontSize: { xs: '1.75rem', lg: '2.25rem' },
              fontWeight: 700,
              color: 'text.primary',
              mb: 0.5,
            }}
          >
            {village.countries?.flag_emoji && <>{village.countries.flag_emoji} </>}
            {village.name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
            <MapPin style={{ width: 16, height: 16 }} />
            <Typography sx={{ fontSize: '1.125rem' }}>
              {village.cities && (
                <Link
                  to={`/city/${village.cities.slug || village.cities.id}`}
                  style={{
                    color: 'inherit',
                    textDecoration: 'underline',
                    textUnderlineOffset: '2px',
                  }}
                >
                  {village.cities.name}
                </Link>
              )}
              {village.cities && village.countries && ', '}
              {village.countries && (
                <Link
                  to={`/country/${village.countries.slug || village.countries.id}`}
                  style={{
                    color: 'inherit',
                    textDecoration: 'underline',
                    textUnderlineOffset: '2px',
                  }}
                >
                  {village.countries.name}
                </Link>
              )}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, mt: 1, flexWrap: 'wrap' }}>
          <ReportButton
            contentType="queer_villages"
            contentId={village.id}
            contentName={village.name}
          />
          <AdminEditButton
            contentType="queer_villages"
            contentId={village.id}
            contentName={village.name}
            currentData={village as Record<string, unknown>}
            onSaved={() => window.location.reload()}
          />
          <Button variant="outline" size="sm" onClick={handleFavoriteToggle}>
            <Heart
              style={{
                height: 16,
                width: 16,
                marginRight: 6,
                ...(isFavorited(village.id) ? { fill: 'currentColor' } : {}),
              }}
            />
            {isFavorited(village.id) ? 'Favorited' : 'Favorite'}
          </Button>
          {village.website && (
            <Button variant="outline" size="sm" asChild>
              <a href={village.website} target="_blank" rel="noopener noreferrer">
                <ExternalLink style={{ height: 16, width: 16, marginRight: 6 }} />
                Website
              </a>
            </Button>
          )}
        </Box>
      </Box>

      {/* Tags */}
      {village.tags && village.tags.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
          {village.tags.map((tag, i) => (
            <Chip key={i} label={tag} size="small" variant="outlined" />
          ))}
        </Box>
      )}

      {/* Main Content */}
      <Card sx={{ borderColor: 'divider', boxShadow: 1 }}>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Tabs
            defaultValue="overview"
            style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
          >
            <TabsList
              style={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(5, 1fr)' }}
            >
              <TabsTrigger value="overview" style={{ fontSize: '0.875rem' }}>
                <Landmark style={{ height: 16, width: 16, marginRight: 6 }} />
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                  Overview
                </Box>
              </TabsTrigger>
              <TabsTrigger value="venues" style={{ fontSize: '0.875rem' }}>
                <Building style={{ height: 16, width: 16, marginRight: 6 }} />
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                  Venues
                </Box>
              </TabsTrigger>
              <TabsTrigger value="events" style={{ fontSize: '0.875rem' }}>
                <Calendar style={{ height: 16, width: 16, marginRight: 6 }} />
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                  Events
                </Box>
              </TabsTrigger>
              <TabsTrigger value="photos" style={{ fontSize: '0.875rem' }}>
                <ImageIcon style={{ height: 16, width: 16, marginRight: 6 }} />
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                  Photos
                </Box>
              </TabsTrigger>
              <TabsTrigger value="map" style={{ fontSize: '0.875rem' }}>
                <MapPin style={{ height: 16, width: 16, marginRight: 6 }} />
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                  Map
                </Box>
              </TabsTrigger>
            </TabsList>

            {/* OVERVIEW */}
            <TabsContent
              value="overview"
              style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 24 }}
            >
              <Box
                sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' }, gap: 3 }}
              >
                {/* Description */}
                <Card sx={{ borderColor: 'divider' }}>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Landmark style={{ height: 20, width: 20 }} />
                      About {village.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                      {village.description ||
                        `Discover ${village.name}, a vibrant LGBTQ+ neighborhood in ${village.cities?.name || 'the city'}.`}
                    </Typography>
                  </CardContent>
                </Card>

                {/* Notable Landmarks */}
                <Card sx={{ borderColor: 'divider' }}>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <MapPin style={{ height: 20, width: 20 }} />
                      Notable Landmarks
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {village.notable_landmarks && village.notable_landmarks.length > 0 ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {village.notable_landmarks.map((landmark, i) => (
                          <Box
                            key={i}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              p: 1.5,
                              borderRadius: 2,
                              bgcolor: 'action.hover',
                            }}
                          >
                            <Landmark
                              style={{ width: 16, height: 16, flexShrink: 0, color: '#777777' }}
                            />
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {landmark}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No landmarks listed yet.
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Box>

              {/* History */}
              {village.history && (
                <Card sx={{ borderColor: 'divider' }}>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Globe style={{ height: 20, width: 20 }} />
                      History
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Typography
                      sx={{ color: 'text.secondary', lineHeight: 1.7, whiteSpace: 'pre-line' }}
                    >
                      {village.history}
                    </Typography>
                  </CardContent>
                </Card>
              )}

              {/* Location Info */}
              {village.latitude && village.longitude && (
                <Card sx={{ borderColor: 'divider' }}>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <MapPin style={{ height: 20, width: 20 }} />
                      Location
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                    >
                      {village.latitude.toFixed(4)}, {village.longitude.toFixed(4)}
                    </Typography>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* VENUES */}
            <TabsContent value="venues" style={{ marginTop: 24 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Venues in {village.cities?.name || 'the area'}
              </Typography>
              {venuesLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                  <Typography color="text.secondary">Loading venues...</Typography>
                </Box>
              ) : venues.length > 0 ? (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                    gap: 2,
                  }}
                >
                  {venues.map((venue) => (
                    <VenueCard key={venue.id} venue={venue} />
                  ))}
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Building
                    style={{ height: 48, width: 48, color: '#999999', margin: '0 auto 16px' }}
                  />
                  <Typography variant="h6" color="text.secondary">
                    No venues found
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Check back later as we continue to add venues in this area.
                  </Typography>
                </Box>
              )}
            </TabsContent>

            {/* EVENTS */}
            <TabsContent value="events" style={{ marginTop: 24 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Events in {village.cities?.name || 'the area'}
              </Typography>
              {eventsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                  <Typography color="text.secondary">Loading events...</Typography>
                </Box>
              ) : events.length > 0 ? (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                    gap: 2,
                  }}
                >
                  {events.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Calendar
                    style={{ height: 48, width: 48, color: '#999999', margin: '0 auto 16px' }}
                  />
                  <Typography variant="h6" color="text.secondary">
                    No upcoming events
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Check back later for events in this area.
                  </Typography>
                </Box>
              )}
            </TabsContent>

            {/* PHOTOS */}
            <TabsContent value="photos" style={{ marginTop: 24 }}>
              {village.images && village.images.length > 0 ? (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                    gap: 2,
                  }}
                >
                  {village.images.map((img, i) => (
                    <Box
                      key={i}
                      sx={{
                        borderRadius: 2,
                        overflow: 'hidden',
                        height: 200,
                        bgcolor: 'action.hover',
                      }}
                    >
                      <img
                        src={img}
                        alt={`${village.name} - Photo ${i + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        loading="lazy"
                      />
                    </Box>
                  ))}
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <ImageIcon
                    style={{ height: 48, width: 48, color: '#999999', margin: '0 auto 16px' }}
                  />
                  <Typography variant="h6" color="text.secondary">
                    No photos yet
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Photos will be added soon.
                  </Typography>
                </Box>
              )}
            </TabsContent>

            {/* MAP */}
            <TabsContent value="map">
              {typeof village.latitude === 'number' && typeof village.longitude === 'number' && (
                <EntityMap
                  center={[Number(village.longitude), Number(village.latitude)]}
                  zoom={14}
                  height={400}
                  markers={[
                    {
                      id: village.id,
                      lat: Number(village.latitude),
                      lng: Number(village.longitude),
                      name: village.name ?? 'Village',
                      type: 'neighbourhoods',
                      primary: true,
                    },
                    ...(venues as any[]).filter((v: any) => typeof v.latitude === 'number' && typeof v.longitude === 'number').map((v: any) => ({
                      id: v.id,
                      lat: Number(v.latitude),
                      lng: Number(v.longitude),
                      name: v.name ?? 'Venue',
                      subtitle: v.category,
                      type: 'venues' as const,
                      linkTo: `/venues/${v.slug || v.id}`,
                    })),
                  ]}
                />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </Box>
  );
}
