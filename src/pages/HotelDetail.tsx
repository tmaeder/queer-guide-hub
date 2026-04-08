import { useParams, Link } from 'react-router';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Star,
  MapPin,
  Phone,
  Globe,
  Mail,
  DollarSign,
  ExternalLink,
  Wifi,
  Shield,
  Luggage,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';

type Hotel = Database['public']['Tables']['hotels']['Row'];

type HotelWithRelations = Hotel & {
  cities?: { id: string; name: string } | null;
  countries?: { id: string; name: string } | null;
};

const TYPE_LABELS: Record<string, string> = {
  hotel: 'Hotel',
  bnb: 'B&B',
  hostel: 'Hostel',
  guesthouse: 'Guesthouse',
  apartment: 'Apartment',
  resort: 'Resort',
  other: 'Other',
};

export default function HotelDetail() {
  const { id } = useParams<{ id: string }>();
  const [hotel, setHotel] = useState<HotelWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [addToTripOpen, setAddToTripOpen] = useState(false);
  const { data: tripStatus } = useEntityTripStatus('hotel', id);

  useEffect(() => {
    if (!id) return;

    const fetchHotel = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('hotels')
          .select('*, cities:city_id(id, name), countries:country_id(id, name)')
          .eq('id', id)
          .single();

        if (error) throw error;
        setHotel(data);
      } catch (error) {
        console.error('Error fetching hotel:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHotel();
  }, [id]);

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
        </Box>
      </Container>
    );
  }

  if (!hotel) {
    return (
      <Container maxWidth="lg" sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Hotel not found
        </Typography>
        <Button asChild variant="outline">
          <Link to="/hotels">Back to Hotels</Link>
        </Button>
      </Container>
    );
  }

  const cityName = hotel.cities?.name || hotel.city;
  const countryName = hotel.countries?.name || hotel.country;
  const heroImage = hotel.images && hotel.images.length > 0 ? hotel.images[0] : null;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Breadcrumb */}
      <Link
        to="/hotels"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          marginBottom: 16,
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <ArrowLeft style={{ width: 16, height: 16 }} />
        <Typography variant="body2">Back to Hotels</Typography>
      </Link>

      {/* Hero Image */}
      {heroImage && (
        <Box sx={{ borderRadius: 3, overflow: 'hidden', mb: 3, height: 300 }}>
          <img
            loading="lazy"
            src={heroImage}
            alt={hotel.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </Box>
      )}

      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 2,
          mb: 2,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {hotel.name}
            </Typography>
            {hotel.verified && <Shield style={{ width: 20, height: 20, color: '#10b981' }} />}
          </Box>
          <Typography variant="body1" color="text.secondary">
            {hotel.hotel_type && <>{TYPE_LABELS[hotel.hotel_type] || hotel.hotel_type} &middot; </>}
            {cityName && countryName
              ? `${cityName}, ${countryName}`
              : cityName || countryName || ''}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          <Button variant="outline" size="sm" onClick={() => setAddToTripOpen(true)}>
            <Luggage style={{ width: 14, height: 14, marginRight: 6 }} />
            Add to Trip
          </Button>
          {tripStatus?.isInTrip && (
            <Badge variant="secondary" sx={{ fontSize: '0.75rem' }}>
              In {tripStatus.count} trip{tripStatus.count !== 1 ? 's' : ''}
            </Badge>
          )}
          <ReportButton contentType="hotels" contentId={hotel.id} contentName={hotel.name} />
          <AdminEditButton
            contentType="hotels"
            contentId={hotel.id}
            contentName={hotel.name}
            currentData={hotel as Record<string, unknown>}
            onSaved={() => window.location.reload()}
          />
          {hotel.booking_url && (
            <Button size="sm" asChild>
              <a href={hotel.booking_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink style={{ width: 16, height: 16, marginRight: 6 }} />
                Book Now
              </a>
            </Button>
          )}
          {hotel.website && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(hotel.website!, '_blank')}
            >
              <Globe style={{ width: 16, height: 16, marginRight: 6 }} />
              Website
            </Button>
          )}
        </Box>
      </Box>

      {/* Stat Chips */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
        {hotel.star_rating && (
          <Chip
            icon={<Star style={{ width: 14, height: 14, fill: '#f59e0b', color: '#f59e0b' }} />}
            label={`${hotel.star_rating} Stars`}
            size="small"
            variant="outlined"
          />
        )}
        {hotel.price_range && (
          <Chip
            icon={<DollarSign style={{ width: 14, height: 14 }} />}
            label={'$'.repeat(hotel.price_range)}
            size="small"
            variant="outlined"
          />
        )}
        {hotel.lgbtq_friendly && <Chip label="LGBTQ+ Friendly" size="small" color="primary" />}
        {cityName && (
          <Chip
            icon={<MapPin style={{ width: 14, height: 14 }} />}
            label={`${cityName}${countryName ? `, ${countryName}` : ''}`}
            size="small"
            variant="outlined"
          />
        )}
      </Box>

      {/* Content Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {hotel.images && hotel.images.length > 1 && (
            <TabsTrigger value="photos">Photos ({hotel.images.length})</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview">
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' },
              gap: 3,
              mt: 2,
            }}
          >
            {/* Main Content */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {hotel.description && (
                <Card>
                  <CardHeader>
                    <CardTitle>About</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                      {hotel.description}
                    </Typography>
                  </CardContent>
                </Card>
              )}

              {hotel.queer_safety_notes && (
                <Card>
                  <CardHeader>
                    <CardTitle>Safety Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Typography variant="body2">{hotel.queer_safety_notes}</Typography>
                  </CardContent>
                </Card>
              )}

              {hotel.amenities && hotel.amenities.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Amenities</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {hotel.amenities.map((amenity, i) => (
                        <Chip
                          key={i}
                          label={amenity}
                          size="small"
                          variant="outlined"
                          icon={<Wifi style={{ width: 14, height: 14 }} />}
                        />
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Box>

            {/* Sidebar */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Contact</CardTitle>
                </CardHeader>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {hotel.address && (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      <MapPin style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }} />
                      <Typography variant="body2">{hotel.address}</Typography>
                    </Box>
                  )}
                  {hotel.phone && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Phone style={{ width: 16, height: 16, flexShrink: 0 }} />
                      <a href={`tel:${hotel.phone}`} style={{ fontSize: '0.875rem' }}>
                        {hotel.phone}
                      </a>
                    </Box>
                  )}
                  {hotel.email && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Mail style={{ width: 16, height: 16, flexShrink: 0 }} />
                      <a href={`mailto:${hotel.email}`} style={{ fontSize: '0.875rem' }}>
                        {hotel.email}
                      </a>
                    </Box>
                  )}
                </CardContent>
              </Card>

              {hotel.tags && hotel.tags.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Tags</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {hotel.tags.map((tag, i) => (
                        <Badge key={i} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Box>
          </Box>
        </TabsContent>

        {hotel.images && hotel.images.length > 1 && (
          <TabsContent value="photos">
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                gap: 2,
                mt: 2,
              }}
            >
              {hotel.images.map((img, i) => (
                <Box key={i} sx={{ borderRadius: 2, overflow: 'hidden', height: 200 }}>
                  <img
                    src={img}
                    alt={`${hotel.name} photo ${i + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    loading="lazy"
                  />
                </Box>
              ))}
            </Box>
          </TabsContent>
        )}
      </Tabs>

      <AddToTripDialog
        open={addToTripOpen}
        onClose={() => setAddToTripOpen(false)}
        entity={{
          type: 'hotel',
          id: hotel.id,
          name: hotel.name,
          latitude: hotel.latitude,
          longitude: hotel.longitude,
          city_id: hotel.city_id,
          country_id: hotel.country_id,
          address: hotel.address,
          category: hotel.hotel_type,
        }}
      />
    </Container>
  );
}
