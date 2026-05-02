import {
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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import type { Database } from '@/integrations/supabase/types';

type Hotel = Database['public']['Tables']['hotels']['Row'];
export type HotelWithRelations = Hotel & {
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

interface HeroProps {
  hotel: HotelWithRelations;
  cityName: string;
  countryName: string;
  tripCount?: number;
  isInTrip?: boolean;
  onAddToTrip: () => void;
}

export function HotelHero({ hotel, cityName, countryName, tripCount, isInTrip, onAddToTrip }: HeroProps) {
  const heroImage = hotel.images && hotel.images.length > 0 ? hotel.images[0] : null;
  return (
    <>
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{hotel.name}</Typography>
            {hotel.verified && <Shield style={{ width: 20, height: 20, color: '#10b981' }} />}
          </Box>
          <Typography variant="body1" color="text.secondary">
            {hotel.hotel_type && <>{TYPE_LABELS[hotel.hotel_type] || hotel.hotel_type} &middot; </>}
            {cityName && countryName ? `${cityName}, ${countryName}` : cityName || countryName || ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          <Button variant="outline" size="sm" onClick={onAddToTrip}>
            <Luggage style={{ width: 14, height: 14, marginRight: 6 }} />
            Add to Trip
          </Button>
          {isInTrip && (
            <Badge variant="secondary">
              In {tripCount} trip{tripCount !== 1 ? 's' : ''}
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
            <Button variant="outline" size="sm" onClick={() => window.open(hotel.website!, '_blank')}>
              <Globe style={{ width: 16, height: 16, marginRight: 6 }} />
              Website
            </Button>
          )}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
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
    </>
  );
}

export function HotelOverview({ hotel, t }: { hotel: HotelWithRelations; t: (k: string, d?: string) => string }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {hotel.description && (
        <Card>
          <CardHeader><CardTitle>{t('pages.hotelDetail.about', 'About')}</CardTitle></CardHeader>
          <CardContent>
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{hotel.description}</Typography>
          </CardContent>
        </Card>
      )}
      {hotel.queer_safety_notes && (
        <Card>
          <CardHeader><CardTitle>{t('pages.hotelDetail.safetyNotes', 'Safety Notes')}</CardTitle></CardHeader>
          <CardContent><Typography variant="body2">{hotel.queer_safety_notes}</Typography></CardContent>
        </Card>
      )}
      {hotel.amenities && hotel.amenities.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t('pages.hotelDetail.amenities', 'Amenities')}</CardTitle></CardHeader>
          <CardContent>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {hotel.amenities.map((amenity, i) => (
                <Chip key={i} label={amenity} size="small" variant="outlined" icon={<Wifi style={{ width: 14, height: 14 }} />} />
              ))}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

export function HotelSidebar({ hotel, t }: { hotel: HotelWithRelations; t: (k: string, d?: string) => string }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card>
        <CardHeader><CardTitle>{t('pages.hotelDetail.contact', 'Contact')}</CardTitle></CardHeader>
        <CardContent>
          {hotel.address && (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <MapPin style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }} />
              <Typography variant="body2">{hotel.address}</Typography>
            </Box>
          )}
          {hotel.phone && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Phone style={{ width: 16, height: 16, flexShrink: 0 }} />
              <a href={`tel:${hotel.phone}`} style={{ fontSize: '0.875rem' }}>{hotel.phone}</a>
            </Box>
          )}
          {hotel.email && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Mail style={{ width: 16, height: 16, flexShrink: 0 }} />
              <a href={`mailto:${hotel.email}`} style={{ fontSize: '0.875rem' }}>{hotel.email}</a>
            </Box>
          )}
        </CardContent>
      </Card>
      {hotel.tags && hotel.tags.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t('pages.hotelDetail.tags', 'Tags')}</CardTitle></CardHeader>
          <CardContent>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {hotel.tags.map((tag, i) => (
                <Badge key={i} variant="outline">{tag}</Badge>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

export function HotelPhotos({ hotel }: { hotel: HotelWithRelations }) {
  if (!hotel.images || hotel.images.length <= 1) return null;
  return (
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
            alt={`${hotel.name} ${i + 1}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />
        </Box>
      ))}
    </Box>
  );
}
