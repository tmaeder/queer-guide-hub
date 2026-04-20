import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MapPin, Star, DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import type { Hotel } from '@/hooks/useHotels';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { safeText } from '@/utils/safeDisplay';

interface HotelCardProps {
  hotel?: Hotel;
  loading?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  hotel: 'Hotel',
  bnb: 'B&B',
  hostel: 'Hostel',
  guesthouse: 'Guesthouse',
  apartment: 'Apartment',
  resort: 'Resort',
  other: 'Other',
};

function PriceIndicator({ range }: { range: number | null }) {
  if (!range) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
      {Array.from({ length: 4 }, (_, i) => (
        <DollarSign
          key={i}
          style={{ width: 12, height: 12, color: i < range ? 'currentColor' : '#cccccc' }}
        />
      ))}
    </Box>
  );
}

const HotelCardFixture = () => (
  <Paper elevation={1} sx={{ overflow: 'hidden', borderRadius: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
    <Box sx={{ height: 180, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <MapPin style={{ width: 32, height: 32, color: '#999' }} />
    </Box>
    <Box sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>Sample Hotel</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
        <MapPin style={{ width: 14, height: 14 }} />
        <Typography variant="body2" noWrap>Berlin, Germany</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 'auto', pt: 1 }}>
        <Star style={{ width: 14, height: 14 }} />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>4.5</Typography>
        <Badge variant="outline" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>LGBTQ+</Badge>
      </Box>
    </Box>
  </Paper>
);

export function HotelCard({ hotel, loading = false }: HotelCardProps) {
  if (loading || !hotel) {
    return (
      <Skeleton name="hotel-card" loading={true} fixture={<HotelCardFixture />} fallback={<PageLoadingState count={1} />}>
        <div />
      </Skeleton>
    );
  }

  const imageUrl = hotel.images && hotel.images.length > 0 ? hotel.images[0] : null;
  const hotelName = safeText(hotel.name);
  const city = safeText(hotel.city);
  const country = safeText(hotel.country);
  const location = [city, country].filter(Boolean).join(', ');
  const typeLabel = hotel.hotel_type
    ? safeText(TYPE_LABELS[hotel.hotel_type] || hotel.hotel_type)
    : '';
  const hasNumericRating =
    typeof hotel.star_rating === 'number' && Number.isFinite(hotel.star_rating) && hotel.star_rating > 0;

  return (
    <Skeleton name="hotel-card" loading={false} fixture={<HotelCardFixture />}>
    <LocalizedLink to={`/hotels/${hotel.slug}`} style={{ textDecoration: 'none' }}>
      <Paper
        elevation={1}
        sx={{
          overflow: 'hidden',
          borderRadius: 3,
          transition: 'all 0.2s',
          '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Image */}
        <Box
          sx={{ position: 'relative', height: 180, overflow: 'hidden', bgcolor: 'action.hover' }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={hotelName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              loading="lazy"
            />
          ) : (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
              }}
            >
              <MapPin style={{ width: 32, height: 32, color: 'hsl(var(--muted-foreground))' }} />
            </Box>
          )}
          {hotel.featured && (
            <Badge
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                backgroundColor: 'hsl(var(--primary))',
                color: 'white',
              }}
            >
              Featured
            </Badge>
          )}
          {typeLabel && (
            <Badge
              variant="outline"
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                backgroundColor: '#ffffff',
              }}
            >
              {typeLabel}
            </Badge>
          )}
        </Box>

        {/* Content */}
        <Box sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {hotelName && (
            <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap>
              {hotelName}
            </Typography>
          )}

          {location && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
              <MapPin style={{ width: 14, height: 14, flexShrink: 0 }} />
              <Typography variant="body2" noWrap>
                {location}
              </Typography>
            </Box>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 'auto', pt: 1 }}>
            {hasNumericRating && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <Star style={{ width: 14, height: 14, fill: '#f59e0b', color: '#f59e0b' }} />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {hotel.star_rating}
                </Typography>
              </Box>
            )}
            <PriceIndicator range={hotel.price_range} />
            {hotel.lgbtq_friendly && (
              <Badge variant="outline" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                LGBTQ+
              </Badge>
            )}
          </Box>
        </Box>
      </Paper>
    </LocalizedLink>
    </Skeleton>
  );
}
